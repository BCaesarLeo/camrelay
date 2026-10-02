export interface Event {
  id: string;
  name: string;
  createdAt: string;
  sessionCount: number;
}

export interface Session {
  id: string;
  eventId: string;
  shortCode: string;
  name: string | null;
  sessionNumber: number;
  color: string;
  status: "active" | "complete" | "expired";
  createdAt: string;
  completedAt: string | null;
  photoCount: number;
  selectedCount: number;
  coverUrl: string | null;
  // Session number this group was split out of via "Not us", if any
  splitFrom: number | null;
}

export interface Photo {
  id: string;
  sessionId: string;
  originalFilename: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
  status: "processing" | "ready" | "error";
  selected: boolean;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export interface DownloadInfo {
  downloadUrl: string;
  qrDataUrl: string;
  wifiQrDataUrl: string | null;
  selectedCount: number;
}

export interface Contact {
  id: string;
  sessionId: string;
  eventId: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

// A guest who asked us to find their photos, waiting for staff to pick them out
export interface PendingGuest {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  selfieUrl: string | null;
  selfieThumbUrl: string | null;
  // Sessions shot nearest in time to when the guest logged their email
  suggestions: Session[];
}

// WebSocket messages
export type WSClientMessage = {
  type: "join_session";
  sessionId: string;
};

export type WSServerMessage =
  | { type: "photo_added"; photo: Photo }
  | { type: "photo_processing"; filename: string }
  | { type: "photo_error"; filename: string; error: string }
  | { type: "session_updated"; session: Session }
  | { type: "photos_moved"; photoIds: string[]; toSessionId: string };
