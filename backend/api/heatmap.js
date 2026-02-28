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

        // Query the focus_stats for the user over the last 140 days, aggregating the focus_score per day
        const rows = await sql`
      SELECT 
        date, 
        ROUND(AVG(focus_score)) as score, 
        SUM(blocked_attempts) as blocks,
        COUNT(*) as sessions
      FROM focus_stats
      WHERE user_id = ${userId}
        AND date >= CURRENT_DATE - INTERVAL '140 days'
      GROUP BY date
      ORDER BY date ASC
    `;

        // Format as an array/map of date strings to stats
        const heatmapData = {};
        for (const row of rows) {
            // Neon's postgres might return Date objects or strings based on parsing. 
            // We ensure it's formatted as YYYY-MM-DD
            const dateStr = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : new Date(row.date).toISOString().slice(0, 10);
            heatmapData[dateStr] = {
                score: Number(row.score ?? 0),
                blocks: Number(row.blocks ?? 0),
                sessions: Number(row.sessions ?? 0)
            };
        }

        res.status(200).json({ heatmap: heatmapData });

    } catch (err) {
        console.error('[heatmap] DB error:', err.message, err.stack);
        res.status(500).json({ error: 'Database error' });
    }
}
