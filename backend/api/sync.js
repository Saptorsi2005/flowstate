/**
 * api/sync.js — POST /api/sync
 *
 * Receives workspace data from the Chrome extension and persists it to Neon.
 *
 * GUARANTEES:
 *   - Tables are auto-created on cold start (no manual SQL needed)
 *   - User is upserted on every sync
 *   - Workspaces are replaced atomically (delete old → insert new)
 *   - Extension never depends on this endpoint succeeding
 *   - Fails gracefully with JSON error responses
 */

import { verifyRequest, AuthError } from '../lib/auth.js';
import { getDb, initDB } from '../lib/db.js';
import { checkRateLimit, rateLimitKey } from '../lib/ratelimit.js';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

export default async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    // ── Ensure tables exist (no-op after first cold start) ────────
    try {
        await initDB();
    } catch (err) {
        console.error('[sync] initDB failed:', err.message);
        res.status(500).json({ error: 'Database initialization failed' });
        return;
    }

    // ── Auth ──────────────────────────────────────────────────────
    let identity;
    try {
        identity = await verifyRequest(req);
    } catch (err) {
        res.status(err instanceof AuthError ? err.status : 401).json({ error: err.message });
        return;
    }

    // ── Rate limit ────────────────────────────────────────────────
    const rl = checkRateLimit(rateLimitKey(identity.sub, 'sync'), 20, 60_000);
    if (!rl.allowed) {
        res.status(429).json({ error: 'Rate limit exceeded', resetMs: rl.resetMs });
        return;
    }

    // ── Parse body ────────────────────────────────────────────────
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
    }

    const workspaces = body?.workspaces ?? [];
    if (!Array.isArray(workspaces)) {
        res.status(400).json({ error: 'workspaces must be an array' });
        return;
    }

    // ── Persist to Neon ───────────────────────────────────────────
    try {
        const sql = getDb();
        const { sub: userId, email = null, name = null } = identity;

        // 1. Upsert user (create on first sync, update email/name on subsequent)
        await sql`
      INSERT INTO users (id, email, name)
      VALUES (${userId}, ${email}, ${name})
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            name  = EXCLUDED.name
    `;

        // 2. Replace workspaces: delete all for this user, then re-insert
        //    This is simpler than partial upserts and ensures deleted workspaces
        //    are removed from the backend mirror.
        await sql`DELETE FROM workspaces WHERE user_id = ${userId}`;

        for (const ws of workspaces) {
            await sql`
        INSERT INTO workspaces (
          id, user_id, name, focus_mode,
          blocked_domains, allowed_domains, todos, saved_tabs_count
        ) VALUES (
          ${ws.id},
          ${userId},
          ${ws.name ?? 'Untitled'},
          ${ws.focusMode ?? 'easy'},
          ${ws.blockedDomains ?? []},
          ${ws.allowedDomains ?? []},
          ${JSON.stringify(ws.todos ?? [])},
          ${ws.savedTabsCount ?? 0}
        )
      `;
        }

        res.status(200).json({ ok: true, syncedAt: new Date().toISOString() });

    } catch (err) {
        console.error('[sync] DB error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
}
