/**
 * api/profile.js — GET /api/profile
 *
 * Returns user profile data with aggregated stats.
 */

import { verifyRequest, AuthError } from '../lib/auth.js';
import { getDb, initDB } from '../lib/db.js';
import { checkRateLimit, rateLimitKey } from '../lib/ratelimit.js';

/* ──────────────────────────────────────────────────────────────
   CORS CONFIG (React Frontend Support)
   ────────────────────────────────────────────────────────────── */

const ALLOWED_ORIGIN =
  process.env.NODE_ENV === 'production'
    ? 'https://your-frontend-domain.com' // 🔁 Replace in production
    : 'http://localhost:5173';

function setCors(req, res) {
  const origin = req.headers.origin;

  const allowedOrigins = [
    'http://localhost:5173',
    'https://your-frontend-domain.com'
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type'
  );
}

/* ──────────────────────────────────────────────────────────────
   Helper: Calculate current streak
   ────────────────────────────────────────────────────────────── */

async function calculateStreak(sql, userId) {
  const rows = await sql`
        SELECT date, AVG(focus_score) as daily_score
        FROM focus_stats
        WHERE user_id = ${userId}
        GROUP BY date
        ORDER BY date DESC
    `;

  let streak = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowDate = new Date(rows[i].date).toISOString().split('T')[0];
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - i);
    const expected = expectedDate.toISOString().split('T')[0];

    if (rowDate !== expected) break;
    if (Number(rows[i].daily_score) < 60) break;
    streak++;
  }

  return streak;
}

/* ──────────────────────────────────────────────────────────────
   Handler
   ────────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  setCors(req, res);

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await initDB();
  } catch (err) {
    console.error('[profile] initDB failed:', err.message);
    return res.status(500).json({ error: 'Database initialization failed' });
  }

  let identity;
  try {
    identity = await verifyRequest(req);
  } catch (err) {
    return res
      .status(err instanceof AuthError ? err.status : 401)
      .json({ error: err.message });
  }

  const rl = checkRateLimit(
    rateLimitKey(identity.sub, 'profile'),
    30,
    60_000
  );

  if (!rl.allowed) {
    return res
      .status(429)
      .json({ error: 'Rate limit exceeded', resetMs: rl.resetMs });
  }

  try {
    const sql = getDb();
    const userId = identity.sub;

    /* ── User ───────────────────────────────────────────── */

    const userRows = await sql`
      SELECT id, email, name, created_at
      FROM users
      WHERE id = ${userId}
    `;

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRows[0];

    /* ── Total Workspaces ───────────────────────────────── */

    const workspaceCount = await sql`
      SELECT COUNT(*) as count
      FROM workspaces
      WHERE user_id = ${userId}
    `;

    const totalWorkspaces = Number(workspaceCount[0]?.count ?? 0);

    /* ── Total Deep Work Hours ─────────────────────────── */

    const deepWorkRows = await sql`
      SELECT COALESCE(SUM(deep_focus_minutes), 0) as total_minutes
      FROM focus_stats
      WHERE user_id = ${userId}
    `;

    const totalDeepWorkHours = Math.round(
      Number(deepWorkRows[0]?.total_minutes ?? 0) / 60
    );

    /* ── Today's Focus Score ───────────────────────────── */

    const todayRows = await sql`
      SELECT COALESCE(AVG(focus_score), 0) as avg_score
      FROM focus_stats
      WHERE user_id = ${userId}
        AND date = CURRENT_DATE
    `;

    const todayFocusScore = Math.round(
      Number(todayRows[0]?.avg_score ?? 0)
    );

    /* ── Current Streak ───────────────────────────────── */

    const currentStreak = await calculateStreak(sql, userId);

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
      },
      stats: {
        totalWorkspaces,
        totalDeepWorkHours,
        todayFocusScore,
        currentStreak,
      },
    });

  } catch (err) {
    console.error('[profile] DB error:', err.message, err.stack);
    return res.status(500).json({ error: 'Database error' });
  }
}