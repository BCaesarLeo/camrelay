import { useEffect } from "react";
import { useStore } from "./useStore";
import type { WSServerMessage } from "../../shared/types";

export function useWebSocket() {
  const session = useStore((s) => s.session);
  const addPhoto = useStore((s) => s.addPhoto);

  useEffect(() => {
    if (!session) return;

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let closed = false;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "join_session", sessionId: session.id }));
        // Catch up on anything that arrived while the socket was down
        if (attempts > 0) useStore.getState().loadPhotos();
        attempts = 0;
      };

      ws.onmessage = (event) => {
        const msg: WSServerMessage = JSON.parse(event.data);

        if (msg.type === "photo_added") {
          addPhoto(msg.photo);
        }

        // Another screen regrouped photos in or out of this session
        if (msg.type === "photos_moved") {
          useStore.getState().loadPhotos();
        }
      };

      ws.onclose = () => {
        if (closed) return;
        // Reconnect with backoff (1s, 2s, 4s, capped at 5s) so a WiFi blip
        // doesn't leave this screen frozen on stale photos
        attempts++;
        retry = setTimeout(connect, Math.min(5000, 1000 * 2 ** (attempts - 1)));
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [session?.id]);
}
