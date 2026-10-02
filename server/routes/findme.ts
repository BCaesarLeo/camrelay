import type { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs/promises";
import { db } from "../db.js";
import { config } from "../config.js";
import { convertPhoto } from "../pipeline/convert.js";
import { getActiveEventId } from "./events.js";
import { getSessionById } from "./sessions.js";
import type { PendingGuest } from "../../shared/types.js";

// "Find my photos": guests who were photographed but never got their photos
// through the normal flow leave an email and a quick photo of themselves on the
// kiosk. They wait here until staff pick out their photos on the Host page; that
// creates a normal contact, so the usual cloud sync sends them.

interface FindMeRequest {
  id: string;
  email: string;
  name?: string;
  // JPEG as base64 or a data URL. Optional — the guest may skip the photo.
  photo?: string;
}

const SAFE_ID = /^[A-Za-z0-9_-]{6,64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUGGESTIONS = 5;

const insertGuest = db.prepare(`
  INSERT INTO pending_guests (id, event_id, email, name, selfie_full_path, selfie_thumb_path, created_at)
  VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
`);

const getGuest = db.prepare(`SELECT * FROM pending_guests WHERE id = ?`);

const getWaitingGuests = db.prepare(`
  SELECT * FROM pending_guests WHERE event_id = ? AND status = 'waiting' ORDER BY created_at ASC
`);

const countMatched = db.prepare(`
  SELECT COUNT(*) as count FROM pending_guests WHERE event_id = ? AND status = 'matched'
`);

// When each session was last shot — the guest logged their email some time after that
const getSessionTimes = db.prepare(`
  SELECT s.id, COALESCE((SELECT MAX(created_at) FROM photos WHERE session_id = s.id), s.created_at) AS last_shot
  FROM sessions s
  WHERE s.event_id = ? AND s.photo_count > 0
`);

const insertContact = db.prepare(`
  INSERT INTO contacts (id, session_id, event_id, name, email, selected_photo_ids)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const setGuestStatus = db.prepare(`
  UPDATE pending_guests SET status = ?, matched_session_id = ? WHERE id = ?
`);

function sqliteTimeMs(value: string): number {
  return new Date(value.replace(" ", "T") + "Z").getTime();
}

function pathToUrl(diskPath: string | null): string | null {
  if (!diskPath) return null;
  const idx = diskPath.indexOf("/storage/");
  return idx !== -1 ? diskPath.substring(idx) : null;
}

function rowToGuest(row: any): PendingGuest {
  // Sessions shot closest to when the guest logged their email come first
  const guestTime = sqliteTimeMs(row.created_at);
  const times = getSessionTimes.all(row.event_id) as { id: string; last_shot: string }[];
  const suggestions = times
    .map((t) => ({ id: t.id, distance: Math.abs(guestTime - sqliteTimeMs(t.last_shot)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SUGGESTIONS)
    .map((t) => getSessionById(t.id)!)
    .filter(Boolean);

  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    createdAt: row.created_at,
    selfieUrl: pathToUrl(row.selfie_full_path),
    selfieThumbUrl: pathToUrl(row.selfie_thumb_path),
    suggestions,
  };
}

export async function findMeRoutes(app: FastifyInstance) {
  // A guest asks us to find their photos
  app.post<{ Body: FindMeRequest }>(
    "/api/find-me",
    { bodyLimit: 16 * 1024 * 1024 },
    async (req, reply) => {
      const ask = req.body;
      if (!ask || typeof ask.id !== "string" || !SAFE_ID.test(ask.id)) {
        return reply.status(400).send({ error: "Invalid id" });
      }
      const email = typeof ask.email === "string" ? ask.email.trim() : "";
      if (!EMAIL.test(email)) {
        return reply.status(400).send({ error: "Invalid email" });
      }

      // A retried request must never list the same guest twice
      if (getGuest.get(ask.id)) {
        return { ok: true, duplicate: true };
      }

      const eventId = getActiveEventId();
      if (!eventId) {
        return reply
          .status(409)
          .send({ error: "No active event. Create an event on the host page first." });
      }

      // The photo is a help, not a requirement — a guest with only an email is still kept
      let fullPath: string | null = null;
      let thumbPath: string | null = null;
      const snap = ask.photo;
      if (typeof snap === "string" && snap.length > 0) {
        const base64 = snap.includes(",") ? snap.slice(snap.indexOf(",") + 1) : snap;
        const originalsDir = path.join(config.storagePath, "find-me");
        const originalPath = path.join(originalsDir, `${ask.id}.jpg`);
        try {
          await fs.mkdir(originalsDir, { recursive: true });
          await fs.writeFile(originalPath, Buffer.from(base64, "base64"));
          const result = await convertPhoto(originalPath, ask.id, `${eventId}/guests`);
          fullPath = result.fullPath;
          thumbPath = result.thumbPath;
        } catch (err) {
          await fs.rm(originalPath, { force: true });
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[find-me] Unreadable photo for ${ask.id} (keeping the email):`, message);
        }
      }

      insertGuest.run(
        ask.id,
        eventId,
        email,
        ask.name?.trim() || null,
        fullPath,
        thumbPath,
        null
      );
      console.log(`[find-me] Logged guest ${email} — waiting to be matched to a session`);

      return { ok: true, duplicate: false };
    }
  );

  // Guests waiting to be matched, each with the sessions shot nearest in time
  app.get("/api/find-me/guests", async () => {
    const eventId = getActiveEventId();
    if (!eventId) return { waiting: [], matchedCount: 0 };
    const rows = getWaitingGuests.all(eventId) as any[];
    const { count } = countMatched.get(eventId) as { count: number };
    return { waiting: rows.map(rowToGuest), matchedCount: count };
  });

  // Staff picked this guest's photos — possibly from several sessions, and not
  // necessarily every photo in them. One contact, so the guest gets a single email.
  app.post<{ Params: { id: string }; Body: { photoIds: string[] } }>(
    "/api/find-me/guests/:id/match",
    async (req, reply) => {
      const guest = getGuest.get(req.params.id) as any;
      if (!guest) return reply.status(404).send({ error: "Guest not found" });
      if (guest.status !== "waiting") {
        return reply.status(409).send({ error: "This guest was already handled" });
      }

      const photoIds = [...new Set(req.body?.photoIds ?? [])];
      if (photoIds.length === 0 || photoIds.length > 500 || !photoIds.every((id) => typeof id === "string")) {
        return reply.status(400).send({ error: "Pick at least one photo" });
      }
      const photos = db
        .prepare(
          `SELECT p.id, p.session_id, s.session_number
           FROM photos p JOIN sessions s ON p.session_id = s.id
           WHERE p.status = 'ready' AND s.event_id = ? AND p.id IN (${photoIds.map(() => "?").join(",")})
           ORDER BY p.created_at ASC`
        )
        .all(guest.event_id, ...photoIds) as { id: string; session_id: string; session_number: number }[];
      if (photos.length !== photoIds.length) {
        return reply.status(400).send({ error: "Some of those photos are no longer available" });
      }

      db.transaction(() => {
        insertContact.run(
          `fb_${guest.id}`,
          photos[0].session_id,
          guest.event_id,
          guest.name || "there", // emails open with "Hi {name}"
          guest.email,
          JSON.stringify(photos.map((p) => p.id))
        );
        setGuestStatus.run("matched", photos[0].session_id, guest.id);
      })();

      const sessionNumbers = [...new Set(photos.map((p) => p.session_number))];
      console.log(
        `[find-me] Matched ${guest.email}: ${photos.length} photos from session(s) ${sessionNumbers.join(", ")} queued`
      );
      return { ok: true, sessionNumbers, photoCount: photos.length };
    }
  );

  // Not a real guest (test entry, duplicate email, …) — take them off the list
  app.post<{ Params: { id: string } }>("/api/find-me/guests/:id/dismiss", async (req, reply) => {
    const guest = getGuest.get(req.params.id) as any;
    if (!guest) return reply.status(404).send({ error: "Guest not found" });
    if (guest.status !== "waiting") {
      return reply.status(409).send({ error: "This guest was already handled" });
    }
    setGuestStatus.run("dismissed", null, guest.id);
    return { ok: true };
  });
}
