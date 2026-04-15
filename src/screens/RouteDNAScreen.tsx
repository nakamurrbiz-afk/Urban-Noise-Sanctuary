import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useUNSStore } from '../store';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { RouteProfile } from '../types';

function RouteCard({ profile, index }: { profile: RouteProfile; index: number }) {
  const avgMin = Math.floor(profile.avgDurationMs / 60_000);
  const noiseBar = profile.noiseProfile.lowFreqIntensity;

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 120).duration(500)}
      style={styles.card}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.lineName}>{profile.lineName}</Text>
        <Text style={styles.sessionCount}>{profile.sessionCount}回学習済</Text>
      </View>

      <Text style={styles.duration}>平均移動時間 {avgMin}分</Text>

      <View style={styles.noiseRow}>
        <Text style={styles.noiseLabel}>低周波ノイズ強度</Text>
        <View style={styles.noiseTrack}>
          <View style={[styles.noiseFill, { width: `${noiseBar * 100}%` }]} />
        </View>
      </View>

      {profile.noiseProfile.highFreqSpikes && (
        <Text style={styles.spikeNote}>✦ ブレーキ音マスキング適用中</Text>
      )}

      <Text style={styles.filterNote}>
        このルート専用フィルタが適用されています
      </Text>
    </Animated.View>
  );
}

function EmptyState() {
  return (
    <Animated.View entering={FadeInUp.duration(600)} style={styles.empty}>
      <Text style={styles.emptySymbol}>∿</Text>
      <Text style={styles.emptyTitle}>Route DNA を学習中</Text>
      <Text style={styles.emptyBody}>
        2週間の通勤データを蓄積することで、{'\n'}
        あなたの路線に最適化されたフィルタが{'\n'}
        自動的に生成されます。
      </Text>
      <Text style={styles.emptyHint}>
        Sanctuaryを展開するたびに学習が進みます
      </Text>
    </Animated.View>
  );
}

export default function RouteDNAScreen() {
  const { routeProfiles } = useUNSStore();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <LinearGradient
        colors={[COLORS.gradientTop, COLORS.gradientBottom]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Text style={styles.symbol}>◈</Text>
        <Text style={styles.title}>Route DNA</Text>
        <Text style={styles.subtitle}>
          あなたの通勤路を学習した{'\n'}専用フィルタ
        </Text>
      </View>

      {routeProfiles.length === 0 ? (
        <EmptyState />
      ) : (
        <View style={styles.list}>
          {routeProfiles.map((p, i) => (
            <RouteCard key={p.id} profile={p} index={i} />
          ))}
        </View>
      )}
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
    gap: SPACING.sm,
  },
  symbol: { fontSize: 28, color: COLORS.shieldCore },
  title: { ...TYPOGRAPHY.heading2, color: COLORS.textPrimary },
  subtitle: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24 },
  list: { paddingHorizontal: SPACING.lg, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '30',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineName: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  sessionCount: { ...TYPOGRAPHY.caption, color: COLORS.shieldCore },
  duration: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  noiseRow: { gap: 6 },
  noiseLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  noiseTrack: { height: 2, backgroundColor: COLORS.bgSecondary, borderRadius: 1, overflow: 'hidden' },
  noiseFill: { height: '100%', backgroundColor: COLORS.accentCalm, borderRadius: 1 },
  spikeNote: { ...TYPOGRAPHY.caption, color: COLORS.shieldGold },
  filterNote: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xl, gap: SPACING.lg },
  emptySymbol: { fontSize: 40, color: COLORS.shieldCore + '60' },
  emptyTitle: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary },
  emptyBody: { ...TYPOGRAPHY.body, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 26 },
  emptyHint: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, textAlign: 'center' },
});
