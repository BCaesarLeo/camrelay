import { db } from "./db.js";

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      short_code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      photo_count INTEGER NOT NULL DEFAULT 0,
      selected_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      original_filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      full_path TEXT,
      thumb_path TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      selected INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS download_tokens (
      token TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id);
    CREATE INDEX IF NOT EXISTS idx_photos_session_selected ON photos(session_id, selected);
    CREATE INDEX IF NOT EXISTS idx_tokens_session ON download_tokens(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  `);
}
