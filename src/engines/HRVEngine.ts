/**
 * HRVEngine — 3-level condition data hierarchy
 *
 * Level 1 (real):      HealthKit RMSSD from Apple Watch (< 4h old)
 * Level 2 (estimated): Calendar density + time-of-day heuristic
 * Level 3 (none):      Conservative baseline score (70)
 *
 * HealthKit bridge: react-native-health (AppleHealthKit)
 *   Reads HeartRateVariabilitySDNN samples from HealthKit.
 *   Apple Watch records RMSSD under the SDNN identifier — intentional Apple quirk.
 *   Values are in milliseconds (typical resting range: 20–80 ms).
 *
 *   When HealthKit is unavailable or permissions are denied, isAvailable
 *   returns false and the engine silently falls through to Level 2/3.
 *   No errors are thrown — the app is fully functional without HealthKit.
 *
 * New Architecture note (newArchEnabled: true):
 *   react-native-health uses the old NativeModules bridge. React Native 0.73+
 *   includes an automatic interop layer that runs old-arch modules in the new arch.
 *   If HRV shows as unavailable on device despite Apple Watch pairing, the fix is:
 *   set "newArchEnabled": false in app.json and rebuild.
 *
 * Week-over-week trend:
 *   Compares the mean RMSSD of the last 3 days vs. the prior 4 days.
 *   Δ > +3ms → 'better', Δ < -3ms → 'worse', else → 'same'.
 *   Threshold is intentionally wide to avoid spurious flip-flops.
 */

import AppleHealthKit, { HealthKitPermissions } from 'react-native-health';
import { Platform } from 'react-native';
import { scoreFromHRV, estimateConditionScore } from './ContextEngine';
import type { ConditionTrend, HRVDataLevel, HRVReading } from '../types';
import { useUNSStore } from '../store';

// ─── HealthKit permissions ────────────────────────────────────────────────────
// Read-only: we only query HRV samples, never write health data.
const HK_PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [AppleHealthKit.Constants.Permissions.HeartRateVariability],
    write: [],
  },
};

// ─── Promisified HealthKit helpers ────────────────────────────────────────────
// react-native-health uses callbacks. We wrap them in Promises so HRVEngine
// can stay async/await throughout.

/**
 * Initialize HealthKit and request permissions.
 * Idempotent — safe to call on every app launch.
 * Returns true if HealthKit is available and permissions are granted.
 */
function hkInit(): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') {
      resolve(false);
      return;
    }
    AppleHealthKit.initHealthKit(HK_PERMISSIONS, (err) => {
      // err is a string on failure, null/undefined on success
      resolve(!err);
    });
  });
}

// Internal type for HRV samples returned by react-native-health
interface HKHRVSample {
  value: number;       // RMSSD in milliseconds
  startDate: string;   // ISO 8601 — when Watch measured this sample
  endDate: string;
}

interface HKSampleOptions {
  startDate: string;
  endDate: string;
  limit: number;
  ascending?: boolean;
}

/**
 * Fetch HRV samples from HealthKit within the given date range.
 * Returns an empty array on error or if no samples exist.
 */
function hkGetHRVSamples(opts: HKSampleOptions): Promise<HKHRVSample[]> {
  return new Promise((resolve) => {
    AppleHealthKit.getHeartRateVariabilitySamples(opts, (err, results) => {
      if (err || !results) {
        resolve([]);
        return;
      }
      // Map react-native-health HealthValue[] to our internal type
      resolve(results.map((r: any) => ({
        value: r.value,
        startDate: r.startDate,
        endDate: r.endDate,
      })));
    });
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Apple Watch measures HRV automatically every few hours during deep sleep.
// "Fresh"   = < 1h ago  → real data, high confidence
// "Stale"   = 1–4h ago  → usable but show Watch measurement prompt
// "Expired" = > 4h ago  → fall back to heuristic
const HRV_FRESH_MS     = 1 * 60 * 60 * 1000;  // 1 hour
const HRV_STALE_MS     = 4 * 60 * 60 * 1000;  // 4 hours
const WEEK_WINDOW_MS   = 7 * 24 * 60 * 60 * 1000;
const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // "last 3 days" for trend calc
const TREND_DELTA_MS   = 3;                         // ms RMSSD to qualify as a trend
const CACHE_TTL_MS     = 5 * 60 * 1000;            // 5-min read cache
const BASELINE_SCORE   = 70;                        // Level 3 fallback

// ─── HRVEngine ────────────────────────────────────────────────────────────────

class HRVEngine {
  private permissionsGranted = false;
  private cachedSample: { rmssd: number; recordedAt: number } | null = null;
  private cacheTimestamp = 0;

  // ─── Availability ─────────────────────────────────────────────────────────
  // isAvailable is true only after a successful initHealthKit() in this session.
  // On fresh app launch, the first call to getLatestSample() will auto-init.
  get isAvailable(): boolean {
    return Platform.OS === 'ios' && this.permissionsGranted;
  }

  // ─── Permissions ──────────────────────────────────────────────────────────
  // Called from OnboardingScreen health step.
  // After the first grant, re-runs on subsequent launches silently succeed.
  async requestPermissions(): Promise<boolean> {
    try {
      this.permissionsGranted = await hkInit();
      return this.permissionsGranted;
    } catch {
      return false;
    }
  }

  // ─── Latest sample (with 5-min cache + auto-init) ─────────────────────────
  async getLatestSample(): Promise<{ rmssd: number; recordedAt: number } | null> {
    if (Platform.OS !== 'ios') return null;

    // Auto-init on each app launch so permissionsGranted is restored from OS state.
    // hkInit() is fast if permissions were previously granted — it just re-validates.
    if (!this.permissionsGranted) {
      this.permissionsGranted = await hkInit();
    }
    if (!this.permissionsGranted) {
      // Update cache timestamp even on permission denial to avoid
      // hammering HealthKit init on every call
      this.cacheTimestamp = Date.now();
      return null;
    }

    const now = Date.now();
    // Return cached value if still fresh (avoids hammering HealthKit)
    if (this.cachedSample && now - this.cacheTimestamp < CACHE_TTL_MS) {
      return this.cachedSample;
    }

    try {
      // Query only the last 4 hours — if Watch hasn't measured recently, return null
      const samples = await hkGetHRVSamples({
        startDate: new Date(now - HRV_STALE_MS).toISOString(),
        endDate:   new Date(now).toISOString(),
        limit:     1,
        ascending: false, // newest first
      });

      if (!samples.length) {
        this.cachedSample  = null;
        this.cacheTimestamp = now;
        return null;
      }

      const s = samples[0];
      const result = {
        rmssd:      s.value,
        recordedAt: new Date(s.startDate).getTime(),
      };
      this.cachedSample   = result;
      this.cacheTimestamp = now;
      return result;
    } catch {
      return null;
    }
  }

  // ─── Week-over-week HRV trend ─────────────────────────────────────────────
  // Compares mean RMSSD of last 3 days vs. prior 4 days (7-day window total).
  async getWeekOverWeekTrend(): Promise<ConditionTrend['weekOverWeek']> {
    if (!this.isAvailable) return 'same';
    try {
      const samples = await hkGetHRVSamples({
        startDate: new Date(Date.now() - WEEK_WINDOW_MS).toISOString(),
        endDate:   new Date().toISOString(),
        limit:     50,
        ascending: true,
      });
      // Need at least 4 samples for a meaningful comparison
      if (samples.length < 4) return 'same';

      const cutoff = Date.now() - RECENT_WINDOW_MS;
      const recent = samples.filter((s) => new Date(s.startDate).getTime() >= cutoff);
      const prior  = samples.filter((s) => new Date(s.startDate).getTime()  < cutoff);
      if (!recent.length || !prior.length) return 'same';

      const mean = (arr: HKHRVSample[]) =>
        arr.reduce((sum, x) => sum + x.value, 0) / arr.length;

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

    // ── Level 1: real HealthKit data ────────────────────────────────────────
    const latest  = await this.getLatestSample();
    const isRecent = !!latest && (now - latest.recordedAt) < HRV_STALE_MS;

    if (isRecent && latest) {
      const weekOverWeek = await this.getWeekOverWeekTrend();
      const reading: HRVReading = {
        timestamp: latest.recordedAt,
        rmssd:     latest.rmssd,
        source:    'healthkit',
      };
      useUNSStore.getState().addHRVReading(reading);

      return {
        level:       'real' as HRVDataLevel,
        score:       scoreFromHRV(latest.rmssd),
        weekOverWeek,
        lastUpdated: now,
      };
    }

    // ── Level 2: calendar + time-of-day heuristic ────────────────────────
    if (calendarEventCount >= 0) {
      return {
        level:       'estimated' as HRVDataLevel,
        score:       estimateConditionScore(calendarEventCount),
        weekOverWeek: 'same',
        lastUpdated: now,
      };
    }

    // ── Level 3: conservative baseline ───────────────────────────────────
    return {
      level:       'none' as HRVDataLevel,
      score:       BASELINE_SCORE,
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
  // isDataStale = true → real HRV data is 1–4h old.
  // SanctuaryScreen uses this to show a soft "Watch で計測を" prompt.
  // It never blocks session start — it is an invitation, never a gate.
  get isDataStale(): boolean {
    if (!this.cachedSample) return false; // no data = 'none', not 'stale'
    const age = Date.now() - this.cachedSample.recordedAt;
    return age > HRV_FRESH_MS && age <= HRV_STALE_MS;
  }

  // Staleness in minutes — displayed as "XX分前の計測" in HRVStaleBanner
  get stalenessMins(): number | null {
    if (!this.cachedSample) return null;
    return Math.round((Date.now() - this.cachedSample.recordedAt) / 60_000);
  }

  // SanctuaryScreen compares this before/after the user returns from Health app
  // to detect a fresh Watch measurement and show CalibrationSuccessToast.
  get lastMeasuredAt(): number | null {
    return this.cachedSample?.recordedAt ?? null;
  }
}

export const hrvEngine = new HRVEngine();
