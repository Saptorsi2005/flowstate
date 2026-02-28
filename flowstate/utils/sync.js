/**
 * utils/sync.js — Background sync from extension to backend
 *
 * GUARANTEES:
 *   - Only syncs workspaces (persistent data), never ephemeral state
 *   - Uses chrome.alarms, not setTimeout — survives MV3 service worker sleep
 *   - Extension never depends on this succeeding
 *
 * SYNC TRIGGERS:
 *   1. When workspaces change in storage
 *   2. When syncJwt is first set (login event) — catches pre-existing workspaces
 */

const API_URL = 'https://flowstate-backend.vercel.app/api/sync';
const ALARM_NAME = 'flowstate-sync';

// Keys triggering a sync
const SYNC_KEYS = ['workspaces', 'syncJwt'];

export function initSyncListener() {
    // Watch for changes to workspaces OR login (syncJwt written)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        const hasRelevantChange = Object.keys(changes).some(k => SYNC_KEYS.includes(k));
        if (!hasRelevantChange) return;

        // If syncJwt was REMOVED (logout) — nothing to sync
        if (changes.syncJwt && !changes.syncJwt.newValue) return;

        // Debounce via alarm — 3 second delay, survives SW sleep
        chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.05 });
        console.log('[FlowState Sync] Sync scheduled (triggered by:', Object.keys(changes).join(', '), ')');
    });

    // Handle the alarm firing
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name !== ALARM_NAME) return;
        console.log('[FlowState Sync] Alarm fired — running sync…');
        syncToBackend();
    });
}

async function syncToBackend() {
    let data;
    try {
        data = await chrome.storage.local.get(['syncJwt', 'workspaces']);
    } catch (err) {
        console.error('[FlowState Sync] Could not read storage:', err.message);
        return;
    }

    // Not authenticated — skip
    if (!data.syncJwt) {
        console.log('[FlowState Sync] No syncJwt — skipping sync');
        return;
    }

    // Nothing to sync
    if (!data.workspaces || Object.keys(data.workspaces).length === 0) {
        console.log('[FlowState Sync] No workspaces — skipping sync');
        return;
    }

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

    console.log(`[FlowState Sync] Syncing ${workspaces.length} workspace(s) to backend…`);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${data.syncJwt}`,
            },
            body: JSON.stringify({ workspaces }),
            signal: AbortSignal.timeout(8000),
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok) {
            console.log('[FlowState Sync] ✓ Sync successful. syncedAt:', result.syncedAt);
        } else {
            console.warn('[FlowState Sync] ✗ Sync failed. Status:', response.status, 'Error:', result.error);
        }
    } catch (err) {
        console.warn('[FlowState Sync] ✗ Network error:', err.message);
    }
}
