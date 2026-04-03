import { useEffect, useRef } from "react";
import { useStore } from "./useStore";
import type { WSServerMessage } from "../../shared/types";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const session = useStore((s) => s.session);
  const addPhoto = useStore((s) => s.addPhoto);

  useEffect(() => {
    if (!session) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join_session", sessionId: session.id }));
    };

    ws.onmessage = (event) => {
      const msg: WSServerMessage = JSON.parse(event.data);

      if (msg.type === "photo_added") {
        addPhoto(msg.photo);
      }
    };

    ws.onclose = () => {
      // Reconnect after a short delay
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 1000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [session?.id]);
}
