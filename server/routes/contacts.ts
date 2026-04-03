import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getActiveEventId } from "./events.js";

const insertContact = db.prepare(`
  INSERT INTO contacts (id, session_id, event_id, name, email, phone, selected_photo_ids, download_token)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getContactsForEvent = db.prepare(`
  SELECT * FROM contacts WHERE event_id = ? ORDER BY created_at DESC
`);

export async function contactRoutes(app: FastifyInstance) {
  // Save contact info and generate download link
  app.post<{
    Body: {
      sessionId: string;
      name: string;
      email?: string;
      phone?: string;
      downloadToken: string;
      selectedPhotoIds: string[];
    };
  }>("/api/contacts", async (req) => {
    const eventId = getActiveEventId() || "";
    const id = nanoid();
    const { sessionId, name, email, phone, downloadToken, selectedPhotoIds } =
      req.body;

    insertContact.run(
      id,
      sessionId,
      eventId,
      name,
      email || null,
      phone || null,
      JSON.stringify(selectedPhotoIds),
      downloadToken
    );

    return { id, name, email, phone };
  });

  // List contacts for current event (admin)
  app.get("/api/contacts", async () => {
    const eventId = getActiveEventId();
    if (!eventId) return [];
    const rows = getContactsForEvent.all(eventId) as any[];
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      selectedPhotoIds: JSON.parse(r.selected_photo_ids || "[]"),
      downloadToken: r.download_token,
      createdAt: r.created_at,
      synced: r.synced === 1,
    }));
  });
}
