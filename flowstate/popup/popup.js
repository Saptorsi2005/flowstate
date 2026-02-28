/**
 * popup.js — FlowState Popup
 *
 * Section 1: Tab Organizer by Category (existing, fully preserved)
 * Section 2: Workspace, Todo, Timer, Focus Mode (new features)
 * Section 3: AI Settings (facebook/bart-large-mnli via HF Inference API)
 * Section 4: Connect Account (Auth0 Device Code Flow — additive only)
 */
import {
  getState, setState, getWorkspaces, getWorkspace, saveWorkspace,
  deleteWorkspace, createWorkspace, setActiveWorkspaceId,
  saveApiKey, getApiKey, setAiEnabled
} from '../storage/store.js';
import { startDeviceFlow, pollDeviceFlow, getStoredJwt, getStoredUser, logout } from '../utils/auth.js';
import { formatTime } from '../utils/timer.js';

// ═══════════════════════════════════════════════════════════════
// SECTION 1: TAB ORGANIZER BY CATEGORY (DO NOT MODIFY)
// ═══════════════════════════════════════════════════════════════

// ── Category Map ───────────────────────────────────────────────
// Maps domain keywords to a category name.
// A domain matches if it *contains* the keyword (e.g. "amazon" matches amazon.com, amazon.in).
// Add more as needed — takes 5 seconds to extend.
const CATEGORY_MAP = {
  // Shopping
  'amazon': 'Shopping',
  'flipkart': 'Shopping',
  'myntra': 'Shopping',
  'ajio': 'Shopping',
  'meesho': 'Shopping',
  'snapdeal': 'Shopping',
  'ebay': 'Shopping',
  'walmart': 'Shopping',
  'aliexpress': 'Shopping',
  'etsy': 'Shopping',
  'shopify': 'Shopping',
  'nykaa': 'Shopping',

  // Entertainment
  'youtube': 'Entertainment',
  'netflix': 'Entertainment',
  'hotstar': 'Entertainment',
  'primevideo': 'Entertainment',
  'disneyplus': 'Entertainment',
  'disney': 'Entertainment',
  'jiocinema': 'Entertainment',
  'sonyliv': 'Entertainment',
  'zee5': 'Entertainment',
  'voot': 'Entertainment',
  'twitch': 'Entertainment',
  'crunchyroll': 'Entertainment',
  'hulu': 'Entertainment',

  // Music
  'spotify': 'Music',
  'music.youtube': 'Music',
  'gaana': 'Music',
  'jiosaavn': 'Music',
  'soundcloud': 'Music',
  'wynk': 'Music',
  'apple.com/music': 'Music',

  // Social Media
  'facebook': 'Social',
  'instagram': 'Social',
  'twitter': 'Social',
  'x.com': 'Social',
  'linkedin': 'Social',
  'reddit': 'Social',
  'quora': 'Social',
  'pinterest': 'Social',
  'tumblr': 'Social',
  'snapchat': 'Social',
  'threads.net': 'Social',

  // Messaging
  'whatsapp': 'Messaging',
  'telegram': 'Messaging',
  'discord': 'Messaging',
  'slack': 'Messaging',
  'teams.microsoft': 'Messaging',

  // Dev & Code
  'github': 'Dev',
  'gitlab': 'Dev',
  'stackoverflow': 'Dev',
  'codepen': 'Dev',
  'replit': 'Dev',
  'leetcode': 'Dev',
  'hackerrank': 'Dev',
  'codeforces': 'Dev',
  'geeksforgeeks': 'Dev',
  'npmjs': 'Dev',

  // Productivity / Work
  'docs.google': 'Productivity',
  'sheets.google': 'Productivity',
  'slides.google': 'Productivity',
  'drive.google': 'Productivity',
  'notion': 'Productivity',
  'trello': 'Productivity',
  'asana': 'Productivity',
  'figma': 'Productivity',
  'canva': 'Productivity',
  'miro': 'Productivity',

  // Email
  'mail.google': 'Email',
  'outlook': 'Email',
  'protonmail': 'Email',
  'yahoo.com/mail': 'Email',

  // Search / AI
  'google.com': 'Search',
  'bing.com': 'Search',
  'duckduckgo': 'Search',
  'chatgpt': 'Search',
  'bard.google': 'Search',
  'gemini.google': 'Search',
  'perplexity': 'Search',

  // News
  'news.google': 'News',
  'bbc': 'News',
  'cnn': 'News',
  'ndtv': 'News',
  'timesofindia': 'News',
  'thehindu': 'News',
  'indianexpress': 'News',
  'hindustantimes': 'News',

  // Education
  'coursera': 'Education',
  'udemy': 'Education',
  'khanacademy': 'Education',
  'edx': 'Education',
  'unacademy': 'Education',
  'byjus': 'Education',
  'w3schools': 'Education',

  // Finance / Payments
  'paytm': 'Finance',
  'phonepe': 'Finance',
  'gpay': 'Finance',
  'razorpay': 'Finance',
  'zerodha': 'Finance',
  'groww': 'Finance',
  'moneycontrol': 'Finance',

  // Travel
  'makemytrip': 'Travel',
  'goibibo': 'Travel',
  'irctc': 'Travel',
  'booking.com': 'Travel',
  'airbnb': 'Travel',
  'tripadvisor': 'Travel',
  'skyscanner': 'Travel',

  // Food
  'zomato': 'Food',
  'swiggy': 'Food',
  'ubereats': 'Food',
  'dominos': 'Food',
};

// Assign a fixed color per category so they're always consistent
const CATEGORY_COLORS = {
  'Shopping': 'yellow',
  'Entertainment': 'red',
  'Music': 'pink',
  'Social': 'blue',
  'Messaging': 'purple',
  'Dev': 'cyan',
  'Productivity': 'green',
  'Email': 'orange',
  'Search': 'blue',
  'News': 'red',
  'Education': 'green',
  'Finance': 'yellow',
  'Travel': 'cyan',
  'Food': 'orange',
  'Other': 'grey',
};

const FALLBACK_COLORS = [
  'blue', 'red', 'yellow', 'green',
  'pink', 'purple', 'cyan', 'orange'
];

const btn = document.getElementById('btn-organize');
const status = document.getElementById('status');

// ── Main click handler ─────────────────────────────────────────
btn.addEventListener('click', async () => {
  btn.disabled = true;
  btn.textContent = 'Organizing…';
  status.classList.add('hidden');

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const categoryMap = groupTabsByCategory(tabs);
    await createTabGroups(categoryMap);
    showStatus(`✓ Grouped into ${categoryMap.size} categor${categoryMap.size === 1 ? 'y' : 'ies'}`, 'ok');
  } catch (err) {
    showStatus('✗ ' + err.message, 'err');
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Organize Tabs';
  }, 1200);
});

// ── Helpers ────────────────────────────────────────────────────

/** Extract hostname from URL. Returns null for browser-internal pages. */
function getDomain(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'chrome:' || u.protocol === 'chrome-extension:' || u.protocol === 'about:') {
      return null;
    }
    return u.hostname;
  } catch {
    return null;
  }
}

/**
 * Look up the category for a hostname.
 * Checks if the full URL (host + path start) or hostname contains any keyword.
 * Returns the category string, or 'Other' if no match.
 */
function getCategory(url) {
  const domain = getDomain(url);
  if (!domain) return null;

  // Build a matchable string: "mail.google.com" or "docs.google.com"
  const host = domain.toLowerCase();

  // Check each keyword — longest/most-specific matches are tried via includes
  for (const [keyword, category] of Object.entries(CATEGORY_MAP)) {
    if (host.includes(keyword)) return category;
  }
  return 'Other';
}

/** Build Map<category, Tab[]>. Skips internal pages. */
function groupTabsByCategory(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    const category = getCategory(tab.url);
    if (!category) continue;
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(tab);
  }
  return map;
}

/** Create a colored, titled tab group for each category. */
async function createTabGroups(categoryMap) {
  let fallbackIdx = 0;

  // Get all groups in the current window to check for existing categories
  const existingGroups = await chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });

  for (const [category, tabs] of categoryMap) {
    if (tabs.length === 0) continue;
    const tabIds = tabs.map(t => t.id);

    // Look for any existing groups with this name (case-insensitive)
    const matchingGroups = existingGroups.filter(g =>
      g.title && g.title.trim().toLowerCase() === category.toLowerCase()
    );

    let targetGroupId;

    if (matchingGroups.length > 0) {
      // Use the first existing group as the primary one
      targetGroupId = matchingGroups[0].id;

      // Move the new tabs into this existing group
      await chrome.tabs.group({ tabIds, groupId: targetGroupId });

      // If more than one group exists with the same name, merge them all into the first one
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
      // No existing group found, create a new one
      targetGroupId = await chrome.tabs.group({ tabIds });
      const color = CATEGORY_COLORS[category] || FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];

      await chrome.tabGroups.update(targetGroupId, {
        title: category,
        color: color,
        collapsed: tabs.length > 3
      });
    }
  }
}

/** Show status text below the button. */
function showStatus(text, type) {
  status.textContent = text;
  status.className = 'status status--' + type;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: WORKSPACE, TODO, TIMER, FOCUS MODE
// ═══════════════════════════════════════════════════════════════

let selectedWsId = null;
let timerInterval = null;

// ── DOM Refs (new UI elements) ─────────────────────────────────
const $timerDisplay = document.getElementById('timer-display');
const $activeBanner = document.getElementById('active-banner');
const $activeWsName = document.getElementById('active-ws-name');
const $btnDeactivate = document.getElementById('btn-deactivate');
const $wsList = document.getElementById('workspace-list');
const $btnCreateWs = document.getElementById('btn-create-workspace');
const $wsDetail = document.getElementById('workspace-detail');
const $wsDetailName = document.getElementById('ws-detail-name');
const $btnSaveTabs = document.getElementById('btn-save-tabs');
const $btnDeleteWs = document.getElementById('btn-delete-ws');
const $btnModeEasy = document.getElementById('btn-mode-easy');
const $btnModeStrict = document.getElementById('btn-mode-strict');
const $blockedList = document.getElementById('blocked-list');
const $blockedInput = document.getElementById('blocked-input');
const $btnAddBlocked = document.getElementById('btn-add-blocked');
const $allowedList = document.getElementById('allowed-list');
const $allowedInput = document.getElementById('allowed-input');
const $btnAddAllowed = document.getElementById('btn-add-allowed');
const $savedTabsCount = document.getElementById('saved-tabs-count');
const $todoList = document.getElementById('todo-list');
const $todoInput = document.getElementById('todo-input');
const $btnAddTodo = document.getElementById('btn-add-todo');
const $todoProgressFill = document.getElementById('todo-progress-fill');
const $todoProgressText = document.getElementById('todo-progress-text');
const $btnActivate = document.getElementById('btn-activate');

// ── Init (modules are deferred, so DOM is already ready) ───────
(async () => {
  try {
    await renderWorkspaces();
    await populateGroupSelect();
    await renderHeatmap();
    await syncActiveState();
    startTimerPolling();
  } catch (e) { console.error('FlowState init error:', e); }
  bindNewEvents();
})();
// ── Workspace List ─────────────────────────────────────────────
async function renderWorkspaces() {
  const wss = await getWorkspaces();
  $wsList.innerHTML = '';

  const entries = Object.values(wss).sort((a, b) => b.createdAt - a.createdAt);

  if (entries.length === 0) {
    $wsList.innerHTML = '<p class="empty-msg">No workspaces yet</p>';
    return;
  }

  const { activeWorkspaceId } = await getState();

  for (const ws of entries) {
    const card = document.createElement('div');
    const isActive = ws.id === activeWorkspaceId;
    const isSelected = ws.id === selectedWsId;
    card.className = 'ws-card'
      + (isSelected ? ' ws-card--selected' : '')
      + (isActive ? ' ws-card--active' : '');

    const done = (ws.todos || []).filter(t => t.completed).length;
    const total = (ws.todos || []).length;
    const blockedCount = (ws.blockedDomains || []).length;

    card.innerHTML = `
      <div class="ws-card-info">
        <span class="ws-card-name">${esc(ws.name)}${isActive ? ' <span class="badge-active">ACTIVE</span>' : ''}</span>
        <span class="ws-card-meta">${ws.focusMode || 'easy'} · ${blockedCount} blocked · ${total ? done + '/' + total + ' tasks' : '0 tasks'}</span>
      </div>
      <span class="ws-card-arrow">›</span>
    `;

    card.addEventListener('click', () => selectWorkspace(ws.id));
    $wsList.appendChild(card);
  }
}

// ── Activity Heatmap ───────────────────────────────────────────
const $heatmapContainer = document.getElementById('heatmap-container');
const $heatmapTooltip = document.getElementById('heatmap-tooltip');

async function renderHeatmap() {
  if (!$heatmapContainer || !$heatmapTooltip) return;
  $heatmapContainer.innerHTML = '';

  let sessions = [];
  
  try {
    const { syncJwt } = await chrome.storage.local.get('syncJwt');
    if (syncJwt) {
      const res = await fetch('https://flowstate-backend.vercel.app/api/heatmap', {
        headers: { 'Authorization': `Bearer ${syncJwt}` },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        sessions = data.sessions || [];
      }
    }
  } catch (err) {
    console.warn('[FlowState] Could not fetch heatmap data:', err.message);
  }

  // We want to fill a grid of 154 cells (approx 22 weeks * 7 days)
  const maxCells = 154;
  
  // Create grid cells (latest sessions first, but we render them to fill the grid)
  // If we have fewer than 154 sessions, first cells will be empty (grey)
  for (let i = 0; i < maxCells; i++) {
    // Fill from total minus sessions.length down to 0
    const sessionIndex = (maxCells - 1) - i;
    const session = sessions[sessionIndex];
    
    let level = 0;
    let tooltipText = "No session data";

    if (session) {
      const score = session.score || 0;
      if (score > 0) {
        if (score < 30) level = 1;
        else if (score < 60) level = 2;
        else if (score < 85) level = 3;
        else level = 4;
      }

      const date = new Date(session.started_at);
      const displayDate = date.toLocaleDateString(undefined, { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
      const durationMins = Math.round((session.duration || 0) / 60000);
      
      tooltipText = `Score: ${score} · ${durationMins} min · ${session.blocks || 0} blocks\n${displayDate}`;
    }

    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.dataset.level = level;

    cell.addEventListener('mouseenter', (e) => {
      // Setup tooltip text
      $heatmapTooltip.textContent = tooltipText;
      
      // Calculate position relative to container
      const wrapperRect = $heatmapContainer.parentElement.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      
      // We want to center it exactly above the cell
      const left = cellRect.left - wrapperRect.left + (cellRect.width / 2);
      const top = cellRect.top - wrapperRect.top;

      $heatmapTooltip.style.left = `${left}px`;
      $heatmapTooltip.style.top = `${top}px`;
      $heatmapTooltip.classList.add('visible');
    });

    cell.addEventListener('mouseleave', () => {
      $heatmapTooltip.classList.remove('visible');
    });

    $heatmapContainer.appendChild(cell);
  }
}


// ── Todo Rendering ─────────────────────────────────────────────
async function selectWorkspace(id) {
  selectedWsId = id;
  const ws = await getWorkspace(id);
  if (!ws) return;

  // Ensure arrays exist (for backwards compatibility)
  if (!ws.blockedDomains) ws.blockedDomains = [];
  if (!ws.allowedDomains) ws.allowedDomains = [];
  if (!ws.savedTabs) ws.savedTabs = [];
  if (!ws.todos) ws.todos = [];

  // Clean up domains (extract hostname from URLs)
  let needsSave = false;
  ws.blockedDomains = ws.blockedDomains.map(d => {
    try {
      if (d.startsWith('http://') || d.startsWith('https://')) {
        needsSave = true;
        return new URL(d).hostname.replace(/^www\./, '');
      }
    } catch (e) { }
    return d;
  });
  ws.allowedDomains = ws.allowedDomains.map(d => {
    try {
      if (d.startsWith('http://') || d.startsWith('https://')) {
        needsSave = true;
        return new URL(d).hostname.replace(/^www\./, '');
      }
    } catch (e) { }
    return d;
  });

  if (needsSave) {
    await saveWorkspace(ws);
  }

  $wsDetail.classList.remove('hidden');
  $wsDetailName.textContent = ws.name;

  // Focus mode buttons
  $btnModeEasy.classList.toggle('mode-btn--active', ws.focusMode === 'easy');
  $btnModeStrict.classList.toggle('mode-btn--active', ws.focusMode === 'strict');

  // Domain lists
  renderDomainList($blockedList, ws.blockedDomains, 'blocked');
  renderDomainList($allowedList, ws.allowedDomains, 'allowed');
  renderGroupBlockList(ws.allowedGroupNames || []);

  // Saved tabs count
  $savedTabsCount.textContent = ws.savedTabs.length;

  // Todos
  renderTodos(ws);

  // Activate button state
  const { activeWorkspaceId } = await getState();
  if (activeWorkspaceId === id) {
    $btnActivate.textContent = 'Workspace Active';
    $btnActivate.disabled = true;
    $btnActivate.classList.add('btn-activated');
  } else {
    $btnActivate.textContent = 'Activate Workspace';
    $btnActivate.disabled = false;
    $btnActivate.classList.remove('btn-activated');
  }

  await renderWorkspaces();
}

// ── Active State Banner ────────────────────────────────────────
async function syncActiveState() {
  const { activeWorkspaceId, workspaces } = await getState();
  if (activeWorkspaceId && workspaces[activeWorkspaceId]) {
    $activeBanner.classList.remove('hidden');
    $activeWsName.textContent = workspaces[activeWorkspaceId].name;
  } else {
    $activeBanner.classList.add('hidden');
  }
}

// ── Domain List Rendering ──────────────────────────────────────
function renderDomainList(container, domains, type) {
  container.innerHTML = '';
  if (!domains || domains.length === 0) {
    container.innerHTML = '<span class="empty-domains">None</span>';
    return;
  }
  for (const d of domains) {
    const chip = document.createElement('span');
    chip.className = 'domain-chip';
    chip.innerHTML = `${esc(d)} <span class="domain-remove" data-domain="${esc(d)}" data-type="${type}">×</span>`;
    container.appendChild(chip);
  }

  container.querySelectorAll('.domain-remove').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const domain = el.dataset.domain;
      const ws = await getWorkspace(selectedWsId);
      if (!ws) return;

      // Ensure arrays exist
      if (!ws.blockedDomains) ws.blockedDomains = [];
      if (!ws.allowedDomains) ws.allowedDomains = [];

      if (type === 'blocked') {
        ws.blockedDomains = ws.blockedDomains.filter(d => d !== domain);
      } else {
        ws.allowedDomains = ws.allowedDomains.filter(d => d !== domain);
      }
      await saveWorkspace(ws);
      await selectWorkspace(selectedWsId);
    });
  });
}

// ── Allowed Group Names (renders as chips) ───────────────────────
const $groupBlockList = document.getElementById('group-block-list');

// Custom Select Elements
const $groupBlockWrapper = document.getElementById('group-block-wrapper');
const $groupBlockTrigger = document.getElementById('group-block-trigger');
const $groupBlockDisplay = document.getElementById('group-block-display');
const $groupBlockOptions = document.getElementById('group-block-options');
const $btnAddGroupBlock = document.getElementById('btn-add-group-block');

let selectedGroupValue = '';

async function populateGroupSelect() {
  if (!$groupBlockOptions) return;
  $groupBlockOptions.innerHTML = '<li class="placeholder-option">Select an open group...</li>';

  try {
    const groups = await chrome.tabGroups.query({});

    // Create a Set to ensure unique names if multiple groups have identical names
    const uniqueNames = new Set();

    for (const g of groups) {
      if (g.title && g.title.trim()) {
        uniqueNames.add(g.title.trim());
      }
    }

    if (uniqueNames.size === 0) {
      $groupBlockOptions.innerHTML = '<li class="placeholder-option">No named groups open...</li>';
      return;
    } else {
      $groupBlockOptions.innerHTML = ''; // clear placeholder
    }

    for (const title of uniqueNames) {
      const li = document.createElement('li');
      li.textContent = title;
      li.addEventListener('click', () => {
        selectedGroupValue = title;
        $groupBlockDisplay.textContent = title;
        $groupBlockTrigger.classList.add('has-value');
        $groupBlockOptions.classList.add('hidden');
        $groupBlockTrigger.classList.remove('active');
      });
      $groupBlockOptions.appendChild(li);
    }
  } catch (err) {
    console.warn("Could not fetch tab groups:", err);
  }
}

// Toggle dropdown open/close logic
if ($groupBlockTrigger) {
  $groupBlockTrigger.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent document click listener from firing
    $groupBlockOptions.classList.toggle('hidden');
    $groupBlockTrigger.classList.toggle('active');
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if ($groupBlockWrapper && !$groupBlockWrapper.contains(e.target)) {
    $groupBlockOptions?.classList.add('hidden');
    $groupBlockTrigger?.classList.remove('active');
  }
});

function renderGroupBlockList(names) {
  $groupBlockList.innerHTML = '';
  if (!names || names.length === 0) {
    $groupBlockList.innerHTML = '<span class="empty-domains">None — all groups allowed</span>';
    return;
  }
  for (const name of names) {
    const chip = document.createElement('span');
    chip.className = 'domain-chip';
    chip.innerHTML = `${esc(name)} <span class="group-remove" data-name="${esc(name)}">×</span>`;
    $groupBlockList.appendChild(chip);
  }
  $groupBlockList.querySelectorAll('.group-remove').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ws = await getWorkspace(selectedWsId);
      if (!ws) return;
      const removedName = el.dataset.name;

      // Remove from allowedGroupNames
      ws.allowedGroupNames = (ws.allowedGroupNames || []).filter(n => n !== removedName);
      await saveWorkspace(ws);

      // Restore all tabs currently on block pages — any tab might now be allowed
      // since removing an allowed group re-opens the allow-list
      try {
        const BLOCK_PAGES = ['blocked.html', 'soft-redirect.html', 'ai-escalation.html'];
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (!tab.url) continue;
          if (!BLOCK_PAGES.some(p => tab.url.includes(p))) continue;
          const originalUrl = new URL(tab.url).searchParams.get('url');
          if (originalUrl) {
            await chrome.tabs.update(tab.id, { url: decodeURIComponent(originalUrl) });
          }
        }
      } catch { /* best-effort */ }

      await selectWorkspace(selectedWsId);
    });
  });
}

$btnAddGroupBlock.addEventListener('click', async () => {
  const raw = selectedGroupValue;
  if (!raw) return;
  const ws = await getWorkspace(selectedWsId);
  if (!ws) return;
  if (!ws.allowedGroupNames) ws.allowedGroupNames = [];
  if (!ws.allowedGroupNames.includes(raw)) {
    ws.allowedGroupNames.push(raw);
    await saveWorkspace(ws);

    // Restore blocked tabs that belong to the newly-allowed group
    try {
      const BLOCK_PAGES = ['blocked.html', 'soft-redirect.html', 'ai-escalation.html'];
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (!tab.url || !BLOCK_PAGES.some(p => tab.url.includes(p))) continue;
        if (tab.groupId && tab.groupId !== -1) {
          try {
            const group = await chrome.tabGroups.get(tab.groupId);
            if (group?.title?.trim().toLowerCase() === raw.toLowerCase()) {
              const originalUrl = new URL(tab.url).searchParams.get('url');
              if (originalUrl) await chrome.tabs.update(tab.id, { url: decodeURIComponent(originalUrl) });
            }
          } catch { /* group may not exist */ }
        }
      }
    } catch { /* best-effort */ }

    await selectWorkspace(selectedWsId);
  }

  // Reset the custom dropdown state after adding
  selectedGroupValue = '';
  $groupBlockDisplay.textContent = 'Select an open group...';
  $groupBlockTrigger.classList.remove('has-value');
});


// ── Todo Rendering ─────────────────────────────────────────────
function renderTodos(ws) {
  $todoList.innerHTML = '';
  const todos = ws.todos || [];

  for (const todo of todos) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.completed ? ' todo-done' : '');
    li.innerHTML = `
      <label class="todo-label">
        <input type="checkbox" ${todo.completed ? 'checked' : ''} data-id="${todo.id}" />
        <span>${esc(todo.text)}</span>
      </label>
      <button class="todo-delete" data-id="${todo.id}">×</button>
    `;
    $todoList.appendChild(li);
  }

  // Toggle complete
  $todoList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const w = await getWorkspace(selectedWsId);
      const t = w.todos.find(t => t.id === cb.dataset.id);
      if (t) t.completed = cb.checked;
      await saveWorkspace(w);
      renderTodos(w);
      await renderWorkspaces();
    });
  });

  // Delete task
  $todoList.querySelectorAll('.todo-delete').forEach(b => {
    b.addEventListener('click', async () => {
      const w = await getWorkspace(selectedWsId);
      w.todos = w.todos.filter(t => t.id !== b.dataset.id);
      await saveWorkspace(w);
      renderTodos(w);
      await renderWorkspaces();
    });
  });

  // Progress
  const done = todos.filter(t => t.completed).length;
  const total = todos.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $todoProgressFill.style.width = pct + '%';
  $todoProgressText.textContent = `${done} / ${total} (${pct}%)`;
}

// ── Timer Polling ──────────────────────────────────────────────
function startTimerPolling() {
  updateTimer();
  // pollPomodoro is defined in Section 5 (hoisted as async function).
  // Guarded so it gracefully no-ops if Section 5 hasn't been evaluated yet.
  if (typeof pollPomodoro === 'function') pollPomodoro();
  timerInterval = setInterval(() => {
    updateTimer();
    if (typeof pollPomodoro === 'function') pollPomodoro();
  }, 1000);
}

async function updateTimer() {
  const { timer } = await chrome.storage.local.get('timer');
  if (!timer) { $timerDisplay.textContent = '00:00:00'; return; }
  let elapsed = timer.elapsed || 0;
  if (timer.running && timer.startTime) {
    elapsed += Date.now() - timer.startTime;
  }
  $timerDisplay.textContent = formatTime(elapsed);
}

// ── New Event Bindings ─────────────────────────────────────────
function bindNewEvents() {
  // Create workspace (inline input — prompt() closes the popup)
  const $wsNameInput = document.getElementById('ws-name-input');
  $btnCreateWs.addEventListener('click', async () => {
    const name = $wsNameInput.value.trim();
    if (!name) { $wsNameInput.placeholder = 'Enter a name first!'; $wsNameInput.focus(); return; }
    $btnCreateWs.disabled = true;
    $btnCreateWs.textContent = '…';
    try {
      const ws = createWorkspace(name);
      await saveWorkspace(ws);
      $wsNameInput.value = '';
      $wsNameInput.placeholder = 'Workspace name…';
      await renderWorkspaces();
      await selectWorkspace(ws.id);
    } catch (err) {
      showStatus('✗ Could not save workspace: ' + err.message, 'err');
      console.error('[FlowState] createWorkspace error:', err);
    } finally {
      $btnCreateWs.disabled = false;
      $btnCreateWs.textContent = '+';
    }
  });
  $wsNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $btnCreateWs.click();
  });

  // Save current tabs into workspace
  $btnSaveTabs.addEventListener('click', async () => {
    if (!selectedWsId) return;
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const ws = await getWorkspace(selectedWsId);
      ws.savedTabs = tabs
        .filter(t => { try { return new URL(t.url).protocol.startsWith('http'); } catch { return false; } })
        .map(t => ({ url: t.url, title: t.title || '' }));
      await saveWorkspace(ws);
      $savedTabsCount.textContent = ws.savedTabs.length;
      $btnSaveTabs.textContent = 'Saved ✓';
      setTimeout(() => { $btnSaveTabs.textContent = 'Save Tabs'; }, 1000);
    } catch (err) {
      showStatus('✗ ' + err.message, 'err');
    }
  });

  // Delete workspace
  $btnDeleteWs.addEventListener('click', async () => {
    if (!selectedWsId) return;
    if (!confirm('Delete this workspace?')) return;
    try {
      await deleteWorkspace(selectedWsId);
      selectedWsId = null;
      $wsDetail.classList.add('hidden');
      await renderWorkspaces();
      await syncActiveState();
    } catch (err) {
      showStatus('✗ ' + err.message, 'err');
    }
  });

  // Focus mode toggles
  $btnModeEasy.addEventListener('click', () => setFocusMode('easy'));
  $btnModeStrict.addEventListener('click', () => setFocusMode('strict'));

  // Add blocked domain
  $btnAddBlocked.addEventListener('click', () => addDomain('blocked'));
  $blockedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addDomain('blocked'); });

  // Add allowed domain
  $btnAddAllowed.addEventListener('click', () => addDomain('allowed'));
  $allowedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addDomain('allowed'); });

  // Add todo
  $btnAddTodo.addEventListener('click', addTodo);
  $todoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

  // Activate workspace
  $btnActivate.addEventListener('click', async () => {
    if (!selectedWsId) return;
    $btnActivate.disabled = true;
    $btnActivate.textContent = 'Activating…';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'activate-workspace', id: selectedWsId });
      if (res?.success) {
        await syncActiveState();
        await selectWorkspace(selectedWsId);
      } else {
        showStatus('✗ ' + (res?.error || 'Activation failed'), 'err');
        $btnActivate.disabled = false;
        $btnActivate.textContent = 'Activate Workspace';
      }
    } catch (err) {
      showStatus('✗ ' + err.message, 'err');
      $btnActivate.disabled = false;
      $btnActivate.textContent = 'Activate Workspace';
    }
  });

  // Deactivate workspace
  $btnDeactivate.addEventListener('click', async () => {
    $btnDeactivate.disabled = true;
    $btnDeactivate.textContent = 'Stopping…';
    try {
      await chrome.runtime.sendMessage({ type: 'deactivate-workspace' });
      await syncActiveState();
      await renderWorkspaces();
      if (selectedWsId) await selectWorkspace(selectedWsId);
    } catch { }
    $btnDeactivate.disabled = false;
    $btnDeactivate.textContent = 'Deactivate';
  });
}

// ── Focus Mode Change ──────────────────────────────────────────
async function setFocusMode(mode) {
  if (!selectedWsId) return;
  const ws = await getWorkspace(selectedWsId);
  ws.focusMode = mode;
  await saveWorkspace(ws);
  $btnModeEasy.classList.toggle('mode-btn--active', mode === 'easy');
  $btnModeStrict.classList.toggle('mode-btn--active', mode === 'strict');
  await renderWorkspaces();
}

// ── Add Domain ─────────────────────────────────────────────────
async function addDomain(type) {
  const input = type === 'blocked' ? $blockedInput : $allowedInput;
  let val = input.value.trim().toLowerCase();
  if (!val || !selectedWsId) return;

  const ws = await getWorkspace(selectedWsId);
  if (!ws) return;

  // Ensure arrays exist (for backwards compatibility)
  if (!ws.blockedDomains) ws.blockedDomains = [];
  if (!ws.allowedDomains) ws.allowedDomains = [];

  // Extract domain from URL if needed
  try {
    if (val.startsWith('http://') || val.startsWith('https://')) {
      const url = new URL(val);
      val = url.hostname;
    }
    // Remove www. prefix
    val = val.replace(/^www\./, '');
  } catch (e) {
    // If not a valid URL, treat as domain string
  }

  const list = type === 'blocked' ? ws.blockedDomains : ws.allowedDomains;
  if (list.includes(val)) { input.value = ''; return; }
  list.push(val);
  await saveWorkspace(ws);
  input.value = '';
  await selectWorkspace(selectedWsId);
}

// ── Add Todo ───────────────────────────────────────────────────
async function addTodo() {
  const text = $todoInput.value.trim();
  if (!text || !selectedWsId) return;

  const ws = await getWorkspace(selectedWsId);
  ws.todos.push({ id: crypto.randomUUID(), text, completed: false });
  await saveWorkspace(ws);
  $todoInput.value = '';
  renderTodos(ws);
  await renderWorkspaces();
}

// ── HTML Escape ────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: AI SETTINGS
// ═══════════════════════════════════════════════════════════════

const $aiSectionToggle = document.getElementById('ai-section-toggle');
const $aiSectionBody = document.getElementById('ai-section-body');
const $aiToggleArrow = document.getElementById('ai-toggle-arrow');
const $aiEnabledToggle = document.getElementById('ai-enabled-toggle');
const $hfApiKeyInput = document.getElementById('hf-api-key-input');
const $btnSaveKey = document.getElementById('btn-save-key');
const $keyStatus = document.getElementById('key-status');
const $btnTestAi = document.getElementById('btn-test-ai');
const $aiTestResult = document.getElementById('ai-test-result');
const $btnAiSuggest = document.getElementById('btn-ai-suggest');
const $aiSuggestResult = document.getElementById('ai-suggest-result');
const $aiStatusText = document.getElementById('ai-status-text');

// Load AI settings on init
(async () => {
  try {
    const { hfApiKey, aiEnabled, aiTestResult } = await getState();
    if (hfApiKey) {
      $hfApiKeyInput.value = hfApiKey;
      $keyStatus.textContent = '✓ Key saved';
      $keyStatus.className = 'ai-key-status ai-key-ok';
    }
    $aiEnabledToggle.checked = !!aiEnabled;
    updateAiStatusText(!!aiEnabled);

    // Restore last test result if exists
    if (aiTestResult) {
      $aiTestResult.innerHTML = aiTestResult;
      $aiTestResult.className = 'ai-test-result-box';

      // Re-attach close button handler
      const closeBtn = $aiTestResult.querySelector('.ai-result-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
          $aiTestResult.className = 'hidden';
          await setState({ aiTestResult: null });
        });
      }
    }
  } catch { }
})();

// Update AI status text
function updateAiStatusText(enabled) {
  if (enabled) {
    $aiStatusText.innerHTML = '✅ Enabled - AI will scan and block distracting sites<br><span style="font-size: 10px; opacity: 0.8;">Sites like Instagram, WhatsApp will be blocked (97%+ confidence)</span>';
    $aiStatusText.style.color = 'var(--success)';
  } else {
    $aiStatusText.textContent = '❌ Disabled - Click toggle to enable';
    $aiStatusText.style.color = 'var(--text-muted)';
  }
}

// Collapsible toggle
$aiSectionToggle.addEventListener('click', () => {
  const open = !$aiSectionBody.classList.contains('hidden');
  $aiSectionBody.classList.toggle('hidden', open);
  $aiToggleArrow.style.transform = open ? '' : 'rotate(90deg)';
});

// AI enable toggle
$aiEnabledToggle.addEventListener('change', async () => {
  const enabled = $aiEnabledToggle.checked;
  await setAiEnabled(enabled);
  updateAiStatusText(enabled);

  // Show status message
  const message = enabled
    ? '✓ AI Smart Blocking enabled - Checking all open tabs...'
    : '✓ AI Smart Blocking disabled - AI-blocked sites are now accessible';
  showStatus(message, 'ok');
});

// Save API key
$btnSaveKey.addEventListener('click', async () => {
  const key = $hfApiKeyInput.value.trim();
  if (!key || !key.startsWith('hf_')) {
    $keyStatus.textContent = '✗ Key must start with hf_';
    $keyStatus.className = 'ai-key-status ai-key-err';
    return;
  }
  $btnSaveKey.disabled = true;
  $btnSaveKey.textContent = 'Saving…';
  try {
    await saveApiKey(key);
    $keyStatus.textContent = '✓ Key saved';
    $keyStatus.className = 'ai-key-status ai-key-ok';
  } catch (err) {
    $keyStatus.textContent = '✗ ' + err.message;
    $keyStatus.className = 'ai-key-status ai-key-err';
  } finally {
    $btnSaveKey.disabled = false;
    $btnSaveKey.textContent = 'Save';
  }
});

// Test AI on current tab
$btnTestAi.addEventListener('click', async () => {
  $btnTestAi.disabled = true;
  $btnTestAi.textContent = '✦ Running…';
  $aiTestResult.className = 'hidden';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome')) {
      throw new Error('No classifiable tab is active.');
    }
    const res = await chrome.runtime.sendMessage({
      type: 'ai-classify',
      url: tab.url,
      title: tab.title || '',
    });

    if (!res?.success) throw new Error(res?.error || 'AI classification failed');

    const pct = Math.round(res.topScore * 100);
    const icon = res.topLabel.includes('distraction') || res.topLabel.includes('social')
      ? '🚫' : res.topLabel.includes('productive') ? '✅' : '🔵';
    const resultHtml =
      `<div style="display: flex; justify-content: space-between; align-items: start;">` +
      `<div>` +
      `<span class="ai-result-domain">${esc(new URL(tab.url).hostname)}</span>` +
      `<br><span class="ai-result-label">${icon} ${esc(res.topLabel)}</span>` +
      `<span class="ai-result-score">${pct}% confident</span>` +
      `</div>` +
      `<button class="ai-result-close" title="Clear result">×</button>` +
      `</div>`;
    $aiTestResult.innerHTML = resultHtml;
    $aiTestResult.className = 'ai-test-result-box';

    // Add close button handler
    $aiTestResult.querySelector('.ai-result-close').addEventListener('click', async () => {
      $aiTestResult.className = 'hidden';
      await setState({ aiTestResult: null });
    });

    // Persist the result so it survives popup close/reopen
    await setState({ aiTestResult: resultHtml });
  } catch (err) {
    $aiTestResult.textContent = '✗ ' + err.message;
    $aiTestResult.className = 'ai-test-result-box ai-result-err';
  } finally {
    $btnTestAi.disabled = false;
    $btnTestAi.textContent = '✦ Test AI on Current Tab';
  }
});

// AI Suggest: classify current tab and suggest block/allow
$btnAiSuggest.addEventListener('click', async () => {
  if (!selectedWsId) return;
  $btnAiSuggest.disabled = true;
  $btnAiSuggest.textContent = '✦ Thinking…';
  $aiSuggestResult.className = 'hidden';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || tab.url.startsWith('chrome')) {
      throw new Error('No classifiable tab active.');
    }
    const host = new URL(tab.url).hostname.replace('www.', '');
    const res = await chrome.runtime.sendMessage({
      type: 'ai-classify',
      url: tab.url,
      title: tab.title || '',
    });
    if (!res?.success) throw new Error(res?.error || 'AI failed');

    const isDistraction = res.topLabel.includes('distraction') || res.topLabel.includes('social');
    const pct = Math.round(res.topScore * 100);
    const suggestion = isDistraction
      ? `<b>AI says: block <code>${esc(host)}</code></b> — looks like <em>${esc(res.topLabel)}</em> (${pct}% confident).`
      : `<b>AI says: allow <code>${esc(host)}</code></b> — looks like <em>${esc(res.topLabel)}</em> (${pct}% confident).`;

    $aiSuggestResult.innerHTML =
      `<span class="ai-suggest-label">${suggestion}</span>` +
      (isDistraction
        ? `<button id="btn-do-block" class="ai-suggest-action ai-suggest-block">+ Block ${esc(host)}</button>`
        : `<button id="btn-do-allow" class="ai-suggest-action ai-suggest-allow">+ Allow ${esc(host)}</button>`);
    $aiSuggestResult.className = `ai-suggest-box ${isDistraction ? 'ai-suggest-danger' : 'ai-suggest-safe'}`;

    // Wire up the one-click add button
    const $doBlock = document.getElementById('btn-do-block');
    const $doAllow = document.getElementById('btn-do-allow');
    if ($doBlock) {
      $doBlock.addEventListener('click', async () => {
        const ws = await getWorkspace(selectedWsId);
        if (!ws.blockedDomains) ws.blockedDomains = [];
        if (!ws.blockedDomains.includes(host)) {
          ws.blockedDomains.push(host);
          await saveWorkspace(ws);
          await selectWorkspace(selectedWsId);
        }
        $aiSuggestResult.className = 'hidden';
      });
    }
    if ($doAllow) {
      $doAllow.addEventListener('click', async () => {
        const ws = await getWorkspace(selectedWsId);
        if (!ws.allowedDomains) ws.allowedDomains = [];
        if (!ws.allowedDomains.includes(host)) {
          ws.allowedDomains.push(host);
          await saveWorkspace(ws);
          await selectWorkspace(selectedWsId);
        }
        $aiSuggestResult.className = 'hidden';
      });
    }
  } catch (err) {
    $aiSuggestResult.textContent = '✗ ' + err.message;
    $aiSuggestResult.className = 'ai-suggest-box ai-suggest-danger';
  } finally {
    $btnAiSuggest.disabled = false;
    $btnAiSuggest.textContent = '✦ AI Suggest';
  }
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4: CONNECT ACCOUNT (Auth0 Device Code Flow)
// Additive only — no changes to blocking/AI/timer logic.
// If user is not logged in, all existing features work exactly as before.
// ═══════════════════════════════════════════════════════════════

// ── DOM refs ───────────────────────────────────────────────────
const $accountSectionToggle = document.getElementById('account-section-toggle');
const $accountSectionBody = document.getElementById('account-section-body');
const $accountToggleArrow = document.getElementById('account-toggle-arrow');
const $accountLoggedOut = document.getElementById('account-logged-out');
const $accountLoggedIn = document.getElementById('account-logged-in');
const $accountStepConnect = document.getElementById('account-step-connect');
const $accountStepCode = document.getElementById('account-step-code');
const $btnConnectAccount = document.getElementById('btn-connect-account');
const $accountVerifyLink = document.getElementById('account-verify-link');
const $accountUserCode = document.getElementById('account-user-code');
const $btnCopyCode = document.getElementById('btn-copy-code');
const $accountPollStatus = document.getElementById('account-poll-status');
const $btnCancelLogin = document.getElementById('btn-cancel-login');
const $accountError = document.getElementById('account-error');
const $accountEmail = document.getElementById('account-email');
const $btnLogout = document.getElementById('btn-logout');

// Track active poll so we can cancel it
let _pollCancelFlag = false;

// ── Collapsible toggle ─────────────────────────────────────────
$accountSectionToggle.addEventListener('click', () => {
  const open = !$accountSectionBody.classList.contains('hidden');
  $accountSectionBody.classList.toggle('hidden', open);
  $accountToggleArrow.style.transform = open ? '' : 'rotate(90deg)';
});

// ── Init: render correct state on popup open ───────────────────
(async () => {
  console.log('[FlowState Popup] Init: checking auth state…');
  try {
    const [jwt, user] = await Promise.all([getStoredJwt(), getStoredUser()]);
    console.log('[FlowState Popup] Init result — jwt:', !!jwt, '| user:', user);
    if (jwt && user) {
      showLoggedIn(user);
    } else if (jwt) {
      // JWT exists but syncUser wasn't stored — show partial logged-in state
      showLoggedIn({ email: '(connected)', name: 'Connected' });
    } else {
      showLoggedOut();
    }
  } catch (e) {
    console.warn('[FlowState Popup] Init error:', e);
    showLoggedOut();
  }
})();

// ── Storage listener: update UI the moment syncJwt is written ──
// This fires even if the popup was open during polling and the Promise
// resolved but the popup's UI state wasn't updated yet.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.syncJwt) {
    const newJwt = changes.syncJwt.newValue;
    console.log('[FlowState Popup] storage.onChanged — syncJwt changed:', !!newJwt);
    if (newJwt) {
      // Token just arrived — read user and update UI
      getStoredUser().then(user => {
        console.log('[FlowState Popup] Switching to logged-in. user:', user);
        showLoggedIn(user || { email: '(connected)', name: 'Connected' });
      });
    } else {
      // Token was removed (logout)
      showLoggedOut();
    }
  }
});

// ── Connect button ─────────────────────────────────────────────
// Popup's only job: start the device flow and hand deviceCode to the SW.
// All polling happens in service-worker.js (survives popup close).
// storage.onChanged listener above updates UI when SW writes syncJwt.
$btnConnectAccount.addEventListener('click', async () => {
  $btnConnectAccount.disabled = true;
  $btnConnectAccount.textContent = 'Starting…';
  hideError();

  try {
    const flow = await startDeviceFlow();

    // Show the code step in the popup
    $accountStepConnect.classList.add('hidden');
    $accountStepCode.classList.remove('hidden');
    $accountUserCode.textContent = flow.userCode;
    $accountVerifyLink.href = flow.verificationUri;
    $accountVerifyLink.textContent = flow.verificationUri;
    $accountPollStatus.textContent = '⏳ Waiting for you to log in…';

    // Delegate ALL polling to the service worker
    // SW uses chrome.alarms — survives this popup closing
    chrome.runtime.sendMessage({
      type: 'FS_START_DEVICE_POLL',
      deviceCode: flow.deviceCode,
      interval: flow.interval,
    }).catch(() => { });

    // Open the verification page — popup may close, that's fine
    chrome.tabs.create({ url: flow.verificationUri, active: true });

  } catch (err) {
    showError(err.message || 'Could not start login. Check your connection.');
    $btnConnectAccount.disabled = false;
    $btnConnectAccount.textContent = 'Connect Account';
  }
});

// ── Copy code button ───────────────────────────────────────────
$btnCopyCode.addEventListener('click', () => {
  const code = $accountUserCode.textContent;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    $btnCopyCode.textContent = '✓';
    setTimeout(() => { $btnCopyCode.textContent = '⎘'; }, 1200);
  }).catch(() => { });
});

// ── Cancel login ───────────────────────────────────────────────
$btnCancelLogin.addEventListener('click', () => {
  _pollCancelFlag = true;
  resetToConnectStep();
});

// ── Logout ─────────────────────────────────────────────────────
$btnLogout.addEventListener('click', async () => {
  await logout();
  showLoggedOut();
  showStatus('✓ Logged out', 'ok');
});

// ── UI helpers ─────────────────────────────────────────────────
function showLoggedIn(user) {
  $accountLoggedOut.classList.add('hidden');
  $accountLoggedIn.classList.remove('hidden');
  $accountEmail.textContent = user?.email || user?.name || '(no email)';
}

function showLoggedOut() {
  $accountLoggedIn.classList.add('hidden');
  $accountLoggedOut.classList.remove('hidden');
  resetToConnectStep();
}

function resetToConnectStep() {
  $accountStepCode.classList.add('hidden');
  $accountStepConnect.classList.remove('hidden');
  $btnConnectAccount.disabled = false;
  $btnConnectAccount.textContent = 'Connect Account';
}

function showError(msg) {
  $accountError.textContent = msg;
  $accountError.classList.remove('hidden');
}

function hideError() {
  $accountError.classList.add('hidden');
  $accountError.textContent = '';
}
// ── Focus Score Strip ───────────────────────────────────────────
const $focusScoreStrip = document.getElementById('focus-score-strip');
const $focusScoreRing = document.getElementById('focus-score-ring');
const $focusScoreValue = document.getElementById('focus-score-value');
const $focusScoreSub = document.getElementById('focus-score-sub');

async function renderFocusScore() {
  const { dailyFocusStats } = await chrome.storage.local.get('dailyFocusStats');
  if (!dailyFocusStats) { $focusScoreStrip.classList.add('hidden'); return; }

  const today = new Date().toISOString().slice(0, 10);

  let latestSession = null;
  let maxSessionId = '';

  for (const [id, stat] of Object.entries(dailyFocusStats)) {
    if (stat.date === today) {
      // sessionId starts with Date.now().toString(36), so alphabetical sort perfectly finds the latest
      if (id > maxSessionId) {
        maxSessionId = id;
        latestSession = stat;
      }
    }
  }

  if (!latestSession) {
    $focusScoreStrip.classList.add('hidden'); return;
  }

  const score = latestSession.focusScore ?? 0;
  const blocks = latestSession.blockedAttempts ?? 0;
  const mins = latestSession.deepFocusMinutes ?? 0;

  // Color tier
  $focusScoreRing.className = 'focus-score-ring';
  if (score < 30) $focusScoreRing.classList.add('focus-score-ring--red');
  else if (score < 60) $focusScoreRing.classList.add('focus-score-ring--amber');
  // else stays green (default)

  $focusScoreValue.textContent = score;

  const $title = document.querySelector('.focus-score-label');
  if ($title) $title.textContent = 'LAST SESSION SCORE';

  const minsText = mins > 0 ? `${mins} min` : '<1 min';
  $focusScoreSub.textContent = `${minsText} · ${blocks} block${blocks !== 1 ? 's' : ''}`;
  $focusScoreStrip.classList.remove('hidden');
}

// Render on popup open
renderFocusScore();

// Re-render live when a session ends and writes dailyFocusStats
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.dailyFocusStats) renderFocusScore();
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5: POMODORO TIMER UI
// ═══════════════════════════════════════════════════════════════

import { formatPomodoroTime, arcProgress, WORK_MS, BREAK_MS } from '../utils/pomodoro.js';

// ── DOM refs ───────────────────────────────────────────────────
const $pomPanel = document.getElementById('pomodoro-panel');
const $pomPhaseDot = document.getElementById('pom-phase-dot');
const $pomPhaseLabel = document.getElementById('pom-phase-label');
const $pomSessionCount = document.getElementById('pom-session-count');
const $pomCountdown = document.getElementById('pom-countdown');
const $pomSubLabel = document.getElementById('pom-sub-label');
const $pomProgress = document.getElementById('pom-progress');
const $pomStatusBar = document.getElementById('pom-status-bar');
const $btnPomPause = document.getElementById('btn-pom-pause');
const $btnPomReset = document.getElementById('btn-pom-reset');

// SVG arc circumference for r=42 → 2πr ≈ 263.9
const DASH = 263.9;

// Track last-rendered state hash to avoid redundant DOM writes
let _lastPomHash = '';

/**
 * Render the Pomodoro panel from a pomodoro state object.
 * Computes remaining ms, updates arc, phase labels, countdown, and buttons.
 * @param {object} pom
 */
function renderPomodoroUI(pom) {
  if (!pom) return;

  // ── Compute remaining ms ──
  let remaining;
  if (pom.isPaused) {
    remaining = pom.pausedRemaining || 0;
  } else if (pom.isRunning) {
    remaining = Math.max(0, pom.endTime - Date.now());
  } else {
    // Idle / just reset — show full duration
    remaining = pom.phase === 'work' ? WORK_MS : BREAK_MS;
  }

  // Skip render if nothing changed (avoids SVG janking every second)
  const hash = `${pom.phase}|${pom.isRunning}|${pom.isPaused}|${Math.round(remaining / 1000)}`;
  if (hash === _lastPomHash) return;
  _lastPomHash = hash;

  const isWork = pom.phase === 'work';
  const isBreak = pom.phase === 'break';
  const isPaused = pom.isPaused;
  const isIdle = !pom.isRunning && !pom.isPaused;

  // ── Phase dot ──
  $pomPhaseDot.className = 'pom-dot ' + (
    isPaused ? 'pom-dot--paused' :
      !pom.isRunning && !pom.isPaused ? 'pom-dot--idle' :
        isWork ? 'pom-dot--work' : 'pom-dot--break'
  );

  // ── Phase label ──
  $pomPhaseLabel.textContent = isPaused ? 'PAUSED' : isWork ? 'WORK' : 'BREAK';
  $pomPhaseLabel.className = 'pom-phase-label ' + (
    isPaused ? 'pom-phase-label--paused' :
      isWork ? 'pom-phase-label--work' : 'pom-phase-label--break'
  );

  // ── Panel phase class (drives break-mode button colours) ──
  $pomPanel.classList.toggle('pom-phase--break', isBreak && !isPaused);

  // ── Ambient glow colour ──
  const glowColor = isPaused
    ? 'rgba(251, 191, 36, 0.07)'
    : isBreak ? 'rgba(52, 211, 153, 0.07)'
      : 'rgba(34, 211, 238, 0.07)';
  $pomPanel.style.setProperty('--pom-glow', glowColor);

  // ── Session counter ──
  const n = pom.sessionCount || 0;
  $pomSessionCount.textContent = n > 0 ? `Session ${n + 1}` : 'Session 1';

  // ── Countdown text ──
  $pomCountdown.textContent = formatPomodoroTime(remaining);
  $pomCountdown.style.color = isPaused
    ? 'var(--accent-amber)'
    : isBreak ? 'var(--accent-emerald)'
      : 'var(--text)';

  // ── Sub-label ──
  $pomSubLabel.textContent = isIdle ? 'ready' : isPaused ? 'paused' : isWork ? 'focus' : 'break';

  // ── SVG arc ──
  // stroke-dashoffset 0 = full circle (just started), DASH = no arc (expired)
  const progress = arcProgress(remaining, pom.phase);
  $pomProgress.style.strokeDashoffset = String(DASH * (1 - progress));
  $pomProgress.className = 'pom-arc ' + (
    isPaused ? 'pom-arc--paused' :
      isBreak ? 'pom-arc--break' : ''
  );

  // ── Pause / Resume / Start button ──────────────────────────────
  // BREAK IS NON-PAUSABLE: button is hidden during break phase.
  // Two enforcement layers:
  //   1. UI  — button hidden, no click possible
  //   2. SW  — pausePomodoro() rejects phase==='break' at the source
  if (isBreak) {
    $btnPomPause.classList.add('hidden');
  } else {
    $btnPomPause.classList.remove('hidden');
    $btnPomPause.disabled = false;
    if (isIdle) {
      $btnPomPause.textContent = '▶ Start';
      $btnPomPause.classList.add('pom-btn--resume');
    } else if (isPaused) {
      $btnPomPause.textContent = '▶ Resume';
      $btnPomPause.classList.add('pom-btn--resume');
    } else {
      $btnPomPause.textContent = '⏸ Pause';
      $btnPomPause.classList.remove('pom-btn--resume');
    }
  }

  // ── Status bar ──────────────────────────────────────────────────
  if (isBreak) {
    $pomStatusBar.textContent = '🔒 Break Mode Active — runs its full duration';
    $pomStatusBar.className = 'pom-status-bar pom-status-bar--break';
  } else if (isIdle) {
    $pomStatusBar.textContent = '▶ Click Start to begin your first focus session';
    $pomStatusBar.className = 'pom-status-bar pom-status-bar--paused';
  } else if (isPaused) {
    $pomStatusBar.textContent = '⏸ Timer paused — blocking active';
    $pomStatusBar.className = 'pom-status-bar pom-status-bar--paused';
  } else {
    $pomStatusBar.className = 'pom-status-bar hidden';
  }

}

/** Read Pomodoro state from storage and render. */
async function pollPomodoro() {
  try {
    const { pomodoro } = await chrome.storage.local.get('pomodoro');
    renderPomodoroUI(pomodoro);
  } catch { /* SW may be waking — silently skip */ }
}

// ── Initial Pomodoro render on popup open ──────────────────────
// startTimerPolling (called from init) now calls pollPomodoro too.
// This one-shot call covers the case where Section 5 loads AFTER
// startTimerPolling already ran (async init ordering).
pollPomodoro();

// ── Show/hide panel when workspace activates/deactivates ────────
// Reacts to storage changes so the panel updates even while popup is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.activeWorkspaceId || changes.pomodoro) {
    chrome.storage.local.get(['activeWorkspaceId', 'pomodoro']).then(({ activeWorkspaceId, pomodoro }) => {
      if (activeWorkspaceId) {
        $pomPanel.classList.remove('hidden');
        _lastPomHash = '';           // force re-render on phase change
        renderPomodoroUI(pomodoro);
      } else {
        $pomPanel.classList.add('hidden');
      }
    });
  }
});

// ── Initial visibility on popup open ───────────────────────────
(async () => {
  const { activeWorkspaceId, pomodoro } = await chrome.storage.local.get(['activeWorkspaceId', 'pomodoro']);
  if (activeWorkspaceId) {
    $pomPanel.classList.remove('hidden');
    renderPomodoroUI(pomodoro);
  }
})();

// ── Start / Pause / Resume button ─────────────────────────────
$btnPomPause.addEventListener('click', async () => {
  $btnPomPause.disabled = true;
  try {
    const { pomodoro, activeWorkspaceId, workspaces } = await chrome.storage.local.get(
      ['pomodoro', 'activeWorkspaceId', 'workspaces']
    );
    const pom = pomodoro || {};
    const isIdle = !pom.isRunning && !pom.isPaused;

    let msgType, msgPayload = {};
    if (isIdle) {
      // Not running yet — start a fresh work phase using workspace focus mode
      const ws = (workspaces || {})[activeWorkspaceId];
      msgType = 'pomodoro-start';
      msgPayload = { mode: ws?.focusMode || 'easy' };
    } else if (pom.isPaused) {
      msgType = 'pomodoro-resume';
    } else {
      msgType = 'pomodoro-pause';
    }

    await chrome.runtime.sendMessage({ type: msgType, ...msgPayload });
    _lastPomHash = ''; // force re-render
    await pollPomodoro();
  } catch (err) {
    console.warn('[FlowState Pomodoro] Start/Pause/Resume error:', err);
  } finally {
    $btnPomPause.disabled = false;
  }
});

// ── Reset button ────────────────────────────────────────────────
$btnPomReset.addEventListener('click', async () => {
  $btnPomReset.disabled = true;
  $btnPomReset.textContent = '…';
  try {
    await chrome.runtime.sendMessage({ type: 'pomodoro-reset' });
    _lastPomHash = '';
    await pollPomodoro();
  } catch (err) {
    console.warn('[FlowState Pomodoro] Reset error:', err);
  } finally {
    $btnPomReset.disabled = false;
    $btnPomReset.textContent = '↺ Reset';
  }
});
