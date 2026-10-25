import type { FastifyInstance } from "fastify";
import { suggestFor, faceStats, setSuggestionsEnabled, suggestionsEnabled } from "../faces/index.js";

export async function suggestionRoutes(app: FastifyInstance) {
  // Photos from other sessions of this event that show the same people as this session.
  // Offered as a question on the review screen; never selected for the guest.
  app.get<{ Params: { id: string } }>("/api/sessions/:id/suggestions", async (req) => {
    try {
      return { enabled: suggestionsEnabled(), photos: suggestFor(req.params.id) };
    } catch (err) {
      // Matching trouble must never break the review screen
      console.error("[faces] suggestFor failed:", err);
      return { enabled: suggestionsEnabled(), photos: [] };
    }
  });

  app.get("/api/settings/suggestions", async () => faceStats());

  app.post<{ Body: { enabled?: boolean } }>("/api/settings/suggestions", async (req) => {
    if (typeof req.body?.enabled === "boolean") setSuggestionsEnabled(req.body.enabled);
    return faceStats();
  });
}
