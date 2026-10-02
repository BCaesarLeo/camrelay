import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../hooks/useStore";

export function SessionView() {
  const photos = useStore((s) => s.photos);
  const session = useStore((s) => s.session);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const setScreen = useStore((s) => s.setScreen);
  const backToSessions = useStore((s) => s.backToSessions);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const openRegroup = useStore((s) => s.openRegroup);
  const [activeIndex, setActiveIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const prevPhotoCount = useRef(0);

  const selectedCount = photos.filter((p) => p.selected).length;
  const readyPhotos = photos.filter((p) => p.status === "ready");
  const activePhoto = readyPhotos[activeIndex] ?? null;

  useEffect(() => {
    loadPhotos();
  }, [session?.id]);

  // Auto-switch to latest photo when a new one arrives
  useEffect(() => {
    if (readyPhotos.length > prevPhotoCount.current && readyPhotos.length > 0) {
      setActiveIndex(readyPhotos.length - 1);
    } else if (activeIndex > readyPhotos.length - 1) {
      // Photos were regrouped out of this session
      setActiveIndex(Math.max(0, readyPhotos.length - 1));
    }
    prevPhotoCount.current = readyPhotos.length;
  }, [readyPhotos.length]);

  // Scroll active thumbnail into view
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const el = strip.children[activeIndex] as HTMLElement;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeIndex]);

  const goNext = () => {
    if (activeIndex < readyPhotos.length - 1) setActiveIndex(activeIndex + 1);
  };
  const goPrev = () => {
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
  };

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === " " && activePhoto) {
        e.preventDefault();
        toggleSelect(activePhoto.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, activePhoto]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={styles.container}
    >
      {/* Top bar */}
      <div style={styles.topBar}>
        <button onClick={backToSessions} style={styles.backBtn}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <span style={styles.sessionLabel}>
          Session {session?.sessionNumber}
          <span style={styles.photoCount}>
            {readyPhotos.length} {readyPhotos.length === 1 ? "photo" : "photos"}
          </span>
        </span>

        {selectedCount > 0 ? (
          <button
            onClick={() => setScreen("review")}
            style={styles.continueBtn}
          >
            Continue ({selectedCount})
          </button>
        ) : (
          <div style={{ width: 120 }} />
        )}
      </div>

      {/* Main preview area */}
      <div style={styles.previewArea}>
        {readyPhotos.length === 0 ? (
          <motion.p
            style={styles.emptyText}
            animate={{ opacity: [0.2, 0.5, 0.2] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            Waiting for photos...
          </motion.p>
        ) : activePhoto ? (
          <>
            {/* Large photo */}
            <div style={styles.imageWrap}>
              <AnimatePresence mode="wait">
                <motion.img
                  key={activePhoto.id}
                  src={activePhoto.fullUrl || activePhoto.thumbnailUrl!}
                  alt=""
                  style={styles.mainImage}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  draggable={false}
                />
              </AnimatePresence>

              {/* Select box — bottom right on the image */}
              <motion.div
                style={{
                  ...styles.selectBox,
                  background: activePhoto.selected
                    ? "rgba(45, 212, 168, 0.95)"
                    : "rgba(255, 255, 255, 0.85)",
                  color: activePhoto.selected ? "#fff" : "rgba(80, 80, 80, 0.7)",
                }}
                onClick={() => toggleSelect(activePhoto.id)}
                whileTap={{ scale: 0.9 }}
              >
                {activePhoto.selected ? (
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

              {/* Not us — bottom left on the image */}
              <motion.button
                style={styles.notUsBtn}
                onClick={() => openRegroup([activePhoto.id])}
                whileTap={{ scale: 0.95 }}
              >
                Not us?
              </motion.button>
            </div>

            {/* Nav arrows */}
            {activeIndex > 0 && (
              <button onClick={goPrev} style={{ ...styles.arrow, left: 16 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            {activeIndex < readyPhotos.length - 1 && (
              <button onClick={goNext} style={{ ...styles.arrow, right: 16 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Thumbnail filmstrip */}
      {readyPhotos.length > 0 && (
        <div style={styles.stripArea}>
          <div style={styles.strip} ref={stripRef}>
            {readyPhotos.map((photo, i) => (
              <div
                key={photo.id}
                onClick={() => setActiveIndex(i)}
                style={{
                  ...styles.thumb,
                  opacity: i === activeIndex ? 1 : 0.4,
                  borderColor: i === activeIndex
                    ? "#fff"
                    : photo.selected
                      ? "rgba(45, 212, 168, 0.5)"
                      : "transparent",
                }}
              >
                <img
                  src={photo.thumbnailUrl!}
                  alt=""
                  style={styles.thumbImg}
                  draggable={false}
                />
                {photo.selected && <div style={styles.thumbCheck} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#050505",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 24px",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "1px solid #2a2a2a",
    color: "#888",
    padding: "10px 20px 10px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: "0.05em",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  },
  sessionLabel: {
    fontSize: 13,
    fontWeight: 300,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#555",
  },
  photoCount: {
    marginLeft: 10,
    color: "#333",
  },
  continueBtn: {
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
    transition: "all 0.2s",
  },
  previewArea: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    minHeight: 0,
    padding: "0 60px",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 300,
    color: "#333",
    letterSpacing: "0.05em",
  },
  imageWrap: {
    position: "relative",
    maxWidth: "100%",
    maxHeight: "100%",
    display: "inline-block",
  },
  mainImage: {
    maxWidth: "88vw",
    maxHeight: "72vh",
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
    transition: "all 0.3s ease",
  },
  notUsBtn: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 44,
    padding: "0 18px",
    background: "rgba(0, 0, 0, 0.6)",
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: "0.06em",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  arrow: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    background: "transparent",
    border: "none",
    color: "#444",
    width: 56,
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "color 0.2s",
    zIndex: 2,
  },
  stripArea: {
    flexShrink: 0,
    padding: "12px 24px 16px",
  },
  strip: {
    display: "flex",
    gap: 4,
    overflowX: "auto",
    overflowY: "hidden",
    scrollbarWidth: "none" as any,
  },
  thumb: {
    flexShrink: 0,
    width: 88,
    height: 58,
    borderRadius: 2,
    overflow: "hidden",
    cursor: "pointer",
    transition: "opacity 0.2s, border-color 0.2s",
    border: "2px solid transparent",
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
    bottom: 3,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#2dd4a8",
  },
};
