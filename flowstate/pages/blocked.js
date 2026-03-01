/**
 * blocked.js — Site Block Page
 *
 * Strict Mode: Hard block with "Stay Focused" button only
 * Easy Mode: Warning with "Stay Focused" + "Continue Anyway" buttons
 *
 * Incorporates safe background-based "Stay Focused" redirect.
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

if ($blockedUrl) $blockedUrl.textContent = domain;

// Update UI based on block type
if (blockType === 'ai' || blockType === 'ai-temp') {
  if ($pageTitle) $pageTitle.textContent = 'AI Detected Distraction';
  if ($pageMsg) $pageMsg.textContent = 'This site was flagged as potentially distracting.';
}

// Configure buttons based on focus mode
if (focusMode === 'strict') {
  // Strict mode: only "Stay Focused" button
  if ($btnContinue) $btnContinue.style.display = 'none';
  if ($pageMsg) $pageMsg.textContent = 'This site is blocked in strict mode.';
} else {
  // Easy mode: show both buttons
  if ($btnContinue) $btnContinue.style.display = 'inline-block';
}

// ── Listen for Focus Mode Changes ──────────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // AI Smart Blocking disabled → release AI-blocked pages
  if (changes.aiEnabled) {
    const aiEnabled = changes.aiEnabled.newValue;
    if (!aiEnabled && (blockType === 'ai' || blockType === 'ai-temp' || blockType === 'ai-block')) {
      console.log('[FlowState] AI disabled, navigating to original URL');
      window.location.href = url || 'chrome://newtab';
      return;
    }
  }

  // Focus mode changed easy → strict
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

  // Workspace deactivated → release the block
  if (changes.activeWorkspaceId && !changes.activeWorkspaceId.newValue) {
    window.location.href = url || 'chrome://newtab';
  }
});

// ── Temporary AI Block (ai-temp) — shows a countdown to auto-release
async function handleTempBlock() {
  if ($btnStay) $btnStay.style.display = 'none';
  if ($btnContinue) $btnContinue.style.display = 'none';
  if ($pageMsg) $pageMsg.textContent = 'AI detected this as highly distracting. Temporarily blocked.';

  const data = await chrome.storage.local.get('aiTempBlocks');
  const tempBlocks = data.aiTempBlocks || {};
  const block = tempBlocks[domain];

  if (!block || block.blockedUntil <= Date.now()) {
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

// ── Stay Focused Handler ───────────────────────────────────────
// Asks the background script to navigate this tab (using chrome.tabs.update)
// to the last non-blocked URL tracked across the session.
async function handleStayFocused() {
  if ($btnContinue) $btnContinue.disabled = true;
  if ($btnStay) {
    $btnStay.disabled = true;
    $btnStay.textContent = 'Loading...';
  }
  try {
    await chrome.runtime.sendMessage({ type: 'handle-stay-focused', tabId: tabId || null });
  } catch (e) {
    console.warn('[FlowState] Message failed, using failsafe:', e);
    // Failsafe fallback if background script isn't responding
    window.location.replace('https://www.google.com');
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
if ($btnStay) $btnStay.addEventListener('click', handleStayFocused);
if ($btnContinue) $btnContinue.addEventListener('click', handleContinueAnyway);
