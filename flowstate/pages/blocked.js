/**
 * blocked.js — FlowState Block Page
 *
 * No AI intent check. Site is blocked; user can:
 *   - Wait for workspace deactivation
 *   - Use "Take me somewhere safe" to leave
 *   - (ai-temp blocks) auto-release after the timer expires
 */

var params = new URLSearchParams(window.location.search);
var url = params.get('url') ? decodeURIComponent(params.get('url')) : null;
var tabId = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;
var blockType = params.get('type') || 'manual'; // 'manual', 'ai', 'ai-temp'
var DURATION = 15; // seconds (used only for temp-block countdown)

var $blockedUrl = document.getElementById('blocked-url');
var $countdownSection = document.getElementById('countdown-section');
var $countdown = document.getElementById('countdown');
var $btnUnlock = document.getElementById('btn-unlock');

var domain = '';
try { domain = new URL(url).hostname; } catch (e) { }
$blockedUrl.textContent = domain || url || 'Unknown site';

// ── Update title for AI-detected blocks ────────────────────────
var $pageTitle = document.getElementById('page-title');
var $pageMsg = document.getElementById('page-msg');

if (blockType === 'ai' || blockType === 'ai-block') {
  $pageTitle.textContent = 'AI Detected Distraction';
  $pageMsg.textContent = 'AI classified this site as potentially distracting.';
} else if (blockType === 'ai-temp') {
  $pageTitle.textContent = 'Temporarily Blocked';
  $pageMsg.textContent = 'AI detected this as highly distracting. Temporarily blocked.';
}

// ── Listen for workspace / AI setting changes ──────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // AI Smart Blocking disabled → release AI-blocked pages
  if (changes.aiEnabled) {
    const aiEnabled = changes.aiEnabled.newValue;
    if (!aiEnabled && (blockType === 'ai' || blockType === 'ai-block')) {
      console.log('[FlowState] AI Smart Blocking disabled, navigating to original URL');
      window.location.href = url || 'chrome://newtab';
      return;
    }
  }

  // Focus mode changed easy → swap to soft-redirect page
  if (changes.workspaces) {
    try {
      const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
      if (!data.activeWorkspaceId) return;
      const ws = data.workspaces?.[data.activeWorkspaceId];
      if (!ws) return;
      if (ws.focusMode === 'easy' && blockType === 'manual') {
        console.log('[FlowState] Focus mode changed to easy, switching page');
        const encoded = encodeURIComponent(url);
        window.location.href = chrome.runtime.getURL(
          `pages/soft-redirect.html?url=${encoded}&tabId=${tabId}&mode=easy`
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
  var data = await chrome.storage.local.get('aiTempBlocks');
  var tempBlocks = data.aiTempBlocks || {};
  var block = tempBlocks[domain];

  if (!block || block.blockedUntil <= Date.now()) {
    window.location.href = url;
    return;
  }

  var msg = document.createElement('p');
  msg.style.cssText = 'text-align:center;font-size:18px;margin-top:20px;color:var(--primary)';
  msg.id = 'temp-block-timer';
  document.querySelector('.page-center').appendChild(msg);

  function updateTimer() {
    var now = Date.now();
    if (now >= block.blockedUntil) {
      msg.textContent = '✓ Block expired! Redirecting...';
      setTimeout(() => { window.location.href = url; }, 1000);
      return;
    }
    var remain = block.blockedUntil - now;
    var minutes = Math.floor(remain / 60000);
    var seconds = Math.floor((remain % 60000) / 1000);
    msg.textContent = `⏱️ Unblocks in ${minutes}:${seconds.toString().padStart(2, '0')}`;
    setTimeout(updateTimer, 1000);
  }
  updateTimer();
}

// ── Init ────────────────────────────────────────────────────────
(async function init() {
  if (blockType === 'ai-temp') {
    await handleTempBlock();
  }
  // For all other block types: page just stays blocked until workspace changes.
  // No countdown, no unlock button shown.
})();

// ── Unlock handler (only reachable if countdown-section is shown) ──
$btnUnlock.addEventListener('click', async function () {
  if ($btnUnlock.disabled) return;
  $btnUnlock.disabled = true;
  $btnUnlock.textContent = 'Unlocking…';
  try {
    await chrome.runtime.sendMessage({ type: 'request-unlock', domain, tabId });
    window.location.href = url;
  } catch (err) {
    $btnUnlock.textContent = 'Error: ' + err.message;
  }
});

// ── "Stay Focused" button ──────────────────────────────────────────
// Asks the background script to navigate this tab (using chrome.tabs.update)
// to the last non-blocked URL tracked across the session.
document.getElementById('btn-stay').addEventListener('click', async function () {
  if ($btnUnlock) $btnUnlock.disabled = true;
  document.getElementById('btn-stay').textContent = 'Loading...';
  try {
    await chrome.runtime.sendMessage({ type: 'handle-stay-focused', tabId: tabId || null });
  } catch (e) {
    console.warn('[FlowState] Message failed, using failsafe:', e);
    // Failsafe fallback if background script isn't responding
    window.location.replace('https://www.google.com');
  }
});
