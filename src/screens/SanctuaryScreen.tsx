import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
  AppState,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { ShieldDisplay } from '../components/ShieldDisplay';
import { CompletionRitual } from '../components/CompletionRitual';
import { AudioDebugPanel } from '../components/AudioDebugPanel';
import { PaywallModal } from '../components/PaywallModal';
import { useUNSStore } from '../store';
import { audioEngine } from '../engines/AudioEngine';
import { useMicNoise } from '../engines/MicEngine';
import { selectMode, getNextEventTitle } from '../engines/ContextEngine';
import { isFreeTierExhausted } from '../engines/PurchaseEngine';
import { hrvEngine } from '../engines/HRVEngine';
import { sanctuaryOrchestrator } from '../engines/SanctuaryOrchestrator';
import { HRVStaleBanner } from '../components/HRVStaleBanner';
import { COLORS, TYPOGRAPHY, SPACING, MODE_CONFIG } from '../constants/theme';
import { SanctuaryMode } from '../types';

// Estimated battery drain during an active session (% per minute):
//   - expo-av audio playback:    ~0.067%/min
//   - background processing:     ~0.017%/min
//   Total:                       ~0.084%/min (~5%/hr)
// Conservative estimate for real-device testing feedback only.
const BATTERY_DRAIN_PCT_PER_MS = 0.084 / 60_000;

const { width } = Dimensions.get('window');

// useDemoNoiseSweep was here — removed in Phase 2.
// Real microphone input is now handled by useMicNoise (MicEngine.ts).

// ─── Mood prompt — for non-Watch users (HRV level = 'none') ─────────────────
// Maps user's self-reported feeling to the appropriate binaural mode.
// Shown above the mode selector when no HRV data is available.
type MoodKey = 'tired' | 'normal' | 'focus';

const MOOD_TO_MODE: Record<MoodKey, SanctuaryMode> = {
  tired:  'calm',
  normal: 'calm',
  focus:  'focus',
};

const MOODS: { key: MoodKey; label: string }[] = [
  { key: 'tired',  label: '疲れている' },
  { key: 'normal', label: 'ふつう' },
  { key: 'focus',  label: '集中したい' },
];

function MoodPrompt({
  selectedMood,
  onSelect,
}: {
  selectedMood: MoodKey | null;
  onSelect: (mood: MoodKey) => void;
}) {
  return (
    <View style={moodStyles.container}>
      <Text style={moodStyles.label}>今の気分は？</Text>
      <View style={moodStyles.row}>
        {MOODS.map(({ key, label }) => {
          const isSelected = selectedMood === key;
          return (
            <Pressable
              key={key}
              style={[moodStyles.pill, isSelected && moodStyles.pillSelected]}
              onPress={() => onSelect(key)}
            >
              <Text style={[moodStyles.pillText, isSelected && moodStyles.pillTextSelected]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const moodStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  label: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 1.5 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: COLORS.textMuted,
  },
  pillSelected: {
    borderColor: COLORS.shieldCore,
    backgroundColor: COLORS.shieldCore + '18',
  },
  pillText: { ...TYPOGRAPHY.caption, color: COLORS.textMuted },
  pillTextSelected: { color: COLORS.shieldCore },
});

// ─── Mode selector ────────────────────────────────────────────────────────────
function ModeSelector({
  currentMode,
  onSelect,
}: {
  currentMode: SanctuaryMode;
  onSelect: (mode: SanctuaryMode) => void;
}) {
  const modes: SanctuaryMode[] = ['calm', 'focus', 'activate'];
  return (
    <View style={modeStyles.container}>
      {modes.map((mode) => {
        const cfg = MODE_CONFIG[mode];
        const isSelected = mode === currentMode;
        return (
          <Pressable
            key={mode}
            style={[
              modeStyles.pill,
              isSelected && { borderColor: cfg.color, backgroundColor: cfg.color + '18' },
            ]}
            onPress={() => onSelect(mode)}
          >
            <Text style={[modeStyles.pillText, { color: isSelected ? cfg.color : COLORS.textMuted }]}>
              {cfg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const modeStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: SPACING.sm, justifyContent: 'center' },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: COLORS.textMuted,
  },
  pillText: { ...TYPOGRAPHY.caption },
});

// ─── Now Playing badge ────────────────────────────────────────────────────────
function NowPlayingBadge() {
  const dot = useSharedValue(1);
  useEffect(() => {
    dot.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 1400 }), withTiming(1, { duration: 1400 })),
      -1,
      false
    );
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value }));

  return (
    <View style={badgeStyles.container}>
      <Animated.View style={[badgeStyles.dot, dotStyle]} />
      <Text style={badgeStyles.text}>Sanctuary 稼働中</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.shieldActive },
  text: { ...TYPOGRAPHY.caption, color: COLORS.shieldActive, letterSpacing: 1.2 },
});

// ─── Level bar ────────────────────────────────────────────────────────────────
function LevelBar({ label, value, color }: { label: string; value: number; color: string }) {
  const barWidth = useSharedValue(0);
  useEffect(() => {
    barWidth.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 160 });
  }, [value]);
  const barStyle = useAnimatedStyle(() => ({ width: `${barWidth.value * 100}%` }));

  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <Animated.View style={[barStyles.fill, barStyle, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  label: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, width: 80, textAlign: 'right' },
  track: { flex: 1, height: 1.5, backgroundColor: COLORS.bgCard, borderRadius: 1, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 1 },
});

// ─── 調律完了トースト ─────────────────────────────────────────────────────────
function CalibrationSuccessToast({ visible }: { visible: boolean }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-8);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 500 });
      translateY.value = withTiming(0, { duration: 500 });
    } else {
      opacity.value = withTiming(0, { duration: 400 });
      translateY.value = withTiming(-8, { duration: 400 });
    }
  }, [visible]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[toastStyles.container, style]}>
      <Text style={toastStyles.icon}>◉</Text>
      <View>
        <Text style={toastStyles.primary}>あなたの聖域が、整いました。</Text>
        <Text style={toastStyles.secondary}>今日のあなた専用の音響空間を展開中</Text>
      </View>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: COLORS.shieldActive + '50',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.xl,
  },
  icon: { fontSize: 18, color: COLORS.shieldActive, opacity: 0.8 },
  primary: { ...TYPOGRAPHY.caption, color: COLORS.textPrimary, letterSpacing: 0.5 },
  secondary: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 0.3, marginTop: 2 },
});

// ─── Battery drain estimator (debug only) ────────────────────────────────────
function useBatteryEstimate(isActive: boolean, sessionStartedAt: number | null) {
  const [drainPct, setDrainPct] = useState(0);

  useEffect(() => {
    if (!isActive || sessionStartedAt === null) {
      setDrainPct(0);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Date.now() - sessionStartedAt;
      setDrainPct(Math.min(99, elapsed * BATTERY_DRAIN_PCT_PER_MS));
    }, 10_000);
    return () => clearInterval(interval);
  }, [isActive, sessionStartedAt]);

  return drainPct;
}

// ─── Battery meter bar (debug only) ──────────────────────────────────────────
function BatteryMeter({ drainPct }: { drainPct: number }) {
  const color =
    drainPct < 3 ? COLORS.success :
    drainPct < 6 ? COLORS.warning :
    COLORS.accentActivate;

  return (
    <View style={batteryStyles.container}>
      <Text style={batteryStyles.label}>推定消費バッテリー</Text>
      <View style={batteryStyles.track}>
        <View style={[batteryStyles.fill, { width: `${Math.min(100, drainPct * 10)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[batteryStyles.value, { color }]}>{drainPct.toFixed(2)}%</Text>
    </View>
  );
}

const batteryStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  label: { ...TYPOGRAPHY.debug, color: COLORS.debugAccent, width: 110 },
  track: {
    flex: 1,
    height: 3,
    backgroundColor: COLORS.bgCard,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  value: { ...TYPOGRAPHY.debug, width: 44, textAlign: 'right' },
});

// ─── Session narrative mapper ─────────────────────────────────────────────────
// Converts noise stats into poetic Japanese for the Completion Ritual.
// Maternal tone — consistent with Direction D ritual phrases.
function mapStatsToNarrative(avgNoise: number): string {
  // High noise (0.55+): acknowledge the harshness, affirm protection
  if (avgNoise >= 0.70) {
    const variants = [
      'かなり激しい環境でしたね。\nでも、あなたの脳は守られていました。',
      '嵐のような騒音の中でも、\n聖域はあなたを離しませんでした。',
    ];
    return variants[Math.floor(Date.now() / 60_000) % variants.length];
  }
  if (avgNoise >= 0.55) {
    const variants = [
      '今日は特に騒がしい環境でしたね。\nその中でもしっかり守れていましたよ。',
      '騒がしい車内でしたが、\nあなたの内側は静かなままでした。',
      '周りの音が強い日でしたね。\nバリアがしっかり仕事をしていました。',
    ];
    return variants[Math.floor(Date.now() / 60_000) % variants.length];
  }
  // Moderate noise (0.25–0.55): standard protection
  if (avgNoise >= 0.40) {
    const variants = [
      '今日もあなたの聖域は、\nちゃんと機能していましたよ。',
      '日常の騒音から、\n静かにあなたを守っていました。',
      'いつもの通勤を、\n少しだけ穏やかなものにできたなら。',
    ];
    return variants[Math.floor(Date.now() / 60_000) % variants.length];
  }
  if (avgNoise >= 0.25) {
    const variants = [
      '今日は比較的穏やかでしたね。\nそれでも、そばにいられてよかったです。',
      '静かな時間を、\nさらに深いものにできていたなら嬉しいです。',
    ];
    return variants[Math.floor(Date.now() / 60_000) % variants.length];
  }
  // Low noise (<0.25): gentle, intimate tone
  const variants = [
    '穏やかな移動でしたね。\nそっとあなたを包んでいられました。',
    'とても静かな時間でした。\nあなたの脳が、ゆっくり休めていますように。',
    '静寂に近い環境でしたね。\nそんな日もあなたのそばにいます。',
  ];
  return variants[Math.floor(Date.now() / 60_000) % variants.length];
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SanctuaryScreen() {
  const {
    sessionStatus,
    currentMode,
    currentSession,
    sessionHistory,
    noiseLevel,
    conditionTrend,
    showCompletion,
    startSession,
    endSession,
    dismissCompletion,
    setCurrentMode,
    isAudioReady,
    setAudioReady,
    isDebugUnlocked,
    setLastSessionDebugLog,
    lastSessionNarrative,
    setLastSessionNarrative,
    isPremium,
    setIsPremium,
    natureSound,
  } = useUNSStore();

  const isActive = sessionStatus === 'active';
  const lastSession = sessionHistory[0];

  // AbsorbTrigger: increments on every spike → ShieldDisplay fires absorb flash
  const [absorbTrigger, setAbsorbTrigger] = useState(0);
  const onSpike = useCallback(() => {
    setAbsorbTrigger((n) => n + 1);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  }, []);

  const [debugVisible, setDebugVisible] = useState(false);

  // Session noise accumulator — for avg noise stat in debug log
  const noiseSumRef   = useRef(0);
  const noiseCountRef = useRef(0);

  // HRV stale banner
  const [showHRVBanner, setShowHRVBanner] = useState(false);
  const [hrvStalenessMins, setHrvStalenessMins] = useState(0);

  // 調律成功トースト
  const [showCalibrationSuccess, setShowCalibrationSuccess] = useState(false);
  const prevHRVTimestampRef = useRef<number | null>(null);

  // Mood selector state — for non-Watch users (HRV level = 'none')
  const [selectedMood, setSelectedMood] = useState<MoodKey | null>(null);
  const showMoodPrompt = conditionTrend.level === 'none' && !isActive;

  // Paywall state — shown when free tier is exhausted
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (isActive) {
      setShowHRVBanner(false);
      return;
    }
    if (hrvEngine.isDataStale) {
      setHrvStalenessMins(hrvEngine.stalenessMins ?? 0);
      setShowHRVBanner(true);
    }
  }, [isActive]);

  // Detect HRV refresh when user returns from Health app ("調律完了")
  useEffect(() => {
    prevHRVTimestampRef.current = hrvEngine.lastMeasuredAt;

    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      const { count } = await getNextEventTitle();
      await hrvEngine.refresh(count);
      const newTimestamp = hrvEngine.lastMeasuredAt;
      if (
        newTimestamp !== null &&
        newTimestamp !== prevHRVTimestampRef.current
      ) {
        prevHRVTimestampRef.current = newTimestamp;
        setShowHRVBanner(false);
        setShowCalibrationSuccess(true);
        setTimeout(() => setShowCalibrationSuccess(false), 5_000);
      }
    });
    return () => sub.remove();
  }, []);

  // Accumulate noise samples for avg-noise stat (only during active session)
  useEffect(() => {
    if (!isActive) return;
    noiseSumRef.current   += noiseLevel;
    noiseCountRef.current += 1;
  }, [noiseLevel, isActive]);

  // Battery drain estimate — only computed when debug is unlocked
  const batteryDrain = useBatteryEstimate(
    isActive && isDebugUnlocked,
    isActive && isDebugUnlocked ? (currentSession?.startedAt ?? null) : null
  );

  // Phase 2: real microphone input replaces the demo sweep
  useMicNoise(isActive, onSpike);

  useEffect(() => {
    (async () => {
      try {
        await audioEngine.init();
        await audioEngine.preload();
      } catch (e) {
        console.warn('[SanctuaryScreen] Audio init failed, continuing:', e);
      }
      setAudioReady(true);  // always enable the button — session re-inits on activation
    })();
    return () => { audioEngine.cleanup(); };
  }, []);

  const handleMoodSelect = useCallback((mood: MoodKey) => {
    setSelectedMood(mood);
    setCurrentMode(MOOD_TO_MODE[mood]);
  }, [setCurrentMode]);

  const handleActivate = useCallback(async () => {
    // Free tier gate — premium users always pass
    if (!isPremium && isFreeTierExhausted(sessionHistory)) {
      setShowPaywall(true);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Reset per-session accumulators
    noiseSumRef.current   = 0;
    noiseCountRef.current = 0;
    setLastSessionNarrative(null);

    // If HRV data is available, auto-select mode from condition + next event.
    // If not (non-Watch user), use the mood-selected mode or default to calm.
    if (conditionTrend.level !== 'none') {
      const { title: nextEvent, count } = await getNextEventTitle();
      await hrvEngine.refresh(count);
      const trend = useUNSStore.getState().conditionTrend;
      const autoMode = selectMode(trend.score, nextEvent, new Date().getHours());
      setCurrentMode(autoMode);
      startSession(autoMode);
      await audioEngine.startSession(autoMode, undefined, natureSound);
    } else {
      // Non-Watch: use mood-selected mode, fall back to calm
      const modeToUse = selectedMood ? MOOD_TO_MODE[selectedMood] : 'calm';
      setCurrentMode(modeToUse);
      startSession(modeToUse);
      await audioEngine.startSession(modeToUse, undefined, natureSound);
    }

    // F-14: start Smart Mode transition timer for this session
    sanctuaryOrchestrator.startModeTransition();
  }, [startSession, setCurrentMode, conditionTrend.level, selectedMood, setLastSessionNarrative, natureSound]);

  // Called by PaywallModal after successful purchase — unlocks and auto-starts
  const handlePurchased = useCallback(() => {
    setIsPremium(true);
    setShowPaywall(false);
    // handleActivate will now pass the free-tier gate since isPremium is true
    handleActivate();
  }, [setIsPremium, handleActivate]);

  const handleDeactivate = useCallback(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Snapshot stats before endSession clears currentSession
    const durationMs  = Date.now() - (currentSession?.startedAt ?? Date.now());
    const avgNoiseRaw = noiseCountRef.current > 0
      ? noiseSumRef.current / noiseCountRef.current
      : 0;

    endSession();

    // Soft haptic fires the instant sound goes fully silent (before shield SFX)
    await audioEngine.endSession(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    });

    sanctuaryOrchestrator.stopModeTransition();

    // Narrative — maternal tone, never shows numbers
    const narrative = mapStatsToNarrative(avgNoiseRaw);
    setLastSessionNarrative(narrative);

    // Debug log — numeric details visible only when debug panel is unlocked
    if (isDebugUnlocked) {
      const durationSec = Math.round(durationMs / 1000);
      const mins        = Math.floor(durationSec / 60);
      const secs        = durationSec % 60;
      const batteryPct  = (durationMs * BATTERY_DRAIN_PCT_PER_MS).toFixed(2);

      const log = [
        `── SESSION LOG ─────────────────`,
        `Duration  : ${mins}分${secs}秒`,
        `Avg Noise : ${avgNoiseRaw.toFixed(3)}`,
        `Est. Batt : ${batteryPct}%`,
        `────────────────────────────────`,
      ].join('\n');

      console.log(log);
      setLastSessionDebugLog(log);
    }
  }, [endSession, currentSession, isDebugUnlocked, setLastSessionDebugLog, setLastSessionNarrative]);

  const handleModeSelect = useCallback(async (mode: SanctuaryMode) => {
    setCurrentMode(mode);
    if (isActive) await audioEngine.switchMode(mode);
  }, [isActive, setCurrentMode]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[COLORS.gradientTop, COLORS.gradientBottom]}
        style={StyleSheet.absoluteFill}
      />

      {/* Shield area */}
      <View style={styles.shieldArea}>
        <ShieldDisplay
          isActive={isActive}
          mode={currentMode}
          noiseLevel={noiseLevel}
          absorbTrigger={absorbTrigger}
        />

        {isActive ? (
          <NowPlayingBadge />
        ) : (
          <Text style={styles.idleLabel}>
            {isAudioReady ? '準備完了' : '起動中...'}
          </Text>
        )}
      </View>

      {/* 調律完了トースト — HRV fresh measurement detected on app return */}
      <CalibrationSuccessToast visible={showCalibrationSuccess} />

      {/* HRV stale banner — soft prompt to measure on Watch before session */}
      {!isActive && showHRVBanner && !showCalibrationSuccess && (
        <HRVStaleBanner
          stalenessMins={hrvStalenessMins}
          onDismiss={() => setShowHRVBanner(false)}
        />
      )}

      {/* Mood prompt — non-Watch users: self-report feeling → auto mode */}
      {showMoodPrompt && !showHRVBanner && (
        <MoodPrompt selectedMood={selectedMood} onSelect={handleMoodSelect} />
      )}

      {/* Level bars */}
      {isActive && (
        <View style={styles.levelBars}>
          <LevelBar label="外部ノイズ" value={noiseLevel} color={COLORS.warning} />
          <LevelBar label="Sanctuary" value={1 - noiseLevel * 0.55} color={COLORS.shieldActive} />
        </View>
      )}

      {/* Battery meter — debug only */}
      {isActive && isDebugUnlocked && (
        <BatteryMeter drainPct={batteryDrain} />
      )}

      {/* Mode selector */}
      <View style={styles.modeArea}>
        <Text style={styles.modeDesc}>{MODE_CONFIG[currentMode].description}</Text>
        <ModeSelector currentMode={currentMode} onSelect={handleModeSelect} />
      </View>

      {/* CTA */}
      <View style={styles.ctaArea}>
        {isActive ? (
          <Pressable style={styles.deactivateBtn} onPress={handleDeactivate}>
            <Text style={styles.deactivateText}>解除する</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.activateBtn, !isAudioReady && styles.btnDisabled]}
            onPress={isAudioReady ? handleActivate : undefined}
          >
            <LinearGradient
              colors={[MODE_CONFIG[currentMode].color + 'C8', MODE_CONFIG[currentMode].color + '80']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Text style={styles.activateText}>Sanctuaryを展開する</Text>
          </Pressable>
        )}
      </View>

      {/* Completion ritual */}
      {showCompletion && lastSession && (
        <CompletionRitual
          session={lastSession}
          narrative={lastSessionNarrative ?? undefined}
          onDismiss={dismissCompletion}
        />
      )}

      {/* Debug panel — DEV builds only, requires 5-tap unlock in Settings */}
      {__DEV__ && isDebugUnlocked && (
        <AudioDebugPanel
          visible={debugVisible}
          onToggle={() => setDebugVisible((v) => !v)}
        />
      )}

      {/* Paywall — shown when free tier (30 min/month) is exhausted */}
      <PaywallModal
        visible={showPaywall}
        sessions={sessionHistory}
        onClose={() => setShowPaywall(false)}
        onPurchased={handlePurchased}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  shieldArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    paddingTop: 56,
  },
  idleLabel: { ...TYPOGRAPHY.caption, color: COLORS.textMuted, letterSpacing: 2.5 },
  levelBars: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  modeArea: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  modeDesc: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, letterSpacing: 1.2 },
  ctaArea: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: 48,
    alignItems: 'center',
  },
  activateBtn: {
    width: width - SPACING.xl * 2,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnDisabled: { opacity: 0.35 },
  activateText: { ...TYPOGRAPHY.heading3, color: COLORS.textPrimary, letterSpacing: 1.5 },
  deactivateBtn: {
    width: width - SPACING.xl * 2,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: COLORS.textMuted,
  },
  deactivateText: { ...TYPOGRAPHY.heading3, color: COLORS.textSecondary, letterSpacing: 1.5 },
});
