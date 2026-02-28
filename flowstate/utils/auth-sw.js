/**
 * utils/auth-sw.js — auth polling that runs INSIDE the service worker
 *
 * WHY THIS EXISTS:
 *   Chrome popup windows close the moment the user switches tabs.
 *   This kills any setTimeout/Promise running in popup.js.
 *   Polling MUST live in the service worker (persists via chrome.alarms).
 *
 * FLOW:
 *   1. Popup calls startDeviceFlow() → gets deviceCode, userCode, verificationUri
 *   2. Popup sends message { type: 'FS_START_DEVICE_POLL', deviceCode, interval }
 *   3. This module stores deviceCode in chrome.storage.local and schedules an alarm
 *   4. On each alarm: fetch /api/auth/device-poll
 *      - pending   → reschedule alarm
 *      - approved  → store syncJwt + syncUser, clear alarm
 *      - expired/denied/error → clear alarm + pending state
 *   5. Popup onChanged listener fires when syncJwt is set → updates UI
 *
 * ADDITIVE ONLY: zero changes to blocking/AI/timer logic.
 */

const API_BASE = 'https://flowstate-backend.vercel.app';
const POLL_ALARM = 'flowstate-auth-poll';

export function initAuthListener() {
    // ── Message listener: popup → SW ─────────────────────────────
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.type === 'FS_START_DEVICE_POLL') {
            const intervalSecs = Math.max(msg.interval ?? 5, 5);
            chrome.storage.local
                .set({ _pendingDeviceCode: msg.deviceCode, _pollIntervalSecs: intervalSecs })
                .then(() => {
                    // First poll after one interval
                    chrome.alarms.create(POLL_ALARM, { delayInMinutes: intervalSecs / 60 });
                    console.log('[FlowState AuthSW] Poll scheduled, interval:', intervalSecs, 's');
                    sendResponse({ ok: true });
                });
            return true; // keep message channel open for async sendResponse
        }

        if (msg.type === 'FS_CANCEL_DEVICE_POLL') {
            chrome.alarms.clear(POLL_ALARM);
            chrome.storage.local.remove(['_pendingDeviceCode', '_pollIntervalSecs']);
            console.log('[FlowState AuthSW] Poll cancelled');
            sendResponse({ ok: true });
            return true;
        }
    });

    // ── Alarm listener: do the actual polling ────────────────────
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name !== POLL_ALARM) return;

        const { _pendingDeviceCode, _pollIntervalSecs } =
            await chrome.storage.local.get(['_pendingDeviceCode', '_pollIntervalSecs']);

        if (!_pendingDeviceCode) {
            console.log('[FlowState AuthSW] No pending device code, skipping alarm');
            return;
        }

        const intervalSecs = _pollIntervalSecs ?? 5;
        console.log('[FlowState AuthSW] Polling device-poll…');

        try {
            const res = await fetch(`${API_BASE}/api/auth/device-poll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceCode: _pendingDeviceCode }),
                signal: AbortSignal.timeout(10000),
            });

            const data = await res.json();
            console.log('[FlowState AuthSW] Poll response:', data.status);

            // ── Approved ─────────────────────────────────────────────
            if (data.status === 'approved' && data.accessToken) {
                await chrome.storage.local.set({ syncJwt: data.accessToken });
                console.log('[FlowState AuthSW] syncJwt stored ✓');

                const user = decodeJwtPayload(data.accessToken);
                if (user) {
                    await chrome.storage.local.set({
                        syncUser: {
                            email: user.email || null,
                            name: user.name || user.email || 'User',
                            sub: user.sub || null,
                        }
                    });
                    console.log('[FlowState AuthSW] syncUser stored ✓', user.email);
                }

                // Clean up pending state
                await chrome.storage.local.remove(['_pendingDeviceCode', '_pollIntervalSecs']);
                // storage.onChanged in popup will now fire and update the UI
                return;
            }

            // ── Terminal failures — stop polling ──────────────────────
            if (data.status === 'expired' || data.status === 'denied' || data.status === 'error') {
                console.log('[FlowState AuthSW] Auth failed:', data.status);
                await chrome.storage.local.remove(['_pendingDeviceCode', '_pollIntervalSecs']);
                return;
            }

            // ── Still pending — reschedule ────────────────────────────
            chrome.alarms.create(POLL_ALARM, { delayInMinutes: intervalSecs / 60 });

        } catch (err) {
            console.warn('[FlowState AuthSW] Poll error:', err.message, '— retrying');
            chrome.alarms.create(POLL_ALARM, { delayInMinutes: intervalSecs / 60 });
        }
    });
}

function decodeJwtPayload(token) {
    try {
        const [, payload] = token.split('.');
        return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    } catch { return null; }
}
