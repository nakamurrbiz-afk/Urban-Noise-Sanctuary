module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    // Mock expo modules that require native code
    'expo-location': '<rootDir>/src/__mocks__/expo-location.ts',
    'expo-calendar': '<rootDir>/src/__mocks__/expo-calendar.ts',
    'expo-av': '<rootDir>/src/__mocks__/expo-av.ts',
    'expo-haptics': '<rootDir>/src/__mocks__/expo-haptics.ts',
    // Phase B binaural synth — always reports unavailable in test (no native runtime)
    // Pattern matches the relative import path used in AudioEngine.ts
    '.*modules/binaural-synth/src/index': '<rootDir>/src/__mocks__/binaural-synth.ts',
  },
};
