/**
 * UNS Mic Engine — realtime microphone amplitude analysis
 *
 * Uses expo-av Audio.Recording with isMeteringEnabled to capture dB levels
 * from the device microphone at 200ms intervals.
 *
 * dB → normalized (0–1) mapping:
 *   expo-av metering returns dBFS (full-scale), typically -160 to 0 dB.
 *   Calibrated to real urban commute environment:
 *     DB_FLOOR (-72 dB)  → 0.0  — silent room, no significant noise
 *     DB_CEIL  (-10 dB)  → 1.0  — loud spike (brakes, station announcement)
 *     Typical train ride: -50 to -25 dB → 0.30 to 0.65
 *
 * Concurrency note:
 *   AudioEngine.init() sets allowsRecordingIOS: true (PlayAndRecord session).
 *   Recording and Sound playback can therefore coexist without interruption.
 *   Route: earphone mic → MicEngine → noiseLevel → AudioEngine response.
 *
 * Spike detection:
 *   Rising-edge only — triggers onSpike() once when level crosses
 *   NOISE_THRESHOLD.highFreqSpike (0.72) from below, preventing repeated
 *   bell chimes during sustained loud events.
 */

import { Audio } from 'expo-av';
import { useEffect, useRef } from 'react';
import { useUNSStore } from '../store';
import { audioEngine } from './AudioEngine';
import { NOISE_THRESHOLD } from '../constants/theme';

// Polling interval — matches useDemoNoiseSweep cadence
const POLL_INTERVAL_MS = 200;

// dB calibration points for urban commute
const DB_FLOOR = -72; // silence
const DB_CEIL  = -10; // loud spike

function dbToNormalized(db: number): number {
  if (db <= DB_FLOOR) return 0;
  if (db >= DB_CEIL)  return 1;
  return (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR);
}

// ─── MicEngine class ─────────────────────────────────────────────────────────

class MicEngineClass {
  private recording: Audio.Recording | null = null;
  private isRunning = false;
  private prevLevel = 0;
  private onLevelCb: ((level: number) => void) | null = null;
  private onSpikeCb: (() => void) | null = null;

  /** Diagnostic counters — exposed for AudioDebugPanel */
  rawDb = -160;
  normalizedLevel = 0;
  private _meteringUndefinedCount = 0;
  private _meteringTotalCount = 0;

  /**
   * Start microphone capture.
   * Silently no-ops if permission is not granted or already running.
   */
  async start(
    onLevel: (level: number) => void,
    onSpike: () => void,
  ): Promise<void> {
    if (this.isRunning) return;

    // Mic permission must be granted during onboarding — verify before using
    const { granted } = await Audio.getPermissionsAsync();
    if (!granted) {
      console.warn('[MicEngine] Microphone permission not granted');
      return;
    }

    this.onLevelCb = onLevel;
    this.onSpikeCb = onSpike;

    try {
      const rec = new Audio.Recording();

      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      // Register status callback before startAsync so no samples are missed
      rec.setOnRecordingStatusUpdate(this.handleStatus);
      rec.setProgressUpdateInterval(POLL_INTERVAL_MS);

      await rec.startAsync();

      this.recording = rec;
      this.isRunning = true;
      this._meteringUndefinedCount = 0;
      this._meteringTotalCount = 0;
      console.log(`[MicEngine] Started — calibration: floor=${DB_FLOOR}dB, ceil=${DB_CEIL}dB, poll=${POLL_INTERVAL_MS}ms`);
    } catch (err) {
      console.warn('[MicEngine] Failed to start recording:', err);
      this.recording = null;
      this.onLevelCb  = null;
      this.onSpikeCb  = null;
    }
  }

  /**
   * Stop microphone capture and release resources.
   * Safe to call even if not running.
   */
  async stop(): Promise<void> {
    this.isRunning  = false;
    this.prevLevel  = 0;
    this.onLevelCb  = null;
    this.onSpikeCb  = null;

    const rec = this.recording;
    this.recording = null;

    if (rec) {
      try {
        rec.setOnRecordingStatusUpdate(null);
        await rec.stopAndUnloadAsync();
      } catch {
        // stopAndUnloadAsync can throw if already stopped — safe to ignore
      }
    }
  }

  // ─── Internal status callback ─────────────────────────────────────────────

  private handleStatus = (status: Audio.RecordingStatus): void => {
    if (!this.isRunning) return;
    this._meteringTotalCount++;

    if (!status.isRecording || status.metering === undefined) {
      this._meteringUndefinedCount++;
      // Log every 50th undefined to avoid spam but keep visibility
      if (this._meteringUndefinedCount % 50 === 1) {
        console.warn(
          `[MicEngine] metering undefined — ${this._meteringUndefinedCount}/${this._meteringTotalCount} samples (${Math.round(100 * this._meteringUndefinedCount / this._meteringTotalCount)}%)`,
        );
      }
      return;
    }

    const level = dbToNormalized(status.metering);

    // Expose raw values for AudioDebugPanel
    this.rawDb = status.metering;
    this.normalizedLevel = level;

    this.onLevelCb?.(level);

    // Rising-edge spike detection — threshold can be hot-adjusted from DebugPanel
    const threshold = audioEngine.getDebugParams().highFreqThreshold;
    if (level >= threshold && this.prevLevel < threshold) {
      this.onSpikeCb?.();
    }
    this.prevLevel = level;
  };

  get isActive(): boolean {
    return this.isRunning;
  }

  /** Diagnostic snapshot for AudioDebugPanel. */
  get diagnostics() {
    return {
      rawDb: this.rawDb,
      normalized: this.normalizedLevel,
      undefinedRate: this._meteringTotalCount > 0
        ? this._meteringUndefinedCount / this._meteringTotalCount
        : 0,
      totalSamples: this._meteringTotalCount,
    };
  }
}

export const micEngine = new MicEngineClass();

// ─── React hook — drop-in replacement for useDemoNoiseSweep ─────────────────
//
// Usage in SanctuaryScreen (replace useDemoNoiseSweep call):
//   useMicNoise(isActive, onSpike);
//
// When isActive is false: mic is stopped, noiseLevel is reset to 0.
// When isActive is true:  mic captures ambient levels → setNoiseLevel() + AudioEngine.

export function useMicNoise(
  isActive: boolean,
  onSpike: () => void,
): void {
  const { setNoiseLevel } = useUNSStore();

  // Stable ref for onSpike to avoid restarting the effect on every render
  const onSpikeRef = useRef(onSpike);
  onSpikeRef.current = onSpike;

  useEffect(() => {
    if (!isActive) {
      setNoiseLevel(0);
      return;
    }

    const handleLevel = (level: number) => {
      setNoiseLevel(level);
      audioEngine.onExternalNoise(level);
    };

    const handleSpike = () => {
      audioEngine.onHighFreqSpike();
      onSpikeRef.current();
    };

    micEngine.start(handleLevel, handleSpike).catch(() => {});

    return () => {
      // Stop mic and reset UI level when session ends or component unmounts
      micEngine.stop().catch(() => {});
      setNoiseLevel(0);
    };
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps
  // setNoiseLevel is stable (Zustand action), intentionally excluded to
  // prevent spurious restarts. onSpike changes are handled via ref above.
}
