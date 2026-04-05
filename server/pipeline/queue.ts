import PQueue from "p-queue";
import { nanoid } from "nanoid";
import { convertPhoto, isSupportedImage } from "./convert.js";
import { config } from "../config.js";
import { db } from "../db.js";
import { broadcast } from "../ws/index.js";
import path from "path";
import type { Photo } from "../../shared/types.js";

const queue = new PQueue({ concurrency: config.processingConcurrency });

const insertPhoto = db.prepare(`
  INSERT INTO photos (id, session_id, original_filename, original_path, status, selected)
  VALUES (?, ?, ?, ?, 'processing', 1)
`);

const updatePhotoReady = db.prepare(`
  UPDATE photos SET full_path = ?, thumb_path = ?, status = 'ready',
    width = ?, height = ?, file_size = ?
  WHERE id = ?
`);

const updatePhotoError = db.prepare(`
  UPDATE photos SET status = 'error', error_message = ? WHERE id = ?
`);

const incrementPhotoCount = db.prepare(`
  UPDATE sessions SET photo_count = photo_count + 1 WHERE id = ?
`);

const getActiveSession = db.prepare(`
  SELECT s.id, s.session_number, s.event_id, e.id as eid
  FROM sessions s JOIN events e ON s.event_id = e.id
  WHERE s.status = 'active' ORDER BY s.created_at DESC LIMIT 1
`);

export function getActiveSessionId(): string | null {
  const row = getActiveSession.get() as { id: string } | undefined;
  return row?.id ?? null;
}

function getActiveSessionInfo(): { sessionNumber: number; eventId: string } | null {
  const row = getActiveSession.get() as { session_number: number; event_id: string } | undefined;
  if (!row) return null;
  return { sessionNumber: row.session_number, eventId: row.event_id };
}

export function enqueuePhoto(filePath: string) {
  if (!isSupportedImage(filePath)) return;

  const sessionId = getActiveSessionId();
  if (!sessionId) {
    console.log(`No active session, skipping: ${path.basename(filePath)}`);
    return;
  }

  const photoId = nanoid();
  const filename = path.basename(filePath);

  // Insert photo record immediately
  insertPhoto.run(photoId, sessionId, filename, filePath);
  incrementPhotoCount.run(sessionId);
  // All photos start selected
  db.prepare("UPDATE sessions SET selected_count = selected_count + 1 WHERE id = ?").run(sessionId);

  // Broadcast processing state
  broadcast(sessionId, {
    type: "photo_processing",
    filename,
  });

  const info = getActiveSessionInfo();
  const sessionFolder = info
    ? `${info.eventId}/${String(info.sessionNumber).padStart(2, "0")}`
    : String(0).padStart(2, "0");

  // Queue the conversion
  queue.add(async () => {
    try {
      const result = await convertPhoto(filePath, photoId, sessionFolder);

      updatePhotoReady.run(
        result.fullPath,
        result.thumbPath,
        result.width,
        result.height,
        result.fileSize,
        photoId
      );

      const photo: Photo = {
        id: photoId,
        sessionId,
        originalFilename: filename,
        thumbnailUrl: `/storage/sessions/${sessionFolder}/thumb/${photoId}.jpg`,
        fullUrl: `/storage/sessions/${sessionFolder}/full/${photoId}.jpg`,
        status: "ready",
        selected: true,
        width: result.width,
        height: result.height,
        createdAt: new Date().toISOString(),
      };

      broadcast(sessionId, { type: "photo_added", photo });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to convert ${filename}:`, message);
      updatePhotoError.run(message, photoId);
      broadcast(sessionId, {
        type: "photo_error",
        filename,
        error: message,
      });
    }
  });
}

export { queue };
