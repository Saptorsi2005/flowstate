/**
 * lib/db.js — Neon Postgres client + auto-bootstrap
 *
 * Tables are created automatically on first cold start.
 * New columns are added via ALTER TABLE … ADD COLUMN IF NOT EXISTS
 * so the live DB self-heals without manual migration.
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

  // ── Create tables ─────────────────────────────────────────────
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

  // ── Self-heal: add new columns if they don't exist ────────────
  // All ADD COLUMN IF NOT EXISTS are idempotent — safe on live DB.
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS blocked_group_names TEXT[] DEFAULT '{}'`;
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS blocked_group_domains JSONB DEFAULT '{}'`;
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS allowed_group_names TEXT[] DEFAULT '{}'`;
}
