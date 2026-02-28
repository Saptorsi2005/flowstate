-- migrations/001_initial.sql
-- Auto-run via: npm run migrate
-- Safe to re-run — all DDL uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT,
  name        TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  focus_mode       TEXT DEFAULT 'easy',
  blocked_domains  TEXT[],
  allowed_domains  TEXT[],
  todos            JSONB,
  saved_tabs_count INTEGER,
  created_at       TIMESTAMP DEFAULT NOW()
);
