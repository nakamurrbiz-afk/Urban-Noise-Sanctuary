/**
 * NowPlayingManager
 *
 * Updates the OS lock-screen / control-center Now Playing widget
 * to show Sanctuary status instead of standard playback info.
 *
 * iOS:     MPNowPlayingInfoCenter + MPRemoteCommandCenter
 * Android: MediaSessionCompat + MediaMetadataCompat
 *
 * The native module (modules/uns-now-playing) provides a unified
 * updateNowPlaying / clearNowPlaying interface for both platforms.
 * Gracefully no-ops in Expo Go / Jest where the module is unavailable.
 */

import { UNSNowPlaying } from '../../modules/uns-now-playing/src';

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
  title: string;      // Primary line (e.g. "Sanctuary — 山手線")
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
// Uses the Expo native module (modules/uns-now-playing).
// Unified API — same call for iOS and Android.

export function updateNowPlaying(info: NowPlayingInfo): void {
  if (!UNSNowPlaying.isAvailable()) return;
  UNSNowPlaying.updateNowPlaying(info).catch(() => {
    // Silently degrade — NowPlaying is enhancement, not core functionality
  });
}

export function clearNowPlaying(): void {
  if (!UNSNowPlaying.isAvailable()) return;
  UNSNowPlaying.clearNowPlaying().catch(() => {});
}
