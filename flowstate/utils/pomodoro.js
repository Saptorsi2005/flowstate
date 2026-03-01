/**
 * pomodoro.js — Shared Pomodoro constants & state helpers
 *
 * Used by both service-worker.js (business logic) and popup.js (UI rendering).
 * Pure constants + pure helpers — no Chrome API calls here.
 */

// ── Phase durations ──────────────────────────────────────────────
export const WORK_MS = 30 * 1000;   // 30 seconds (test)
export const BREAK_MS = 30 * 1000;  // 30 seconds (test)
export const WARN_MS = 10 * 1000;   // 10 seconds warning (test)

// ── Alarm names (must be globally unique within the extension) ───
export const ALARM_WORK_END = 'fs-pomodoro-work-end';
export const ALARM_BREAK_END = 'fs-pomodoro-break-end';
export const ALARM_BREAK_WARN = 'fs-pomodoro-break-warn';

// ── Default state written to chrome.storage.local ───────────────
export const DEFAULT_POMODORO = {
  isRunning: false,   // timer actively counting down
  isPaused: false,   // explicitly paused mid-phase
  phase: 'work',  // 'work' | 'break'
  endTime: 0,       // absolute ms timestamp when phase expires
  pausedRemaining: 0,       // ms remaining when paused (used for resume)
  selectedMode: 'easy',  // 'easy' | 'strict' — mirrors workspace focusMode
  sessionCount: 0,       // # completed work sessions this activation
  workMs: 25 * 60 * 1000,  // work phase duration in ms (default 25 min)
  breakMs: 5 * 60 * 1000,  // break phase duration in ms (default 5 min)
};

// ── Pure helpers ─────────────────────────────────────────────────

/**
 * Format milliseconds as MM:SS (no hours — Pomodoro never exceeds 60 min).
 * @param {number} ms
 * @returns {string}
 */
export function formatPomodoroTime(ms) {
  if (!ms || ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);  // ceil so we show :01 not :00 prematurely
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Compute the SVG arc progress (0–1) for the current phase.
 * @param {number} remaining  ms remaining
 * @param {'work'|'break'} phase
 * @param {number} workMs  work phase duration in ms
 * @param {number} breakMs  break phase duration in ms
 * @returns {number} 0 = empty arc (expired), 1 = full arc (just started)
 */
export function arcProgress(remaining, phase, workMs, breakMs) {
  const total = phase === 'work' ? workMs : breakMs;
  if (!total) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}
