/**
 * HRVStaleBanner
 *
 * Shown on SanctuaryScreen (idle state only) when Apple Watch HRV data
 * is real but older than 1 hour. Invites the user to take a fresh
 * measurement before starting the session — framed not as a data task
 * but as a personal "調律（チューニング）" ritual.
 *
 * Copywriting principle:
 *   Target: 自分磨き層 (25–38F) who respond to beauty and self-investment,
 *   not to precision metrics.
 *   → "調律を行う" (perform a tuning) vs. "計測する" (take a measurement)
 *   → "最適な聖域を構築" (build the optimal sanctuary) vs. "精度が上がる"
 *
 * Behaviour:
 *   - Tap banner → opens Apple Health app (closest public entry to Watch HRV)
 *   - ×  button  → immediate dismiss, no reappearance this session
 *   - Auto-dismiss after 10 seconds if untouched
 *   - Never blocks session start
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { CalibrationGuideModal } from './CalibrationGuideModal';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';

const AUTO_DISMISS_MS = 10_000;

interface Props {
  stalenessMins: number;
  onDismiss: () => void;
}

export function HRVStaleBanner({ stalenessMins, onDismiss }: Props) {
  const opacity = useSharedValue(0);
  const dismissedRef = useRef(false);
  const [guideVisible, setGuideVisible] = useState(false);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    opacity.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) runOnJS(onDismiss)();
    });
  };

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
    const timer = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Tapping the banner opens the step-by-step CalibrationGuideModal,
  // which then guides the user to Watch → Mindfulness and opens Health.
  const handleTap = () => setGuideVisible(true);

  const ageLabel =
    stalenessMins < 60
      ? `${stalenessMins}分前`
      : `${Math.floor(stalenessMins / 60)}時間前`;

  return (
    <>
    <CalibrationGuideModal
      visible={guideVisible}
      onClose={() => { setGuideVisible(false); dismiss(); }}
    />
    <Animated.View style={[styles.container, animStyle]}>
      <Pressable style={styles.body} onPress={handleTap}>
        <Text style={styles.glyphText}>⌚</Text>
        <View style={styles.textCol}>
          <Text style={styles.primary}>
            今のあなたに最適な聖域を構築するために。
          </Text>
          <Text style={styles.secondary}>
            Watchで1分間の
            <Text style={styles.accent}>調律（計測）</Text>
            を行いませんか？{'\n'}
            <Text style={styles.muted}>最終計測：{ageLabel}  →  タップでヘルスケアを開く</Text>
          </Text>
        </View>
      </Pressable>

      <Pressable onPress={dismiss} hitSlop={14} style={styles.closeBtn}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '50',
    marginHorizontal: SPACING.xl,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  glyphText: {
    fontSize: 22,
    opacity: 0.75,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  primary: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    letterSpacing: 0.6,
    lineHeight: 17,
  },
  secondary: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  accent: {
    color: COLORS.shieldActive,
  },
  muted: {
    color: COLORS.textMuted,
    fontSize: 10,
  },
  closeBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
});
