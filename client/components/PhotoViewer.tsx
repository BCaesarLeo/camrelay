import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { Photo } from "../../shared/types";

interface Props {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onToggleSelect: (photoId: string) => void;
  onNavigate: (index: number) => void;
}

export function PhotoViewer({
  photos,
  initialIndex,
  onClose,
  onToggleSelect,
  onNavigate,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const photo = photos[index];

  const navigate = useCallback(
    (newIndex: number) => {
      setIndex(newIndex);
      onNavigate(newIndex);
    },
    [onNavigate]
  );

  const goNext = () => {
    if (index < photos.length - 1) navigate(index + 1);
  };
  const goPrev = () => {
    if (index > 0) navigate(index - 1);
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        if (photo) onToggleSelect(photo.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, photo]);

  // Scroll active thumbnail into view
  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.children[index] as HTMLElement;
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [index]);

  if (!photo) {
    onClose();
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={styles.overlay}
    >
      {/* Background click to close */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Main photo with select box overlay */}
      <div style={styles.mainArea}>
        <div style={styles.imageWrap}>
          <motion.img
            key={photo.id}
            src={photo.fullUrl || photo.thumbnailUrl!}
            alt=""
            style={styles.image}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            draggable={false}
          />

          {/* Select box — bottom right corner ON the image */}
          <motion.div
            style={{
              ...styles.selectBox,
              background: photo.selected
                ? "rgba(45, 212, 168, 0.95)"
                : "rgba(255, 255, 255, 0.85)",
              color: photo.selected ? "#fff" : "rgba(80, 80, 80, 0.7)",
            }}
            onClick={() => onToggleSelect(photo.id)}
            whileTap={{ scale: 0.95 }}
          >
            {photo.selected ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
          </motion.div>
        </div>
      </div>

      {/* Left arrow */}
      {index > 0 && (
        <button onClick={goPrev} style={{ ...styles.arrow, left: 20 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Right arrow */}
      {index < photos.length - 1 && (
        <button onClick={goNext} style={{ ...styles.arrow, right: 20 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Bottom: thumbnail filmstrip + controls */}
      <div style={styles.bottom}>
        {/* Close / counter */}
        <div style={styles.controls}>
          <span style={styles.counter}>
            {index + 1} / {photos.length}
          </span>
          <button onClick={onClose} style={styles.closeBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Thumbnail strip */}
        <div style={styles.thumbStrip} ref={thumbStripRef}>
          {photos.map((p, i) => (
            <div
              key={p.id}
              onClick={() => navigate(i)}
              style={{
                ...styles.thumb,
                opacity: i === index ? 1 : 0.35,
                border: i === index ? "2px solid #fff" : "2px solid transparent",
              }}
            >
              <img
                src={p.thumbnailUrl!}
                alt=""
                style={styles.thumbImg}
                draggable={false}
              />
              {p.selected && <div style={styles.thumbCheck} />}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5, 5, 5, 0.98)",
    zIndex: 100,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
  },
  mainArea: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "20px 80px",
    minHeight: 0,
  },
  imageWrap: {
    position: "relative",
    maxWidth: "100%",
    maxHeight: "100%",
    display: "inline-block",
  },
  image: {
    maxWidth: "92vw",
    maxHeight: "75vh",
    objectFit: "contain",
    display: "block",
    pointerEvents: "none",
  },
  selectBox: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 64,
    height: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: 2,
    transition: "all 0.3s ease",
  },
  arrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "#555",
    width: 60,
    height: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    cursor: "pointer",
    transition: "color 0.2s",
  },
  bottom: {
    position: "relative",
    zIndex: 2,
    width: "100%",
    flexShrink: 0,
    padding: "0 24px 20px",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px 10px",
  },
  counter: {
    color: "#333",
    fontSize: 12,
    fontWeight: 300,
    letterSpacing: "0.05em",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#444",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
  },
  thumbStrip: {
    display: "flex",
    gap: 4,
    overflowX: "auto",
    overflowY: "hidden",
    paddingBottom: 4,
    scrollbarWidth: "none" as any,
  },
  thumb: {
    flexShrink: 0,
    width: 72,
    height: 48,
    borderRadius: 2,
    overflow: "hidden",
    cursor: "pointer",
    transition: "opacity 0.2s, border-color 0.2s",
    position: "relative",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    pointerEvents: "none",
  },
  thumbCheck: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#2dd4a8",
  },
};
