#!/usr/bin/env node
/**
 * generate-binaural-beats.js
 *
 * Generates true stereo binaural beat WAV files.
 * Each file carries a DIFFERENT frequency on the Left vs Right channel:
 *   - L channel: baseHz (e.g. 200 Hz)
 *   - R channel: baseHz + beatHz (e.g. 206 Hz)
 *
 * The brain perceives the difference (beatHz) as a phantom oscillation —
 * this is the binaural beat. The effect requires headphones/earbuds.
 *
 * Psychoacoustic rationale:
 *   calm     Δ=6 Hz  → theta-adjacent  — deep calm, cortisol reduction
 *   focus    Δ=12 Hz → alpha           — clear focus without tension
 *   activate Δ=18 Hz → low beta        — alert without anxiety
 *
 * Loop design:
 *   - 5-second files with 50ms linear fade-in/out at both ends
 *   - Fade eliminates the click artifact at expo-av's loop point
 *   - The binaural effect is perceptually continuous even across loops
 *     (the brain's auditory cortex tracks beat frequency, not file phase)
 *
 * Output format: 44100 Hz, 16-bit PCM, stereo (2-channel interleaved)
 * File size: ≈ 1.7 MB per file × 3 = ≈ 5 MB total
 *
 * Usage: node scripts/generate-binaural-beats.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Parameters ─────────────────────────────────────────────────────────────
const SAMPLE_RATE  = 44100;
const BIT_DEPTH    = 16;
const NUM_CHANNELS = 2;          // stereo — mandatory for true binaural
const DURATION_S   = 5;          // loop length
const AMPLITUDE    = 0.085;      // ~8.5% of full scale; layered under drone/bed
const FADE_S       = 0.05;       // 50ms fade; prevents click at loop boundary

const MAX_INT16 = 32767;
const NOISE_MIX = 0.35;  // pink noise relative to sine (masks "electronic pee" tone)

// ─── Self-contained PRNG (duplicated from generate-audio.js — standalone script)
function createRNG(seed) {
  let s = (seed >>> 0) || 1;
  return {
    rand() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xFFFFFFFF; },
    white() { return this.rand() * 2 - 1; },
  };
}

function createPinkNoise(seed) {
  const rng = createRNG(seed);
  const NUM_ROWS = 12;
  const rows = new Float32Array(NUM_ROWS);
  let runningSum = 0, index = 0;
  for (let i = 0; i < NUM_ROWS; i++) { rows[i] = rng.white(); runningSum += rows[i]; }
  return function nextPink() {
    index++;
    let n = index, numZeros = 0;
    while ((n & 1) === 0 && numZeros < NUM_ROWS - 1) { n >>= 1; numZeros++; }
    runningSum -= rows[numZeros];
    rows[numZeros] = rng.white();
    runningSum += rows[numZeros];
    return (runningSum + rng.white()) / (NUM_ROWS + 1);
  };
}

// ─── Mode configs ─────────────────────────────────────────────────────────────
const CONFIGS = [
  {
    name:        'binaural_calm',
    freqL:       200,
    freqR:       206,
    description: 'Theta-adjacent 6 Hz — deep calm, cortisol reduction',
  },
  {
    name:        'binaural_focus',
    freqL:       210,
    freqR:       222,
    description: 'Alpha 12 Hz — clear focus, cognitive clarity',
  },
  {
    name:        'binaural_activate',
    freqL:       220,
    freqR:       238,
    description: 'Low beta 18 Hz — alert, energised without anxiety',
  },
];

// ─── WAV writer ──────────────────────────────────────────────────────────────
function writeWav(outputPath, audioData, sampleRate, numChannels, bitDepth) {
  const dataSize   = audioData.length;
  const headerSize = 44;
  const file       = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  file.write('RIFF', 0, 'ascii');
  file.writeUInt32LE(36 + dataSize, 4);
  file.write('WAVE', 8, 'ascii');

  // fmt chunk
  file.write('fmt ', 12, 'ascii');
  file.writeUInt32LE(16, 16);                                           // chunk size
  file.writeUInt16LE(1, 20);                                            // PCM
  file.writeUInt16LE(numChannels, 22);
  file.writeUInt32LE(sampleRate, 24);
  file.writeUInt32LE(sampleRate * numChannels * (bitDepth / 8), 28);   // byte rate
  file.writeUInt16LE(numChannels * (bitDepth / 8), 32);                // block align
  file.writeUInt16LE(bitDepth, 34);

  // data chunk
  file.write('data', 36, 'ascii');
  file.writeUInt32LE(dataSize, 40);
  audioData.copy(file, 44);

  fs.writeFileSync(outputPath, file);
}

// ─── Audio generator ─────────────────────────────────────────────────────────
function generateStereoSines(freqL, freqR) {
  const numSamples  = Math.round(DURATION_S * SAMPLE_RATE);
  const fadeSamples = Math.round(FADE_S * SAMPLE_RATE);
  const buffer = Buffer.alloc(numSamples * NUM_CHANNELS * 2);

  // Pink noise texture — masks the "electronic pee" quality of pure sines.
  // Independent L/R seeds; the noise does NOT contribute to the binaural beat
  // (only the sine frequency difference does).
  const pinkL = createPinkNoise(0xB1A1);
  const pinkR = createPinkNoise(0xB1A2);

  // One-pole lowpass at 400 Hz — removes distracting high-frequency noise
  const lpAlpha = 2 * Math.PI * 400 / SAMPLE_RATE;
  let lpStateL = 0, lpStateR = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // Sine tones — different frequency each channel (the binaural beat)
    const sineL = Math.sin(2 * Math.PI * freqL * t);
    const sineR = Math.sin(2 * Math.PI * freqR * t);

    // Filtered pink noise — soft texture layer
    lpStateL += lpAlpha * (pinkL() - lpStateL);
    lpStateR += lpAlpha * (pinkR() - lpStateR);

    const rawL = sineL + lpStateL * NOISE_MIX;
    const rawR = sineR + lpStateR * NOISE_MIX;

    // Linear fade envelope — click-proof loop boundary
    let env = 1.0;
    if (i < fadeSamples) {
      env = i / fadeSamples;
    } else if (i >= numSamples - fadeSamples) {
      env = (numSamples - i) / fadeSamples;
    }

    const sampleL = Math.max(-32768, Math.min(MAX_INT16, Math.round(rawL * AMPLITUDE * env * MAX_INT16)));
    const sampleR = Math.max(-32768, Math.min(MAX_INT16, Math.round(rawR * AMPLITUDE * env * MAX_INT16)));

    const offset = i * NUM_CHANNELS * 2;
    buffer.writeInt16LE(sampleL, offset);
    buffer.writeInt16LE(sampleR, offset + 2);
  }

  return buffer;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const outputDir = path.join(__dirname, '..', 'assets', 'audio');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('');
console.log('UNS Binaural Beat Generator');
console.log('═══════════════════════════════════════════');
console.log(`  Sample rate : ${SAMPLE_RATE} Hz`);
console.log(`  Bit depth   : ${BIT_DEPTH}-bit PCM`);
console.log(`  Duration    : ${DURATION_S}s loop + ${FADE_S * 1000}ms fade in/out`);
console.log(`  Amplitude   : ${(AMPLITUDE * 100).toFixed(1)}% FS`);
console.log('');

for (const cfg of CONFIGS) {
  const outputPath  = path.join(outputDir, `${cfg.name}.wav`);
  const audioData   = generateStereoSines(cfg.freqL, cfg.freqR);
  writeWav(outputPath, audioData, SAMPLE_RATE, NUM_CHANNELS, BIT_DEPTH);

  const sizeMB = ((44 + audioData.length) / 1024 / 1024).toFixed(2);
  console.log(`  ✓ ${cfg.name}.wav`);
  console.log(`      L: ${cfg.freqL} Hz  R: ${cfg.freqR} Hz  Δ: ${cfg.freqR - cfg.freqL} Hz`);
  console.log(`      ${cfg.description}`);
  console.log(`      → ${outputPath}  (${sizeMB} MB)`);
  console.log('');
}

console.log('Done. Restart the Expo dev server to pick up the new assets.');
console.log('');
