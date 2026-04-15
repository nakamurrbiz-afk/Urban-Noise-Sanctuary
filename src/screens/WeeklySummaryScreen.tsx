import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useUNSStore } from '../store';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';

const { width } = Dimensions.get('window');

function TrendText({ trend }: { trend: 'better' | 'same' | 'worse' }) {
  const config = {
    better: { text: '先週より回復が早くなっています。', color: COLORS.success },
    same:   { text: '先週と同じペースで維持できています。', color: COLORS.textSecondary },
    worse:  { text: '今週は負荷が高めでした。来週は休息も大切に。', color: COLORS.warning },
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

  // Calculate this week's stats
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeekSessions = sessionHistory.filter((s) => s.startedAt >= oneWeekAgo);
  const totalMs = thisWeekSessions.reduce((sum, s) => sum + s.durationMs, 0);
  const totalMinutes = Math.floor(totalMs / 60_000);
  const streakDays = Math.min(7, thisWeekSessions.length);

  // Best session
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

      {/* Best session */}
      {bestSession && (
        <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.bestCard}>
          <Text style={styles.bestLabel}>最も効果が高かったセッション</Text>
          <Text style={styles.bestRoute}>
            {bestSession.routeProfile?.lineName ?? '移動中'}
          </Text>
          <Text style={styles.bestDuration}>
            {Math.floor(bestSession.durationMs / 60_000)}分間 Sanctuary維持
          </Text>
        </Animated.View>
      )}

      {/* Context note — no absolute HRV values, relative only */}
      <Animated.View entering={FadeInUp.delay(600).duration(600)} style={styles.note}>
        <Text style={styles.noteText}>
          {conditionTrend.level === 'real'
            ? 'Apple Watchのリズムデータで計測しました。'
            : conditionTrend.level === 'estimated'
            ? '移動パターンからコンディションを推定しました。'
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
  bestRoute: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
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
