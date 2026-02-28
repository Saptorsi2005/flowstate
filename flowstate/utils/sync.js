/**
 * utils/sync.js — Background sync from extension to backend
 * Sends workspaces + daily focus_stats to /api/sync.
 */

const API_URL = 'https://flowstate-backend.vercel.app/api/sync';
const ALARM_NAME = 'flowstate-sync';
const SYNC_KEYS = ['workspaces', 'syncJwt', 'dailyFocusStats'];

export function initSyncListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const hasRelevantChange = Object.keys(changes).some(k => SYNC_KEYS.includes(k));
        if (!hasRelevantChange) return;
        if (changes.syncJwt && !changes.syncJwt.newValue) return; // logout
        chrome.alarms.create(ALARM_NAME, { delayInMinutes: 0.05 });
        console.log('[FlowState Sync] Scheduled (trigger:', Object.keys(changes).join(', '), ')');
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name !== ALARM_NAME) return;
        syncToBackend();
    });
}

async function syncToBackend() {
    let data;
    try { data = await chrome.storage.local.get(['syncJwt', 'workspaces', 'dailyFocusStats']); }
    catch (err) { console.error('[FlowState Sync] Storage read failed:', err.message); return; }

    if (!data.syncJwt) { console.log('[FlowState Sync] Not authenticated'); return; }
    if (!data.workspaces || Object.keys(data.workspaces).length === 0) return;

    const workspaces = Object.values(data.workspaces).map(ws => ({
        id: ws.id,
        name: ws.name,
        focusMode: ws.focusMode || 'easy',
        blockedDomains: ws.blockedDomains || [],
        allowedDomains: ws.allowedDomains || [],
        blockedGroupNames: ws.blockedGroupNames || [],
        blockedGroupDomains: ws.blockedGroupDomains || {},
        allowedGroupNames: ws.allowedGroupNames || [],
        todos: ws.todos || [],
        savedTabsCount: (ws.savedTabs || []).length,
    }));

    // Flatten dailyFocusStats { date: { wsId: statObj } } → array
    const focus_stats = [];
    const statsMap = data.dailyFocusStats || {};
    for (const [date, workspaceMap] of Object.entries(statsMap)) {
        for (const [wsId, stat] of Object.entries(workspaceMap)) {
            focus_stats.push({
                workspace_id: wsId,
                date,
                deep_focus_minutes: stat.deepFocusMinutes ?? 0,
                blocked_attempts: stat.blockedAttempts ?? 0,
                successful_unlocks: stat.successfulUnlocks ?? 0,
                failed_unlocks: stat.failedUnlocks ?? 0,
                strict_mode_minutes: stat.strictModeMinutes ?? 0,
                focus_score: stat.focusScore ?? 0,
            });
        }
    }

    console.log(`[FlowState Sync] Syncing ${workspaces.length} workspace(s), ${focus_stats.length} focus stat(s)…`);

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${data.syncJwt}` },
            body: JSON.stringify({ workspaces, focus_stats }),
            signal: AbortSignal.timeout(8000),
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok) console.log('[FlowState Sync] ✓ Success. syncedAt:', result.syncedAt);
        else console.warn('[FlowState Sync] ✗ Failed:', res.status, result.error);
    } catch (err) {
        console.warn('[FlowState Sync] ✗ Network error:', err.message);
    }
}
