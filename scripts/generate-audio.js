/**
 * UNS Placeholder Audio Generator
 *
 * Generates WAV placeholder files for all 7 audio assets.
 * These are functional placeholder files for EAS Development Build testing.
 * Replace with professionally produced audio before App Store submission.
 *
 * Run: node scripts/generate-audio.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BIT_DEPTH   = 16;
const CHANNELS    = 1;    // mono — binaural is handled by AudioEngine panning logic
const MAX_INT16   = 32767;

const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');

// ─── WAV writer ─────────────────────────────────────────────────────────────
function writeWav(filename, samples) {
  const dataBytes = samples.length * 2; // 16-bit = 2 bytes per sample
  const buf = Buffer.alloc(44 + dataBytes);

  // RIFF header
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');

  // fmt chunk
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);           // chunk size
  buf.writeUInt16LE(1,  20);           // PCM = 1
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * BIT_DEPTH / 8, 28); // byte rate
  buf.writeUInt16LE(CHANNELS * BIT_DEPTH / 8, 32);               // block align
  buf.writeUInt16LE(BIT_DEPTH, 34);

  // data chunk
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * MAX_INT16), 44 + i * 2);
  }

  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, buf);
  const mb = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`  ✓ ${filename.padEnd(36)} ${mb} MB  (${samples.length} samples, ${(samples.length / SAMPLE_RATE).toFixed(1)}s)`);
}

// ─── Signal generators ───────────────────────────────────────────────────────

function sine(t, hz) {
  return Math.sin(2 * Math.PI * hz * t);
}

// Linear crossfade: value at start of loop = value at end → seamless loop
function loopFade(i, total, window = 0.005) {
  const fadeLen = Math.floor(total * window);
  if (i < fadeLen) return i / fadeLen;
  if (i > total - fadeLen) return (total - i) / fadeLen;
  return 1;
}

// Exponential decay: amplitude envelope for percussive sounds
function expDecay(t, tau) {
  return Math.exp(-t / tau);
}

// Pseudo-random from seed (deterministic, no Math.random dependency)
let _seed = 0xDEADBEEF;
function seededRand() {
  _seed ^= _seed << 13;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5;
  return (_seed >>> 0) / 0xFFFFFFFF;
}

// ─── Asset generators ────────────────────────────────────────────────────────

/**
 * drone_deep.wav
 * 100 Hz fundamental + 200 Hz 2nd harmonic (gentle warmth)
 * 30 seconds — loops seamlessly (100 × 30 = 3000 full cycles)
 */
function genDroneDeep() {
  const DURATION = 30;
  const N = DURATION * SAMPLE_RATE;
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const fade = loopFade(i, N);
    samples[i] = fade * (
      sine(t, 100) * 0.60 +
      sine(t, 200) * 0.15 +
      sine(t, 50)  * 0.12    // sub-bass rumble
    );
  }
  writeWav('drone_deep.wav', samples);
}

/**
 * drone_mid.wav
 * 250 Hz + 500 Hz (inharmonic warmth), gentle 0.3 Hz tremolo
 * 30 seconds — loops seamlessly
 */
function genDroneMid() {
  const DURATION = 30;
  const N = DURATION * SAMPLE_RATE;
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const tremolo = 1 + 0.08 * sine(t, 0.3);  // subtle vibrato
    const fade = loopFade(i, N);
    samples[i] = fade * tremolo * (
      sine(t, 250) * 0.45 +
      sine(t, 500) * 0.18 +
      sine(t, 375) * 0.10    // perfect 5th — fills the mid space
    );
  }
  writeWav('drone_mid.wav', samples);
}

/**
 * bell_chime.wav
 * 880 Hz with inharmonic partials — sounds like a small temple bell
 * 2 seconds, exponential decay τ=0.35s
 */
function genBellChime() {
  const DURATION = 2.0;
  const N = Math.floor(DURATION * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = expDecay(t, 0.35);
    samples[i] = env * (
      sine(t, 880)  * 0.55 +   // fundamental
      sine(t, 2637) * 0.20 +   // 3rd partial (inharmonic — bell character)
      sine(t, 4400) * 0.08 +   // 5th partial
      sine(t, 1320) * 0.12     // 2nd partial (warmth)
    );
  }
  writeWav('bell_chime.wav', samples);
}

/**
 * nature_bed.wav
 * Layered inharmonic sine waves — 1/f approximation ("synthetic stream")
 * 60 seconds, slow 0.1 Hz amplitude modulation, loops seamlessly
 *
 * Rationale: true noise requires filtering, but summing many inharmonic
 * partials at 1/f amplitudes creates a perceptually similar "shush" quality
 * that is useful as a calm ambient presence.
 */
function genNatureBed() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const samples = new Float32Array(N);

  // Inharmonic frequencies — chosen to avoid obvious pitch center
  const layers = [
    { hz: 312, amp: 0.18 }, { hz: 487, amp: 0.14 }, { hz: 623, amp: 0.11 },
    { hz: 789, amp: 0.09 }, { hz: 941, amp: 0.07 }, { hz: 1124, amp: 0.06 },
    { hz: 1387, amp: 0.05 }, { hz: 1623, amp: 0.04 }, { hz: 1891, amp: 0.03 },
    { hz: 2143, amp: 0.025 }, { hz: 2401, amp: 0.02 }, { hz: 2789, amp: 0.015 },
    // Ultra-low "breath" layers
    { hz: 87,  amp: 0.08 }, { hz: 143, amp: 0.07 }, { hz: 213, amp: 0.06 },
  ];

  // Random per-layer phase offsets (deterministic)
  _seed = 0xC0FFEE;
  const phases = layers.map(() => seededRand() * 2 * Math.PI);

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const breathe = 1 + 0.12 * sine(t, 0.1);   // very slow swell
    const fade = loopFade(i, N, 0.02);
    let s = 0;
    for (let j = 0; j < layers.length; j++) {
      s += Math.sin(2 * Math.PI * layers[j].hz * t + phases[j]) * layers[j].amp;
    }
    samples[i] = fade * breathe * s * 0.55;
  }
  writeWav('nature_bed.wav', samples);
}

/**
 * shield_open.wav
 * Rising frequency sweep 150 → 1200 Hz with amplitude ramp
 * 1.5 seconds — Sanctuary activation SFX
 */
function genShieldOpen() {
  const DURATION = 1.5;
  const N = Math.floor(DURATION * SAMPLE_RATE);
  const samples = new Float32Array(N);
  const f0 = 150, f1 = 1200;
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / DURATION;
    // Logarithmic sweep for more natural pitch sensation
    const hz = f0 * Math.pow(f1 / f0, progress);
    const env = Math.sin(progress * Math.PI);   // envelope: 0 → peak → 0
    const phase = 2 * Math.PI * f0 * DURATION / Math.log(f1 / f0) *
                  (Math.pow(f1 / f0, progress) - 1);
    samples[i] = env * Math.sin(phase) * 0.65;
  }
  writeWav('shield_open.wav', samples);
}

/**
 * shield_close.wav
 * Falling frequency sweep 1200 → 150 Hz with amplitude fade
 * 1.2 seconds — Sanctuary deactivation SFX
 */
function genShieldClose() {
  const DURATION = 1.2;
  const N = Math.floor(DURATION * SAMPLE_RATE);
  const samples = new Float32Array(N);
  const f0 = 1200, f1 = 150;
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / DURATION;
    const hz = f0 * Math.pow(f1 / f0, progress);
    const env = 1 - progress;   // linear fade out
    const phase = 2 * Math.PI * f0 * DURATION / Math.log(f1 / f0) *
                  (Math.pow(f1 / f0, progress) - 1);
    samples[i] = env * Math.sin(phase) * 0.65;
  }
  writeWav('shield_close.wav', samples);
}

/**
 * onboarding_deep_forest.wav
 * Deep 60 Hz drone + forest harmonics + ultra-slow pulse
 * 60 seconds — loops seamlessly
 * This is the first sound the user hears. Must feel warm, safe, vast.
 */
function genOnboardingDeepForest() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const samples = new Float32Array(N);

  const forestLayers = [
    // Root — deep earth feeling
    { hz: 60,  amp: 0.35 }, { hz: 120, amp: 0.15 }, { hz: 180, amp: 0.08 },
    // Warmth mid band
    { hz: 240, amp: 0.06 }, { hz: 300, amp: 0.04 }, { hz: 360, amp: 0.03 },
    // Inharmonic shimmer (forest "air")
    { hz: 523, amp: 0.025 }, { hz: 659, amp: 0.02 }, { hz: 784, amp: 0.015 },
    { hz: 1047, amp: 0.01 },
  ];

  _seed = 0xFEEDBEEF;
  const phases = forestLayers.map(() => seededRand() * 2 * Math.PI);

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    // Very slow breath — like the forest itself breathing (0.05 Hz = 20s cycle)
    const breathe = 1 + 0.15 * sine(t, 0.05);
    const fade = loopFade(i, N, 0.03);
    let s = 0;
    for (let j = 0; j < forestLayers.length; j++) {
      s += Math.sin(2 * Math.PI * forestLayers[j].hz * t + phases[j]) * forestLayers[j].amp;
    }
    samples[i] = fade * breathe * s * 0.65;
  }
  writeWav('onboarding_deep_forest.wav', samples);
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('\nUNS Audio Generator — placeholder files for EAS build testing');
console.log('='.repeat(60));
console.log(`Output: ${OUT_DIR}\n`);

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const start = Date.now();

genDroneDeep();
genDroneMid();
genBellChime();
genNatureBed();
genShieldOpen();
genShieldClose();
genOnboardingDeepForest();

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n✓ All 7 files generated in ${elapsed}s`);
console.log('\nNext step: node scripts/generate-audio.js → eas build --profile development --platform ios');
