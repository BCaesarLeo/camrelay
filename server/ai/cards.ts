// AI "Halloween card": one themed collectible card per session, drawn by Gemini from a
// photo the guest chose. Everything here runs in its own queue and can only ever produce
// a photo row that is 'ready' or 'error' — the normal photo flow never waits on it, and
// delivery sends without the card if it fails or takes too long (see delivery/cloud.ts).
import PQueue from "p-queue";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { config } from "../config.js";
import { broadcast } from "../ws/index.js";
import type { Photo } from "../../shared/types.js";
import { isOnline } from "../delivery/index.js";

const MODEL = "gemini-3-pro-image";
const REQUEST_TIMEOUT_MS = 75_000; // one attempt; cards normally take 16–20 s
const STALE_JOB_MS = 3 * 60_000; // a card nobody is waiting for any more is skipped
const BREAKER_FAILURES = 5; // consecutive failures before we stop trying for a while
const BREAKER_PAUSE_MS = 10 * 60_000;
const DAILY_CAP = 400; // ~$55 at $0.134/card — a runaway loop can't cost more than this

const ASSETS = path.join(process.cwd(), "assets", "ai-cards");
const CREST = path.join(ASSETS, "ancc-crest.png");

// Same prompt the sample cards were made with, minus the family name banner
const THEME = {
  colors: "deep navy blue (#093C6D) and antique gold (#D4BA81)",
  scene:
    "a festive Halloween evening on the lawn in front of a stately brick country-club clubhouse " +
    "with white columns, glowing carved jack-o'-lanterns on the steps, warm string lights, drifting " +
    "autumn leaves, a big full moon and a few friendly cartoon bats and ghosts. Cheerful and " +
    "family-friendly, never scary or gory.",
  wardrobe:
    "dress each person in a fun, tasteful Halloween costume that suits them (for example a pirate, " +
    "witch, astronaut, superhero, pumpkin, cat, or vampire), with no masks so faces stay clearly visible",
  style: "a polished 3D animated-movie look (Pixar / Disney style), soft studio lighting, expressive but faithful faces",
};

const COSTUME_SETS = [
  "classic Halloween: witches, vampires and a friendly skeleton",
  "space: astronauts and a little green alien",
  "superheroes with capes and emblems",
  "a royal court: king, queen, knight and princess",
  "fairy-tale: wizard, fairy, dragon and a unicorn",
  "pirates and a sea captain",
  "farm Halloween: scarecrow, pumpkin and a black cat",
  "retro: 1920s detectives and flappers",
];

function buildPrompt(eventText: string, costumeSet: string): string {
  return (
    "Create a premium collectible trading card illustration, portrait orientation.\n\n" +
    "SUBJECTS: First count the people in the attached photo (ignore any costumed mascot character). " +
    "The card MUST show exactly that many people, every one of them, in the same left-to-right order and " +
    "similar poses, adults and children alike. Do not leave anyone out and do not add anyone. Keep each " +
    "person's face, hairstyle, skin tone, age, glasses, facial hair and expression clearly recognisable so each " +
    `of them can say 'that's me'. Render them in ${THEME.style}. ` +
    `Then ${THEME.wardrobe} — for this card use the costume theme: ${costumeSet}.\n\n` +
    "Ignore the photo's original backdrop, props and any costumed mascot; replace them completely with " +
    `this scene: ${THEME.scene}\n\n` +
    `CARD DESIGN: Frame the artwork as a trading card with a border in ${THEME.colors}, with fine gold ` +
    "pinstripe trim and subtle foil texture. Place the attached club crest small at the top centre of the " +
    "border, reproduced exactly as supplied. Across the bottom of the card put a gold banner with the text " +
    `"${eventText}" in elegant serif capitals. The text must be spelled exactly as written, crisp and ` +
    "perfectly legible, and there must be no other text or names anywhere on the card.\n\n" +
    "The card fills the whole image edge to edge with no margin around it."
  );
}

// ---- settings (host page switch) ---------------------------------------------------------------

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const putSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

export function cardsEnabled(): boolean {
  const row = getSetting.get("ai_cards_enabled") as { value: string } | undefined;
  return row?.value === "1";
}

export function cardText(): string {
  const row = getSetting.get("ai_cards_text") as { value: string } | undefined;
  return row?.value?.trim() || "ANCC HALLOWEEN 2026";
}

export function updateCardSettings(opts: { enabled?: boolean; text?: string }) {
  if (opts.enabled !== undefined) putSetting.run("ai_cards_enabled", opts.enabled ? "1" : "0");
  if (opts.text !== undefined) putSetting.run("ai_cards_text", opts.text.trim().slice(0, 60));
}

export function cardsConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY && fs.existsSync(CREST);
}

// ---- health / circuit breaker ------------------------------------------------------------------

const stats = { drawn: 0, failed: 0, consecutiveFailures: 0, pausedUntil: 0, lastError: null as string | null, day: "" , today: 0 };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function countToday() {
  if (stats.day !== todayKey()) {
    stats.day = todayKey();
    stats.today = 0;
  }
  return stats.today;
}

// Available = the guest should be offered a card right now
export function cardsAvailable(): boolean {
  return cardsEnabled() && cardsConfigured() && isOnline() && Date.now() >= stats.pausedUntil && countToday() < DAILY_CAP;
}

export function cardStats() {
  return {
    enabled: cardsEnabled(),
    configured: cardsConfigured(),
    available: cardsAvailable(),
    text: cardText(),
    drawn: stats.drawn,
    failed: stats.failed,
    today: countToday(),
    dailyCap: DAILY_CAP,
    pausedUntil: stats.pausedUntil > Date.now() ? new Date(stats.pausedUntil).toISOString() : null,
    lastError: stats.lastError,
    queued: queue.size + queue.pending,
  };
}

// ---- queue ------------------------------------------------------------------------------------

const queue = new PQueue({ concurrency: 1 });

const insertCard = db.prepare(`
  INSERT INTO photos (id, session_id, original_filename, original_path, status, selected, kind, source_photo_id)
  VALUES (?, ?, ?, ?, 'processing', 1, 'card', ?)
`);
const markReady = db.prepare(`
  UPDATE photos SET full_path = ?, thumb_path = ?, status = 'ready', width = ?, height = ?, file_size = ?
  WHERE id = ?
`);
const markError = db.prepare("UPDATE photos SET status = 'error', error_message = ? WHERE id = ?");
const getPhoto = db.prepare("SELECT * FROM photos WHERE id = ?");
const getSession = db.prepare("SELECT * FROM sessions WHERE id = ?");
const existingCard = db.prepare(
  "SELECT * FROM photos WHERE session_id = ? AND kind = 'card' AND status IN ('processing', 'ready') LIMIT 1"
);
const recountSession = db.prepare(`
  UPDATE sessions SET
    photo_count = (SELECT COUNT(*) FROM photos WHERE session_id = sessions.id),
    selected_count = (SELECT COUNT(*) FROM photos WHERE session_id = sessions.id AND selected = 1)
  WHERE id = ?
`);

function toUrl(diskPath: string): string {
  const i = diskPath.indexOf("/storage/");
  return i !== -1 ? diskPath.substring(i) : diskPath;
}

function rowToPhoto(row: any): Photo {
  return {
    id: row.id,
    sessionId: row.session_id,
    originalFilename: row.original_filename,
    thumbnailUrl: row.thumb_path ? toUrl(row.thumb_path) : null,
    fullUrl: row.full_path ? toUrl(row.full_path) : null,
    status: row.status,
    selected: row.selected === 1,
    kind: "card",
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export type RequestResult =
  | { ok: true; photo: Photo }
  | { ok: false; status: number; error: string };

// Called when the guest taps "Yes, draw our card". Returns at once; the card arrives
// over the session's websocket as a photo_added message (status ready or error).
export function requestCard(sessionId: string, sourcePhotoId: string): RequestResult {
  if (!cardsAvailable()) return { ok: false, status: 503, error: "Cards are not available right now" };

  const session = getSession.get(sessionId) as any;
  if (!session) return { ok: false, status: 404, error: "Session not found" };
  const source = getPhoto.get(sourcePhotoId) as any;
  if (!source || source.session_id !== sessionId) return { ok: false, status: 404, error: "Photo not found" };
  if (source.kind === "card") return { ok: false, status: 400, error: "Pick one of your photos" };
  if (source.status !== "ready" || !source.full_path) return { ok: false, status: 409, error: "That photo is still processing" };

  // One card per session — a second tap just returns the one in progress
  const existing = existingCard.get(sessionId) as any;
  if (existing) return { ok: true, photo: rowToPhoto(existing) };

  const id = nanoid();
  insertCard.run(id, sessionId, "halloween-card.jpg", source.full_path, source.id);
  recountSession.run(sessionId);
  const row = getPhoto.get(id) as any;
  const photo = rowToPhoto(row);
  broadcast(sessionId, { type: "photo_added", photo });

  const queuedAt = Date.now();
  const folder = `${session.event_id}/${String(session.session_number).padStart(2, "0")}`;
  queue.add(() => runJob(id, sessionId, source.full_path, folder, queuedAt)).catch((err) => {
    console.error("[cards] queue error:", err);
  });
  console.log(`[cards] Queued card ${id} for session ${session.session_number} (${queue.size + queue.pending} in queue)`);

  return { ok: true, photo };
}

async function runJob(id: string, sessionId: string, sourcePath: string, folder: string, queuedAt: number) {
  const fail = (msg: string) => {
    markError.run(msg.slice(0, 300), id);
    const row = getPhoto.get(id) as any;
    if (row) broadcast(sessionId, { type: "photo_added", photo: rowToPhoto(row) });
    console.error(`[cards] Card ${id} failed: ${msg.slice(0, 200)}`);
  };

  if (Date.now() - queuedAt > STALE_JOB_MS) return fail("Skipped: waited too long in the queue");
  if (Date.now() < stats.pausedUntil) return fail("Paused after repeated failures");

  try {
    const t0 = Date.now();
    const png = await drawCard(sourcePath, cardText(), id);
    const paths = await storeCard(png, id, folder);
    markReady.run(paths.fullPath, paths.thumbPath, paths.width, paths.height, paths.fileSize, id);
    stats.drawn++;
    stats.today = countToday() + 1;
    stats.consecutiveFailures = 0;
    const row = getPhoto.get(id) as any;
    broadcast(sessionId, { type: "photo_added", photo: rowToPhoto(row) });
    console.log(`[cards] Card ${id} ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.failed++;
    stats.lastError = `${new Date().toLocaleTimeString()} ${msg.slice(0, 160)}`;
    stats.consecutiveFailures++;
    if (stats.consecutiveFailures >= BREAKER_FAILURES) {
      stats.pausedUntil = Date.now() + BREAKER_PAUSE_MS;
      stats.consecutiveFailures = 0;
      console.error(`[cards] ${BREAKER_FAILURES} failures in a row — pausing cards for ${BREAKER_PAUSE_MS / 60000} min`);
    }
    fail(msg);
  }
}

// ---- Gemini call ------------------------------------------------------------------------------

async function drawCard(sourcePath: string, eventText: string, id: string): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  // Costume theme rotates by card id so a row of cards isn't all pirates
  const costume = COSTUME_SETS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COSTUME_SETS.length];

  // A 1600px copy is plenty for likeness and keeps the request small
  const photo = await sharp(sourcePath).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  const crest = fs.readFileSync(CREST);

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: buildPrompt(eventText, costume) },
          { inlineData: { mimeType: "image/jpeg", data: photo.toString("base64") } },
          { text: "Club crest to reproduce on the card:" },
          { inlineData: { mimeType: "image/png", data: crest.toString("base64") } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "2:3", imageSize: "1K" },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(controller.signal.aborted ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : `Network: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Gemini HTTP ${res.status}: ${text}`);
  }
  const json: any = await res.json();
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data);
  if (!img) {
    const reason = json?.candidates?.[0]?.finishReason || json?.promptFeedback?.blockReason || "no image in response";
    throw new Error(`Gemini returned no image (${reason})`);
  }
  return Buffer.from(img.inlineData.data, "base64");
}

async function storeCard(image: Buffer, id: string, folder: string) {
  const base = path.join(config.storagePath, "sessions", folder);
  const fullDir = path.join(base, "full");
  const thumbDir = path.join(base, "thumb");
  await fs.promises.mkdir(fullDir, { recursive: true });
  await fs.promises.mkdir(thumbDir, { recursive: true });
  const fullPath = path.join(fullDir, `${id}.jpg`);
  const thumbPath = path.join(thumbDir, `${id}.jpg`);

  await sharp(image).jpeg({ quality: 92, progressive: true }).toFile(fullPath);
  await sharp(fullPath).resize(config.thumbWidth, null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumbPath);
  const meta = await sharp(fullPath).metadata();
  const stat = await fs.promises.stat(fullPath);
  return { fullPath, thumbPath, width: meta.width ?? null, height: meta.height ?? null, fileSize: stat.size };
}

// A card left 'processing' by a restart would otherwise hold up that guest's delivery
export function failOrphanedCards() {
  const rows = db.prepare("SELECT id, session_id FROM photos WHERE kind = 'card' AND status = 'processing'").all() as any[];
  for (const r of rows) markError.run("Kiosk restarted while the card was being drawn", r.id);
  if (rows.length) console.log(`[cards] Marked ${rows.length} unfinished card(s) from before the restart as failed`);
}
