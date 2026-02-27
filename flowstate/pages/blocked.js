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

// Check if AI key is available; if not, skip intent step and show direct countdown
(async function init() {
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
