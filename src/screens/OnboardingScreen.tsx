import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useUNSStore } from '../store';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';
import {
  requestLocationPermission,
  getNextEventTitle,
} from '../engines/ContextEngine';
import { requestNotificationPermission } from '../engines/NotificationEngine';
import { audioEngine } from '../engines/AudioEngine';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');

// ─── Step definitions ────────────────────────────────────────────────────────
interface Step {
  id: string;
  symbol: string;
  headline: string;
  body: string;
  cta: string;
  skip?: string;
  isPermission?: boolean;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    symbol: '◉',
    headline: 'あなただけの聖域へ',
    body:
      '都市の騒音を、脳の栄養に変える。\nUrban Noise Sanctuary は、\n移動時間を「脳のトリートメント」に変えるツールです。',
    cta: '体験してみる',
  },
  {
    id: 'experience',
    symbol: '∿',
    headline: '音の体験から始まります',
    body:
      'まず、今この瞬間だけのSanctuaryを展開します。\n設定は一切不要です。\nイヤホンを装着して、次へ進んでください。',
    cta: '音を聴く',
  },
  {
    id: 'health',
    symbol: '♡',
    headline: 'あなたのリズムを感知する',
    body:
      'Apple Watchの心拍データを使うと、\nあなた専用の音響処方が可能になります。\n\nデータはiPhoneの中にのみ保存されます。\n1バイトも外部に出ません。',
    cta: '接続する',
    skip: 'あとで',
    isPermission: true,
  },
  {
    id: 'calendar',
    headline: '次の予定に合わせてギアを変える',
    symbol: '◫',
    body:
      '予定の時刻を読み取ることで、\n到着前に脳のモードが自動的に切り替わります。\n\n予定の内容は読みません。\n時刻と場所のみを使用します。',
    cta: '許可する',
    skip: 'スキップ',
    isPermission: true,
  },
  {
    id: 'notification',
    symbol: '✦',
    headline: 'Mind Weatherをお届けする',
    body:
      '毎朝一度、今日のあなたの\n「脳のコンディション予報」をお届けします。\n\n1日1回、朝のみ。\nいつでもOFFにできます。',
    cta: '通知を受け取る',
    skip: 'あとで',
    isPermission: true,
  },
  {
    id: 'ready',
    symbol: '⟡',
    headline: 'Sanctuary、準備完了',
    body:
      'あなたのiPhoneの中に、\nプライベートな聖域が生まれました。\n\n東京の騒音は、もうあなたを乱しません。',
    cta: '聖域へ入る',
  },
];

// ─── Single step view ────────────────────────────────────────────────────────
function StepView({
  step,
  onNext,
  onSkip,
}: {
  step: Step;
  onNext: () => void;
  onSkip?: () => void;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(500).springify()} style={stepStyles.container}>
      <Text style={stepStyles.symbol}>{step.symbol}</Text>
      <Text style={stepStyles.headline}>{step.headline}</Text>
      <Text style={stepStyles.body}>{step.body}</Text>

      <View style={stepStyles.buttons}>
        <Pressable style={stepStyles.cta} onPress={onNext}>
          <LinearGradient
            colors={[COLORS.shieldCore + 'CC', COLORS.shieldRing + '88']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Text style={stepStyles.ctaText}>{step.cta}</Text>
        </Pressable>

        {onSkip && (
          <Pressable style={stepStyles.skipBtn} onPress={onSkip}>
            <Text style={stepStyles.skipText}>{step.skip}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const stepStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xl,
  },
  symbol: {
    fontSize: 36,
    color: COLORS.shieldCore,
    letterSpacing: 4,
  },
  headline: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
  },
  body: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
  },
  buttons: {
    width: '100%',
    gap: SPACING.md,
    alignItems: 'center',
  },
  cta: {
    width: '100%',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ctaText: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, letterSpacing: 1.5 },
  skipBtn: { paddingVertical: SPACING.sm },
  skipText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1 },
});

// ─── Progress dots ────────────────────────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={dotsStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[dotsStyles.dot, i === current && dotsStyles.dotActive]}
        />
      ))}
    </View>
  );
}

const dotsStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.textMuted },
  dotActive: { backgroundColor: COLORS.shieldCore, width: 16 },
});

// ─── Main Onboarding Screen ──────────────────────────────────────────────────
export default function OnboardingScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const { completeOnboarding } = useUNSStore();
  const bedPlayingRef = React.useRef(false);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // Stop onboarding bed when leaving onboarding
  useEffect(() => {
    return () => {
      if (bedPlayingRef.current) {
        audioEngine.stopOnboardingBed().catch(() => {});
        bedPlayingRef.current = false;
      }
    };
  }, []);

  const handleNext = async () => {
    await Haptics.selectionAsync();

    if (step.id === 'experience') {
      // Step 2: request audio + start Deep Forest bed immediately
      // This is the "これはすごい" moment — sound starts before any further action
      await Audio.requestPermissionsAsync();
      await audioEngine.init();
      await audioEngine.preload();
      audioEngine.startOnboardingBed().catch(() => {});
      bedPlayingRef.current = true;
    } else if (step.id === 'health') {
      // HealthKit — native module would go here
    } else if (step.id === 'calendar') {
      await getNextEventTitle();
    } else if (step.id === 'notification') {
      await requestNotificationPermission();
    }

    if (isLast) {
      // Fade out bed — session audio takes over in SanctuaryScreen
      audioEngine.stopOnboardingBed().catch(() => {});
      bedPlayingRef.current = false;
      completeOnboarding();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleSkip = () => {
    setStepIndex((i) => i + 1);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[COLORS.gradientTop, COLORS.gradientBottom]}
        style={StyleSheet.absoluteFill}
      />

      <ProgressDots total={STEPS.length} current={stepIndex} />

      <StepView
        key={step.id}
        step={step}
        onNext={handleNext}
        onSkip={step.skip ? handleSkip : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: 80,
    paddingBottom: 48,
  },
});
