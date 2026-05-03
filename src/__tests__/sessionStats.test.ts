import { calculateStreak, getCalendarWeekSessions, getWeekDayData, MIN_SESSION_MS } from '../utils/sessionStats';
import type { SanctuarySession } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSession(daysAgo: number, durationMs = 60_000): SanctuarySession {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0); // noon local, avoids midnight edge
  return {
    id: `test_${d.getTime()}`,
    startedAt: d.getTime(),
    endedAt: d.getTime() + durationMs,
    mode: 'calm',
    durationMs,
    hrvLevel: 'none',
  };
}

// ─── calculateStreak ────────────────────────────────────────────────────────

describe('calculateStreak', () => {
  it('returns 0 when no sessions exist', () => {
    expect(calculateStreak([])).toBe(0);
  });

  it('returns 1 when only today has a session', () => {
    expect(calculateStreak([makeSession(0)])).toBe(1);
  });

  it('returns 3 for three consecutive days (today, yesterday, 2 days ago)', () => {
    const sessions = [makeSession(0), makeSession(1), makeSession(2)];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it('breaks streak on gap — sessions on day 0, 1, 3 (skipped day 2)', () => {
    const sessions = [makeSession(0), makeSession(1), makeSession(3)];
    expect(calculateStreak(sessions)).toBe(2);
  });

  it('counts multiple sessions on the same day as 1 day', () => {
    const sessions = [
      makeSession(0, 60_000),
      makeSession(0, 120_000),
      makeSession(0, 90_000),
    ];
    expect(calculateStreak(sessions)).toBe(1);
  });

  it('excludes sessions shorter than MIN_SESSION_MS', () => {
    const sessions = [
      makeSession(0, MIN_SESSION_MS - 1), // too short — ignored
    ];
    expect(calculateStreak(sessions)).toBe(0);
  });

  it('counts sessions exactly at MIN_SESSION_MS', () => {
    const sessions = [makeSession(0, MIN_SESSION_MS)];
    expect(calculateStreak(sessions)).toBe(1);
  });

  it('grace period: streak survives if last session was yesterday (not today)', () => {
    const sessions = [makeSession(1), makeSession(2), makeSession(3)];
    expect(calculateStreak(sessions)).toBe(3);
  });

  it('returns 0 if last session was 2+ days ago', () => {
    const sessions = [makeSession(2), makeSession(3)];
    expect(calculateStreak(sessions)).toBe(0);
  });

  it('handles long streak correctly', () => {
    const sessions = Array.from({ length: 14 }, (_, i) => makeSession(i));
    expect(calculateStreak(sessions)).toBe(14);
  });

  it('ignores short sessions even in a streak', () => {
    const sessions = [
      makeSession(0, 60_000),
      makeSession(1, 5_000),  // too short — day 1 has no qualifying session
      makeSession(2, 60_000),
    ];
    // Day 0 qualifies, day 1 does NOT, day 2 qualifies → streak = 1
    expect(calculateStreak(sessions)).toBe(1);
  });
});

// ─── getCalendarWeekSessions ────────────────────────────────────────────────

describe('getCalendarWeekSessions', () => {
  it('returns only sessions from the current calendar week', () => {
    const today = new Date();
    // 0=Mon...6=Sun (ISO)
    const todayDow = (today.getDay() + 6) % 7;

    // Session today (should be included)
    const inWeek = makeSession(0);
    // Session from 8 days ago (should be excluded)
    const outOfWeek = makeSession(8);

    const result = getCalendarWeekSessions([inWeek, outOfWeek]);
    expect(result).toContain(inWeek);
    expect(result).not.toContain(outOfWeek);
  });

  it('excludes sessions shorter than MIN_SESSION_MS', () => {
    const short = makeSession(0, MIN_SESSION_MS - 1);
    const result = getCalendarWeekSessions([short]);
    expect(result).toHaveLength(0);
  });
});

// ─── getWeekDayData ─────────────────────────────────────────────────────────

describe('getWeekDayData', () => {
  it('returns exactly 7 entries (Mon–Sun)', () => {
    const data = getWeekDayData([]);
    expect(data).toHaveLength(7);
    expect(data.map((d) => d.label)).toEqual(['月', '火', '水', '木', '金', '土', '日']);
  });

  it('marks today correctly', () => {
    const data = getWeekDayData([]);
    const todayEntries = data.filter((d) => d.isToday);
    expect(todayEntries).toHaveLength(1);
  });

  it('accumulates minutes for sessions on the same day', () => {
    const s1 = makeSession(0, 60_000);  // 1 min
    const s2 = makeSession(0, 120_000); // 2 min
    const data = getWeekDayData([s1, s2]);
    const todayData = data.find((d) => d.isToday);
    expect(todayData).toBeDefined();
    expect(todayData!.minutes).toBeCloseTo(3, 0);
  });

  it('excludes short sessions from minute totals', () => {
    const short = makeSession(0, 10_000); // 10s — below threshold
    const data = getWeekDayData([short]);
    const todayData = data.find((d) => d.isToday);
    expect(todayData!.minutes).toBe(0);
  });
});
