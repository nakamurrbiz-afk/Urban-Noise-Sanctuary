/**
 * AudioEngine — エラーハンドリング ユニットテスト
 *
 * ── モック方針 ────────────────────────────────────────────────────
 * expo-av は jest.config.js の moduleNameMapper で自動的に
 * src/__mocks__/expo-av.ts にリダイレクトされる。
 * テスト内で jest.mock('expo-av', factory) を呼ぶと factory 内の
 * require が同一パターンにマッチして無限再帰するため使用しない。
 *
 * 検証項目:
 *   1. init()            — setAudioModeAsync 成功/失敗の動作
 *   2. preload()         — 個別サウンド失敗は無視して全体を継続
 *   3. startOnboardingBed() — sounds 未ロードでも throw しない
 *   4. onHighFreqSpike() — sounds 未ロードでも throw しない
 */

// NowPlayingManager は native MPNowPlayingInfoCenter を使うためスタブ化
jest.mock('../utils/NowPlayingManager', () => ({
  buildNowPlayingInfo: jest.fn().mockReturnValue({}),
  updateNowPlaying:    jest.fn(),
  clearNowPlaying:     jest.fn(),
}));

// expo-av は moduleNameMapper → src/__mocks__/expo-av.ts に解決される
import { Audio } from 'expo-av';
import { audioEngine } from '../engines/AudioEngine';

// ── init() ───────────────────────────────────────────────────────────────────

describe('AudioEngine.init()', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // 各テスト前にシングルトンを未初期化状態にリセット
    await audioEngine.cleanup().catch(() => {});
    (Audio.setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
  });

  test('Audio.setAudioModeAsync が成功すれば isReady が true になる', async () => {
    await audioEngine.init();
    expect(audioEngine.isReady).toBe(true);
  });

  test('Audio.setAudioModeAsync が失敗すると例外を伝播する', async () => {
    (Audio.setAudioModeAsync as jest.Mock).mockRejectedValue(
      new Error('AVAudioSession activation failed')
    );
    // initAudioSafely が catch することを前提に、init 自体は throw するべき
    await expect(audioEngine.init()).rejects.toThrow('AVAudioSession activation failed');
    // 失敗後は isReady のままにならない
    expect(audioEngine.isReady).toBe(false);
  });
});

// ── preload() ─────────────────────────────────────────────────────────────────

describe('AudioEngine.preload()', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await audioEngine.cleanup().catch(() => {});
    (Audio.setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
    (Audio.Sound.createAsync as jest.Mock).mockResolvedValue({
      sound: {
        playAsync:                 jest.fn().mockResolvedValue(undefined),
        stopAsync:                 jest.fn().mockResolvedValue(undefined),
        setVolumeAsync:            jest.fn().mockResolvedValue(undefined),
        setPositionAsync:          jest.fn().mockResolvedValue(undefined),
        getStatusAsync:            jest.fn().mockResolvedValue({ isLoaded: true, isPlaying: false }),
        unloadAsync:               jest.fn().mockResolvedValue(undefined),
        setOnPlaybackStatusUpdate: jest.fn(),
      },
    });
  });

  test('正常系: preload が完了しても例外を throw しない', async () => {
    await audioEngine.init();
    await expect(audioEngine.preload()).resolves.toBeUndefined();
  });

  test('一部の Sound.createAsync が失敗しても preload 全体は完了する', async () => {
    // 最初の呼び出しのみ失敗、残りは成功
    (Audio.Sound.createAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('file not found'))
      .mockResolvedValue({
        sound: {
          playAsync:                 jest.fn().mockResolvedValue(undefined),
          stopAsync:                 jest.fn().mockResolvedValue(undefined),
          setVolumeAsync:            jest.fn().mockResolvedValue(undefined),
          setPositionAsync:          jest.fn().mockResolvedValue(undefined),
          getStatusAsync:            jest.fn().mockResolvedValue({ isLoaded: true, isPlaying: false }),
          unloadAsync:               jest.fn().mockResolvedValue(undefined),
          setOnPlaybackStatusUpdate: jest.fn(),
        },
      });

    await audioEngine.init();
    // 個別エラーは内部で warn するだけで、preload 全体は resolve する
    await expect(audioEngine.preload()).resolves.toBeUndefined();
  });
});

// ── startOnboardingBed() ──────────────────────────────────────────────────────

describe('AudioEngine.startOnboardingBed()', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await audioEngine.cleanup().catch(() => {});
    (Audio.setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
  });

  test('sounds が未ロード（preload なし）でも throw しない', async () => {
    // cleanup 後: sounds は空、isInitialized は false
    // startOnboardingBed 内で init() が再呼び出しされるが、
    // sounds['onboardingBed'] が undefined のため setVolume/play は no-op になる
    await expect(audioEngine.startOnboardingBed()).resolves.toBeUndefined();
  });
});

// ── onHighFreqSpike() ─────────────────────────────────────────────────────────

describe('AudioEngine.onHighFreqSpike()', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await audioEngine.cleanup().catch(() => {});
  });

  test('bellChime が未ロードでも throw しない', async () => {
    await expect(audioEngine.onHighFreqSpike()).resolves.toBeUndefined();
  });
});
