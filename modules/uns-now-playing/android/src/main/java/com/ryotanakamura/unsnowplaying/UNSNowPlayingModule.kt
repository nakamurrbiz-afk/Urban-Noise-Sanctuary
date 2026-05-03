package com.ryotanakamura.unsnowplaying

import android.app.PendingIntent
import android.content.Intent
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * UNSNowPlayingModule — Android lock screen / notification media session
 *
 * Creates a MediaSessionCompat that displays Sanctuary session info on:
 *   - Lock screen media controls (Android 12-)
 *   - Media notification shade (Android 13+)
 *   - Wear OS / Auto connected devices
 *
 * Metadata mapping:
 *   METADATA_KEY_TITLE  → "Sanctuary — 山手線"
 *   METADATA_KEY_ARTIST → "SHIELD ACTIVE — 騒音を吸収中"
 *   METADATA_KEY_ALBUM  → "保護開始 12分30秒経過"
 *
 * The media session is set to STATE_PLAYING so the notification persists.
 * Duration is set to 0 (no seekbar).
 */
class UNSNowPlayingModule : Module() {

  private var mediaSession: MediaSessionCompat? = null

  override fun definition() = ModuleDefinition {
    Name("UNSNowPlaying")

    AsyncFunction("updateNowPlaying") { info: Map<String, Any?> ->
      val title  = info["title"]  as? String ?: ""
      val artist = info["artist"] as? String ?: ""
      val album  = info["album"]  as? String ?: ""

      val session = getOrCreateSession()

      val metadata = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, 0)
        .build()
      session.setMetadata(metadata)

      val state = PlaybackStateCompat.Builder()
        .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1.0f)
        .setActions(PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY)
        .build()
      session.setPlaybackState(state)
    }

    AsyncFunction("clearNowPlaying") {
      mediaSession?.isActive = false
      mediaSession?.release()
      mediaSession = null
    }

    Function("isAvailable") { true }

    OnDestroy {
      mediaSession?.isActive = false
      mediaSession?.release()
      mediaSession = null
    }
  }

  private fun getOrCreateSession(): MediaSessionCompat {
    mediaSession?.let { return it }

    val context = appContext.reactContext ?: throw IllegalStateException("No React context")
    val session = MediaSessionCompat(context, "UNSNowPlaying")

    // Launch intent — tapping the notification opens the app
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launchIntent != null) {
      val pendingIntent = PendingIntent.getActivity(
        context, 0, launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      session.setSessionActivity(pendingIntent)
    }

    session.isActive = true
    mediaSession = session
    return session
  }
}
