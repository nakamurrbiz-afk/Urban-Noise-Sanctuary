// ─── Session & State ───────────────────────────────────────────────────────
export type SanctuaryMode = 'calm' | 'focus' | 'activate';
export type SessionStatus = 'idle' | 'active' | 'paused' | 'completed';
export type HRVDataLevel = 'real' | 'estimated' | 'none';

export interface SanctuarySession {
  id: string;
  startedAt: number;
  endedAt?: number;
  mode: SanctuaryMode;
  routeProfile?: RouteProfile;
  durationMs: number;
  hrvLevel: HRVDataLevel;
}

// ─── Route DNA ─────────────────────────────────────────────────────────────
export interface RouteProfile {
  id: string;
  lineName: string;          // e.g. "山手線", "大江戸線"
  fromStation: string;
  toStation: string;
  avgDurationMs: number;
  noiseProfile: NoiseProfile;
  detectedAt: number;
  sessionCount: number;
}

export interface NoiseProfile {
  lowFreqIntensity: number;   // 0-1: drone intensity for masking
  highFreqSpikes: boolean;    // brake sounds detected?
  avgDecibels: number;
}

// ─── HRV & Biometrics ──────────────────────────────────────────────────────
export interface HRVReading {
  timestamp: number;
  rmssd: number;              // ms
  source: 'healthkit' | 'estimated';
}

export interface ConditionTrend {
  level: HRVDataLevel;
  score: number;              // 0-100 (internal, never shown as absolute)
  weekOverWeek: 'better' | 'same' | 'worse';
  lastUpdated: number;
}

// ─── Mind Weather ──────────────────────────────────────────────────────────
export type NotificationPattern = 'fatigue' | 'important_event' | 'good_condition' | 'default';

export interface MindWeatherPayload {
  pattern: NotificationPattern;
  message: string;
  subMessage: string;
  scheduledFor: number;
}

// ─── Weekly Summary ────────────────────────────────────────────────────────
export interface WeeklySummary {
  weekStart: number;
  sessionCount: number;
  totalProtectedMs: number;
  conditionTrend: 'better' | 'same' | 'worse';
  bestSession?: SanctuarySession;
  streakDays: number;
}
