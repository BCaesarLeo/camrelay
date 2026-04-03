import chokidar from "chokidar";
import { config } from "../config.js";
import { enqueuePhoto } from "../pipeline/queue.js";

const processed = new Set<string>();

export function startWatcher() {
  console.log(`Watching for photos in: ${config.watchFolder}`);

  const watcher = chokidar.watch(config.watchFolder, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 1000,
      pollInterval: 200,
    },
    ignoreInitial: true,
  });

  watcher.on("add", (filePath) => {
    if (processed.has(filePath)) return;
    processed.add(filePath);

    console.log(`New file detected: ${filePath}`);
    enqueuePhoto(filePath);
  });

  watcher.on("error", (error) => {
    console.error("Watcher error:", error);
  });

  return watcher;
}
