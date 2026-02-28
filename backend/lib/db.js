/**
 * lib/db.js — Neon Postgres client + auto-bootstrap
 *
 * Uses @neondatabase/serverless tagged template queries.
 * Tables are created automatically on the first cold start (CREATE TABLE IF NOT EXISTS).
 * No manual SQL or migrations needed.
 */

import { neon } from '@neondatabase/serverless';

// Module-level singleton — created once per Vercel function instance
let _sql = null;

export function getDb() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL environment variable is not set');
    _sql = neon(url);
  }
  return _sql;
}

// Guard: only run CREATE TABLE statements once per cold start
let _initialized = false;

/**
 * initDB() — creates tables if they don't exist.
 * Safe to call at the top of every handler (no-op after first call).
 */
export async function initDB() {
  if (_initialized) return;
  _initialized = true;

  const sql = getDb();

  // Create users table first (workspaces references it)
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT,
      name        TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create workspaces table
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
}
