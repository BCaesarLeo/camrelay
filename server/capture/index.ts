import { nativeCapture } from "./native.js";
import { nikonCapture } from "./gphoto-nikon.js";
import { watchCapture } from "./watch.js";

export type CaptureMode = "sony" | "nikon" | "watch";

export interface CaptureStatus {
  mode: CaptureMode;
  active: boolean;
  cameraDetected: boolean;
  cameraName: string | null;
  error: string | null;
  watchFolder: string | null;
  photosCaptures: number;
}

let currentMode: CaptureMode = "watch";
let captureCount = 0;

export function getCaptureMode(): CaptureMode {
  return currentMode;
}

export function getCaptureCount(): number {
  return captureCount;
}

export function incrementCaptureCount(): void {
  captureCount++;
}

export async function startCapture(mode: CaptureMode): Promise<CaptureStatus> {
  await stopCapture();
  currentMode = mode;

  if (mode === "sony") {
    // Sony SDK native tether — also start watch mode for the capture folder
    await watchCapture.start();
    return nativeCapture.start();
  } else if (mode === "nikon") {
    // gphoto2 tether — watch mode picks up files from the same folder
    await watchCapture.start();
    return nikonCapture.start();
  } else {
    return watchCapture.start();
  }
}

export async function stopCapture(): Promise<void> {
  await nativeCapture.stop();
  await nikonCapture.stop();
  await watchCapture.stop();
}

export function getCaptureStatus(): CaptureStatus {
  if (currentMode === "sony") {
    return nativeCapture.getStatus();
  } else if (currentMode === "nikon") {
    return nikonCapture.getStatus();
  } else {
    return watchCapture.getStatus();
  }
}
