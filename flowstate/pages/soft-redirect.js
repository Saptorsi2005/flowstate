/**
 * soft-redirect.js — Easy Mode warning page
 *
 * "Stay Focused" goes back. "Continue Anyway" temp-unlocks and navigates.
 */

var params = new URLSearchParams(window.location.search);
var url = params.get('url') ? decodeURIComponent(params.get('url')) : null;
var tabId = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;
var prevTabId = params.get('prevTabId') ? parseInt(params.get('prevTabId'), 10) : null;
var focusMode = params.get('mode') || 'easy';

var domain = '';
try { domain = new URL(url).hostname; } catch (e) { }

document.getElementById('target-url').textContent = domain || url || 'Unknown site';

// Reload detection temporarily disabled to prevent false positives
// Extension reload will naturally invalidate pages

// ── Listen for focus mode changes ──────────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // Handle AI Smart Blocking being disabled
  if (changes.aiEnabled) {
    const aiEnabled = changes.aiEnabled.newValue;
    // If AI was disabled and this is an AI-blocked page, unblock it
    // (soft-redirect doesn't have blockType param, but check if we're in AI escalation mode)
    if (!aiEnabled) {
      // For soft-redirect, we don't have blockType, but if user disabled AI, let them through
      console.log('[FlowState] AI Smart Blocking disabled');
      // Don't auto-navigate from soft-redirect as it's also used for manual blocks
      // User can click "Continue Anyway" if they want
    }
  }

  // Handle focus mode changes
  if (changes.workspaces) {
    try {
      const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
      if (!data.activeWorkspaceId) return;

      const ws = data.workspaces?.[data.activeWorkspaceId];
      if (!ws) return;

      // If focus mode changed to strict, reload as blocked page
      if (ws.focusMode === 'strict' && focusMode !== 'strict') {
        console.log('[FlowState] Focus mode changed to strict, switching page');
        const encoded = encodeURIComponent(url);
        window.location.href = chrome.runtime.getURL(
          `pages/blocked.html?url=${encoded}&tabId=${tabId}&type=manual`
        );
      }
    } catch (e) {
      console.warn('[FlowState] Error checking focus mode change:', e);
    }
  }
});

// Hide "Continue Anyway" button in strict mode
if (focusMode === 'strict') {
  var continueBtn = document.getElementById('btn-continue');
  if (continueBtn) {
    continueBtn.style.display = 'none';
  }
  // Update messaging for strict mode
  var pageTitle = document.getElementById('page-title');
  var pageMsg = document.getElementById('page-msg');
  if (pageTitle) pageTitle.textContent = 'Site Blocked';
  if (pageMsg) pageMsg.textContent = 'This site is blocked in strict mode. You must stay focused.';
}

document.getElementById('btn-stay').addEventListener('click', async function () {
  console.log('[FlowState] Stay Focused clicked, prevTabId:', prevTabId);
  try {
    // ── Load current workspace state first (domains may have changed) ──
    const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
    const ws = data.workspaces?.[data.activeWorkspaceId];
    const blockedDomains = ws?.blockedDomains || [];
    const allowedDomains = ws?.allowedDomains || [];

    // Helper: returns true if a URL is currently blocked
    function isUrlBlocked(checkUrl) {
      if (!checkUrl) return false;
      if (checkUrl.startsWith('chrome-extension://') ||
        checkUrl.startsWith('chrome://') ||
        checkUrl.startsWith('about:')) return false;
      try {
        const d = new URL(checkUrl).hostname.replace(/^www\./, '');
        // Explicitly allowed → never considered blocked
        const isAllowed = allowedDomains.some(a => {
          const ca = a.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
          return d.includes(ca) || ca.includes(d);
        });
        if (isAllowed) return false;
        // In blocked list → blocked
        return blockedDomains.some(blocked => {
          const cleanBlocked = blocked.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
          return d.includes(cleanBlocked) || cleanBlocked.includes(d);
        });
      } catch { return false; }
    }

    // ── 1. Try to return to the exact previous tab ──────────────
    // Validate against CURRENT domain list — allowed domains may have changed
    if (prevTabId !== null) {
      try {
        const prevTab = await chrome.tabs.get(prevTabId);
        if (prevTab &&
          !isUrlBlocked(prevTab.url) &&
          !prevTab.url.includes('soft-redirect.html') &&
          !prevTab.url.includes('blocked.html') &&
          !prevTab.url.includes('ai-escalation.html')) {
          console.log('[FlowState] Returning to previous tab:', prevTabId, prevTab.url);
          await chrome.tabs.update(prevTabId, { active: true });
          return;
        } else {
          console.log('[FlowState] Previous tab is now blocked or a redirect page, falling back to search');
        }
      } catch (e) {
        // Tab no longer exists — fall through to search below
        console.log('[FlowState] Previous tab', prevTabId, 'no longer exists, falling back to search');
      }
    }

    // ── 2. Fallback: find most-recently-used non-blocked tab ─────
    // Sort by lastAccessed DESC — this is the key fix.
    // tabs.find() returns the leftmost tab by index (wrong).
    // We want the tab the user was most recently active on.
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const currentTab = await chrome.tabs.getCurrent();

    console.log('[FlowState] Fallback tab search. Current tab:', currentTab?.id, 'Total tabs:', tabs.length);

    // Filter to valid candidates, then sort by most recently accessed
    const candidates = tabs
      .filter(t =>
        t.id !== currentTab?.id &&
        !t.url.startsWith('chrome-extension://') &&
        !t.url.includes('soft-redirect.html') &&
        !t.url.includes('blocked.html') &&
        !t.url.includes('ai-escalation.html') &&
        !isUrlBlocked(t.url)
      )
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));

    const targetTab = candidates[0] ?? null;

    if (targetTab) {
      console.log('[FlowState] Switching to most-recent non-blocked tab:', targetTab.id, targetTab.url);
      await chrome.tabs.update(targetTab.id, { active: true });
    } else {
      console.log('[FlowState] No suitable tab found, opening new tab');
      await chrome.tabs.create({ url: 'chrome://newtab', active: true });
    }
  } catch (e) {
    console.error('[FlowState] Error in Stay Focused:', e);
    try {
      await chrome.tabs.create({ url: 'chrome://newtab', active: true });
    } catch (err) {
      console.error('[FlowState] Failed to create new tab:', err);
    }
  }
});

document.getElementById('btn-continue').addEventListener('click', async function () {
  console.log('[FlowState] Continue Anyway clicked');
  // Double-check we're not in strict mode
  if (focusMode === 'strict') {
    console.warn('[FlowState] Continue blocked - strict mode');
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'request-unlock',
      domain: domain,
      tabId: tabId
    });
    console.log('[FlowState] Unlocked, navigating to:', url);
    window.location.href = url;
  } catch (e) {
    console.error('[FlowState] Error unlocking:', e);
    window.location.href = url;
  }
});
