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
  console.log('[FlowState] Stay Focused clicked');
  document.getElementById('btn-stay').textContent = 'Loading...';
  try {
    await chrome.runtime.sendMessage({ type: 'handle-stay-focused', tabId: tabId || null });
  } catch (e) {
    console.warn('[FlowState] Error in Stay Focused:', e);
    // Failsafe fallback
    window.location.replace('https://www.google.com');
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
