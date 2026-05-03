import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useUNSStore } from '../store';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import {
  calculateStreak,
  getCalendarWeekSessions,
  getWeekDayData,
  type DayData,
} from '../utils/sessionStats';

const { width } = Dimensions.get('window');

// ─── 7-day bar chart ─────────────────────────────────────────────────────────

const CHART_BAR_HEIGHT = 72; // max bar height in pts

function AnimatedBar({
  minutes,
  maxMinutes,
  isToday,
  delay,
}: {
  minutes: number;
  maxMinutes: number;
  isToday: boolean;
  delay: number;
}) {
  // bars with 0 minutes get a minimal 2pt stub so the chart doesn't look broken
  const targetH = minutes > 0
    ? Math.max(5, (minutes / maxMinutes) * CHART_BAR_HEIGHT)
    : 2;

  const h  = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    h.value  = withDelay(delay, withTiming(targetH, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    }));
    op.value = withDelay(delay, withTiming(1, { duration: 400 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const barStyle = useAnimatedStyle(() => ({
    height:  h.value,
    opacity: op.value,
  }));

  const color = isToday
    ? COLORS.shieldCore
    : minutes > 0
      ? COLORS.shieldRing
      : COLORS.bgSecondary;

  return (
    // barSlot: fixed-height container with bottom alignment → bar grows upward
    <View style={[chartStyles.barSlot, { height: CHART_BAR_HEIGHT }]}>
      <Animated.View style={[chartStyles.bar, barStyle, { backgroundColor: color }]} />
    </View>
  );
}

function WeekChart({ data }: { data: DayData[] }) {
  const maxMinutes  = Math.max(1, ...data.map((d) => d.minutes));
  const totalActive = data.filter((d) => d.minutes > 0).length;

  return (
    <Animated.View
      entering={FadeInUp.delay(150).duration(600)}
      style={chartStyles.container}
    >
      <View style={chartStyles.header}>
        <Text style={chartStyles.title}>今週の記録</Text>
        {totalActive > 0 && (
          <Text style={chartStyles.activeCount}>{totalActive}日間 展開</Text>
        )}
      </View>

      <View style={chartStyles.barsRow}>
        {data.map((day, i) => (
          <View key={i} style={chartStyles.column}>
            <AnimatedBar
              minutes={day.minutes}
              maxMinutes={maxMinutes}
              isToday={day.isToday}
              delay={i * 55}
            />
            {day.minutes > 0 && (
              <Text style={[chartStyles.value, day.isToday && { color: COLORS.shieldCore }]}>
                {Math.round(day.minutes)}m
              </Text>
            )}
            <Text style={[chartStyles.dayLabel, day.isToday && { color: COLORS.shieldCore }]}>
              {day.label}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 0.5,
    borderColor: COLORS.bgSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  activeCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.shieldCore,
    letterSpacing: 1,
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barSlot: {
    width: '55%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  value: {
    fontSize: 9,
    fontWeight: '300' as const,
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '300' as const,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});

// ─── Trend text ───────────────────────────────────────────────────────────────

function TrendText({ trend }: { trend: 'better' | 'same' | 'worse' }) {
  const config = {
    better: { text: '先週より、騒音に強くなっています。', color: COLORS.success },
    same:   { text: '安定した聖域を維持できています。', color: COLORS.textSecondary },
    worse:  { text: '今週は騒音が多い一週間でした。来週も、守ります。', color: COLORS.warning },
  }[trend];

  return <Text style={[styles.trendText, { color: config.color }]}>{config.text}</Text>;
}

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    opacity.value = withDelay(300, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(300, withTiming(0, { duration: 600 }));
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: translateY.value }] }));

  return (
    <Animated.View style={[styles.statCard, style]}>
      <Text style={styles.statValue}>
        {value}
        {unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Animated.View>
  );
}

export default function WeeklySummaryScreen() {
  const { sessionHistory, conditionTrend } = useUNSStore();

  // Calendar week (Mon–Sun) stats — uses local timezone consistently
  const thisWeekSessions = getCalendarWeekSessions(sessionHistory);
  const weekDayData = getWeekDayData(sessionHistory);
  const totalMs = thisWeekSessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalMinutes = Math.floor(totalMs / 60_000);

  // Streak: consecutive calendar days with qualifying sessions (full history)
  const streakDays = calculateStreak(sessionHistory);

  // Best session this week
  const bestSession = thisWeekSessions.reduce<typeof sessionHistory[0] | null>((best, s) =>
    !best || s.durationMs > best.durationMs ? s : best, null
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[COLORS.gradientTop, COLORS.gradientBottom]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <Animated.View entering={FadeInUp.duration(600)} style={styles.header}>
        <Text style={styles.weekLabel}>今週のSanctuary</Text>
        <Text style={styles.symbolRow}>⟡</Text>
        <TrendText trend={conditionTrend.weekOverWeek} />
      </Animated.View>

      {/* Stat grid */}
      <View style={styles.statGrid}>
        <StatCard label="展開回数" value={thisWeekSessions.length} unit="回" />
        <StatCard label="合計保護時間" value={totalMinutes} unit="分" />
        <StatCard label="継続日数" value={streakDays} unit="日" />
      </View>

      {/* 7-day bar chart */}
      <WeekChart data={weekDayData} />

      {/* Best session */}
      {bestSession && (
        <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.bestCard}>
          <Text style={styles.bestLabel}>最も深く守れた聖域</Text>
          <Text style={styles.bestDuration}>
            {Math.floor(bestSession.durationMs / 60_000)}分間、騒音から守りました
          </Text>
        </Animated.View>
      )}

      {/* Context note — no absolute HRV values, relative only */}
      <Animated.View entering={FadeInUp.delay(600).duration(600)} style={styles.note}>
        <Text style={styles.noteText}>
          {conditionTrend.level === 'real'
            ? 'Apple Watchのリズムデータで計測しました。'
            : conditionTrend.level === 'estimated'
            ? 'カレンダーと時間帯からコンディションを推定しました。'
            : '今週のデータを蓄積しています。'}
        </Text>
        <Text style={styles.noteSubText}>
          来週はより精度の高いデータでお届けします。
        </Text>
      </Animated.View>

      {/* No absolute numbers disclaimer */}
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 80 },
  header: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: SPACING.xl,
    gap: SPACING.md,
  },
  weekLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 3 },
  symbolRow: { fontSize: 28, color: COLORS.shieldGold },
  trendText: { ...TYPOGRAPHY.body, textAlign: 'center', lineHeight: 24 },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: SPACING.md,
    width: (width - SPACING.md * 4) / 3,
    gap: 4,
  },
  statValue: { ...TYPOGRAPHY.heading1, color: COLORS.textPrimary },
  statUnit: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  statLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textAlign: 'center' },
  bestCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 0.5,
    borderColor: COLORS.shieldGold + '40',
    marginBottom: SPACING.xl,
  },
  bestLabel: { ...TYPOGRAPHY.caption, color: COLORS.shieldGold, letterSpacing: 1 },
  bestDuration: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  note: {
    marginHorizontal: SPACING.lg,
    gap: SPACING.sm,
    alignItems: 'center',
  },
  noteText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  noteSubText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted + '80', textAlign: 'center' },
  spacer: { height: 40 },
});
