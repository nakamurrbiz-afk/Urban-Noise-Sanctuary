/**
 * CalibrationGuideModal — Apple Watch "調律" ガイド
 *
 * Shown when the user taps HRVStaleBanner.
 * Walks them through exactly how to start a Mindfulness measurement on
 * Apple Watch, then opens the Health app on iPhone.
 *
 * Design principle:
 *   Don't make the user think. 3 illustrated steps + 1 tap to open Health.
 *   The "3タップの壁" that kills engagement is replaced by clear, ordered
 *   visual guidance — the measurement becomes a ritual, not a chore.
 *
 * Post-return UX:
 *   When the user comes back to UNS, SanctuaryScreen's AppState handler
 *   detects the fresh HRV timestamp and triggers the "調律完了" toast.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Linking,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';

const HEALTH_APP_URL = 'x-apple-health://';

// ─── Single instruction step ──────────────────────────────────────────────────
function Step({
  number,
  icon,
  instruction,
  delayMs,
}: {
  number: number;
  icon: string;
  instruction: string;
  delayMs: number;
}) {
  const opacity    = useSharedValue(0);
  const translateX = useSharedValue(-12);

  useEffect(() => {
    opacity.value    = withDelay(delayMs, withTiming(1, { duration: 400 }));
    translateX.value = withDelay(
      delayMs,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) }),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[stepStyles.row, style]}>
      <View style={stepStyles.numberBadge}>
        <Text style={stepStyles.numberText}>{number}</Text>
      </View>
      <Text style={stepStyles.icon}>{icon}</Text>
      <Text style={stepStyles.instruction}>{instruction}</Text>
    </Animated.View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  numberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.shieldCore + '30',
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.shieldCore,
    fontSize: 9,
    fontWeight: '400',
  },
  icon: { fontSize: 18, width: 26, textAlign: 'center' },
  instruction: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CalibrationGuideModal({ visible, onClose }: Props) {
  const overlayOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(60);

  useEffect(() => {
    if (visible) {
      overlayOpacity.value = withTiming(1, { duration: 300 });
      cardTranslateY.value = withTiming(0, {
        duration: 480,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      overlayOpacity.value = withTiming(0, { duration: 200 });
      cardTranslateY.value = withTiming(40, { duration: 200 });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle    = useAnimatedStyle(() => ({
    opacity:   overlayOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const handleOpenHealth = async () => {
    onClose();
    await Linking.openURL(HEALTH_APP_URL).catch(() => {});
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={styles.centerer} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.glyphLarge}>⌚</Text>
            <Text style={styles.title}>Watchで調律を行います</Text>
            <Text style={styles.subtitle}>
              Apple Watchの「マインドフルネス」アプリで{'\n'}
              1分間の計測を行うと、今のあなたに{'\n'}
              最適な聖域が構築されます。
            </Text>
          </View>

          {/* Steps */}
          <View style={styles.steps}>
            <Step number={1} icon="⌚" instruction="Apple Watchで Digital Crown を押す" delayMs={100} />
            <View style={styles.stepDivider} />
            <Step number={2} icon="🧘" instruction="「マインドフルネス」アプリを開く" delayMs={220} />
            <View style={styles.stepDivider} />
            <Step number={3} icon="▶" instruction="「リフレクト」または「呼吸」→ 開始をタップ" delayMs={340} />
            <View style={styles.stepDivider} />
            <Step number={4} icon="🔄" instruction="計測完了後、このアプリに戻る" delayMs={460} />
          </View>

          {/* Note */}
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              計測データは端末内でのみ処理されます。外部に送信されることはありません。
            </Text>
          </View>

          {/* CTA */}
          <View style={styles.btnArea}>
            <Pressable
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.5 }]}
              onPress={onClose}
            >
              <Text style={styles.btnSecondaryText}>後で</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.8 }]}
              onPress={handleOpenHealth}
            >
              <Text style={styles.btnPrimaryText}>ヘルスケアを開く</Text>
            </Pressable>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.72)' },
  centerer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 36,
    paddingHorizontal: SPACING.xl,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '30',
    padding: SPACING.xl,
    gap: SPACING.lg,
  },
  header: { alignItems: 'center', gap: SPACING.sm },
  glyphLarge: { fontSize: 40, opacity: 0.8 },
  title: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  steps: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  stepDivider: {
    height: 0.5,
    backgroundColor: COLORS.bgSecondary,
    marginLeft: 28 + SPACING.sm + 26 + SPACING.sm,
  },
  noteBox: {
    backgroundColor: COLORS.bgCard + '80',
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  noteText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 16,
  },
  btnArea: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  btnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  btnPrimary: {
    flex: 2,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.shieldCore + '18',
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.shieldCore,
    letterSpacing: 0.8,
  },
});
