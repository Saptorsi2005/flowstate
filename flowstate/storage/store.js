/**
 * store.js — Chrome Storage wrapper & data model
 *
 * Data shape in chrome.storage.local:
 * {
 *   workspaces:           { [id]: WorkspaceObject },
 *   activeWorkspaceId:    string | null,
 *   timer:                { startTime, elapsed, running },
 *   tempUnlockedDomains:  [{ domain, tabId }],
 *   unlockCountdowns:     { [tabId]: { url, domain, startedAt, duration } }
 * }
 */

const DEFAULT_STATE = {
  workspaces: {},
  activeWorkspaceId: null,
  timer: { startTime: null, elapsed: 0, running: false },
  tempUnlockedDomains: [],
  unlockCountdowns: {},
  hfApiKey: null,
  aiEnabled: false,
  aiEscalationLevels: {}, // { domain: { level: 1-4, lastVisit: timestamp } }
  aiTempBlocks: {}, // { domain: { blockedUntil: timestamp } }
  aiTestResult: null, // Persisted test result HTML
};

export async function getState() {
  const data = await chrome.storage.local.get(null);
  return { ...DEFAULT_STATE, ...data };
}

export async function setState(partial) {
  await chrome.storage.local.set(partial);
}

export async function getWorkspaces() {
  const { workspaces } = await getState();
  return workspaces || {};
}

export async function getWorkspace(id) {
  const wss = await getWorkspaces();
  return wss[id] || null;
}

export async function saveWorkspace(ws) {
  const wss = await getWorkspaces();
  wss[ws.id] = ws;
  await setState({ workspaces: wss });
}

export async function deleteWorkspace(id) {
  const wss = await getWorkspaces();
  delete wss[id];
  const updates = { workspaces: wss };
  const { activeWorkspaceId } = await getState();
  if (activeWorkspaceId === id) {
    updates.activeWorkspaceId = null;
    updates.timer = DEFAULT_STATE.timer;
    updates.tempUnlockedDomains = [];
  }
  await setState(updates);
}

export async function setActiveWorkspaceId(id) {
  await setState({ activeWorkspaceId: id });
}

export function createWorkspace(name) {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    focusMode: 'easy',
    blockedDomains: [],
    allowedDomains: [],
    blockedGroupNames: [],
    blockedGroupDomains: {},
    allowedGroupNames: [],
    savedTabs: [],
    todos: []
  };
}

export async function saveApiKey(key) {
  await setState({ hfApiKey: key || null });
}

export async function getApiKey() {
  const { hfApiKey } = await getState();
  return hfApiKey || null;
}

export async function setAiEnabled(enabled) {
  await setState({ aiEnabled: !!enabled });

  // When disabling AI, clear all AI-related temporary data
  if (!enabled) {
    await setState({
      aiEscalationLevels: {},
      aiTempBlocks: {}
    });
  }
}
