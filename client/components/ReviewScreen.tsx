import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";

export function ReviewScreen() {
  const photos = useStore((s) => s.photos);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setScreen = useStore((s) => s.setScreen);

  const selected = photos.filter((p) => p.selected && p.status === "ready");

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
        <div style={{ width: 80 }} />
      </div>

      <p style={styles.subtitle}>
        {selected.length} {selected.length === 1 ? "photo" : "photos"} selected
        {selected.length === 0 && photos.length > 0 && (
          <span style={{ color: "#F06060" }}> (store has {photos.length} photos but none selected)</span>
        )}
        {photos.length === 0 && (
          <span style={{ color: "#F06060" }}> (no photos in store)</span>
        )}
      </p>

      {/* Grid */}
      <div style={styles.grid}>
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
              style={styles.photoImg}
              draggable={false}
            />
          </motion.div>
        ))}
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
          Get my photos
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
    flex: 1,
    overflow: "auto",
    padding: "16px 24px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "8px",
    alignContent: "start",
    paddingBottom: 100,
  },
  photoCard: {
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
    borderRadius: 2,
    border: "2px solid rgba(45, 212, 168, 0.3)",
  },
  photoImg: {
    width: "100%",
    aspectRatio: "3 / 2",
    objectFit: "cover",
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
