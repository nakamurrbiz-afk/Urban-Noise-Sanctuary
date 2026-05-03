/**
 * OnboardingScreen — initAudioSafely ユニットテスト
 *
 * Bug1 回帰テスト:
 *   「音を聴く」ボタン押下時に audioEngine.init() が iOS 実機で
 *   throw しても、呼び出し元の画面遷移をブロックしないことを保証する。
 *
 * ── モック方針 ────────────────────────────────────────────────────
 * expo-av / expo-haptics は jest.config.js の moduleNameMapper で
 * 自動的に src/__mocks__/ 配下にリダイレクトされる。
 * テスト内で jest.mock('expo-av', factory) を呼ぶと factory 内の
 * require が同じパターンにマッチして無限再帰するため、明示的な
 * jest.mock 呼び出しは AudioEngine のみに留める。
 */

// UI レンダリング依存をスタブ化（initAudioSafely はロジックのみ）
jest.mock('react-native-reanimated', () => ({
  default: { View: 'View', createAnimatedComponent: (c: unknown) => c },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: unknown) => v,
  FadeIn:    { duration: () => ({ springify: () => ({}) }) },
  FadeInDown: { duration: () => ({ springify: () => ({}) }) },
}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

// Store / Engine / Permission 依存をスタブ化
jest.mock('../store', () => ({
  useUNSStore: () => ({ completeOnboarding: jest.fn() }),
}));
jest.mock('../engines/ContextEngine', () => ({
  getNextEventTitle: jest.fn().mockResolvedValue({ count: 0, title: null }),
}));
jest.mock('../engines/NotificationEngine', () => ({
  requestNotificationPermission: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../engines/AudioEngine', () => ({
  audioEngine: {
    init:             jest.fn().mockResolvedValue(undefined),
    preload:          jest.fn().mockResolvedValue(undefined),
    startOnboardingBed: jest.fn().mockResolvedValue(undefined),
    stopOnboardingBed:  jest.fn().mockResolvedValue(undefined),
  },
}));

// ── テスト対象インポート ───────────────────────────────────────────────────────
// expo-av は moduleNameMapper → src/__mocks__/expo-av.ts に解決される
import { initAudioSafely } from '../screens/OnboardingScreen';
import { Audio } from 'expo-av';
import { audioEngine } from '../engines/AudioEngine';

// ── テストスイート ────────────────────────────────────────────────────────────

describe('initAudioSafely', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 正常系がデフォルト
    (Audio.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (audioEngine.init    as jest.Mock).mockResolvedValue(undefined);
    (audioEngine.preload as jest.Mock).mockResolvedValue(undefined);
  });

  // ── 正常系 ──────────────────────────────────────────────────────────────────

  test('音声初期化が成功したとき true を返す', async () => {
    const result = await initAudioSafely();
    expect(result).toBe(true);
  });

  test('成功時に audioEngine.init と preload が呼ばれる', async () => {
    await initAudioSafely();
    expect(audioEngine.init).toHaveBeenCalledTimes(1);
    expect(audioEngine.preload).toHaveBeenCalledTimes(1);
  });

  // ── Bug1 回帰テスト ──────────────────────────────────────────────────────────
  // iOS 実機で Audio.setAudioModeAsync が失敗するパターン

  test('[Bug1 回帰] audioEngine.init が throw しても false を返し例外を伝播しない', async () => {
    (audioEngine.init as jest.Mock).mockRejectedValue(new Error('AVAudioSession error'));
    // 例外が伝播すると await で throw し、テスト自体が fail する
    // ここに到達できれば「例外が飲み込まれている」ことが証明される
    const result = await initAudioSafely();
    expect(result).toBe(false);
  });

  test('[Bug1 回帰] audioEngine.preload が throw しても false を返す', async () => {
    (audioEngine.preload as jest.Mock).mockRejectedValue(new Error('preload error'));
    const result = await initAudioSafely();
    expect(result).toBe(false);
  });

  test('[Bug1 回帰] Audio.requestPermissionsAsync が throw しても false を返す', async () => {
    (Audio.requestPermissionsAsync as jest.Mock).mockRejectedValue(new Error('permission error'));
    const result = await initAudioSafely();
    expect(result).toBe(false);
  });

  // ── 追加検証 ─────────────────────────────────────────────────────────────────

  test('init が throw した場合 preload は呼ばれない', async () => {
    (audioEngine.init as jest.Mock).mockRejectedValue(new Error('init error'));
    await initAudioSafely();
    expect(audioEngine.preload).not.toHaveBeenCalled();
  });
});
