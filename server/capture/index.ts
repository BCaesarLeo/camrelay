import { nativeCapture } from "./native.js";
import { watchCapture } from "./watch.js";

export type CaptureMode = "direct" | "watch";

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

  if (mode === "direct") {
    return nativeCapture.start();
  } else {
    return watchCapture.start();
  }
}

export async function stopCapture(): Promise<void> {
  await nativeCapture.stop();
  await watchCapture.stop();
}

export function getCaptureStatus(): CaptureStatus {
  if (currentMode === "direct") {
    return nativeCapture.getStatus();
  } else {
    return watchCapture.getStatus();
  }
}
