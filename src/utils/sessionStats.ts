/**
 * Session statistics utilities — streak calculation & calendar-week grouping.
 *
 * All date comparisons use the device's **local timezone** via `new Date()`.
 * Session timestamps (`startedAt`) are UTC milliseconds from `Date.now()`.
 *
 * Key design decisions:
 *   - MIN_SESSION_MS = 30 000 (30s). Shorter sessions are excluded from stats.
 *   - Streak counts consecutive **calendar days** (not 24-hour windows).
 *   - If today has no qualifying session but yesterday does, the streak is
 *     preserved (counted from yesterday). This avoids resetting at midnight
 *     before the user has had a chance to use the app.
 *   - Calendar week = Monday–Sunday (ISO 8601).
 */

import type { SanctuarySession } from '../types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum session duration to be counted in statistics. */
export const MIN_SESSION_MS = 30_000; // 30 seconds

const MS_PER_DAY = 86_400_000;

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Local-date key: "YYYY-M-D" (month/day are NOT zero-padded). */
function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Local midnight timestamp for the given date's calendar day. */
function toLocalMidnight(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Return unique sorted date-keys (descending) with at least one qualifying session. */
function getActiveDateKeys(sessions: SanctuarySession[]): string[] {
  const keys = new Set<string>();
  for (const s of sessions) {
    if (s.durationMs >= MIN_SESSION_MS) {
      keys.add(toLocalDateKey(s.startedAt));
    }
  }
  // Sort descending so index 0 = most recent day
  return [...keys].sort((a, b) => {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return by - ay || bm - am || bd - ad;
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Calculate the current streak — consecutive calendar days with at least one
 * qualifying session (≥ MIN_SESSION_MS).
 *
 * - If today has a session → count from today.
 * - If today has none but yesterday does → count from yesterday (grace period).
 * - Otherwise → 0.
 */
export function calculateStreak(sessions: SanctuarySession[]): number {
  const keys = getActiveDateKeys(sessions);
  if (keys.length === 0) return 0;

  const todayKey = toLocalDateKey(Date.now());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterday.getTime());

  // Determine the anchor point
  let anchorIndex: number;
  if (keys[0] === todayKey) {
    anchorIndex = 0;
  } else if (keys[0] === yesterdayKey) {
    // Grace: streak survives if yesterday was the last active day
    anchorIndex = 0;
  } else {
    return 0; // last session was 2+ days ago
  }

  // Walk backwards from anchor, checking each prior day is consecutive
  let streak = 1;
  for (let i = anchorIndex + 1; i < keys.length; i++) {
    const [cy, cm, cd] = keys[i - 1].split('-').map(Number);
    const prevDay = new Date(cy, cm, cd);
    prevDay.setDate(prevDay.getDate() - 1);
    const expectedKey = toLocalDateKey(prevDay.getTime());

    if (keys[i] === expectedKey) {
      streak++;
    } else {
      break; // gap found
    }
  }

  return streak;
}

// ─── Calendar-week helpers (Mon–Sun) ────────────────────────────────────────

export interface DayData {
  label: string;
  minutes: number;
  isToday: boolean;
}

const DAYS_JA = ['月', '火', '水', '木', '金', '土', '日'];

/** Convert JS getDay() (0=Sun) to ISO day index (0=Mon … 6=Sun). */
function toIsoDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/**
 * Return sessions that fall within the current calendar week (Mon 00:00 – Sun 23:59:59.999 local).
 */
export function getCalendarWeekSessions(sessions: SanctuarySession[]): SanctuarySession[] {
  const now = new Date();
  const todayDow = toIsoDow(now.getDay());

  // Monday of this week
  const monday = new Date(now);
  monday.setDate(now.getDate() - todayDow);
  const weekStart = toLocalMidnight(monday);

  // Sunday end (Monday next week midnight)
  const weekEnd = weekStart + 7 * MS_PER_DAY;

  return sessions.filter(
    (s) => s.startedAt >= weekStart && s.startedAt < weekEnd && s.durationMs >= MIN_SESSION_MS,
  );
}

/**
 * Build 7-element array (Mon–Sun) with per-day minutes for the current
 * calendar week. Uses local timezone consistently.
 */
export function getWeekDayData(sessions: SanctuarySession[]): DayData[] {
  const now = new Date();
  const todayDow = toIsoDow(now.getDay());

  return DAYS_JA.map((label, i) => {
    const offset = i - todayDow;
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    const dayStart = toLocalMidnight(d);
    const dayEnd = dayStart + MS_PER_DAY;

    const minutes = sessions
      .filter(
        (s) =>
          s.startedAt >= dayStart &&
          s.startedAt < dayEnd &&
          s.durationMs >= MIN_SESSION_MS,
      )
      .reduce((sum, s) => sum + s.durationMs / 60_000, 0);

    return { label, minutes, isToday: i === todayDow };
  });
}
