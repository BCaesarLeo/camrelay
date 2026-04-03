import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "./hooks/useStore";
import { useWebSocket } from "./hooks/useWebSocket";
import { SessionsList } from "./components/SessionsList";
import { SessionView } from "./components/SessionView";
import { ReviewScreen } from "./components/ReviewScreen";
import { ContactForm } from "./components/ContactForm";
import { QRScreen } from "./components/QRScreen";
import { HostView } from "./components/HostView";

export function App() {
  const screen = useStore((s) => s.screen);
  const loadConfig = useStore((s) => s.loadConfig);
  const [isHost, setIsHost] = useState(false);

  useWebSocket();

  useEffect(() => {
    loadConfig();
    setIsHost(window.location.pathname === "/host");
  }, []);

  if (isHost) {
    return <HostView />;
  }

  return (
    <AnimatePresence mode="wait">
      {screen === "sessions" && <SessionsList key="sessions" />}
      {screen === "session" && <SessionView key="session" />}
      {screen === "review" && <ReviewScreen key="review" />}
      {screen === "contact" && <ContactForm key="contact" />}
      {screen === "qr" && <QRScreen key="qr" />}
    </AnimatePresence>
  );
}
