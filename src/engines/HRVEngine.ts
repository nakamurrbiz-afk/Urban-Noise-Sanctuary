/**
 * HRVEngine — 3-level condition data hierarchy
 *
 * Level 1 (real):      HealthKit RMSSD from Apple Watch (< 4h old)
 * Level 2 (estimated): Calendar density + time-of-day heuristic
 * Level 3 (none):      Conservative baseline score (70)
 *
 * HealthKit bridge: NativeModules.UNSHealthKit
 *   This is a custom native module (Phase 2 deliverable).
 *   It wraps HKHealthStore queries for HeartRateVariabilitySDNN samples.
 *   Apple Watch records RMSSD under this identifier despite the SDNN name.
 *
 *   When the module is absent (Expo Go, no native build), isAvailable
 *   returns false and the engine silently falls through to Level 2/3.
 *   No errors are thrown — the app is fully functional without HealthKit.
 *
 * Week-over-week trend:
 *   Compares the mean RMSSD of the last 3 days vs. the prior 4 days.
 *   Δ > +3ms → 'better', Δ < -3ms → 'worse', else → 'same'.
 *   Threshold is intentionally wide to avoid spurious trend flip-flops.
 */

import { NativeModules, Platform } from 'react-native';
import { scoreFromHRV, estimateConditionScore } from './ContextEngine';
import { ConditionTrend, HRVDataLevel, HRVReading } from '../types';
import { useUNSStore } from '../store';

// ─── HealthKit native bridge type ────────────────────────────────────────────
interface UNSHealthKitBridge {
  isHealthDataAvailable(): boolean;
  requestPermissions(types: string[]): Promise<boolean>;
  getLatestHRVSample(): Promise<{ rmssd: number; recordedAt: number } | null>;
  getHRVSamples(options: {
    startDate: string;
    endDate: string;
    limit: number;
  }): Promise<Array<{ rmssd: number; recordedAt: number }>>;
}

const HealthKitBridge = NativeModules.UNSHealthKit as UNSHealthKitBridge | undefined;

// ─── Constants ────────────────────────────────────────────────────────────────
// Apple Watch measures HRV automatically every few hours.
// "Fresh"   = < 1h ago  → real data, high confidence
// "Stale"   = 1–4h ago  → usable but show Watch measurement prompt
// "Expired" = > 4h ago  → fall back to heuristic
const HRV_FRESH_MS      = 1  * 60 * 60 * 1000;  // 1h
const HRV_STALE_MS      = 4  * 60 * 60 * 1000;  // 4h
const WEEK_WINDOW_MS    = 7  * 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS  = 3  * 24 * 60 * 60 * 1000;  // "last 3 days"
const TREND_DELTA_MS    = 3;                           // ms RMSSD to qualify as a trend
const CACHE_TTL_MS      = 5  * 60 * 1000;             // 5-min read cache
const HEALTHKIT_TYPE    = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const BASELINE_SCORE    = 70;                          // Level 3 fallback

class HRVEngine {
  private permissionsGranted = false;
  private cachedSample: { rmssd: number; recordedAt: number } | null = null;
  private cacheTimestamp = 0;

  // ─── Availability ─────────────────────────────────────────────────────────
  get isAvailable(): boolean {
    return (
      Platform.OS === 'ios' &&
      typeof HealthKitBridge?.isHealthDataAvailable === 'function' &&
      HealthKitBridge.isHealthDataAvailable()
    );
  }

  // ─── Permissions ──────────────────────────────────────────────────────────
  async requestPermissions(): Promise<boolean> {
    if (!this.isAvailable) return false;
    try {
      this.permissionsGranted = await HealthKitBridge!.requestPermissions([
        HEALTHKIT_TYPE,
      ]);
      return this.permissionsGranted;
    } catch {
      return false;
    }
  }

  // ─── Latest sample (cached) ───────────────────────────────────────────────
  async getLatestSample(): Promise<{ rmssd: number; recordedAt: number } | null> {
    if (!this.isAvailable || !this.permissionsGranted) return null;

    const now = Date.now();
    if (this.cachedSample && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedSample;
    }

    try {
      const result = await HealthKitBridge!.getLatestHRVSample();
      this.cachedSample = result;
      this.cacheTimestamp = now;
      return result;
    } catch {
      return null;
    }
  }

  // ─── Week-over-week trend ─────────────────────────────────────────────────
  async getWeekOverWeekTrend(): Promise<ConditionTrend['weekOverWeek']> {
    if (!this.isAvailable || !this.permissionsGranted) return 'same';
    try {
      const samples = await HealthKitBridge!.getHRVSamples({
        startDate: new Date(Date.now() - WEEK_WINDOW_MS).toISOString(),
        endDate: new Date().toISOString(),
        limit: 50,
      });
      if (samples.length < 4) return 'same';

      const cutoff = Date.now() - RECENT_WINDOW_MS;
      const recent = samples.filter((s) => s.recordedAt >= cutoff);
      const prior  = samples.filter((s) => s.recordedAt  < cutoff);
      if (!recent.length || !prior.length) return 'same';

      const mean = (arr: typeof samples) =>
        arr.reduce((s, x) => s + x.rmssd, 0) / arr.length;

      const delta = mean(recent) - mean(prior);
      if (delta >  TREND_DELTA_MS) return 'better';
      if (delta < -TREND_DELTA_MS) return 'worse';
      return 'same';
    } catch {
      return 'same';
    }
  }

  // ─── Build ConditionTrend with 3-level fallback ───────────────────────────
  async buildConditionTrend(calendarEventCount: number): Promise<ConditionTrend> {
    const now = Date.now();

    // Level 1 — real HealthKit data
    const latest = await this.getLatestSample();
    const isRecent = !!latest && (now - latest.recordedAt) < HRV_STALE_MS;

    if (isRecent && latest) {
      const weekOverWeek = await this.getWeekOverWeekTrend();
      const reading: HRVReading = {
        timestamp: latest.recordedAt,
        rmssd: latest.rmssd,
        source: 'healthkit',
      };
      useUNSStore.getState().addHRVReading(reading);

      return {
        level: 'real' as HRVDataLevel,
        score: scoreFromHRV(latest.rmssd),
        weekOverWeek,
        lastUpdated: now,
      };
    }

    // Level 2 — calendar + time-of-day heuristic
    if (calendarEventCount >= 0) {
      return {
        level: 'estimated' as HRVDataLevel,
        score: estimateConditionScore(calendarEventCount),
        weekOverWeek: 'same',
        lastUpdated: now,
      };
    }

    // Level 3 — conservative baseline
    return {
      level: 'none' as HRVDataLevel,
      score: BASELINE_SCORE,
      weekOverWeek: 'same',
      lastUpdated: now,
    };
  }

  // ─── Sync trend to store ──────────────────────────────────────────────────
  // Called at app foreground and before each session start.
  async refresh(calendarEventCount: number): Promise<void> {
    const trend = await this.buildConditionTrend(calendarEventCount);
    useUNSStore.getState().updateConditionTrend(trend);
  }

  // ─── Staleness flag for UI ────────────────────────────────────────────────
  // isDataStale = true means the data is real HealthKit data but > 1 hour old.
  // SanctuaryScreen uses this to show a "Watchで計測を" soft prompt.
  // Does NOT block session start — it's an invitation, never a gate.
  get isDataStale(): boolean {
    if (!this.cachedSample) return false; // no data = 'none', not 'stale'
    const age = Date.now() - this.cachedSample.recordedAt;
    return age > HRV_FRESH_MS && age <= HRV_STALE_MS;
  }

  // staleness in minutes (for display: "XX分前の計測")
  get stalenessMins(): number | null {
    if (!this.cachedSample) return null;
    return Math.round((Date.now() - this.cachedSample.recordedAt) / 60_000);
  }

  // lastMeasuredAt: SanctuaryScreen compares this before/after the user
  // returns from Health app to detect a fresh Watch measurement.
  get lastMeasuredAt(): number | null {
    return this.cachedSample?.recordedAt ?? null;
  }

}

export const hrvEngine = new HRVEngine();
