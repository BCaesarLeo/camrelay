import chokidar, { type FSWatcher } from "chokidar";
import { config } from "../config.js";
import { enqueuePhoto } from "../pipeline/queue.js";
import { isSupportedImage } from "../pipeline/convert.js";
import { incrementCaptureCount, type CaptureStatus } from "./index.js";

let watcher: FSWatcher | null = null;
let active = false;
const processed = new Set<string>();

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

    watcher.on("add", (filePath) => {
      if (processed.has(filePath)) return;
      if (!isSupportedImage(filePath)) return;
      processed.add(filePath);

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
