import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "./hooks/useStore";
import { useWebSocket } from "./hooks/useWebSocket";
import { SessionsList } from "./components/SessionsList";
import { SessionView } from "./components/SessionView";
import { ReviewScreen } from "./components/ReviewScreen";
import { RegroupScreen } from "./components/RegroupScreen";
import { ContactForm } from "./components/ContactForm";
import { QRScreen } from "./components/QRScreen";
import { FindMeScreen } from "./components/FindMeScreen";
import { HostView } from "./components/HostView";
import { GuestBanner } from "./components/GuestBanner";

export function App() {
  const screen = useStore((s) => s.screen);
  const loadConfig = useStore((s) => s.loadConfig);
  const [mode, setMode] = useState<"guest" | "host" | "kiosk">("guest");

  useWebSocket();

  useEffect(() => {
    loadConfig();
    const path = window.location.pathname;
    if (path === "/host") setMode("host");
    else if (path === "/kiosk") setMode("kiosk");
    else setMode("guest");
  }, []);

  if (mode === "host") {
    return <HostView />;
  }

  // Kiosk mode: same flow but no "+" button on sessions list (photographer manages from /host)
  // The QR screen auto-resets after countdown

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <GuestBanner />
      <div style={{ flex: 1, minHeight: 0 }}>
        <AnimatePresence mode="wait">
          {screen === "sessions" && <SessionsList key="sessions" kiosk={mode === "kiosk"} />}
          {screen === "session" && <SessionView key="session" />}
          {screen === "review" && <ReviewScreen key="review" />}
          {screen === "regroup" && <RegroupScreen key="regroup" />}
          {screen === "contact" && <ContactForm key="contact" />}
          {screen === "qr" && <QRScreen key="qr" />}
          {screen === "findme" && <FindMeScreen key="findme" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
