/**
 * binaural-synth mock for Jest
 *
 * isAvailable() returns false — AudioEngine falls back to Phase A WAV files.
 * All async methods resolve immediately so tests complete without hanging.
 */
export const BinauralSynth = {
  isAvailable:    jest.fn().mockReturnValue(false),
  start:          jest.fn().mockResolvedValue(undefined),
  stop:           jest.fn().mockResolvedValue(undefined),
  setFrequencies: jest.fn().mockResolvedValue(undefined),
  setAmplitude:   jest.fn().mockResolvedValue(undefined),
};
