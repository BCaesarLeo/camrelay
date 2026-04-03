import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";

export function QRScreen() {
  const downloadInfo = useStore((s) => s.downloadInfo);
  const autoResetSeconds = useStore((s) => s.autoResetSeconds);
  const eventName = useStore((s) => s.eventName);
  const wifiNetwork = useStore((s) => s.wifiNetwork);
  const wifiPassword = useStore((s) => s.wifiPassword);
  const reset = useStore((s) => s.backToSessions);
  const [countdown, setCountdown] = useState(autoResetSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          reset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!downloadInfo) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={styles.container}
    >
      <div style={styles.content}>
        <motion.p
          style={styles.brand}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {eventName}
        </motion.p>

        <motion.h1
          style={styles.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Scan to download
        </motion.h1>

        <motion.p
          style={styles.subtitle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {downloadInfo.selectedCount} {downloadInfo.selectedCount !== 1 ? "photos" : "photo"} ready
        </motion.p>

        {/* Two QR codes side by side */}
        <motion.div
          style={styles.qrRow}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          {/* Step 1: WiFi */}
          {downloadInfo.wifiQrDataUrl && (
            <div style={styles.qrBlock}>
              <span style={styles.stepLabel}>Step 1</span>
              <div style={styles.qrContainer}>
                <img
                  src={downloadInfo.wifiQrDataUrl}
                  alt="WiFi QR"
                  style={styles.qrImage}
                  draggable={false}
                />
              </div>
              <span style={styles.qrLabel}>Connect to WiFi</span>
              <span style={styles.qrSub}>{wifiNetwork}</span>
            </div>
          )}

          {/* Step 2: Photos */}
          <div style={styles.qrBlock}>
            <span style={styles.stepLabel}>
              {downloadInfo.wifiQrDataUrl ? "Step 2" : ""}
            </span>
            <div style={styles.qrContainer}>
              <img
                src={downloadInfo.qrDataUrl}
                alt="Download QR"
                style={styles.qrImage}
                draggable={false}
              />
            </div>
            <span style={styles.qrLabel}>Get your photos</span>
            <span style={styles.qrSub}>
              {downloadInfo.selectedCount} {downloadInfo.selectedCount !== 1 ? "photos" : "photo"}
            </span>
          </div>
        </motion.div>

        <div style={styles.footer}>
          <button onClick={reset} style={styles.backBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to sessions
          </button>
          <p style={styles.countdown}>{countdown}s</p>
        </div>
      </div>
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
  },
  content: {
    textAlign: "center",
    padding: 40,
    maxWidth: 900,
  },
  brand: {
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    color: "#333",
    marginBottom: 32,
  },
  title: {
    fontSize: "clamp(24px, 4vw, 36px)",
    fontWeight: 300,
    letterSpacing: "-0.02em",
    color: "#f0f0f0",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    fontWeight: 300,
    marginBottom: 32,
  },
  qrRow: {
    display: "flex",
    justifyContent: "center",
    gap: 48,
    marginBottom: 24,
  },
  qrBlock: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 8,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#444",
    minHeight: 16,
  },
  qrContainer: {
    display: "inline-block",
    padding: 16,
    background: "#fff",
    borderRadius: 4,
  },
  qrImage: {
    width: 280,
    height: 280,
    display: "block",
  },
  qrLabel: {
    fontSize: 14,
    fontWeight: 400,
    color: "#e0e0e0",
    letterSpacing: "0.03em",
  },
  qrSub: {
    fontSize: 12,
    fontWeight: 300,
    color: "#555",
  },
  url: {
    marginTop: 16,
    fontSize: 11,
    color: "#2a2a2a",
    fontFamily: "monospace",
    wordBreak: "break-all",
    letterSpacing: "0.03em",
  },
  steps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 32,
  },
  step: {
    fontSize: 12,
    color: "#444",
    fontWeight: 300,
    letterSpacing: "0.05em",
  },
  stepDot: {
    color: "#2a2a2a",
  },
  footer: {
    marginTop: 48,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "12px 24px 12px 18px",
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: "0.06em",
    color: "#888",
    background: "transparent",
    border: "1px solid #2a2a2a",
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  countdown: {
    fontSize: 12,
    color: "#222",
    fontWeight: 300,
  },
};
