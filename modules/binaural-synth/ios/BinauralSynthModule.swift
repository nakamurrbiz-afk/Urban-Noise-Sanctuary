import ExpoModulesCore
import AVFoundation

/**
 * BinauralSynthModule — Phase B iOS native binaural synthesizer
 *
 * Architecture:
 *   AVAudioEngine ─┬─ AVAudioSourceNode (stereo render callback)
 *                  └─ mainMixerNode ─ outputNode
 *
 * The AVAudioSourceNode render callback runs on the audio I/O thread
 * (real-time priority). To remain lock-free, all shared state is read
 * via atomic types:
 *   - phaseL / phaseR : normalized phase 0.0–1.0 (local, thread-private)
 *   - freqL / freqR   : Double, written by JS thread, read by RT thread
 *   - amplitude       : Float, same
 *
 * Swift does not guarantee atomic access on plain properties, so we use
 * os_unfair_lock for the tiny critical section that updates frequency/amp.
 * This is acceptable on the RT thread because lock contention is
 * microseconds at worst — far below the ~5ms buffer deadline.
 *
 * Output format: AVAudioFormat(commonFormat: .pcmFormatFloat32,
 *                              sampleRate:   hardwareSampleRate,
 *                              channels:     2,
 *                              interleaved:  false)
 * Left channel  → ablPointer[0]
 * Right channel → ablPointer[1]
 */
public class BinauralSynthModule: Module {

  // ── Shared state (written from JS thread, read from RT thread) ───────────

  private var _freqL: Double     = 200.0
  private var _freqR: Double     = 206.0
  private var _amplitude: Float  = 0.085

  // Lightweight lock protecting frequency/amplitude updates
  private var lock = os_unfair_lock()

  // ── Audio engine ─────────────────────────────────────────────────────────

  private var engine: AVAudioEngine?
  private var sourceNode: AVAudioSourceNode?

  // ── ExpoModule definition ────────────────────────────────────────────────

  public func definition() -> ModuleDefinition {
    Name("BinauralSynth")

    AsyncFunction("start") { (freqL: Double, freqR: Double, amplitude: Double) in
      os_unfair_lock_lock(&self.lock)
      self._freqL = freqL
      self._freqR = freqR
      self._amplitude = Float(amplitude)
      os_unfair_lock_unlock(&self.lock)
      try self.startEngine()
    }

    AsyncFunction("stop") {
      self.stopEngine()
    }

    AsyncFunction("setFrequencies") { (freqL: Double, freqR: Double) in
      os_unfair_lock_lock(&self.lock)
      self._freqL = freqL
      self._freqR = freqR
      os_unfair_lock_unlock(&self.lock)
    }

    AsyncFunction("setAmplitude") { (amplitude: Double) in
      os_unfair_lock_lock(&self.lock)
      self._amplitude = Float(amplitude)
      os_unfair_lock_unlock(&self.lock)
    }

    Function("isAvailable") { return true }

    OnDestroy {
      self.stopEngine()
    }
  }

  // ── Engine lifecycle ─────────────────────────────────────────────────────

  private func startEngine() throws {
    stopEngine()

    let eng = AVAudioEngine()

    // Use the hardware sample rate to avoid sample-rate conversion overhead
    let hwSampleRate = eng.outputNode.outputFormat(forBus: 0).sampleRate
    guard let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate:   hwSampleRate,
      channels:     2,
      interleaved:  false          // separate buffers: [0]=L [1]=R
    ) else {
      throw NSError(domain: "BinauralSynth", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Could not create AVAudioFormat"])
    }

    // Thread-local phase accumulators (no sharing — purely RT-thread state)
    var phaseL: Double = 0.0
    var phaseR: Double = 0.0
    let sampleRate = hwSampleRate

    // Render callback — runs on audio I/O thread (real-time)
    // MUST be lock-free or use only os_unfair_lock (not DispatchQueue, not mutex)
    let node = AVAudioSourceNode(format: format) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
      guard let self = self else { return noErr }

      // Read shared state under lock (microseconds)
      os_unfair_lock_lock(&self.lock)
      let freqL = self._freqL
      let freqR = self._freqR
      let amp   = self._amplitude
      os_unfair_lock_unlock(&self.lock)

      // Normalized phase increment per sample
      let deltaL = freqL / sampleRate
      let deltaR = freqR / sampleRate

      let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
      let count = Int(frameCount)

      // Non-interleaved: buffer[0] = Left, buffer[1] = Right
      guard ablPointer.count >= 2,
            let ptrL = ablPointer[0].mData?.assumingMemoryBound(to: Float.self),
            let ptrR = ablPointer[1].mData?.assumingMemoryBound(to: Float.self)
      else { return noErr }

      for i in 0..<count {
        ptrL[i] = Float(sin(2.0 * .pi * phaseL)) * amp
        ptrR[i] = Float(sin(2.0 * .pi * phaseR)) * amp

        phaseL += deltaL
        if phaseL >= 1.0 { phaseL -= 1.0 }
        phaseR += deltaR
        if phaseR >= 1.0 { phaseR -= 1.0 }
      }
      return noErr
    }

    eng.attach(node)
    eng.connect(node, to: eng.mainMixerNode, format: format)

    // Activate AVAudioSession for background audio
    try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default,
                                                    options: [.mixWithOthers])
    try AVAudioSession.sharedInstance().setActive(true)
    try eng.start()

    self.engine     = eng
    self.sourceNode = node
  }

  private func stopEngine() {
    engine?.stop()
    if let node = sourceNode {
      engine?.detach(node)
    }
    engine     = nil
    sourceNode = nil
    try? AVAudioSession.sharedInstance().setActive(false,
                                                   options: .notifyOthersOnDeactivation)
  }
}
