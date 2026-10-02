import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";

// "Can't find your photos?" — for guests who were photographed but can't find
// their session, or never got their photos. They leave an email and a quick
// photo of themselves; staff pick out their photos on the Host page and send them.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EDGE = 1600;
const THANKS_SECONDS = 5;

// crypto.randomUUID needs https; the kiosk usually runs on plain http over the LAN
function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toJpeg(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function FindMeScreen() {
  const backToSessions = useStore((s) => s.backToSessions);
  const eventName = useStore((s) => s.eventName);
  const autoResetSeconds = useStore((s) => s.autoResetSeconds);

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  // Live preview only works on https or on the kiosk machine itself; on an iPad
  // over plain http we open the iPad's own camera instead.
  const [live, setLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
        setLive(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Don't leave a half-typed email on screen for the next guest
  useEffect(() => {
    if (done) {
      const t = setTimeout(backToSessions, THANKS_SECONDS * 1000);
      return () => clearTimeout(t);
    }
    let timer = setTimeout(backToSessions, Math.max(45, autoResetSeconds) * 1000);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(backToSessions, Math.max(45, autoResetSeconds) * 1000);
    };
    window.addEventListener("pointerdown", restart);
    window.addEventListener("keydown", restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
      window.removeEventListener("keydown", restart);
    };
  }, [done]);

  const validEmail = () => {
    if (EMAIL.test(email.trim())) return true;
    setError("Please enter a valid email address");
    return false;
  };

  const submit = async (photo: string | null) => {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/find-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId(), email: email.trim(), photo: photo ?? undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again or ask a staff member.");
    }
    setSending(false);
  };

  const handleLive = () => {
    if (!validEmail()) return;
    const video = videoRef.current;
    submit(video?.videoWidth ? toJpeg(video, video.videoWidth, video.videoHeight) : null);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const photo = toJpeg(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      submit(photo);
    } catch {
      // Couldn't read the picture — the email alone still gets them on the list
      submit(null);
    }
  };

  if (done) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={styles.container} onClick={backToSessions}>
        <div style={{ ...styles.content, textAlign: "center" }}>
          <div style={styles.successIcon}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2dd4a8" strokeWidth="1.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={styles.title}>Got it — thank you!</h1>
          <p style={styles.subtitle}>We&apos;ll find your photos and email them to you.</p>
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
        <button onClick={backToSessions} style={styles.backBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <p style={styles.brand}>{eventName}</p>
        <h1 style={styles.title}>Can&apos;t find your photos?</h1>
        <p style={styles.subtitle}>
          Enter your email and take a quick photo of yourself. We&apos;ll find your photos and send them to you.
        </p>

        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{ ...styles.preview, display: live ? "block" : "none" }}
        />

        <div style={styles.form}>
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="Email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}

          {live ? (
            <motion.button
              onClick={handleLive}
              disabled={sending}
              style={{ ...styles.submitBtn, opacity: sending ? 0.5 : 1 }}
              whileTap={!sending ? { scale: 0.98 } : undefined}
            >
              {sending ? "Sending..." : "Find my photos"}
            </motion.button>
          ) : (
            <>
              <motion.button
                onClick={() => validEmail() && fileRef.current?.click()}
                disabled={sending}
                style={{ ...styles.submitBtn, opacity: sending ? 0.5 : 1 }}
                whileTap={!sending ? { scale: 0.98 } : undefined}
              >
                {sending ? "Sending..." : "Take my photo"}
              </motion.button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: "none" }}
                onChange={(e) => {
                  handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => validEmail() && submit(null)}
                disabled={sending}
                style={styles.skipBtn}
              >
                Send without a photo
              </button>
            </>
          )}
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
    overflowY: "auto",
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
    marginBottom: 32,
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
    marginBottom: 24,
    lineHeight: 1.5,
  },
  preview: {
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
    background: "#111",
    transform: "scaleX(-1)",
    marginBottom: 12,
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
    userSelect: "text",
  },
  error: {
    color: "#F06060",
    fontSize: 13,
    fontWeight: 300,
  },
  submitBtn: {
    width: "100%",
    padding: "18px",
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
  skipBtn: {
    padding: "10px",
    background: "none",
    color: "#666",
    fontSize: 13,
    letterSpacing: "0.04em",
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
};
