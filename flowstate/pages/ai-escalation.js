/**
 * ai-escalation.js — AI Escalation Level Handler
 * Handles Level 1 (warning), Level 2 (delay), Level 3 (intent)
 */

const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');
const domain = params.get('domain');
const level = parseInt(params.get('level') || '1');
const tabId = parseInt(params.get('tabId'));

// Reload detection temporarily disabled to prevent false positives
// Extension reload will naturally invalidate pages

// ── Listen for focus mode changes ──────────────────────────────────────
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  
  // Handle AI Smart Blocking being disabled
  if (changes.aiEnabled) {
    const aiEnabled = changes.aiEnabled.newValue;
    // If AI was disabled, unblock and navigate to original URL
    if (!aiEnabled) {
      console.log('[FlowState] AI Smart Blocking disabled, navigating to original URL');
      window.location.href = targetUrl || 'chrome://newtab';
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
      
      // If focus mode changed to strict, reload as blocked page
      if (ws.focusMode === 'strict') {
        console.log('[FlowState] Focus mode changed to strict, switching from escalation to blocked page');
        const encoded = encodeURIComponent(targetUrl);
        window.location.href = chrome.runtime.getURL(
          `pages/blocked.html?url=${encoded}&tabId=${tabId}&type=manual`
        );
      }
    } catch (e) {
      console.warn('[FlowState] Error checking focus mode change:', e);
    }
  }
});

// Show the appropriate level
const $level1 = document.getElementById('level-1');
const $level2 = document.getElementById('level-2');
const $level3 = document.getElementById('level-3');

if (level === 1) {
  handleLevel1();
} else if (level === 2) {
  handleLevel2();
} else if (level === 3) {
  handleLevel3();
}

// ── LEVEL 1: Warning Banner ────────────────────────────────────
function handleLevel1() {
  $level1.classList.remove('hidden');
  
  // Auto-redirect after showing warning
  setTimeout(() => {
    window.location.href = targetUrl;
  }, 2000);

  // Or manual dismiss
  document.getElementById('btn-dismiss-l1').addEventListener('click', () => {
    window.location.href = targetUrl;
  });
}

// ── LEVEL 2: 3-Second Delay ─────────────────────────────────────
function handleLevel2() {
  $level2.classList.remove('hidden');
  
  let countdown = 3;
  const $countdownNum = document.getElementById('countdown-l2');
  const $countdownText = document.getElementById('countdown-l2-text');
  
  const timer = setInterval(() => {
    countdown--;
    $countdownNum.textContent = countdown;
    $countdownText.textContent = countdown;
    
    if (countdown <= 0) {
      clearInterval(timer);
      window.location.href = targetUrl;
    }
  }, 1000);
}

// ── LEVEL 3: Intent Confirmation ────────────────────────────────
function handleLevel3() {
  $level3.classList.remove('hidden');
  
  const $targetUrl = document.getElementById('target-url-l3');
  const $intentInput = document.getElementById('intent-input-l3');
  const $btnGoBack = document.getElementById('btn-go-back-l3');
  const $btnContinue = document.getElementById('btn-continue-l3');
  
  // Display domain
  try {
    const url = new URL(targetUrl);
    $targetUrl.textContent = url.hostname;
  } catch {
    $targetUrl.textContent = domain;
  }
  
  // Go back button
  $btnGoBack.addEventListener('click', async () => {
    try {
      // Close the current tab - browser will automatically switch to previous tab
      const currentTab = await chrome.tabs.getCurrent();
      if (currentTab) {
        await chrome.tabs.remove(currentTab.id);
      } else {
        // Fallback if getCurrent doesn't work
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.close();
        }
      }
    } catch (e) {
      // Fallback to history.back or close
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    }
  });
  
  // Continue button
  $btnContinue.addEventListener('click', async () => {
    const reason = $intentInput.value.trim();
    
    // Log the reason (optional: could send to analytics or AI evaluation)
    if (reason) {
      console.log('[FlowState] User reason for accessing distraction:', reason);
    }
    
    // Allow access
    window.location.href = targetUrl;
  });
  
  // Auto-focus textarea
  $intentInput.focus();
}
