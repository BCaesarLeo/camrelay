import { useEffect, useState } from "react";
import { useStore } from "../hooks/useStore";
import { api } from "../lib/api";
import type { PendingGuest, Photo, Session } from "../../shared/types";

// Guests who tapped "Can't find your photos?" on the kiosk and left a photo of
// themselves and an email. Staff compare that photo with the sessions shot around the same time,
// open the ones the guest is in (there can be several), untick any photo they
// aren't in, and send.

interface OpenGuest {
  guestId: string;
  // Sessions opened for this guest, in the order they were picked
  sessions: { session: Session; photos: Photo[] }[];
  excluded: Set<string>;
}

export function GuestMatcher() {
  const sessions = useStore((s) => s.sessions);
  const [guests, setGuests] = useState<PendingGuest[]>([]);
  const [matchedCount, setMatchedCount] = useState(0);
  const [open, setOpen] = useState<OpenGuest | null>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch("/api/find-me/guests").then((r) => r.json());
      setGuests(res.waiting);
      setMatchedCount(res.matchedCount);
    } catch {}
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleSession = async (guest: PendingGuest, session: Session) => {
    setNote(null);
    const current = open?.guestId === guest.id ? open : { guestId: guest.id, sessions: [], excluded: new Set<string>() };
    if (current.sessions.some((s) => s.session.id === session.id)) {
      setOpen({ ...current, sessions: current.sessions.filter((s) => s.session.id !== session.id) });
      return;
    }
    const photos = (await api.getPhotos(session.id).catch(() => [] as Photo[])).filter(
      (p) => p.status === "ready"
    );
    setOpen({ ...current, sessions: [...current.sessions, { session, photos }] });
  };

  const togglePhoto = (photoId: string) => {
    if (!open) return;
    const excluded = new Set(open.excluded);
    if (excluded.has(photoId)) excluded.delete(photoId);
    else excluded.add(photoId);
    setOpen({ ...open, excluded });
  };

  const send = async (guest: PendingGuest, photoIds: string[]) => {
    setBusy(true);
    const res = await fetch(`/api/find-me/guests/${guest.id}/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoIds }),
    });
    const body = await res.json().catch(() => null);
    setNote(
      res.ok
        ? { text: `Queued ${body.photoCount} photos for ${guest.email} — see Sending above` }
        : { text: body?.error ?? "Couldn't send to that guest", error: true }
    );
    if (res.ok) setOpen(null);
    setBusy(false);
    refresh();
  };

  const dismiss = async (guest: PendingGuest) => {
    if (!window.confirm(`Remove ${guest.email} from the list without sending anything?`)) return;
    await fetch(`/api/find-me/guests/${guest.id}/dismiss`, { method: "POST" });
    refresh();
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr.replace(" ", "T") + "Z").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const sessionLabel = (s: Session) => String(s.sessionNumber).padStart(2, "0");

  if (guests.length === 0 && matchedCount === 0) {
    return <p style={styles.empty}>Nobody is waiting.</p>;
  }

  return (
    <div style={styles.wrap}>
      <p style={styles.heading}>
        {guests.length} waiting for their photos
        {matchedCount > 0 && <span style={styles.headingMeta}> · {matchedCount} done</span>}
      </p>
      {note && <p style={{ ...styles.note, color: note.error ? "#F06060" : "#2dd4a8" }}>{note.text}</p>}

      {guests.map((guest) => {
        const mine = open?.guestId === guest.id ? open : null;
        const isOpen = (s: Session) => !!mine?.sessions.some((o) => o.session.id === s.id);
        const others = sessions.filter(
          (s) => s.photoCount > 0 && !guest.suggestions.some((c) => c.id === s.id) && !isOpen(s)
        );
        const chosenIds = mine
          ? mine.sessions.flatMap((o) => o.photos).filter((p) => !mine.excluded.has(p.id)).map((p) => p.id)
          : [];
        // Suggested sessions first, then any picked from the full list
        const cards = [
          ...guest.suggestions,
          ...(mine?.sessions.map((o) => o.session).filter((s) => !guest.suggestions.some((c) => c.id === s.id)) ?? []),
        ];

        return (
          <div key={guest.id} style={styles.guest}>
            <div style={styles.guestTop}>
              {guest.selfieThumbUrl ? (
                <img
                  src={zoomed === guest.id ? guest.selfieUrl! : guest.selfieThumbUrl}
                  alt=""
                  onClick={() => setZoomed(zoomed === guest.id ? null : guest.id)}
                  style={zoomed === guest.id ? styles.selfieLarge : styles.selfie}
                />
              ) : (
                <div style={{ ...styles.selfie, ...styles.noSelfie }}>No photo</div>
              )}
              <div style={styles.guestInfo}>
                <span style={styles.email}>{guest.email}</span>
                <span style={styles.meta}>Asked at {formatTime(guest.createdAt)}</span>
                <button onClick={() => dismiss(guest)} style={styles.dismissBtn}>
                  Remove
                </button>
              </div>
            </div>

            <p style={styles.pickLabel}>
              Tap every session they&apos;re in — closest in time first. Then untick photos they aren&apos;t in.
            </p>
            <div style={styles.candidates}>
              {cards.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleSession(guest, s)}
                  style={{ ...styles.candidate, borderColor: isOpen(s) ? "#2dd4a8" : "#1e1e1e" }}
                >
                  {s.coverUrl ? <img src={s.coverUrl} alt="" style={styles.cover} /> : <div style={styles.cover} />}
                  <span style={styles.candidateText}>
                    <span style={{ color: s.color, fontFamily: "monospace", fontWeight: 600 }}>
                      {sessionLabel(s)}
                    </span>{" "}
                    {formatTime(s.createdAt)} · {s.photoCount}
                  </span>
                </button>
              ))}
            </div>
            {others.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const s = others.find((o) => o.id === e.target.value);
                  if (s) toggleSession(guest, s);
                }}
                style={styles.otherSelect}
              >
                <option value="">Add another session…</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    Session {sessionLabel(s)} · {formatTime(s.createdAt)} · {s.photoCount} photos
                  </option>
                ))}
              </select>
            )}

            {mine && mine.sessions.length > 0 && (
              <div style={styles.confirm}>
                {mine.sessions.map(({ session, photos }) => (
                  <div key={session.id} style={{ marginBottom: 10 }}>
                    <p style={styles.pickLabel}>
                      Session {sessionLabel(session)} ·{" "}
                      {photos.filter((p) => !mine.excluded.has(p.id)).length} of {photos.length} photos
                    </p>
                    <div style={styles.confirmThumbs}>
                      {photos.map((p) => {
                        const off = mine.excluded.has(p.id);
                        return (
                          <button
                            key={p.id}
                            data-pick={p.id}
                            onClick={() => togglePhoto(p.id)}
                            style={{ ...styles.pickBtn, borderColor: off ? "transparent" : "#2dd4a8" }}
                          >
                            <img
                              src={p.thumbnailUrl!}
                              alt=""
                              style={{ ...styles.confirmThumb, opacity: off ? 0.25 : 1 }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div style={styles.confirmActions}>
                  <button onClick={() => setOpen(null)} disabled={busy} style={styles.cancelBtn}>
                    Cancel
                  </button>
                  <button
                    onClick={() => send(guest, chosenIds)}
                    disabled={busy || chosenIds.length === 0}
                    style={{ ...styles.sendBtn, opacity: busy || chosenIds.length === 0 ? 0.5 : 1 }}
                  >
                    {chosenIds.length === 0
                      ? "No photos ticked"
                      : `Send ${chosenIds.length} ${chosenIds.length === 1 ? "photo" : "photos"} to ${guest.email}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {},
  empty: { fontSize: 13, color: "#444", fontWeight: 300 },
  heading: { fontSize: 14, fontWeight: 500, color: "#f0f0f0", marginBottom: 8 },
  headingMeta: { color: "#555", fontWeight: 300 },
  note: { fontSize: 13, fontWeight: 300, marginBottom: 8 },
  guest: { padding: 12, background: "#0e0e0e", border: "1px solid #1a1a1a", marginBottom: 6 },
  guestTop: { display: "flex", gap: 12, marginBottom: 12 },
  selfie: { width: 132, height: 132, objectFit: "cover", flexShrink: 0, cursor: "zoom-in", display: "block" },
  selfieLarge: { width: "100%", maxWidth: 420, objectFit: "contain", cursor: "zoom-out", display: "block" },
  noSelfie: { display: "flex", alignItems: "center", justifyContent: "center", background: "#161616", color: "#444", fontSize: 12, cursor: "default" },
  guestInfo: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  email: { fontSize: 15, color: "#f0f0f0", wordBreak: "break-all" },
  meta: { fontSize: 12, color: "#555", fontWeight: 300 },
  dismissBtn: { alignSelf: "flex-start", marginTop: "auto", background: "none", color: "#666", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 },
  pickLabel: { fontSize: 12, color: "#555", fontWeight: 300, marginBottom: 8 },
  candidates: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 },
  candidate: { flexShrink: 0, width: 132, background: "#111", border: "2px solid #1e1e1e", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" },
  cover: { width: "100%", height: 86, objectFit: "cover", display: "block", background: "#161616" },
  candidateText: { display: "block", padding: "6px 8px", fontSize: 11, color: "#777", fontWeight: 300, whiteSpace: "nowrap" },
  otherSelect: { marginTop: 8, width: "100%", padding: "10px 12px", background: "#111", border: "1px solid #222", color: "#888", fontSize: 13, fontFamily: "inherit" },
  confirm: { marginTop: 12, paddingTop: 12, borderTop: "1px solid #1a1a1a" },
  confirmThumbs: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 },
  pickBtn: { padding: 0, background: "#111", border: "2px solid transparent", cursor: "pointer", display: "block" },
  confirmThumb: { width: "100%", aspectRatio: "3 / 2", objectFit: "cover", display: "block" },
  confirmActions: { display: "flex", gap: 8, marginTop: 4 },
  cancelBtn: { padding: "12px 18px", fontSize: 12, color: "#777", background: "transparent", border: "1px solid #222", fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.06em" },
  sendBtn: { flex: 1, padding: "12px 18px", fontSize: 13, color: "#fff", background: "#4353FF", border: "none", fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.04em" },
};
