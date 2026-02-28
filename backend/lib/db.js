/**
 * lib/db.js — Neon Postgres client + auto-bootstrap
 *
 * Tables are created automatically on first cold start.
 * Schema evolves via self-healing ALTER TABLE / DROP CONSTRAINT statements.
 */

import { neon } from '@neondatabase/serverless';

let _sql = null;

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = neon(url);
  }
  return _sql;
}

let _initialized = false;

export async function initDB() {
  if (_initialized) return;
  _initialized = true;

  const sql = getDb();

  // ── Core tables ───────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT,
      name        TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
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
    )
  `;

  // ── Focus Stats: one row PER SESSION (no unique workspace+date constraint) ──
  await sql`
    CREATE TABLE IF NOT EXISTS focus_stats (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      workspace_id         TEXT NOT NULL,
      date                 DATE NOT NULL,
      deep_focus_minutes   INTEGER DEFAULT 0,
      blocked_attempts     INTEGER DEFAULT 0,
      successful_unlocks   INTEGER DEFAULT 0,
      failed_unlocks       INTEGER DEFAULT 0,
      strict_mode_minutes  INTEGER DEFAULT 0,
      focus_score          INTEGER DEFAULT 0,
      created_at           TIMESTAMP DEFAULT NOW()
    )
  `;

  // Drop the old UNIQUE(workspace_id, date) constraint if it exists
  // (it prevented multiple sessions per workspace per day)
  await sql`
    ALTER TABLE focus_stats
    DROP CONSTRAINT IF EXISTS focus_stats_workspace_id_date_key
  `;

  // ── Self-heal: add workspace columns if missing ────────────────
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS blocked_group_names TEXT[] DEFAULT '{}'`;
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS blocked_group_domains JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowed_group_names TEXT[] DEFAULT '{}'`;
}
