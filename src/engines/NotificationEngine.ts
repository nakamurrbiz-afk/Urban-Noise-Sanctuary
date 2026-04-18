/**
 * UNS Notification Engine — Mind Weather
 *
 * Design principles:
 *  - 1 notification per day max (default)
 *  - Always delivers message + solution in same payload
 *  - Notification text is about USER's inner state, not traffic
 *  - No "狼少年" (cry wolf) risk because we never predict external events
 */

import * as Notifications from 'expo-notifications';
import { MindWeatherPayload } from '../types';

// expo-notifications native module was removed from Expo Go in SDK 53.
// Wrap in try/catch so Expo Go doesn't crash.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

// Schedule Mind Weather notification.
// Pass delayMs = 0 for immediate delivery (golden window is now).
// Omit or pass undefined to schedule for the next morning commute (07:45).
export async function scheduleMindWeather(
  payload: MindWeatherPayload,
  delayMs?: number,
): Promise<void> {
  try {
    await cancelMindWeather();
    // delayMs === 0 → 1秒後に即時配信（SDK 55 は null trigger の型定義を持たないため DATE で代替）
    const fireAt = delayMs === 0 ? new Date(Date.now() + 1_000) : nextCommuteTime();
    const trigger: Notifications.DateTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    };
    await Notifications.scheduleNotificationAsync({
      identifier: 'mind_weather',
      content: {
        title: payload.message,
        body: payload.subMessage,
        data: { action: 'open_sanctuary', pattern: payload.pattern },
        sound: false,
      },
      trigger,
    });
  } catch {}
}

// Weekly summary — Monday 08:00
export async function scheduleWeeklySummary(
  sessionCount: number,
  totalMinutes: number,
  trend: 'better' | 'same' | 'worse'
): Promise<void> {
  try {
    const trendText = {
      better: '先週より回復が早くなっています。',
      same:   '先週と同じペースで維持できています。',
      worse:  '今週は少し負荷が高めでした。',
    }[trend];
    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly_summary',
      content: {
        title: `今週のSanctuary — ${sessionCount}回展開`,
        body: `合計${totalMinutes}分間保護しました。${trendText}`,
        data: { action: 'open_summary' },
        sound: false,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextMondayMorning() },
    });
  } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function nextCommuteTime(): Date {
  const now = new Date();
  const target = new Date();
  target.setHours(7, 45, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  while (target.getDay() === 0 || target.getDay() === 6) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function nextMondayMorning(): Date {
  const now = new Date();
  const target = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  target.setDate(now.getDate() + daysUntilMonday);
  target.setHours(8, 0, 0, 0);
  return target;
}

export async function cancelMindWeather(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync('mind_weather').catch(() => {});
}

// Called when notification is tapped — returns the action
export function getNotificationAction(
  notification: Notifications.Notification
): string | undefined {
  const data = notification.request.content.data as Record<string, unknown>;
  return typeof data?.action === 'string' ? data.action : undefined;
}
