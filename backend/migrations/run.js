/**
 * migrations/run.js — Creates Neon tables directly via SQL statements
 *
 * Usage: npm run migrate
 * Safe to re-run — all DDL uses IF NOT EXISTS
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load .env from backend root automatically
try {
    const env = readFileSync(join(__dir, '../.env'), 'utf8');
    for (const line of env.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !process.env[key]) process.env[key] = val;
    }
} catch { /* .env not found — environment vars must be set externally */ }

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('❌  DATABASE_URL is not set. Add it to backend/.env');
    process.exit(1);
}

const sql = neon(url);

console.log('🔄  Creating tables in Neon…\n');

try {
    // Create users table
    await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT,
      name        TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `;
    console.log('  ✓ users table ready');

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
    console.log('  ✓ workspaces table ready');

    console.log('\n✅  All tables created. Refresh Neon dashboard to confirm.');
} catch (err) {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
}
