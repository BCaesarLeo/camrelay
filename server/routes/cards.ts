import type { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { requestCard, cardStats, updateCardSettings, retryOwedCards } from "../ai/cards.js";

const EXAMPLE = path.join(process.cwd(), "assets", "ai-cards", "example.jpg");

export async function cardRoutes(app: FastifyInstance) {
  // Guest said yes: draw one card for this session from the photo they picked
  app.post<{ Params: { id: string }; Body: { photoId?: string; choice?: string } }>(
    "/api/sessions/:id/card",
    async (req, reply) => {
      const photoId = req.body?.photoId;
      if (!photoId || typeof photoId !== "string") return reply.status(400).send({ error: "photoId required" });
      const choice = typeof req.body?.choice === "string" ? req.body.choice : undefined;
      const result = requestCard(req.params.id, photoId, choice);
      if (!result.ok) return reply.status(result.status).send({ error: result.error });
      return result.photo;
    }
  );

  // The sample card shown to guests before they decide
  app.get("/ai-cards/example.jpg", async (_req, reply) => {
    if (!fs.existsSync(EXAMPLE)) return reply.status(404).send({ error: "No example yet" });
    return reply.type("image/jpeg").header("Cache-Control", "public, max-age=3600").send(fs.createReadStream(EXAMPLE));
  });

  // Host page: switch + banner text + health
  app.get("/api/settings/ai-cards", async () => cardStats());

  // Draw the cards guests are still owed now rather than on the next timer pass
  app.post("/api/settings/ai-cards/retry", async () => ({ started: retryOwedCards(), ...cardStats() }));

  app.post<{ Body: { enabled?: boolean; text?: string; theme?: string } }>("/api/settings/ai-cards", async (req) => {
    updateCardSettings({
      enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : undefined,
      text: typeof req.body?.text === "string" ? req.body.text : undefined,
      theme: typeof req.body?.theme === "string" ? req.body.theme : undefined,
    });
    return cardStats();
  });
}
