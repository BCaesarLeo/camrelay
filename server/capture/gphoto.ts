import { execFile, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { config } from "../config.js";
import { enqueuePhoto } from "../pipeline/queue.js";
import { incrementCaptureCount, type CaptureStatus } from "./index.js";

const execFileAsync = promisify(execFile);

let gphotoProcess: ChildProcess | null = null;
let killerProcess: ChildProcess | null = null;
let cameraName: string | null = null;
let cameraDetected = false;
let active = false;
let error: string | null = null;
let intentionallyStopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Persistent background process that continuously kills ptpcamerad
// so it can never steal the USB device from gphoto2
function startPtpKiller(): void {
  if (killerProcess) return;
  // Bash loop that kills ptpcamerad every 0.5 seconds
  killerProcess = spawn("bash", [
    "-c",
    "while true; do killall -9 ptpcamerad 2>/dev/null; killall -9 PTPCamera 2>/dev/null; sleep 0.5; done",
  ], { stdio: "ignore" });
  console.log("[ptp-killer] Started — keeping ptpcamerad suppressed");
}

function stopPtpKiller(): void {
  if (killerProcess) {
    killerProcess.kill("SIGTERM");
    killerProcess = null;
    console.log("[ptp-killer] Stopped");
  }
}

async function detectCamera(): Promise<{
  detected: boolean;
  name: string | null;
}> {
  try {
    // Kill PTP daemons first
    await execFileAsync("killall", ["-9", "ptpcamerad"]).catch(() => {});
    await execFileAsync("killall", ["-9", "PTPCamera"]).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));

    const { stdout } = await execFileAsync("gphoto2", ["--auto-detect"], {
      timeout: 10000,
    });
    const lines = stdout
      .split("\n")
      .filter(
        (l) =>
          l.trim() && !l.startsWith("Model") && !l.startsWith("-")
      );
    if (lines.length > 0) {
      const name = lines[0].split(/\s{2,}/)[0].trim();
      return { detected: true, name };
    }
    return { detected: false, name: null };
  } catch {
    return { detected: false, name: null };
  }
}

async function isGphoto2Installed(): Promise<boolean> {
  try {
    await execFileAsync("which", ["gphoto2"]);
    return true;
  } catch {
    return false;
  }
}

export const gphotoCapture = {
  async start(): Promise<CaptureStatus> {
    error = null;
    intentionallyStopped = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (!(await isGphoto2Installed())) {
      error = "gphoto2 not installed. Install via: brew install gphoto2";
      return this.getStatus();
    }

    // Start the persistent ptpcamerad killer
    startPtpKiller();
    // Give it a moment to clear the field
    await new Promise((r) => setTimeout(r, 1000));

    const detection = await detectCamera();
    cameraDetected = detection.detected;
    cameraName = detection.name;

    if (!cameraDetected) {
      error = "No camera detected. Check USB connection.";
      stopPtpKiller();
      return this.getStatus();
    }

    const captureDir = path.join(config.storagePath, "capture");
    fs.mkdirSync(captureDir, { recursive: true });

    const captureFilename = path.join(
      captureDir,
      "%Y%m%d_%H%M%S_%n.%C"
    );

    // Start gphoto2 tethered capture — keep photos on camera card
    const gphoto = spawn(
      "gphoto2",
      [
        "--capture-tethered",
        "--keep",
        "--filename",
        captureFilename,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    gphotoProcess = gphoto;
    active = true;

    console.log(`[gphoto2] Tethered capture started — ${cameraName}`);

    gphoto.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log(`[gphoto2] ${output.trim()}`);

      const match = output.match(/Saving file as (.+)/);
      if (match) {
        const filePath = match[1].trim();
        console.log(`[gphoto2] New capture: ${filePath}`);
        incrementCaptureCount();
        enqueuePhoto(filePath);
      }
    });

    gphoto.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[gphoto2] ${msg}`);
    });

    gphoto.on("close", (code) => {
      active = false;
      gphotoProcess = null;
      if (code !== 0 && code !== null) {
        error = `gphoto2 exited with code ${code}`;
        console.error(`[gphoto2] ${error}`);
      }
      console.log("[gphoto2] Tethered capture stopped");

      // Auto-reconnect unless we intentionally stopped
      if (!intentionallyStopped) {
        console.log("[gphoto2] Auto-reconnecting in 3s...");
        reconnectTimer = setTimeout(() => {
          console.log("[gphoto2] Reconnecting...");
          gphotoCapture.start();
        }, 3000);
      }
    });

    gphoto.on("error", (err) => {
      active = false;
      error = err.message;
      console.error(`[gphoto2] Error: ${err.message}`);
    });

    return this.getStatus();
  },

  async stop(): Promise<void> {
    intentionallyStopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (gphotoProcess) {
      gphotoProcess.kill("SIGTERM");
      gphotoProcess = null;
      active = false;
      console.log("[gphoto2] Stopped");
    }
    stopPtpKiller();
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

  async detect(): Promise<{
    detected: boolean;
    name: string | null;
    installed: boolean;
  }> {
    const installed = await isGphoto2Installed();
    if (!installed) return { detected: false, name: null, installed: false };
    const result = await detectCamera();
    return { ...result, installed: true };
  },
};
