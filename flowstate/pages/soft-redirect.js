/**
 * soft-redirect.js — Easy Mode warning page
 *
 * "Stay Focused" goes back. "Continue Anyway" temp-unlocks and navigates.
 */

var params = new URLSearchParams(window.location.search);
var url    = params.get('url') ? decodeURIComponent(params.get('url')) : null;
var tabId  = params.get('tabId') ? parseInt(params.get('tabId'), 10) : null;

var domain = '';
try { domain = new URL(url).hostname; } catch(e) {}

document.getElementById('target-url').textContent = domain || url || 'Unknown site';

document.getElementById('btn-stay').addEventListener('click', function() {
  if (history.length > 1) {
    history.back();
  } else {
    window.close();
  }
});

document.getElementById('btn-continue').addEventListener('click', async function() {
  try {
    await chrome.runtime.sendMessage({
      type: 'request-unlock',
      domain: domain,
      tabId: tabId
    });
    window.location.href = url;
  } catch(e) {
    window.location.href = url;
  }
});
