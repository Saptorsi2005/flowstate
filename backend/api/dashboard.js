/**
 * api/dashboard.js — GET /api/dashboard
 *
 * Returns aggregated focus data for the authenticated user.
 * Used exclusively by the React frontend — never by the extension.
 *
 * Response is computed at request-time from Neon.
 * For high traffic, add Vercel KV caching in front of getDashboardData().
 */

import { verifyRequest, AuthError } from '../lib/auth.js';
import { getDb, upsertUser, getDashboardData } from '../lib/db.js';
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

    // ── CORS preflight ────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // ── Auth ──────────────────────────────────────────────────────
    let identity;
    try {
        identity = await verifyRequest(req);
    } catch (err) {
        const status = err instanceof AuthError ? err.status : 401;
        res.status(status).json({ error: err.message });
        return;
    }

    // ── Rate limit: 60 reads/minute ───────────────────────────────
    const rl = checkRateLimit(rateLimitKey(identity.sub, 'dashboard'), 60, 60_000);
    if (!rl.allowed) {
        res.status(429).json({
            error: 'Rate limit exceeded',
            resetMs: rl.resetMs,
        });
        return;
    }

    try {
        const sql = getDb();

        // Ensure user exists (may be first dashboard load before any sync)
        const user = await upsertUser(sql, identity.sub, identity.email);

        // Fetch all dashboard data in parallel queries
        const data = await getDashboardData(sql, user.id);

        res.status(200).json({
            user: {
                email: user.email,
                createdAt: user.created_at,
            },
            workspaces: data.workspaces,
            recentSessions: data.recentSessions,
            topBlockedDomains: data.topBlockedDomains,
            weeklyStats: data.weeklyStats,
            totalFocusTimeMs: data.totalFocusTimeMs,
            totalSessions: data.totalSessions,
        });

    } catch (err) {
        console.error('[FlowState /api/dashboard] DB error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
