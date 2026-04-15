import { create } from 'zustand';
import type {
  SessionStatus,
  SanctuaryMode,
  SanctuarySession,
  RouteProfile,
  ConditionTrend,
  WeeklySummary,
  HRVReading,
} from '../types';

interface UNSStore {
  // ─── Session ─────────────────────────────────────────────
  sessionStatus: SessionStatus;
  currentMode: SanctuaryMode;
  currentSession: SanctuarySession | null;
  sessionHistory: SanctuarySession[];

  // ─── Audio ───────────────────────────────────────────────
  noiseLevel: number;         // 0-1 realtime from mic
  sanctuaryLevel: number;     // 0-1 internal calm level
  isAudioReady: boolean;

  // ─── Route DNA ───────────────────────────────────────────
  routeProfiles: RouteProfile[];
  activeRouteProfile: RouteProfile | null;
  isMoving: boolean;

  // ─── Biometrics ──────────────────────────────────────────
  conditionTrend: ConditionTrend;
  recentHRV: HRVReading[];

  // ─── UI ──────────────────────────────────────────────────
  showCompletion: boolean;
  onboardingComplete: boolean;

  // ─── Weekly ──────────────────────────────────────────────
  weeklySummary: WeeklySummary | null;

  // ─── Route DNA promotion ─────────────────────────────────
  showLocationPromotion: boolean;

  // ─── Dev ─────────────────────────────────────────────────
  isDebugUnlocked: boolean;
  lastSessionDebugLog: string | null;
  lastSessionNarrative: string | null;

  // ─── Actions ─────────────────────────────────────────────
  startSession: (mode: SanctuaryMode) => void;
  endSession: () => void;
  setNoiseLevel: (level: number) => void;
  setSanctuaryLevel: (level: number) => void;
  setIsMoving: (moving: boolean) => void;
  setAudioReady: (ready: boolean) => void;
  addRouteProfile: (profile: RouteProfile) => void;
  setActiveRoute: (profile: RouteProfile | null) => void;
  updateConditionTrend: (trend: ConditionTrend) => void;
  addHRVReading: (reading: HRVReading) => void;
  dismissCompletion: () => void;
  completeOnboarding: () => void;
  setCurrentMode: (mode: SanctuaryMode) => void;
  setWeeklySummary: (summary: WeeklySummary) => void;
  setShowLocationPromotion: (show: boolean) => void;
  setDebugUnlocked: (unlocked: boolean) => void;
  setLastSessionDebugLog: (log: string | null) => void;
  setLastSessionNarrative: (narrative: string | null) => void;
}

export const useUNSStore = create<UNSStore>((set, get) => ({
  // ─── Initial State ───────────────────────────────────────
  sessionStatus: 'idle',
  currentMode: 'calm',
  currentSession: null,
  sessionHistory: [],
  noiseLevel: 0,
  sanctuaryLevel: 0,
  isAudioReady: false,
  routeProfiles: [],
  activeRouteProfile: null,
  isMoving: false,
  conditionTrend: {
    level: 'none',
    score: 70,
    weekOverWeek: 'same',
    lastUpdated: Date.now(),
  },
  recentHRV: [],
  showCompletion: false,
  onboardingComplete: false,
  weeklySummary: null,
  showLocationPromotion: false,
  isDebugUnlocked: false,
  lastSessionDebugLog: null,
  lastSessionNarrative: null,

  // ─── Actions ─────────────────────────────────────────────
  startSession: (mode) => {
    const session: SanctuarySession = {
      id: `session_${Date.now()}`,
      startedAt: Date.now(),
      mode,
      durationMs: 0,
      hrvLevel: get().conditionTrend.level,
      routeProfile: get().activeRouteProfile ?? undefined,
    };
    set({ sessionStatus: 'active', currentSession: session, currentMode: mode, showCompletion: false });
  },

  endSession: () => {
    const session = get().currentSession;
    if (!session) return;
    const completed: SanctuarySession = {
      ...session,
      endedAt: Date.now(),
      durationMs: Date.now() - session.startedAt,
    };
    set((state) => ({
      sessionStatus: 'completed',
      currentSession: null,
      sessionHistory: [completed, ...state.sessionHistory].slice(0, 100),
      showCompletion: true,
    }));
  },

  setNoiseLevel: (level) => set({ noiseLevel: Math.max(0, Math.min(1, level)) }),
  setSanctuaryLevel: (level) => set({ sanctuaryLevel: Math.max(0, Math.min(1, level)) }),
  setIsMoving: (moving) => set({ isMoving: moving }),
  setAudioReady: (ready) => set({ isAudioReady: ready }),

  addRouteProfile: (profile) =>
    set((state) => ({
      routeProfiles: [profile, ...state.routeProfiles.filter((r) => r.id !== profile.id)],
    })),

  setActiveRoute: (profile) => set({ activeRouteProfile: profile }),

  updateConditionTrend: (trend) => set({ conditionTrend: trend }),

  addHRVReading: (reading) =>
    set((state) => ({
      recentHRV: [reading, ...state.recentHRV].slice(0, 200),
    })),

  dismissCompletion: () => set({ showCompletion: false, sessionStatus: 'idle' }),

  completeOnboarding: () => set({ onboardingComplete: true }),

  setCurrentMode: (mode) => set({ currentMode: mode }),

  setWeeklySummary: (summary) => set({ weeklySummary: summary }),

  setShowLocationPromotion: (show) => set({ showLocationPromotion: show }),

  setDebugUnlocked: (unlocked) => set({ isDebugUnlocked: unlocked }),
  setLastSessionDebugLog: (log) => set({ lastSessionDebugLog: log }),
  setLastSessionNarrative: (narrative) => set({ lastSessionNarrative: narrative }),
}));
