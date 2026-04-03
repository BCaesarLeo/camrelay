import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config } from "./config.js";

// Ensure storage directory exists before opening DB
fs.mkdirSync(config.storagePath, { recursive: true });

const dbPath = path.join(config.storagePath, "cam.db");

export const db = new Database(dbPath);

// Enable WAL mode for concurrent reads during photo serving
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

// Auto-migrate on load so tables exist before prepared statements in other modules
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    session_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    short_code TEXT UNIQUE NOT NULL,
    name TEXT,
    session_number INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '#4353FF',
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
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    selected_photo_ids TEXT,
    download_token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id);
  CREATE INDEX IF NOT EXISTS idx_photos_session_selected ON photos(session_id, selected);
  CREATE INDEX IF NOT EXISTS idx_tokens_session ON download_tokens(session_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_event ON sessions(event_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_session ON contacts(session_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_event ON contacts(event_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_synced ON contacts(synced);
`);
