/**
 * UNSNowPlaying — Lock screen / Control Center session display
 *
 * Updates the OS Now Playing widget with Sanctuary session metadata:
 *   Title:  route name or app name
 *   Artist: shield strength label
 *   Album:  elapsed protection time
 *
 * Gracefully no-ops when the native module is unavailable (Expo Go, Jest).
 *
 * Exposed methods:
 *   updateNowPlaying(info)  — push metadata to lock screen
 *   clearNowPlaying()       — remove from lock screen
 *   isAvailable()           — false in Expo Go / jest
 */

import { requireNativeModule } from 'expo-modules-core';

interface NowPlayingInfo {
  title: string;
  artist: string;
  album: string;
}

interface NativeUNSNowPlaying {
  updateNowPlaying(info: NowPlayingInfo): Promise<void>;
  clearNowPlaying(): Promise<void>;
  isAvailable(): boolean;
}

let _native: NativeUNSNowPlaying | null | undefined = undefined;

function getNative(): NativeUNSNowPlaying | null {
  if (_native === undefined) {
    try {
      _native = requireNativeModule<NativeUNSNowPlaying>('UNSNowPlaying');
    } catch {
      _native = null;
    }
  }
  return _native;
}

export const UNSNowPlaying = {
  isAvailable(): boolean {
    return getNative() !== null;
  },

  async updateNowPlaying(info: NowPlayingInfo): Promise<void> {
    const m = getNative();
    if (!m) return;
    return m.updateNowPlaying(info);
  },

  async clearNowPlaying(): Promise<void> {
    const m = getNative();
    if (!m) return;
    return m.clearNowPlaying();
  },
};
