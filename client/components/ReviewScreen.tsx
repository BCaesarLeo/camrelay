import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";
import { AiCardOffer } from "./AiCardOffer";

export function ReviewScreen() {
  const photos = useStore((s) => s.photos);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setScreen = useStore((s) => s.setScreen);
  const openRegroup = useStore((s) => s.openRegroup);

  const suggestionsEnabled = useStore((s) => s.suggestionsEnabled);
  const suggestions = useStore((s) => s.suggestions);
  const extras = useStore((s) => s.extras);
  const loadSuggestions = useStore((s) => s.loadSuggestions);
  const toggleExtra = useStore((s) => s.toggleExtra);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Ask once when the screen opens and again shortly after, in case the last photo
  // was still being indexed
  useEffect(() => {
    if (!suggestionsEnabled) return;
    loadSuggestions();
    const t = setTimeout(loadSuggestions, 6000);
    return () => clearTimeout(t);
  }, [suggestionsEnabled]);

  const selected = photos.filter((p) => p.selected && p.status === "ready");
  const drawing = photos.some((p) => p.kind === "card" && p.status === "processing");
  const firstPhoto = selected.find((p) => p.kind !== "card") ?? null;

  const handleGetPhotos = () => {
    setScreen("contact");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      style={styles.container}
    >
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => setScreen("session")} style={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span style={styles.headerLabel}>Review</span>
        <button onClick={() => openRegroup()} style={{ ...styles.backBtn, padding: "10px 18px" }}>
          Not us?
        </button>
      </div>

      <p style={styles.subtitle}>
        {selected.length} {selected.length === 1 ? "photo" : "photos"} selected
        {extras.length > 0 && <span style={{ color: "#2dd4a8" }}> + {extras.length} added from other sessions</span>}
        {selected.length === 0 && photos.length > 0 && (
          <span style={{ color: "#F06060" }}> (store has {photos.length} photos but none selected)</span>
        )}
        {photos.length === 0 && (
          <span style={{ color: "#F06060" }}> (no photos in store)</span>
        )}
      </p>

      {/* Grid + suggestions scroll together */}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: 100 }}>
      <div style={styles.grid}>
        <AiCardOffer size="tile" sourcePhotoId={firstPhoto?.id ?? null} />
        {selected.map((photo, i) => (
          <motion.div
            key={photo.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            style={styles.photoCard}
          >
            <img
              src={photo.thumbnailUrl!}
              alt=""
              style={photo.kind === "card" ? { ...styles.photoImg, background: "#06264a" } : styles.photoImg}
              draggable={false}
            />
          </motion.div>
        ))}
      </div>

      {/* "Want these too?" — a question, never a selection. Photos from other sessions
          that show the same people; each one has to be tapped to be added. */}
      {suggestionsEnabled && suggestions.length > 0 && (
        <div style={styles.wantWrap}>
          {!showSuggestions ? (
            <motion.button
              onClick={() => setShowSuggestions(true)}
              style={styles.wantCard}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span style={styles.wantTitle}>Want these too?</span>
              <span style={styles.wantText}>
                We think we spotted you in {suggestions.length} {suggestions.length === 1 ? "photo" : "photos"} from
                other sessions. Tap to take a look.
              </span>
            </motion.button>
          ) : (
            <>
              <div style={styles.wantHead}>
                <span style={styles.wantTitle}>Want these too?</span>
                <span style={styles.wantText}>Tap a photo to add it. Not you? Just leave it.</span>
              </div>
              <div style={styles.wantGrid}>
                {suggestions.map((p) => {
                  const on = extras.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleExtra(p.id)}
                      style={{ ...styles.wantTile, borderColor: on ? "#2dd4a8" : "#222" }}
                    >
                      <img src={p.thumbnailUrl!} alt="" style={styles.wantImg} draggable={false} />
                      <span style={styles.wantMeta}>Session {p.sessionNumber}</span>
                      <span style={{ ...styles.wantTick, background: on ? "#2dd4a8" : "rgba(0,0,0,0.5)", borderColor: on ? "#2dd4a8" : "#666" }}>
                        {on && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
      </div>

      {/* Bottom */}
      <div style={styles.bottomBar}>
        <motion.button
          onClick={handleGetPhotos}
          disabled={selected.length === 0}
          style={{
            ...styles.getButton,
            opacity: selected.length === 0 ? 0.4 : 1,
          }}
          whileTap={selected.length > 0 ? { scale: 0.98 } : undefined}
        >
          {drawing ? "Get my photos + card" : "Get my photos"}
        </motion.button>
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
  subtitle: {
    padding: "12px 32px 0",
    color: "#333",
    fontSize: 13,
    fontWeight: 300,
  },
  grid: {
    padding: "16px 24px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "8px",
    alignContent: "start",
  },
  wantWrap: { padding: "8px 24px 24px" },
  wantCard: {
    width: "100%",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "20px 22px",
    background: "#111",
    border: "1px solid #2dd4a8",
    borderRadius: 2,
    color: "#f0f0f0",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  wantHead: { display: "flex", flexDirection: "column", gap: 4, padding: "12px 0" },
  wantTitle: { fontSize: 18, fontWeight: 500, color: "#2dd4a8" },
  wantText: { fontSize: 14, fontWeight: 300, color: "#999", lineHeight: 1.4 },
  wantGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 8,
  },
  wantTile: {
    alignSelf: "start",
    position: "relative",
    border: "2px solid #222",
    borderRadius: 2,
    overflow: "hidden",
    cursor: "pointer",
    background: "#0a0a0a",
  },
  wantImg: { width: "100%", height: "auto", display: "block", pointerEvents: "none" },
  wantMeta: { position: "absolute", left: 8, bottom: 8, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#ccc", background: "rgba(0,0,0,0.6)", padding: "3px 8px" },
  wantTick: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", border: "2px solid #666", display: "flex", alignItems: "center", justifyContent: "center" },
  photoCard: {
    alignSelf: "start",
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
    borderRadius: 2,
    border: "2px solid rgba(45, 212, 168, 0.3)",
  },
  photoImg: {
    width: "100%",
    height: "auto",
    background: "#0a0a0a",
    display: "block",
    pointerEvents: "none",
  },
  removeHint: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 2,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    opacity: 0.6,
  },
  bottomBar: {
    padding: "16px 32px",
    paddingBottom: "max(20px, env(safe-area-inset-bottom))",
    flexShrink: 0,
  },
  getButton: {
    width: "100%",
    padding: "18px",
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#fff",
    background: "#4353FF",
    border: "none",
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "opacity 0.3s ease",
  },
};
