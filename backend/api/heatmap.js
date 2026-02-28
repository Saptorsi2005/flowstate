/**
 * api/heatmap.js — GET /api/heatmap
 *
 * Returns daily aggregated focus scores for the last 140 days to render the activity heatmap.
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
        console.error('[heatmap] initDB failed:', err.message);
        res.status(500).json({ error: 'Database initialization failed' }); return;
    }

    let identity;
    try { identity = await verifyRequest(req); } catch (err) {
        res.status(err instanceof AuthError ? err.status : 401).json({ error: err.message }); return;
    }

    const rl = checkRateLimit(rateLimitKey(identity.sub, 'heatmap'), 60, 60_000);
    if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded', resetMs: rl.resetMs }); return; }

    try {
        const sql = getDb();
        const userId = identity.sub;

        // Query the latest 154 sessions (22 weeks * 7 days grid) for the user
        const sessions = await sql`
      SELECT 
        id,
        focus_score as score, 
        blocked_attempts as blocks,
        total_duration_ms as duration,
        start_time as started_at
      FROM focus_stats
      WHERE user_id = ${userId}
      ORDER BY start_time DESC
      LIMIT 154
    `;

        res.status(200).json({ sessions });

    } catch (err) {
        console.error('[heatmap] DB error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
}
