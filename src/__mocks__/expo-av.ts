/**
 * expo-av モック
 *
 * Audio.setAudioModeAsync, Audio.requestPermissionsAsync,
 * Audio.Sound.createAsync をモックし、Jest 上でネイティブ呼び出しなしに
 * AudioEngine / OnboardingScreen のロジックをテストできるようにする。
 */

const mockSound = {
  playAsync: jest.fn().mockResolvedValue(undefined),
  stopAsync: jest.fn().mockResolvedValue(undefined),
  setVolumeAsync: jest.fn().mockResolvedValue(undefined),
  setPositionAsync: jest.fn().mockResolvedValue(undefined),
  getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, isPlaying: false }),
  unloadAsync: jest.fn().mockResolvedValue(undefined),
  setOnPlaybackStatusUpdate: jest.fn(),
};

export const Audio = {
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  Sound: {
    createAsync: jest.fn().mockResolvedValue({ sound: mockSound }),
  },
};

export { mockSound };
