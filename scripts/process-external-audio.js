/**
 * UNS External Audio Processor
 *
 * Takes raw downloaded audio files (ext_*.wav/ogg/mp3) from assets/audio/
 * and processes them into production-ready assets:
 *
 *   1. Normalize to 44100 Hz stereo 16-bit WAV via ffmpeg (polyphase resampling)
 *   2. Seamless loop crossfade for looping assets
 *   3. Peak normalization
 *   4. Rename to app asset names (nature_bed.wav, etc.)
 *
 * Run: node scripts/process-external-audio.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ffmpeg  = require('ffmpeg-static');
const AUDIO   = path.join(__dirname, '..', 'assets', 'audio');
const TMP     = path.join(AUDIO, '_tmp');
const SR      = 44100;
const MAX16   = 32767;

// ─── Asset mapping ──────────────────────────────────────────────────────────
// source file → { target, loop, duration (if trim needed) }

const ASSETS = [
  {
    src:    'ext_nature_wind.wav',
    target: 'nature_bed.wav',
    loop:   true,
    dur:    60,       // trim to 60s for consistency
    label:  'nature_bed (wind)',
  },
  {
    src:    'ext_nature_rain.ogg',
    target: 'nature_rain.wav',
    loop:   true,
    dur:    60,
    label:  'nature_bed (rain)',
  },
  // drone_deep → generate-audio.js 生成版を使用（外部シンギングボウル一打はループ不適）
  // drone_mid  → generate-audio.js 生成版を使用（ピアノ楽曲はボリューム動的制御と不適合）
  {
    src:    'ext_daitokuji_bell.wav',
    target: 'bell_chime.wav',
    loop:   false,    // one-shot
    dur:    4.5,      // truncate to 4.5s (environment noise contaminates the tail after ~5s)
    fadeOut: 3.5,     // equal-power fade-out starts at 3.5s
    label:  'bell_chime',
  },
  {
    src:    'ext_forest_loop.wav',
    target: 'onboarding_deep_forest.wav',
    loop:   true,
    dur:    60,
    label:  'onboarding_deep_forest',
  },
];

// ─── WAV reader ─────────────────────────────────────────────────────────────

function readWav(filePath) {
  const buf = fs.readFileSync(filePath);

  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a valid WAV file: ${filePath}`);
  }

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let channels, sampleRate, bitsPerSample;

  while (offset < buf.length - 8) {
    const chunkId   = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      channels       = buf.readUInt16LE(offset + 10);
      sampleRate     = buf.readUInt32LE(offset + 12);
      bitsPerSample  = buf.readUInt16LE(offset + 22);
      fmtFound = true;
    }

    if (chunkId === 'data') {
      if (!fmtFound) throw new Error('data chunk before fmt chunk');
      const dataStart = offset + 8;
      const dataLen   = chunkSize;

      // Decode to Float32 arrays per channel
      const bytesPerSample = bitsPerSample / 8;
      const totalSamples   = dataLen / bytesPerSample;
      const framesCount    = Math.floor(totalSamples / channels);

      const chans = [];
      for (let c = 0; c < channels; c++) chans.push(new Float32Array(framesCount));

      for (let f = 0; f < framesCount; f++) {
        for (let c = 0; c < channels; c++) {
          const pos = dataStart + (f * channels + c) * bytesPerSample;
          let val;
          if (bitsPerSample === 16) {
            val = buf.readInt16LE(pos) / 32768;
          } else if (bitsPerSample === 24) {
            val = ((buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16)) << 8 >> 8) / 8388608;
          } else if (bitsPerSample === 32) {
            val = buf.readInt32LE(pos) / 2147483648;
          } else {
            throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
          }
          chans[c][f] = val;
        }
      }

      return { channels: chans, sampleRate, bitsPerSample, numChannels: channels };
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++; // padding byte
  }

  throw new Error('No data chunk found');
}

// ─── WAV writer (stereo 16-bit) ─────────────────────────────────────────────

function writeWav(filePath, left, right) {
  const frames    = left.length;
  const ch        = 2;
  const dataBytes = frames * ch * 2;
  const buf       = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < frames; i++) {
    const lc = Math.max(-1, Math.min(1, left[i]));
    const rc = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(Math.round(lc * MAX16), 44 + i * 4);
    buf.writeInt16LE(Math.round(rc * MAX16), 44 + i * 4 + 2);
  }

  fs.writeFileSync(filePath, buf);
}

// ─── Mono → Stereo (duplicate channel) ─────────────────────────────────────

function ensureStereo(audio) {
  if (audio.numChannels >= 2) {
    return { left: audio.channels[0], right: audio.channels[1] };
  }
  return { left: audio.channels[0], right: new Float32Array(audio.channels[0]) };
}

// ─── Trim or pad to target duration ─────────────────────────────────────────

function trimToDuration(left, right, targetFrames) {
  if (left.length <= targetFrames) return { left, right };
  return {
    left:  left.slice(0, targetFrames),
    right: right.slice(0, targetFrames),
  };
}

// ─── Crossfade loop (overlap-add for seamless looping) ──────────────────────
// Takes the last `fadeSec` seconds and crossfades them with the beginning.

function crossfadeLoop(left, right, fadeSec = 2.0) {
  const fadeFrames = Math.min(Math.floor(fadeSec * SR), Math.floor(left.length * 0.15));
  const len = left.length;

  const outL = new Float32Array(left);
  const outR = new Float32Array(right);

  for (let i = 0; i < fadeFrames; i++) {
    const t = i / fadeFrames; // 0 → 1

    // Tail index (fading out)
    const tailIdx = len - fadeFrames + i;

    // Equal-power crossfade
    const fadeOut = Math.cos(t * Math.PI * 0.5);
    const fadeIn  = Math.sin(t * Math.PI * 0.5);

    outL[i] = left[i] * fadeIn + left[tailIdx] * fadeOut;
    outR[i] = right[i] * fadeIn + right[tailIdx] * fadeOut;
  }

  // Trim the crossfaded tail region
  return {
    left:  outL.slice(0, len - fadeFrames),
    right: outR.slice(0, len - fadeFrames),
  };
}

// ─── Peak normalize ─────────────────────────────────────────────────────────

function peakNormalize(left, right, targetPeak = 0.90) {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (peak < 0.001) return { left, right }; // silence guard

  const gain = targetPeak / peak;
  const outL = new Float32Array(left.length);
  const outR = new Float32Array(right.length);
  for (let i = 0; i < left.length; i++) {
    outL[i] = left[i] * gain;
    outR[i] = right[i] * gain;
  }
  return { left: outL, right: outR };
}

// ─── Normalize to 44100Hz stereo 16-bit WAV via ffmpeg ──────────────────────
// Always runs ffmpeg regardless of input format — polyphase resampling is
// far superior to linear interpolation for sample rate conversion.

function normalizeToWav(srcPath) {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const ext = path.extname(srcPath).toLowerCase();
  const tmpPath = path.join(TMP, path.basename(srcPath, ext) + '.wav');

  console.log(`    ffmpeg: normalize → ${SR}Hz stereo 16-bit...`);
  execSync(
    `"${ffmpeg}" -y -i "${srcPath}" -ar ${SR} -ac 2 -sample_fmt s16 "${tmpPath}"`,
    { stdio: 'pipe' }
  );
  return tmpPath;
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('\nUNS External Audio Processor');
console.log('='.repeat(60));

let processed = 0;
let skipped   = 0;

for (const asset of ASSETS) {
  const srcPath = path.join(AUDIO, asset.src);
  if (!fs.existsSync(srcPath)) {
    console.log(`  ✗ ${asset.label}: source not found (${asset.src}) — skipping`);
    skipped++;
    continue;
  }

  console.log(`\n  Processing: ${asset.label}`);
  console.log(`    source: ${asset.src}`);

  // Step 1: Normalize to 44100Hz stereo 16-bit via ffmpeg (polyphase resampling)
  const wavPath = normalizeToWav(srcPath);

  // Step 2: Read normalized WAV
  const audio = readWav(wavPath);
  console.log(`    read: ${audio.numChannels}ch, ${audio.sampleRate}Hz, ${audio.bitsPerSample}bit, ${(audio.channels[0].length / audio.sampleRate).toFixed(1)}s`);

  // Step 3: Ensure stereo (should already be stereo from ffmpeg, but defensive)
  let { left, right } = ensureStereo(audio);

  // Step 4: Trim to target duration (with optional fade-out)
  if (asset.dur) {
    const targetFrames = Math.floor(asset.dur * SR);
    if (left.length > targetFrames) {
      ({ left, right } = trimToDuration(left, right, targetFrames));
      console.log(`    trimmed: → ${asset.dur}s`);
    } else if (left.length < targetFrames) {
      console.log(`    note: source is ${(left.length / SR).toFixed(1)}s, shorter than target ${asset.dur}s — using full length`);
    }
    // Apply fade-out if specified (e.g., bell_chime environment noise removal)
    if (asset.fadeOut != null) {
      const fadeStartFrame = Math.floor(asset.fadeOut * SR);
      const fadeLen = left.length - fadeStartFrame;
      if (fadeLen > 0) {
        for (let i = fadeStartFrame; i < left.length; i++) {
          const t = (i - fadeStartFrame) / fadeLen;
          const gain = Math.cos(t * Math.PI * 0.5); // equal-power fade
          left[i] *= gain;
          right[i] *= gain;
        }
        console.log(`    fade-out: ${asset.fadeOut}s → ${asset.dur}s (equal-power cosine)`);
      }
    }
  }

  // Step 5: Crossfade loop (for looping assets only)
  if (asset.loop) {
    const fadeSec = left.length / SR > 10 ? 2.0 : 0.5;
    ({ left, right } = crossfadeLoop(left, right, fadeSec));
    console.log(`    loop crossfade: ${fadeSec}s equal-power`);
  }

  // Step 6: Peak normalize
  ({ left, right } = peakNormalize(left, right, 0.90));
  console.log(`    normalized: peak → -0.9 dBFS`);

  // Step 7: Write output
  const outPath = path.join(AUDIO, asset.target);
  writeWav(outPath, left, right);
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`    ✓ ${asset.target} — ${mb} MB (${(left.length / SR).toFixed(1)}s, stereo)`);
  processed++;
}

// Cleanup tmp
if (fs.existsSync(TMP)) {
  fs.readdirSync(TMP).forEach(f => fs.unlinkSync(path.join(TMP, f)));
  fs.rmdirSync(TMP);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`✓ ${processed} files processed, ${skipped} skipped`);
if (processed > 0) {
  console.log('\nNote: Original ext_* files are preserved. Delete them manually when satisfied.');
  console.log('Next: eas build --profile development --platform ios');
}
