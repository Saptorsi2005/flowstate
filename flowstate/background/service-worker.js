/**
 * service-worker.js — FlowState Background Service Worker
 *
 * Self-contained (no imports) for maximum reliability.
 *
 * Handles:
 *   1. Domain blocking (Easy/Strict mode) via tabs.onUpdated
 *   2. AI-powered smart blocking using facebook/bart-large-mnli
 *   3. Workspace activation/deactivation
 *   4. Focus timer start/stop
 *   5. Intent unlock (including AI-scored reasons in strict mode)
 *   6. Tab removal cleanup
 */

import { initSyncListener } from "../utils/sync.js";

const HF_API_URL =
  'https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli';

// In-memory AI cache (tabId → {topLabel, topScore}) to avoid repeat calls
const _aiCache = new Map();

// Track the previously active tab so "Stay Focused" can return to it
let _previousTabId = null;
let _currentTabId = null;

// ── Extension Reload/Install Handler ───────────────────────────
// Reset workspace state when extension reloads/installs
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[FlowState] Extension loaded:', details.reason);

  // Get current state
  const data = await chrome.storage.local.get(['activeWorkspaceId', 'timer']);

  // If there's an active workspace, deactivate it
  if (data.activeWorkspaceId) {
    console.log('[FlowState] Auto-deactivating workspace on extension reload');

    let elapsed = data.timer?.elapsed || 0;
    if (data.timer?.running && data.timer?.startTime) {
      elapsed += Date.now() - data.timer.startTime;
    }

    // Reset to inactive state
    await chrome.storage.local.set({
      activeWorkspaceId: null,
      timer: { startTime: null, elapsed, running: false },
      tempUnlockedDomains: [],
      unlockCountdowns: {},
      aiEscalationLevels: {},
      aiTempBlocks: {}
    });

    _aiCache.clear();
    console.log('[FlowState] Workspace deactivated, restoring blocked tabs...');
  }

  // ── Restore blocked tabs after any reload/update ──────────────
  // Find all tabs showing FlowState block pages and navigate them
  // back to their original URLs so they don't go blank.
  try {
    const allTabs = await chrome.tabs.query({});
    const blockPagePatterns = ['blocked.html', 'soft-redirect.html', 'ai-escalation.html'];

    for (const tab of allTabs) {
      if (!tab.url) continue;
      const isBlockPage = blockPagePatterns.some(p => tab.url.includes(p));
      if (!isBlockPage) continue;

      try {
        // Extract the original URL from the ?url= query param
        const tabUrl = new URL(tab.url);
        const originalUrl = tabUrl.searchParams.get('url');
        if (originalUrl) {
          const decoded = decodeURIComponent(originalUrl);
          console.log('[FlowState] Restoring tab', tab.id, 'to:', decoded);
          await chrome.tabs.update(tab.id, { url: decoded });
        } else {
          // No original URL stored — fall back to new tab
          console.log('[FlowState] No original URL for tab', tab.id, '— opening new tab');
          await chrome.tabs.update(tab.id, { url: 'chrome://newtab' });
        }
      } catch (e) {
        console.warn('[FlowState] Could not restore tab', tab.id, e);
      }
    }
  } catch (e) {
    console.warn('[FlowState] Error restoring blocked tabs on reload:', e);
  }
});

// ── Storage Change Listener (AI Enable/Disable) ────────────────
// When AI Smart Blocking is toggled on, check all open tabs
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;

  // Handle AI being enabled/disabled
  if (changes.aiEnabled) {
    const wasEnabled = changes.aiEnabled.oldValue;
    const nowEnabled = changes.aiEnabled.newValue;

    // AI was just turned OFF - clear cache
    if (wasEnabled && !nowEnabled) {
      console.log('[FlowState] AI Smart Blocking disabled, clearing cache...');
      _aiCache.clear();
      return;
    }

    // AI was just turned ON - check all currently open tabs
    if (!wasEnabled && nowEnabled) {
      console.log('[FlowState] AI Smart Blocking enabled, checking all open tabs...');

      // Small delay to ensure popup has closed and tab states are stable
      await new Promise(resolve => setTimeout(resolve, 200));

      const data = await chrome.storage.local.get([
        'activeWorkspaceId',
        'workspaces',
        'hfApiKey',
        'aiEscalationLevels',
        'aiTempBlocks',
        'tempUnlockedDomains'
      ]);

      if (!data.activeWorkspaceId) {
        console.log('[FlowState] No active workspace, skipping AI check');
        return;
      }

      const ws = data.workspaces?.[data.activeWorkspaceId];
      if (!ws || !data.hfApiKey) {
        console.log('[FlowState] No workspace or API key, skipping AI check');
        return;
      }

      try {
        // Get ALL tabs from all windows
        const allTabs = await chrome.tabs.query({});
        // Find the currently active tab across all windows
        const currentActiveTab = allTabs.find(t => t.active);

        console.log('[FlowState] Found', allTabs.length, 'tabs to check');
        console.log('[FlowState] Current active tab:', currentActiveTab?.id, currentActiveTab?.url);

        // Process current active tab FIRST for immediate feedback
        const tabsToProcess = currentActiveTab
          ? [currentActiveTab, ...allTabs.filter(t => t.id !== currentActiveTab.id)]
          : allTabs;

        for (const tab of tabsToProcess) {
          if (!tab.url) continue;

          const url = tab.url;

          // Skip extension & browser pages
          if (url.startsWith('chrome-extension://') ||
            url.startsWith('chrome://') ||
            url.startsWith('about:') ||
            url.startsWith('edge://')) continue;

          const domain = getDomain(url);
          if (!domain) continue;

          // Skip if manually blocked (already handled) or allowed
          if (isDomainInList(domain, ws.blockedDomains)) continue;
          if (isDomainInList(domain, ws.allowedDomains)) continue;

          // Skip if temp unlocked
          const unlocked = data.tempUnlockedDomains || [];
          if (unlocked.some(u => u.tabId === tab.id && domain.includes(u.domain))) continue;

          const isCurrentActiveTab = currentActiveTab && tab.id === currentActiveTab.id;
          console.log('[FlowState] Checking tab:', domain, 'ID:', tab.id, isCurrentActiveTab ? '(CURRENT ACTIVE)' : '');

          // Check if we have a cached AI result for this tab
          const cacheKey = `${tab.id}:${domain}`;
          const cachedResult = _aiCache.get(cacheKey);

          if (cachedResult) {
            // We have a cached result - check if it should be blocked
            console.log('[FlowState] Found cached AI result for:', domain, cachedResult);
            if (shouldAiBlock(cachedResult.topLabel, cachedResult.topScore, ws.focusMode)) {
              console.log('[FlowState] Blocking based on cached result');
              handleAiBlocking(tab.id, url, domain, ws.focusMode, data);
            }
          } else {
            // No cached result - run AI classification
            console.log('[FlowState] No cache, running AI classification for:', domain);
            // For current active tab, await to ensure immediate blocking
            if (isCurrentActiveTab) {
              console.log('[FlowState] Awaiting classification for current active tab...');
              await classifyAndMaybeBlock(tab.id, url, domain, ws, data.hfApiKey, data);
              console.log('[FlowState] Current active tab classification complete');
            } else {
              classifyAndMaybeBlock(tab.id, url, domain, ws, data.hfApiKey, data);
            }
          }
        }
      } catch (err) {
        console.warn('[FlowState] Error checking tabs on AI enable:', err);
      }
    }
  }
});

// ── AI Helper ──────────────────────────────────────────────────
function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

// Helper to extract domain from potentially full URL in blocked list
function extractDomain(entry) {
  try {
    if (entry.startsWith('http://') || entry.startsWith('https://')) {
      return new URL(entry).hostname.replace(/^www\./, '');
    }
    return entry.replace(/^www\./, '');
  } catch {
    return entry.replace(/^www\./, '');
  }
}

// Check if a domain matches any entry in the list
function isDomainInList(domain, domainList) {
  if (!domain || !domainList) return false;
  return domainList.some(entry => {
    const cleanEntry = extractDomain(entry);
    return domain.includes(cleanEntry) || cleanEntry.includes(domain);
  });
}

async function callBartMNLI(text, candidateLabels, apiKey) {
  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: text,
      parameters: { candidate_labels: candidateLabels, multi_label: false },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API Error (${res.status}): ${t.slice(0, 100)}`);
  }
  const data = await res.json();

  // Handle model loading state
  if (data.error) {
    console.error('HuggingFace API error:', data);
    if (data.error.includes('loading') || data.estimated_time) {
      throw new Error('⏳ AI model is waking up... Wait 20-30 seconds and try again.');
    }
    throw new Error(`AI Error: ${data.error.slice(0, 100)}`);
  }

  // Handle array format: [{label: '...', score: 0.x}, ...]
  if (Array.isArray(data) && data.length > 0 && data[0].label && data[0].score !== undefined) {
    return {
      labels: data.map(item => item.label),
      scores: data.map(item => item.score)
    };
  }

  // Handle object format: {labels: [...], scores: [...]}
  if (data.labels && data.scores && Array.isArray(data.labels)) {
    return data;
  }

  // Unexpected format
  console.error('Unexpected HuggingFace response structure:', data);
  throw new Error('⏳ Model is starting up. Wait 30 seconds and click "Test AI" again.');
}

async function aiClassifySite(url, title, apiKey) {
  const host = getDomain(url) || url;
  const text = title ? `${host} — ${title}` : host;
  const data = await callBartMNLI(text, [
    'productive work',
    'entertainment and distraction',
    'social media',
    'neutral browsing',
  ], apiKey);
  return { topLabel: data.labels[0], topScore: data.scores[0] };
}

async function aiScoreReason(reason, apiKey) {
  const data = await callBartMNLI(reason, [
    'legitimate work reason',
    'distraction or procrastination excuse',
  ], apiKey);
  const allowed = data.labels[0] === 'legitimate work reason' && data.scores[0] > 0.65;
  return { allowed, label: data.labels[0], score: data.scores[0] };
}

// ── Domain Blocking (tabs.onUpdated) ───────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  const url = changeInfo.url;

  // Skip extension & browser pages
  if (url.startsWith('chrome-extension://') ||
    url.startsWith('chrome://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://')) return;

  const data = await chrome.storage.local.get(
    ['activeWorkspaceId', 'workspaces', 'tempUnlockedDomains', 'hfApiKey', 'aiEnabled', 'aiEscalationLevels', 'aiTempBlocks']
  );
  if (!data.activeWorkspaceId) return;

  const ws = (data.workspaces || {})[data.activeWorkspaceId];
  if (!ws) return;

  const domain = getDomain(url);
  if (!domain) return;

  console.log('[FlowState] Checking:', domain, 'against workspace:', ws.name);

  // Temp-unlocked domains (tab-specific, from intent unlock)
  const unlocked = data.tempUnlockedDomains || [];
  if (unlocked.some(u => u.tabId === tabId && domain.includes(u.domain))) return;

  // Allowed domains take priority over blocked
  if (isDomainInList(domain, ws.allowedDomains)) {
    console.log('[FlowState] Domain explicitly allowed:', domain);
    return;
  }

  // ── 1. Manual blocklist check ──
  const manuallyBlocked = isDomainInList(domain, ws.blockedDomains);

  if (manuallyBlocked) {
    console.log('[FlowState] Blocking (manual):', domain);
    redirectBlocked(tabId, url, ws.focusMode, 'manual');
    return;
  }

  // ── 2. AI Smart Blocking (if enabled and key exists) ──
  if (data.aiEnabled && data.hfApiKey) {
    console.log('[FlowState] AI blocking enabled, checking domain:', domain);

    // Check temporary AI blocks
    const aiTempBlocks = data.aiTempBlocks || {};
    if (aiTempBlocks[domain] && aiTempBlocks[domain].blockedUntil > Date.now()) {
      console.log('[FlowState] Blocking (AI temp block):', domain);
      redirectBlocked(tabId, url, 'strict', 'ai-temp-block');
      return;
    }

    // Don't re-classify if we already processed this tab+url
    const cacheKey = `${tabId}:${domain}`;
    if (_aiCache.has(cacheKey)) {
      const cached = _aiCache.get(cacheKey);
      if (shouldAiBlock(cached.topLabel, cached.topScore, ws.focusMode)) {
        handleAiBlocking(tabId, url, domain, ws.focusMode, data);
      }
      return;
    }

    // Run AI classification asynchronously (don't await inline — tab already loading)
    classifyAndMaybeBlock(tabId, url, domain, ws, data.hfApiKey, data);
  }
});

// ── Tab Activation (switching to existing tab) ─────────────────
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // Track previous tab for "Stay Focused" redirect
    if (_currentTabId !== null && _currentTabId !== activeInfo.tabId) {
      _previousTabId = _currentTabId;
    }
    _currentTabId = activeInfo.tabId;

    // Small delay to ensure tab is ready
    await new Promise(resolve => setTimeout(resolve, 50));

    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab.url) return;

    const url = tab.url;

    console.log('[FlowState onActivated] Checking tab:', tab.id, url);

    // Skip extension & browser pages
    if (url.startsWith('chrome-extension://') ||
      url.startsWith('chrome://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')) {
      console.log('[FlowState onActivated] Skipping system page');
      return;
    }

    const data = await chrome.storage.local.get(
      ['activeWorkspaceId', 'workspaces', 'tempUnlockedDomains', 'hfApiKey', 'aiEnabled', 'aiEscalationLevels', 'aiTempBlocks']
    );
    if (!data.activeWorkspaceId) {
      console.log('[FlowState onActivated] No active workspace');
      return;
    }

    const ws = (data.workspaces || {})[data.activeWorkspaceId];
    if (!ws) {
      console.log('[FlowState onActivated] Workspace not found');
      return;
    }

    const domain = getDomain(url);
    if (!domain) return;

    console.log('[FlowState onActivated] Tab activated:', domain, 'Blocked list:', ws.blockedDomains);

    // Temp-unlocked domains (tab-specific, from intent unlock)
    const unlocked = data.tempUnlockedDomains || [];
    if (unlocked.some(u => u.tabId === activeInfo.tabId && domain.includes(u.domain))) return;

    // Allowed domains take priority over blocked
    if (isDomainInList(domain, ws.allowedDomains)) {
      console.log('[FlowState] Domain allowed:', domain);
      return;
    }

    // ── 1. Manual blocklist check ──
    const manuallyBlocked = isDomainInList(domain, ws.blockedDomains);

    if (manuallyBlocked) {
      console.log('[FlowState] Blocking activated tab (manual):', domain);
      redirectBlocked(activeInfo.tabId, url, ws.focusMode, 'manual');
      return;
    }

    // ── 2. AI Smart Blocking (if enabled and key exists) ──
    if (data.aiEnabled && data.hfApiKey) {
      console.log('[FlowState] AI blocking enabled for activated tab:', domain);

      // Check temporary AI blocks
      const aiTempBlocks = data.aiTempBlocks || {};
      if (aiTempBlocks[domain] && aiTempBlocks[domain].blockedUntil > Date.now()) {
        console.log('[FlowState] Blocking activated tab (AI temp block):', domain);
        redirectBlocked(activeInfo.tabId, url, 'strict', 'ai-temp-block');
        return;
      }

      // Don't re-classify if we already processed this tab+url
      const cacheKey = `${activeInfo.tabId}:${domain}`;
      if (_aiCache.has(cacheKey)) {
        const cached = _aiCache.get(cacheKey);
        if (shouldAiBlock(cached.topLabel, cached.topScore, ws.focusMode)) {
          handleAiBlocking(activeInfo.tabId, url, domain, ws.focusMode, data);
        }
        return;
      }

      // Run AI classification asynchronously
      classifyAndMaybeBlock(activeInfo.tabId, url, domain, ws, data.hfApiKey, data);
    }
  } catch (err) {
    console.error('[FlowState] Error in onActivated:', err);
  }
});

async function classifyAndMaybeBlock(tabId, url, domain, ws, apiKey, data) {
  try {
    console.log('[FlowState AI] Classifying:', domain, 'for tab', tabId);

    // Get tab title if available
    let title = '';
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) title = tab.title || '';
    } catch { }

    const result = await aiClassifySite(url, title, apiKey);
    _aiCache.set(`${tabId}:${domain}`, result);

    console.log('[FlowState AI] Classification result:', domain, result);

    if (shouldAiBlock(result.topLabel, result.topScore, ws.focusMode)) {
      console.log('[FlowState AI] BLOCKING tab', tabId, domain);
      handleAiBlocking(tabId, url, domain, ws.focusMode, data);
    } else {
      console.log('[FlowState AI] NOT blocking:', domain, '(score too low or wrong category)');
    }
  } catch (err) {
    console.warn('[FlowState AI] Classification failed:', err.message);
  }
}

// ── AI Escalation Logic ────────────────────────────────────────
async function handleAiBlocking(tabId, url, domain, focusMode, data) {
  console.log('[FlowState AI] handleAiBlocking called for tab', tabId, domain, 'focusMode:', focusMode);

  if (focusMode === 'strict') {
    // STRICT MODE: Immediate block
    console.log('[FlowState AI] STRICT mode - immediate block');
    redirectBlocked(tabId, url, 'strict', 'ai-block');
    return;
  }

  // EASY MODE: Escalation levels
  const escalationLevels = data.aiEscalationLevels || {};
  const current = escalationLevels[domain] || { level: 0, lastVisit: 0 };

  // Reset if more than 1 hour since last visit
  const ONE_HOUR = 60 * 60 * 1000;
  if (Date.now() - current.lastVisit > ONE_HOUR) {
    current.level = 0;
  }

  // Increment level
  current.level = Math.min(current.level + 1, 4);
  current.lastVisit = Date.now();

  escalationLevels[domain] = current;
  await chrome.storage.local.set({ aiEscalationLevels: escalationLevels });

  console.log('[FlowState AI] EASY mode - escalation level', current.level, 'for', domain);

  // Redirect based on level
  if (current.level === 1) {
    // Level 1: Small warning (let it load with warning banner)
    redirectToEscalation(tabId, url, domain, 1);
  } else if (current.level === 2) {
    // Level 2: 3-second delay
    redirectToEscalation(tabId, url, domain, 2);
  } else if (current.level === 3) {
    // Level 3: Full intent confirmation
    redirectToEscalation(tabId, url, domain, 3);
  } else if (current.level >= 4) {
    // Level 4: Temporary block (10 minutes)
    const aiTempBlocks = data.aiTempBlocks || {};
    aiTempBlocks[domain] = { blockedUntil: Date.now() + (10 * 60 * 1000) };
    await chrome.storage.local.set({ aiTempBlocks });
    redirectBlocked(tabId, url, 'strict', 'ai-temp-block');
  }
}

function redirectToEscalation(tabId, url, domain, level) {
  const encoded = encodeURIComponent(url);
  const page = `pages/ai-escalation.html?url=${encoded}&domain=${encodeURIComponent(domain)}&level=${level}&tabId=${tabId}`;
  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(page) });
}

function shouldAiBlock(topLabel, topScore, focusMode) {
  const isDistraction = topLabel === 'entertainment and distraction' ||
    topLabel === 'social media';
  const threshold = focusMode === 'strict' ? 0.60 : 0.75;
  return isDistraction && topScore >= threshold;
}

function redirectBlocked(tabId, url, focusMode, blockType = 'manual') {
  const encoded = encodeURIComponent(url);
  let page;

  // Determine the previous (focus) tab to return to when user clicks "Stay Focused"
  const prevId = (_previousTabId !== null && _previousTabId !== tabId) ? _previousTabId : null;

  if (blockType === 'ai-temp-block') {
    // Temporary AI block (always strict)
    page = `pages/blocked.html?url=${encoded}&tabId=${tabId}&type=ai-temp`;
  } else if (blockType === 'ai-block') {
    // AI-detected block (strict mode)
    page = `pages/blocked.html?url=${encoded}&tabId=${tabId}&type=ai`;
  } else {
    // Manual block (use focus mode)
    const prevParam = prevId !== null ? `&prevTabId=${prevId}` : '';
    page = focusMode === 'strict'
      ? `pages/blocked.html?url=${encoded}&tabId=${tabId}&type=manual`
      : `pages/soft-redirect.html?url=${encoded}&tabId=${tabId}&mode=${focusMode}${prevParam}`;
  }

  chrome.tabs.update(tabId, { url: chrome.runtime.getURL(page) });
}

// ── Tab Removal Cleanup ────────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get(
    ['tempUnlockedDomains', 'unlockCountdowns']
  );
  const filtered = (data.tempUnlockedDomains || []).filter(u => u.tabId !== tabId);
  const countdowns = data.unlockCountdowns || {};
  delete countdowns[String(tabId)];
  _aiCache.delete(`${tabId}:*`); // best-effort cleanup
  await chrome.storage.local.set({
    tempUnlockedDomains: filtered,
    unlockCountdowns: countdowns
  });
});

// ── Message Router ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse);
  return true;
});

async function handleMessage(msg, sender) {
  switch (msg.type) {
    case 'ping': return { success: true }; // For extension reload detection
    case 'activate-workspace': return activateWorkspace(msg.id);
    case 'deactivate-workspace': return deactivateWorkspace();
    case 'request-unlock': return handleUnlock(msg.domain, msg.tabId);
    case 'ai-classify': return handleAiClassify(msg.url, msg.title);
    case 'ai-score-intent': return handleAiScoreIntent(msg.reason);
    default: return { error: 'Unknown message type' };
  }
}

// ── AI Message Handlers ────────────────────────────────────────
async function handleAiClassify(url, title) {
  try {
    const { hfApiKey, aiEnabled } = await chrome.storage.local.get(['hfApiKey', 'aiEnabled']);
    if (!hfApiKey) return { success: false, error: 'No API key set. Go to AI Settings in the popup.' };
    const result = await aiClassifySite(url, title || '', hfApiKey);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleAiScoreIntent(reason) {
  try {
    const { hfApiKey } = await chrome.storage.local.get('hfApiKey');
    if (!hfApiKey) return { success: false, error: 'No API key set.' };
    const result = await aiScoreReason(reason, hfApiKey);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Workspace Activation ───────────────────────────────────────
async function activateWorkspace(id) {
  try {
    const { workspaces } = await chrome.storage.local.get('workspaces');
    const ws = (workspaces || {})[id];
    if (!ws) return { success: false, error: 'Workspace not found' };

    _aiCache.clear(); // Clear AI cache on new session

    await chrome.storage.local.set({
      activeWorkspaceId: id,
      timer: { startTime: Date.now(), elapsed: 0, running: true },
      tempUnlockedDomains: [],
      unlockCountdowns: {},
      aiEscalationLevels: {}, // Fresh start with escalation levels
      aiTempBlocks: {} // Clear any previous temp blocks
    });

    // Disabled: Auto-restoring saved tabs on activation
    // If you want to restore tabs, do it manually from the popup
    // if (ws.savedTabs && ws.savedTabs.length > 0) {
    //   for (const t of ws.savedTabs) {
    //     try { await chrome.tabs.create({ url: t.url, active: false }); } catch { }
    //   }
    // }

    // Don't check or block tabs immediately on activation - let tabs.onUpdated handle it naturally
    // This prevents infinite loops and double-blocking

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Workspace Deactivation ─────────────────────────────────────
async function deactivateWorkspace() {
  try {
    const { timer } = await chrome.storage.local.get('timer');
    let elapsed = timer?.elapsed || 0;
    if (timer?.running && timer?.startTime) {
      elapsed += Date.now() - timer.startTime;
    }
    _aiCache.clear();
    await chrome.storage.local.set({
      activeWorkspaceId: null,
      timer: { startTime: null, elapsed, running: false },
      tempUnlockedDomains: [],
      unlockCountdowns: {},
      aiEscalationLevels: {}, // Reset escalation levels
      aiTempBlocks: {} // Clear temporary blocks
    });
    return { success: true, elapsed };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Intent Unlock ──────────────────────────────────────────────
async function handleUnlock(domain, tabId) {
  try {
    const { tempUnlockedDomains = [] } = await chrome.storage.local.get('tempUnlockedDomains');
    tempUnlockedDomains.push({ domain, tabId });
    await chrome.storage.local.set({ tempUnlockedDomains });

    const { unlockCountdowns = {} } = await chrome.storage.local.get('unlockCountdowns');
    delete unlockCountdowns[String(tabId)];
    await chrome.storage.local.set({ unlockCountdowns });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

initSyncListener();

// ── Auth0 Device Code Flow polling (lives in SW so popup close is safe) ─────
// Popup sends FS_START_DEVICE_POLL → SW stores deviceCode + schedules alarms
// On each alarm: one poll attempt → store syncJwt on approval → popup onChanged fires

const _AUTH_ALARM = 'flowstate-auth-poll';
const _AUTH_API = 'https://flowstate-backend.vercel.app';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FS_START_DEVICE_POLL') {
    const interval = Math.max(msg.interval ?? 5, 5);
    chrome.storage.local
      .set({ _pendingDeviceCode: msg.deviceCode, _pollIntervalSecs: interval })
      .then(() => {
        chrome.alarms.create(_AUTH_ALARM, { delayInMinutes: interval / 60 });
        sendResponse({ ok: true });
      });
    return true;
  }

  if (msg.type === 'FS_CANCEL_DEVICE_POLL') {
    chrome.alarms.clear(_AUTH_ALARM);
    chrome.storage.local.remove(['_pendingDeviceCode', '_pollIntervalSecs']);
    sendResponse({ ok: true });
    return true;
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== _AUTH_ALARM) return;

  const { _pendingDeviceCode, _pollIntervalSecs } =
    await chrome.storage.local.get(['_pendingDeviceCode', '_pollIntervalSecs']);
  if (!_pendingDeviceCode) return;

  const intervalSecs = _pollIntervalSecs ?? 5;

  try {
    const res = await fetch(`${_AUTH_API}/api/auth/device-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode: _pendingDeviceCode }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    console.log('[FlowState SW Auth] poll:', data.status);

    if (data.status === 'approved' && data.accessToken) {
      // Store JWT — popup's storage.onChanged listener will update UI
      await chrome.storage.local.set({ syncJwt: data.accessToken });

      // Decode and store user info for display in popup
      try {
        const [, payload] = data.accessToken.split('.');
        const user = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        await chrome.storage.local.set({
          syncUser: { email: user.email || null, name: user.name || user.email || 'User', sub: user.sub || null }
        });
      } catch { /* decode failed — JWT still stored, email just won't show */ }

      await chrome.storage.local.remove(['_pendingDeviceCode', '_pollIntervalSecs']);
      return; // done
    }

    if (data.status === 'expired' || data.status === 'denied' || data.status === 'error') {
      await chrome.storage.local.remove(['_pendingDeviceCode', '_pollIntervalSecs']);
      return; // done (failed)
    }

    // Still pending — reschedule
    chrome.alarms.create(_AUTH_ALARM, { delayInMinutes: intervalSecs / 60 });

  } catch (err) {
    console.warn('[FlowState SW Auth] poll error:', err.message);
    chrome.alarms.create(_AUTH_ALARM, { delayInMinutes: intervalSecs / 60 });
  }
});
