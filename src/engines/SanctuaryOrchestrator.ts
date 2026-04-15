/**
 * SanctuaryOrchestrator
 *
 * Unifies the four engines (Location, HRV, Audio, Notification) into a single
 * coordinator that runs background logic for the two highest-value automations:
 *
 * F-13: Mind Weather — "Golden Window" notification timing
 *   Fires a Mind Weather push notification when ALL of:
 *     1. User is in transit (isMoving = true)
 *     2. Next calendar event starts in 8–18 minutes ("golden window")
 *     3. No Sanctuary session is currently active (would be redundant)
 *     4. Notification hasn't been sent in the last 30 minutes (spam guard)
 *   This intersection makes the notification feel eerily well-timed rather
 *   than arbitrary, which is the core "魔術的UX" quality.
 *
 * F-14: Smart Mode Selector — in-session arrival transition
 *   During an active session, polls every 30s:
 *     • At 70% of route avgDurationMs → check next event type
 *     • Switch to the arrival-appropriate mode with AudioEngine smooth crossfade
 *     • Only transitions once per session (idempotent)
 *   Modes: gym/workout → 'activate', meeting/client/プレゼン → 'focus',
 *          evening/low HRV → 'calm' (stays)
 */

import { getNextEventTitle, buildMindWeatherPayload, selectMode } from './ContextEngine';
import { audioEngine } from './AudioEngine';
import { scheduleMindWeather } from './NotificationEngine';
import { useUNSStore } from '../store';
import { RouteProfile } from '../types';

// ─── F-13 constants ───────────────────────────────────────────────────────────
const MIND_WEATHER_CHECK_MS   = 5  * 60_000;  // poll every 5 min
const GOLDEN_WINDOW_MIN_MINS  = 8;             // event must be ≥ 8 min away
const GOLDEN_WINDOW_MAX_MINS  = 18;            // and ≤ 18 min away
const SPAM_GUARD_MS           = 30 * 60_000;   // max 1 notification per 30 min

// ─── F-14 constants ───────────────────────────────────────────────────────────
const MODE_CHECK_MS           = 30_000;        // poll every 30s
const TRANSITION_PROGRESS     = 0.70;          // trigger at 70% of avg route duration

class SanctuaryOrchestrator {
  private mindWeatherTimer:   ReturnType<typeof setInterval> | null = null;
  private modeTransitionTimer:ReturnType<typeof setInterval> | null = null;
  private lastNotificationAt  = 0;
  private modeTransitioned    = false;  // fire once per session

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

    // Guard: skip if not in transit, already in session, or spam guard active
    if (!store.isMoving) return;
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
  startModeTransition(routeProfile: RouteProfile | null): void {
    this.stopModeTransition();
    if (!routeProfile) return;
    this.modeTransitioned = false;

    this.modeTransitionTimer = setInterval(
      () => this.checkModeTransition(routeProfile),
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

  private async checkModeTransition(routeProfile: RouteProfile): Promise<void> {
    if (this.modeTransitioned) return; // only once per session

    const store = useUNSStore.getState();
    if (store.sessionStatus !== 'active' || !store.currentSession) return;

    const elapsed  = Date.now() - store.currentSession.startedAt;
    const progress = elapsed / routeProfile.avgDurationMs;
    if (progress < TRANSITION_PROGRESS) return;

    // At 70% of route → determine arrival mode from next event + current score
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
  start(activeRouteProfile: RouteProfile | null): void {
    this.startMindWeatherMonitor();
    this.startModeTransition(activeRouteProfile);
  }

  stop(): void {
    this.stopMindWeatherMonitor();
    this.stopModeTransition();
  }
}

export const sanctuaryOrchestrator = new SanctuaryOrchestrator();
