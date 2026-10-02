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
import { kickCloudSync } from "../delivery/cloud.js";

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
      contacts: getDeliveryStatus(getActiveEventId()),
    };
  });

  // "Send now" — retry everything that hasn't gone out, without waiting for the backoff
  app.post("/api/delivery/retry-all", async () => {
    const { changes } = db
      .prepare("UPDATE contacts SET attempts = 0, last_attempt_at = NULL WHERE synced = 0")
      .run();
    kickCloudSync();
    return { ok: true, queued: changes, online: isOnline() };
  });

  // Fix a mistyped address and/or retry one contact
  app.post<{ Params: { id: string }; Body: { email?: string; phone?: string } }>(
    "/api/delivery/:id/retry",
    async (req, reply) => {
      const contact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id) as any;
      if (!contact) return reply.status(404).send({ error: "Contact not found" });

      const email = req.body?.email !== undefined ? req.body.email.trim() || null : contact.email;
      const phone = req.body?.phone !== undefined ? req.body.phone.trim() || null : contact.phone;
      if (!email && !phone) return reply.status(400).send({ error: "Email or phone required" });

      // A changed address has to be sent again even if the old one "succeeded"
      const emailSent = email === contact.email ? contact.email_sent : 0;
      const smsSent = phone === contact.phone ? contact.sms_sent : 0;
      const done = (!email || emailSent) && (!phone || smsSent);

      db.prepare(
        `UPDATE contacts SET email = ?, phone = ?, email_sent = ?, sms_sent = ?, email_error = NULL,
           sms_error = NULL, delivery_error = NULL, attempts = 0, last_attempt_at = NULL, synced = ?
         WHERE id = ?`
      ).run(email, phone, emailSent, smsSent, done ? 1 : 0, contact.id);

      kickCloudSync();
      return { ok: true, online: isOnline() };
    }
  );

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
