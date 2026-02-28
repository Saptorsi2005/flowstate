/**
 * utils/sync.js — Background sync from extension to backend
 *
 * GUARANTEES:
 *   - Only syncs workspaces (persistent data), never ephemeral state
 *   - Uses chrome.alarms, not setTimeout — survives MV3 service worker sleep
 *   - All syncs are fire-and-forget — failures are fully silent
 *   - Extension never depends on this succeeding
 */

const API_URL = 'https://flowstate-backend.vercel.app/api/sync';
const ALARM_NAME = 'flowstate-sync';

// Keys that are safe to sync — persistent, non-ephemeral only
const SYNC_KEYS = ['workspaces'];

// Keys we deliberately NEVER sync (ephemeral runtime state)
// timer, aiEscalationLevels, aiTempBlocks, tempUnlockedDomains, unlockCountdowns

export function initSyncListener() {
    // Watch for changes to sync-worthy keys only
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        const hasRelevantChange = Object.keys(changes).some(k => SYNC_KEYS.includes(k));
        if (!hasRelevantChange) return;

        // Schedule a sync via chrome.alarms (survives SW sleep; setTimeout does not)
        // delayInMinutes: 0.05 ≈ 3 seconds — debounce rapid consecutive changes
        chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.05 });
    });

    // Handle the alarm firing (this is where the actual sync runs)
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name !== ALARM_NAME) return;
        syncToBackend().catch(() => { /* fail silently */ });
    });
}

async function syncToBackend() {
    const data = await chrome.storage.local.get(['syncJwt', 'workspaces']);

    // Not authenticated — skip silently
    if (!data.syncJwt) return;

    // Nothing to sync
    if (!data.workspaces) return;

    const workspaces = Object.values(data.workspaces).map(ws => ({
        id: ws.id,
        name: ws.name,
        focusMode: ws.focusMode || 'easy',
        blockedDomains: ws.blockedDomains || [],
        allowedDomains: ws.allowedDomains || [],
        todos: ws.todos || [],
        savedTabsCount: (ws.savedTabs || []).length,
        createdAt: ws.createdAt,
    }));

    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.syncJwt}`,
            },
            body: JSON.stringify({ workspaces }),
            signal: AbortSignal.timeout(8000), // never hang the SW
        });
    } catch {
        // Network error, timeout, or backend down — silently ignored
        // Extension queues are handled by the offline-queue in Phase 2 full rollout
    }
}
