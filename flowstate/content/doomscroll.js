/**
 * doomscroll.js — FlowState YouTube Doomscroll Detection Content Script
 *
 * ⚠️  HARD RULE: This script NEVER blocks full youtube.com.
 *     Blocking only applies to /shorts/ (full tracking) and optionally
 *     /watch when content is classified as Entertainment (lighter tracking).
 *
 * Routes handled:
 *   /shorts/*             → full behavioral tracking (VideoSwitches + Scrolls + Time)
 *   /watch (Study Mode)   → AI classifies; Educational/Work → skip, Entertainment → light track
 *   /search, /playlist, / → always ignored, no tracking started
 *
 * AI role: adjusts sensitivity thresholds ONLY. Never directly blocks.
 *
 * Doom score formula (recalculated every 3 seconds):
 *   doomScore = (timeSpent / 30) * 0.3 + (videoSwitchCount * 0.4) + (scrollCount / 20) * 0.3
 */

'use strict';

// ── Configuration ─────────────────────────────────────────────────────────────
const SCORE_INTERVAL_MS = 3000;   // Recalculate every 3 seconds
const INACTIVITY_RESET_MS = 15000;  // Reset after 15s of no interaction
const BASE_TIME_WINDOW = 30;     // Scoring base window (seconds)
const BURST_WINDOW_MS = 2000;   // Burst scroll detection window

// Base thresholds — scaled by AI multiplier
const BASE = {
    timeTrigger: 30,   // seconds
    videoSwitchTrigger: 3,
    scrollTrigger: 5,
    doomScoreHigh: 1.0,
};

// ── State ─────────────────────────────────────────────────────────────────────
let _state = {
    urlType: 'other',   // 'shorts' | 'watch' | 'other'
    active: false,
    startTime: null,
    timeSpent: 0,
    videoSwitchCount: 0,
    scrollCount: 0,
    doomScore: 0,
    lastInteractionTime: Date.now(),
    lastScrollTime: 0,
    burstScrollCount: 0,
    interactionBurst: false,
    thresholdMultiplier: 1.0,       // Adjusted by AI classification
    intervalId: null,
    mutationObserver: null,
    triggered: false,     // Prevent multiple triggers per session
};

// ── URL type detection ─────────────────────────────────────────────────────────

function getUrlType(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        if (!host.includes('youtube.com')) return 'other';
        if (u.pathname.startsWith('/shorts/')) return 'shorts';
        if (u.pathname.startsWith('/watch')) return 'watch';
        return 'other'; // homepage, search, playlist — never tracked
    } catch { return 'other'; }
}

// ── Threshold helpers ─────────────────────────────────────────────────────────

function thr(base) { return base * _state.thresholdMultiplier; }

function calcDoomScore() {
    return (
        (_state.timeSpent / BASE_TIME_WINDOW) * 0.3 +
        (_state.videoSwitchCount * 0.4) +
        (_state.scrollCount / 20) * 0.3
    );
}

function extractVideoId(url) {
    const m = url.match(/\/shorts\/([^/?&#]+)/) || url.match(/[?&]v=([^&]+)/);
    return m ? m[1] : null;
}

// ── Activation ────────────────────────────────────────────────────────────────

function activateTracking(urlType) {
    // Deactivate if switching URL type
    if (_state.active && _state.urlType !== urlType) deactivateTracking();
    if (_state.active) return;

    _state.urlType = urlType;
    _state.active = true;
    _state.startTime = Date.now();
    _state.timeSpent = 0;
    _state.videoSwitchCount = 0;
    _state.scrollCount = 0;
    _state.doomScore = 0;
    _state.triggered = false;
    _state.lastInteractionTime = Date.now();
    // Watch pages start with 30% more lenient thresholds
    _state.thresholdMultiplier = urlType === 'watch' ? 1.30 : 1.0;

    console.log('[FlowState Doomscroll] Tracking activated:', urlType);

    // Video switch detection only makes sense on Shorts
    if (urlType === 'shorts') _observeVideoSwitches();

    // Score recalculation tick
    _state.intervalId = setInterval(_tick, SCORE_INTERVAL_MS);

    // Request AI classification — adjusts multiplier only, never blocks
    _sendToBackground(
        { type: 'doomscroll-classify', title: document.title || '', url: location.href, urlType },
        (res) => {
            if (!res) return;
            if (typeof res.multiplier === 'number') {
                _state.thresholdMultiplier = res.multiplier;
                console.log('[FlowState Doomscroll] AI multiplier:', res.multiplier.toFixed(2), '| category:', res.category);
            }
            // Watch pages: if Educational or Work-related, no tracking needed
            if (urlType === 'watch' && res.category) {
                if (res.category === 'educational content' || res.category === 'work related') {
                    console.log('[FlowState Doomscroll] Watch page is', res.category, '— deactivating');
                    deactivateTracking();
                }
            }
        }
    );
}

function deactivateTracking() {
    if (!_state.active) return;

    _state.active = false;
    clearInterval(_state.intervalId);
    _state.intervalId = null;

    if (_state.mutationObserver) {
        _state.mutationObserver.disconnect();
        _state.mutationObserver = null;
    }

    _state.timeSpent = 0;
    _state.videoSwitchCount = 0;
    _state.scrollCount = 0;
    _state.doomScore = 0;
    _state.triggered = false;
    _state.interactionBurst = false;

    console.log('[FlowState Doomscroll] Tracking deactivated');
}

// ── Score tick (every 3 seconds) ──────────────────────────────────────────────

function _tick() {
    if (!_state.active || _state.triggered) return;

    // Inactivity reset
    if (Date.now() - _state.lastInteractionTime > INACTIVITY_RESET_MS) {
        console.log('[FlowState Doomscroll] Inactivity reset');
        deactivateTracking();
        return;
    }

    _state.timeSpent = (Date.now() - _state.startTime) / 1000;
    _state.doomScore = calcDoomScore();

    console.log('[FlowState Doomscroll] tick:', {
        type: _state.urlType,
        t: `${Math.round(_state.timeSpent)}s`,
        sw: _state.videoSwitchCount,
        sc: _state.scrollCount,
        score: _state.doomScore.toFixed(2),
        mult: _state.thresholdMultiplier.toFixed(2),
    });

    // ── Early trigger: unambiguous doom pattern ──────────────────────────
    // Fires before score accumulates, preventing passive time bypass.
    if (
        _state.timeSpent >= thr(BASE.timeTrigger) &&
        (_state.videoSwitchCount >= thr(BASE.videoSwitchTrigger) ||
            _state.scrollCount >= thr(BASE.scrollTrigger))
    ) {
        console.log('[FlowState Doomscroll] Early trigger');
        _trigger('early');
        return;
    }

    // ── Score threshold trigger ───────────────────────────────────────────
    if (_state.doomScore >= thr(BASE.doomScoreHigh)) {
        console.log('[FlowState Doomscroll] Score trigger:', _state.doomScore.toFixed(2));
        _trigger('score');
    }
}

// ── Escalation trigger ────────────────────────────────────────────────────────

function _trigger(reason) {
    if (_state.triggered) return;
    _state.triggered = true;

    _sendToBackground({
        type: 'doomscroll-trigger',
        url: location.href,
        urlType: _state.urlType,
        trigger: reason,
        metrics: {
            timeSpent: Math.round(_state.timeSpent),
            videoSwitchCount: _state.videoSwitchCount,
            scrollCount: _state.scrollCount,
            doomScore: parseFloat(_state.doomScore.toFixed(4)),
            interactionBurst: _state.interactionBurst,
        },
    }, (res) => {
        if (chrome.runtime.lastError) return;
        // softReset: background showed a warning overlay, allow re-trigger after 10s
        if (res?.softReset) setTimeout(() => { _state.triggered = false; }, 10000);
    });
}

// ── MutationObserver: Shorts video switch detection ───────────────────────────

function _observeVideoSwitches() {
    let lastId = extractVideoId(location.href);

    _state.mutationObserver = new MutationObserver(() => {
        const current = extractVideoId(location.href);
        if (current && current !== lastId) {
            lastId = current;
            _state.videoSwitchCount++;
            _state.lastInteractionTime = Date.now();
            console.log('[FlowState Doomscroll] Video switch #', _state.videoSwitchCount);
        }
    });

    _state.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
    });
}

// ── Scroll tracking ───────────────────────────────────────────────────────────

function _onWheel() {
    if (!_state.active) return;
    _state.scrollCount++;
    _state.lastInteractionTime = Date.now();

    const now = Date.now();
    if (now - _state.lastScrollTime < BURST_WINDOW_MS) {
        _state.burstScrollCount++;
        if (_state.burstScrollCount >= 3) _state.interactionBurst = true;
    } else {
        _state.burstScrollCount = 1;
        _state.interactionBurst = false;
    }
    _state.lastScrollTime = now;
}

// ── Background messaging ──────────────────────────────────────────────────────

function _sendToBackground(payload, callback) {
    try {
        chrome.runtime.sendMessage(payload, (res) => {
            if (chrome.runtime.lastError) return; // extension reload / inactive
            if (callback) callback(res);
        });
    } catch (_) { /* runtime not ready */ }
}

// ── SPA navigation detection ──────────────────────────────────────────────────

let _lastHref = location.href;

function _checkUrlChange() {
    const current = location.href;
    if (current === _lastHref) return;
    _lastHref = current;
    _handleNavigation(current);
}

function _handleNavigation(url) {
    const urlType = getUrlType(url);

    if (urlType === 'shorts') {
        // Full behavioral tracking — always, regardless of content
        activateTracking('shorts');

    } else if (urlType === 'watch') {
        // For watch pages: start tracking, AI classification will deactivate
        // if content is Educational or Work-related.
        // NEVER auto-block. Only escalate if behavioral pattern triggers AND
        // AI confirmed the content is Entertainment/Social.
        activateTracking('watch');

    } else {
        // Homepage, search results, playlists, channel pages — never track
        deactivateTracking();
    }
}

// YouTube fires these on SPA navigations
document.addEventListener('yt-navigate-finish', _checkUrlChange);
document.addEventListener('yt-page-data-updated', _checkUrlChange);

// Fallback poll — YouTube occasionally skips custom events
setInterval(_checkUrlChange, 1000);

// ── Tab visibility ────────────────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // User switched away from the tab — reset per spec
        if (_state.active) deactivateTracking();
    } else {
        // Tab came back into view
        _handleNavigation(location.href);
    }
});

// ── Event listeners ───────────────────────────────────────────────────────────

// passive:true = no scroll delay, no jank
window.addEventListener('wheel', _onWheel, { passive: true });

// ── Bootstrap ─────────────────────────────────────────────────────────────────
_handleNavigation(location.href);
