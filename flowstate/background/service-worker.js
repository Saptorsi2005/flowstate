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

// ── Social Media Domain Detection ────────────────────────────────
// Brand names matched against the second-level domain (SLD).
// Catches ALL subdomains (m., api., business.), mobile variants,
// and country TLD versions automatically — no manual listing needed.
const SOCIAL_MEDIA_BRANDS = new Set([
  'instagram', 'facebook', 'twitter', 'x', 'tiktok',
  // NOTE: 'youtube' is intentionally excluded — YouTube is handled
  // route-specifically (Shorts only) via isYouTubeShorts() below.
  'snapchat', 'linkedin', 'reddit', 'pinterest', 'whatsapp',
  'telegram', 'discord', 'tumblr', 'threads', 'twitch',
  'vimeo', 'dailymotion', 'weibo', 'bereal', 'quora',
  'messenger', 'signal', 'mastodon', 'clubhouse',
]);

// Exact hostname matches for URL shorteners and special cases
// whose name doesn’t match the parent platform brand.
const SOCIAL_MEDIA_EXACT_DOMAINS = new Set([
  't.co',            // Twitter shortlink
  'fb.com',          // Facebook shortlink
  'fb.me',           // Facebook shortlink
  // NOTE: 'youtu.be' excluded — it links to watch pages, not a block-all
  'instagr.am',      // Instagram shortlink
  'wa.me',           // WhatsApp click-to-chat
  'l.instagram.com', // Instagram link redirect
  'lnkd.in',         // LinkedIn shortlink
  'vm.tiktok.com',   // TikTok video shortlink
]);

// Common multi-level public suffixes (simplified PSL subset)
// so that ‘twitter.co.uk’ correctly extracts SLD ‘twitter’.
const MULTI_LEVEL_TLDS = new Set([
  'co.uk', 'co.in', 'co.jp', 'co.nz', 'co.za', 'co.au',
  'com.au', 'com.br', 'com.mx', 'com.ar', 'com.cn',
  'net.au', 'org.uk', 'me.uk', 'ltd.uk',
]);

/**
 * Extract the brand-level second-level domain from a hostname.
 *   m.instagram.com       → 'instagram'
 *   business.facebook.com → 'facebook'
 *   twitter.co.uk         → 'twitter'
 *   x.com                 → 'x'
 */
function extractSLD(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 1) return hostname;
  if (parts.length >= 3) {
    const candidateTld = parts.slice(-2).join('.');
    if (MULTI_LEVEL_TLDS.has(candidateTld)) return parts[parts.length - 3];
  }
  return parts[parts.length - 2]; // standard: brand is second-to-last part
}

/**
 * Returns true if ‘url’ belongs to a known social media platform,
 * regardless of subdomain, mobile prefix, API subdomain, or country TLD.
 * Uses the URL API for parsing — no naive string matching.
 */
function isSocialMediaDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (SOCIAL_MEDIA_EXACT_DOMAINS.has(hostname)) return true;
    const sld = extractSLD(hostname);
    return sld ? SOCIAL_MEDIA_BRANDS.has(sld) : false;
  } catch {
    return false;
  }
}

// ── YouTube Route Detection ──────────────────────────────────────
// YouTube is NEVER blocked at the domain level.
// Only specific routes are intercepted (/shorts/ only).
// /watch, /search, /playlist, / are ALWAYS allowed through.

const _YT_HOSTS = new Set(['youtube.com', 'm.youtube.com']);

/**
 * Returns true ONLY for youtube.com/shorts/* URLs.
 * Any other YouTube route returns false — never blocked here.
 */
function isYouTubeShorts(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    // Match both /shorts (bare) and /shorts/VIDEO_ID
    return _YT_HOSTS.has(host) &&
      (u.pathname === '/shorts' || u.pathname.startsWith('/shorts/'));
  } catch { return false; }
}

/**
 * Hard guard — returns true for ANY YouTube URL that must never be blocked:
 *   youtube.com/            (homepage)
 *   youtube.com/watch       (videos)
 *   youtube.com/results/*   (search)
 *   youtube.com/playlist/*  (playlists)
 *   youtube.com/channel/*   (channels)
 *   youtube.com/@*          (handles)
 *   youtube.com/feed/*      (feeds)
 *   ...basically everything that isn’t /shorts/*
 *
 * This guard sits BEFORE the static social media check and the AI classifier.
 * It makes it IMPOSSIBLE for non-Shorts YouTube routes to be blocked
 * by any downstream logic, including AI classification.
 */
function isYouTubeSafePath(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!_YT_HOSTS.has(host)) return false; // not YouTube at all
    // Explicit safeguard for homepage
    if (u.pathname === '/' || u.pathname === '') return true;
    // /shorts and /shorts/* are NOT safe — they go through the blocking pipeline
    if (u.pathname === '/shorts' || u.pathname.startsWith('/shorts/')) return false;
    // Everything else (watch, search, playlist, channel, @handle, feed) is safe
    return true;
  } catch { return false; }
}

// Per-tab doomscroll escalation levels (in-memory, resets on tab close)
const _doomScrollLevels = new Map(); // tabId → { level, lastTrigger }

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

  // ── 0. YouTube Shorts — highest priority, checked before everything else ──
  // Must be BEFORE the manual blocklist so that even if the user has
  // youtube.com in their blocked list (which would trigger a soft-redirect
  // in easy mode), Shorts always goes directly to blocked.html.
  if (isYouTubeShorts(url)) {
    console.log('[FlowState] Blocking YouTube Shorts (direct block) | url:', url);
    redirectBlocked(tabId, url, 'strict', 'manual');
    return;
  }

  // ── 1. Manual blocklist check ──
  const manuallyBlocked = isDomainInList(domain, ws.blockedDomains);

  if (manuallyBlocked) {
    console.log('[FlowState] Blocking (manual):', domain);
    redirectBlocked(tabId, url, ws.focusMode, 'manual');
    return;
  }

  // ── 1.5a. YouTube safe-path guard ──
  // Any YouTube URL that is NOT /shorts/ is explicitly allowed through
  // (homepage, watch, search, playlist, channel, @handle, feed).
  if (isYouTubeSafePath(url)) {
    console.log('[FlowState] YouTube safe route — explicitly allowed:', url);
    return;
  }

  // ── 1.5b. Static social media check ──
  if (isSocialMediaDomain(url)) {
    console.log('[FlowState] Blocking (static social media):', domain);
    redirectBlocked(tabId, url, ws.focusMode, 'ai-block');
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

    // ── 0. YouTube Shorts — highest priority, before manual list ──
    if (isYouTubeShorts(url)) {
      console.log('[FlowState] Blocking YouTube Shorts (activated, direct block) | url:', url);
      redirectBlocked(activeInfo.tabId, url, 'strict', 'manual');
      return;
    }

    // ── 1. Manual blocklist check ──
    const manuallyBlocked = isDomainInList(domain, ws.blockedDomains);

    if (manuallyBlocked) {
      console.log('[FlowState] Blocking activated tab (manual):', domain);
      redirectBlocked(activeInfo.tabId, url, ws.focusMode, 'manual');
      return;
    }

    // ── 1.5a. YouTube safe-path guard ──
    if (isYouTubeSafePath(url)) {
      console.log('[FlowState] YouTube safe route (activated tab) — explicitly allowed:', url);
      return;
    }

    // ── 1.5b. Static social media check ──
    if (isSocialMediaDomain(url)) {
      console.log('[FlowState] Blocking activated tab (static social media):', domain);
      redirectBlocked(activeInfo.tabId, url, ws.focusMode, 'ai-block');
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
    case 'doomscroll-trigger': return handleDoomScrollTrigger(msg, sender);
    case 'doomscroll-classify': return handleDoomScrollClassify(msg.title, msg.url, msg.urlType);
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

// ── Doomscroll Handlers ────────────────────────────────────────────────────────
/**
 * Handles behavioral escalation sent by content/doomscroll.js.
 * Decision tree:
 *   Strict mode OR doomScore > 1.0  → immediate hard block
 *   Easy mode                        → 4-level escalation ladder
 *
 * Blocking is ROUTE-SPECIFIC. Full youtube.com is never blocked.
 */
async function handleDoomScrollTrigger(msg, sender) {
  const tabId = sender?.tab?.id;
  const url = msg.url;
  const metrics = msg.metrics || {};
  const urlType = msg.urlType || 'shorts'; // 'shorts' | 'watch'

  if (!tabId || !url) return { success: false, error: 'Missing tab context' };

  const data = await chrome.storage.local.get(['activeWorkspaceId', 'workspaces']);
  const ws = data.activeWorkspaceId ? (data.workspaces || {})[data.activeWorkspaceId] : null;
  const focusMode = ws?.focusMode || 'easy';

  // Strict mode or very high score → hard block immediately
  if (focusMode === 'strict' || (metrics.doomScore || 0) > 1.0) {
    console.log('[FlowState Doomscroll] Hard block tab', tabId, '| score:', metrics.doomScore);
    const encoded = encodeURIComponent(url);
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`pages/blocked.html?url=${encoded}&tabId=${tabId}&type=doomscroll`) });
    _doomScrollLevels.delete(tabId);
    return { success: true };
  }

  // Easy mode: 4-level escalation ladder
  const entry = _doomScrollLevels.get(tabId) || { level: 0, lastTrigger: 0 };
  const ONE_HOUR = 60 * 60 * 1000;
  if (Date.now() - entry.lastTrigger > ONE_HOUR) entry.level = 0;

  entry.level = Math.min(entry.level + 1, 4);
  entry.lastTrigger = Date.now();
  _doomScrollLevels.set(tabId, entry);

  console.log('[FlowState Doomscroll] Easy escalation level', entry.level, 'tab', tabId, urlType);

  const encoded = encodeURIComponent(url);

  if (entry.level === 1) {
    // Level 1: Subtle toast overlay (injected into the page)
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: _doomscrollOverlay, args: [1] });
    } catch (e) { console.warn('[FlowState Doomscroll] Overlay error:', e.message); }
    return { success: true, softReset: true }; // allow re-trigger after 10s

  } else if (entry.level === 2) {
    // Level 2: 3-second countdown overlay
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: _doomscrollOverlay, args: [2] });
    } catch (e) { console.warn('[FlowState Doomscroll] Overlay error:', e.message); }
    return { success: true, softReset: true };

  } else if (entry.level === 3) {
    // Level 3: Intent confirmation page
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`pages/ai-escalation.html?url=${encoded}&tabId=${tabId}&level=3&type=doomscroll`) });
    return { success: true };

  } else if (entry.level >= 4) {
    // Level 4: Hard redirect to blocked.html
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL(`pages/blocked.html?url=${encoded}&tabId=${tabId}&type=doomscroll`) });
    _doomScrollLevels.delete(tabId);
    return { success: true };
  }

  return { success: true };
}

/**
 * Injected into the YouTube tab via scripting.executeScript.
 * MUST be self-contained — no closures, no external references.
 */
function _doomscrollOverlay(level) {
  if (document.getElementById('fs-doomscroll-overlay')) return;
  const o = document.createElement('div');
  o.id = 'fs-doomscroll-overlay';
  o.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:rgba(10,10,10,0.92);color:#fff;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;padding:14px 24px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.5);display:flex;align-items:center;gap:12px;border:1px solid rgba(255,255,255,0.12);backdrop-filter:blur(8px);pointer-events:auto;user-select:none';
  if (level === 1) {
    o.innerHTML = '<span style="font-size:20px">⚠️</span><span>You\'ve been scrolling Shorts for a while. Take a break?</span><button id="fs-ds-ok" style="background:#6c63ff;border:none;color:#fff;padding:6px 14px;border-radius:8px;cursor:pointer;font-weight:700">Got it</button>';
    document.body.appendChild(o);
    document.getElementById('fs-ds-ok')?.addEventListener('click', () => o.remove());
    setTimeout(() => o.remove(), 8000);
  } else if (level === 2) {
    let n = 3;
    o.innerHTML = '<span style="font-size:20px">⏸️</span><span>Pausing for <strong id="fs-ds-n">3</strong>s — you\'re deep in Shorts.</span>';
    document.body.appendChild(o);
    const el = document.getElementById('fs-ds-n');
    const t = setInterval(() => { n--; if (el) el.textContent = n; if (n <= 0) { clearInterval(t); o.remove(); } }, 1000);
  }
}

/**
 * Classify a Shorts/Watch video title for threshold adjustment.
 * AI role: multiplier tuning ONLY — it never directly blocks.
 *
 *   Educational / Work-related → multiplier 1.25 (more lenient)
 *   Entertainment / Social     → multiplier 0.80 (stricter)
 *   Anything else              → multiplier 1.00 (neutral)
 */
async function handleDoomScrollClassify(title, url, urlType) {
  try {
    const { hfApiKey } = await chrome.storage.local.get('hfApiKey');
    if (!hfApiKey) return { multiplier: 1.0, category: null };

    const host = url ? new URL(url).hostname : 'youtube.com';
    const text = title ? `${host} — ${title}` : host;

    const result = await callBartMNLI(text, [
      'educational content',
      'entertainment',
      'social media',
      'work related',
    ], hfApiKey);

    const category = result.labels[0];
    console.log('[FlowState Doomscroll] AI classify:', category,
      `(${(result.scores[0] * 100).toFixed(1)}%) urlType:`, urlType);

    let multiplier = 1.0;
    if (category === 'educational content' || category === 'work related') multiplier = 1.25;
    else if (category === 'entertainment' || category === 'social media') multiplier = 0.80;

    return { multiplier, category };
  } catch (err) {
    console.warn('[FlowState Doomscroll] Classify error:', err.message);
    return { multiplier: 1.0, category: null }; // neutral fallback
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
