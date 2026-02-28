/**
 * utils/auth.js — Auth0 Device Code Flow for Chrome Extension
 *
 * Uses the backend as a proxy for all Auth0 calls — no secrets in extension.
 * Tokens are stored in chrome.storage.local as `syncJwt`.
 *
 * ADDITIVE ONLY: zero impact on blocking/AI/timer logic.
 */

const API_BASE = 'https://flowstate-backend.vercel.app';

// Never poll faster than Auth0 says (default 5s)
const MIN_POLL_INTERVAL_MS = 5000;

// ── Public API ────────────────────────────────────────────────────

export async function getStoredJwt() {
    const { syncJwt } = await chrome.storage.local.get('syncJwt');
    return syncJwt || null;
}

export async function getStoredUser() {
    const { syncUser } = await chrome.storage.local.get('syncUser');
    return syncUser || null;
}

export async function isAuthenticated() {
    return !!(await getStoredJwt());
}

export async function logout() {
    await chrome.storage.local.remove(['syncJwt', 'syncUser']);
}

/**
 * Start the Device Code Flow.
 * Returns { deviceCode, userCode, verificationUri, expiresIn, interval }
 */
export async function startDeviceFlow() {
    console.log('[FlowState Auth] Starting device flow…');
    const res = await fetch(`${API_BASE}/api/auth/device-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Device flow start failed (${res.status})`);
    }

    const data = await res.json();
    console.log('[FlowState Auth] Device flow started:', {
        userCode: data.userCode,
        verificationUri: data.verificationUri,
        interval: data.interval,
        expiresIn: data.expiresIn,
    });
    return data;
}

/**
 * Poll for Device Code Flow completion.
 *
 * KEY FIX: polls IMMEDIATELY on first call (no initial delay),
 * then waits `interval` between retries. This prevents the popup
 * from closing before the first poll fires.
 *
 * @param {string}   deviceCode   - From startDeviceFlow()
 * @param {number}   intervalSecs - Polling interval (seconds) from startDeviceFlow()
 * @param {Function} onStatus     - Callback(status) for UI updates
 * @returns {Promise<string>} Resolves with access token on approval
 */
export async function pollDeviceFlow(deviceCode, intervalSecs, onStatus) {
    const intervalMs = Math.max((intervalSecs ?? 5) * 1000, MIN_POLL_INTERVAL_MS);
    const maxAttempts = 60; // 5 min max
    let attempts = 0;
    let stopped = false;

    console.log('[FlowState Auth] Poll starting. interval:', intervalMs, 'ms');

    return new Promise((resolve, reject) => {
        const poll = async () => {
            if (stopped) return;

            if (attempts >= maxAttempts) {
                reject(new Error('Login timed out. Please try again.'));
                return;
            }
            attempts++;

            console.log('[FlowState Auth] Poll attempt', attempts);

            try {
                const res = await fetch(`${API_BASE}/api/auth/device-poll`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceCode }),
                    signal: AbortSignal.timeout(10000),
                });

                if (!res.ok) {
                    console.warn('[FlowState Auth] Poll HTTP error:', res.status);
                    onStatus?.('pending');
                    if (!stopped) setTimeout(poll, intervalMs);
                    return;
                }

                const data = await res.json();
                console.log('[FlowState Auth] Poll response:', data);

                if (data.status === 'approved' && data.accessToken) {
                    stopped = true;

                    // ── Store JWT ──────────────────────────────────────────
                    console.log('[FlowState Auth] Token received, storing syncJwt…');
                    await chrome.storage.local.set({ syncJwt: data.accessToken });
                    console.log('[FlowState Auth] syncJwt stored ✓');

                    // ── Decode and store user info ─────────────────────────
                    const user = decodeJwtPayload(data.accessToken);
                    console.log('[FlowState Auth] Decoded JWT payload:', user);

                    if (user) {
                        const syncUser = {
                            email: user.email || null,
                            name: user.name || user.email || 'User',
                            sub: user.sub || null,
                        };
                        await chrome.storage.local.set({ syncUser });
                        console.log('[FlowState Auth] syncUser stored ✓', syncUser);
                    }

                    onStatus?.('approved');
                    resolve(data.accessToken);
                    return;
                }

                if (data.status === 'expired') {
                    stopped = true;
                    reject(new Error('Login code expired. Please try again.'));
                    return;
                }

                if (data.status === 'denied') {
                    stopped = true;
                    reject(new Error('Access was denied.'));
                    return;
                }

                if (data.status === 'error') {
                    stopped = true;
                    reject(new Error(data.error || 'Auth error'));
                    return;
                }

                // Still pending — schedule next poll
                console.log('[FlowState Auth] Still pending, next poll in', intervalMs, 'ms');
                onStatus?.('pending');
                if (!stopped) setTimeout(poll, intervalMs);

            } catch (err) {
                // Network error — retry
                console.warn('[FlowState Auth] Poll network error:', err.message);
                onStatus?.('pending');
                if (!stopped) setTimeout(poll, intervalMs);
            }
        };

        // ── CRITICAL FIX: poll immediately, don't wait intervalMs first ──
        // The original code waited 5s before the first poll. If the popup
        // closes and reopens during that window, the Promise is lost.
        poll();
    });
}

// ── Internal helpers ──────────────────────────────────────────────

function decodeJwtPayload(token) {
    try {
        const [, payload] = token.split('.');
        // Pad base64url to base64
        const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(padded);
        return JSON.parse(json);
    } catch (e) {
        console.warn('[FlowState Auth] JWT decode failed:', e.message);
        return null;
    }
}
