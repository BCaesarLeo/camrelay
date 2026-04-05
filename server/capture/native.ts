import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { enqueuePhoto } from "../pipeline/queue.js";
import { incrementCaptureCount, type CaptureStatus } from "./index.js";

const BINARY_PATH = path.join(
  import.meta.dirname,
  "..",
  "..",
  "native",
  "sony-sdk",
  "build_tether",
  "TetherCli"
);

let process: ChildProcess | null = null;
let cameraName: string | null = null;
let cameraDetected = false;
let active = false;
let error: string | null = null;
let intentionallyStopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const nativeCapture = {
  async start(): Promise<CaptureStatus> {
    error = null;
    intentionallyStopped = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (!fs.existsSync(BINARY_PATH)) {
      error = "Native camera-tether binary not found. Run: swiftc -O -framework ImageCaptureCore -o native/camera-tether native/CameraTether.swift";
      return this.getStatus();
    }

    const captureDir = path.join(config.storagePath, "capture");
    fs.mkdirSync(captureDir, { recursive: true });

    const child = spawn(BINARY_PATH, [captureDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    process = child;
    active = true;

    console.log("[native] Camera tether started");

    // Parse structured stdout messages
    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter((l) => l.trim());
      for (const line of lines) {
        if (line.startsWith("STATUS:SEARCHING")) {
          console.log("[native] Searching for cameras...");
        } else if (line.startsWith("STATUS:FOUND:")) {
          cameraName = line.slice("STATUS:FOUND:".length);
          cameraDetected = true;
          console.log(`[native] Found: ${cameraName}`);
        } else if (line.startsWith("STATUS:CONNECTED:")) {
          cameraName = line.slice("STATUS:CONNECTED:".length);
          cameraDetected = true;
          console.log(`[native] Connected: ${cameraName}`);
        } else if (line.startsWith("STATUS:TETHERED")) {
          console.log("[native] Tethered capture active");
        } else if (line.startsWith("STATUS:DISCONNECTED")) {
          cameraDetected = false;
          console.log("[native] Camera disconnected");
        } else if (line.startsWith("STATUS:ERROR:")) {
          error = line.slice("STATUS:ERROR:".length);
          console.error(`[native] Error: ${error}`);
        } else if (line.startsWith("CAPTURED:")) {
          const filePath = line.slice("CAPTURED:".length);
          console.log(`[native] Captured: ${filePath}`);
          incrementCaptureCount();
          enqueuePhoto(filePath);
        } else if (line.startsWith("NEWFILE:")) {
          console.log(`[native] New file: ${line.slice("NEWFILE:".length)}`);
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[native] ${msg}`);
    });

    child.on("close", (code) => {
      active = false;
      process = null;
      if (code !== 0 && code !== null) {
        error = `camera-tether exited with code ${code}`;
        console.error(`[native] ${error}`);
      }
      console.log("[native] Camera tether stopped");

      if (!intentionallyStopped) {
        console.log("[native] Auto-reconnecting in 3s...");
        reconnectTimer = setTimeout(() => {
          nativeCapture.start();
        }, 3000);
      }
    });

    child.on("error", (err) => {
      active = false;
      error = err.message;
      console.error(`[native] Error: ${err.message}`);
    });

    return this.getStatus();
  },

  async stop(): Promise<void> {
    intentionallyStopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (process) {
      process.kill("SIGTERM");
      process = null;
      active = false;
      console.log("[native] Stopped");
    }
  },

  getStatus(): CaptureStatus {
    return {
      mode: "sony",
      active,
      cameraDetected,
      cameraName,
      error,
      watchFolder: null,
      photosCaptures: 0,
    };
  },
};
