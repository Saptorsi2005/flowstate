/**
 * lib/ratelimit.js — Simple in-memory rate limiter (per user, per endpoint)
 *
 * Vercel serverless functions are stateless, so this is per-instance.
 * For production scale, replace the in-memory Map with Upstash Redis.
 *
 * Strategy: sliding window — tracks request timestamps per key.
 */

// Map<key → number[]> — timestamps of recent requests
const _windows = new Map();

/**
 * Check rate limit for a given key.
 *
 * @param {string} key       - Unique identifier (e.g. `userId:endpoint`)
 * @param {number} maxPerWindow - Max allowed requests
 * @param {number} windowMs  - Window duration in milliseconds
 * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
 */
export function checkRateLimit(key, maxPerWindow = 20, windowMs = 60_000) {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Get or create window for this key
    const timestamps = (_windows.get(key) ?? []).filter(t => t > cutoff);

    if (timestamps.length >= maxPerWindow) {
        const oldestInWindow = timestamps[0];
        const resetMs = oldestInWindow + windowMs - now;
        return { allowed: false, remaining: 0, resetMs };
    }

    timestamps.push(now);
    _windows.set(key, timestamps);

    // Cleanup old keys periodically to avoid memory leaks
    if (_windows.size > 10_000) {
        for (const [k, ts] of _windows) {
            if (ts.every(t => t <= cutoff)) _windows.delete(k);
        }
    }

    return {
        allowed: true,
        remaining: maxPerWindow - timestamps.length,
        resetMs: windowMs,
    };
}

/**
 * Builds a rate-limit key scoped to user + endpoint.
 * e.g. "auth0|abc123:sync"
 */
export function rateLimitKey(userId, endpoint) {
    return `${userId}:${endpoint}`;
}
