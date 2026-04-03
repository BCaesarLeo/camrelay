import { create } from "zustand";
import type { Session, Photo, DownloadInfo } from "../../shared/types";
import { api } from "../lib/api";

type Screen = "sessions" | "session" | "review" | "contact" | "qr";

interface Store {
  // Navigation
  screen: Screen;
  setScreen: (screen: Screen) => void;

  // Config
  eventName: string;
  autoResetSeconds: number;
  wifiNetwork: string | null;
  wifiPassword: string | null;
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
  loadConfig: async () => {
    try {
      const cfg = await api.getConfig();
      set({
        eventName: cfg.eventName,
        autoResetSeconds: cfg.autoResetSeconds,
        wifiNetwork: cfg.wifiNetwork ?? null,
        wifiPassword: cfg.wifiPassword ?? null,
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
    set({ session, photos: [], downloadInfo: null, screen: "session" });
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
    set({ photos });
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
    });
    // Refresh sessions list
    get().loadSessions();
  },
}));
