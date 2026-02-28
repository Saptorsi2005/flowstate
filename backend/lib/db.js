/**
 * lib/db.js — Neon Postgres client (serverless, connection-pooled)
 *
 * Uses @neondatabase/serverless which works in Vercel Edge Runtime.
 * Connection is created per-request (serverless pattern — no persistent pool).
 */

import { neon } from '@neondatabase/serverless';

/**
 * Returns a tagged-template SQL executor bound to the DATABASE_URL env var.
 * Usage:
 *   const sql = getDb();
 *   const rows = await sql`SELECT * FROM users WHERE auth0_id = ${id}`;
 */
export function getDb() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL env var is not set');
    return neon(url);
}

/**
 * Upsert a user row by auth0_id.
 * Returns the user record (id, auth0_id, email).
 */
export async function upsertUser(sql, auth0Id, email = null) {
    const rows = await sql`
    INSERT INTO users (auth0_id, email)
    VALUES (${auth0Id}, ${email})
    ON CONFLICT (auth0_id) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, users.email)
    RETURNING id, auth0_id, email, created_at
  `;
    return rows[0];
}

/**
 * Upsert a workspace snapshot for a user.
 * Idempotent — safe to call on every sync.
 */
export async function upsertWorkspace(sql, userId, ws) {
    await sql`
    INSERT INTO workspaces (
      id, user_id, name, focus_mode,
      blocked_domains, allowed_domains, todos_json,
      saved_tabs_count, created_at, updated_at
    ) VALUES (
      ${ws.id}, ${userId}, ${ws.name}, ${ws.focusMode},
      ${ws.blockedDomains}, ${ws.allowedDomains},
      ${JSON.stringify(ws.todos || [])},
      ${ws.savedTabsCount || 0},
      to_timestamp(${ws.createdAt} / 1000.0),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      name              = EXCLUDED.name,
      focus_mode        = EXCLUDED.focus_mode,
      blocked_domains   = EXCLUDED.blocked_domains,
      allowed_domains   = EXCLUDED.allowed_domains,
      todos_json        = EXCLUDED.todos_json,
      saved_tabs_count  = EXCLUDED.saved_tabs_count,
      updated_at        = now()
  `;
}

/**
 * Insert a focus session record. Uses checksum as idempotency key.
 * Duplicate checksums (same session synced twice) are silently ignored.
 */
export async function insertSession(sql, userId, session, checksum) {
    if (!session) return;
    await sql`
    INSERT INTO focus_sessions (
      user_id, workspace_id, workspace_name,
      started_at, ended_at, elapsed_ms,
      todos_completed, todos_total, checksum
    ) VALUES (
      ${userId},
      ${session.workspaceId || null},
      ${session.workspaceName || null},
      ${session.startedAt},
      ${session.endedAt || null},
      ${session.elapsedMs || 0},
      ${session.todosCompleted || 0},
      ${session.todosTotal || 0},
      ${checksum}
    )
    ON CONFLICT (checksum) DO NOTHING
  `;
}

/**
 * Bulk-insert block events. Each event is idempotent by (user_id, domain, occurred_at).
 */
export async function insertBlockEvents(sql, userId, workspaceId, events) {
    if (!events || events.length === 0) return;
    for (const ev of events) {
        await sql`
      INSERT INTO block_events (
        user_id, workspace_id, domain, block_type, focus_mode, occurred_at
      ) VALUES (
        ${userId},
        ${workspaceId || null},
        ${ev.domain},
        ${ev.blockType || 'manual'},
        ${ev.focusMode || 'easy'},
        ${ev.occurredAt}
      )
      ON CONFLICT (user_id, domain, occurred_at) DO NOTHING
    `;
    }
}

/**
 * Fetch all dashboard data for a user in one query set.
 */
export async function getDashboardData(sql, userId) {
    const [workspaces, recentSessions, topBlocked, weeklyStats, totals] =
        await Promise.all([
            // All workspaces
            sql`
        SELECT id, name, focus_mode, blocked_domains, allowed_domains,
               todos_json, saved_tabs_count, created_at, updated_at
        FROM workspaces
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
      `,

            // Last 20 sessions
            sql`
        SELECT workspace_name, started_at, ended_at, elapsed_ms,
               todos_completed, todos_total
        FROM focus_sessions
        WHERE user_id = ${userId}
        ORDER BY started_at DESC
        LIMIT 20
      `,

            // Top 10 blocked domains (last 30 days)
            sql`
        SELECT domain, COUNT(*) AS count
        FROM block_events
        WHERE user_id = ${userId}
          AND occurred_at >= now() - INTERVAL '30 days'
        GROUP BY domain
        ORDER BY count DESC
        LIMIT 10
      `,

            // Weekly stats (last 7 days)
            sql`
        SELECT
          date_trunc('day', started_at)::date AS date,
          COALESCE(SUM(elapsed_ms), 0)        AS focus_ms,
          COUNT(*)                            AS sessions
        FROM focus_sessions
        WHERE user_id = ${userId}
          AND started_at >= now() - INTERVAL '7 days'
        GROUP BY 1
        ORDER BY 1
      `,

            // Totals
            sql`
        SELECT
          COALESCE(SUM(elapsed_ms), 0) AS total_focus_ms,
          COUNT(*)                     AS total_sessions
        FROM focus_sessions
        WHERE user_id = ${userId}
      `,
        ]);

    return {
        workspaces,
        recentSessions,
        topBlockedDomains: topBlocked,
        weeklyStats,
        totalFocusTimeMs: Number(totals[0]?.total_focus_ms ?? 0),
        totalSessions: Number(totals[0]?.total_sessions ?? 0),
    };
}
