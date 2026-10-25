import { create } from "zustand";
import type { Session, Photo, DownloadInfo, SuggestedPhoto } from "../../shared/types";
import { api } from "../lib/api";

type Screen = "sessions" | "session" | "review" | "regroup" | "contact" | "qr" | "findme";

export interface GuestContact {
  name: string;
  email: string;
  phone: string;
}

export type MoveTarget = { sessionId: string } | { newGroup: true };

export interface NeighbourGroup {
  session: Session;
  photos: SuggestedPhoto[];
}

interface Store {
  // Navigation
  screen: Screen;
  setScreen: (screen: Screen) => void;

  // Config
  eventName: string;
  autoResetSeconds: number;
  wifiNetwork: string | null;
  wifiPassword: string | null;
  smsEnabled: boolean;
  // AI Halloween card — offered only while the host switch is on and the drawer is healthy
  aiCardsAvailable: boolean;
  aiCardChoices: { id: string; label: string; emoji: string }[];
  cardError: string | null;
  requestCard: (photoId: string, choice?: string) => Promise<void>;

  // "Want these too?" — offered photos from other sessions; extras = the ones the guest tapped
  suggestionsEnabled: boolean;
  suggestions: SuggestedPhoto[];
  extras: string[];
  loadSuggestions: () => Promise<void>;
  toggleExtra: (photoId: string) => void;

  // The sessions shot just before / after this one, loaded only when the guest asks
  neighbours: { before: NeighbourGroup | null; after: NeighbourGroup | null };
  loadNeighbour: (when: "before" | "after") => Promise<void>;

  // Which selection screen the host chose: the new grid + swipe view, or the classic one
  selectScreen: "new" | "classic";
  deliveryMode: "online" | "local";
  setDeliveryMode: (mode: "online" | "local") => void;
  loadConfig: () => Promise<void>;

  // Sessions list
  sessions: Session[];
  loadSessions: () => Promise<void>;
  createSession: (name?: string) => Promise<void>;

  // Current session
  session: Session | null;
  openSession: (session: Session) => void;

  // Complete session
  completeSession: () => Promise<void>;

  // Photos
  photos: Photo[];
  addPhoto: (photo: Photo) => void;
  loadPhotos: () => Promise<void>;
  toggleSelect: (photoId: string) => Promise<void>;
  selectedPhotos: () => Photo[];

  // Regroup ("Not us")
  regroupReturn: "session" | "review";
  regroupPreselect: string[];
  openRegroup: (preselect?: string[]) => void;
  movePhotos: (photoIds: string[], target: MoveTarget) => Promise<Session>;

  // Returning guest — contact info kept so they can send another session
  // without retyping it. Cleared when they tap Done or walk away.
  guest: GuestContact | null;
  lastContact: GuestContact | null;
  rememberContact: (contact: GuestContact) => void;
  sendAnotherSession: () => void;
  finishGuest: () => void;

  // Download
  downloadInfo: DownloadInfo | null;
  generateDownloadLink: () => Promise<void>;

  // Reset to session list
  backToSessions: () => void;
}

export const useStore = create<Store>((set, get) => ({
  screen: "sessions",
  setScreen: (screen) => set({ screen }),

  eventName: "StudioRelay",
  autoResetSeconds: 60,
  wifiNetwork: null,
  wifiPassword: null,
  smsEnabled: false,
  aiCardsAvailable: false,
  aiCardChoices: [],
  cardError: null,
  requestCard: async (photoId, choice) => {
    const { session } = get();
    if (!session) return;
    set({ cardError: null });
    try {
      const photo = await api.requestCard(session.id, photoId, choice);
      // Shows "drawing" at once; the finished card arrives over the websocket
      if (get().session?.id === session.id) get().addPhoto(photo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ cardError: msg });
      // The offer disappears if the server says cards are off right now
      if (msg.startsWith("503")) set({ aiCardsAvailable: false });
    }
  },
  suggestionsEnabled: false,
  suggestions: [],
  extras: [],
  loadSuggestions: async () => {
    const { session, suggestionsEnabled } = get();
    if (!session || !suggestionsEnabled) return;
    try {
      const res = await api.getSuggestions(session.id);
      if (get().session?.id !== session.id) return;
      // Keep every extra that is still on offer: a face match, or a neighbouring session's photo
      const { neighbours } = get();
      const ids = new Set([
        ...res.photos.map((p) => p.id),
        ...(neighbours.before?.photos ?? []).map((p) => p.id),
        ...(neighbours.after?.photos ?? []).map((p) => p.id),
      ]);
      set({ suggestions: res.photos, extras: get().extras.filter((id) => ids.has(id)) });
    } catch {
      // No suggestions is always a fine answer
    }
  },
  toggleExtra: (photoId) =>
    set((state) => ({
      extras: state.extras.includes(photoId) ? state.extras.filter((id) => id !== photoId) : [...state.extras, photoId],
    })),

  neighbours: { before: null, after: null },
  loadNeighbour: async (when) => {
    const { session, sessions } = get();
    if (!session) return;
    const n = session.sessionNumber + (when === "before" ? -1 : 1);
    const target = sessions.find((s) => s.sessionNumber === n && s.eventId === session.eventId);
    if (!target) return;
    try {
      const photos = await api.getPhotos(target.id);
      if (get().session?.id !== session.id) return;
      const list: SuggestedPhoto[] = photos
        .filter((p) => p.status === "ready" && p.kind !== "card")
        .map((p) => ({ ...p, selected: false, sessionNumber: target.sessionNumber, sessionTime: target.createdAt, score: 0, people: 0 }));
      set({ neighbours: { ...get().neighbours, [when]: { session: target, photos: list } } });
    } catch {
      // Leave the offer in place; the guest can tap again
    }
  },

  selectScreen: "new",
  deliveryMode: "online",
  setDeliveryMode: (mode) => set({ deliveryMode: mode }),
  loadConfig: async () => {
    try {
      const cfg = await api.getConfig();
      set({
        eventName: cfg.eventName,
        autoResetSeconds: cfg.autoResetSeconds,
        wifiNetwork: cfg.wifiNetwork ?? null,
        wifiPassword: cfg.wifiPassword ?? null,
        smsEnabled: cfg.smsEnabled ?? false,
        aiCardsAvailable: cfg.aiCardsAvailable ?? false,
        aiCardChoices: cfg.aiCardChoices ?? [],
        suggestionsEnabled: cfg.suggestionsEnabled ?? false,
        selectScreen: cfg.selectScreen === "classic" ? "classic" : "new",
      });
    } catch {
      // Use defaults
    }
  },

  sessions: [],
  loadSessions: async () => {
    const sessions = await api.listSessions();
    set({ sessions });
  },

  createSession: async (name?: string) => {
    const session = await api.createSession(name);
    // Refresh list and stay on sessions screen
    const sessions = await api.listSessions();
    set({ sessions });
  },

  session: null,
  openSession: (session) => {
    set({ session, photos: [], downloadInfo: null, cardError: null, suggestions: [], extras: [], neighbours: { before: null, after: null }, screen: "session" });
    // Re-check the card switch each time a guest starts, so the host can turn it on/off live
    get().loadConfig();
  },

  completeSession: async () => {
    const { session } = get();
    if (!session) return;
    try {
      const updated = await api.completeSession(session.id);
      set({ session: updated });
    } catch (err) {
      // Session might already be complete/expired — that's OK, proceed
      console.warn("completeSession error (continuing anyway):", err);
    }
  },

  photos: [],
  addPhoto: (photo) =>
    set((state) => {
      const exists = state.photos.find((p) => p.id === photo.id);
      if (exists) {
        return {
          photos: state.photos.map((p) => (p.id === photo.id ? photo : p)),
        };
      }
      return { photos: [...state.photos, photo] };
    }),

  loadPhotos: async () => {
    const { session } = get();
    if (!session) return;
    const photos = await api.getPhotos(session.id);
    // Ignore a slow response for a session the guest has already left
    if (get().session?.id === session.id) set({ photos });
  },

  toggleSelect: async (photoId) => {
    const photo = get().photos.find((p) => p.id === photoId);
    if (!photo) return;
    const newSelected = !photo.selected;

    // Optimistic update
    set((state) => ({
      photos: state.photos.map((p) =>
        p.id === photoId ? { ...p, selected: newSelected } : p
      ),
    }));

    try {
      await api.toggleSelect(photoId, newSelected);
    } catch {
      set((state) => ({
        photos: state.photos.map((p) =>
          p.id === photoId ? { ...p, selected: !newSelected } : p
        ),
      }));
    }
  },

  selectedPhotos: () => get().photos.filter((p) => p.selected),

  regroupReturn: "session",
  regroupPreselect: [],
  openRegroup: (preselect = []) => {
    const { screen } = get();
    set({
      regroupReturn: screen === "review" ? "review" : "session",
      regroupPreselect: preselect,
      screen: "regroup",
    });
  },

  movePhotos: async (photoIds, target) => {
    const { target: targetSession } = await api.movePhotos(
      "newGroup" in target
        ? { photoIds, newGroup: true }
        : { photoIds, targetSessionId: target.sessionId }
    );
    await Promise.all([get().loadPhotos(), get().loadSessions()]);
    return targetSession;
  },

  guest: null,
  lastContact: null,
  rememberContact: (contact) => set({ lastContact: contact }),
  sendAnotherSession: () => {
    set({ guest: get().lastContact });
    get().backToSessions();
  },
  finishGuest: () => {
    set({ guest: null, lastContact: null });
    get().backToSessions();
  },

  downloadInfo: null,
  generateDownloadLink: async () => {
    const { session } = get();
    if (!session) return;
    const info = await api.getDownloadLink(session.id);
    set({ downloadInfo: info });
  },

  backToSessions: () => {
    set({
      screen: "sessions",
      session: null,
      photos: [],
      downloadInfo: null,
      suggestions: [],
      extras: [],
      neighbours: { before: null, after: null },
    });
    // Refresh sessions list
    get().loadSessions();
  },
}));
