/**
 * PaywallModal — shown when the free tier (30 min/month) is exhausted.
 *
 * Design principles:
 *  - Not coercive. The close button (×) is always visible — Apple requires this.
 *  - Honest pricing up front: ¥680/月 before the user taps anything.
 *  - Maternal tone matching the rest of the app — never "UPGRADE NOW".
 *  - Shows exactly how many free minutes remain (if any) so the user
 *    can make an informed decision.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';

import {
  getMonthlyPackage,
  purchaseMonthly,
  restorePurchases,
  remainingFreeMinutes,
  MONTHLY_FREE_LIMIT_MS,
} from '../engines/PurchaseEngine';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import type { SanctuarySession } from '../types';

const { width } = Dimensions.get('window');

// ─── Feature bullets ─────────────────────────────────────────────────────────
const FEATURES = [
  { symbol: '∿', text: '通勤のたびに、騒音が消える' },
  { symbol: '⟡', text: 'あなたの回復パターンが見える' },
  { symbol: '◉', text: '今後のすべての新機能を先行体験' },
];

// ─── PaywallModal ─────────────────────────────────────────────────────────────

interface PaywallModalProps {
  visible: boolean;
  sessions: SanctuarySession[];
  onClose: () => void;
  onPurchased: () => void;
}

export function PaywallModal({
  visible,
  sessions,
  onClose,
  onPurchased,
}: PaywallModalProps) {
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [isLoadingPkg, setIsLoadingPkg] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const remaining     = remainingFreeMinutes(sessions);
  const isExhausted   = remaining === 0;
  const usedMinutes   = Math.floor(MONTHLY_FREE_LIMIT_MS / 60_000) - remaining;

  // Fetch package when modal opens
  useEffect(() => {
    if (!visible) return;
    setIsLoadingPkg(true);
    getMonthlyPackage()
      .then(setPkg)
      .catch(() => setPkg(null))
      .finally(() => setIsLoadingPkg(false));
  }, [visible]);

  const handlePurchase = useCallback(async () => {
    if (!pkg) return;
    try {
      setIsPurchasing(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const success = await purchaseMonthly(pkg);
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPurchased();
      }
    } catch (err: unknown) {
      // Only show alert for genuine errors, not user-cancelled
      const anyErr = err as Record<string, unknown>;
      if (!anyErr?.userCancelled) {
        Alert.alert(
          '購入できませんでした',
          'もう一度お試しいただくか、設定 → 以前の購入を復元 をお試しください。',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setIsPurchasing(false);
    }
  }, [pkg, onPurchased]);

  const handleRestore = useCallback(async () => {
    try {
      setIsRestoring(true);
      await Haptics.selectionAsync();
      const success = await restorePurchases();
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPurchased();
      } else {
        Alert.alert(
          '復元できる購入が見つかりません',
          '以前のご購入はこのApple IDに紐付けられていない可能性があります。',
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert('エラー', 'しばらくしてからもう一度お試しください。', [{ text: 'OK' }]);
    } finally {
      setIsRestoring(false);
    }
  }, [onPurchased]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <LinearGradient
          colors={[COLORS.gradientTop, '#091830']}
          style={StyleSheet.absoluteFill}
        />

        {/* Close button — always visible (App Store requirement) */}
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>

        <Animated.View entering={FadeInDown.duration(500).springify()} style={styles.content}>

          {/* Header */}
          <Text style={styles.symbol}>⟡</Text>
          <Text style={styles.title}>Sanctuary Premium</Text>

          {/* Usage status */}
          {isExhausted ? (
            <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.usageBox}>
              <Text style={styles.usageExhaustedText}>
                今月の聖域を、使い切りました。
              </Text>
              <Text style={styles.usageSubText}>
                {usedMinutes}分間、あなたの聖域を守りました。{'\n'}
                来月1日にリセットされます。
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.usageBox}>
              <Text style={styles.usageText}>
                今月の残り: あと
                <Text style={styles.usageHighlight}> {remaining}分</Text>
              </Text>
              <Text style={styles.usageSubText}>
                毎日の通勤を聖域にするには、Premiumへ。
              </Text>
            </Animated.View>
          )}

          {/* Feature list */}
          <Animated.View entering={FadeIn.delay(350).duration(400)} style={styles.features}>
            {FEATURES.map(({ symbol, text }, i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={styles.featureSymbol}>{symbol}</Text>
                <Text style={styles.featureText}>{text}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Price */}
          <Animated.View entering={FadeIn.delay(500).duration(400)} style={styles.priceArea}>
            {isLoadingPkg ? (
              <ActivityIndicator color={COLORS.shieldCore} />
            ) : (
              <>
                <Text style={styles.price}>
                  {pkg?.product.priceString ?? '¥680'}<Text style={styles.pricePer}>/月</Text>
                </Text>
                <Text style={styles.priceSub}>いつでもキャンセル可能</Text>
              </>
            )}
          </Animated.View>

          {/* CTA */}
          <Animated.View entering={FadeIn.delay(600).duration(400)} style={styles.actions}>
            <Pressable
              style={[styles.purchaseBtn, (!pkg || isPurchasing) && styles.btnDisabled]}
              onPress={handlePurchase}
              disabled={!pkg || isPurchasing}
            >
              <LinearGradient
                colors={[COLORS.shieldCore + 'CC', COLORS.shieldRing + '99']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              {isPurchasing ? (
                <ActivityIndicator color={COLORS.textPrimary} />
              ) : (
                <Text style={styles.purchaseBtnText}>聖域を手に入れる</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.restoreBtn}
              onPress={handleRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator color={COLORS.textMuted} size="small" />
              ) : (
                <Text style={styles.restoreBtnText}>以前の購入を復元</Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Legal note */}
          <Text style={styles.legal}>
            購入はApple IDに請求されます。サブスクリプションは期間終了の24時間前までに
            解約しない限り、自動的に更新されます。
          </Text>

        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 56,
    paddingBottom: 40,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 22,
    color: COLORS.textMuted,
    lineHeight: 26,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  symbol: {
    fontSize: 32,
    color: COLORS.shieldCore,
  },
  title: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    letterSpacing: 3,
  },
  usageBox: {
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    width: '100%',
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '30',
  },
  usageExhaustedText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  usageText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  usageHighlight: {
    color: COLORS.shieldCore,
    fontWeight: '300' as const,
  },
  usageSubText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  features: {
    width: '100%',
    gap: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  featureSymbol: {
    fontSize: 16,
    color: COLORS.shieldCore,
    width: 20,
    textAlign: 'center',
  },
  featureText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    flex: 1,
  },
  priceArea: {
    alignItems: 'center',
    gap: 4,
    minHeight: 48,
    justifyContent: 'center',
  },
  price: {
    fontSize: 34,
    fontWeight: '200' as const,
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  pricePer: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  priceSub: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  actions: {
    width: '100%',
    gap: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  purchaseBtn: {
    width: width - SPACING.xl * 2,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnDisabled: { opacity: 0.4 },
  purchaseBtnText: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.textPrimary,
    letterSpacing: 2,
  },
  restoreBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreBtnText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 1,
  },
  legal: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    opacity: 0.5,
    textAlign: 'center',
    lineHeight: 16,
    fontSize: 10,
    paddingHorizontal: SPACING.md,
  },
});
