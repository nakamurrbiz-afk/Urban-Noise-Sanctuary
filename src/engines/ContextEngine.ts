/**
 * UNS Context Engine
 *
 * Responsibility:
 *  - Estimate condition trend from HRV (3-level fallback)
 *  - Compute Mind Weather notification payload
 *  - Read next calendar event for golden-window timing
 */

import * as Calendar from 'expo-calendar';
import { SanctuaryMode, ConditionTrend, NotificationPattern, MindWeatherPayload } from '../types';

// ─── Condition Scoring ──────────────────────────────────────────────────────
// HRV RMSSD reference ranges (rough population norms)
const HRV_BASELINE_GOOD = 50;   // ms: resting, healthy adult
const HRV_BASELINE_LOW  = 25;   // ms: stressed / fatigued

// Three-segment piecewise linear, fully continuous and monotonically increasing:
//   [0,  25] → [20, 50]   (low / fatigued)
//   [25, 50] → [50, 70]   (mid / recovering)
//   [50, ∞)  → [70, 100]  (good / healthy), capped at 100
export function scoreFromHRV(rmssd: number): number {
  if (rmssd >= HRV_BASELINE_GOOD) {
    return Math.min(100, 70 + Math.round((rmssd - HRV_BASELINE_GOOD) * 0.6));
  }
  if (rmssd <= HRV_BASELINE_LOW) {
    // Map [0, 25] → [20, 50]
    return Math.round(20 + (rmssd / HRV_BASELINE_LOW) * 30);
  }
  // Map [25, 50] → [50, 70]
  const ratio = (rmssd - HRV_BASELINE_LOW) / (HRV_BASELINE_GOOD - HRV_BASELINE_LOW);
  return Math.round(50 + ratio * 20);
}

// Estimate condition when HRV unavailable:
// Uses time-of-day + day-of-week heuristics + calendar density
export function estimateConditionScore(calendarEventCount: number): number {
  const h = new Date().getHours();
  const dow = new Date().getDay(); // 0=Sun

  // Morning baseline is higher, end-of-day lower
  const timeScore = h < 10 ? 70 : h < 14 ? 65 : h < 18 ? 55 : 50;

  // Heavier calendar = more cognitive load estimated
  const calPenalty = Math.min(20, calendarEventCount * 4);

  // Weekends default slightly higher
  const weekendBonus = dow === 0 || dow === 6 ? 8 : 0;

  return Math.max(20, Math.min(95, timeScore - calPenalty + weekendBonus));
}

// ─── Mode Selection ─────────────────────────────────────────────────────────
// Selects binaural mode from condition + next event type
export function selectMode(
  conditionScore: number,
  nextEventTitle: string | null,
  hourOfDay: number
): SanctuaryMode {
  const isEvening = hourOfDay >= 18;
  const isGym =
    nextEventTitle !== null &&
    /gym|ジム|筋トレ|workout|fitness|sports/i.test(nextEventTitle);

  if (isGym) return 'activate';
  if (isEvening || conditionScore < 45) return 'calm';
  if (conditionScore > 70) return 'focus';
  return 'calm';
}

// ─── Mind Weather Payload ───────────────────────────────────────────────────
// Key insight: notification is about the USER's state, not external traffic.
// This prevents "I already know it's crowded" fatigue.
export function buildMindWeatherPayload(
  conditionScore: number,
  weekOverWeek: ConditionTrend['weekOverWeek'],
  nextEventTitle: string | null
): MindWeatherPayload {
  const now = Date.now();
  let pattern: NotificationPattern;
  let message: string;
  let subMessage: string;

  if (conditionScore < 50 || weekOverWeek === 'worse') {
    pattern = 'fatigue';
    message = '昨日より少し、脳が重い朝です。';
    subMessage = '今日の移動時間、自分に使いませんか？';
  } else if (nextEventTitle && /presentation|プレゼン|meeting|重要|client/i.test(nextEventTitle)) {
    pattern = 'important_event';
    message = '重要な予定があります。';
    subMessage = '移動中にFocusモードでギアを入れておきませんか？';
  } else if (conditionScore > 75 && weekOverWeek === 'better') {
    pattern = 'good_condition';
    message = '今日のコンディションは良好です。';
    subMessage = 'この状態をキープしたまま目的地に着きませんか？';
  } else {
    pattern = 'default';
    message = '今日も移動時間があります。';
    subMessage = 'この数分間、あなただけの聖域にしませんか？';
  }

  return { pattern, message, subMessage, scheduledFor: now };
}

// ─── Calendar Read ──────────────────────────────────────────────────────────
export async function getNextEventTitle(): Promise<{
  title: string | null;
  count: number;
  minutesUntilStart: number | null;
}> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return { title: null, count: 0, minutesUntilStart: null };

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const now = new Date();
    const endWindow = new Date(now.getTime() + 4 * 60 * 60 * 1000); // next 4h

    const events = await Calendar.getEventsAsync(
      calendars.map((c) => c.id),
      now,
      endWindow
    );

    const next = events[0];
    const minutesUntilStart = next?.startDate
      ? Math.round((new Date(next.startDate).getTime() - now.getTime()) / 60_000)
      : null;

    return {
      title: next?.title ?? null,
      count: events.length,
      minutesUntilStart,
    };
  } catch {
    return { title: null, count: 0, minutesUntilStart: null };
  }
}
