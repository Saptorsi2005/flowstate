/**
 * blocked.js — Strict Mode block page with Intent Unlock
 *
 * Countdown persists in chrome.storage.local keyed by tabId,
 * so refreshing the page does NOT reset the timer.
 */

var params   = new URLSearchParams(window.location.search);
var url      = params.get('url') ? decodeURIComponent(params.get('url')) : null;
var tabId    = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;
var DURATION = 15; // seconds

var $url       = document.getElementById('blocked-url');
var $countdown = document.getElementById('countdown');
var $btn       = document.getElementById('btn-unlock');

var domain = '';
try { domain = new URL(url).hostname; } catch(e) {}

$url.textContent = domain || url || 'Unknown site';

// Load or create countdown state, then start ticking
(async function init() {
  var key = String(tabId);
  var data = await chrome.storage.local.get('unlockCountdowns');
  var countdowns = data.unlockCountdowns || {};
  var entry = countdowns[key];

  if (!entry || entry.url !== url) {
    // New countdown — store start time
    entry = { url: url, domain: domain, startedAt: Date.now(), duration: DURATION * 1000 };
    countdowns[key] = entry;
    await chrome.storage.local.set({ unlockCountdowns: countdowns });
  }

  startCountdown(entry);
})();

function startCountdown(entry) {
  function tick() {
    var elapsed = Date.now() - entry.startedAt;
    var remaining = Math.max(0, entry.duration - elapsed);
    var secs = Math.ceil(remaining / 1000);

    $countdown.textContent = secs;

    if (remaining <= 0) {
      $countdown.textContent = '\u2713';
      $btn.disabled = false;
      $btn.classList.add('btn-ready');
      return;
    }

    setTimeout(tick, 200);
  }
  tick();
}

// Unlock handler
$btn.addEventListener('click', async function() {
  if ($btn.disabled) return;
  $btn.disabled = true;
  $btn.textContent = 'Unlocking\u2026';

  try {
    await chrome.runtime.sendMessage({
      type: 'request-unlock',
      domain: domain,
      tabId: tabId
    });
    window.location.href = url;
  } catch (err) {
    $btn.textContent = 'Error: ' + err.message;
  }
});
