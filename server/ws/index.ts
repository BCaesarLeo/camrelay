import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { WSClientMessage, WSServerMessage } from "../../shared/types.js";

const sessionSockets = new Map<string, Set<WebSocket>>();

export function broadcast(sessionId: string, message: WSServerMessage) {
  const sockets = sessionSockets.get(sessionId);
  if (!sockets) return;

  const data = JSON.stringify(message);
  for (const ws of sockets) {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      ws.send(data);
    }
  }
}

export function broadcastAll(message: WSServerMessage) {
  const data = JSON.stringify(message);
  for (const sockets of sessionSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
}

export async function registerWebSocket(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    const ws = socket as unknown as WebSocket;
    let currentSessionId: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg: WSClientMessage = JSON.parse(String(raw));

        if (msg.type === "join_session") {
          // Leave previous session
          if (currentSessionId) {
            sessionSockets.get(currentSessionId)?.delete(ws);
          }

          // Join new session
          currentSessionId = msg.sessionId;
          if (!sessionSockets.has(currentSessionId)) {
            sessionSockets.set(currentSessionId, new Set());
          }
          sessionSockets.get(currentSessionId)!.add(ws);
        }
      } catch {
        // Ignore invalid messages
      }
    });

    ws.on("close", () => {
      if (currentSessionId) {
        sessionSockets.get(currentSessionId)?.delete(ws);
        const sockets = sessionSockets.get(currentSessionId);
        if (sockets?.size === 0) {
          sessionSockets.delete(currentSessionId);
        }
      }
    });
  });
}
