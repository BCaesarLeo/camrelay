import fs from "fs";
import path from "path";
import chokidar, { type FSWatcher } from "chokidar";
import { config } from "../config.js";
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
