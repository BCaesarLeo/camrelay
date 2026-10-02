import type { Session, Photo, DownloadInfo } from "../../shared/types";

const BASE = "";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${url}`, {
    headers,
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  listSessions: () => request<Session[]>("/api/sessions"),

  createSession: (name?: string) =>
    request<Session>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  getSession: (id: string) => request<Session>(`/api/sessions/${id}`),

  getActiveSession: () => request<Session>("/api/sessions/active"),

  updateSession: (id: string, data: { name?: string }) =>
    request<Session>(`/api/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  completeSession: (id: string) =>
    request<Session>(`/api/sessions/${id}/complete`, { method: "PATCH" }),

  getPhotos: (sessionId: string) =>
    request<Photo[]>(`/api/sessions/${sessionId}/photos`),

  toggleSelect: (photoId: string, selected: boolean) =>
    request<Photo>(`/api/photos/${photoId}/select`, {
      method: "PATCH",
      body: JSON.stringify({ selected }),
    }),

  getDownloadLink: (sessionId: string) =>
    request<DownloadInfo>(`/api/sessions/${sessionId}/download-link`, {
      method: "POST",
    }),

  movePhotos: (data: {
    photoIds: string[];
    targetSessionId?: string;
    newGroup?: boolean;
  }) =>
    request<{ target: Session; sources: Session[] }>("/api/photos/move", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getRecentPhoto: () => request<Photo>("/api/photos/recent").catch(() => null),

  saveContact: (data: {
    sessionId: string;
    name: string;
    email?: string;
    phone?: string;
    downloadToken: string;
    selectedPhotoIds: string[];
  }) =>
    request<{ id: string }>("/api/contacts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getConfig: () =>
    request<{ eventName: string; autoResetSeconds: number; wifiNetwork: string | null; wifiPassword: string | null }>("/api/config"),
};
