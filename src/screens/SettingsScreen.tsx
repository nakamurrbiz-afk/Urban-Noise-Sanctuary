import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import { useUNSStore } from '../store';
import { AudioDebugPanel } from '../components/AudioDebugPanel';
import { cancelMindWeather } from '../engines/NotificationEngine';
import { restorePurchases } from '../engines/PurchaseEngine';

const APP_VERSION = '0.1.0 (build 1)';

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ─── Settings row ─────────────────────────────────────────────────────────────
function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
    </Pressable>
  );
}

// ─── Settings row with toggle ─────────────────────────────────────────────────
function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: COLORS.bgCard, true: COLORS.shieldCore + '80' }}
        thumbColor={value ? COLORS.shieldCore : COLORS.textMuted}
        ios_backgroundColor={COLORS.bgCard}
      />
    </View>
  );
}

// ─── Hidden version tap counter ───────────────────────────────────────────────
// Tap the version string 5 times within 3 seconds to unlock Debug Panel.
// No visual feedback on intermediate taps — zero discoverability for regular users.
const DEBUG_TAP_THRESHOLD = 5;
const DEBUG_TAP_WINDOW_MS = 3000;

function VersionBadge() {
  const { isDebugUnlocked, setDebugUnlocked } = useUNSStore();
  const tapTimestamps = useRef<number[]>([]);
  const [debugVisible, setDebugVisible] = useState(false);

  const handleVersionTap = useCallback(() => {
    if (isDebugUnlocked) {
      // Already unlocked: toggle panel
      setDebugVisible((v) => !v);
      return;
    }

    const now = Date.now();
    tapTimestamps.current = [
      ...tapTimestamps.current.filter((t) => now - t < DEBUG_TAP_WINDOW_MS),
      now,
    ];

    if (tapTimestamps.current.length >= DEBUG_TAP_THRESHOLD) {
      tapTimestamps.current = [];
      setDebugUnlocked(true);
      setDebugVisible(true);
      // Minimal feedback — only visible once unlocked
      Alert.alert('', 'Debug Panel 解除', [{ text: 'OK', style: 'destructive' }]);
    }
  }, [isDebugUnlocked, setDebugUnlocked]);

  return (
    <>
      <Pressable onPress={handleVersionTap} hitSlop={12}>
        <Text style={styles.version}>{APP_VERSION}</Text>
      </Pressable>
      {isDebugUnlocked && (
        <AudioDebugPanel
          visible={debugVisible}
          onToggle={() => setDebugVisible((v) => !v)}
        />
      )}
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    hapticEnabled,
    setHapticEnabled,
    natureSound,
    setNatureSound,
    isPremium,
    setIsPremium,
  } = useUNSStore();

  const [isRestoring, setIsRestoring] = useState(false);

  // When notifications are disabled, cancel any pending Mind Weather notification
  const handleNotificationToggle = useCallback((enabled: boolean) => {
    setNotificationsEnabled(enabled);
    if (!enabled) {
      cancelMindWeather(); // fire-and-forget — failure is non-critical
    }
  }, [setNotificationsEnabled]);

  const handleRestorePurchases = useCallback(async () => {
    try {
      setIsRestoring(true);
      const success = await restorePurchases();
      if (success) {
        setIsPremium(true);
        Alert.alert('復元完了', 'Sanctuary Premiumが有効になりました。', [{ text: 'OK' }]);
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
  }, [setIsPremium]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>設定</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 通知 ── */}
        <SectionHeader title="通知" />
        <View style={styles.card}>
          <ToggleRow
            label="Mind Weather 通知"
            value={notificationsEnabled}
            onValueChange={handleNotificationToggle}
          />
          <View style={styles.divider} />
          <SettingsRow label="通知タイミング" value="通勤時間帯（07:45）" />
        </View>

        {/* ── サウンド ── */}
        <SectionHeader title="サウンド & 触覚" />
        <View style={styles.card}>
          <SettingsRow
            label="環境音"
            value={natureSound === 'wind' ? '風と葉擦れ' : '雨音'}
            onPress={() => setNatureSound(natureSound === 'wind' ? 'rain' : 'wind')}
          />
          <View style={styles.divider} />
          <ToggleRow
            label="シールド吸収 触覚フィードバック"
            value={hapticEnabled}
            onValueChange={setHapticEnabled}
          />
        </View>

        {/* ── プライバシー ── */}
        <SectionHeader title="プライバシー" />
        <View style={styles.card}>
          <SettingsRow label="ヘルスケア" value="心拍変動（HRV）" />
          <View style={styles.divider} />
          <SettingsRow label="カレンダー" value="タイトルのみ" />
          <View style={styles.divider} />
          <SettingsRow
            label="データ送信"
            value="なし（端末内処理のみ）"
          />
        </View>

        {/* ── サブスクリプション ── */}
        <SectionHeader title="サブスクリプション" />
        <View style={styles.card}>
          <SettingsRow
            label="プラン"
            value={isPremium ? 'Premium ◉' : '無料（月30分）'}
          />
          <View style={styles.divider} />
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={handleRestorePurchases}
            disabled={isRestoring}
          >
            <Text style={styles.rowLabel}>以前の購入を復元</Text>
            {isRestoring
              ? <ActivityIndicator color={COLORS.textMuted} size="small" />
              : <Text style={styles.restoreChevron}>›</Text>
            }
          </Pressable>
        </View>

        {/* ── 情報 ── */}
        <SectionHeader title="情報" />
        <View style={styles.card}>
          <SettingsRow label="利用規約" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingsRow label="プライバシーポリシー" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingsRow
            label="音声クレジット"
            onPress={() => Alert.alert(
              '音声クレジット',
              'このアプリでは以下の音声素材を使用しています。\n\n'
              + '• Forest Ambient LOOP by Imjeax\n'
              + '  freesound.org — CC BY 4.0\n\n'
              + '• Rain Loop by qubodup\n'
              + '  freesound.org — CC BY 3.0\n\n'
              + '• Bell at Daitokuji temple, Kyoto\n'
              + '  by nahmandub — CC0\n\n'
              + '• Big Singing Bowl by Garuda1982\n'
              + '  freesound.org — CC0\n\n'
              + '• Forest, trees rustling in the wind\n'
              + '  by arpeggio1980 — CC0\n\n'
              + '• Nighttime I — Pixabay License',
              [{ text: 'OK' }]
            )}
          />
        </View>

        {/* Version — hidden debug trigger */}
        <View style={styles.versionArea}>
          <VersionBadge />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 56,
  },
  title: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
    letterSpacing: 1.5,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: 48,
    gap: SPACING.sm,
  },
  sectionHeader: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    marginTop: SPACING.lg,
    marginBottom: 4,
  },
  card: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: COLORS.bgCard,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    minHeight: 50,
  },
  rowLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    flex: 1,
  },
  rowValue: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginLeft: SPACING.sm,
  },
  divider: {
    height: 0.5,
    backgroundColor: COLORS.bgCard,
    marginHorizontal: SPACING.lg,
  },
  restoreChevron: {
    fontSize: 20,
    color: COLORS.textMuted,
    lineHeight: 24,
  },
  versionArea: {
    alignItems: 'center',
    marginTop: SPACING.xl * 2,
    paddingBottom: SPACING.lg,
  },
  version: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    opacity: 0.4,
    letterSpacing: 1,
  },
});
