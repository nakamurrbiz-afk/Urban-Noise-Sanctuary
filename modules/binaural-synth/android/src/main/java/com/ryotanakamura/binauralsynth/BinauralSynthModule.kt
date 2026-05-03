package com.ryotanakamura.binauralsynth

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.*
import kotlin.math.PI
import kotlin.math.sin

/**
 * BinauralSynthModule — Phase B Android native binaural synthesizer
 *
 * Architecture:
 *   AudioTrack (ENCODING_PCM_FLOAT, MODE_STREAM, STEREO)
 *   └── background coroutine generates interleaved [L, R, L, R, ...] samples
 *
 * Stereo layout: AudioFormat.CHANNEL_OUT_STEREO with interleaved float array.
 *   frame[i] = [freqL sine at phaseL,  freqR sine at phaseR]
 *
 * Thread safety:
 *   freqL, freqR, amplitude are marked @Volatile so the generator thread
 *   always reads the latest JS-updated value without explicit locking.
 *   Volatile provides acquire/release semantics on JVM — sufficient here
 *   because each field is a primitive (Double or Float), written atomically.
 *
 * Minimum API: 21 (AudioTrack ENCODING_PCM_FLOAT introduced in API 21)
 */
class BinauralSynthModule : Module() {

  // ── Shared state — volatile for cross-thread visibility ─────────────────
  @Volatile private var freqL: Double     = 200.0
  @Volatile private var freqR: Double     = 206.0
  @Volatile private var amplitude: Float  = 0.085f
  @Volatile private var isRunning         = false

  // ── Audio resources ──────────────────────────────────────────────────────
  private var audioTrack: AudioTrack? = null
  private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
  private var generatorJob: Job? = null

  // ── Module definition ────────────────────────────────────────────────────
  override fun definition() = ModuleDefinition {
    Name("BinauralSynth")

    AsyncFunction("start") { freqL: Double, freqR: Double, amplitude: Double ->
      this@BinauralSynthModule.freqL     = freqL
      this@BinauralSynthModule.freqR     = freqR
      this@BinauralSynthModule.amplitude = amplitude.toFloat()
      startAudio()
    }

    AsyncFunction("stop") {
      stopAudio()
    }

    AsyncFunction("setFrequencies") { freqL: Double, freqR: Double ->
      this@BinauralSynthModule.freqL = freqL
      this@BinauralSynthModule.freqR = freqR
    }

    AsyncFunction("setAmplitude") { amplitude: Double ->
      this@BinauralSynthModule.amplitude = amplitude.toFloat()
    }

    Function("isAvailable") { true }

    OnDestroy {
      stopAudio()
      scope.cancel()
    }
  }

  // ── Audio lifecycle ──────────────────────────────────────────────────────

  private fun startAudio() {
    stopAudio()

    val sampleRate    = 44100
    val channelConfig = AudioFormat.CHANNEL_OUT_STEREO
    val encoding      = AudioFormat.ENCODING_PCM_FLOAT

    // Minimum buffer size — we'll use 2× for stability
    val minBuf   = AudioTrack.getMinBufferSize(sampleRate, channelConfig, encoding)
    val bufBytes = if (minBuf > 0) minBuf * 2 else 8192

    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(sampleRate)
          .setChannelMask(channelConfig)
          .setEncoding(encoding)
          .build()
      )
      .setBufferSizeInBytes(bufBytes)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    track.play()
    audioTrack  = track
    isRunning   = true

    // Number of stereo frames per write
    // bufBytes / 4 bytes per float / 2 channels = frames per write
    val framesPerWrite = bufBytes / 4 / 2
    val floatBuf       = FloatArray(framesPerWrite * 2)   // interleaved L/R

    generatorJob = scope.launch {
      var phaseL = 0.0
      var phaseR = 0.0

      while (isRunning && isActive) {
        val dL  = freqL / sampleRate
        val dR  = freqR / sampleRate
        val amp = amplitude

        for (i in 0 until framesPerWrite) {
          floatBuf[i * 2]     = (sin(2.0 * PI * phaseL) * amp).toFloat()   // L
          floatBuf[i * 2 + 1] = (sin(2.0 * PI * phaseR) * amp).toFloat()   // R

          phaseL += dL
          if (phaseL >= 1.0) phaseL -= 1.0
          phaseR += dR
          if (phaseR >= 1.0) phaseR -= 1.0
        }

        track.write(floatBuf, 0, floatBuf.size, AudioTrack.WRITE_BLOCKING)
      }
    }
  }

  private fun stopAudio() {
    isRunning = false
    generatorJob?.cancel()
    generatorJob = null
    audioTrack?.pause()
    audioTrack?.flush()
    audioTrack?.release()
    audioTrack = null
  }
}
