import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { getActiveEventId } from "./events.js";
import {
  sendSMS,
  isOnline,
  getDeliveryStatus,
  markLocalDownload,
} from "../delivery/index.js";

const insertContact = db.prepare(`
  INSERT INTO contacts (id, session_id, event_id, name, email, phone, selected_photo_ids, download_token)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export async function contactRoutes(app: FastifyInstance) {
  // Save contact info, trigger SMS if online
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

    // SMS + email are sent by cloud.ts AFTER photos upload to S3
    // This ensures the link in the message works permanently

    return { id, name, email, phone };
  });

  // Delivery status for admin panel
  app.get("/api/delivery", async () => {
    return {
      online: isOnline(),
      contacts: getDeliveryStatus(),
    };
  });

  // Retry SMS for a specific contact
  app.post<{ Params: { id: string } }>(
    "/api/delivery/:id/retry-sms",
    async (req, reply) => {
      const contact = db
        .prepare("SELECT * FROM contacts WHERE id = ?")
        .get(req.params.id) as any;
      if (!contact)
        return reply.status(404).send({ error: "Contact not found" });
      if (!contact.phone)
        return reply.status(400).send({ error: "No phone number" });

      const photoIds = JSON.parse(contact.selected_photo_ids || "[]");
      const success = await sendSMS(
        contact.id,
        contact.phone,
        contact.name,
        contact.download_token,
        photoIds.length
      );

      return { success };
    }
  );
}
