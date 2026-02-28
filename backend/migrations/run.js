/**
 * migrations/run.js — Neon migration runner
 *
 * Reads all SQL files from this directory in order and executes them.
 * Usage: node migrations/run.js
 *
 * Safe to re-run — all DDL uses IF NOT EXISTS.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;

if (!url) {
    console.error('❌  DATABASE_URL is not set. Check your .env file.');
    process.exit(1);
}

const sql = neon(url);

const files = readdirSync(__dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

console.log(`🔄  Running ${files.length} migration(s)…\n`);

for (const file of files) {
    const filePath = join(__dir, file);
    const content = readFileSync(filePath, 'utf8');

    console.log(`  ▶ ${file}`);
    try {
        await sql.call(neon(url), content);
        console.log(`  ✓ ${file} — OK\n`);
    } catch (err) {
        console.error(`  ✗ ${file} — FAILED: ${err.message}`);
        process.exit(1);
    }
}

console.log('✅  All migrations complete.');
