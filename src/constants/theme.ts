export const COLORS = {
  // Background — deep lacquer black
  bg: '#0A0A0B',
  bgSecondary: '#0D1520',
  bgCard: '#111827',
  bgDebug: '#0D1117',

  // Shield / Core
  shieldCore: '#00C8F0',
  shieldRing: '#0077BB',
  shieldGold: '#C4A84A',
  shieldActive: '#00F0C8',
  shieldAbsorb: '#7FEFFF',    // flash color when noise absorbed

  // Text — thin, high-contrast
  textPrimary: '#EDF2FF',
  textSecondary: '#6B93B8',
  textMuted: '#2E4A66',

  // Accent per mode
  accentCalm: '#3D82C8',
  accentFocus: '#6A5AE0',
  accentActivate: '#F05A28',

  // Status
  success: '#00C8A0',
  warning: '#F0A030',
  debugAccent: '#F0E040',

  // Gradient stops
  gradientTop: '#0A0A0B',
  gradientBottom: '#091422',
} as const;

// Fine-weight sans-serif: system fonts that render thin on iOS / Android
// iOS uses SF Pro (supports weight '100'–'900')
// Android uses Roboto (similar weight range)
export const TYPOGRAPHY = {
  heading1: { fontSize: 28, fontWeight: '200' as const, letterSpacing: 3 },
  heading2: { fontSize: 20, fontWeight: '200' as const, letterSpacing: 2 },
  heading3: { fontSize: 16, fontWeight: '300' as const, letterSpacing: 1.2 },
  body:     { fontSize: 14, fontWeight: '300' as const, lineHeight: 22 },
  caption:  { fontSize: 11, fontWeight: '300' as const, letterSpacing: 1.2 },
  ritual:   { fontSize: 18, fontWeight: '200' as const, lineHeight: 30, letterSpacing: 1.6 },
  debug:    { fontSize: 11, fontWeight: '400' as const, letterSpacing: 0.5, fontVariant: ['tabular-nums'] as any },
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  xxl: 64,
} as const;

export const ANIMATION = {
  shieldExpandMs: 1500,
  shieldPulseMs: 3200,
  shieldAbsorbMs: 400,   // noise-absorption flash
  completionMs: 800,
  waveMs: 2200,
  droneRampMs: 500,      // low-freq detection fade-in
} as const;

export const MODE_CONFIG = {
  calm: {
    label: 'Calm',
    labelJa: 'コルチゾール・デトックス',
    color: '#3D82C8',
    binauralHz: 6,
    droneIntensity: 0.35,
    description: '副交感神経を優位に',
  },
  focus: {
    label: 'Focus',
    labelJa: 'α波フォーカス',
    color: '#6A5AE0',
    binauralHz: 12,
    droneIntensity: 0.25,
    description: 'リラックスした集中へ',
  },
  activate: {
    label: 'Activate',
    labelJa: 'アドレナリン・プレップ',
    color: '#F05A28',
    binauralHz: 18,
    droneIntensity: 0.15,
    description: '交感神経を優位に',
  },
} as const;

// Low-freq detection threshold for drone ramp
export const NOISE_THRESHOLD = {
  lowFreqRamp: 0.35,    // above this → start drone fade-in
  highFreqSpike: 0.72,  // above this → trigger bell chime
} as const;
