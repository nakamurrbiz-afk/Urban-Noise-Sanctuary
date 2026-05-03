import ExpoModulesCore
import MediaPlayer

/**
 * UNSNowPlayingModule — iOS lock screen / Control Center Now Playing info
 *
 * Updates MPNowPlayingInfoCenter with Sanctuary session metadata so the
 * lock screen shows:
 *   Title:  "Sanctuary — 山手線"  (or "Urban Noise Sanctuary")
 *   Artist: "SHIELD ACTIVE — 騒音を吸収中"
 *   Album:  "保護開始 12分30秒経過"
 *
 * expo-av handles the AVAudioSession category (.playback + mixWithOthers)
 * and UIBackgroundModes:audio. This module only touches the info center —
 * it does not manage audio playback or session activation.
 *
 * Remote command targets (play/pause on lock screen) are registered but
 * forwarded as events — AudioEngine decides whether to act on them.
 */
public class UNSNowPlayingModule: Module {

  public func definition() -> ModuleDefinition {
    Name("UNSNowPlaying")

    AsyncFunction("updateNowPlaying") { (info: [String: Any]) in
      let title   = info["title"]  as? String ?? ""
      let artist  = info["artist"] as? String ?? ""
      let album   = info["album"]  as? String ?? ""

      var nowPlayingInfo: [String: Any] = [
        MPMediaItemPropertyTitle:      title,
        MPMediaItemPropertyArtist:     artist,
        MPMediaItemPropertyAlbumTitle:  album,
        // Playback rate 1.0 tells the OS "this is actively playing"
        // which keeps the Now Playing widget visible on the lock screen
        MPNowPlayingInfoPropertyPlaybackRate: 1.0,
      ]

      // Duration 0 hides the progress bar — Sanctuary is open-ended
      nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = 0
      nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0

      MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    AsyncFunction("clearNowPlaying") {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    Function("isAvailable") { return true }

    OnCreate {
      self.setupRemoteCommands()
    }

    OnDestroy {
      self.teardownRemoteCommands()
    }
  }

  // ── Remote command targets ───────────────────────────────────────────────
  // Register play/pause so iOS shows the Now Playing widget.
  // Without at least one command target, MPNowPlayingInfoCenter is ignored.

  private func setupRemoteCommands() {
    let commandCenter = MPRemoteCommandCenter.shared()

    // Pause — no-op handler (AudioEngine manages playback via JS)
    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { _ in .success }

    // Play — same
    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { _ in .success }

    // Toggle — covers AirPods tap
    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.addTarget { _ in .success }

    // Disable skip/seek — not applicable to Sanctuary
    commandCenter.nextTrackCommand.isEnabled = false
    commandCenter.previousTrackCommand.isEnabled = false
    commandCenter.skipForwardCommand.isEnabled = false
    commandCenter.skipBackwardCommand.isEnabled = false
    commandCenter.seekForwardCommand.isEnabled = false
    commandCenter.seekBackwardCommand.isEnabled = false
    commandCenter.changePlaybackPositionCommand.isEnabled = false
  }

  private func teardownRemoteCommands() {
    let commandCenter = MPRemoteCommandCenter.shared()
    commandCenter.pauseCommand.removeTarget(nil)
    commandCenter.playCommand.removeTarget(nil)
    commandCenter.togglePlayPauseCommand.removeTarget(nil)
  }
}
