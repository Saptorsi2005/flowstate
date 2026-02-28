/**
 * api/dashboard.js — GET /api/dashboard
 *
 * Returns user, workspaces, and focus score stats for the React dashboard.
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

    try { await initDB(); } catch (err) {
        console.error('[dashboard] initDB failed:', err.message);
        res.status(500).json({ error: 'Database initialization failed' }); return;
    }

    let identity;
    try { identity = await verifyRequest(req); } catch (err) {
        res.status(err instanceof AuthError ? err.status : 401).json({ error: err.message }); return;
    }

    const rl = checkRateLimit(rateLimitKey(identity.sub, 'dashboard'), 60, 60_000);
    if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded', resetMs: rl.resetMs }); return; }

    try {
        const sql = getDb();
        const userId = identity.sub;

        // ── User ──────────────────────────────────────────────────────
        const userRows = await sql`SELECT id, email, name, created_at FROM users WHERE id = ${userId}`;
        if (userRows.length === 0) {
            res.status(200).json({
                user: null, workspaces: [],
                stats: { totalWorkspaces: 0, totalSavedTabs: 0, todayFocusScore: 0, weeklyAverageFocusScore: 0, todayBlockedAttempts: 0 },
            });
            return;
        }
        const user = userRows[0];

        // ── Workspaces ────────────────────────────────────────────────
        const workspaces = await sql`
      SELECT id, name, focus_mode, blocked_domains, allowed_domains,
             todos, saved_tabs_count, created_at
      FROM workspaces WHERE user_id = ${userId} ORDER BY created_at ASC
    `;
        const totalSavedTabs = workspaces.reduce((s, w) => s + (w.saved_tabs_count ?? 0), 0);

        // ── Focus stats: today ─────────────────────────────────────────
        // Aggregate across all workspaces for this user for today's date (UTC)
        const todayRows = await sql`
      SELECT
        COALESCE(SUM(focus_score), 0)       AS total_score,
        COALESCE(SUM(blocked_attempts), 0)  AS total_blocked,
        COUNT(*)                            AS session_count
      FROM focus_stats
      WHERE user_id = ${userId}
        AND date = CURRENT_DATE
    `;
        const todayFocusScore = todayRows[0]?.session_count > 0
            ? Math.round(Number(todayRows[0].total_score) / Number(todayRows[0].session_count))
            : 0;
        const todayBlockedAttempts = Number(todayRows[0]?.total_blocked ?? 0);

        // ── Focus stats: last 7 days average ──────────────────────────
        const weeklyRows = await sql`
      SELECT COALESCE(AVG(daily_avg), 0) AS weekly_avg
      FROM (
        SELECT date, AVG(focus_score) AS daily_avg
        FROM focus_stats
        WHERE user_id = ${userId}
          AND date >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY date
      ) daily
    `;
        const weeklyAverageFocusScore = Math.round(Number(weeklyRows[0]?.weekly_avg ?? 0));

        res.status(200).json({
            user,
            workspaces,
            stats: {
                totalWorkspaces: workspaces.length,
                totalSavedTabs,
                todayFocusScore,
                weeklyAverageFocusScore,
                todayBlockedAttempts,
            },
        });

    } catch (err) {
        console.error('[dashboard] DB error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
}
