import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../hooks/useStore";
import { api } from "../lib/api";
import type { Photo, Session } from "../../shared/types";

// "Not us" — guests fix a session that mixed two groups. Photos can be dragged
// (hold, then drag on touch) or tapped and sent to the group before, the group
// after, or a brand-new group.

type ZoneKey = "before" | "mine" | "after" | "new";

const HOLD_MS = 160; // touch: hold this long to pick a photo up, so a swipe still scrolls
const MOVE_TOLERANCE = 10;

interface UndoInfo {
  label: string;
  // photo ids grouped by the session they came from
  origin: Record<string, string[]>;
}

export function RegroupScreen() {
  const session = useStore((s) => s.session);
  const sessions = useStore((s) => s.sessions);
  const photos = useStore((s) => s.photos);
  const movePhotos = useStore((s) => s.movePhotos);
  const loadSessions = useStore((s) => s.loadSessions);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const setScreen = useStore((s) => s.setScreen);
  const backToSessions = useStore((s) => s.backToSessions);
  const regroupReturn = useStore((s) => s.regroupReturn);
  const regroupPreselect = useStore((s) => s.regroupPreselect);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(regroupPreselect));
  const [neighborPhotos, setNeighborPhotos] = useState<Record<string, Photo[]>>({});
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<UndoInfo | null>(null);
  const [error, setError] = useState("");
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overZone, setOverZone] = useState<ZoneKey | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ cleanup: () => void } | null>(null);

  // Sessions are listed newest first, so the group shot before this one is next in the list
  const idx = sessions.findIndex((s) => s.id === session?.id);
  const before: Session | null = idx >= 0 ? sessions[idx + 1] ?? null : null;
  const after: Session | null = idx > 0 ? sessions[idx - 1] : null;

  const mine = photos.filter((p) => p.status === "ready");
  const beforePhotos = before ? neighborPhotos[before.id] ?? [] : [];
  const afterPhotos = after ? neighborPhotos[after.id] ?? [] : [];

  // Reads the store directly so a call made right after a move sees the new neighbors
  const loadNeighbors = async () => {
    const state = useStore.getState();
    const i = state.sessions.findIndex((s) => s.id === state.session?.id);
    if (i < 0) return;
    const entries = await Promise.all(
      [state.sessions[i + 1], state.sessions[i - 1]]
        .filter((s): s is Session => !!s)
        .map(async (s) => {
          const list = await api.getPhotos(s.id).catch(() => [] as Photo[]);
          return [s.id, list.filter((p) => p.status === "ready")] as const;
        })
    );
    setNeighborPhotos(Object.fromEntries(entries));
  };

  useEffect(() => {
    loadNeighbors();
  }, [before?.id, after?.id]);

  // Keep up with new captures and with other screens regrouping at the same time
  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => {
      if (dragRef.current) return;
      loadSessions();
      loadPhotos();
      loadNeighbors();
    }, 5000);
    return () => clearInterval(interval);
  }, [before?.id, after?.id]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  useEffect(() => () => dragRef.current?.cleanup(), []);

  if (!session) return null;

  const zoneSession = (zone: ZoneKey): Session | null =>
    zone === "before" ? before : zone === "after" ? after : zone === "mine" ? session : null;

  const sessionOfPhoto = (id: string): string | null => {
    if (mine.some((p) => p.id === id)) return session.id;
    if (beforePhotos.some((p) => p.id === id)) return before!.id;
    if (afterPhotos.some((p) => p.id === id)) return after!.id;
    return null;
  };

  const sessionLabel = (s: Session) => `Session ${String(s.sessionNumber).padStart(2, "0")}`;

  const doMove = async (ids: string[], zone: ZoneKey) => {
    const targetSession = zoneSession(zone);
    if (zone !== "new" && !targetSession) return;

    const origin: Record<string, string[]> = {};
    for (const id of ids) {
      const from = sessionOfPhoto(id);
      if (!from || from === targetSession?.id) continue;
      (origin[from] ??= []).push(id);
    }
    const movable = Object.values(origin).flat();
    if (movable.length === 0) return;

    setBusy(true);
    setError("");
    try {
      const target = await movePhotos(
        movable,
        zone === "new" ? { newGroup: true } : { sessionId: targetSession!.id }
      );
      await loadNeighbors();
      setSelected(new Set());
      const count = `${movable.length} ${movable.length === 1 ? "photo" : "photos"}`;
      setUndo({
        origin,
        label:
          zone === "new"
            ? `Started ${sessionLabel(target)} with ${count}`
            : zone === "mine"
              ? `Added ${count} to your group`
              : `Moved ${count} to ${sessionLabel(target)}`,
      });
    } catch {
      setError("Couldn't move those photos. Please try again.");
    }
    setBusy(false);
  };

  const handleUndo = async () => {
    if (!undo) return;
    setBusy(true);
    setUndo(null);
    try {
      for (const [sessionId, ids] of Object.entries(undo.origin)) {
        await movePhotos(ids, { sessionId });
      }
      await loadNeighbors();
    } catch {
      setError("Couldn't undo that move.");
    }
    setBusy(false);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const zoneAt = (x: number, y: number): ZoneKey | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-zone]");
    return (el?.dataset.zone as ZoneKey | undefined) ?? null;
  };

  const handlePointerDown = (e: React.PointerEvent, photo: Photo) => {
    if (busy || dragRef.current || (e.pointerType === "mouse" && e.button !== 0)) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const isTouch = e.pointerType !== "mouse";
    const ids = selected.has(photo.id) ? [...selected] : [photo.id];
    let lifted = false;
    let moved = false;
    let zone: ZoneKey | null = null;

    const lift = () => {
      lifted = true;
      setDragIds(ids);
      const ghost = ghostRef.current;
      if (ghost) {
        ghost.style.display = "block";
        ghost.style.transform = `translate(${startX - 70}px, ${startY - 50}px)`;
        const img = ghost.querySelector("img");
        if (img) img.src = photo.thumbnailUrl!;
        const badge = ghost.querySelector<HTMLElement>("[data-badge]");
        if (badge) {
          badge.style.display = ids.length > 1 ? "flex" : "none";
          badge.textContent = String(ids.length);
        }
      }
    };

    const holdTimer = isTouch ? setTimeout(lift, HOLD_MS) : null;

    const onMove = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!lifted) {
        if (dist < MOVE_TOLERANCE) return;
        if (isTouch) {
          // Moved before the hold finished — this is a scroll, not a drag
          cleanup();
          return;
        }
        lift();
      }
      if (dist >= MOVE_TOLERANCE) moved = true;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${ev.clientX - 70}px, ${ev.clientY - 50}px)`;
      }
      const next = zoneAt(ev.clientX, ev.clientY);
      if (next !== zone) {
        zone = next;
        setOverZone(next);
      }
    };

    const onUp = (ev: PointerEvent) => {
      const dropZone = lifted && moved ? zoneAt(ev.clientX, ev.clientY) : null;
      const wasTap = !moved;
      cleanup();
      if (dropZone) doMove(ids, dropZone);
      else if (wasTap) toggle(photo.id);
    };

    // Once a photo is lifted, stop the page from scrolling under the finger
    const onTouchMove = (ev: TouchEvent) => {
      if (lifted) ev.preventDefault();
    };

    const cleanup = () => {
      if (holdTimer) clearTimeout(holdTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("touchmove", onTouchMove);
      if (ghostRef.current) ghostRef.current.style.display = "none";
      dragRef.current = null;
      setDragIds([]);
      setOverZone(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    dragRef.current = { cleanup };
  };

  const handleDone = () => {
    if (mine.length === 0) backToSessions();
    else setScreen(regroupReturn);
  };

  const selectedIds = [...selected].filter((id) => sessionOfPhoto(id));
  const hasSelection = selectedIds.length > 0;
  const dragging = dragIds.length > 0;
  // A zone is a useful destination only if at least one of the photos isn't already in it
  const canReceive = (zone: ZoneKey, ids: string[]) => {
    if (zone === "new") return ids.length > 0;
    const target = zoneSession(zone);
    return !!target && ids.some((id) => sessionOfPhoto(id) !== target.id);
  };

  const renderThumbs = (list: Photo[], size: "large" | "small") => (
    <div style={size === "large" ? styles.gridLarge : styles.gridSmall}>
      {list.map((photo) => {
        const isSelected = selected.has(photo.id);
        return (
          <div
            key={photo.id}
            data-photo={photo.id}
            onPointerDown={(e) => handlePointerDown(e, photo)}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              ...styles.thumb,
              borderColor: isSelected ? "#2dd4a8" : "transparent",
              opacity: dragIds.includes(photo.id) ? 0.25 : 1,
            }}
          >
            <img src={photo.thumbnailUrl!} alt="" style={styles.thumbImg} draggable={false} />
            {isSelected && (
              <div style={styles.thumbCheck}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderZone = (
    zone: ZoneKey,
    title: string,
    detail: string,
    color: string | null,
    cover: string | null
  ) => {
    const ids = dragging ? dragIds : selectedIds;
    const enabled = canReceive(zone, ids);
    const armed = enabled && (dragging || hasSelection);
    const hot = armed && overZone === zone;
    return (
      <button
        key={zone}
        data-zone={zone}
        disabled={busy || !enabled || !hasSelection}
        onClick={() => doMove(selectedIds, zone)}
        style={{
          ...styles.zone,
          borderColor: hot ? "#2dd4a8" : armed ? "rgba(45, 212, 168, 0.45)" : "#222",
          background: hot ? "rgba(45, 212, 168, 0.16)" : "#111",
          opacity: (dragging || hasSelection) && !enabled ? 0.35 : 1,
        }}
      >
        {zone === "new" ? (
          <div style={styles.zonePlus}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        ) : cover ? (
          <img src={cover} alt="" style={styles.zoneCover} draggable={false} />
        ) : (
          <div style={{ ...styles.zoneCover, background: "#1a1a1a" }} />
        )}
        <span style={styles.zoneText}>
          <span style={styles.zoneTitle}>
            {color && <span style={{ ...styles.zoneDot, background: color }} />}
            {title}
          </span>
          <span style={styles.zoneDetail}>
            {armed && !dragging ? `Tap to move ${selectedIds.length} here` : detail}
          </span>
        </span>
      </button>
    );
  };

  const countLabel = (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={styles.container}
    >
      <div style={styles.header}>
        <button onClick={handleDone} style={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span style={styles.headerLabel}>Not your photo?</span>
        <button onClick={handleDone} style={styles.doneBtn}>
          Done
        </button>
      </div>

      <p style={styles.hint}>
        Hold and drag a photo to the group it belongs to — or tap photos, then tap a group below.
      </p>

      <div style={styles.scroll}>
        <div style={styles.sectionHead}>
          <span style={{ ...styles.zoneDot, background: session.color }} />
          <span style={styles.sectionTitle}>Your group</span>
          <span style={styles.sectionMeta}>
            {sessionLabel(session)} · {countLabel(mine.length)}
          </span>
          {mine.length > 0 && (
            <button
              style={styles.selectAllBtn}
              onClick={() =>
                setSelected(
                  mine.every((p) => selected.has(p.id)) ? new Set() : new Set(mine.map((p) => p.id))
                )
              }
            >
              {mine.every((p) => selected.has(p.id)) ? "Clear" : "Select all"}
            </button>
          )}
        </div>
        {mine.length === 0 ? (
          <p style={styles.empty}>No photos left in this group</p>
        ) : (
          renderThumbs(mine, "large")
        )}

        {[
          { s: before, list: beforePhotos, title: "Group before you" },
          { s: after, list: afterPhotos, title: "Group after you" },
        ].map(
          ({ s, list, title }) =>
            s &&
            list.length > 0 && (
              <div key={s.id}>
                <div style={{ ...styles.sectionHead, marginTop: 28 }}>
                  <span style={{ ...styles.zoneDot, background: s.color }} />
                  <span style={styles.sectionTitle}>{title}</span>
                  <span style={styles.sectionMeta}>
                    {sessionLabel(s)} · {countLabel(list.length)} · is one of these yours?
                  </span>
                </div>
                {renderThumbs(list, "small")}
              </div>
            )
        )}
      </div>

      <AnimatePresence>
        {(undo || error) && (
          <motion.div
            initial={{ opacity: 0, y: 12, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 12, x: "-50%" }}
            style={{ ...styles.toast, borderColor: error ? "rgba(240, 96, 96, 0.5)" : "#2a2a2a" }}
          >
            <span style={{ color: error ? "#F06060" : "#e0e0e0" }}>{error || undo?.label}</span>
            {!error && (
              <button onClick={handleUndo} disabled={busy} style={styles.undoBtn}>
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={styles.dock}>
        {before &&
          renderZone("before", "Group before", `${sessionLabel(before)} · ${countLabel(before.photoCount)}`, before.color, before.coverUrl)}
        {renderZone("mine", "Your group", `${sessionLabel(session)} · ${countLabel(mine.length)}`, session.color, mine[0]?.thumbnailUrl ?? null)}
        {after &&
          renderZone("after", "Group after", `${sessionLabel(after)} · ${countLabel(after.photoCount)}`, after.color, after.coverUrl)}
        {renderZone("new", "New group", "Photos of someone else", null, null)}
      </div>

      {/* Follows the finger while a photo is being dragged */}
      <div ref={ghostRef} style={styles.ghost}>
        <img alt="" style={styles.ghostImg} draggable={false} />
        <span data-badge style={styles.ghostBadge} />
      </div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#0a0a0a",
    position: "relative",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "24px 32px 8px",
    flexShrink: 0,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "1px solid #2a2a2a",
    color: "#888",
    fontSize: 14,
    fontWeight: 400,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: "0.05em",
    padding: "10px 20px 10px 14px",
  },
  headerLabel: {
    fontSize: 13,
    fontWeight: 300,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#4a4a4a",
  },
  doneBtn: {
    background: "transparent",
    border: "1px solid rgba(45, 212, 168, 0.4)",
    color: "#2dd4a8",
    padding: "10px 24px",
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  hint: {
    padding: "8px 32px 12px",
    color: "#777",
    fontSize: 15,
    fontWeight: 300,
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "8px 24px 24px",
  },
  sectionHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 8px 12px",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#e0e0e0",
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: 300,
    color: "#555",
  },
  selectAllBtn: {
    marginLeft: "auto",
    background: "none",
    border: "1px solid #2a2a2a",
    color: "#888",
    padding: "6px 14px",
    fontSize: 12,
    letterSpacing: "0.06em",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  empty: {
    padding: "24px 8px",
    color: "#444",
    fontSize: 14,
    fontWeight: 300,
  },
  gridLarge: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: 8,
  },
  gridSmall: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: 6,
  },
  thumb: {
    position: "relative",
    borderRadius: 2,
    overflow: "hidden",
    cursor: "grab",
    border: "3px solid transparent",
    transition: "opacity 0.15s, border-color 0.15s",
    touchAction: "pan-y",
    WebkitUserSelect: "none",
  },
  thumbImg: {
    width: "100%",
    aspectRatio: "3 / 2",
    objectFit: "cover",
    display: "block",
    pointerEvents: "none",
  },
  thumbCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#2dd4a8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  toast: {
    position: "absolute",
    left: "50%",
    bottom: 124,
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 12px 12px 20px",
    background: "#161616",
    border: "1px solid #2a2a2a",
    fontSize: 14,
    whiteSpace: "nowrap" as const,
    zIndex: 5,
  },
  undoBtn: {
    background: "none",
    border: "1px solid #333",
    color: "#2dd4a8",
    padding: "6px 14px",
    fontSize: 13,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  dock: {
    flexShrink: 0,
    display: "flex",
    gap: 8,
    padding: "12px 24px",
    paddingBottom: "max(16px, env(safe-area-inset-bottom))",
    borderTop: "1px solid #1a1a1a",
    background: "#0a0a0a",
  },
  zone: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 10,
    border: "2px dashed #222",
    color: "#f0f0f0",
    textAlign: "left" as const,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s, opacity 0.15s",
  },
  zoneCover: {
    width: 84,
    height: 56,
    objectFit: "cover",
    flexShrink: 0,
    display: "block",
    pointerEvents: "none",
  },
  zonePlus: {
    width: 84,
    height: 56,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1a1a1a",
    color: "#888",
    pointerEvents: "none",
  },
  zoneText: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    minWidth: 0,
    pointerEvents: "none",
  },
  zoneTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
  },
  zoneDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  zoneDetail: {
    fontSize: 12,
    fontWeight: 300,
    color: "#777",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ghost: {
    display: "none",
    position: "fixed",
    top: 0,
    left: 0,
    width: 140,
    height: 100,
    zIndex: 1000,
    pointerEvents: "none",
    boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
    border: "2px solid #2dd4a8",
  },
  ghostImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  ghostBadge: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#2dd4a8",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    display: "none",
    alignItems: "center",
    justifyContent: "center",
  },
};
