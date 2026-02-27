/**
 * soft-redirect.js — Easy Mode warning page
 *
 * "Stay Focused" goes back. "Continue Anyway" temp-unlocks and navigates.
 */

var params = new URLSearchParams(window.location.search);
var url    = params.get('url') ? decodeURIComponent(params.get('url')) : null;
var tabId  = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;
var focusMode = params.get('mode') || 'easy';

var domain = '';
try { domain = new URL(url).hostname; } catch(e) {}

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

document.getElementById('btn-stay').addEventListener('click', async function() {
  console.log('[FlowState] Stay Focused clicked');
  try {
    // Get workspace info to check blocked domains
    const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
    const ws = data.workspaces?.[data.activeWorkspaceId];
    const blockedDomains = ws?.blockedDomains || [];
    
    console.log('[FlowState] Blocked domains:', blockedDomains);
    
    // Helper to check if a URL is blocked
    function isUrlBlocked(url) {
      if (!url) return false;
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '');
        return blockedDomains.some(blocked => {
          const cleanBlocked = blocked.replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0];
          return domain.includes(cleanBlocked) || cleanBlocked.includes(domain);
        });
      } catch {
        return false;
      }
    }
    
    // Get all tabs to find a non-blocked tab to switch to
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const currentTab = await chrome.tabs.getCurrent();
    
    console.log('[FlowState] Current tab:', currentTab?.id, 'Total tabs:', tabs.length);
    
    if (currentTab && tabs.length > 1) {
      // Find the first tab that's not this blocking page AND not a blocked domain
      const targetTab = tabs.find(t => 
        t.id !== currentTab.id && 
        !t.url.startsWith('chrome-extension://') &&
        !t.url.includes('soft-redirect.html') &&
        !t.url.includes('blocked.html') &&
        !t.url.includes('ai-escalation.html') &&
        !isUrlBlocked(t.url)
      );
      
      if (targetTab) {
        console.log('[FlowState] Switching to tab:', targetTab.id, targetTab.url);
        // Switch to the non-blocked tab, but keep this warning tab open
        await chrome.tabs.update(targetTab.id, { active: true });
      } else {
        console.log('[FlowState] No suitable non-blocked tab found, creating new tab');
        // No other tabs, create a new tab
        await chrome.tabs.create({ url: 'chrome://newtab', active: true });
      }
    } else {
      console.log('[FlowState] Only one tab or no current tab, creating new tab');
      await chrome.tabs.create({ url: 'chrome://newtab', active: true });
    }
  } catch (e) {
    console.error('[FlowState] Error in Stay Focused:', e);
    // Fallback: create a new tab
    try {
      await chrome.tabs.create({ url: 'chrome://newtab', active: true });
    } catch (err) {
      console.error('[FlowState] Failed to create new tab:', err);
    }
  }
});

document.getElementById('btn-continue').addEventListener('click', async function() {
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
  } catch(e) {
    console.error('[FlowState] Error unlocking:', e);
    window.location.href = url;
  }
});
