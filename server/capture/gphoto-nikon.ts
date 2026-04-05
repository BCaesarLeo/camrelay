import { execFile, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { enqueuePhoto } from "../pipeline/queue.js";
import { incrementCaptureCount, type CaptureStatus } from "./index.js";

const execFileAsync = promisify(execFile);

let gphotoProcess: ChildProcess | null = null;
let loopRunning = false;
let intentionallyStopped = false;
let cameraName: string | null = null;
let cameraDetected = false;
let active = false;
let error: string | null = null;

const CAPTURE_DIR = path.join(config.watchFolder);

export const nikonCapture = {
  async start(): Promise<CaptureStatus> {
    error = null;
    intentionallyStopped = false;
    loopRunning = true;

    fs.mkdirSync(CAPTURE_DIR, { recursive: true });

    console.log("[nikon] Starting gphoto2 tether loop...");
    this.runLoop();

    active = true;
    cameraName = "Nikon (gphoto2)";
    cameraDetected = true;
    return this.getStatus();
  },

  async runLoop() {
    while (loopRunning && !intentionallyStopped) {
      try {
        // Kill ptpcamerad before each attempt
        await execFileAsync("killall", ["-9", "ptpcamerad"]).catch(() => {});
        await execFileAsync("killall", ["-9", "PTPCamera"]).catch(() => {});
        await new Promise((r) => setTimeout(r, 500));

        // Check if camera is connected
        try {
          const { stdout } = await execFileAsync("gphoto2", ["--auto-detect"], { timeout: 5000 });
          if (!stdout.includes("usb:")) {
            console.log("[nikon] No camera found, waiting...");
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }

        cameraDetected = true;
        active = true;

        // Start tethered capture
        await new Promise<void>((resolve) => {
          const gphoto = spawn("gphoto2", [
            "--wait-event-and-download",
            "--keep",
            "--filename",
            path.join(CAPTURE_DIR, "%Y%m%d_%H%M%S_%n.%C"),
          ], {
            stdio: ["ignore", "pipe", "pipe"],
          });

          gphotoProcess = gphoto;

          gphoto.stdout?.on("data", (data: Buffer) => {
            const output = data.toString();
            const lines = output.split("\n");
            for (const line of lines) {
              if (line.includes("Saving file as")) {
                const match = line.match(/Saving file as (.+)/);
                if (match) {
                  const filePath = match[1].trim();
                  console.log(`[nikon] Captured: ${filePath}`);
                  incrementCaptureCount();
                  // Watch mode will pick it up from the folder
                }
              }
            }
          });

          gphoto.stderr?.on("data", (data: Buffer) => {
            const msg = data.toString().trim();
            if (msg && !msg.includes("UNKNOWN PTP")) {
              console.log(`[nikon] ${msg}`);
            }
          });

          gphoto.on("close", () => {
            gphotoProcess = null;
            resolve();
          });

          gphoto.on("error", () => {
            gphotoProcess = null;
            resolve();
          });
        });

        if (!intentionallyStopped) {
          console.log("[nikon] gphoto2 disconnected, reconnecting in 2s...");
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (err) {
        console.error("[nikon] Loop error:", err);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    active = false;
    console.log("[nikon] Tether loop stopped");
  },

  async stop(): Promise<void> {
    intentionallyStopped = true;
    loopRunning = false;
    if (gphotoProcess) {
      gphotoProcess.kill("SIGTERM");
      gphotoProcess = null;
    }
    active = false;
    console.log("[nikon] Stopped");
  },

  getStatus(): CaptureStatus {
    return {
      mode: "nikon",
      active,
      cameraDetected,
      cameraName,
      error,
      watchFolder: CAPTURE_DIR,
      photosCaptures: 0,
    };
  },
};
