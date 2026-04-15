/**
 * UNS Context Engine
 *
 * Responsibility:
 *  - Detect transit movement via location velocity
 *  - Estimate condition trend from HRV (3-level fallback)
 *  - Compute Mind Weather notification payload
 *  - Learn Route DNA from repeated movement patterns
 */

import * as Location from 'expo-location';
import * as Calendar from 'expo-calendar';
import { SanctuaryMode, ConditionTrend, NotificationPattern, MindWeatherPayload, RouteProfile } from '../types';

// Transit detection: >15 km/h sustained for 30s = train/bus movement
const TRANSIT_SPEED_MS = 15 / 3.6;  // m/s
const TRANSIT_CONFIRM_MS = 30_000;

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

// ─── Route DNA Learning ─────────────────────────────────────────────────────

// A route is "recognized" once it has been observed this many times
export const ROUTE_RECOGNITION_THRESHOLD = 3;

export interface MovementSample {
  timestamp: number;
  latitude: number;
  longitude: number;
  speed: number;          // m/s
}

// Bucket key: groups profiles by speed tier + spike flag for deduplication
function routeBucketKey(lineName: string, hasSpikes: boolean): string {
  return `${lineName}|${hasSpikes}`;
}

export class RouteDNALearner {
  private samples: MovementSample[] = [];
  private transitStartTime: number | null = null;

  // Aggregated profiles keyed by bucket — merges repeated sessions
  private profileBuckets: Map<string, RouteProfile> = new Map();

  addSample(sample: MovementSample): { transitStarted?: boolean; transitEnded?: RouteProfile; recognized?: RouteProfile } {
    this.samples.push(sample);
    if (this.samples.length > 500) this.samples.shift();

    const isTransitSpeed = sample.speed > TRANSIT_SPEED_MS;

    if (isTransitSpeed && this.transitStartTime === null) {
      this.transitStartTime = sample.timestamp;
      return { transitStarted: true };
    }

    if (!isTransitSpeed && this.transitStartTime !== null) {
      const duration = sample.timestamp - this.transitStartTime;
      const startTime = this.transitStartTime;
      this.transitStartTime = null;                          // reset before buildProfile

      if (duration > TRANSIT_CONFIRM_MS) {
        const profile = this.buildProfile(duration, sample, startTime);
        const merged = this.mergeProfile(profile);
        const recognized = merged.sessionCount === ROUTE_RECOGNITION_THRESHOLD ? merged : undefined;
        return { transitEnded: merged, recognized };
      }
    }

    return {};
  }

  private buildProfile(durationMs: number, _endSample: MovementSample, startTime: number): RouteProfile {
    const transitSamples = this.samples.filter((s) => s.timestamp >= startTime);
    const avgSpeed =
      transitSamples.reduce((sum, s) => sum + s.speed, 0) / (transitSamples.length || 1);

    const speedVariance = this.computeSpeedVariance(transitSamples);
    const hasHighFreqSpikes = speedVariance > 2;
    const lineName = this.inferLineName(avgSpeed);

    return {
      id: routeBucketKey(lineName, hasHighFreqSpikes),
      lineName,
      fromStation: '起点',
      toStation: '終点',
      avgDurationMs: durationMs,
      noiseProfile: {
        lowFreqIntensity: Math.min(1, avgSpeed / 30),
        highFreqSpikes: hasHighFreqSpikes,
        avgDecibels: 65 + avgSpeed * 0.5,
      },
      detectedAt: Date.now(),
      sessionCount: 1,
    };
  }

  // Upsert: increment sessionCount and update avgDurationMs on existing bucket
  private mergeProfile(profile: RouteProfile): RouteProfile {
    const key = profile.id;
    const existing = this.profileBuckets.get(key);
    if (existing) {
      const merged: RouteProfile = {
        ...existing,
        sessionCount: existing.sessionCount + 1,
        avgDurationMs: Math.round((existing.avgDurationMs + profile.avgDurationMs) / 2),
        detectedAt: profile.detectedAt,
      };
      this.profileBuckets.set(key, merged);
      return merged;
    }
    this.profileBuckets.set(key, profile);
    return profile;
  }

  private computeSpeedVariance(samples: MovementSample[]): number {
    if (samples.length < 2) return 0;
    const mean = samples.reduce((s, x) => s + x.speed, 0) / samples.length;
    return samples.reduce((s, x) => s + Math.pow(x.speed - mean, 2), 0) / samples.length;
  }

  // Speed-based line inference (location-based refinement is Phase 2)
  private inferLineName(avgSpeedMs: number): string {
    const kmh = avgSpeedMs * 3.6;
    if (kmh < 20) return '地下鉄（低速）';  // 大江戸線など深層地下鉄
    if (kmh < 40) return '地下鉄';
    if (kmh < 60) return '電車';
    return '特急・快速';
  }

  // Returns profiles that have reached recognition threshold
  getLearnedRoutes(): RouteProfile[] {
    return Array.from(this.profileBuckets.values())
      .filter((p) => p.sessionCount >= ROUTE_RECOGNITION_THRESHOLD)
      .sort((a, b) => b.sessionCount - a.sessionCount);
  }

  // Returns true once any route is recognized
  hasRecognizedRoute(): boolean {
    return this.getLearnedRoutes().length > 0;
  }

  // Total sessions processed (for progress reporting)
  getTotalSessionCount(): number {
    return Array.from(this.profileBuckets.values())
      .reduce((sum, p) => sum + p.sessionCount, 0);
  }

  // Returns true while a transit session is in progress
  isInTransit(): boolean {
    return this.transitStartTime !== null;
  }

  // For testing only
  _getProfileBuckets(): Map<string, RouteProfile> {
    return this.profileBuckets;
  }
}

// ─── Location Permission ────────────────────────────────────────────────────
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
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
