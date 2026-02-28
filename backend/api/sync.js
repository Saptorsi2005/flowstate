/**
 * api/sync.js — POST /api/sync
 * Persists workspaces + per-session focus_stats from the Chrome extension.
 *
 * focus_stats: each entry has a unique session `id` (generated on activate).
 * ON CONFLICT (id) DO UPDATE re-syncs the same session safely if retried.
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

    try { await initDB(); } catch (err) {
        console.error('[sync] initDB failed:', err.message);
        res.status(500).json({ error: 'Database initialization failed' }); return;
    }

    let identity;
    try { identity = await verifyRequest(req); } catch (err) {
        res.status(err instanceof AuthError ? err.status : 401).json({ error: err.message }); return;
    }

    const rl = checkRateLimit(rateLimitKey(identity.sub, 'sync'), 20, 60_000);
    if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded', resetMs: rl.resetMs }); return; }

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch {
        res.status(400).json({ error: 'Invalid JSON body' }); return;
    }

    const workspaces = body?.workspaces ?? [];
    const focusStats = body?.focus_stats ?? [];
    if (!Array.isArray(workspaces)) { res.status(400).json({ error: 'workspaces must be an array' }); return; }

    try {
        const sql = getDb();
        const { sub: userId, email = null, name = null } = identity;

        // 1. Upsert user
        await sql`
      INSERT INTO users (id, email, name) VALUES (${userId}, ${email}, ${name})
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
    `;

        // 2. Replace workspaces
        await sql`DELETE FROM workspaces WHERE user_id = ${userId}`;
        for (const ws of workspaces) {
            await sql`
        INSERT INTO workspaces (
          id, user_id, name, focus_mode,
          blocked_domains, allowed_domains,
          blocked_group_names, blocked_group_domains,
          allowed_group_names,
          todos, saved_tabs_count, updated_at
        ) VALUES (
          ${ws.id}, ${userId}, ${ws.name ?? 'Untitled'}, ${ws.focusMode ?? 'easy'},
          ${ws.blockedDomains ?? []}, ${ws.allowedDomains ?? []},
          ${ws.blockedGroupNames ?? []}, ${JSON.stringify(ws.blockedGroupDomains ?? {})},
          ${ws.allowedGroupNames ?? []},
          ${JSON.stringify(ws.todos ?? [])}, ${ws.savedTabsCount ?? 0}, NOW()
        )
      `;
        }

        // 3. Upsert focus_stats — each session has a unique id, safe to re-upsert on retry
        for (const fs of focusStats) {
            if (!fs.id || !fs.workspace_id || !fs.date) continue;
            await sql`
        INSERT INTO focus_stats (
          id, user_id, workspace_id, date,
          deep_focus_minutes, blocked_attempts,
          successful_unlocks, failed_unlocks,
          strict_mode_minutes, focus_score
        ) VALUES (
          ${fs.id}, ${userId}, ${fs.workspace_id}, ${fs.date},
          ${fs.deep_focus_minutes ?? 0},
          ${fs.blocked_attempts ?? 0},
          ${fs.successful_unlocks ?? 0},
          ${fs.failed_unlocks ?? 0},
          ${fs.strict_mode_minutes ?? 0},
          ${fs.focus_score ?? 0}
        )
        ON CONFLICT (id) DO UPDATE SET
          deep_focus_minutes  = EXCLUDED.deep_focus_minutes,
          blocked_attempts    = EXCLUDED.blocked_attempts,
          successful_unlocks  = EXCLUDED.successful_unlocks,
          failed_unlocks      = EXCLUDED.failed_unlocks,
          strict_mode_minutes = EXCLUDED.strict_mode_minutes,
          focus_score         = EXCLUDED.focus_score
      `;
        }

        res.status(200).json({ ok: true, syncedAt: new Date().toISOString() });
    } catch (err) {
        console.error('[sync] DB error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
}
