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

// WebSocket messages
export type WSClientMessage = {
  type: "join_session";
  sessionId: string;
};

export type WSServerMessage =
  | { type: "photo_added"; photo: Photo }
  | { type: "photo_processing"; filename: string }
  | { type: "photo_error"; filename: string; error: string }
  | { type: "session_updated"; session: Session };
