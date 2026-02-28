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

export default async function handler(req, res) {
    // ── CORS preflight ────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
        return res.status(204).set(CORS_HEADERS).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth ──────────────────────────────────────────────────────
    let identity;
    try {
        identity = await verifyRequest(req);
    } catch (err) {
        const status = err instanceof AuthError ? err.status : 401;
        res.status(status);
        Object.entries(CORS_HEADERS).forEach(([key, value]) => {
            res.setHeader(key, value);
        });
        return res.json({ error: err.message });
    }

    // ── Rate limit: 60 reads/minute ───────────────────────────────
    const rl = checkRateLimit(rateLimitKey(identity.sub, 'dashboard'), 60, 60_000);
    if (!rl.allowed) {
        return res.status(429).set(CORS_HEADERS).json({
            error: 'Rate limit exceeded',
            resetMs: rl.resetMs,
        });
    }

    try {
        const sql = getDb();

        // Ensure user exists (may be first dashboard load before any sync)
        const user = await upsertUser(sql, identity.sub, identity.email);

        // Fetch all dashboard data in parallel queries
        const data = await getDashboardData(sql, user.id);

        return res.status(200).set(CORS_HEADERS).json({
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
        return res.status(500).set(CORS_HEADERS).json({ error: 'Internal server error' });
    }
}
