# FlowState — Architecture Document

## 1. Folder Structure

```
flowstate/
├── manifest.json              # Extension manifest (V3)
├── background/
│   └── service-worker.js      # Background logic: blocking, timer, tab org
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.js               # Popup logic & event handlers
│   └── popup.css              # Popup-specific styles
├── pages/
│   ├── blocked.html           # Strict Mode block screen
│   ├── blocked.js             # Intent Unlock countdown logic
│   ├── soft-redirect.html     # Easy Mode soft redirect screen
│   ├── soft-redirect.js       # Continue / Stay Focused logic
│   └── pages.css              # Shared styles for full-page screens
├── storage/
│   └── store.js               # chrome.storage.local wrapper & data model
├── utils/
│   ├── tabs.js                # Tab grouping & domain helpers
│   └── timer.js               # Focus timer helpers
├── styles/
│   └── global.css             # Shared CSS variables & resets
└── icons/
    ├── icon16.png             # Toolbar icon
    ├── icon48.png             # Extensions page
    └── icon128.png            # Chrome Web Store
```

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CHROME BROWSER                        │
│                                                         │
│  ┌──────────┐   messages    ┌─────────────────────┐     │
│  │  Popup   │ ◄───────────► │  Service Worker     │     │
│  │ popup.js │               │  (background)       │     │
│  └────┬─────┘               │                     │     │
│       │                     │  • Tab organization  │     │
│       │ reads/writes        │  • Navigation block  │     │
│       ▼                     │  • Timer lifecycle   │     │
│  ┌──────────┐               │  • Intent unlock     │     │
│  │ storage/ │ ◄────────────►│                     │     │
│  │ store.js │  reads/writes └──────────┬──────────┘     │
│  └──────────┘                          │                │
│                              redirects │                │
│                          ┌─────────────┼──────────┐     │
│                          ▼             ▼          │     │
│                   ┌────────────┐ ┌────────────┐   │     │
│                   │ blocked.   │ │ soft-       │   │     │
│                   │ html       │ │ redirect.   │   │     │
│                   │ (Strict)   │ │ html (Easy) │   │     │
│                   └────────────┘ └────────────┘   │     │
│                                                   │     │
└─────────────────────────────────────────────────────────┘
```

Three execution contexts, one shared storage layer:

| Context | File(s) | Lifetime | Role |
|---|---|---|---|
| **Service Worker** | `background/service-worker.js` | Persistent (event-driven) | Intercepts navigation, organizes tabs, manages timer |
| **Popup** | `popup/*` | Opens/closes with popup | UI for workspace CRUD, todos, activation |
| **Block Pages** | `pages/*` | Tab lifetime | Displayed when a blocked domain is visited |

---

## 3. Separation of Logic

### Background Service Worker
- **Tab organization**: Queries all tabs → groups by domain → creates `chrome.tabGroups`
- **Navigation interception**: `chrome.webNavigation.onBeforeNavigate` checks URL against blocked/allowed lists
- **Redirect decision**: Easy → `soft-redirect.html`, Strict → `blocked.html`
- **Timer**: Stores `startTime` on activate, computes elapsed on deactivate
- **Intent Unlock**: Receives unlock request from `blocked.js`, adds domain to `tempUnlockedDomains`

### Popup
- **Reads** state from `chrome.storage.local` on open
- **Writes** workspace data directly to storage (CRUD is local, no need to round-trip through background)
- **Sends commands** to background for actions that need persistent listeners (organize, activate, deactivate)
- **Polls** timer state every second to update display

### Block / Redirect Pages
- **Read-only** access to query params (`?url=`)
- **Send messages** to background for unlock requests
- **No direct storage writes** — all state changes go through background

---

## 4. State Management Approach

**Single source of truth**: `chrome.storage.local`

```
Popup ──write──► chrome.storage.local ◄──read/write── Service Worker
                        ▲
                        │ read (via messages)
                  Block Pages
```

- `storage/store.js` exports helper functions that both popup and background import
- No in-memory caching — always read from storage (fast enough for local)
- Popup refreshes state on open and on `chrome.storage.onChanged` events
- Service worker reads state on every navigation event (stateless between events)

---

## 5. Data Model

Stored under `chrome.storage.local`:

```js
{
  workspaces: {
    "uuid-1": {
      id:             "uuid-1",
      name:           "Deep Work",
      createdAt:      1708905600000,
      focusMode:      "strict",          // "easy" | "strict"
      blockedDomains: ["twitter.com", "reddit.com", "youtube.com"],
      allowedDomains: ["docs.google.com"],
      savedTabs:      [
        { url: "https://github.com/...", title: "My Repo" }
      ],
      todos: [
        { id: "t1", text: "Finish auth module",  completed: false },
        { id: "t2", text: "Write tests",         completed: true  }
      ]
    }
  },
  activeWorkspaceId: "uuid-1" | null,
  timer: {
    startTime: 1708905600000 | null,     // Date.now() when workspace activated
    elapsed:   3600000,                  // accumulated ms across sessions
    running:   true
  },
  tempUnlockedDomains: ["twitter.com"]   // reset on deactivate
}
```

---

## 6. Event Flow Diagrams

### A. Organize Tabs (Passive Mode)

```
User clicks "Organize Tabs" in popup
  │
  ▼
popup.js ──sendMessage({ type: 'organize-tabs' })──► service-worker.js
  │                                                        │
  │                                               chrome.tabs.query({})
  │                                                        │
  │                                               groupTabsByDomain()
  │                                                        │
  │                                               chrome.tabs.group()
  │                                               chrome.tabGroups.update()
  │                                                        │
  ◄──────────── sendResponse({ success: true }) ───────────┘
```

### B. Activate Workspace

```
User clicks "Activate Workspace"
  │
  ▼
popup.js ──sendMessage({ type: 'activate-workspace', id })──► service-worker.js
  │                                                                  │
  │                                                     setActiveWorkspaceId(id)
  │                                                     startTimer()
  │                                                     clearTempUnlocked()
  │                                                                  │
  │                                                     Register webNavigation listener
  │                                                                  │
  ◄────────── sendResponse({ success: true }) ───────────────────────┘
  │
  ▼
popup.js updates UI → shows timer, "Deactivate" button
```

### C. Navigation Blocking (Focus Active)

```
User navigates to twitter.com
  │
  ▼
chrome.webNavigation.onBeforeNavigate fires
  │
  ▼
service-worker.js
  │
  ├── Extract domain from URL
  ├── Load active workspace from storage
  ├── Check: allowed list? → ALLOW (do nothing)
  ├── Check: tempUnlocked? → ALLOW (do nothing)
  ├── Check: blocked list?
  │     │
  │     ├── focusMode === 'easy'
  │     │     └── chrome.tabs.update(tabId, { url: 'soft-redirect.html?url=...' })
  │     │
  │     └── focusMode === 'strict'
  │           └── chrome.tabs.update(tabId, { url: 'blocked.html?url=...' })
  │
  └── Not on any list → ALLOW (do nothing)
```

### D. Intent Unlock (Strict Mode)

```
blocked.html loads
  │
  ▼
blocked.js
  │
  ├── Parse ?url= from query string
  ├── Display blocked URL
  ├── Start 15-second countdown
  │     │
  │     ▼ (countdown reaches 0)
  │
  ├── Enable "Unlock" button
  │
  ▼ User clicks "Unlock"
  │
blocked.js ──sendMessage({ type: 'request-unlock', domain })──► service-worker.js
  │                                                                    │
  │                                                     addTempUnlocked(domain)
  │                                                                    │
  ◄──────────── sendResponse({ unlocked: true }) ─────────────────────┘
  │
  ▼
window.location.href = originalUrl   // now allowed (temp unlocked)
```

### E. Easy Mode Soft Redirect

```
soft-redirect.html loads
  │
  ▼
soft-redirect.js
  │
  ├── Parse ?url= from query string
  ├── Display target URL
  │
  ├── User clicks "Stay Focused"
  │     └── history.back() or chrome.tabs.remove()
  │
  └── User clicks "Continue Anyway"
        │
        ▼
        sendMessage({ type: 'request-unlock', domain })──► service-worker.js
        │                                                         │
        │                                          addTempUnlocked(domain)
        │                                                         │
        ◄──────── sendResponse({ unlocked: true }) ──────────────┘
        │
        ▼
        window.location.href = originalUrl
```

---

## 7. Implementation Order (Suggested)

Build in this order to have a working demo at each step:

| Phase | Feature | Time Est. |
|---|---|---|
| 1 | Storage layer (`store.js`) + manifest + load extension | 1h |
| 2 | Passive Mode: Organize Tabs button | 1.5h |
| 3 | Workspace CRUD (create, list, select, delete) | 2h |
| 4 | Domain list management (add/remove blocked & allowed) | 1h |
| 5 | Workspace activation + Easy Mode blocking | 2h |
| 6 | Strict Mode + Intent Unlock countdown | 1.5h |
| 7 | Focus Timer (start/stop/display) | 1h |
| 8 | To-Do List per workspace | 1.5h |
| 9 | Styling & polish | 2h |

**Total: ~13.5 hours** — well within your 28h budget with buffer for debugging.

---

## 8. Key Design Decisions

- **No build step**: Plain JS, no bundler. Fast iteration, zero config.
- **ES modules**: `type="module"` in script tags lets us use `import/export` between files.
- **Storage-first**: Everything persists immediately. No in-memory state that can be lost.
- **Domain matching**: Simple `hostname` comparison. No regex or wildcards for MVP.
- **Temp unlocks**: Session-only array cleared on workspace deactivate. No permanent exceptions from block pages.
- **Timer in storage**: Survives service worker restarts. Popup computes display from `startTime + elapsed`.
