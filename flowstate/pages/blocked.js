/**
 * blocked.js — Site Block Page
 *
 * Strict Mode: Hard block with "Stay Focused" button only
 * Easy Mode: Warning with "Stay Focused" + "Continue Anyway" buttons
 *
 * AI system removed — clean tab restoration logic only.
 */

// ── Parse URL Parameters ───────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const url = params.get('url') ? decodeURIComponent(params.get('url')) : null;
const tabId = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;
const prevTabId = params.get('prevTabId') ? parseInt(params.get('prevTabId'), 10) : null;
const focusMode = params.get('mode') || 'strict';
const blockType = params.get('type') || 'manual';

// ── DOM Elements ───────────────────────────────────────────────
const $blockedUrl = document.getElementById('blocked-url');
const $pageTitle = document.getElementById('page-title');
const $pageMsg = document.getElementById('page-msg');
const $btnStay = document.getElementById('btn-stay');
const $btnContinue = document.getElementById('btn-continue');

// ── Initialize Page ────────────────────────────────────────────
let domain = '';
try {
  domain = new URL(url).hostname;
} catch (e) {
  domain = url || 'Unknown site';
}

$blockedUrl.textContent = domain;

// Update UI based on block type
if (blockType === 'ai' || blockType === 'ai-temp') {
  $pageTitle.textContent = 'AI Detected Distraction';
  $pageMsg.textContent = 'This site was flagged as potentially distracting.';
}

// Configure buttons based on focus mode
if (focusMode === 'strict') {
  // Strict mode: only "Stay Focused" button
  $btnContinue.style.display = 'none';
  $pageMsg.textContent = 'This site is blocked in strict mode.';
} else {
  // Easy mode: show both buttons
  $btnContinue.style.display = 'inline-block';
}

// ── Listen for Focus Mode Changes ──────────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // Handle AI Smart Blocking being disabled
  if (changes.aiEnabled) {
    const aiEnabled = changes.aiEnabled.newValue;
    if (!aiEnabled && (blockType === 'ai' || blockType === 'ai-temp')) {
      console.log('[FlowState] AI disabled, navigating to original URL');
      window.location.href = url || 'chrome://newtab';
      return;
    }
  }

  // Handle focus mode changes
  if (changes.workspaces) {
    try {
      const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
      if (!data.activeWorkspaceId) return;

      const ws = data.workspaces?.[data.activeWorkspaceId];
      if (!ws) return;

      // If mode changed, reload page with new mode
      if (ws.focusMode !== focusMode) {
        console.log('[FlowState] Focus mode changed to', ws.focusMode);
        const encoded = encodeURIComponent(url);
        const prevParam = prevTabId !== null ? `&prevTabId=${prevTabId}` : '';
        window.location.href = chrome.runtime.getURL(
          `pages/blocked.html?url=${encoded}&tabId=${tabId}&mode=${ws.focusMode}${prevParam}`
        );
      }
    } catch (e) {
      console.warn('[FlowState] Error checking focus mode change:', e);
    }
  }
});

// ── Handle Temporary AI Block ──────────────────────────────────
async function handleTempBlock() {
  $btnStay.style.display = 'none';
  $btnContinue.style.display = 'none';
  $pageMsg.textContent = 'AI detected this as highly distracting. Temporarily blocked.';

  const data = await chrome.storage.local.get('aiTempBlocks');
  const tempBlocks = data.aiTempBlocks || {};
  const block = tempBlocks[domain];

  if (!block || block.blockedUntil <= Date.now()) {
    // Block expired, allow access
    window.location.href = url;
    return;
  }

  // Show remaining time
  const msg = document.createElement('p');
  msg.style.cssText = 'text-align: center; font-size: 18px; margin-top: 20px; color: var(--primary);';
  msg.id = 'temp-block-timer';
  document.querySelector('.page-center').appendChild(msg);

  function updateTimer() {
    const now = Date.now();
    if (now >= block.blockedUntil) {
      msg.textContent = '✓ Block expired! Redirecting...';
      setTimeout(() => { window.location.href = url; }, 1000);
      return;
    }

    const remain = block.blockedUntil - now;
    const minutes = Math.floor(remain / 60000);
    const seconds = Math.floor((remain % 60000) / 1000);
    msg.textContent = `⏱️ Unblocks in ${minutes}:${seconds.toString().padStart(2, '0')}`;

    setTimeout(updateTimer, 1000);
  }

  updateTimer();
}

// Check if this is a temporary AI block
if (blockType === 'ai-temp') {
  handleTempBlock();
}

// ── Helper: Check if URL is blocked ────────────────────────────
async function isUrlBlocked(checkUrl) {
  if (!checkUrl) return false;
  if (checkUrl.startsWith('chrome-extension://') ||
    checkUrl.startsWith('chrome://') ||
    checkUrl.startsWith('about:')) return false;

  try {
    const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
    const ws = data.workspaces?.[data.activeWorkspaceId];
    if (!ws) return false;

    const blockedDomains = ws.blockedDomains || [];
    const allowedDomains = ws.allowedDomains || [];
    const d = new URL(checkUrl).hostname.replace(/^www\./, '');

    // Explicitly allowed → never blocked
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
  } catch {
    return false;
  }
}

// ── Stay Focused Handler ───────────────────────────────────────
async function handleStayFocused() {
  console.log('[FlowState] Stay Focused clicked, prevTabId:', prevTabId);

  try {
    // ── 0. Try to return to workspace origin tab ────────────
    try {
      const { activeFocusSession } = await chrome.storage.local.get('activeFocusSession');
      if (activeFocusSession && activeFocusSession.originTabId) {
        const originId = activeFocusSession.originTabId;
        const originTab = await chrome.tabs.get(originId);
        const blocked = await isUrlBlocked(originTab.url);

        if (originTab &&
          !blocked &&
          !originTab.url.includes('soft-redirect.html') &&
          !originTab.url.includes('blocked.html') &&
          !originTab.url.includes('ai-escalation.html')) {
          console.log('[FlowState] Returning to workspace origin tab:', originId, originTab.url);
          await chrome.tabs.update(originId, { active: true });
          return;
        }
      }
    } catch (e) {
      console.log('[FlowState] Origin tab', e.message, 'falling back to prevTabId');
    }

    // ── 1. Try to return to the exact previous tab ──────────
    if (prevTabId !== null) {
      try {
        const prevTab = await chrome.tabs.get(prevTabId);
        const blocked = await isUrlBlocked(prevTab.url);

        if (prevTab &&
          !blocked &&
          !prevTab.url.includes('soft-redirect.html') &&
          !prevTab.url.includes('blocked.html') &&
          !prevTab.url.includes('ai-escalation.html')) {
          console.log('[FlowState] Returning to previous tab:', prevTabId, prevTab.url);
          await chrome.tabs.update(prevTabId, { active: true });
          return;
        }
      } catch (e) {
        console.log('[FlowState] Previous tab', prevTabId, 'no longer exists, falling back to history');
      }
    }

    // ── 2. Fallback: Go back in history or new tab ─────────────
    console.log('[FlowState] Going back in history. Length:', window.history.length);

    // If we have history before the distraction URL (length > 2)
    // History stack when typing in a new tab: [distraction.com, blocked.html] (length 2)
    // We want to go back PAST the distraction, so we need at least length 3.
    if (window.history.length > 2) {
      window.history.go(-2); // Go back past the distraction URL
    } else {
      // If no valid safe history, safely navigate away
      const currentTab = await chrome.tabs.getCurrent();
      await chrome.tabs.update(currentTab.id, { url: 'chrome://newtab' });
    }
  } catch (e) {
    console.error('[FlowState] Error in Stay Focused:', e);
    const currentTab = await chrome.tabs.getCurrent();
    if (currentTab) await chrome.tabs.update(currentTab.id, { url: 'chrome://newtab' });
  }
}

// ── Continue Anyway Handler (Easy Mode Only) ───────────────────
async function handleContinueAnyway() {
  console.log('[FlowState] Continue Anyway clicked');

  try {
    // Request temporary unlock from background
    await chrome.runtime.sendMessage({
      type: 'request-unlock',
      domain: domain,
      tabId: tabId,
    });

    // Navigate to the original URL
    window.location.href = url;
  } catch (err) {
    console.error('[FlowState] Error in Continue Anyway:', err);
    alert('Error: ' + err.message);
  }
}

// ── Event Listeners ────────────────────────────────────────────
$btnStay.addEventListener('click', handleStayFocused);
$btnContinue.addEventListener('click', handleContinueAnyway);

