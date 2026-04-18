/**
 * ContextEngine Unit Tests
 *
 * Tests for:
 *   1. scoreFromHRV — condition scoring from RMSSD
 *   2. estimateConditionScore — fallback heuristic
 *   3. selectMode — mode selection logic
 *   4. buildMindWeatherPayload — notification pattern selection
 */

import {
  scoreFromHRV,
  estimateConditionScore,
  selectMode,
  buildMindWeatherPayload,
} from '../engines/ContextEngine';

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
