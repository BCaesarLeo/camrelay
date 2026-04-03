import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";
import { api } from "../lib/api";

export function WelcomeScreen() {
  const eventName = useStore((s) => s.eventName);
  const setScreen = useStore((s) => s.setScreen);
  const [bgPhoto, setBgPhoto] = useState<string | null>(null);

  // Fetch the most recent photo to use as background
  useEffect(() => {
    api.getRecentPhoto().then((photo) => {
      if (photo?.thumbnailUrl) setBgPhoto(photo.thumbnailUrl);
    });
  }, []);

  const handleStart = () => {
    setScreen("sessions");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      style={styles.container}
    >
      {/* Background photo layer */}
      {bgPhoto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 0.3 }}
          style={{
            ...styles.bgPhoto,
            backgroundImage: `url(${bgPhoto})`,
          }}
        />
      )}

      {/* Dark overlay gradient */}
      <div style={styles.overlay} />

      <div style={styles.content}>
        <motion.p
          style={styles.brand}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
        >
          {eventName}
        </motion.p>

        <motion.h1
          style={styles.title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Your session is ready
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          <button
            onClick={handleStart}
            style={styles.button}
          >
            Begin
          </button>
        </motion.div>

        <motion.p
          style={styles.hint}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.6 }}
        >
          Tap to start your photo session
        </motion.p>
      </div>

      <div style={styles.corner}>SR</div>
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0a",
    position: "relative",
    overflow: "hidden",
  },
  bgPhoto: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "blur(60px) saturate(0.6) brightness(0.3)",
    transform: "scale(1.3)",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse at center, rgba(10,10,10,0.7) 0%, rgba(10,10,10,0.92) 70%)",
  },
  content: {
    textAlign: "center",
    padding: "40px",
    position: "relative",
    zIndex: 1,
  },
  brand: {
    fontSize: 13,
    fontWeight: 300,
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    color: "#4a4a4a",
    marginBottom: 48,
  },
  title: {
    fontSize: "clamp(32px, 5vw, 56px)",
    fontWeight: 300,
    letterSpacing: "-0.03em",
    color: "#f0f0f0",
    marginBottom: 56,
    lineHeight: 1.1,
  },
  button: {
    padding: "20px 80px",
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "#fff",
    background: "transparent",
    border: "1px solid #333",
    cursor: "pointer",
    transition: "all 0.3s ease",
    fontFamily: "inherit",
  },
  hint: {
    marginTop: 32,
    fontSize: 13,
    color: "#333",
    fontWeight: 300,
  },
  corner: {
    position: "absolute",
    bottom: 32,
    right: 36,
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: "0.15em",
    color: "#222",
    zIndex: 1,
  },
};
