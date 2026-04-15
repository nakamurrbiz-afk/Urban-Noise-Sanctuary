/**
 * NowPlayingManager
 *
 * Updates the OS lock-screen / control-center Now Playing widget
 * to show Sanctuary status instead of standard playback info.
 *
 * iOS native path:  MPNowPlayingInfoCenter.default().nowPlayingInfo
 * Android path:     MediaSessionCompat.setMetadata()
 *
 * In Expo managed workflow, direct MPNowPlayingInfoCenter access requires
 * a custom native module. This module provides:
 *   (a) a JS-layer interface for when the native bridge is available
 *   (b) a graceful no-op when running in Expo Go / without native module
 *
 * To wire up the native side, see docs/NATIVE_NOWPLAYING.md (Phase 2).
 */

import { NativeModules, Platform } from 'react-native';

// ─── Shield strength label ───────────────────────────────────────────────────
// Abstract noise level into a qualitative label — never shows a number
function shieldStrengthLabel(noiseLevel: number): string {
  if (noiseLevel > 0.7) return 'SHIELD MAX — 高負荷環境を遮断中';
  if (noiseLevel > 0.4) return 'SHIELD ACTIVE — 騒音を吸収中';
  if (noiseLevel > 0.15) return 'SHIELD ACTIVE — 環境安定';
  return 'SHIELD STANDBY';
}

// ─── Elapsed time display ────────────────────────────────────────────────────
function formatElapsed(startedAt: number): string {
  const elapsedMs = Date.now() - startedAt;
  const minutes = Math.floor(elapsedMs / 60_000);
  const seconds = Math.floor((elapsedMs % 60_000) / 1000);
  return `保護開始 ${minutes}分${seconds}秒経過`;
}

// ─── NowPlaying payload ──────────────────────────────────────────────────────
export interface NowPlayingInfo {
  title: string;      // Primary line (e.g. "Sanctuary 稼働中 — 山手線")
  artist: string;     // Shield strength
  album: string;      // Elapsed protection time
}

export function buildNowPlayingInfo(params: {
  routeName?: string;
  noiseLevel: number;
  sessionStartedAt: number;
}): NowPlayingInfo {
  const { routeName, noiseLevel, sessionStartedAt } = params;
  return {
    title: routeName ? `Sanctuary — ${routeName}` : 'Urban Noise Sanctuary',
    artist: shieldStrengthLabel(noiseLevel),
    album: formatElapsed(sessionStartedAt),
  };
}

// ─── Native bridge ────────────────────────────────────────────────────────────
// Attempts to call the native module. No-ops silently if unavailable.
const UNSNativeNowPlaying = NativeModules.UNSNowPlaying;

export function updateNowPlaying(info: NowPlayingInfo): void {
  if (!UNSNativeNowPlaying) {
    // Native module not available (Expo Go / dev environment)
    // In production, this module must be installed. See docs/NATIVE_NOWPLAYING.md
    return;
  }
  try {
    if (Platform.OS === 'ios') {
      UNSNativeNowPlaying.updateNowPlaying({
        title: info.title,
        artist: info.artist,
        album: info.album,
        duration: 0,          // 0 = no progress bar shown
        elapsedTime: 0,
      });
    } else {
      UNSNativeNowPlaying.updateMediaSession({
        title: info.title,
        artist: info.artist,
        album: info.album,
      });
    }
  } catch {
    // Silently degrade — NowPlaying is enhancement, not core functionality
  }
}

export function clearNowPlaying(): void {
  if (!UNSNativeNowPlaying) return;
  try {
    if (Platform.OS === 'ios') {
      UNSNativeNowPlaying.clearNowPlaying();
    } else {
      UNSNativeNowPlaying.stopMediaSession();
    }
  } catch {}
}
