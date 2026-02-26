/**
 * tabs.js — Pure helper functions for tab grouping
 *
 * These are imported by the background service worker.
 * No side effects, no Chrome API calls except in createTabGroups().
 */

// Chrome tab-group API accepts these named colors
const GROUP_COLORS = [
  'blue', 'red', 'yellow', 'green',
  'pink', 'purple', 'cyan', 'orange'
];

/**
 * Extract the hostname from a URL string.
 * Returns null for chrome://, chrome-extension://, about: and invalid URLs
 * so they are silently skipped during grouping.
 */
export function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome:' || u.protocol === 'chrome-extension:' || u.protocol === 'about:') {
      return null;
    }
    return u.hostname;
  } catch {
    return null;   // malformed URL
  }
}

/**
 * Build a Map<domain, Tab[]> from an array of chrome.tabs.Tab objects.
 * Tabs whose URL cannot be parsed (or is a browser-internal page) are skipped.
 *
 * Tabs that are already in a group are also skipped so we don't
 * regroup them unnecessarily on repeated clicks.
 */
export function groupTabsByDomain(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    // Skip tabs that are already grouped
    if (tab.groupId && tab.groupId !== -1) continue;

    const domain = getDomain(tab.url);
    if (!domain) continue;

    if (!map.has(domain)) map.set(domain, []);
    map.get(domain).push(tab);
  }
  return map;
}

/**
 * Create a chrome tab group for each domain in the map.
 *
 * How chrome.tabs.group works:
 *   - Takes an array of tab IDs and moves them into a new (or existing) group.
 *   - Returns a groupId.
 *   - We then call chrome.tabGroups.update() to set a human-readable title
 *     and a color so each domain is visually distinct.
 *   - Groups with > 2 tabs are auto-collapsed to reduce clutter.
 */
export async function createTabGroups(domainMap) {
  let colorIdx = 0;

  for (const [domain, tabs] of domainMap) {
    if (tabs.length === 0) continue;

    const tabIds  = tabs.map(t => t.id);
    const groupId = await chrome.tabs.group({ tabIds });

    await chrome.tabGroups.update(groupId, {
      title:     domain,
      color:     GROUP_COLORS[colorIdx % GROUP_COLORS.length],
      collapsed: tabs.length > 2
    });

    colorIdx++;
  }
}
