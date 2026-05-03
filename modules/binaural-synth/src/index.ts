/**
 * BinauralSynth — Phase B real-time native synthesizer
 *
 * Generates independent sine waves on the Left and Right audio channels
 * via platform-native audio APIs:
 *   iOS:     AVAudioEngine + AVAudioSourceNode (render callback)
 *   Android: AudioTrack ENCODING_PCM_FLOAT (streaming mode)
 *
 * Falls back gracefully to Phase A (pre-generated stereo WAV files) when
 * the native module is unavailable (simulator, jest, or old devices).
 *
 * Exposed methods:
 *   start(freqL, freqR, amplitude)  — start synthesis
 *   stop()                          — stop and release audio resources
 *   setFrequencies(freqL, freqR)    — change frequencies mid-session
 *   setAmplitude(amplitude)         — change amplitude mid-session
 *   isAvailable()                   — false on simulators / jest
 */

import { requireNativeModule } from 'expo-modules-core';

interface NativeBinauralSynth {
  start(freqL: number, freqR: number, amplitude: number): Promise<void>;
  stop(): Promise<void>;
  setFrequencies(freqL: number, freqR: number): Promise<void>;
  setAmplitude(amplitude: number): Promise<void>;
  isAvailable(): boolean;
}

// Lazy singleton — avoid requireNativeModule at import time so that
// the module remains importable in Jest without crashing.
let _native: NativeBinauralSynth | null | undefined = undefined;

function getNative(): NativeBinauralSynth | null {
  if (_native === undefined) {
    try {
      _native = requireNativeModule<NativeBinauralSynth>('BinauralSynth');
    } catch {
      _native = null;  // mark permanently unavailable
    }
  }
  return _native;
}

export const BinauralSynth = {
  /**
   * Returns true when the native module is loaded and functional.
   * Use this before calling start() to decide whether to use Phase A fallback.
   */
  isAvailable(): boolean {
    return getNative() !== null;
  },

  /**
   * Starts real-time stereo synthesis.
   * @param freqL  Left channel frequency in Hz  (e.g. 200)
   * @param freqR  Right channel frequency in Hz  (e.g. 206 — 6Hz binaural beat)
   * @param amplitude  Linear gain 0.0–1.0 (use 0.085 for layered blend)
   */
  async start(freqL: number, freqR: number, amplitude: number): Promise<void> {
    const m = getNative();
    if (!m) return;
    return m.start(freqL, freqR, amplitude);
  },

  /** Stops synthesis and releases the audio session resources. */
  async stop(): Promise<void> {
    const m = getNative();
    if (!m) return;
    return m.stop();
  },

  /**
   * Updates frequencies while running — no click, sample-accurate update.
   * The render callback reads freqL/freqR atomically on every buffer.
   */
  async setFrequencies(freqL: number, freqR: number): Promise<void> {
    const m = getNative();
    if (!m) return;
    return m.setFrequencies(freqL, freqR);
  },

  /** Adjusts output amplitude mid-session (e.g. to duck during speech). */
  async setAmplitude(amplitude: number): Promise<void> {
    const m = getNative();
    if (!m) return;
    return m.setAmplitude(amplitude);
  },
};
