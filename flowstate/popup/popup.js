/**
 * popup.js — FlowState Popup
 *
 * Section 1: Tab Organizer by Category (existing, fully preserved)
 * Section 2: Workspace, Todo, Timer, Focus Mode (new features)
 * Section 3: AI Settings (facebook/bart-large-mnli via HF Inference API)
 */
import {
  getState, setState, getWorkspaces, getWorkspace, saveWorkspace,
  deleteWorkspace, createWorkspace, setActiveWorkspaceId,
  saveApiKey, getApiKey, setAiEnabled
} from '../storage/store.js';
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

/** Build Map<category, Tab[]>. Skips internal pages and already-grouped tabs. */
function groupTabsByCategory(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    if (tab.groupId && tab.groupId !== -1) continue;   // already grouped
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
  for (const [category, tabs] of categoryMap) {
    if (tabs.length === 0) continue;
    const tabIds = tabs.map(t => t.id);
    const groupId = await chrome.tabs.group({ tabIds });
    // Use fixed category color, or rotate fallback colors for unknown categories
    const color = CATEGORY_COLORS[category]
      || FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
    await chrome.tabGroups.update(groupId, {
      title: category,
      color: color,
      collapsed: tabs.length > 3
    });
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

    const done = ws.todos.filter(t => t.completed).length;
    const total = ws.todos.length;

    card.innerHTML = `
      <div class="ws-card-info">
        <span class="ws-card-name">${esc(ws.name)}${isActive ? ' <span class="badge-active">ACTIVE</span>' : ''}</span>
        <span class="ws-card-meta">${ws.focusMode} · ${ws.blockedDomains.length} blocked · ${total ? done + '/' + total + ' tasks' : '0 tasks'}</span>
      </div>
      <span class="ws-card-arrow">›</span>
    `;

    card.addEventListener('click', () => selectWorkspace(ws.id));
    $wsList.appendChild(card);
  }
}

// ── Select & Detail ────────────────────────────────────────────
async function selectWorkspace(id) {
  selectedWsId = id;
  const ws = await getWorkspace(id);
  if (!ws) return;

  $wsDetail.classList.remove('hidden');
  $wsDetailName.textContent = ws.name;

  // Focus mode buttons
  $btnModeEasy.classList.toggle('mode-btn--active', ws.focusMode === 'easy');
  $btnModeStrict.classList.toggle('mode-btn--active', ws.focusMode === 'strict');

  // Domain lists
  renderDomainList($blockedList, ws.blockedDomains, 'blocked');
  renderDomainList($allowedList, ws.allowedDomains, 'allowed');

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
  timerInterval = setInterval(updateTimer, 1000);
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
  const val = input.value.trim().toLowerCase();
  if (!val || !selectedWsId) return;

  const ws = await getWorkspace(selectedWsId);
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

// Load AI settings on init
(async () => {
  try {
    const { hfApiKey, aiEnabled } = await getState();
    if (hfApiKey) {
      $hfApiKeyInput.value = hfApiKey;
      $keyStatus.textContent = '✓ Key saved';
      $keyStatus.className = 'ai-key-status ai-key-ok';
    }
    $aiEnabledToggle.checked = !!aiEnabled;
  } catch { }
})();

// Collapsible toggle
$aiSectionToggle.addEventListener('click', () => {
  const open = !$aiSectionBody.classList.contains('hidden');
  $aiSectionBody.classList.toggle('hidden', open);
  $aiToggleArrow.style.transform = open ? '' : 'rotate(90deg)';
});

// AI enable toggle
$aiEnabledToggle.addEventListener('change', async () => {
  await setAiEnabled($aiEnabledToggle.checked);
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
    $aiTestResult.innerHTML =
      `<span class="ai-result-domain">${esc(new URL(tab.url).hostname)}</span>` +
      `<br><span class="ai-result-label">${icon} ${esc(res.topLabel)}</span>` +
      `<span class="ai-result-score">${pct}% confident</span>`;
    $aiTestResult.className = 'ai-test-result-box';
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
