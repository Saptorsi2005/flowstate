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

const HF_API_URL =
  'https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli';

// In-memory AI cache (tabId → {topLabel, topScore}) to avoid repeat calls
const _aiCache = new Map();

// ── AI Helper ──────────────────────────────────────────────────
function getDomain(url) {
  try { return new URL(url).hostname; } catch { return null; }
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
    throw new Error(`HF ${res.status}: ${t.slice(0, 120)}`);
  }
  return await res.json();
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
    ['activeWorkspaceId', 'workspaces', 'tempUnlockedDomains', 'hfApiKey', 'aiEnabled']
  );
  if (!data.activeWorkspaceId) return;

  const ws = (data.workspaces || {})[data.activeWorkspaceId];
  if (!ws) return;

  const domain = getDomain(url);
  if (!domain) return;

  // Temp-unlocked domains (tab-specific, from intent unlock)
  const unlocked = data.tempUnlockedDomains || [];
  if (unlocked.some(u => u.tabId === tabId && domain.includes(u.domain))) return;

  // Allowed domains take priority over blocked
  if ((ws.allowedDomains || []).some(d => domain.includes(d))) return;

  // ── 1. Manual blocklist check ──
  const manuallyBlocked = (ws.blockedDomains || []).some(d => domain.includes(d));

  if (manuallyBlocked) {
    redirectBlocked(tabId, url, ws.focusMode);
    return;
  }

  // ── 2. AI Smart Blocking (if enabled and key exists) ──
  if (data.aiEnabled && data.hfApiKey) {
    // Don't re-classify if we already processed this tab+url
    const cacheKey = `${tabId}:${domain}`;
    if (_aiCache.has(cacheKey)) {
      const cached = _aiCache.get(cacheKey);
      if (shouldAiBlock(cached.topLabel, cached.topScore, ws.focusMode)) {
        redirectBlocked(tabId, url, ws.focusMode);
      }
      return;
    }

    // Run AI classification asynchronously (don't await inline — tab already loading)
    classifyAndMaybeBlock(tabId, url, domain, ws, data.hfApiKey);
  }
});

async function classifyAndMaybeBlock(tabId, url, domain, ws, apiKey) {
  try {
    // Get tab title if available
    let title = '';
    try {
      const [tab] = await chrome.tabs.query({ active: true });
      if (tab && getDomain(tab.url) === domain) title = tab.title || '';
    } catch { }

    const result = await aiClassifySite(url, title, apiKey);
    _aiCache.set(`${tabId}:${domain}`, result);

    if (shouldAiBlock(result.topLabel, result.topScore, ws.focusMode)) {
      redirectBlocked(tabId, url, ws.focusMode);
    }
  } catch (err) {
    console.warn('[FlowState AI] Classification failed:', err.message);
  }
}

function shouldAiBlock(topLabel, topScore, focusMode) {
  const isDistraction = topLabel === 'entertainment and distraction' ||
    topLabel === 'social media';
  const threshold = focusMode === 'strict' ? 0.60 : 0.75;
  return isDistraction && topScore >= threshold;
}

function redirectBlocked(tabId, url, focusMode) {
  const encoded = encodeURIComponent(url);
  const page = focusMode === 'strict'
    ? `pages/blocked.html?url=${encoded}&tabId=${tabId}`
    : `pages/soft-redirect.html?url=${encoded}&tabId=${tabId}`;
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
      unlockCountdowns: {}
    });

    if (ws.savedTabs && ws.savedTabs.length > 0) {
      for (const t of ws.savedTabs) {
        try { await chrome.tabs.create({ url: t.url, active: false }); } catch { }
      }
    }

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
      unlockCountdowns: {}
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
