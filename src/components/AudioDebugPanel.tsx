/**
 * AudioDebugPanel — Real-train testing tool
 *
 * Shown only when __DEV__ === true or DEBUG_PANEL env flag is set.
 * Tester can hot-adjust all masking parameters without restarting session.
 * Includes 4-pattern notification trigger for Mind Weather testing.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { audioEngine, AudioDebugParams, DEFAULT_DEBUG_PARAMS } from '../engines/AudioEngine';
import { micEngine } from '../engines/MicEngine';
import { scheduleMindWeather } from '../engines/NotificationEngine';
import { buildMindWeatherPayload } from '../engines/ContextEngine';
import { useUNSStore } from '../store';
import { NotificationPattern } from '../types';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';

// ─── Notification test patterns ─────────────────────────────────────────────
const NOTIFICATION_PATTERNS: { pattern: NotificationPattern; label: string; score: number; trend: 'better' | 'same' | 'worse' }[] = [
  { pattern: 'fatigue',         label: '疲労蓄積',    score: 38, trend: 'worse' },
  { pattern: 'important_event', label: '重要な予定',  score: 60, trend: 'same'  },
  { pattern: 'good_condition',  label: '良好コンディション', score: 82, trend: 'better' },
  { pattern: 'default',         label: 'デフォルト',  score: 55, trend: 'same'  },
];

// ─── Slider row ─────────────────────────────────────────────────────────────
function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={sliderStyles.row}>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={sliderStyles.value}>{value.toFixed(step < 1 ? 2 : 0)}{unit}</Text>
      </View>
      <Slider
        style={sliderStyles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={COLORS.shieldCore}
        maximumTrackTintColor={COLORS.textMuted}
        thumbTintColor={COLORS.shieldGold}
      />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  row: { gap: 2 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { ...TYPOGRAPHY.debug, color: COLORS.textMuted },
  value: { ...TYPOGRAPHY.debug, color: COLORS.debugAccent },
  slider: { height: 28 },
});

// ─── Main Debug Panel ────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onToggle: () => void;
}

export function AudioDebugPanel({ visible, onToggle }: Props) {
  const [params, setParams] = useState<AudioDebugParams>({ ...DEFAULT_DEBUG_PARAMS });
  const [notifSent, setNotifSent] = useState<NotificationPattern | null>(null);
  const lastSessionDebugLog = useUNSStore((s) => s.lastSessionDebugLog);
  const noiseLevel = useUNSStore((s) => s.noiseLevel);

  const updateParam = useCallback(<K extends keyof AudioDebugParams>(
    key: K,
    value: AudioDebugParams[K]
  ) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      audioEngine.updateDebugParams({ [key]: value });
      return next;
    });
  }, []);

  const resetParams = useCallback(() => {
    setParams({ ...DEFAULT_DEBUG_PARAMS });
    audioEngine.updateDebugParams(DEFAULT_DEBUG_PARAMS);
  }, []);

  const triggerNotification = useCallback(async (
    pattern: NotificationPattern,
    score: number,
    trend: 'better' | 'same' | 'worse'
  ) => {
    const payload = buildMindWeatherPayload(score, trend, null);
    // Override pattern for test
    const testPayload = { ...payload, pattern };
    await scheduleMindWeather(testPayload).catch(() => {});
    setNotifSent(pattern);
    setTimeout(() => setNotifSent(null), 2000);
  }, []);

  // Toggle button — always visible even when panel is collapsed
  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.toggle} onPress={onToggle}>
        <Text style={styles.toggleText}>
          {visible ? '▲ DEBUG' : '▼ DEBUG'}
        </Text>
      </Pressable>

      {visible && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>

          {/* ── Mic diagnostics ── */}
          <Text style={styles.section}>MIC DIAGNOSTICS</Text>
          <View style={styles.micRow}>
            <Text style={styles.micLabel}>Raw dB</Text>
            <Text style={styles.micValue}>{micEngine.diagnostics.rawDb.toFixed(1)} dB</Text>
          </View>
          <View style={styles.micRow}>
            <Text style={styles.micLabel}>Normalized</Text>
            <Text style={styles.micValue}>{noiseLevel.toFixed(3)}</Text>
          </View>
          <View style={styles.micRow}>
            <Text style={styles.micLabel}>Undefined rate</Text>
            <Text style={styles.micValue}>
              {(micEngine.diagnostics.undefinedRate * 100).toFixed(1)}% ({micEngine.diagnostics.totalSamples} samples)
            </Text>
          </View>

          {/* ── Audio parameters ── */}
          <Text style={styles.section}>AUDIO PARAMS</Text>

          <ParamSlider
            label="Drone Volume ×"
            value={params.droneVolMultiplier}
            min={0} max={2} step={0.05} unit="×"
            onChange={(v) => updateParam('droneVolMultiplier', v)}
          />
          <ParamSlider
            label="Drone Ramp Speed"
            value={params.lowFreqRampMs}
            min={100} max={2000} step={50} unit=" ms"
            onChange={(v) => updateParam('lowFreqRampMs', v)}
          />
          <ParamSlider
            label="High-Freq Threshold"
            value={params.highFreqThreshold}
            min={0.3} max={1.0} step={0.02} unit=""
            onChange={(v) => updateParam('highFreqThreshold', v)}
          />

          <Pressable style={styles.resetBtn} onPress={resetParams}>
            <Text style={styles.resetText}>RESET TO DEFAULT</Text>
          </Pressable>

          {/* ── Notification patterns ── */}
          <Text style={[styles.section, { marginTop: SPACING.md }]}>MIND WEATHER — FIRE TEST</Text>
          <Text style={styles.notifNote}>
            通知は即時スケジュール。{'\n'}
            端末のロック画面 / 通知センターで確認できます。
          </Text>

          <View style={styles.notifGrid}>
            {NOTIFICATION_PATTERNS.map(({ pattern, label, score, trend }) => (
              <Pressable
                key={pattern}
                style={[
                  styles.notifBtn,
                  notifSent === pattern && styles.notifBtnSent,
                ]}
                onPress={() => triggerNotification(pattern, score, trend)}
              >
                <Text style={styles.notifBtnText}>{label}</Text>
                {notifSent === pattern && (
                  <Text style={styles.sentLabel}>✓ 送信</Text>
                )}
              </Pressable>
            ))}
          </View>

          {/* ── Current param dump ── */}
          <Text style={[styles.section, { marginTop: SPACING.md }]}>CURRENT STATE</Text>
          <Text style={styles.dump}>{JSON.stringify(params, null, 2)}</Text>

          {/* ── Last session log ── */}
          {lastSessionDebugLog && (
            <>
              <Text style={[styles.section, { marginTop: SPACING.md }]}>SESSION LOG</Text>
              <Text style={styles.dump}>{lastSessionDebugLog}</Text>
            </>
          )}

        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
  },
  toggle: {
    backgroundColor: COLORS.bgDebug + 'EE',
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderTopWidth: 0.5,
    borderColor: COLORS.debugAccent + '60',
    alignItems: 'center',
  },
  toggleText: { ...TYPOGRAPHY.debug, color: COLORS.debugAccent },

  panel: {
    backgroundColor: COLORS.bgDebug + 'F5',
    maxHeight: 400,
    borderTopWidth: 0.5,
    borderColor: COLORS.debugAccent + '40',
  },
  panelContent: {
    padding: SPACING.md,
    gap: SPACING.sm,
  },

  section: {
    ...TYPOGRAPHY.debug,
    color: COLORS.debugAccent,
    letterSpacing: 2,
    marginBottom: 2,
    marginTop: SPACING.xs,
  },

  resetBtn: {
    marginTop: SPACING.xs,
    paddingVertical: 6,
    borderWidth: 0.5,
    borderColor: COLORS.debugAccent + '60',
    borderRadius: 4,
    alignItems: 'center',
  },
  resetText: { ...TYPOGRAPHY.debug, color: COLORS.debugAccent },

  notifNote: {
    ...TYPOGRAPHY.debug,
    color: COLORS.textMuted,
    lineHeight: 16,
    marginBottom: SPACING.xs,
  },
  notifGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  notifBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: COLORS.shieldCore + '60',
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notifBtnSent: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.success + '15',
  },
  notifBtnText: { ...TYPOGRAPHY.debug, color: COLORS.textSecondary },
  sentLabel: { ...TYPOGRAPHY.debug, color: COLORS.success },

  dump: {
    ...TYPOGRAPHY.debug,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  micRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 2,
  },
  micLabel: { ...TYPOGRAPHY.debug, color: COLORS.textMuted },
  micValue: { ...TYPOGRAPHY.debug, color: COLORS.shieldCore },
});
