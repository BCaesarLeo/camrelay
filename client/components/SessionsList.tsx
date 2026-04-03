import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../hooks/useStore";
import { api } from "../lib/api";

export function SessionsList() {
  const sessions = useStore((s) => s.sessions);
  const loadSessions = useStore((s) => s.loadSessions);
  const createSession = useStore((s) => s.createSession);
  const openSession = useStore((s) => s.openSession);
  const eventName = useStore((s) => s.eventName);
  const gridRef = useRef<HTMLDivElement>(null);
  const [bgPhoto, setBgPhoto] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ number: number; color: string } | null>(null);

  const activeSession = sessions.find((s) => s.status === "active");

  const handleNewSession = async () => {
    await createSession();
    // Re-fetch to get the new session with number/color
    const updated = await api.listSessions();
    const newest = updated.find((s) => s.status === "active");
    if (newest) {
      setFlash({ number: newest.sessionNumber, color: newest.color });
      setTimeout(() => setFlash(null), 2500);
    }
  };

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch a recent photo for hero background
  useEffect(() => {
    api.getRecentPhoto().then((photo) => {
      if (photo?.fullUrl) setBgPhoto(photo.fullUrl);
      else if (photo?.thumbnailUrl) setBgPhoto(photo.thumbnailUrl);
    });
  }, []);

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr + "Z");
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.container}
    >
      {/* Hero section — Glam128 style */}
      <div style={styles.hero}>
        {/* Background photo */}
        {bgPhoto && (
          <motion.div
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.5 }}
            style={{
              ...styles.heroBg,
              backgroundImage: `url(${bgPhoto})`,
            }}
          />
        )}
        <div style={styles.heroOverlay} />

        {/* Top bar — active session indicator + new session button */}
        <div style={styles.topBar}>
          {/* Active session indicator */}
          {activeSession && (
            <div style={{ ...styles.activeIndicator, borderColor: `${activeSession.color}44` }}>
              <div style={{ ...styles.activeColorDot, background: activeSession.color }} />
              <span style={styles.activeLabel}>
                Session {activeSession.sessionNumber}
              </span>
            </div>
          )}

          {/* New session "+" button */}
          <motion.button
            style={styles.newSessionBtn}
            onClick={handleNewSession}
            whileTap={{ scale: 0.9 }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </motion.button>
        </div>

        {/* Flash feedback when new session created */}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              style={{
                ...styles.flash,
                background: flash.color,
              }}
            >
              Session {flash.number} started
            </motion.div>
          )}
        </AnimatePresence>

        <div style={styles.heroContent}>
          <motion.p
            style={styles.heroBrand}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            {eventName}
          </motion.p>

          <motion.h1
            style={styles.heroTitle}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
          >
            A moment that<br />remains forever
          </motion.h1>

          <motion.p
            style={styles.heroSub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            Find your session and select the photos you love
          </motion.p>

          <motion.button
            style={styles.heroBtn}
            onClick={scrollToGrid}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 0.5 }}
            whileTap={{ scale: 0.97 }}
          >
            Search a Session
          </motion.button>
        </div>

        {/* Scroll indicator */}
        <motion.div
          style={styles.scrollHint}
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </motion.div>
      </div>

      {/* Sessions grid */}
      <div ref={gridRef} style={styles.gridSection}>
        <div style={styles.gridHeader}>
          <span style={styles.gridLabel}>Sessions</span>
          <span style={styles.gridCount}>
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </div>

        <div style={styles.grid}>
          {sessions.length === 0 && (
            <div style={styles.empty}>
              <p style={styles.emptyText}>No sessions yet</p>
            </div>
          )}

          <AnimatePresence>
            {sessions.map((session, i) => (
              <motion.div
                key={session.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                style={styles.card}
                onClick={() => openSession(session)}
              >
                <div style={styles.cardCover}>
                  {session.coverUrl ? (
                    <img
                      src={session.coverUrl}
                      alt=""
                      style={styles.coverImg}
                      draggable={false}
                    />
                  ) : (
                    <div style={{
                      ...styles.coverPlaceholder,
                      background: `${session.color}15`,
                    }}>
                      <span style={{ ...styles.placeholderNumber, color: `${session.color}40` }}>
                        {session.sessionNumber}
                      </span>
                    </div>
                  )}

                  {/* Session color stripe at top */}
                  <div style={{ ...styles.colorStripe, background: session.color }} />

                  {session.status === "active" && (
                    <div style={{ ...styles.activeBadge, background: `${session.color}cc` }}>
                      <span style={styles.activeBadgeDot} />
                      Live
                    </div>
                  )}
                </div>

                <div style={styles.cardInfo}>
                  <div style={styles.cardTop}>
                    <span style={{ ...styles.cardNumber, color: session.color }}>
                      {String(session.sessionNumber).padStart(2, "0")}
                    </span>
                    <span style={styles.cardTime}>{formatTime(session.createdAt)}</span>
                  </div>
                  <div style={styles.cardMeta}>
                    <span>
                      {session.photoCount}{" "}
                      {session.photoCount === 1 ? "photo" : "photos"}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    overflow: "auto",
    background: "#0a0a0a",
  },
  // Hero
  hero: {
    position: "relative",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroBg: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "brightness(0.35) saturate(0.7)",
  },
  heroOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to bottom, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.6) 60%, #0a0a0a 100%)",
  },
  topBar: {
    position: "absolute",
    top: 24,
    left: 32,
    right: 32,
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  activeIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    background: "rgba(0, 0, 0, 0.4)",
    border: "1px solid transparent",
    backdropFilter: "blur(8px)",
  },
  activeColorDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  activeLabel: {
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: "0.06em",
    color: "rgba(255,255,255,0.8)",
  },
  newSessionBtn: {
    width: 48,
    height: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255, 255, 255, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "rgba(255, 255, 255, 0.7)",
    cursor: "pointer",
    backdropFilter: "blur(8px)",
    transition: "all 0.3s ease",
    fontFamily: "inherit",
  },
  flash: {
    position: "absolute",
    top: 88,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 3,
    padding: "12px 28px",
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: "0.06em",
    color: "#fff",
    borderRadius: 2,
    whiteSpace: "nowrap" as const,
  },
  heroContent: {
    position: "relative",
    zIndex: 1,
    textAlign: "center",
    padding: "0 40px",
    maxWidth: 700,
  },
  heroBrand: {
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: "0.25em",
    textTransform: "uppercase" as const,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 32,
  },
  heroTitle: {
    fontSize: "clamp(36px, 6vw, 64px)",
    fontWeight: 300,
    letterSpacing: "-0.03em",
    lineHeight: 1.1,
    color: "#fff",
    marginBottom: 24,
  },
  heroSub: {
    fontSize: 15,
    fontWeight: 300,
    color: "rgba(255,255,255,0.4)",
    marginBottom: 48,
    letterSpacing: "0.02em",
  },
  heroBtn: {
    padding: "22px 64px",
    fontSize: 16,
    fontWeight: 400,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: "#fff",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.3)",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.3s ease",
  },
  scrollHint: {
    position: "absolute",
    bottom: 32,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 1,
  },
  // Grid section
  gridSection: {
    padding: "60px 24px 40px",
    minHeight: "50vh",
  },
  gridHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    padding: "0 8px 20px",
  },
  gridLabel: {
    fontSize: 13,
    fontWeight: 300,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#4a4a4a",
  },
  gridCount: {
    fontSize: 12,
    color: "#333",
    fontWeight: 300,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "8px",
    alignContent: "start",
  },
  empty: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "30vh",
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 300,
    color: "#333",
  },
  card: {
    cursor: "pointer",
    borderRadius: 2,
    overflow: "hidden",
    background: "#111",
    transition: "background 0.2s",
  },
  cardCover: {
    position: "relative",
    width: "100%",
    aspectRatio: "16 / 9",
    overflow: "hidden",
  },
  coverImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    pointerEvents: "none",
  },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  placeholderNumber: {
    fontSize: "clamp(48px, 8vw, 80px)",
    fontWeight: 200,
    letterSpacing: "-0.03em",
  },
  colorStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  activeBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 2,
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: "0.06em",
    color: "#fff",
  },
  activeBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#fff",
  },
  cardInfo: {
    padding: "10px 14px",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  cardNumber: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "monospace",
  },
  cardTime: {
    fontSize: 12,
    color: "#555",
    fontWeight: 300,
  },
  cardMeta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#444",
    fontWeight: 300,
  },
};
