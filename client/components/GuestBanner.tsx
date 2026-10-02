import { useEffect } from "react";
import { useStore } from "../hooks/useStore";

// Shown while a guest is adding another session to the contact info they already
// entered. Their details are dropped as soon as they tap Done — or walk away.
export function GuestBanner() {
  const guest = useStore((s) => s.guest);
  const screen = useStore((s) => s.screen);
  const autoResetSeconds = useStore((s) => s.autoResetSeconds);
  const finishGuest = useStore((s) => s.finishGuest);

  // The QR screen is excluded: the guest is busy with their phone, not this screen
  const idleResets = !!guest && screen !== "qr";

  useEffect(() => {
    if (!idleResets) return;
    const idleMs = Math.max(45, autoResetSeconds) * 1000;
    let timer = setTimeout(finishGuest, idleMs);
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(finishGuest, idleMs);
    };
    window.addEventListener("pointerdown", restart);
    window.addEventListener("keydown", restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
      window.removeEventListener("keydown", restart);
    };
  }, [idleResets, autoResetSeconds]);

  if (!guest || screen === "contact" || screen === "qr" || screen === "findme") return null;

  return (
    <div style={styles.bar}>
      <span style={styles.text}>
        <span style={styles.name}>{guest.name}</span>
        {screen === "sessions"
          ? " — pick another session to send to "
          : " — this session will also go to "}
        {guest.email || guest.phone}
      </span>
      <button onClick={finishGuest} style={styles.doneBtn}>
        Done
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "10px 24px",
    background: "rgba(45, 212, 168, 0.12)",
    borderBottom: "1px solid rgba(45, 212, 168, 0.3)",
  },
  text: {
    fontSize: 14,
    fontWeight: 300,
    color: "#cfeee6",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  name: {
    fontWeight: 500,
  },
  doneBtn: {
    flexShrink: 0,
    padding: "8px 24px",
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "#fff",
    background: "#2dd4a8",
    fontFamily: "inherit",
    cursor: "pointer",
  },
};
