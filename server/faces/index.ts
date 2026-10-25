// "Want these too?" — faces are found in every photo as it arrives (YuNet + SFace running in
// face/server.py, a child process on localhost) and stored in the faces table. When a guest
// reviews a session we look for the same people in other sessions of the event and OFFER
// those photos. Nothing is ever selected for the guest; they tap each one they want.
//
// Isolation: indexing runs in its own queue after the photo is already 'ready', so the normal
// flow never waits on it. If the service is down, suggestions are simply empty.
import { spawn, execFileSync, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import PQueue from "p-queue";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { rowToPhoto } from "../routes/photos.js";
import { getActiveEventId } from "../routes/events.js";
import type { Photo } from "../../shared/types.js";

const PORT = Number(process.env.FACE_PORT || 3101);
const PYTHON = path.join(process.cwd(), "face", "venv", "bin", "python");
const SCRIPT = path.join(process.cwd(), "face", "server.py");
const MODELS = ["yunet.onnx", "sface.onnx"].map((m) => path.join(process.cwd(), "assets", "face", m));

// Thresholds from the Easter trial (prototype/want-these-too): cosine similarity of
// normalised SFace features. A photo is offered when two different people match, or one
// matches very strongly — look-alike babies were the only errors seen in the trial.
const MATCH = 0.7;
const STRONG = 0.8;
const SAME_IMAGE = 0.985; // the very same frame filed twice
const MAX_SUGGESTIONS = 40;

// ---- settings -------------------------------------------------------------------------

const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const putSetting = db.prepare(
  "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
);

export function suggestionsEnabled(): boolean {
  const row = getSetting.get("suggestions_enabled") as { value: string } | undefined;
  return row ? row.value === "1" : true; // on unless the host turned it off
}

export function setSuggestionsEnabled(enabled: boolean) {
  putSetting.run("suggestions_enabled", enabled ? "1" : "0");
}

export function faceServiceConfigured(): boolean {
  return fs.existsSync(PYTHON) && fs.existsSync(SCRIPT) && MODELS.every((m) => fs.existsSync(m));
}

// ---- child process --------------------------------------------------------------------

const state = {
  proc: null as ChildProcess | null,
  up: false,
  restarts: 0,
  lastError: null as string | null,
  stopping: false,
};

export function startFaceService() {
  if (!faceServiceConfigured()) {
    console.log("[faces] Face service not set up (missing face/venv, face/server.py or assets/face/*.onnx) — suggestions off");
    return;
  }
  launch();
  setInterval(backfill, 20_000);
  setInterval(checkHealth, 10_000);
}

// A face service left behind by a previous kiosk run would hold the port and make every
// new launch exit at once. We remember our child's pid in a file and stop it first.
// (No lsof here: it can hang for minutes when an external drive is being mounted.)
const PID_FILE = path.join(process.cwd(), "face", "service.pid");

function freePort() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, "utf8").trim());
    if (pid && pid !== process.pid) {
      // After a reboot the pid may belong to something else entirely — only kill our own script
      const cmd = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 2000 }).trim();
      if (cmd.includes("face/server.py")) {
        process.kill(pid, "SIGTERM");
        console.log(`[faces] Stopped stale face service (pid ${pid})`);
      }
    }
  } catch {
    // no pid file, or the process is already gone — the normal case
  }
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

function launch() {
  if (state.stopping) return;
  freePort();
  const proc = spawn(PYTHON, [SCRIPT], {
    env: { ...process.env, FACE_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  state.proc = proc;
  try {
    if (proc.pid) fs.writeFileSync(PID_FILE, String(proc.pid));
  } catch {}
  proc.stdout?.on("data", (d) => {
    const line = String(d).trim();
    if (line) console.log(`[faces] ${line}`);
  });
  proc.stderr?.on("data", (d) => {
    const line = String(d).trim();
    // OpenCV prints harmless backend warnings on startup; keep real errors
    if (line && !line.includes("WARN:")) console.error(`[faces] ${line.slice(0, 300)}`);
  });
  proc.on("error", (err) => {
    // spawn itself failed (python missing / not executable): 'exit' never fires, so retry from here
    state.up = false;
    state.proc = null;
    state.lastError = `cannot start face service: ${err.message}`;
    console.error(`[faces] Cannot start face service: ${err.message}`);
    if (!state.stopping) setTimeout(launch, 30_000);
  });
  proc.on("exit", (code) => {
    state.up = false;
    state.proc = null;
    if (state.stopping) return;
    state.restarts++;
    state.lastError = `face service exited (code ${code})`;
    const delay = Math.min(60_000, 5_000 * state.restarts);
    console.error(`[faces] Service exited with code ${code}; restarting in ${delay / 1000}s`);
    setTimeout(launch, delay);
  });
  setTimeout(checkHealth, 2_000);
}

async function checkHealth() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2_000) });
    const wasUp = state.up;
    state.up = res.ok;
    if (state.up && !wasUp) {
      console.log("[faces] Face service up");
      state.restarts = 0;
      backfill();
    }
  } catch {
    state.up = false;
  }
}

export function stopFaceService() {
  state.stopping = true;
  state.proc?.kill();
}

// Take the child down with the kiosk, whichever way the kiosk stops
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopFaceService();
    process.exit(0);
  });
}
process.on("exit", () => stopFaceService());

// ---- indexing -------------------------------------------------------------------------

const indexQueue = new PQueue({ concurrency: 1 });
const attempts = new Map<string, number>();
const getPhoto = db.prepare("SELECT p.*, s.event_id FROM photos p JOIN sessions s ON p.session_id = s.id WHERE p.id = ?");
const setStatus = db.prepare("UPDATE photos SET face_status = ? WHERE id = ?");
const deleteFaces = db.prepare("DELETE FROM faces WHERE photo_id = ?");
const insertFace = db.prepare(
  "INSERT INTO faces (id, photo_id, session_id, event_id, box, score, emb) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
const pendingPhotos = db.prepare(`
  SELECT p.id FROM photos p JOIN sessions s ON p.session_id = s.id
  WHERE p.status = 'ready' AND p.kind = 'photo' AND p.face_status IN ('pending', 'failed')
    AND s.event_id = ?
  ORDER BY p.created_at DESC LIMIT 25
`);

// Called by the photo pipeline once a photo is ready. Never throws.
export function indexPhoto(photoId: string) {
  if (!state.up) return; // backfill picks it up when the service is back
  indexQueue.add(() => embedPhoto(photoId)).catch((err) => console.error("[faces] queue error:", err));
}

function backfill() {
  if (!state.up || indexQueue.size > 0) return;
  const eventId = getActiveEventId();
  if (!eventId) return;
  for (const row of pendingPhotos.all(eventId) as { id: string }[]) {
    if ((attempts.get(row.id) ?? 0) >= 3) continue;
    indexPhoto(row.id);
  }
}

async function embedPhoto(photoId: string) {
  const photo = getPhoto.get(photoId) as any;
  if (!photo || photo.status !== "ready" || !photo.full_path) return;
  if (photo.kind !== "photo") {
    setStatus.run("none", photoId);
    return;
  }
  attempts.set(photoId, (attempts.get(photoId) ?? 0) + 1);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: photo.full_path }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`face service HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { faces: { box: number[]; score: number; emb: number[] }[]; ms: number };

    db.transaction(() => {
      deleteFaces.run(photoId);
      for (const f of data.faces) {
        insertFace.run(
          nanoid(),
          photoId,
          photo.session_id,
          photo.event_id,
          JSON.stringify(f.box),
          f.score,
          Buffer.from(new Float32Array(f.emb).buffer)
        );
      }
      setStatus.run(data.faces.length ? "done" : "none", photoId);
    })();
    attempts.delete(photoId);
    console.log(`[faces] ${data.faces.length} face(s) in ${photo.original_filename} (${data.ms} ms)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.lastError = `${new Date().toLocaleTimeString()} ${msg.slice(0, 160)}`;
    setStatus.run("failed", photoId);
    console.error(`[faces] Could not index ${photo.original_filename}: ${msg.slice(0, 200)}`);
  }
}

// ---- matching -------------------------------------------------------------------------

export interface SuggestedPhoto extends Photo {
  sessionNumber: number;
  sessionTime: string;
  score: number;
  people: number;
}

// Ownership comes from the photos table at query time, so a photo regrouped with "Not us?"
// takes its faces with it (faces.session_id/event_id are only what was true at index time)
const facesForSession = db.prepare(`
  SELECT f.id, f.photo_id, f.emb FROM faces f JOIN photos p ON f.photo_id = p.id WHERE p.session_id = ?
`);
const facesForOthers = db.prepare(`
  SELECT f.id, f.photo_id, p.session_id, f.emb
  FROM faces f JOIN photos p ON f.photo_id = p.id JOIN sessions s ON p.session_id = s.id
  WHERE s.event_id = ? AND p.session_id != ? AND p.status = 'ready' AND p.kind = 'photo'
`);
const getSessionRow = db.prepare("SELECT * FROM sessions WHERE id = ?");
const getPhotoRow = db.prepare("SELECT * FROM photos WHERE id = ?");

function toVec(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function suggestFor(sessionId: string): SuggestedPhoto[] {
  if (!suggestionsEnabled()) return [];
  const session = getSessionRow.get(sessionId) as any;
  if (!session) return [];

  const mine = (facesForSession.all(sessionId) as any[]).map((r) => ({ id: r.id as string, vec: toVec(r.emb) }));
  if (mine.length === 0) return [];
  const others = facesForOthers.all(session.event_id, sessionId) as any[];
  if (others.length === 0) return [];

  // Group the other sessions' faces by photo
  const byPhoto = new Map<string, { sessionId: string; faces: { id: string; vec: Float32Array }[] }>();
  for (const r of others) {
    let entry = byPhoto.get(r.photo_id);
    if (!entry) {
      entry = { sessionId: r.session_id, faces: [] };
      byPhoto.set(r.photo_id, entry);
    }
    entry.faces.push({ id: r.id, vec: toVec(r.emb) });
  }

  const out: SuggestedPhoto[] = [];
  const sessionCache = new Map<string, any>();
  for (const [photoId, entry] of byPhoto) {
    // For each face in their photo: best match among the guest's faces
    const hits: { theirs: string; mine: string; sim: number }[] = [];
    for (const theirs of entry.faces) {
      let best = -1;
      let bestMine = "";
      for (const m of mine) {
        const sim = dot(theirs.vec, m.vec);
        if (sim > SAME_IMAGE) continue;
        if (sim > best) {
          best = sim;
          bestMine = m.id;
        }
      }
      if (best >= MATCH) hits.push({ theirs: theirs.id, mine: bestMine, sim: best });
    }
    if (hits.length === 0) continue;
    const twoPeople = new Set(hits.map((h) => h.theirs)).size >= 2 && new Set(hits.map((h) => h.mine)).size >= 2;
    const strong = hits.some((h) => h.sim >= STRONG);
    if (!twoPeople && !strong) continue;

    const photoRow = getPhotoRow.get(photoId) as any;
    if (!photoRow || photoRow.status !== "ready") continue;
    let s = sessionCache.get(entry.sessionId);
    if (!s) {
      s = getSessionRow.get(entry.sessionId);
      sessionCache.set(entry.sessionId, s);
    }
    if (!s) continue;
    out.push({
      ...rowToPhoto(photoRow),
      selected: false, // never pre-selected: the guest decides
      sessionNumber: s.session_number,
      sessionTime: s.created_at,
      score: Math.max(...hits.map((h) => h.sim)),
      people: hits.length,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, MAX_SUGGESTIONS);
}

// ---- host page ------------------------------------------------------------------------

export function faceStats() {
  const eventId = getActiveEventId();
  const faces = eventId
    ? (db.prepare(
        "SELECT COUNT(*) as n FROM faces f JOIN photos p ON f.photo_id = p.id JOIN sessions s ON p.session_id = s.id WHERE s.event_id = ?"
      ).get(eventId) as any).n
    : 0;
  const pending = eventId
    ? (db.prepare(
        `SELECT COUNT(*) as n FROM photos p JOIN sessions s ON p.session_id = s.id
         WHERE s.event_id = ? AND p.status = 'ready' AND p.kind = 'photo' AND p.face_status IN ('pending','failed')`
      ).get(eventId) as any).n
    : 0;
  return {
    enabled: suggestionsEnabled(),
    configured: faceServiceConfigured(),
    serviceUp: state.up,
    faces,
    pending,
    queued: indexQueue.size + indexQueue.pending,
    lastError: state.lastError,
  };
}
