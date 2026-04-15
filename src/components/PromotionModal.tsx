/**
 * PromotionModal — "Always Allow" location permission escalation
 *
 * Shown exactly once when Route DNA fires its first "recognized" event
 * (ROUTE_RECOGNITION_THRESHOLD sessions completed).
 *
 * Design principles:
 *   - No pressure: "後で" is equally visible as the accept button
 *   - Explains the benefit concretely (auto-start 3 min before arrival)
 *   - Lacquer-black theme, ultra-thin type — same as the rest of UNS
 *   - Never shown at onboarding: only surfaces after the user has already
 *     experienced Route DNA working, so the value prop is self-evident
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import * as Location from 'expo-location';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { useUNSStore } from '../store';

// ─── Icon — minimal route "DNA" glyph ────────────────────────────────────────
function RouteDNAGlyph() {
  return (
    <View style={glyphStyles.container}>
      <Text style={glyphStyles.symbol}>◈</Text>
      <View style={glyphStyles.badge}>
        <Text style={glyphStyles.badgeText}>✓</Text>
      </View>
    </View>
  );
}

const glyphStyles = StyleSheet.create({
  container: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 52, color: COLORS.shieldActive, opacity: 0.9 },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, color: COLORS.bg, fontWeight: '600' },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────
export function PromotionModal() {
  const { showLocationPromotion, setShowLocationPromotion } = useUNSStore();

  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);

  useEffect(() => {
    if (showLocationPromotion) {
      opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) });
      translateY.value = withDelay(
        80,
        withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) })
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(20, { duration: 200 });
    }
  }, [showLocationPromotion]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const handleAccept = async () => {
    setShowLocationPromotion(false);

    if (Platform.OS === 'ios') {
      // iOS: requestBackgroundPermissionsAsync triggers the system dialog
      // which lets the user choose "Always Allow" from the location permission sheet.
      // The dialog appears only if current permission is "WhenInUse".
      await Location.requestBackgroundPermissionsAsync().catch(() => {});
    }
    // Android: background location requires a separate permission request.
    // On Android 11+, requestBackgroundPermissionsAsync opens the system settings page.
    // Behavior is identical — expo-location handles the platform difference.
  };

  const handleDismiss = () => {
    setShowLocationPromotion(false);
  };

  if (!showLocationPromotion) return null;

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      {/* Scrim */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Card */}
      <View style={styles.centerer} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>

          <RouteDNAGlyph />

          <Text style={styles.headline}>
            あなたの通勤ルートを{'\n'}マスターしました。
          </Text>

          <Text style={styles.body}>
            これからはアプリを開かなくても、駅に着く{' '}
            <Text style={styles.accent}>3分前</Text>
            {' '}から自動で聖域の準備を開始できます。
          </Text>

          <Text style={styles.subBody}>
            位置情報の設定を「常に許可」に変更することで、バックグラウンドでRoute DNAが学習を継続し、毎日の通勤が完全に自動化されます。
          </Text>

          <View style={styles.privacyNote}>
            <Text style={styles.privacyText}>
              位置情報は端末内でのみ処理されます。外部に送信されることはありません。
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.5 }]}
              onPress={handleDismiss}
            >
              <Text style={styles.btnSecondaryText}>後で</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.8 }]}
              onPress={handleAccept}
            >
              <Text style={styles.btnPrimaryText}>常に許可に変更</Text>
            </Pressable>
          </View>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40,
    paddingHorizontal: SPACING.xl,
  },
  card: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: COLORS.shieldActive + '30',
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  headline: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  body: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  accent: {
    color: COLORS.shieldActive,
    fontWeight: '400',
  },
  subBody: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    letterSpacing: 0.5,
  },
  privacyNote: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    width: '100%',
  },
  privacyText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    opacity: 0.7,
    letterSpacing: 0.3,
  },
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    width: '100%',
    marginTop: SPACING.sm,
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
    letterSpacing: 1,
  },
  btnPrimary: {
    flex: 2,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.shieldActive + '18',
    borderWidth: 0.5,
    borderColor: COLORS.shieldActive + '80',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    ...TYPOGRAPHY.body,
    color: COLORS.shieldActive,
    letterSpacing: 0.8,
  },
});
