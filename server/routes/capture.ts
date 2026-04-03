import type { FastifyInstance } from "fastify";
import {
  startCapture,
  stopCapture,
  getCaptureStatus,
  type CaptureMode,
} from "../capture/index.js";

export async function captureRoutes(app: FastifyInstance) {
  app.get("/api/capture/status", async () => {
    return getCaptureStatus();
  });

  app.post<{ Body: { mode: CaptureMode } }>(
    "/api/capture/start",
    async (req) => {
      const mode = req.body?.mode || "watch";
      return startCapture(mode);
    }
  );

  app.post("/api/capture/stop", async () => {
    await stopCapture();
    return { ok: true };
  });
}
