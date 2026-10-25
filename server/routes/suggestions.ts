import type { FastifyInstance } from "fastify";
import { suggestFor, faceStats, setSuggestionsEnabled, suggestionsEnabled } from "../faces/index.js";
import { db } from "../db.js";

// Which selection screen the kiosk shows: the new grid + swipe view (default) or the classic one
const getSelectScreen = db.prepare("SELECT value FROM settings WHERE key = 'select_screen'");
export function selectScreen(): "new" | "classic" {
  const row = getSelectScreen.get() as { value: string } | undefined;
  return row?.value === "classic" ? "classic" : "new";
}

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

  app.get("/api/settings/select-screen", async () => ({ selectScreen: selectScreen() }));
  app.post<{ Body: { selectScreen?: string } }>("/api/settings/select-screen", async (req) => {
    const v = req.body?.selectScreen === "classic" ? "classic" : "new";
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('select_screen', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(v);
    return { selectScreen: selectScreen() };
  });

  app.post<{ Body: { enabled?: boolean } }>("/api/settings/suggestions", async (req) => {
    if (typeof req.body?.enabled === "boolean") setSuggestionsEnabled(req.body.enabled);
    return faceStats();
  });
}
