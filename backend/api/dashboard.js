/**
 * api/dashboard.js — GET /api/dashboard
 *
 * Returns real user + workspace data from Neon for the React dashboard.
 * Never called by the extension.
 *
 * Response:
 * {
 *   user:       { id, email, name, created_at },
 *   workspaces: [ ... ],
 *   stats: {
 *     totalWorkspaces,
 *     totalSavedTabs
 *   }
 * }
 */

import { verifyRequest, AuthError } from '../lib/auth.js';
import { getDb, initDB } from '../lib/db.js';
import { checkRateLimit, rateLimitKey } from '../lib/ratelimit.js';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization',
};

function setCors(res) {
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

export default async function handler(req, res) {
    setCors(res);

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

    // ── Ensure tables exist ───────────────────────────────────────
    try {
        await initDB();
    } catch (err) {
        console.error('[dashboard] initDB failed:', err.message);
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

    // ── Rate limit: 60 reads/minute ───────────────────────────────
    const rl = checkRateLimit(rateLimitKey(identity.sub, 'dashboard'), 60, 60_000);
    if (!rl.allowed) {
        res.status(429).json({ error: 'Rate limit exceeded', resetMs: rl.resetMs });
        return;
    }

    // ── Fetch data from Neon ──────────────────────────────────────
    try {
        const sql = getDb();
        const userId = identity.sub;

        // Fetch user
        const userRows = await sql`
      SELECT id, email, name, created_at
      FROM users
      WHERE id = ${userId}
    `;

        if (userRows.length === 0) {
            // User has never synced — return empty state, not an error
            res.status(200).json({
                user: null,
                workspaces: [],
                stats: { totalWorkspaces: 0, totalSavedTabs: 0 },
            });
            return;
        }

        const user = userRows[0];

        // Fetch workspaces
        const workspaces = await sql`
      SELECT
        id, name, focus_mode,
        blocked_domains, allowed_domains,
        todos, saved_tabs_count, created_at
      FROM workspaces
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;

        // Compute stats
        const totalSavedTabs = workspaces.reduce(
            (sum, ws) => sum + (ws.saved_tabs_count ?? 0), 0
        );

        res.status(200).json({
            user,
            workspaces,
            stats: {
                totalWorkspaces: workspaces.length,
                totalSavedTabs,
            },
        });

    } catch (err) {
        console.error('[dashboard] DB error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
}
