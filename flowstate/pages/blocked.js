/**
 * blocked.js — Strict Mode block page with AI-Powered Intent Unlock
 *
 * Flow:
 *   1. User types reason for needing access
 *   2. AI (bart-large-mnli) scores the reason
 *   3. If approved → show countdown → unlock
 *   4. If denied → show rejection message, let them retry
 *
 * Falls back to plain countdown if no API key is set.
 */

var params = new URLSearchParams(window.location.search);
var url = params.get('url') ? decodeURIComponent(params.get('url')) : null;
var tabId = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;
var blockType = params.get('type') || 'manual'; // 'manual', 'ai', 'ai-temp'
var DURATION = 15; // seconds

var $blockedUrl = document.getElementById('blocked-url');
var $intentSection = document.getElementById('intent-section');
var $intentInput = document.getElementById('intent-input');
var $btnCheckIntent = document.getElementById('btn-check-intent');
var $intentStatus = document.getElementById('intent-status');
var $countdownSection = document.getElementById('countdown-section');
var $countdown = document.getElementById('countdown');
var $btnUnlock = document.getElementById('btn-unlock');

var domain = '';
try { domain = new URL(url).hostname; } catch (e) { }

$blockedUrl.textContent = domain || url || 'Unknown site';

// Reload detection temporarily disabled to prevent false positives
// Extension reload will naturally invalidate pages

// ── Listen for focus mode changes ──────────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  
  // Handle AI Smart Blocking being disabled
  if (changes.aiEnabled) {
    const aiEnabled = changes.aiEnabled.newValue;
    // If AI was disabled and this is an AI-blocked page, unblock it
    if (!aiEnabled && (blockType === 'ai' || blockType === 'ai-block')) {
      console.log('[FlowState] AI Smart Blocking disabled, navigating to original URL');
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
      
      // If focus mode changed to easy, reload as soft-redirect page (only for manual blocks)
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
});

// ── Handle Temporary AI Block ──────────────────────────────────
async function handleTempBlock() {
  // Hide intent unlock section
  document.getElementById('unlock-section').style.display = 'none';
  
  // Update page message
  var $pageMsg = document.querySelector('.page-msg');
  $pageMsg.textContent = 'AI detected this as highly distracting. Temporarily blocked.';
  
  // Get temp block data
  var data = await chrome.storage.local.get('aiTempBlocks');
  var tempBlocks = data.aiTempBlocks || {};
  var block = tempBlocks[domain];
  
  if (!block || block.blockedUntil <= Date.now()) {
    // Block expired, allow access
    window.location.href = url;
    return;
  }
  
  // Show remaining time
  var remaining = block.blockedUntil - Date.now();
  var msg = document.createElement('p');
  msg.style.cssText = 'text-align: center; font-size: 18px; margin-top: 20px; color: var(--primary);';
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

// Check if AI key is available; if not, skip intent step and show direct countdown
(async function init() {
  // Update UI based on block type
  var $pageTitle = document.getElementById('page-title');
  var $pageMsg = document.getElementById('page-msg');
  
  if (blockType === 'ai') {
    $pageTitle.textContent = 'AI Detected Distraction';
    $pageMsg.textContent = 'AI classified this site as potentially distracting.';
  } else if (blockType === 'ai-temp') {
    $pageTitle.textContent = 'Temporarily Blocked';
    $pageMsg.textContent = 'AI detected this as highly distracting. Temporarily blocked.';
  }
  
  // Handle temporary AI block
  if (blockType === 'ai-temp') {
    await handleTempBlock();
    return;
  }

  var data = await chrome.storage.local.get(['hfApiKey', 'unlockCountdowns']);
  var key = data.hfApiKey;
  var countdowns = data.unlockCountdowns || {};
  var entry = countdowns[String(tabId)];

  if (!key) {
    // No AI key → use original plain countdown
    $intentSection.style.display = 'none';
    $countdownSection.classList.remove('hidden');
    if (!entry || entry.url !== url) {
      entry = { url: url, domain: domain, startedAt: Date.now(), duration: DURATION * 1000 };
      countdowns[String(tabId)] = entry;
      await chrome.storage.local.set({ unlockCountdowns: countdowns });
    }
    startCountdown(entry);
  }
  // else: wait for user to enter intent and click Check
})();

// ── AI Intent Check ────────────────────────────────────────────
$btnCheckIntent.addEventListener('click', async function () {
  var reason = $intentInput.value.trim();
  if (!reason) {
    $intentStatus.textContent = 'Please describe why you need access.';
    $intentStatus.className = 'intent-status intent-deny';
    return;
  }

  $btnCheckIntent.disabled = true;
  $btnCheckIntent.textContent = '✦ Asking AI…';
  $intentStatus.className = 'intent-status hidden';

  try {
    var res = await chrome.runtime.sendMessage({
      type: 'ai-score-intent',
      reason: reason,
    });

    if (!res) throw new Error('No response from background.');

    if (!res.success) {
      // API key issue or error — fall through with plain countdown
      $intentStatus.textContent = '⚠ AI unavailable. Access granted after countdown.';
      $intentStatus.className = 'intent-status intent-warn';
      await showCountdown();
      return;
    }

    var pct = Math.round(res.score * 100);

    if (res.allowed) {
      // ✅ Approved
      $intentStatus.textContent = `✓ Looks legit (${pct}% — "${res.label}"). Access granted!`;
      $intentStatus.className = 'intent-status intent-allow';
      setTimeout(async () => { await showCountdown(); }, 600);
    } else {
      // ❌ Denied
      $intentStatus.textContent =
        `✗ That doesn't sound work-related (${pct}% — "${res.label}"). Try again with a clearer reason.`;
      $intentStatus.className = 'intent-status intent-deny';
      $btnCheckIntent.disabled = false;
      $btnCheckIntent.textContent = '✦ Check with AI';
    }

  } catch (err) {
    $intentStatus.textContent = '⚠ Error: ' + err.message + '. Granting access via countdown.';
    $intentStatus.className = 'intent-status intent-warn';
    await showCountdown();
  }
});

async function showCountdown() {
  $intentSection.style.display = 'none';
  $countdownSection.classList.remove('hidden');

  var key = String(tabId);
  var data = await chrome.storage.local.get('unlockCountdowns');
  var countdowns = data.unlockCountdowns || {};
  var entry = countdowns[key];

  if (!entry || entry.url !== url) {
    entry = { url: url, domain: domain, startedAt: Date.now(), duration: DURATION * 1000 };
    countdowns[key] = entry;
    await chrome.storage.local.set({ unlockCountdowns: countdowns });
  }
  startCountdown(entry);
}

function startCountdown(entry) {
  function tick() {
    var elapsed = Date.now() - entry.startedAt;
    var remaining = Math.max(0, entry.duration - elapsed);
    var secs = Math.ceil(remaining / 1000);
    $countdown.textContent = secs;

    if (remaining <= 0) {
      $countdown.textContent = '✓';
      $btnUnlock.disabled = false;
      $btnUnlock.classList.add('btn-ready');
      return;
    }
    setTimeout(tick, 200);
  }
  tick();
}

// ── Unlock handler ─────────────────────────────────────────────
$btnUnlock.addEventListener('click', async function () {
  if ($btnUnlock.disabled) return;
  $btnUnlock.disabled = true;
  $btnUnlock.textContent = 'Unlocking…';
  try {
    await chrome.runtime.sendMessage({
      type: 'request-unlock',
      domain: domain,
      tabId: tabId,
    });
    window.location.href = url;
  } catch (err) {
    $btnUnlock.textContent = 'Error: ' + err.message;
  }
});
