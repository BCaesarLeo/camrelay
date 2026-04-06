import { useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";
import { api } from "../lib/api";

export function ContactForm() {
  const session = useStore((s) => s.session);
  const photos = useStore((s) => s.photos);
  const setScreen = useStore((s) => s.setScreen);
  const completeSession = useStore((s) => s.completeSession);
  const generateDownloadLink = useStore((s) => s.generateDownloadLink);
  const eventName = useStore((s) => s.eventName);
  const deliveryMode = useStore((s) => s.deliveryMode);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const selected = photos.filter((p) => p.selected && p.status === "ready");
  const isOnline = deliveryMode === "online";

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Please enter your email or phone number");
      return;
    }
    if (!session) return;

    setLoading(true);
    setError("");

    try {
      await completeSession();
      await generateDownloadLink();

      const info = useStore.getState().downloadInfo;
      const token = info?.downloadUrl.split("/dl/")[1]?.split("?")[0] || "";

      await api.saveContact({
        sessionId: session.id,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        downloadToken: token,
        selectedPhotoIds: selected.map((p) => p.id),
      });

      if (isOnline) {
        // Online mode — show success, cloud sync sends email + MMS
        setSent(true);
        setLoading(false);
      } else {
        // Local mode — go to QR screen
        setScreen("qr");
      }
    } catch (err) {
      console.error("Contact form error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  // Success screen for online delivery
  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={styles.container}
      >
        <div style={{ ...styles.content, textAlign: "center" as const }}>
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

          <h1 style={styles.title}>We'll send your photos!</h1>
          <p style={styles.subtitle}>
            {selected.length} {selected.length === 1 ? "photo" : "photos"} will be sent to{" "}
            {email && phone ? `${email} and ${phone}` : email || phone}
          </p>
          <p style={{ ...styles.subtitle, color: "#333" }}>
            Thank you for visiting {eventName}
          </p>

          <motion.button
            onClick={() => {
              setName("");
              setEmail("");
              setPhone("");
              setSent(false);
              useStore.getState().backToSessions();
            }}
            style={styles.doneBtn}
            whileTap={{ scale: 0.97 }}
          >
            Done
          </motion.button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={styles.container}
    >
      <div style={styles.content}>
        <button onClick={() => setScreen("review")} style={styles.backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <p style={styles.brand}>{eventName}</p>

        <h1 style={styles.title}>Get your photos</h1>
        <p style={styles.subtitle}>
          {isOnline
            ? `Enter your info and we'll send you ${selected.length} ${selected.length === 1 ? "photo" : "photos"}`
            : `Enter your info to get ${selected.length} ${selected.length === 1 ? "photo" : "photos"}`}
        </p>

        <div style={styles.form}>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            autoFocus
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}

          <motion.button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              ...styles.submitBtn,
              opacity: loading ? 0.5 : 1,
            }}
            whileTap={!loading ? { scale: 0.98 } : undefined}
          >
            {loading ? "Preparing..." : isOnline ? "Send files" : "Get QR code"}
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
    width: "100%",
    maxWidth: 440,
    padding: "40px 24px",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "1px solid #2a2a2a",
    color: "#888",
    padding: "10px 20px 10px 14px",
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: "0.05em",
    fontFamily: "inherit",
    cursor: "pointer",
    marginBottom: 40,
  },
  brand: {
    fontSize: 11,
    fontWeight: 300,
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    color: "#333",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
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
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  },
  input: {
    width: "100%",
    padding: "16px",
    background: "#111",
    border: "1px solid #222",
    color: "#f0f0f0",
    fontSize: 17,
    fontFamily: "inherit",
    fontWeight: 300,
    outline: "none",
    borderRadius: 0,
    WebkitAppearance: "none" as any,
  },
  error: {
    color: "#F06060",
    fontSize: 13,
    fontWeight: 300,
  },
  submitBtn: {
    width: "100%",
    padding: "18px",
    marginTop: 8,
    fontSize: 15,
    fontWeight: 400,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#fff",
    background: "#4353FF",
    border: "none",
    fontFamily: "inherit",
    cursor: "pointer",
  },
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
};
