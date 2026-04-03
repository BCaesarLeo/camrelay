import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import type { Event } from "../../shared/types.js";

const createEvent = db.prepare(`
  INSERT INTO events (id, name) VALUES (?, ?)
`);

const getEvent = db.prepare(`
  SELECT * FROM events WHERE id = ?
`);

const getAllEvents = db.prepare(`
  SELECT * FROM events ORDER BY created_at DESC
`);

// Active event = most recent one. To switch, we reorder by updating created_at.
// Simpler: add a separate tracking mechanism.
let activeEventIdOverride: string | null = null;

function rowToEvent(row: any): Event {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    sessionCount: row.session_count,
  };
}

export function getActiveEventId(): string | null {
  if (activeEventIdOverride) {
    // Verify it still exists
    const row = getEvent.get(activeEventIdOverride);
    if (row) return activeEventIdOverride;
    activeEventIdOverride = null;
  }
  // Default to most recent
  const row = getAllEvents.get() as any;
  return row?.id ?? null;
}

export function getActiveEvent(): Event | null {
  const id = getActiveEventId();
  if (!id) return null;
  const row = getEvent.get(id) as any;
  return row ? rowToEvent(row) : null;
}

export async function eventRoutes(app: FastifyInstance) {
  // List all events
  app.get("/api/events", async () => {
    const rows = getAllEvents.all() as any[];
    return rows.map(rowToEvent);
  });

  // Get active event
  app.get("/api/events/active", async (_req, reply) => {
    const event = getActiveEvent();
    if (!event) return reply.status(404).send({ error: "No events" });
    return event;
  });

  // Create new event (becomes active automatically)
  app.post<{ Body: { name: string } }>("/api/events", async (req) => {
    const id = nanoid();
    const name =
      req.body?.name ||
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    // Deactivate all sessions from previous event
    db.prepare("UPDATE sessions SET status = 'expired' WHERE status = 'active'").run();

    createEvent.run(id, name);
    activeEventIdOverride = id;

    const row = getEvent.get(id);
    return rowToEvent(row);
  });

  // Switch active event
  app.post<{ Params: { id: string } }>(
    "/api/events/:id/activate",
    async (req, reply) => {
      const row = getEvent.get(req.params.id) as any;
      if (!row) return reply.status(404).send({ error: "Event not found" });

      // Deactivate all sessions
      db.prepare("UPDATE sessions SET status = 'expired' WHERE status = 'active'").run();

      activeEventIdOverride = req.params.id;
      return rowToEvent(row);
    }
  );
}
