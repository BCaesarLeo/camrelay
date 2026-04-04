import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "../hooks/useStore";

type Phase = "scan" | "success";

export function QRScreen() {
  const downloadInfo = useStore((s) => s.downloadInfo);
  const autoResetSeconds = useStore((s) => s.autoResetSeconds);
  const eventName = useStore((s) => s.eventName);
  const wifiNetwork = useStore((s) => s.wifiNetwork);
  const reset = useStore((s) => s.backToSessions);

  const [phase, setPhase] = useState<Phase>("scan");
  const [resetCountdown, setResetCountdown] = useState(15);

  // Poll the download token to detect when photos were downloaded
  useEffect(() => {
    if (!downloadInfo || phase !== "scan") return;

    const token = downloadInfo.downloadUrl.split("/dl/")[1];
    if (!token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download-status/${token}`);
        if (res.ok) {
          const data = await res.json();
          if (data.downloaded) {
            setPhase("success");
          }
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [downloadInfo, phase]);

  // Reset countdown on success screen
  useEffect(() => {
    if (phase !== "success") return;

    const interval = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          reset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  if (!downloadInfo) return null;

  // SUCCESS SCREEN
  if (phase === "success") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={styles.container}
      >
        <div style={styles.content}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 15 }}
          >
            <div style={styles.successIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2dd4a8" strokeWidth="1.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </motion.div>

          <motion.h1
            style={styles.successTitle}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Photos sent successfully
          </motion.h1>

          <motion.p
            style={styles.successSub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {downloadInfo.selectedCount} {downloadInfo.selectedCount !== 1 ? "photos" : "photo"} delivered
          </motion.p>

          <motion.p
            style={styles.successHint}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            Thank you for visiting {eventName}
          </motion.p>

          <motion.div
            style={styles.resetBar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <p style={styles.resetText}>Next guest in {resetCountdown}s</p>
            <div style={styles.resetProgress}>
              <div
                style={{
                  ...styles.resetProgressBar,
                  width: `${((15 - resetCountdown) / 15) * 100}%`,
                }}
              />
            </div>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  // SCAN SCREEN
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
          Get your photos
        </motion.h1>

        <motion.p
          style={styles.subtitle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {downloadInfo.selectedCount} {downloadInfo.selectedCount !== 1 ? "photos" : "photo"} ready to download
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
              <div style={styles.stepBadge}>
                <span style={styles.stepNum}>1</span>
              </div>
              <div style={styles.qrContainer}>
                <img
                  src={downloadInfo.wifiQrDataUrl}
                  alt="WiFi QR"
                  style={styles.qrImage}
                  draggable={false}
                />
              </div>
              <span style={styles.qrLabel}>Connect to our WiFi</span>
              <span style={styles.qrSub}>Network: {wifiNetwork}</span>
            </div>
          )}

          {/* Step 2: Photos */}
          <div style={styles.qrBlock}>
            <div style={styles.stepBadge}>
              <span style={styles.stepNum}>
                {downloadInfo.wifiQrDataUrl ? "2" : "1"}
              </span>
            </div>
            <div style={styles.qrContainer}>
              <img
                src={downloadInfo.qrDataUrl}
                alt="Download QR"
                style={styles.qrImage}
                draggable={false}
              />
            </div>
            <span style={styles.qrLabel}>Scan to get your photos</span>
            <span style={styles.qrSub}>
              {downloadInfo.selectedCount} {downloadInfo.selectedCount !== 1 ? "photos" : "photo"}
            </span>
          </div>
        </motion.div>

        <div style={styles.footer}>
          <motion.button
            onClick={() => setPhase("success")}
            style={styles.doneBtn}
            whileTap={{ scale: 0.97 }}
          >
            Done
          </motion.button>
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
    marginBottom: 24,
  },
  title: {
    fontSize: "clamp(24px, 4vw, 36px)",
    fontWeight: 300,
    letterSpacing: "-0.02em",
    color: "#f0f0f0",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#555",
    fontWeight: 300,
    marginBottom: 32,
  },
  qrRow: {
    display: "flex",
    justifyContent: "center",
    gap: 48,
    marginBottom: 32,
  },
  qrBlock: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 10,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: {
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
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
    fontSize: 15,
    fontWeight: 400,
    color: "#e0e0e0",
    letterSpacing: "0.03em",
  },
  qrSub: {
    fontSize: 12,
    fontWeight: 300,
    color: "#555",
  },
  footer: {
    marginTop: 24,
  },
  doneBtn: {
    padding: "16px 64px",
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#fff",
    background: "#2dd4a8",
    border: "none",
    fontFamily: "inherit",
    cursor: "pointer",
  },
  // Success screen
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: "rgba(45, 212, 168, 0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 32px",
  },
  successTitle: {
    fontSize: "clamp(28px, 5vw, 42px)",
    fontWeight: 300,
    letterSpacing: "-0.02em",
    color: "#f0f0f0",
    marginBottom: 12,
  },
  successSub: {
    fontSize: 16,
    color: "#2dd4a8",
    fontWeight: 400,
    marginBottom: 8,
  },
  successHint: {
    fontSize: 14,
    color: "#444",
    fontWeight: 300,
    marginBottom: 48,
  },
  resetBar: {
    maxWidth: 300,
    margin: "0 auto",
  },
  resetText: {
    fontSize: 13,
    color: "#333",
    fontWeight: 300,
    marginBottom: 8,
  },
  resetProgress: {
    width: "100%",
    height: 3,
    background: "#1a1a1a",
    borderRadius: 2,
    overflow: "hidden",
  },
  resetProgressBar: {
    height: "100%",
    background: "#2dd4a8",
    transition: "width 1s linear",
  },
};
