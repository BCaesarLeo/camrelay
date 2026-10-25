import { useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "../hooks/useStore";

// The AI card offer, shown while the guest is choosing photos. Tapping the example IS the
// yes: it sends one of their photos to Google's image model and the finished card joins
// their photos, selected. Nothing is drawn unless they tap.
//
// size "compact" floats over the session view; "tile" sits in the review grid.
export function AiCardOffer({ size, sourcePhotoId }: { size: "compact" | "tile"; sourcePhotoId: string | null }) {
  const available = useStore((s) => s.aiCardsAvailable);
  const photos = useStore((s) => s.photos);
  const requestCard = useStore((s) => s.requestCard);
  const cardError = useStore((s) => s.cardError);
  const choices = useStore((s) => s.aiCardChoices);
  const [picking, setPicking] = useState(false);

  if (!available) return null;
  const card = photos.find((p) => p.kind === "card" && p.status !== "error");
  const failed = photos.find((p) => p.kind === "card" && p.status === "error");
  const compact = size === "compact";

  // Already drawn: it is in the photo grid like any other photo, nothing more to offer
  if (card?.status === "ready") return null;

  const drawing = card?.status === "processing";
  const canTap = !drawing && !!sourcePhotoId;
  const showPicker = picking && canTap;
  // First tap opens the picker; picking a style is the yes
  const pick = (choice: string) => {
    setPicking(false);
    requestCard(sourcePhotoId!, choice);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => canTap && !showPicker && setPicking(true)}
      style={{
        ...styles.box,
        ...(compact ? styles.boxCompact : styles.boxTile),
        cursor: canTap && !showPicker ? "pointer" : "default",
      }}
      whileTap={canTap && !showPicker ? { scale: 0.97 } : undefined}
    >
      <div style={{ ...styles.imageWrap, ...(compact ? { width: 96 } : { width: "100%" }) }}>
        <img src="/ai-cards/example.jpg" alt="" draggable={false} style={{ ...styles.image, opacity: drawing ? 0.35 : 1 }} />
        {drawing && (
          <div style={styles.spinnerWrap}>
            <div style={styles.spinner} />
          </div>
        )}
      </div>
      {showPicker ? (
        <div style={styles.text}>
          <p style={{ ...styles.title, fontSize: compact ? 13 : 15 }}>Pick a style and we'll draw it</p>
          {choices.map((c) => (
            <button key={c.id} onClick={(e) => { e.stopPropagation(); pick(c.id); }} style={styles.choice}>
              {c.label}
            </button>
          ))}
          <button onClick={(e) => { e.stopPropagation(); setPicking(false); }} style={{ ...styles.choice, ...styles.choiceNo }}>
            Not now
          </button>
          <p style={{ ...styles.note, fontSize: 10 }}>Picking one sends your photo to Google's AI service to draw the card.</p>
        </div>
      ) : (
        <div style={styles.text}>
          <p style={{ ...styles.title, fontSize: compact ? 13 : 16 }}>
            {drawing ? "Drawing your card…" : "✦ Tap to make our Halloween card"}
          </p>
          <p style={{ ...styles.note, fontSize: compact ? 10 : 12 }}>
            {drawing
              ? "About 20 seconds. It will appear with your photos and be sent with them."
              : failed || cardError
                ? "It didn't work last time — tap to try again."
                : "A fun illustrated card made from your photo. You pick the style next."}
          </p>
        </div>
      )}
    </motion.div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    background: "rgba(9, 60, 109, 0.92)",
    border: "1px solid #d4ba81",
    borderRadius: 4,
    color: "#f3dca6",
    userSelect: "none",
    WebkitUserSelect: "none",
  },
  boxCompact: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 5,
    padding: 10,
    maxWidth: 300,
  },
  boxTile: {
    flexDirection: "column",
    alignItems: "stretch",
    padding: 12,
  },
  imageWrap: {
    position: "relative",
    flexShrink: 0,
    aspectRatio: "2 / 3",
    borderRadius: 2,
    overflow: "hidden",
    background: "#06264a",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    pointerEvents: "none",
  },
  spinnerWrap: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: "3px solid #d4ba81",
    borderRightColor: "transparent",
    animation: "aicard-spin 1s linear infinite",
  },
  text: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  choice: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "9px 10px",
    border: "1px solid #d4ba81",
    borderRadius: 4,
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    font: "inherit",
    fontSize: 14,
    textAlign: "left",
    cursor: "pointer",
  },
  choiceNo: { background: "none", borderColor: "transparent", color: "#d9c79a", justifyContent: "center", padding: 6, fontSize: 13 },
  emoji: { fontSize: 18, width: 22, textAlign: "center" },
  title: { fontWeight: 500, color: "#fff", margin: 0, lineHeight: 1.25 },
  note: { fontWeight: 300, color: "#d9c79a", margin: 0, lineHeight: 1.4 },
};
