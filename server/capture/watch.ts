import fs from "fs";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import { config } from "../config.js";
import { db } from "../db.js";
import { enqueuePhoto } from "../pipeline/queue.js";
import { isSupportedImage, isSupportedRaw } from "../pipeline/convert.js";
import { incrementCaptureCount, type CaptureStatus } from "./index.js";

let watcher: FSWatcher | null = null;
let active = false;
const processed = new Set<string>();

const RAW_TWIN_WAIT_MS = 3000;

function hasJpegTwin(rawPath: string): boolean {
  const base = rawPath.slice(0, -path.extname(rawPath).length);
  return [".jpg", ".JPG", ".jpeg", ".JPEG"].some((ext) => fs.existsSync(base + ext));
}

const CATCH_UP_WINDOW_MS = 20 * 60_000;
const known = db.prepare("SELECT 1 FROM photos WHERE original_path = ?");

function catchUp() {
  const since = Date.now() - CATCH_UP_WINDOW_MS;
  const found: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && isSupportedImage(full)) {
        try {
          if (fs.statSync(full).mtimeMs >= since) found.push(full);
        } catch {}
      }
    }
  };
  walk(config.watchFolder);
  for (const file of found.sort()) {
    if (processed.has(file) || known.get(file)) continue;
    if (isSupportedRaw(file) && hasJpegTwin(file)) continue;
    processed.add(file);
    console.log(`[watch] Catching up on ${path.basename(file)} (arrived while the kiosk was down)`);
    incrementCaptureCount();
    enqueuePhoto(file);
  }
}

export const watchCapture = {
  async start(): Promise<CaptureStatus> {
    if (watcher) await this.stop();

    console.log(`[watch] Watching folder: ${config.watchFolder}`);

    watcher = chokidar.watch(config.watchFolder, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 200,
      },
      ignoreInitial: true,
    });

    active = true;

    watcher.on("add", async (filePath) => {
      if (processed.has(filePath)) return;
      if (!isSupportedImage(filePath)) return;
      processed.add(filePath);

      // Camera on RAW+JPEG: the JPEG is the kiosk's source, so skip a raw that has a JPEG twin
      // (the twin usually lands first; wait a moment in case it is still being written)
      if (isSupportedRaw(filePath)) {
        await new Promise((r) => setTimeout(r, RAW_TWIN_WAIT_MS));
        if (hasJpegTwin(filePath)) {
          console.log(`[watch] Skipping raw ${path.basename(filePath)} — JPEG twin present`);
          return;
        }
      }

      console.log(`[watch] New file: ${filePath}`);
      incrementCaptureCount();
      enqueuePhoto(filePath);
    });

    watcher.on("error", (err) => {
      console.error("[watch] Error:", err);
    });

    // Frames that arrived while the kiosk was restarting would otherwise never be seen
    watcher.on("ready", () => catchUp());

    return this.getStatus();
  },

  async stop(): Promise<void> {
    if (watcher) {
      await watcher.close();
      watcher = null;
      active = false;
      console.log("[watch] Stopped");
    }
  },

  getStatus(): CaptureStatus {
    return {
      mode: "watch",
      active,
      cameraDetected: false,
      cameraName: null,
      error: null,
      watchFolder: config.watchFolder,
      photosCaptures: 0,
    };
  },
};
