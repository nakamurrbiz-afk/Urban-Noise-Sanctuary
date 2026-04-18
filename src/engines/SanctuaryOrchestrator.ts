/**
 * SanctuaryOrchestrator
 *
 * Unifies the HRV, Audio, and Notification engines into a single coordinator
 * running background logic for two automations:
 *
 * F-13: Mind Weather — "Golden Window" notification timing
 *   Fires a Mind Weather push notification when ALL of:
 *     1. Next calendar event starts in 8–18 minutes ("golden window")
 *     2. No Sanctuary session is currently active (would be redundant)
 *     3. Notification hasn't been sent in the last 30 minutes (spam guard)
 *   This intersection makes the notification feel eerily well-timed rather
 *   than arbitrary, which is the core "魔術的UX" quality.
 *
 * F-14: Smart Mode Selector — in-session arrival transition
 *   During an active session, polls every 30s.
 *   After DEFAULT_COMMUTE_MS × 70% has elapsed, checks the next event type
 *   and switches to the arrival-appropriate mode with a smooth crossfade.
 *   Only transitions once per session (idempotent).
 *   Modes: gym/workout → 'activate', meeting/client/プレゼン → 'focus',
 *          evening/low HRV → 'calm' (stays)
 */

import { getNextEventTitle, buildMindWeatherPayload, selectMode } from './ContextEngine';
import { audioEngine } from './AudioEngine';
import { scheduleMindWeather } from './NotificationEngine';
import { useUNSStore } from '../store';

// ─── F-13 constants ───────────────────────────────────────────────────────────
const MIND_WEATHER_CHECK_MS   = 5  * 60_000;  // poll every 5 min
const GOLDEN_WINDOW_MIN_MINS  = 8;             // event must be ≥ 8 min away
const GOLDEN_WINDOW_MAX_MINS  = 18;            // and ≤ 18 min away
const SPAM_GUARD_MS           = 30 * 60_000;   // max 1 notification per 30 min

// ─── F-14 constants ───────────────────────────────────────────────────────────
const MODE_CHECK_MS           = 30_000;        // poll every 30s
const TRANSITION_PROGRESS     = 0.70;          // trigger at 70% of session duration
// Default commute estimate used when no route profile is available.
// At 70% → ~17.5 min — appropriate for an average urban transit session.
const DEFAULT_COMMUTE_MS      = 25 * 60_000;   // 25 minutes

class SanctuaryOrchestrator {
  private mindWeatherTimer:    ReturnType<typeof setInterval> | null = null;
  private modeTransitionTimer: ReturnType<typeof setInterval> | null = null;
  private lastNotificationAt   = 0;
  private modeTransitioned     = false;  // fire once per session

  // ─── F-13: Mind Weather orchestrator ─────────────────────────────────────────
  startMindWeatherMonitor(): void {
    if (this.mindWeatherTimer) return;
    this.checkMindWeather(); // immediate first check
    this.mindWeatherTimer = setInterval(
      () => this.checkMindWeather(),
      MIND_WEATHER_CHECK_MS,
    );
  }

  stopMindWeatherMonitor(): void {
    if (this.mindWeatherTimer) {
      clearInterval(this.mindWeatherTimer);
      this.mindWeatherTimer = null;
    }
  }

  private async checkMindWeather(): Promise<void> {
    const store = useUNSStore.getState();

    // Guard: skip if already in session or spam guard active
    if (store.sessionStatus === 'active') return;
    if (Date.now() - this.lastNotificationAt < SPAM_GUARD_MS) return;

    const { title, minutesUntilStart, count } = await getNextEventTitle();

    // Guard: event must be within the golden window
    if (
      minutesUntilStart === null ||
      minutesUntilStart < GOLDEN_WINDOW_MIN_MINS ||
      minutesUntilStart > GOLDEN_WINDOW_MAX_MINS
    ) return;

    const trend   = store.conditionTrend;
    const payload = buildMindWeatherPayload(trend.score, trend.weekOverWeek, title);

    // Schedule 0-delay (immediate) — the golden window IS now
    await scheduleMindWeather(payload, 0).catch(() => {});
    this.lastNotificationAt = Date.now();
  }

  // ─── F-14: Smart Mode Selector ───────────────────────────────────────────────
  startModeTransition(): void {
    this.stopModeTransition();
    this.modeTransitioned = false;

    this.modeTransitionTimer = setInterval(
      () => this.checkModeTransition(),
      MODE_CHECK_MS,
    );
  }

  stopModeTransition(): void {
    if (this.modeTransitionTimer) {
      clearInterval(this.modeTransitionTimer);
      this.modeTransitionTimer = null;
    }
    this.modeTransitioned = false;
  }

  private async checkModeTransition(): Promise<void> {
    if (this.modeTransitioned) return; // only once per session

    const store = useUNSStore.getState();
    if (store.sessionStatus !== 'active' || !store.currentSession) return;

    const elapsed  = Date.now() - store.currentSession.startedAt;
    const progress = elapsed / DEFAULT_COMMUTE_MS;
    if (progress < TRANSITION_PROGRESS) return;

    // At 70% of default commute duration → determine arrival mode
    const { title } = await getNextEventTitle().catch(() => ({
      title: null, count: 0, minutesUntilStart: null,
    }));
    const hour        = new Date().getHours();
    const arrivalMode = selectMode(store.conditionTrend.score, title, hour);

    if (arrivalMode !== store.currentMode) {
      store.setCurrentMode(arrivalMode);
      // 60-second sigmoid crossfade — imperceptible in real time,
      // but the user arrives at the destination "already in the right state"
      audioEngine.smoothTransition(arrivalMode, 60_000); // fire-and-forget
    }

    this.modeTransitioned = true; // prevent re-triggering within same session
  }

  // ─── Full lifecycle ───────────────────────────────────────────────────────────
  start(): void {
    this.startMindWeatherMonitor();
    this.startModeTransition();
  }

  stop(): void {
    this.stopMindWeatherMonitor();
    this.stopModeTransition();
  }
}

export const sanctuaryOrchestrator = new SanctuaryOrchestrator();
