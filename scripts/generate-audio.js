/**
 * UNS Audio Generator — v2 Spatial Audio
 *
 * Generates stereo WAV files with algorithmic reverb, spatial processing,
 * and enriched spectral content for all 8 audio assets.
 *
 * Key improvements over v1:
 *   - Stereo output with L/R decorrelation for spatial width
 *   - Schroeder reverberator (4 comb + 2 allpass) for natural room ambience
 *   - Granular textures (irregular impulses) for organic nature sounds
 *   - Waveshaping (tanh) for analog warmth in drone layers
 *   - Attack transients and ring modulation for bell realism
 *
 * These remain development placeholders — replace with professionally
 * recorded/produced audio before App Store submission.
 *
 * Run: node scripts/generate-audio.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BIT_DEPTH   = 16;
const CHANNELS    = 2;
const MAX_INT16   = 32767;

const OUT_DIR = path.join(__dirname, '..', 'assets', 'audio');

// ─── Stereo WAV writer (L/R interleaved) ────────────────────────────────────

function writeWav(filename, stereo) {
  const frames    = stereo.left.length;
  const dataBytes = frames * CHANNELS * 2;
  const buf       = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');

  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * BIT_DEPTH / 8, 28);
  buf.writeUInt16LE(CHANNELS * BIT_DEPTH / 8, 32);
  buf.writeUInt16LE(BIT_DEPTH, 34);

  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < frames; i++) {
    const lc = Math.max(-1, Math.min(1, stereo.left[i]));
    const rc = Math.max(-1, Math.min(1, stereo.right[i]));
    buf.writeInt16LE(Math.round(lc * MAX_INT16), 44 + i * 4);
    buf.writeInt16LE(Math.round(rc * MAX_INT16), 44 + i * 4 + 2);
  }

  const filePath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filePath, buf);
  const mb = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`  ✓ ${filename.padEnd(36)} ${mb} MB  (${frames} frames, ${(frames / SAMPLE_RATE).toFixed(1)}s, stereo)`);
}

// ─── Self-contained PRNG ────────────────────────────────────────────────────
// Each generator gets its own RNG — no shared global state.

function createRNG(seed) {
  let s = (seed >>> 0) || 1;
  return {
    rand() {
      s ^= s << 13;
      s ^= s >> 17;
      s ^= s << 5;
      return (s >>> 0) / 0xFFFFFFFF;
    },
    white() { return this.rand() * 2 - 1; },
    // Exponential distribution (for natural amplitude variation)
    exponential(lambda) { return -Math.log(1 - this.rand()) / lambda; },
    // Uniform integer in [min, max]
    intBetween(min, max) { return min + Math.floor(this.rand() * (max - min + 1)); },
  };
}

// ─── Signal generators ──────────────────────────────────────────────────────

function sine(t, hz) {
  return Math.sin(2 * Math.PI * hz * t);
}

function sinePhase(t, hz, phase) {
  return Math.sin(2 * Math.PI * hz * t + phase);
}

function loopFade(i, total, window = 0.005) {
  const fadeLen = Math.floor(total * window);
  if (i < fadeLen) return i / fadeLen;
  if (i > total - fadeLen) return (total - i) / fadeLen;
  return 1;
}

function expDecay(t, tau) {
  return Math.exp(-t / tau);
}

// Soft-clip waveshaper — generates even harmonics (analog warmth)
function tanhShape(x, drive = 2.0) {
  return Math.tanh(x * drive);
}

// ─── Noise generators (self-contained state) ────────────────────────────────

function createPinkNoise(seed) {
  const rng = createRNG(seed);
  const NUM_ROWS = 12;
  const rows = new Float32Array(NUM_ROWS);
  let runningSum = 0;
  let index = 0;

  for (let i = 0; i < NUM_ROWS; i++) {
    rows[i] = rng.white();
    runningSum += rows[i];
  }

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

function createBrownNoise(seed) {
  const rng = createRNG(seed);
  let prev = 0;
  return function nextBrown() {
    prev = prev * 0.997 + rng.white() * 0.04;
    if (prev > 1) prev = 1;
    if (prev < -1) prev = -1;
    return prev;
  };
}

// ─── DSP: Schroeder reverberator ────────────────────────────────────────────
//
// 4 parallel comb filters → sum → 2 series allpass filters.
// L/R use slightly different delays for natural stereo width in the tail.

function createCombFilter(delayLen, feedback) {
  const buf = new Float32Array(delayLen);
  let idx = 0;
  return function(input) {
    const delayed = buf[idx];
    buf[idx] = input + delayed * feedback;
    idx = (idx + 1) % delayLen;
    return delayed;
  };
}

function createAllpassFilter(delayLen, feedback) {
  const buf = new Float32Array(delayLen);
  let idx = 0;
  return function(input) {
    const buffered = buf[idx];
    const output = -feedback * input + buffered;
    buf[idx] = input + feedback * buffered;
    idx = (idx + 1) % delayLen;
    return output;
  };
}

// 2nd-order resonant bandpass (biquad) — for formant coloring
function createResonator(centerHz, Q) {
  const w0 = 2 * Math.PI * centerHz / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = alpha, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return function(x) {
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
    return y;
  };
}

// ─── Noise band generator ──────────────────────────────────────────────────
// White noise → biquad bandpass → continuous-spectrum band at centerHz.
// Replaces sine oscillators for organic, non-periodic drone textures.
function createNoiseBand(seed, centerHz, Q) {
  const rng = createRNG(seed);
  const bp  = createResonator(centerHz, Q);
  return function next() { return bp(rng.white()); };
}

// ─── Sweepable bandpass (State Variable Filter) ────────────────────────────
// Per-sample frequency control for shield SFX noise sweeps.
// Hal Chamberlin / Andrew Simper SVF topology — stable with per-sample
// coefficient updates, unlike biquad which can ring on fast sweeps.
function createSweepableBandpass(Q) {
  let ic1eq = 0, ic2eq = 0;
  const k = 1 / Q;
  return {
    process(input, freqHz) {
      const g  = Math.tan(Math.PI * freqHz / SAMPLE_RATE);
      const a1 = 1 / (1 + g * (g + k));
      const a2 = g * a1;
      const a3 = g * a2;
      const v3 = input - ic2eq;
      const v1 = a1 * ic1eq + a2 * v3;
      const v2 = ic2eq + a2 * ic1eq + a3 * v3;
      ic1eq = 2 * v1 - ic1eq;
      ic2eq = 2 * v2 - ic2eq;
      return v1; // bandpass output
    },
  };
}

/**
 * Apply Schroeder reverb to a stereo signal.
 *
 * @param {Object} stereo     { left: Float32Array, right: Float32Array }
 * @param {Object} opts
 *   wetMix:   0–1, dry/wet balance
 *   feedback: comb filter feedback (controls RT60)
 *   loop:     if true, primes reverb with a full pass for seamless looping
 *   tailSec:  for non-loop (one-shot) sounds, seconds of reverb tail to append
 */
function applyReverb(stereo, { wetMix = 0.3, feedback = 0.88, loop = true, tailSec = 1.5 } = {}) {
  const frames = stereo.left.length;

  // Comb delays — prime-number-adjacent, slightly different L/R
  const combDelaysL = [1557, 1617, 1491, 1422];
  const combDelaysR = [1607, 1567, 1441, 1472];
  const allpassDelaysL = [225, 556];
  const allpassDelaysR = [241, 572];
  const apFeedback = 0.5;

  const combsL = combDelaysL.map(d => createCombFilter(d, feedback));
  const combsR = combDelaysR.map(d => createCombFilter(d, feedback));
  const apsL = allpassDelaysL.map(d => createAllpassFilter(d, apFeedback));
  const apsR = allpassDelaysR.map(d => createAllpassFilter(d, apFeedback));

  function processFrame(inL, inR) {
    let wL = 0, wR = 0;
    for (const c of combsL) wL += c(inL);
    for (const c of combsR) wR += c(inR);
    wL *= 0.25; wR *= 0.25;
    for (const a of apsL) wL = a(wL);
    for (const a of apsR) wR = a(wR);
    return [wL, wR];
  }

  if (loop) {
    // Pass 1: prime reverb state by running through entire signal (output discarded)
    for (let i = 0; i < frames; i++) {
      processFrame(stereo.left[i], stereo.right[i]);
    }
    // Pass 2: generate output with warmed-up reverb
    const outL = new Float32Array(frames);
    const outR = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      const [wL, wR] = processFrame(stereo.left[i], stereo.right[i]);
      outL[i] = stereo.left[i] * (1 - wetMix) + wL * wetMix;
      outR[i] = stereo.right[i] * (1 - wetMix) + wR * wetMix;
    }
    return { left: outL, right: outR };
  } else {
    // One-shot: extend signal with reverb tail
    const tailFrames = Math.floor(tailSec * SAMPLE_RATE);
    const total = frames + tailFrames;
    const outL = new Float32Array(total);
    const outR = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const inL = i < frames ? stereo.left[i] : 0;
      const inR = i < frames ? stereo.right[i] : 0;
      const [wL, wR] = processFrame(inL, inR);
      outL[i] = inL * (1 - wetMix) + wL * wetMix;
      outR[i] = inR * (1 - wetMix) + wR * wetMix;
    }
    // Fade out the tail to avoid abrupt end
    const fadeSamples = Math.floor(0.3 * SAMPLE_RATE);
    for (let i = 0; i < fadeSamples; i++) {
      const g = 1 - i / fadeSamples;
      outL[total - fadeSamples + i] *= g;
      outR[total - fadeSamples + i] *= g;
    }
    return { left: outL, right: outR };
  }
}

// ─── Granular impulse train ─────────────────────────────────────────────────
// Creates a state machine for generating sporadic micro-impulses (rain, twigs).

function createGranular(seed) {
  const rng = createRNG(seed);
  let nextImpulse = rng.intBetween(0, 2000);
  let impulseLen = 0;
  let impulseAmp = 0;
  let impulsePhase = 0;

  return function next(i) {
    if (i >= nextImpulse && impulsePhase >= impulseLen) {
      // Start new impulse
      impulseLen = rng.intBetween(13, 88);       // 0.3–2ms at 44.1kHz
      impulseAmp = 0.015 * rng.exponential(1.5); // exponential amplitude (mostly quiet, rare loud)
      impulseAmp = Math.min(impulseAmp, 0.08);   // safety clamp
      impulsePhase = 0;
      nextImpulse = i + rng.intBetween(220, 3528); // 5–80ms interval
    }

    if (impulsePhase < impulseLen) {
      const center = impulseLen / 2;
      const sigma = impulseLen / 4;
      const d = impulsePhase - center;
      const val = impulseAmp * Math.exp(-(d * d) / (2 * sigma * sigma));
      impulsePhase++;
      return val;
    }
    return 0;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Asset generators — each returns { left, right } stereo pair
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * drone_calm.wav — 60s loop — "Forest cathedral" (40–120 Hz dominant)
 *
 * Deep, enveloping drone for Calm mode. Felt more than heard.
 * L/R channels use independent noise seeds (no Hz offset — centered/enveloping).
 * Dual breathing LFOs: slow swell (25s) + sub-bass wave (59s) on band 2 only.
 * tanh waveshaping at drive 2.5 for maximum even-harmonic warmth.
 * Cathedral-like reverb: long tail (wetMix 0.45, feedback 0.90).
 */
function genDroneCalm() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  // 4 noise bands per channel — independent L/R seeds, no Hz offset (centered)
  const bandsL = [
    { gen: createNoiseBand(0xCA01,  60, 2.5), amp: 0.45 },  // deep rumble (felt, not heard)
    { gen: createNoiseBand(0xCA02,  40, 3.0), amp: 0.25 },  // sub-bass floor
    { gen: createNoiseBand(0xCA03, 120, 1.5), amp: 0.18 },  // warmth
    { gen: createNoiseBand(0xCA04, 180, 2.0), amp: 0.08 },  // upper warmth
  ];
  const bandsR = [
    { gen: createNoiseBand(0xCA05,  60, 2.5), amp: 0.45 },
    { gen: createNoiseBand(0xCA06,  40, 3.0), amp: 0.25 },
    { gen: createNoiseBand(0xCA07, 120, 1.5), amp: 0.18 },
    { gen: createNoiseBand(0xCA08, 180, 2.0), amp: 0.08 },
  ];

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const fade = loopFade(i, N);

    // LFO-A: 0.04 Hz (25s cycle), depth 0.18 — breath-like swell
    const lfoA = 1 + 0.18 * sine(t, 0.04);
    // LFO-B: 0.017 Hz (59s cycle), depth 0.12 — sub-bass wave (band 2 only)
    const lfoB = 1 + 0.12 * sine(t, 0.017);

    // Mix noise bands
    let mixL = 0, mixR = 0;
    for (let b = 0; b < bandsL.length; b++) {
      const modAmp = b === 1 ? lfoB : 1; // sub-bass band gets its own LFO
      mixL += bandsL[b].gen() * bandsL[b].amp * modAmp;
      mixR += bandsR[b].gen() * bandsR[b].amp * modAmp;
    }

    // Waveshaping: tanh drive 2.5 for maximum even-harmonic warmth
    const shapedL = tanhShape(mixL, 2.5) * 0.85;
    const shapedR = tanhShape(mixR, 2.5) * 0.85;

    left[i]  = fade * lfoA * shapedL;
    right[i] = fade * lfoA * shapedR;
  }

  const reverbed = applyReverb({ left, right }, { wetMix: 0.45, feedback: 0.90, loop: true });
  writeWav('drone_calm.wav', reverbed);
}

/**
 * drone_focus.wav — 60s loop — "Clear tunnel" (150–400 Hz, clean)
 *
 * Clean, clinical drone for Focus mode. No waveshaping — stays pristine.
 * L/R +2 Hz offset (narrower stereo than calm = tunnel feel).
 * Subtle tremolo at 0.15 Hz, depth 0.04 (barely perceptible = stability).
 * Formant resonators at 250 Hz Q=12 and 350 Hz Q=10 (tight "tunnel" of sound).
 * Tight, short reverb: wetMix 0.15, feedback 0.82.
 */
function genDroneFocus() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  // Noise bands — L/R offset +2 Hz for narrow tunnel-like stereo
  const bandsL = [
    { gen: createNoiseBand(0xFC01, 180, 3.0), amp: 0.35 },  // clean fundamental
    { gen: createNoiseBand(0xFC02, 250, 3.5), amp: 0.25 },  // mid clarity
    { gen: createNoiseBand(0xFC03, 320, 4.0), amp: 0.15 },  // presence
    { gen: createNoiseBand(0xFC04, 400, 5.0), amp: 0.05 },  // air
  ];
  const bandsR = [
    { gen: createNoiseBand(0xFC05, 182, 3.0), amp: 0.35 },  // +2 Hz offset
    { gen: createNoiseBand(0xFC06, 252, 3.5), amp: 0.25 },
    { gen: createNoiseBand(0xFC07, 322, 4.0), amp: 0.15 },
    { gen: createNoiseBand(0xFC08, 402, 5.0), amp: 0.05 },
  ];

  // Formant resonators — tight "tunnel" of sound
  const resL250 = createResonator(250, 12);
  const resL350 = createResonator(350, 10);
  const resR250 = createResonator(250, 12);
  const resR350 = createResonator(350, 10);

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const fade = loopFade(i, N);

    // Tremolo: 0.15 Hz, depth 0.04 (barely perceptible = stability)
    const tremolo = 1 + 0.04 * sine(t, 0.15);

    // Mix noise bands (no waveshaping — stay clean/clinical)
    let mixL = 0, mixR = 0;
    for (let b = 0; b < bandsL.length; b++) {
      mixL += bandsL[b].gen() * bandsL[b].amp;
      mixR += bandsR[b].gen() * bandsR[b].amp;
    }

    // Formant coloring on mixed noise — tight tunnel resonance
    const formantL = resL250(mixL) * 0.15 + resL350(mixL) * 0.10;
    const formantR = resR250(mixR) * 0.15 + resR350(mixR) * 0.10;

    left[i]  = fade * tremolo * (mixL + formantL);
    right[i] = fade * tremolo * (mixR + formantR);
  }

  const reverbed = applyReverb({ left, right }, { wetMix: 0.15, feedback: 0.82, loop: true });
  writeWav('drone_focus.wav', reverbed);
}

/**
 * drone_activate.wav — 60s loop — "Morning light" (200–600 Hz, bright)
 *
 * Bright, expansive drone for Activate mode. Widest stereo image.
 * L/R +5 Hz offset (widest stereo = expansive/open feel).
 * Energy pulse: 0.5 Hz LFO, depth 0.06 (subtle rhythmic push).
 * Mild tanh drive 1.2 to prevent harshness while adding warmth.
 * Crisp reverb: wetMix 0.20, feedback 0.84.
 */
function genDroneActivate() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  // Noise bands — L/R offset +5 Hz for wide, expansive stereo
  const bandsL = [
    { gen: createNoiseBand(0xAC01, 250, 2.0), amp: 0.30 },  // mid presence
    { gen: createNoiseBand(0xAC02, 350, 2.5), amp: 0.22 },  // body
    { gen: createNoiseBand(0xAC03, 480, 3.0), amp: 0.16 },  // brightness
    { gen: createNoiseBand(0xAC04, 600, 4.0), amp: 0.08 },  // air / sparkle
  ];
  const bandsR = [
    { gen: createNoiseBand(0xAC05, 255, 2.0), amp: 0.30 },  // +5 Hz offset
    { gen: createNoiseBand(0xAC06, 355, 2.5), amp: 0.22 },
    { gen: createNoiseBand(0xAC07, 485, 3.0), amp: 0.16 },
    { gen: createNoiseBand(0xAC08, 605, 4.0), amp: 0.08 },
  ];

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const fade = loopFade(i, N);

    // Energy pulse: 0.5 Hz LFO, depth 0.06 (subtle rhythmic push)
    const pulse = 1 + 0.06 * sine(t, 0.5);

    // Mix noise bands
    let mixL = 0, mixR = 0;
    for (let b = 0; b < bandsL.length; b++) {
      mixL += bandsL[b].gen() * bandsL[b].amp;
      mixR += bandsR[b].gen() * bandsR[b].amp;
    }

    // Waveshaping: mild tanh drive 1.2 to prevent harshness
    const shapedL = tanhShape(mixL, 1.2) * 0.85;
    const shapedR = tanhShape(mixR, 1.2) * 0.85;

    left[i]  = fade * pulse * shapedL;
    right[i] = fade * pulse * shapedR;
  }

  const reverbed = applyReverb({ left, right }, { wetMix: 0.20, feedback: 0.84, loop: true });
  writeWav('drone_activate.wav', reverbed);
}

/**
 * bell_chime.wav — one-shot ~4s (2.5s + 1.5s reverb tail)
 *
 * 880 Hz temple bell with:
 *   - Attack noise burst (first 5ms) for metallic strike realism
 *   - Ring modulation (3 Hz) on fundamental for natural beating
 *   - Differential decay: high partials fast, low partials slow
 *   - Inharmonic partials panned L/R for spatial shimmer
 */
function genBellChime() {
  const DURATION = 2.5;
  const N = Math.floor(DURATION * SAMPLE_RATE);
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  const noiseRng = createRNG(0xBE11);

  // Partials: [freq, ampL, ampR, decayTau]
  // Inharmonic partials have L/R amplitude differences for spatial spread
  const partials = [
    [880,  0.48, 0.48, 0.60],   // fundamental — long sustain, centered
    [1760, 0.20, 0.22, 0.38],   // ×2 harmonic — slight R bias
    [2640, 0.14, 0.16, 0.28],   // ×3 harmonic
    [3520, 0.07, 0.09, 0.16],   // ×4 shimmer
    [2410, 0.14, 0.08, 0.22],   // inharmonic — L-biased (bell character)
    [4840, 0.04, 0.06, 0.10],   // high inharmonic — R-biased (sparkle)
    [1320, 0.06, 0.06, 0.45],   // ×1.5 — adds metallic quality
  ];

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;

    // Attack noise burst: first 5ms of high-frequency transient
    let noiseL = 0, noiseR = 0;
    if (t < 0.005) {
      const attackEnv = expDecay(t, 0.001);
      noiseL = noiseRng.white() * 0.35 * attackEnv;
      noiseR = noiseRng.white() * 0.35 * attackEnv;
    }

    // Ring modulation: fundamental × slow LFO creates natural beating
    const ringMod = 1 + 0.08 * sine(t, 3.0);

    let sL = 0, sR = 0;
    for (const [hz, ampL, ampR, tau] of partials) {
      const env = expDecay(t, tau);
      const mod = hz === 880 ? ringMod : 1; // ring mod only on fundamental
      sL += sine(t, hz) * ampL * env * mod;
      sR += sinePhase(t, hz, 0.05) * ampR * env * mod;
    }

    // Soft attack (2ms rise) to avoid click
    const attack = Math.min(1, t / 0.002);

    left[i]  = attack * (sL + noiseL);
    right[i] = attack * (sR + noiseR);
  }

  // Bell gets the most reverb — temple space
  const reverbed = applyReverb({ left, right }, {
    wetMix: 0.40, feedback: 0.92, loop: false, tailSec: 1.5,
  });
  writeWav('bell_chime.wav', reverbed);
}

/**
 * nature_bed.wav — 60s loop
 *
 * Three-band noise architecture:
 *   < 100 Hz:  Brown noise (ground vibration, distant ocean)
 *   100–800 Hz: Pink noise (wind core, ambient air)
 *   800+ Hz:    Filtered white noise (rain texture, leaf rustle)
 *
 * Plus granular impulse train for organic micro-events (rain drops, twig snaps).
 * L/R channels use independent noise seeds — wind blows differently in each ear.
 * Wind swell: ultra-slow LFO modulates filter cutoff for dynamic movement.
 */
function genNatureBed() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  // Independent noise generators per channel
  const brownL = createBrownNoise(0xC0FFEE);
  const brownR = createBrownNoise(0xFACE01);
  const pinkL  = createPinkNoise(0xBED123);
  const pinkR  = createPinkNoise(0x7EA456);

  // White noise RNGs (separate so L/R are decorrelated)
  const whiteRngL = createRNG(0xAA5500);
  const whiteRngR = createRNG(0x55AA00);

  // Granular impulse generators (rain drops / twig snaps)
  const granL = createGranular(0x1CEBEA0);
  const granR = createGranular(0xD3ED20F);

  // Low-pass filter states for white noise shaping
  let lpStateL = 0, lpStateR = 0;

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const fade = loopFade(i, N, 0.02);

    // Slow breathing — waves approaching and receding
    const breathe = 1 + 0.15 * sine(t, 0.08);

    // Wind swell: modulates filter cutoff (0.03 Hz — ~33s cycle)
    // Higher cutoff = more high-freq content = "wind picking up"
    const windSwell = 0.30 + 0.12 * sine(t, 0.03);

    // ── Band 1: Brown noise (< 100 Hz body) ──
    const bL = brownL() * 0.50;
    const bR = brownR() * 0.50;

    // ── Band 2: Pink noise (100–800 Hz wind core) ──
    const pL = pinkL() * 0.28;
    const pR = pinkR() * 0.28;

    // ── Band 3: Filtered white noise (800+ Hz texture) ──
    // One-pole LP with wind-modulated cutoff
    lpStateL = lpStateL + windSwell * (whiteRngL.white() - lpStateL);
    lpStateR = lpStateR + windSwell * (whiteRngR.white() - lpStateR);
    const wL = lpStateL * 0.16;
    const wR = lpStateR * 0.16;

    // ── Granular layer: micro-impulses ──
    const gL = granL(i);
    const gR = granR(i);

    // Mix all bands
    left[i]  = fade * breathe * (bL + pL + wL + gL) * 0.42;
    right[i] = fade * breathe * (bR + pR + wR + gR) * 0.42;
  }

  const reverbed = applyReverb({ left, right }, { wetMix: 0.35, feedback: 0.88, loop: true });
  writeWav('nature_bed.wav', reverbed);
}

/**
 * shield_open.wav — one-shot ~2.5s (1.5s + 1s tail)
 *
 * Rising logarithmic noise sweep 150 → 1200 Hz.
 * Bandpass-filtered white noise with per-sample frequency sweep (SVF).
 * Sounds like a rising "whoosh" instead of a sine "bweee".
 * L/R: independent noise sources for natural stereo width.
 */
function genShieldOpen() {
  const DURATION = 1.5;
  const N = Math.floor(DURATION * SAMPLE_RATE);
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  const f0 = 150, f1 = 1200;
  const rngL = createRNG(0x5E1D);
  const rngR = createRNG(0x5E2D);
  const svfL = createSweepableBandpass(2.5);
  const svfR = createSweepableBandpass(2.5);

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / DURATION;
    const env = Math.sin(progress * Math.PI);
    const freq = f0 * Math.pow(f1 / f0, progress);

    left[i]  = env * svfL.process(rngL.white(), freq) * 0.60;
    right[i] = env * svfR.process(rngR.white(), freq) * 0.60;
  }

  const reverbed = applyReverb({ left, right }, {
    wetMix: 0.20, feedback: 0.85, loop: false, tailSec: 1.0,
  });
  writeWav('shield_open.wav', reverbed);
}

/**
 * shield_close.wav — one-shot ~2.2s (1.2s + 1s tail)
 *
 * Falling logarithmic noise sweep 1200 → 150 Hz.
 * Mirror of shield_open: same SVF approach, reversed frequency contour.
 */
function genShieldClose() {
  const DURATION = 1.2;
  const N = Math.floor(DURATION * SAMPLE_RATE);
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  const f0 = 1200, f1 = 150;
  const rngL = createRNG(0x5E3D);
  const rngR = createRNG(0x5E4D);
  const svfL = createSweepableBandpass(2.5);
  const svfR = createSweepableBandpass(2.5);

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / DURATION;
    const env = 1 - progress;
    const freq = f0 * Math.pow(f1 / f0, progress);

    left[i]  = env * svfL.process(rngL.white(), freq) * 0.60;
    right[i] = env * svfR.process(rngR.white(), freq) * 0.60;
  }

  const reverbed = applyReverb({ left, right }, {
    wetMix: 0.20, feedback: 0.85, loop: false, tailSec: 1.0,
  });
  writeWav('shield_close.wav', reverbed);
}

/**
 * onboarding_deep_forest.wav — 60s loop
 *
 * The first sound the user hears. Must feel warm, safe, vast.
 *
 * Deep 60 Hz root + harmonic series + inharmonic "forest air" shimmer.
 * L/R: each partial has random phase offset for natural spatial image.
 * Shimmer partials get random amplitude flicker — light through leaves.
 * Deepest reverb setting for "inside a vast ancient forest" feel.
 */
function genOnboardingDeepForest() {
  const DURATION = 60;
  const N = DURATION * SAMPLE_RATE;
  const left  = new Float32Array(N);
  const right = new Float32Array(N);

  const forestLayers = [
    // Root — deep earth
    { hz: 60,   amp: 0.35, shimmer: false },
    { hz: 120,  amp: 0.15, shimmer: false },
    { hz: 180,  amp: 0.08, shimmer: false },
    // Warmth mid band
    { hz: 240,  amp: 0.06, shimmer: false },
    { hz: 300,  amp: 0.04, shimmer: false },
    { hz: 360,  amp: 0.03, shimmer: false },
    // Inharmonic shimmer (forest "air") — these get the flicker
    { hz: 523,  amp: 0.025, shimmer: true },
    { hz: 659,  amp: 0.020, shimmer: true },
    { hz: 784,  amp: 0.015, shimmer: true },
    { hz: 1047, amp: 0.010, shimmer: true },
  ];

  const phaseRng = createRNG(0xFEEDBEEF);
  const flickerRng = createRNG(0xF11C0E2);

  // Random L/R phase offsets per partial
  const phasesL = forestLayers.map(() => phaseRng.rand() * 2 * Math.PI);
  const phasesR = forestLayers.map(() => phaseRng.rand() * 2 * Math.PI);

  // Flicker state: slow random walk per shimmer partial
  const flickerState = forestLayers.map(() => 0.5 + flickerRng.rand() * 0.5);

  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const breathe = 1 + 0.15 * sine(t, 0.05);
    const fade = loopFade(i, N, 0.03);

    let sL = 0, sR = 0;
    for (let j = 0; j < forestLayers.length; j++) {
      const { hz, amp, shimmer } = forestLayers[j];
      let modAmp = amp;

      // Shimmer flicker: slow random amplitude modulation (light through leaves)
      if (shimmer) {
        // Update flicker every ~50 samples (≈1.1ms) for efficiency
        if (i % 50 === 0) {
          flickerState[j] += (flickerRng.white() * 0.02);
          flickerState[j] = Math.max(0.3, Math.min(1.0, flickerState[j]));
        }
        modAmp *= flickerState[j];
      }

      sL += Math.sin(2 * Math.PI * hz * t + phasesL[j]) * modAmp;
      sR += Math.sin(2 * Math.PI * hz * t + phasesR[j]) * modAmp;
    }

    left[i]  = fade * breathe * sL * 0.60;
    right[i] = fade * breathe * sR * 0.60;
  }

  // Deepest reverb — vast forest / cave
  const reverbed = applyReverb({ left, right }, { wetMix: 0.45, feedback: 0.90, loop: true });
  writeWav('onboarding_deep_forest.wav', reverbed);
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('\nUNS Audio Generator v2 — Spatial Audio with Schroeder Reverb');
console.log('='.repeat(60));
console.log(`Output: ${OUT_DIR}\n`);

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const start = Date.now();

genDroneCalm();
genDroneFocus();
genDroneActivate();
genBellChime();
genNatureBed();
genShieldOpen();
genShieldClose();
genOnboardingDeepForest();

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n✓ All 8 files generated in ${elapsed}s (stereo, reverbed)`);
console.log('\nNext: node scripts/generate-audio.js → eas build --profile development --platform ios');
