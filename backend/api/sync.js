/**
 * api/sync.js — POST /api/sync
 *
 * Receives workspace snapshots, session records, and block events
 * from the Chrome extension and persists them to Neon Postgres.
 *
 * IDEMPOTENCY:
 *   - Workspaces: upserted by primary key (workspace id)
 *   - Sessions:   deduplicated by checksum column (ON CONFLICT DO NOTHING)
 *   - Block events: deduplicated by (user_id, domain, occurred_at)
 *
 * GUARANTEES:
 *   - This endpoint never pushes data back to the extension.
 *   - It is entirely passive — the extension does not depend on it.
 *   - If this returns an error, the extension queues the payload and retries.
 */

import { verifyRequest, handleCors, AuthError } from '../lib/auth.js';
import { getDb, upsertUser, upsertWorkspace, insertSession, insertBlockEvents } from '../lib/db.js';
import { checkRateLimit, rateLimitKey } from '../lib/ratelimit.js';

export default async function handler(req, res) {
    // ── CORS preflight ────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
        return res.status(204)
            .setHeader('Access-Control-Allow-Origin', '*')
            .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
            .setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Checksum')
            .end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ── Auth ──────────────────────────────────────────────────────
    let identity;
    try {
        identity = await verifyRequest(req);
    } catch (err) {
        const status = err instanceof AuthError ? err.status : 401;
        return res.status(status).json({ error: err.message });
    }

    // ── Rate limit: 20 syncs/minute per user ──────────────────────
    const rl = checkRateLimit(rateLimitKey(identity.sub, 'sync'), 20, 60_000);
    if (!rl.allowed) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            resetMs: rl.resetMs,
        });
    }

    // ── Parse body ────────────────────────────────────────────────
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const {
        workspaces = [],
        session = null,
        blockEvents = [],
        checksum = null,
    } = body;

    // Validate minimal shape
    if (!Array.isArray(workspaces)) {
        return res.status(400).json({ error: 'workspaces must be an array' });
    }

    // ── DB operations ─────────────────────────────────────────────
    try {
        const sql = getDb();

        // 1. Upsert user (create on first sync)
        const user = await upsertUser(sql, identity.sub, identity.email);

        // 2. Upsert all workspace snapshots
        await Promise.all(
            workspaces.map(ws => upsertWorkspace(sql, user.id, ws))
        );

        // 3. Insert session record (deduped by checksum)
        const activeWorkspaceId = session?.workspaceId ?? null;
        await insertSession(sql, user.id, session, checksum);

        // 4. Insert block events (deduped by user+domain+time)
        await insertBlockEvents(sql, user.id, activeWorkspaceId, blockEvents);

        return res.status(200)
            .setHeader('Access-Control-Allow-Origin', '*')
            .json({
                ok: true,
                syncedAt: new Date().toISOString(),
            });

    } catch (err) {
        console.error('[FlowState /api/sync] DB error:', err);
        return res.status(500)
            .setHeader('Access-Control-Allow-Origin', '*')
            .json({ error: 'Internal server error' });
    }
}
