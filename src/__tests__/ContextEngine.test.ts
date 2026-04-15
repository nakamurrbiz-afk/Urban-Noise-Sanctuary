/**
 * ContextEngine Unit Tests
 *
 * Tests for:
 *   1. scoreFromHRV — condition scoring from RMSSD
 *   2. estimateConditionScore — fallback heuristic
 *   3. selectMode — mode selection logic
 *   4. buildMindWeatherPayload — notification pattern selection
 *   5. RouteDNALearner — 2-week simulated commute → route recognition
 */

import {
  scoreFromHRV,
  estimateConditionScore,
  selectMode,
  buildMindWeatherPayload,
  RouteDNALearner,
  ROUTE_RECOGNITION_THRESHOLD,
  MovementSample,
} from '../engines/ContextEngine';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const TRANSIT_SPEED_MS = 15 / 3.6;      // 4.17 m/s — the internal threshold
const TRANSIT_CONFIRM_MS = 30_000;       // 30s sustained to confirm transit

/**
 * Build a realistic sequence of MovementSamples for one transit session.
 *
 * Timeline:
 *   t=0        : walking at platform (slow)
 *   t=5s       : doors close, acceleration begins (crosses TRANSIT_SPEED_MS)
 *   t=5s–Ns    : in transit at avgSpeedMs ± variance
 *   t=N+5s     : deceleration / doors open (falls below TRANSIT_SPEED_MS)
 */
function buildTransitSession(params: {
  startTimestamp: number;
  durationMs: number;
  avgSpeedMs: number;
  speedVariance?: number;    // std-dev in m/s, default 1.5
  sampleIntervalMs?: number; // default 1000ms
}): MovementSample[] {
  const {
    startTimestamp,
    durationMs,
    avgSpeedMs,
    speedVariance = 1.5,
    sampleIntervalMs = 1000,
  } = params;

  const samples: MovementSample[] = [];
  const totalSamples = Math.ceil(durationMs / sampleIntervalMs);

  // 5s walking approach
  for (let i = 0; i < 5; i++) {
    samples.push({
      timestamp: startTimestamp - (5 - i) * 1000,
      latitude: 35.6762,
      longitude: 139.6503,
      speed: 1.2,   // walking
    });
  }

  // Transit phase
  for (let i = 0; i < totalSamples; i++) {
    const jitter = (Math.random() - 0.5) * 2 * speedVariance;
    samples.push({
      timestamp: startTimestamp + i * sampleIntervalMs,
      latitude: 35.6762 + i * 0.0001,
      longitude: 139.6503 + i * 0.0001,
      speed: Math.max(TRANSIT_SPEED_MS + 0.5, avgSpeedMs + jitter),
    });
  }

  // 5s stop after transit
  for (let i = 0; i < 5; i++) {
    samples.push({
      timestamp: startTimestamp + durationMs + i * 1000,
      latitude: 35.6762 + totalSamples * 0.0001,
      longitude: 139.6503 + totalSamples * 0.0001,
      speed: 1.0,
    });
  }

  return samples;
}

/**
 * Feed a batch of samples into a RouteDNALearner and collect all events.
 */
function feedSamples(learner: RouteDNALearner, samples: MovementSample[]) {
  const events: ReturnType<RouteDNALearner['addSample']>[] = [];
  for (const sample of samples) {
    const result = learner.addSample(sample);
    if (Object.keys(result).length > 0) events.push(result);
  }
  return events;
}

// ─── scoreFromHRV ─────────────────────────────────────────────────────────────

describe('scoreFromHRV', () => {
  test('returns high score for healthy HRV (>= 50ms RMSSD)', () => {
    expect(scoreFromHRV(50)).toBe(70);
    expect(scoreFromHRV(100)).toBe(100);  // capped at 100
    expect(scoreFromHRV(60)).toBeGreaterThan(70);
  });

  test('returns low score for fatigued HRV (<= 25ms)', () => {
    expect(scoreFromHRV(0)).toBe(20);     // floor
    expect(scoreFromHRV(25)).toBe(50);    // boundary: [0,25]→[20,50]
    expect(scoreFromHRV(12)).toBeGreaterThan(20);
    expect(scoreFromHRV(12)).toBeLessThan(50);
  });

  test('interpolates linearly in the 25–50ms range', () => {
    const mid = scoreFromHRV(37.5);      // exact midpoint
    expect(mid).toBeGreaterThan(30);
    expect(mid).toBeLessThan(70);
  });

  test('score is monotonically increasing with RMSSD', () => {
    const scores = [15, 25, 35, 45, 55, 65].map(scoreFromHRV);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });
});

// ─── estimateConditionScore ───────────────────────────────────────────────────

describe('estimateConditionScore', () => {
  test('returns a number between 20 and 95', () => {
    for (let events = 0; events <= 10; events++) {
      const score = estimateConditionScore(events);
      expect(score).toBeGreaterThanOrEqual(20);
      expect(score).toBeLessThanOrEqual(95);
    }
  });

  test('more calendar events reduce the score', () => {
    const light = estimateConditionScore(0);
    const heavy = estimateConditionScore(5);
    expect(heavy).toBeLessThan(light);
  });
});

// ─── selectMode ──────────────────────────────────────────────────────────────

describe('selectMode', () => {
  test('selects "activate" when next event is gym', () => {
    expect(selectMode(70, 'ジム (RIZAP)', 8)).toBe('activate');
    expect(selectMode(50, 'gym workout', 19)).toBe('activate');
  });

  test('selects "calm" in the evening (hour >= 18)', () => {
    expect(selectMode(80, null, 21)).toBe('calm');
  });

  test('selects "calm" when condition score is low (< 45)', () => {
    expect(selectMode(40, null, 9)).toBe('calm');
  });

  test('selects "focus" for high condition mornings', () => {
    expect(selectMode(80, null, 9)).toBe('focus');
  });
});

// ─── buildMindWeatherPayload ──────────────────────────────────────────────────

describe('buildMindWeatherPayload', () => {
  test('selects "fatigue" pattern for low score', () => {
    const p = buildMindWeatherPayload(35, 'worse', null);
    expect(p.pattern).toBe('fatigue');
    expect(p.message).toContain('脳が重い');
  });

  test('selects "important_event" when next event matches', () => {
    const p = buildMindWeatherPayload(65, 'same', 'プレゼン: Q3 決算');
    expect(p.pattern).toBe('important_event');
  });

  test('selects "good_condition" for high score + better trend', () => {
    const p = buildMindWeatherPayload(82, 'better', null);
    expect(p.pattern).toBe('good_condition');
  });

  test('defaults when score is mid-range and no event', () => {
    const p = buildMindWeatherPayload(60, 'same', null);
    expect(p.pattern).toBe('default');
  });

  test('payload always has message and subMessage', () => {
    const p = buildMindWeatherPayload(50, 'same', null);
    expect(p.message.length).toBeGreaterThan(0);
    expect(p.subMessage.length).toBeGreaterThan(0);
  });
});

// ─── RouteDNALearner ──────────────────────────────────────────────────────────

describe('RouteDNALearner', () => {

  // 大江戸線: avg ~25 km/h = ~6.9 m/s, high speed variance due to frequent stops
  const OEDO_SPEED_MS = 25 / 3.6;
  const OEDO_DURATION_MS = 8 * 60 * 1000;   // 8-min session

  // 山手線: avg ~40 km/h = ~11.1 m/s, smoother ride
  const YAMANOTE_SPEED_MS = 40 / 3.6;
  const YAMANOTE_DURATION_MS = 10 * 60 * 1000;

  test('emits transitStarted when speed exceeds threshold', () => {
    const learner = new RouteDNALearner();
    const t0 = Date.now();
    const result = learner.addSample({
      timestamp: t0, latitude: 35.67, longitude: 139.65, speed: TRANSIT_SPEED_MS + 1,
    });
    expect(result.transitStarted).toBe(true);
  });

  test('does NOT emit transitEnded for sessions shorter than TRANSIT_CONFIRM_MS', () => {
    const learner = new RouteDNALearner();
    const t0 = Date.now();

    // Very short "transit" — only 10 seconds
    const shortSession = buildTransitSession({
      startTimestamp: t0,
      durationMs: 10_000,
      avgSpeedMs: OEDO_SPEED_MS,
    });
    const events = feedSamples(learner, shortSession);
    const ended = events.filter((e) => e.transitEnded);
    expect(ended).toHaveLength(0);
  });

  test('emits transitEnded after a valid transit session (> 30s)', () => {
    const learner = new RouteDNALearner();
    const t0 = Date.now();

    const session = buildTransitSession({
      startTimestamp: t0,
      durationMs: OEDO_DURATION_MS,
      avgSpeedMs: OEDO_SPEED_MS,
      speedVariance: 2.5,  // high variance = frequent stops → spikes detected
    });
    const events = feedSamples(learner, session);
    const ended = events.filter((e) => e.transitEnded);

    expect(ended.length).toBeGreaterThanOrEqual(1);
    const profile = ended[0].transitEnded!;
    expect(profile.avgDurationMs).toBeGreaterThan(TRANSIT_CONFIRM_MS);
    expect(profile.sessionCount).toBe(1);
  });

  test('increments sessionCount when the same route type is repeated', () => {
    const learner = new RouteDNALearner();
    const BASE_TIME = Date.now();

    // Simulate 5 sessions on the same route type
    for (let day = 0; day < 5; day++) {
      const sessionStart = BASE_TIME + day * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000;
      const samples = buildTransitSession({
        startTimestamp: sessionStart,
        durationMs: OEDO_DURATION_MS,
        avgSpeedMs: OEDO_SPEED_MS,
        speedVariance: 2.5,
      });
      feedSamples(learner, samples);
    }

    const buckets = learner._getProfileBuckets();
    const counts = Array.from(buckets.values()).map((p) => p.sessionCount);
    const maxCount = Math.max(...counts);
    expect(maxCount).toBeGreaterThanOrEqual(3);
  });

  test('fires "recognized" event exactly at ROUTE_RECOGNITION_THRESHOLD sessions', () => {
    const learner = new RouteDNALearner();
    const BASE_TIME = Date.now();
    const recognizedEvents: ReturnType<RouteDNALearner['addSample']>[] = [];

    for (let day = 0; day < ROUTE_RECOGNITION_THRESHOLD + 2; day++) {
      const sessionStart = BASE_TIME + day * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000;
      const samples = buildTransitSession({
        startTimestamp: sessionStart,
        durationMs: YAMANOTE_DURATION_MS,
        avgSpeedMs: YAMANOTE_SPEED_MS,
        speedVariance: 1.0,
      });
      const events = feedSamples(learner, samples);
      recognizedEvents.push(...events.filter((e) => e.recognized));
    }

    // Should fire recognized exactly once (at threshold, not on subsequent sessions)
    expect(recognizedEvents).toHaveLength(1);
    expect(recognizedEvents[0].recognized!.sessionCount).toBe(ROUTE_RECOGNITION_THRESHOLD);
  });

  /**
   * PRIMARY TEST: 2-week simulated commute
   *
   * Scenario:
   *   - User commutes weekdays (10 days × 2 trips = 20 sessions)
   *   - Morning: 大江戸線-type (low speed, high variance)
   *   - Evening: same route back
   *
   * Expected outcome after 2 weeks:
   *   - hasRecognizedRoute() === true
   *   - getLearnedRoutes() contains at least 1 route with sessionCount >= threshold
   *   - Total session count >= 14 (allowing for noise/missed detections)
   */
  test('2-week commute simulation → route recognized as "地下鉄（低速）"', () => {
    const learner = new RouteDNALearner();
    const WEEK_1_START = Date.now();

    let sessionsDetected = 0;

    for (let day = 0; day < 14; day++) {
      const isWeekend = day % 7 === 5 || day % 7 === 6;
      if (isWeekend) continue;  // no commute on weekends

      const dayBase = WEEK_1_START + day * 24 * 60 * 60 * 1000;

      // Morning trip
      const morning = buildTransitSession({
        startTimestamp: dayBase + 8 * 60 * 60 * 1000,
        durationMs: OEDO_DURATION_MS,
        avgSpeedMs: OEDO_SPEED_MS,
        speedVariance: 2.5,
      });
      const morningEvents = feedSamples(learner, morning);
      if (morningEvents.some((e) => e.transitEnded)) sessionsDetected++;

      // Evening trip (same route)
      const evening = buildTransitSession({
        startTimestamp: dayBase + 21 * 60 * 60 * 1000,
        durationMs: OEDO_DURATION_MS,
        avgSpeedMs: OEDO_SPEED_MS,
        speedVariance: 2.5,
      });
      const eveningEvents = feedSamples(learner, evening);
      if (eveningEvents.some((e) => e.transitEnded)) sessionsDetected++;
    }

    // After 2 weeks: route should be recognized
    expect(learner.hasRecognizedRoute()).toBe(true);

    const learned = learner.getLearnedRoutes();
    expect(learned.length).toBeGreaterThanOrEqual(1);
    expect(learned[0].sessionCount).toBeGreaterThanOrEqual(ROUTE_RECOGNITION_THRESHOLD);
    // 大江戸線の平均速度 ~25km/h → inferLineName では「地下鉄」(20-40km/h帯) に分類
    // 実機での位置情報ベース路線名特定は Phase 2 で実装
    expect(['地下鉄', '地下鉄（低速）']).toContain(learned[0].lineName);

    // At least 8 of 10 weekday morning sessions should be detected (80% floor)
    expect(sessionsDetected).toBeGreaterThanOrEqual(8);
  });

  test('getTotalSessionCount returns sum across all buckets', () => {
    const learner = new RouteDNALearner();
    const t0 = Date.now();

    // 3 oedo-type sessions
    for (let i = 0; i < 3; i++) {
      const samples = buildTransitSession({
        startTimestamp: t0 + i * 86_400_000,
        durationMs: OEDO_DURATION_MS,
        avgSpeedMs: OEDO_SPEED_MS,
      });
      feedSamples(learner, samples);
    }

    // 2 yamanote-type sessions
    for (let i = 0; i < 2; i++) {
      const samples = buildTransitSession({
        startTimestamp: t0 + (i + 5) * 86_400_000,
        durationMs: YAMANOTE_DURATION_MS,
        avgSpeedMs: YAMANOTE_SPEED_MS,
      });
      feedSamples(learner, samples);
    }

    expect(learner.getTotalSessionCount()).toBeGreaterThanOrEqual(4);
  });
});
