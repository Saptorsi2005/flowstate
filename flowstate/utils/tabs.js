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
 */
export function groupTabsByDomain(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    const domain = getDomain(tab.url);
    if (!domain) continue;

    if (!map.has(domain)) map.set(domain, []);
    map.get(domain).push(tab);
  }
  return map;
}

/**
 * Create a chrome tab group for each domain in the map.
 */
export async function createTabGroups(domainMap) {
  let colorIdx = 0;
  const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

  for (const [domain, tabs] of domainMap) {
    if (tabs.length === 0) continue;
    const tabIds = tabs.map(t => t.id);

    // Look for any existing groups with this name (case-insensitive)
    const matchingGroups = existingGroups.filter(g => 
      g.title && g.title.trim().toLowerCase() === domain.toLowerCase()
    );

    let targetGroupId;

    if (matchingGroups.length > 0) {
      targetGroupId = matchingGroups[0].id;
      await chrome.tabs.group({ tabIds, groupId: targetGroupId });

      // Merge other groups with the same title
      if (matchingGroups.length > 1) {
        for (let i = 1; i < matchingGroups.length; i++) {
          const extraGroup = matchingGroups[i];
          const extraTabs = await chrome.tabs.query({ groupId: extraGroup.id });
          if (extraTabs.length > 0) {
            await chrome.tabs.group({ tabIds: extraTabs.map(t => t.id), groupId: targetGroupId });
          }
        }
      }
    } else {
      targetGroupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(targetGroupId, {
        title: domain,
        color: GROUP_COLORS[colorIdx % GROUP_COLORS.length],
        collapsed: tabs.length > 2
      });
      colorIdx++;
    }
  }
}
