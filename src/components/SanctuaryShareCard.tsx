import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, MODE_CONFIG } from '../constants/theme';
import type { SanctuarySession } from '../types';

interface Props {
  session: SanctuarySession;
  narrative?: string;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${seconds > 0 ? `${seconds}秒` : ''}`;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}.${m}.${day}`;
}

/**
 * SanctuaryShareCard
 *
 * A branded visual card rendered off-screen (via ViewShot)
 * and captured as an image for social sharing.
 *
 * Fixed 1080×1350 logical layout (4:5 — Instagram-friendly).
 * The ViewShot container scales this down for the actual capture.
 */
export const SanctuaryShareCard = forwardRef<View, Props>(
  function SanctuaryShareCard({ session, narrative }, ref) {
    const duration = session.endedAt
      ? formatDuration(session.endedAt - session.startedAt)
      : formatDuration(session.durationMs);

    const modeConfig = MODE_CONFIG[session.mode];
    const date = formatDate(session.startedAt);

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <LinearGradient
          colors={['#0A0A0B', '#091422', '#0D1520']}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Top accent line */}
        <View style={[styles.accentLine, { backgroundColor: modeConfig.color }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.symbol}>✦</Text>
          <Text style={styles.appName}>Urban Noise Sanctuary</Text>
          <Text style={styles.date}>{date}</Text>
        </View>

        {/* Center — duration prominence */}
        <View style={styles.center}>
          <View style={styles.dividerThin} />
          <Text style={styles.modeLabel}>{modeConfig.labelJa}</Text>
          <Text style={styles.duration}>{duration}</Text>
          <Text style={styles.durationSub}>保護しました</Text>
          <View style={styles.dividerThin} />
        </View>

        {/* Narrative */}
        {narrative ? (
          <View style={styles.narrativeContainer}>
            <Text style={styles.narrative}>{narrative}</Text>
          </View>
        ) : (
          <View style={styles.narrativeContainer}>
            <Text style={styles.narrative}>街の音から、守られた時間。</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={[styles.footerDot, { backgroundColor: modeConfig.color }]} />
          <Text style={styles.footerText}>通勤が、消える体験</Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width: 360,
    height: 450,
    overflow: 'hidden',
    borderRadius: 16,
  },
  accentLine: {
    width: '100%',
    height: 3,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    gap: 6,
  },
  symbol: {
    fontSize: 20,
    color: COLORS.shieldGold,
    letterSpacing: 4,
  },
  appName: {
    fontSize: 13,
    fontWeight: '300',
    letterSpacing: 3,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 11,
    fontWeight: '300',
    letterSpacing: 2,
    color: COLORS.textMuted,
    opacity: 0.7,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 10,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '300',
    letterSpacing: 2,
    color: COLORS.textSecondary,
  },
  duration: {
    fontSize: 42,
    fontWeight: '200',
    letterSpacing: 4,
    color: COLORS.textPrimary,
  },
  durationSub: {
    fontSize: 13,
    fontWeight: '300',
    letterSpacing: 2,
    color: COLORS.textSecondary,
  },
  dividerThin: {
    width: 40,
    height: 0.5,
    backgroundColor: COLORS.textMuted,
  },
  narrativeContainer: {
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  narrative: {
    fontSize: 14,
    fontWeight: '200',
    lineHeight: 24,
    letterSpacing: 1,
    color: COLORS.shieldGold,
    textAlign: 'center',
    opacity: 0.85,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '300',
    letterSpacing: 2,
    color: COLORS.textMuted,
  },
});
