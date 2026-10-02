import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { broadcast } from "../ws/index.js";
import {
  createDetachedSession,
  recountSession,
  getSessionById,
} from "./sessions.js";
import type { Photo } from "../../shared/types.js";

const getPhotos = db.prepare(`
  SELECT * FROM photos WHERE session_id = ? ORDER BY created_at ASC
`);

const getRecentPhoto = db.prepare(`
  SELECT * FROM photos WHERE status = 'ready' AND thumb_path IS NOT NULL
  ORDER BY created_at DESC LIMIT 1
`);

const getPhoto = db.prepare(`
  SELECT * FROM photos WHERE id = ?
`);

const toggleSelect = db.prepare(`
  UPDATE photos SET selected = ? WHERE id = ?
`);

const updateSessionSelectedCount = db.prepare(`
  UPDATE sessions SET selected_count = (
    SELECT COUNT(*) FROM photos WHERE session_id = ? AND selected = 1
  ) WHERE id = ?
`);

function pathToUrl(diskPath: string): string {
  // Convert absolute disk path to URL by finding /storage/ in it
  const storageIdx = diskPath.indexOf("/storage/");
  if (storageIdx !== -1) return diskPath.substring(storageIdx);
  // Fallback: extract just the filename
  const parts = diskPath.split("/");
  return `/storage/photos/${parts.slice(-2).join("/")}`;
}

function rowToPhoto(row: any): Photo {
  return {
    id: row.id,
    sessionId: row.session_id,
    originalFilename: row.original_filename,
    thumbnailUrl: row.thumb_path ? pathToUrl(row.thumb_path) : null,
    fullUrl: row.full_path ? pathToUrl(row.full_path) : null,
    status: row.status,
    selected: row.selected === 1,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export async function photoRoutes(app: FastifyInstance) {
  // List photos for session
  app.get<{ Params: { id: string } }>(
    "/api/sessions/:id/photos",
    async (req) => {
      const rows = getPhotos.all(req.params.id) as any[];
      return rows.map(rowToPhoto);
    }
  );

  // Most recent photo (for welcome screen background)
  app.get("/api/photos/recent", async (_req, reply) => {
    const row = getRecentPhoto.get() as any;
    if (!row) return reply.status(404).send({ error: "No photos yet" });
    return rowToPhoto(row);
  });

  // Toggle photo selection
  app.patch<{ Params: { photoId: string }; Body: { selected: boolean } }>(
    "/api/photos/:photoId/select",
    async (req, reply) => {
      const row = getPhoto.get(req.params.photoId) as any;
      if (!row) return reply.status(404).send({ error: "Photo not found" });

      const selected = req.body.selected ? 1 : 0;
      toggleSelect.run(selected, req.params.photoId);
      updateSessionSelectedCount.run(row.session_id, row.session_id);

      const updated = getPhoto.get(req.params.photoId);
      const photo = rowToPhoto(updated);

      // Broadcast selection change
      broadcast(row.session_id, {
        type: "photo_added",
        photo,
      });

      return photo;
    }
  );

  // Regroup ("Not us") — move photos to another session, or split them into a new group.
  // Delivery is keyed on photo ids, so moving a photo never affects what was already sent.
  app.post<{
    Body: { photoIds: string[]; targetSessionId?: string; newGroup?: boolean };
  }>("/api/photos/move", async (req, reply) => {
    const { photoIds, targetSessionId, newGroup } = req.body ?? ({} as any);
    if (
      !Array.isArray(photoIds) ||
      photoIds.length === 0 ||
      photoIds.length > 500 ||
      !photoIds.every((id) => typeof id === "string")
    ) {
      return reply.status(400).send({ error: "photoIds required" });
    }
    if (!targetSessionId && !newGroup) {
      return reply.status(400).send({ error: "targetSessionId or newGroup required" });
    }

    const ids = [...new Set(photoIds)];
    const rows = db
      .prepare(
        `SELECT p.id, p.session_id, p.created_at, s.event_id, s.session_number
         FROM photos p JOIN sessions s ON p.session_id = s.id
         WHERE p.id IN (${ids.map(() => "?").join(",")})
         ORDER BY p.created_at ASC`
      )
      .all(...ids) as {
      id: string;
      session_id: string;
      created_at: string;
      event_id: string;
      session_number: number;
    }[];
    if (rows.length !== ids.length) {
      return reply.status(404).send({ error: "Photo not found" });
    }
    if (targetSessionId && !getSessionById(targetSessionId)) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const sourceIds = [...new Set(rows.map((r) => r.session_id))];
    let targetId = targetSessionId ?? "";

    db.transaction(() => {
      if (!targetSessionId) {
        // Dated at its earliest photo so the new group sorts next to the one it came from
        targetId = createDetachedSession(rows[0].event_id, {
          splitFrom: rows[0].session_number,
          createdAt: rows[0].created_at,
        });
      }
      const move = db.prepare("UPDATE photos SET session_id = ? WHERE id = ?");
      for (const r of rows) {
        if (r.session_id !== targetId) move.run(targetId, r.id);
      }
      for (const id of new Set([...sourceIds, targetId])) recountSession(id);
    })();

    for (const id of new Set([...sourceIds, targetId])) {
      broadcast(id, { type: "photos_moved", photoIds: ids, toSessionId: targetId });
    }

    return {
      target: getSessionById(targetId),
      sources: sourceIds.filter((id) => id !== targetId).map(getSessionById),
    };
  });
}
