/**
 * service-worker.js — FlowState Background Service Worker
 *
 * Self-contained (no imports) for maximum reliability.
 *
 * Handles:
 *   1. Domain blocking (Easy/Strict mode) via tabs.onUpdated
 *   2. Workspace activation/deactivation
 *   3. Focus timer start/stop
 *   4. Intent unlock for strict mode
 *   5. Tab removal cleanup
 */

// ── Helper ─────────────────────────────────────────────────────
function getDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// ── Domain Blocking (tabs.onUpdated) ───────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when the URL actually changes
  if (!changeInfo.url) return;
  const url = changeInfo.url;

  // Skip extension & browser pages (prevents redirect loops)
  if (url.startsWith('chrome-extension://') ||
      url.startsWith('chrome://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')) return;

  const data = await chrome.storage.local.get(
    ['activeWorkspaceId', 'workspaces', 'tempUnlockedDomains']
  );
  if (!data.activeWorkspaceId) return;

  const ws = (data.workspaces || {})[data.activeWorkspaceId];
  if (!ws || !ws.blockedDomains || ws.blockedDomains.length === 0) return;

  const domain = getDomain(url);
  if (!domain) return;

  // Temp-unlocked domains (tab-specific, from intent unlock)
  const unlocked = data.tempUnlockedDomains || [];
  if (unlocked.some(u => u.tabId === tabId && domain.includes(u.domain))) return;

  // Allowed domains take priority over blocked
  if ((ws.allowedDomains || []).some(d => domain.includes(d))) return;

  // Check if domain is blocked
  if (!ws.blockedDomains.some(d => domain.includes(d))) return;

  // === BLOCKED — redirect to appropriate page ===
  const encoded = encodeURIComponent(url);
  const page = ws.focusMode === 'strict'
    ? `pages/blocked.html?url=${encoded}&tabId=${tabId}`
    : `pages/soft-redirect.html?url=${encoded}&tabId=${tabId}`;

  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(page) });
});

// ── Tab Removal Cleanup ────────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get(
    ['tempUnlockedDomains', 'unlockCountdowns']
  );
  const filtered = (data.tempUnlockedDomains || []).filter(u => u.tabId !== tabId);
  const countdowns = data.unlockCountdowns || {};
  delete countdowns[String(tabId)];

  await chrome.storage.local.set({
    tempUnlockedDomains: filtered,
    unlockCountdowns: countdowns
  });
});

// ── Message Router ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true; // keep channel open for async
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'activate-workspace':  return activateWorkspace(msg.id);
    case 'deactivate-workspace': return deactivateWorkspace();
    case 'request-unlock':       return handleUnlock(msg.domain, msg.tabId);
    default: return { error: 'Unknown message type' };
  }
}

// ── Workspace Activation ───────────────────────────────────────
async function activateWorkspace(id) {
  try {
    const { workspaces } = await chrome.storage.local.get('workspaces');
    const ws = (workspaces || {})[id];
    if (!ws) return { success: false, error: 'Workspace not found' };

    await chrome.storage.local.set({
      activeWorkspaceId: id,
      timer: { startTime: Date.now(), elapsed: 0, running: true },
      tempUnlockedDomains: [],
      unlockCountdowns: {}
    });

    // Restore saved tabs in background
    if (ws.savedTabs && ws.savedTabs.length > 0) {
      for (const t of ws.savedTabs) {
        try { await chrome.tabs.create({ url: t.url, active: false }); } catch {}
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Workspace Deactivation ─────────────────────────────────────
async function deactivateWorkspace() {
  try {
    const { timer } = await chrome.storage.local.get('timer');
    let elapsed = timer?.elapsed || 0;
    if (timer?.running && timer?.startTime) {
      elapsed += Date.now() - timer.startTime;
    }

    await chrome.storage.local.set({
      activeWorkspaceId: null,
      timer: { startTime: null, elapsed: elapsed, running: false },
      tempUnlockedDomains: [],
      unlockCountdowns: {}
    });

    return { success: true, elapsed };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Intent Unlock ──────────────────────────────────────────────
async function handleUnlock(domain, tabId) {
  try {
    const { tempUnlockedDomains = [] } = await chrome.storage.local.get('tempUnlockedDomains');
    tempUnlockedDomains.push({ domain, tabId });
    await chrome.storage.local.set({ tempUnlockedDomains });

    // Clean up countdown entry
    const { unlockCountdowns = {} } = await chrome.storage.local.get('unlockCountdowns');
    delete unlockCountdowns[String(tabId)];
    await chrome.storage.local.set({ unlockCountdowns });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
