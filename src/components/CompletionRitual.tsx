import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { SanctuarySession } from '../types';

const { height } = Dimensions.get('window');

interface Props {
  session: SanctuarySession;
  onDismiss: () => void;
  narrative?: string;   // poetic session summary; undefined = no extra line
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  if (minutes === 0) return `${seconds}秒`;
  return `${minutes}分${seconds > 0 ? `${seconds}秒` : ''}`;
}

export function CompletionRitual({ session, onDismiss, narrative }: Props) {
  const containerOpacity = useSharedValue(0);
  const line1Opacity = useSharedValue(0);
  const line2Opacity = useSharedValue(0);
  const line3Opacity = useSharedValue(0);
  const narrativeOpacity = useSharedValue(0);
  const summaryOpacity = useSharedValue(0);

  const duration = session.endedAt
    ? formatDuration(session.endedAt - session.startedAt)
    : formatDuration(session.durationMs);

  useEffect(() => {
    containerOpacity.value = withTiming(1, { duration: 600 });

    // Staggered text reveal — the "ritual" feel
    line1Opacity.value = withDelay(400,  withTiming(1, { duration: 800, easing: Easing.out(Easing.sin) }));
    line2Opacity.value = withDelay(1100, withTiming(1, { duration: 800 }));
    line3Opacity.value = withDelay(1900, withTiming(1, { duration: 1000 }));
    // Narrative fades in gently after the three ritual lines settle
    narrativeOpacity.value = withDelay(2900, withTiming(1, { duration: 1200, easing: Easing.out(Easing.sin) }));
    summaryOpacity.value   = withDelay(narrative ? 4200 : 3000, withTiming(1, { duration: 800 }));
  }, []);

  const containerStyle  = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));
  const line1Style      = useAnimatedStyle(() => ({ opacity: line1Opacity.value }));
  const line2Style      = useAnimatedStyle(() => ({ opacity: line2Opacity.value }));
  const line3Style      = useAnimatedStyle(() => ({ opacity: line3Opacity.value }));
  const narrativeStyle  = useAnimatedStyle(() => ({ opacity: narrativeOpacity.value }));
  const summaryStyle    = useAnimatedStyle(() => ({ opacity: summaryOpacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, containerStyle]}>
      <LinearGradient
        colors={[COLORS.bg + 'F8', COLORS.bgSecondary + 'FC']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {/* Ritual messages — staggered reveal */}
        <Animated.Text style={[styles.symbolText, line1Style]}>✦</Animated.Text>

        <Animated.Text style={[styles.ritualText, line1Style]}>
          お帰りなさい。
        </Animated.Text>

        <Animated.Text style={[styles.ritualText, line2Style]}>
          脳のバリアを{'\n'}解除しました。
        </Animated.Text>

        <Animated.Text style={[styles.ritualTextBold, line3Style]}>
          今のあなたは、{'\n'}誰よりもクリアです。
        </Animated.Text>

        {/* Narrative — poetic reflection of what the session encountered */}
        {narrative && (
          <Animated.Text style={[styles.narrativeText, narrativeStyle]}>
            {narrative}
          </Animated.Text>
        )}

        {/* Session summary */}
        <Animated.View style={[styles.summary, summaryStyle]}>
          <View style={styles.divider} />
          <Text style={styles.summaryLabel}>今回の移動</Text>
          {session.routeProfile && (
            <Text style={styles.summaryRoute}>
              {session.routeProfile.lineName}
            </Text>
          )}
          <Text style={styles.summaryDuration}>{duration}間　Sanctuary維持</Text>
          <View style={styles.divider} />
        </Animated.View>

        {/* Dismiss */}
        <Animated.View style={summaryStyle}>
          <Pressable style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>閉じる</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.lg,
  },
  symbolText: {
    fontSize: 24,
    color: COLORS.shieldGold,
    letterSpacing: 4,
  },
  ritualText: {
    ...TYPOGRAPHY.ritual,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  ritualTextBold: {
    fontSize: 20,
    fontWeight: '300' as const,
    lineHeight: 32,
    letterSpacing: 1.5,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  narrativeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.shieldGold,
    textAlign: 'center',
    letterSpacing: 0.8,
    lineHeight: 22,
    opacity: 0.85,
  },
  summary: {
    alignItems: 'center',
    gap: SPACING.sm,
    width: '100%',
  },
  divider: {
    width: 60,
    height: 0.5,
    backgroundColor: COLORS.textMuted,
  },
  summaryLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 2,
  },
  summaryRoute: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  summaryDuration: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  dismissButton: {
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderWidth: 0.5,
    borderColor: COLORS.textMuted,
    borderRadius: 24,
  },
  dismissText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
});
