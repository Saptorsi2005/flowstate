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
 *   7. Pomodoro timer (25 min work / 5 min break, alarm-based)
 */

import { initSyncListener } from "../utils/sync.js";
import {
  WORK_MS, BREAK_MS, WARN_MS,
  ALARM_WORK_END, ALARM_BREAK_END, ALARM_BREAK_WARN,
  DEFAULT_POMODORO
} from "../utils/pomodoro.js";

const HF_API_URL =
  'https://router.huggingface.co/hf-inference/models/facebook/bart-large-mnli';

// In-memory AI cache (tabId → {topLabel, topScore}) to avoid repeat calls
const _aiCache = new Map();

// Track the previously active tab so "Stay Focused" can return to it
let _previousTabId = null;
let _currentTabId = null;

// -- Focus Score Session Tracker -----------------------------
// In-memory; resets each time a workspace is activated.
// Counters are flushed to chrome.storage on deactivation.
let _focusSession = null;
// { wsId, focusMode, startTime, blockedAttempts, successfulUnlocks, failedUnlocks }

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

// ── Productivity Safe Domains — Permanent Allowlist ───────────────────
// Sites that must NEVER be blocked regardless of workspace rules,
// manual blocked list, AI classifier, or focus mode.
// Subdomain matching is automatic: listing 'github.com' also allows
// docs.github.com, api.github.com, etc.
const PRODUCTIVITY_SAFE_DOMAINS = new Set([

  // ─ AI Assistants ──────────────────────────────────────────
  'chatgpt.com', 'openai.com',
  'claude.ai', 'anthropic.com',
  'gemini.google.com', 'aistudio.google.com', 'ai.google.dev',
  'copilot.microsoft.com',
  'perplexity.ai',
  'mistral.ai', 'huggingface.co',
  'cohere.com', 'poe.com', 'phind.com',
  'you.com', 'groq.com', 'replicate.com',
  'x.ai',                        // Grok / xAI
  'together.ai',                 // Together AI
  'anyscale.com',                // Anyscale endpoints
  'fireworks.ai',                // Fireworks AI

  // ─ Search Engines ───────────────────────────────────────
  'google.com',                  // Google Search (also covers Maps, Translate, etc.)
  'bing.com',
  'duckduckgo.com',
  'brave.com',
  'startpage.com',
  'ecosia.org',
  'kagi.com',                    // Kagi premium search

  // ─ Developer Tools ─────────────────────────────────────
  'github.com', 'gitlab.com', 'bitbucket.org',
  'stackoverflow.com', 'stackexchange.com', 'superuser.com', 'askubuntu.com',
  'developer.mozilla.org',       // MDN
  'devdocs.io',
  'npmjs.com', 'pypi.org', 'pkg.go.dev',
  'hub.docker.com', 'docker.com',
  'codepen.io', 'codesandbox.io', 'stackblitz.com',
  'replit.com', 'jsfiddle.net', 'jsbin.com',
  'leetcode.com', 'hackerrank.com', 'codewars.com', 'codeforces.com',
  'excalidraw.com',
  'regex101.com',
  'jsonformatter.curiousconcept.com',

  // ─ Cloud & DevOps ─────────────────────────────────────
  'vercel.com', 'netlify.com', 'render.com', 'heroku.com',
  'railway.app', 'fly.io',
  'cloudflare.com',
  'aws.amazon.com', 'console.aws.amazon.com',
  'azure.microsoft.com', 'portal.azure.com',
  'console.cloud.google.com', 'cloud.google.com',
  'supabase.com', 'firebase.google.com',
  'planetscale.com', 'neon.tech', 'turso.tech',
  'postman.com', 'insomnia.rest',
  'sentry.io', 'datadog.com', 'grafana.com',

  // ─ Productivity & Project Management ────────────────
  'notion.so', 'notion.com',
  'trello.com',
  'asana.com',
  'linear.app',
  'atlassian.com',               // Jira, Confluence
  'monday.com',
  'clickup.com',
  'airtable.com',
  'todoist.com',
  'things.app',
  'obsidian.md',
  'roamresearch.com',
  'workflowy.com',

  // ─ Communication & Collaboration ──────────────────
  'slack.com',
  'zoom.us',
  'teams.microsoft.com',
  'meet.google.com',
  'discord.com',                 // Used heavily by developer communities
  'loom.com',
  'miro.com',
  'figma.com',

  // ─ Email & Calendar ─────────────────────────────────
  'mail.google.com',
  'calendar.google.com',
  'outlook.live.com', 'outlook.office.com',

  // ─ File Storage & Docs ────────────────────────────
  'drive.google.com', 'docs.google.com',
  'sheets.google.com', 'slides.google.com',
  'dropbox.com',
  'onedrive.live.com',
  'sharepoint.com',

  // ─ Learning & Documentation ────────────────────────
  'coursera.org',
  'edx.org',
  'khanacademy.org',
  'udemy.com',
  'freecodecamp.org',
  'w3schools.com',
  'geeksforgeeks.org',
  'tutorialspoint.com',
  'medium.com',
  'dev.to',
  'hashnode.com',
  'css-tricks.com',
  'smashingmagazine.com',
  'web.dev',
  'roadmap.sh',
]);

/**
 * Returns true if the URL belongs to a productivity/work tool that must
 * never be blocked, even if the user manually adds it to their blocked list.
 *
 * Matching rules (hostname after stripping www.):
 *  1. Exact match: 'github.com' matches 'github.com'
 *  2. Subdomain match: 'github.com' also matches 'docs.github.com'
 */
function isProductivityDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (PRODUCTIVITY_SAFE_DOMAINS.has(hostname)) return true;
    // Subdomain match: docs.github.com ends with .github.com
    for (const safe of PRODUCTIVITY_SAFE_DOMAINS) {
      if (hostname.endsWith('.' + safe)) return true;
    }
    return false;
  } catch { return false; }
}

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

/**
 * Live check: is this tabId inside a Chrome tab group whose title
 * matches one of ws.blockedGroupNames? Works even if the group was
 * created AFTER workspace activation. Returns true if blocked.
 */
async function isTabInBlockedGroup(tabId, ws) {
  if (!ws?.blockedGroupNames?.length) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.groupId || tab.groupId === -1) return false; // tab is not in any group
    const group = await chrome.tabGroups.get(tab.groupId);
    if (!group?.title) return false;
    return ws.blockedGroupNames.some(
      name => name.toLowerCase() === group.title.trim().toLowerCase()
    );
  } catch {
    return false; // tab no longer exists or groups API unavailable
  }
}

/**
 * DEFAULT-DENY GROUP MODEL
 * If ws.allowedGroupNames has entries, ONLY tabs inside those groups are allowed.
 * Ungrouped tabs and tabs in unlisted groups are blocked.
 *
 * Returns:
 *   true  → tab is in an allowed group (or no restriction applies)
 *   false → tab must be blocked
 */
async function isTabAllowedByGroup(tabId, ws) {
  if (!ws?.allowedGroupNames?.length) return true; // empty = no restriction
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.groupId || tab.groupId === -1) return true; // ungrouped tabs are never restricted by allowed-group logic
    const group = await chrome.tabGroups.get(tab.groupId);
    if (!group?.title) return false;
    return ws.allowedGroupNames.some(
      name => name.toLowerCase() === group.title.trim().toLowerCase()
    );
  } catch {
    return true; // fail open — don't block if API unavailable
  }
}

// ── Tab Group Blocking Helpers ────────────────────────────────

/**
 * Returns a flat array of all domains pre-resolved from blocked tab groups.
 * Reads ws.blockedGroupDomains (populated at activation time by resolveGroupDomains).
 * Synchronous and zero-cost — safe to call in hot blocking paths.
 */
function getGroupBlockedDomains(ws) {
  if (!ws?.blockedGroupDomains) return [];
  return Object.values(ws.blockedGroupDomains).flat();
}

/**
 * Resolves ws.blockedGroupNames → actual tab hostnames using chrome.tabGroups.
 * Called once when a workspace activates. Stores result back into storage.
 * Never called from blocking hot path — async is fine here.
 */
async function resolveGroupDomains(ws) {
  if (!ws?.blockedGroupNames?.length) return {};
  const resolved = {};
  try {
    const groups = await chrome.tabGroups.query({});
    for (const groupName of ws.blockedGroupNames) {
      const match = groups.find(
        g => g.title && g.title.trim().toLowerCase() === groupName.toLowerCase()
      );
      if (!match) continue;
      const tabs = await chrome.tabs.query({ groupId: match.id });
      const domains = tabs
        .map(t => { try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return null; } })
        .filter(Boolean);
      if (domains.length) resolved[groupName] = domains;
    }
  } catch (err) {
    console.warn('[FlowState] resolveGroupDomains error:', err.message);
  }
  return resolved;
}

// ── Tab Auto-Grouping ─────────────────────────────────────────────
// When a workspace is active, every tab navigation is auto-placed
// into the matching named Chrome tab group (Dev, Productivity, etc.).
// Mirror of popup.js CATEGORY_MAP — kept in sync here manually.
const TAB_CATEGORY_MAP = {
  'amazon': 'Shopping', 'flipkart': 'Shopping', 'myntra': 'Shopping', 'ajio': 'Shopping',
  'meesho': 'Shopping', 'snapdeal': 'Shopping', 'ebay': 'Shopping', 'walmart': 'Shopping',
  'aliexpress': 'Shopping', 'etsy': 'Shopping', 'nykaa': 'Shopping',
  'youtube': 'Entertainment', 'netflix': 'Entertainment', 'hotstar': 'Entertainment',
  'primevideo': 'Entertainment', 'disneyplus': 'Entertainment', 'disney': 'Entertainment',
  'jiocinema': 'Entertainment', 'twitch': 'Entertainment', 'crunchyroll': 'Entertainment', 'hulu': 'Entertainment',
  'spotify': 'Music', 'music.youtube': 'Music', 'gaana': 'Music', 'jiosaavn': 'Music',
  'soundcloud': 'Music', 'wynk': 'Music',
  'facebook': 'Social', 'instagram': 'Social', 'twitter': 'Social', 'x.com': 'Social',
  'linkedin': 'Social', 'reddit': 'Social', 'quora': 'Social', 'pinterest': 'Social',
  'tumblr': 'Social', 'snapchat': 'Social', 'threads.net': 'Social',
  'whatsapp': 'Messaging', 'telegram': 'Messaging', 'discord': 'Messaging',
  'slack': 'Messaging', 'teams.microsoft': 'Messaging',
  'github': 'Dev', 'gitlab': 'Dev', 'stackoverflow': 'Dev', 'codepen': 'Dev',
  'replit': 'Dev', 'leetcode': 'Dev', 'hackerrank': 'Dev', 'codeforces': 'Dev',
  'geeksforgeeks': 'Dev', 'npmjs': 'Dev',
  'docs.google': 'Productivity', 'sheets.google': 'Productivity', 'slides.google': 'Productivity',
  'drive.google': 'Productivity', 'notion': 'Productivity', 'trello': 'Productivity',
  'asana': 'Productivity', 'figma': 'Productivity', 'canva': 'Productivity', 'miro': 'Productivity',
  'mail.google': 'Email', 'outlook': 'Email', 'protonmail': 'Email',
  'google.com': 'Search', 'bing.com': 'Search', 'duckduckgo': 'Search',
  'chatgpt': 'Search', 'gemini.google': 'Search', 'perplexity': 'Search',
  'bbc': 'News', 'cnn': 'News', 'ndtv': 'News', 'timesofindia': 'News', 'thehindu': 'News',
  'coursera': 'Education', 'udemy': 'Education', 'khanacademy': 'Education',
  'edx': 'Education', 'w3schools': 'Education',
  'paytm': 'Finance', 'phonepe': 'Finance', 'razorpay': 'Finance',
  'zerodha': 'Finance', 'groww': 'Finance',
};

const TAB_CATEGORY_COLORS = {
  'Shopping': 'yellow', 'Entertainment': 'red', 'Music': 'pink', 'Social': 'blue',
  'Messaging': 'purple', 'Dev': 'cyan', 'Productivity': 'green', 'Email': 'orange',
  'Search': 'blue', 'News': 'red', 'Education': 'green', 'Finance': 'yellow',
};

/**
 * Places tabId into the Chrome tab group matching its URL category.
 * Creates the group if one doesn't already exist in this window.
 * Fire-and-forget — all errors are silently swallowed.
 */
async function autoGroupTab(tabId, url, windowId) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    let category = null;
    for (const [keyword, cat] of Object.entries(TAB_CATEGORY_MAP)) {
      if (host.includes(keyword)) { category = cat; break; }
    }
    if (!category) return; // unrecognised site — skip

    const groups = await chrome.tabGroups.query({ windowId });
    const existing = groups.find(
      g => g.title && g.title.trim().toLowerCase() === category.toLowerCase()
    );

    if (existing) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: existing.id });
    } else {
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, {
        title: category,
        color: TAB_CATEGORY_COLORS[category] || 'grey',
        collapsed: false,
      });
    }
  } catch { /* non-fatal */ }
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
    ['activeWorkspaceId', 'workspaces', 'tempUnlockedDomains', 'hfApiKey', 'aiEnabled',
      'aiEscalationLevels', 'aiTempBlocks', 'pomodoro']
  );
  if (!data.activeWorkspaceId) return;

  // ── Pomodoro phase guard ─────────────────────────────────────
  // Only evaluate tabs during the WORK phase. Using phase !== 'work' is
  // more robust than phase === 'break' — it also catches any unexpected
  // intermediate states.
  const pom = data.pomodoro;
  if (pom?.isRunning && pom?.phase !== 'work') {
    console.log('[FlowState] Non-work phase (' + pom.phase + ') — blocking bypassed for:', url);
    return;
  }

  const ws = (data.workspaces || {})[data.activeWorkspaceId];
  if (!ws) return;

  const domain = getDomain(url);
  if (!domain) return;

  // ── Auto-group tab by category (fire-and-forget, always runs) ──
  // Runs before blocking checks. If the tab gets redirected to a block
  // page, that redirect fires onUpdated with chrome-extension:// which
  // is filtered at the top, so grouping a to-be-blocked tab is harmless.
  autoGroupTab(tabId, url, tab.windowId);

  console.log('[FlowState] Checking:', domain, 'against workspace:', ws.name);

  // ── ABSOLUTE PRIORITY: Productivity safe list ──
  // Work tools, AI assistants, dev tools, learning sites etc.
  // Cannot be blocked by any workspace rule, manual list, or AI classifier.
  if (isProductivityDomain(url)) {
    console.log('[FlowState] Productivity site — permanently allowed:', domain);
    return;
  }

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

  // -- 1. Group + domain blocking (nav listener) --
  // A) allowedGroupNames set ? DEFAULT-DENY: only allowed groups pass
  // B) allowedGroupNames empty ? LEGACY: check blockedDomains + blockedGroupNames
  if (ws.allowedGroupNames?.length) {
    const tabAllowed = await isTabAllowedByGroup(tabId, ws);
    if (!tabAllowed) {
      console.log('[FlowState] Blocking (not in allowed group):', domain);
      redirectBlocked(tabId, url, ws.focusMode, 'manual');
      return;
    }
  } else {
    const effectiveBlocked1 = [...(ws.blockedDomains || []), ...getGroupBlockedDomains(ws)];
    const manuallyBlocked = isDomainInList(domain, effectiveBlocked1)
      || await isTabInBlockedGroup(tabId, ws);
    if (manuallyBlocked) {
      console.log('[FlowState] Blocking (manual):', domain);
      redirectBlocked(tabId, url, ws.focusMode, 'manual');
      return;
    }
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

    // ── If tab is already on a block page, count as a blocked attempt ──
    // This covers switching back to a tab that was previously redirected
    // (tabs.onUpdated never fires again for it, so the counter never incremented).
    const BLOCK_PAGES = ['blocked.html', 'soft-redirect.html', 'ai-escalation.html'];
    if (url.startsWith('chrome-extension://') && BLOCK_PAGES.some(p => url.includes(p))) {
      if (_focusSession) {
        _focusSession.blockedAttempts++;
        console.log('[FlowState] blockedAttempts++ (switched to existing block page). Total:', _focusSession.blockedAttempts);
      }
      return;
    }

    // Skip all other extension & browser pages
    if (url.startsWith('chrome-extension://') ||
      url.startsWith('chrome://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')) {
      console.log('[FlowState onActivated] Skipping system page');
      return;
    }

    const data = await chrome.storage.local.get(
      ['activeWorkspaceId', 'workspaces', 'tempUnlockedDomains', 'hfApiKey', 'aiEnabled',
        'aiEscalationLevels', 'aiTempBlocks', 'pomodoro']
    );
    if (!data.activeWorkspaceId) {
      console.log('[FlowState onActivated] No active workspace');
      return;
    }

    // ── Pomodoro break guard ──────────────────────────────────
    const pom = data.pomodoro;
    if (pom?.isRunning && pom?.phase !== 'work') {
      console.log('[FlowState onActivated] Non-work phase — blocking bypassed for:', url);
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

    // ── ABSOLUTE PRIORITY: Productivity safe list ──
    if (isProductivityDomain(url)) {
      console.log('[FlowState] Productivity site (activated tab) — permanently allowed:', domain);
      return;
    }

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

    // -- 1. Group + domain blocking (activation listener) --
    // A) allowedGroupNames set ? DEFAULT-DENY: only allowed groups pass
    // B) allowedGroupNames empty ? LEGACY: check blockedDomains + blockedGroupNames
    if (ws.allowedGroupNames?.length) {
      const tabAllowed = await isTabAllowedByGroup(activeInfo.tabId, ws);
      if (!tabAllowed) {
        console.log('[FlowState] Blocking activated tab (not in allowed group):', domain);
        redirectBlocked(activeInfo.tabId, url, ws.focusMode, 'manual');
        return;
      }
    } else {
      const effectiveBlocked2 = [...(ws.blockedDomains || []), ...getGroupBlockedDomains(ws)];
      const manuallyBlocked = isDomainInList(domain, effectiveBlocked2)
        || await isTabInBlockedGroup(activeInfo.tabId, ws);
      if (manuallyBlocked) {
        console.log('[FlowState] Blocking activated tab (manual):', domain);
        redirectBlocked(activeInfo.tabId, url, ws.focusMode, 'manual');
        return;
      }
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
  // -- Focus Score: count blocked attempt --
  if (_focusSession) { _focusSession.blockedAttempts++; chrome.storage.local.set({ activeFocusSession: _focusSession }); }
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
    // ── Pomodoro messages ──
    case 'pomodoro-start': return handlePomodoroStart(msg.mode);
    case 'pomodoro-pause': return handlePomodoroPause();
    case 'pomodoro-resume': return handlePomodoroResume();
    case 'pomodoro-reset': return handlePomodoroReset();
    case 'get-pomodoro-state': return handleGetPomodoroState();
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

    // -- Focus session: initialize tracking for this session --
    const sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    _focusSession = {
      sessionId,
      wsId: id,
      focusMode: ws.focusMode || 'easy',
      startTime: Date.now(),
      blockedAttempts: 0,
      successfulUnlocks: 0,
      failedUnlocks: 0,
    };
    // Persist to storage so score survives SW restart (MV3 ephemeral SW fix)
    await chrome.storage.local.set({ activeFocusSession: _focusSession });

    await chrome.storage.local.set({
      activeWorkspaceId: id,
      timer: { startTime: Date.now(), elapsed: 0, running: true },
      tempUnlockedDomains: [],
      unlockCountdowns: {},
      aiEscalationLevels: {}, // Fresh start with escalation levels
      aiTempBlocks: {} // Clear any previous temp blocks
    });

    // ── Auto-start Pomodoro in WORK phase ──
    await startWorkPhase(ws.focusMode || 'easy');

    // Don't check or block tabs immediately on activation - let tabs.onUpdated handle it naturally
    // This prevents infinite loops and double-blocking

    // ── Resolve tab group domains at activation time ──────────────
    // Reads chrome.tabGroups, matches blocked group names, extracts hostnames.
    // Stored back into the workspace so blocking checks read it synchronously.
    if (ws.blockedGroupNames?.length) {
      try {
        const resolvedGroupDomains = await resolveGroupDomains(ws);
        ws.blockedGroupDomains = resolvedGroupDomains;
        const updatedWorkspaces = (await chrome.storage.local.get('workspaces')).workspaces || {};
        updatedWorkspaces[id] = ws;
        await chrome.storage.local.set({ workspaces: updatedWorkspaces });
        console.log('[FlowState] Group domains resolved:', resolvedGroupDomains);
      } catch (err) {
        console.warn('[FlowState] Group domain resolution failed:', err.message);
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

    // -- Focus Score Calculation ----------------------------------
    // Recover session from storage if SW was restarted (MV3 ephemeral SW fix)
    if (!_focusSession) {
      const stored = await chrome.storage.local.get('activeFocusSession');
      if (stored.activeFocusSession) _focusSession = stored.activeFocusSession;
    }

    if (_focusSession) {
      const totalMinutes = Math.round(elapsed / 60000);
      const isStrict = _focusSession.focusMode === 'strict';
      const strictModeMinutes = isStrict ? totalMinutes : 0;
      const deepFocusMinutes = Math.max(0, totalMinutes - _focusSession.blockedAttempts);

      const rawScore = (deepFocusMinutes * 2)
        - (_focusSession.blockedAttempts * 1.5)
        - (_focusSession.failedUnlocks * 2)
        + (strictModeMinutes * 1);
      const focusScore = Math.max(0, Math.min(100, Math.round(rawScore)));

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const { sessionId } = _focusSession;

      const { dailyFocusStats = {} } = await chrome.storage.local.get('dailyFocusStats');
      // Store by sessionId so each session is its own entry in the DB
      dailyFocusStats[sessionId] = {
        id: sessionId,
        workspace_id: _focusSession.wsId,
        date: today,
        deepFocusMinutes,
        blockedAttempts: _focusSession.blockedAttempts,
        successfulUnlocks: _focusSession.successfulUnlocks,
        failedUnlocks: _focusSession.failedUnlocks,
        strictModeMinutes,
        focusScore,
      };
      await chrome.storage.local.set({ dailyFocusStats });
      console.log('[FlowState] Focus score saved:', focusScore, 'for ws', _focusSession.wsId, 'on', today);
      _focusSession = null;
      await chrome.storage.local.remove('activeFocusSession'); // clean up persisted session
    }

    await chrome.storage.local.set({
      activeWorkspaceId: null,
      timer: { startTime: null, elapsed, running: false },
      tempUnlockedDomains: [],
      unlockCountdowns: {},
      aiEscalationLevels: {},
      aiTempBlocks: {}
    });
    // ── Reset Pomodoro on deactivation ──
    await resetPomodoro();
    // ── Release any currently blocked tabs ──
    await releaseBlockedTabs();
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

    if (_focusSession) { _focusSession.successfulUnlocks++; chrome.storage.local.set({ activeFocusSession: _focusSession }); }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

initSyncListener();

// ═══════════════════════════════════════════════════════════════════════════
// POMODORO TIMER ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the WORK phase.
 * Clears any existing Pomodoro alarms, persists state, and schedules the
 * work-end alarm. Called on workspace activation and automatically after
 * each break ends.
 *
 * @param {string} mode  'easy' | 'strict'
 * @param {number} [sessionCount]  carry-over session count (default: existing + 0)
 */
async function startWorkPhase(mode, sessionCount) {
  await clearPomodoroAlarms();

  const existing = await getPomodoroState();
  const count = sessionCount ?? existing.sessionCount ?? 0;
  const endTime = Date.now() + WORK_MS;

  await chrome.storage.local.set({
    pomodoro: {
      ...DEFAULT_POMODORO,
      isRunning: true,
      isPaused: false,
      phase: 'work',
      endTime,
      pausedRemaining: 0,
      selectedMode: mode,
      sessionCount: count,
    }
  });

  chrome.alarms.create(ALARM_WORK_END, { delayInMinutes: WORK_MS / 60000 });
  console.log('[FlowState Pomodoro] WORK phase started. Mode:', mode, 'Session:', count, 'Ends:', new Date(endTime).toISOString());
}

/**
 * Start the BREAK phase.
 * Schedules two alarms: break-end and break-warn (1 min before end).
 * Called automatically when the work alarm fires.
 *
 * @param {string} mode  carry-over mode from the work phase
 * @param {number} sessionCount  number of completed work sessions
 */
async function startBreakPhase(mode, sessionCount) {
  await clearPomodoroAlarms();

  const endTime = Date.now() + BREAK_MS;
  const warnTime = endTime - WARN_MS;

  await chrome.storage.local.set({
    pomodoro: {
      ...DEFAULT_POMODORO,
      isRunning: true,
      isPaused: false,
      phase: 'break',
      endTime,
      pausedRemaining: 0,
      selectedMode: mode,
      sessionCount,
    }
  });

  chrome.alarms.create(ALARM_BREAK_END, { delayInMinutes: BREAK_MS / 60000 });

  // Only schedule warning if there's enough time left
  if (warnTime > Date.now()) {
    chrome.alarms.create(ALARM_BREAK_WARN, { delayInMinutes: (warnTime - Date.now()) / 60000 });
  }

  console.log('[FlowState Pomodoro] BREAK phase started. Session:', sessionCount, 'Ends:', new Date(endTime).toISOString());

  // Release any tabs currently sitting on the blocked / soft-redirect pages.
  // This navigates them back to the original URL immediately so the user
  // doesn't have to manually refresh or navigate away.
  releaseBlockedTabs();

  // Show break-start notification
  chrome.notifications.create('fs-break-start', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'FlowState — Break Time! 🎉',
    message: 'Great work! You have 5 minutes. All blocking is paused.',
  });
}

/**
 * Pause the currently running Pomodoro.
 * Records pausedRemaining and clears the scheduled alarm.
 */
async function pausePomodoro() {
  const pom = await getPomodoroState();

  // ── Break is non-pausable ───────────────────────────────────────
  // Break must run its full duration to ensure genuine rest.
  // Reject the request without touching alarms or state.
  if (pom.phase === 'break') {
    console.log('[FlowState Pomodoro] pausePomodoro() rejected — break phase cannot be paused.');
    return { success: false, reason: 'Break phase cannot be paused' };
  }

  if (!pom.isRunning || pom.isPaused) return { success: false, reason: 'Not running or already paused' };

  const remaining = Math.max(0, pom.endTime - Date.now());
  await clearPomodoroAlarms();

  await chrome.storage.local.set({
    pomodoro: { ...pom, isRunning: false, isPaused: true, pausedRemaining: remaining }
  });

  console.log('[FlowState Pomodoro] PAUSED. Remaining:', remaining, 'ms');
  return { success: true, remaining };
}

/**
 * Resume a paused Pomodoro.
 * Recalculates endTime from pausedRemaining and re-creates alarms.
 */
async function resumePomodoro() {
  const pom = await getPomodoroState();
  if (!pom.isPaused) return { success: false, reason: 'Not paused' };

  const remaining = pom.pausedRemaining || (pom.phase === 'work' ? WORK_MS : BREAK_MS);
  const endTime = Date.now() + remaining;
  const alarmName = pom.phase === 'work' ? ALARM_WORK_END : ALARM_BREAK_END;

  await chrome.storage.local.set({
    pomodoro: { ...pom, isRunning: true, isPaused: false, endTime, pausedRemaining: 0 }
  });

  chrome.alarms.create(alarmName, { delayInMinutes: remaining / 60000 });

  // Re-schedule break warning if we're in break phase
  if (pom.phase === 'break') {
    const warnAt = endTime - WARN_MS;
    if (warnAt > Date.now()) {
      chrome.alarms.create(ALARM_BREAK_WARN, { delayInMinutes: (warnAt - Date.now()) / 60000 });
    }
  }

  console.log('[FlowState Pomodoro] RESUMED. Remaining:', remaining, 'ms');
  return { success: true };
}

/**
 * Reset Pomodoro to idle state and clear all alarms.
 * Blocking resumes immediately because phase is no longer 'break'.
 */
async function resetPomodoro() {
  await clearPomodoroAlarms();
  await chrome.storage.local.set({ pomodoro: { ...DEFAULT_POMODORO } });
  console.log('[FlowState Pomodoro] RESET to idle.');
  return { success: true };
}

/**
 * Handle phase transitions triggered by alarms.
 *
 * Race-condition safety:
 *   - We write the new phase to storage FIRST (inside startWorkPhase /
 *     startBreakPhase), then call reactivateBlocking().
 *   - reactivateBlocking() does a fresh storage read to confirm the phase
 *     is still 'work' before applying any redirects. This prevents a
 *     stale-closure read in case the user manually reset during the tiny
 *     window between the alarm firing and reactivateBlocking executing.
 *
 * @param {'work-end'|'break-end'} event
 */
async function handlePhaseTransition(event) {
  const pom = await getPomodoroState();

  if (event === 'work-end') {
    console.log('[FlowState Pomodoro] Work phase ended → starting break.');
    await startBreakPhase(pom.selectedMode || 'easy', (pom.sessionCount || 0) + 1);
    // Blocking is now OFF — no tab evaluation needed.

  } else if (event === 'break-end') {
    console.log('[FlowState Pomodoro] Break phase ended → resuming work.');
    // 1. Write new WORK state to storage (phase becomes 'work').
    await startWorkPhase(pom.selectedMode || 'easy', pom.sessionCount || 0);
    // 2. Immediately evaluate all active tabs — do not wait for next navigation.
    await reactivateBlocking();
  }
}

/** Fire the 1-minute break-ending warning notification. */
function fireBreakWarningNotification() {
  chrome.notifications.create('fs-break-warn', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'FlowState — Break ending soon ⚠️',
    message: 'Break ending in 1 minute. Focus mode resuming.',
  });
  console.log('[FlowState Pomodoro] Break warning notification fired.');
}

/**
 * releaseBlockedTabs()
 *
 * Finds every tab currently showing the extension's blocked.html or
 * soft-redirect.html page and navigates it directly back to the
 * original blocked URL, making it accessible immediately when break starts.
 *
 * The blocked pages embed the original URL as a `url=` query param:
 *   chrome-extension://<id>/pages/blocked.html?url=https%3A%2F%2Freddit.com...
 *   chrome-extension://<id>/pages/soft-redirect.html?url=https%3A%2F%2Freddit.com...
 *
 * We extract that param and call chrome.tabs.update() to navigate.
 * This is fire-and-forget — errors are swallowed per-tab so one bad tab
 * can’t prevent the others from being released.
 */
async function releaseBlockedTabs() {
  const extOrigin = chrome.runtime.getURL('');
  // Match both blocked.html and soft-redirect.html pages
  const blockedPagePattern = extOrigin + 'pages/';

  let allTabs;
  try {
    // Query all tabs across all windows
    allTabs = await chrome.tabs.query({});
  } catch (err) {
    console.warn('[FlowState] releaseBlockedTabs(): tabs.query failed', err);
    return;
  }

  let released = 0;
  for (const tab of allTabs) {
    if (!tab.url || !tab.url.startsWith(blockedPagePattern)) continue;

    try {
      const tabUrl = new URL(tab.url);
      const originalUrl = tabUrl.searchParams.get('url');
      if (!originalUrl) continue;

      // Navigate directly to the original site — break guard in
      // tabs.onUpdated will see phase='break' and not re-block it.
      await chrome.tabs.update(tab.id, { url: originalUrl });
      released++;
      console.log('[FlowState] releaseBlockedTabs(): released tab', tab.id, '→', originalUrl);
    } catch (err) {
      console.warn('[FlowState] releaseBlockedTabs(): failed to release tab', tab.id, err);
    }
  }

  if (released > 0) {
    console.log('[FlowState] releaseBlockedTabs(): released', released, 'tab(s) for break.');
  }
}

/**
 * reactivateBlocking() — called immediately when the break alarm fires.
 *
 * Queries all active tabs across all browser windows and re-runs the
 * blocking evaluation logic for each. This ensures that if the user is
 * sitting on a blocked domain when break ends, they are redirected
 * immediately without needing to navigate or switch tabs.
 *
 * Race-condition prevention:
 *   - Reads phase from storage AFTER startWorkPhase has committed it.
 *   - Aborts early if phase is not 'work' (handles edge case where user
 *     manually reset the session between the alarm fire and this call).
 *   - Skips tabs with no activeWorkspaceId (workspace deactivated during break).
 */
async function reactivateBlocking() {
  console.log('[FlowState Pomodoro] reactivateBlocking() — evaluating open tabs...');

  // ── Post-write guard: re-read storage to confirm phase is still 'work' ──
  // This handles the race where the user clicks Reset between
  // startWorkPhase() writing and us reaching this point.
  const data = await chrome.storage.local.get(
    ['pomodoro', 'activeWorkspaceId', 'workspaces', 'tempUnlockedDomains',
      'hfApiKey', 'aiEnabled', 'aiEscalationLevels', 'aiTempBlocks']
  );

  const pom = data.pomodoro;

  // Guard 1: Session was manually stopped or reset during break — do nothing.
  if (!pom?.isRunning || pom?.phase !== 'work') {
    console.log('[FlowState Pomodoro] reactivateBlocking() aborted: phase is', pom?.phase, 'isRunning:', pom?.isRunning);
    return;
  }

  // Guard 2: No workspace is active.
  if (!data.activeWorkspaceId) {
    console.log('[FlowState Pomodoro] reactivateBlocking() aborted: no active workspace.');
    return;
  }

  const ws = (data.workspaces || {})[data.activeWorkspaceId];
  if (!ws) return;

  // Query every window's currently active tab.
  // Using allWindows:true so we catch detached windows and secondary monitors.
  let activeTabs;
  try {
    activeTabs = await chrome.tabs.query({ active: true });
  } catch (err) {
    console.warn('[FlowState Pomodoro] reactivateBlocking(): tabs.query failed', err);
    return;
  }

  for (const tab of activeTabs) {
    const url = tab.url;
    if (!url) continue;

    // Skip extension and browser internal pages.
    if (url.startsWith('chrome-extension://') ||
      url.startsWith('chrome://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')) continue;

    const domain = getDomain(url);
    if (!domain) continue;

    console.log('[FlowState Pomodoro] reactivateBlocking(): evaluating tab', tab.id, domain);

    // Skip temp-unlocked tabs (user had an intent-unlock during work phase).
    const unlocked = data.tempUnlockedDomains || [];
    if (unlocked.some(u => u.tabId === tab.id && domain.includes(u.domain))) {
      console.log('[FlowState Pomodoro] reactivateBlocking(): tab is temp-unlocked, skipping.');
      continue;
    }

    // Allowed domains are never blocked.
    if (isDomainInList(domain, ws.allowedDomains)) continue;

    // ── Check manual blocklist ──
    if (isDomainInList(domain, ws.blockedDomains)) {
      console.log('[FlowState Pomodoro] reactivateBlocking(): redirecting blocked tab:', domain);
      redirectBlocked(tab.id, url, ws.focusMode, 'manual');
      continue;
    }

    // ── Check AI temp-blocks ──
    if (data.aiEnabled && data.hfApiKey) {
      const aiTempBlocks = data.aiTempBlocks || {};
      if (aiTempBlocks[domain] && aiTempBlocks[domain].blockedUntil > Date.now()) {
        console.log('[FlowState Pomodoro] reactivateBlocking(): redirecting AI-blocked tab:', domain);
        redirectBlocked(tab.id, url, 'strict', 'ai-temp-block');
        continue;
      }
      // For full AI classification on reactivation, run async (non-blocking).
      // The tab will be re-classified on next navigation if this misses.
      classifyAndMaybeBlock(tab.id, url, domain, ws, data.hfApiKey, data);
    }
  }

  console.log('[FlowState Pomodoro] reactivateBlocking() complete. Evaluated', activeTabs.length, 'tab(s).');
}

/** Read current pomodoro state from storage (with defaults). */
async function getPomodoroState() {
  const { pomodoro } = await chrome.storage.local.get('pomodoro');
  return { ...DEFAULT_POMODORO, ...(pomodoro || {}) };
}

/** Clear all three Pomodoro alarms. */
async function clearPomodoroAlarms() {
  await Promise.all([
    chrome.alarms.clear(ALARM_WORK_END),
    chrome.alarms.clear(ALARM_BREAK_END),
    chrome.alarms.clear(ALARM_BREAK_WARN),
  ]);
}

// ── Pomodoro message handlers ──────────────────────────────────
async function handlePomodoroStart(mode) {
  try {
    await startWorkPhase(mode || 'easy');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handlePomodoroPause() {
  try { return await pausePomodoro(); }
  catch (err) { return { success: false, error: err.message }; }
}

async function handlePomodoroResume() {
  try { return await resumePomodoro(); }
  catch (err) { return { success: false, error: err.message }; }
}

async function handlePomodoroReset() {
  try { return await resetPomodoro(); }
  catch (err) { return { success: false, error: err.message }; }
}

async function handleGetPomodoroState() {
  try {
    const pom = await getPomodoroState();
    return { success: true, pomodoro: pom };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

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
  // ── Pomodoro alarm handlers ──
  if (alarm.name === ALARM_WORK_END) { await handlePhaseTransition('work-end'); return; }
  if (alarm.name === ALARM_BREAK_END) { await handlePhaseTransition('break-end'); return; }
  if (alarm.name === ALARM_BREAK_WARN) { fireBreakWarningNotification(); return; }

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

// ── Startup sync: fire a sync shortly after SW wakes ─────────────────────────
// Catches already-logged-in users whose workspaces predate login,
// or who reloaded the extension — no workspace change needed to trigger.
chrome.storage.local.get('syncJwt').then(({ syncJwt }) => {
  if (syncJwt) {
    console.log('[FlowState Sync] SW startup: scheduling immediate sync for logged-in user');
    chrome.alarms.create('flowstate-sync', { delayInMinutes: 0.1 }); // ~6 seconds
  }
});

// ── Pomodoro SW startup restoration ──────────────────────────────────────────
// When the service worker restarts (e.g. after suspension, browser restart, or
// extension reload), we must restore any in-progress Pomodoro session.
// If the phase already expired while the SW was asleep, we transition immediately.
// If there's time left, we re-create the alarm with the correct remaining duration.
chrome.storage.local.get('pomodoro').then(({ pomodoro: pom }) => {
  if (!pom || (!pom.isRunning && !pom.isPaused)) return;

  console.log('[FlowState Pomodoro] SW startup: found persisted state:', pom);

  if (pom.isPaused) {
    // Paused — no alarm needed; user must resume manually. State is already correct.
    console.log('[FlowState Pomodoro] SW startup: session is paused, waiting for user resume.');
    return;
  }

  if (!pom.isRunning) return;

  const remaining = pom.endTime - Date.now();

  if (remaining <= 0) {
    // Phase already expired while SW was sleeping → transition immediately
    console.log('[FlowState Pomodoro] SW startup: phase expired while sleeping, transitioning now.');
    const event = pom.phase === 'work' ? 'work-end' : 'break-end';
    handlePhaseTransition(event);
    return;
  }

  // Phase still in progress — re-create the alarm with the remaining duration
  const alarmName = pom.phase === 'work' ? ALARM_WORK_END : ALARM_BREAK_END;
  chrome.alarms.create(alarmName, { delayInMinutes: remaining / 60000 });
  console.log('[FlowState Pomodoro] SW startup: re-created alarm', alarmName, 'remaining:', Math.round(remaining / 1000), 's');

  // Also re-create the break warning alarm if in break phase
  if (pom.phase === 'break') {
    const warnAt = pom.endTime - WARN_MS;
    if (warnAt > Date.now()) {
      chrome.alarms.create(ALARM_BREAK_WARN, { delayInMinutes: (warnAt - Date.now()) / 60000 });
      console.log('[FlowState Pomodoro] SW startup: re-created break-warn alarm.');
    }
  }
});
