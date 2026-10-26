#!/usr/bin/env node
// Export one event from the kiosk database to a StudioRelay Gallery data file
// (~/dev/studiorelay-gallery/public/events/<Slug>.json).
//
// Photos the kiosk already delivered live in S3 under delivery/<event>/<contact>/<photo>.jpg and
// are reused as they are. Photos no contact received (sessions without a contact) are uploaded to
// delivery/<event>/session-<NNN>/<photo>.jpg. Every photo gets a 600px thumbnail under thumbs/…
// unless one is there already, so the script is safe to run again after more sessions.
//
// Run with Node 20 from ~/dev/cam:
//   node scripts/export-gallery.mjs --event <eventId> --slug ANCCHalloween2026 \
//     --out ../studiorelay-gallery/public/events/ANCCHalloween2026.json \
//     --tabs "11:00 – 1:00=13,1:00 – 3:00=15,3:00 – 6:00=24"
//
// --tabs groups sessions by LOCAL start hour: "<label>=<first hour that is NOT in this tab>".
// --full-host cdn|s3 picks where the gallery's full-size links point (default s3, which allows
// the in-browser zip download; CloudFront serves the thumbnails).
import Database from "better-sqlite3";
import sharp from "sharp";
import fs from "fs";
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "studiorelay-photos";
const CDN = "https://d2kzchvzabp5a9.cloudfront.net";
const S3_BASE = `https://${BUCKET}.s3.amazonaws.com`;
const TZ = "America/New_York";
const THUMB_WIDTH = 600;
const THUMB_QUALITY = 70;
const CONCURRENCY = 6;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"]);
    return acc;
  }, [])
);
const EVENT_ID = args.event;
const OUT = args.out;
const DB_PATH = args.db ?? new URL("../storage/cam.db", import.meta.url).pathname;
const FULL_BASE = args["full-host"] === "cdn" ? CDN : S3_BASE;
if (!EVENT_ID || !OUT) {
  console.error("usage: export-gallery.mjs --event <eventId> --out <file.json> [--tabs ...] [--full-host cdn|s3]");
  process.exit(1);
}
const TABS = (args.tabs ?? "All sessions=24").split(",").map((t, i) => {
  const [label, until] = t.split("=");
  return { key: `t${i + 1}`, name: label.trim(), until: Number(until ?? 24) };
});

const db = new Database(DB_PATH, { readonly: true });
const s3 = new S3Client({ region: "us-east-1" });

const event = db.prepare("SELECT id, name FROM events WHERE id = ?").get(EVENT_ID);
if (!event) {
  console.error(`No event ${EVENT_ID}`);
  process.exit(1);
}
console.log(`Exporting "${event.name}"`);

// ── What is in S3 already ───────────────────────────────────────────────────
async function listKeys(prefix) {
  const keys = [];
  let ContinuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken }));
    for (const o of res.Contents ?? []) keys.push(o.Key);
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

const fullKeyById = new Map(); // photo id -> delivery key
for (const key of await listKeys(`delivery/${EVENT_ID}/`)) {
  if (!key.endsWith(".jpg")) continue;
  const id = key.split("/").pop().replace(/\.jpg$/, "");
  if (!fullKeyById.has(id)) fullKeyById.set(id, key);
}
const thumbKeys = new Set(await listKeys(`thumbs/${EVENT_ID}/`));
console.log(`S3 has ${fullKeyById.size} photos and ${thumbKeys.size} thumbnails for this event`);

// ── Sessions, photos, contacts ──────────────────────────────────────────────
const sessions = db
  .prepare("SELECT id, session_number, color, created_at FROM sessions WHERE event_id = ? ORDER BY session_number")
  .all(EVENT_ID);
const photosFor = db.prepare(
  "SELECT id, original_filename, full_path, selected, kind FROM photos WHERE session_id = ? AND status = 'ready' ORDER BY created_at, original_filename"
);
const contactsFor = db.prepare(
  "SELECT name, email, phone, email_sent, sms_sent, local_download FROM contacts WHERE session_id = ? ORDER BY created_at"
);

function localTime(utc) {
  // DB stores UTC "YYYY-MM-DD HH:MM:SS"; the gallery parses the string as local time
  return new Date(utc.replace(" ", "T") + "Z").toLocaleString("sv-SE", { timeZone: TZ, hour12: false });
}
function localHour(utc) {
  return Number(new Date(utc.replace(" ", "T") + "Z").toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));
}

const uploads = []; // { photo, key }
const thumbsToMake = []; // { photo, thumbKey }
const out = Object.fromEntries(TABS.map((t) => [t.key, { name: t.name, sessions: [] }]));
let photoTotal = 0;

for (const s of sessions) {
  const all = photosFor.all(s.id);
  if (!all.length) continue;
  const selected = all.filter((p) => p.selected);
  const chosen = (selected.length ? selected : all).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "card" ? 1 : -1; // cards after the photos
    return a.original_filename.localeCompare(b.original_filename);
  });
  const contacts = contactsFor.all(s.id);
  const num = String(s.session_number).padStart(3, "0");
  const photos = [];
  for (const p of chosen) {
    if (!fs.existsSync(p.full_path)) {
      console.warn(`  missing local file for ${p.id} (session ${s.session_number}) — skipped`);
      continue;
    }
    let key = fullKeyById.get(p.id);
    if (!key) {
      key = `delivery/${EVENT_ID}/session-${num}/${p.id}.jpg`;
      fullKeyById.set(p.id, key);
      uploads.push({ photo: p, key });
    }
    const thumbKey = key.replace(/^delivery\//, "thumbs/");
    if (!thumbKeys.has(thumbKey)) {
      thumbKeys.add(thumbKey);
      thumbsToMake.push({ photo: p, thumbKey });
    }
    photos.push({
      id: p.id,
      filename: p.kind === "card" ? "AI card" : p.original_filename,
      thumb: `${CDN}/${thumbKey}`,
      full: `${FULL_BASE}/${key}`,
    });
  }
  if (!photos.length) continue;
  photoTotal += photos.length;
  const hour = localHour(s.created_at);
  const tab = TABS.find((t) => hour < t.until) ?? TABS[TABS.length - 1];
  out[tab.key].sessions.push({
    number: s.session_number,
    photoCount: photos.length,
    color: s.color,
    time: localTime(s.created_at),
    contacts: contacts.map((c) => ({
      name: c.name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      emailSent: !!c.email_sent,
      smsSent: !!c.sms_sent,
      localDownload: !!c.local_download,
    })),
    photos,
  });
}

// ── Upload what is missing ──────────────────────────────────────────────────
async function pool(items, worker) {
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await worker(item);
        done++;
        if (done % 50 === 0 || done === items.length) console.log(`  ${done}/${items.length}`);
      }
    })
  );
}

console.log(`Uploading ${uploads.length} full-size photos that were never delivered…`);
await pool(uploads, async ({ photo, key }) => {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: fs.readFileSync(photo.full_path), ContentType: "image/jpeg" })
  );
});

console.log(`Making ${thumbsToMake.length} thumbnails…`);
await pool(thumbsToMake, async ({ photo, thumbKey }) => {
  const buf = await sharp(photo.full_path).rotate().resize({ width: THUMB_WIDTH }).jpeg({ quality: THUMB_QUALITY }).toBuffer();
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: thumbKey, Body: buf, ContentType: "image/jpeg" }));
});

fs.writeFileSync(OUT, JSON.stringify(out));
const sessionTotal = Object.values(out).reduce((n, t) => n + t.sessions.length, 0);
console.log(`Wrote ${OUT}: ${sessionTotal} sessions, ${photoTotal} photos`);
for (const t of Object.values(out)) console.log(`  ${t.name}: ${t.sessions.length} sessions`);
