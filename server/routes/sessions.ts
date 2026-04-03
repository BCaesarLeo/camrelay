import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getActiveEventId } from "./events.js";
import type { Session } from "../../shared/types.js";

// Rotating color palette — vintage, muted tones
const SESSION_COLORS = [
  "#5C4B51", // plum
  "#8CBEB2", // sage
  "#F2EBBF", // cream
  "#F3B562", // amber
  "#F06060", // coral
];

const createSession = db.prepare(`
  INSERT INTO sessions (id, event_id, short_code, name, session_number, color, status)
  VALUES (?, ?, ?, ?, ?, ?, 'active')
`);

const deactivateAll = db.prepare(`
  UPDATE sessions SET status = 'expired' WHERE status = 'active'
`);

const getMaxSessionNumberForEvent = db.prepare(`
  SELECT COALESCE(MAX(session_number), 0) as max_num FROM sessions WHERE event_id = ?
`);

const incrementEventSessionCount = db.prepare(`
  UPDATE events SET session_count = session_count + 1 WHERE id = ?
`);

const getSession = db.prepare(`
  SELECT * FROM sessions WHERE id = ?
`);

const getActiveSession = db.prepare(`
  SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC LIMIT 1
`);

const getSessionsForEvent = db.prepare(`
  SELECT * FROM sessions WHERE event_id = ? ORDER BY created_at DESC
`);

const completeSession = db.prepare(`
  UPDATE sessions SET status = 'complete', completed_at = datetime('now') WHERE id = ?
`);

const updateSessionName = db.prepare(`
  UPDATE sessions SET name = ? WHERE id = ?
`);

const getSelectedCount = db.prepare(`
  SELECT COUNT(*) as count FROM photos WHERE session_id = ? AND selected = 1
`);

const getSessionCover = db.prepare(`
  SELECT id, thumb_path FROM photos WHERE session_id = ? AND status = 'ready' AND thumb_path IS NOT NULL
  ORDER BY created_at ASC LIMIT 1
`);

function pathToUrl(diskPath: string): string {
  const storageIdx = diskPath.indexOf("/storage/");
  if (storageIdx !== -1) return diskPath.substring(storageIdx);
  const parts = diskPath.split("/");
  return `/storage/photos/${parts.slice(-2).join("/")}`;
}

function rowToSession(row: any): Session {
  const cover = getSessionCover.get(row.id) as { id: string; thumb_path: string } | undefined;
  return {
    id: row.id,
    eventId: row.event_id,
    shortCode: row.short_code,
    name: row.name ?? null,
    sessionNumber: row.session_number,
    color: row.color,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    photoCount: row.photo_count,
    selectedCount: row.selected_count,
    coverUrl: cover ? pathToUrl(cover.thumb_path) : null,
  };
}

export async function sessionRoutes(app: FastifyInstance) {
  // List sessions for active event
  app.get("/api/sessions", async () => {
    const eventId = getActiveEventId();
    if (!eventId) return [];
    const rows = getSessionsForEvent.all(eventId) as any[];
    return rows.map(rowToSession);
  });

  // Create new session under the active event
  app.post<{ Body: { name?: string } }>("/api/sessions", async (req, reply) => {
    const eventId = getActiveEventId();
    if (!eventId) {
      return reply.status(400).send({ error: "No active event. Create an event first." });
    }

    const id = nanoid();
    const shortCode = nanoid(6).toUpperCase();
    const name = req.body?.name || null;

    // Session number is per-event
    const { max_num } = getMaxSessionNumberForEvent.get(eventId) as { max_num: number };
    const sessionNumber = max_num + 1;
    const color = SESSION_COLORS[(sessionNumber - 1) % SESSION_COLORS.length];

    deactivateAll.run();
    createSession.run(id, eventId, shortCode, name, sessionNumber, color);
    incrementEventSessionCount.run(eventId);

    const row = getSession.get(id);
    return rowToSession(row);
  });

  // Get session by ID
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      const row = getSession.get(req.params.id);
      if (!row) return reply.status(404).send({ error: "Session not found" });
      return rowToSession(row);
    }
  );

  // Get active session
  app.get("/api/sessions/active", async (_req, reply) => {
    const row = getActiveSession.get();
    if (!row) return reply.status(404).send({ error: "No active session" });
    return rowToSession(row);
  });

  // Update session name
  app.patch<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      const row = getSession.get(req.params.id) as any;
      if (!row) return reply.status(404).send({ error: "Session not found" });

      if (req.body?.name !== undefined) {
        updateSessionName.run(req.body.name, req.params.id);
      }

      const updated = getSession.get(req.params.id);
      return rowToSession(updated);
    }
  );

  // Complete session
  app.patch<{ Params: { id: string } }>(
    "/api/sessions/:id/complete",
    async (req, reply) => {
      const row = getSession.get(req.params.id) as any;
      if (!row) return reply.status(404).send({ error: "Session not found" });

      const { count } = getSelectedCount.get(req.params.id) as {
        count: number;
      };
      db.prepare("UPDATE sessions SET selected_count = ? WHERE id = ?").run(
        count,
        req.params.id
      );

      completeSession.run(req.params.id);

      const updated = getSession.get(req.params.id);
      return rowToSession(updated);
    }
  );
}
