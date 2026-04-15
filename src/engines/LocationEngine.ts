/**
 * LocationEngine — subway-hardened transit detection
 *
 * Problem: Tokyo subway (大江戸線, 銀座線) blocks GPS entirely underground.
 * Naive implementations fire transitEnded the moment speed = 0 or -1,
 * fragmenting Route DNA sessions and releasing the Sanctuary prematurely.
 *
 * Solution — four-layer resilience:
 *
 *   Layer 1: GPS-loss hold timer (3 minutes)
 *     When speed drops to 0 / -1, start a 3-minute countdown.
 *     transitEnded is NOT fired until the timer expires with no recovery.
 *
 *   Layer 2: DeviceMotion "vibration alive" check
 *     While GPS is lost, subscribe to the accelerometer at 5 Hz.
 *     If the acceleration variance over the last 5 seconds exceeds the
 *     subway-vibration threshold (0.05 m²/s⁴), reset the hold timer.
 *     Keeps the session alive on deep underground lines indefinitely.
 *
 *   Layer 3: Pedometer "step burst" detection  ← NEW (P0)
 *     While GPS is lost, also subscribe to the step counter.
 *     10+ consecutive steps = user has left the train and is walking.
 *     This fires transitEnded IMMEDIATELY (before the 3-min timer expires),
 *     so the Completion Ritual appears the moment the user hits the stairs.
 *     "電車を降りた瞬間にバリアが解ける" — the magical timing.
 *
 *   Layer 4: Adaptive sampling
 *     Active transit / recent GPS loss → 1-second interval (High accuracy)
 *     Stationary + background           → 60-second interval (Balanced)
 */

import * as Location from 'expo-location';
import { DeviceMotion, Pedometer } from 'expo-sensors';
import { AppState, AppStateStatus } from 'react-native';
import { RouteDNALearner, MovementSample } from './ContextEngine';
import { useUNSStore } from '../store';

// ─── Tuning constants ─────────────────────────────────────────────────────────
const FAST_INTERVAL_MS      = 1_000;
const SLOW_INTERVAL_MS      = 60_000;
const GPS_HOLD_MS           = 3 * 60_000;
const MOTION_SAMPLE_RATE_MS = 200;
const MOTION_WINDOW_SIZE    = 25;        // 5s at 5 Hz
const MOTION_VAR_THRESHOLD  = 0.05;     // m²/s⁴ — subway vibration floor
const TRANSIT_SPEED_MS      = 15 / 3.6;
// Dual-gate walk confirmation (prevents false positives from in-car repositioning):
//   Gate 1: cumulative steps >= WALK_MIN_STEPS  (10 steps ≈ 7–8 m)
//   Gate 2: sustained for >= WALK_MIN_DURATION_MS (5 seconds)
//
// In-car micro-movement (e.g. rush-hour reposition) typically:
//   • Stays below 10 steps, OR
//   • Completes in < 3 seconds even if it crosses 10 steps
// Real descending-stairs walking comfortably satisfies both gates.
const WALK_MIN_STEPS        = 10;
const WALK_MIN_DURATION_MS  = 5_000; // 5 seconds sustained walk

type SamplingRate = 'fast' | 'slow';

class LocationEngine {
  private locationSub:  Location.LocationSubscription | null = null;
  private motionSub:    ReturnType<typeof DeviceMotion.addListener> | null = null;
  private pedoSub:      ReturnType<typeof Pedometer.watchStepCount> | null = null;
  private appStateSub:  ReturnType<typeof AppState.addEventListener> | null = null;

  private learner         = new RouteDNALearner();
  private currentRate:    SamplingRate = 'slow';
  private isBackground    = false;

  // GPS-loss hold
  private gpsLostAt:     number | null = null;
  private holdTimer:     ReturnType<typeof setTimeout> | null = null;
  private gpsLostCount   = 0;  // per-session counter for debug stats

  // DeviceMotion sliding window
  private motionWindow:  number[] = [];
  private motionAlive    = false;

  // Pedometer — dual-gate walk confirmation
  private pedometerSteps  = 0;
  private walkFirstStepAt: number | null = null;  // timestamp of first step > 0
  private walkConfirmTimer: ReturnType<typeof setTimeout> | null = null;

  // Last known GPS coords for synthetic sample injection
  private lastLocation: { latitude: number; longitude: number; timestamp: number } | null = null;

  // ─── Permission ──────────────────────────────────────────────────────────────
  async hasPermission(): Promise<boolean> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  }

  async requestPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  // ─── Start / stop ─────────────────────────────────────────────────────────────
  async startMonitoring(): Promise<boolean> {
    if (this.locationSub) return true;
    const granted = (await this.hasPermission()) || (await this.requestPermission());
    if (!granted) return false;

    await this.subscribeLocation('slow');

    this.appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      this.isBackground = state !== 'active';
      this.recalcSamplingRate();
    });
    return true;
  }

  stopMonitoring(): void {
    this.locationSub?.remove();
    this.locationSub = null;
    this.stopMotionTracking();
    this.stopPedometerTracking();
    this.clearHoldTimer();
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  get isMonitoring(): boolean { return this.locationSub !== null; }

  // ─── Location subscription ────────────────────────────────────────────────────
  private async subscribeLocation(rate: SamplingRate): Promise<void> {
    this.locationSub?.remove();
    this.currentRate = rate;
    const isFast = rate === 'fast';
    this.locationSub = await Location.watchPositionAsync(
      {
        accuracy: isFast ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: isFast ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS,
        distanceInterval: 0,
      },
      (loc) => this.onLocationUpdate(loc),
    );
  }

  private async recalcSamplingRate(): Promise<void> {
    const store = useUNSStore.getState();
    const needsFast = store.isMoving || this.isGPSHoldActive() || !this.isBackground;
    const target: SamplingRate = needsFast ? 'fast' : 'slow';
    if (target !== this.currentRate) await this.subscribeLocation(target);
  }

  // ─── GPS-loss hold ────────────────────────────────────────────────────────────
  private isGPSHoldActive(): boolean { return this.gpsLostAt !== null; }

  private startHold(): void {
    if (this.isGPSHoldActive()) return;
    this.gpsLostAt = Date.now();
    this.gpsLostCount++;
    this.startMotionTracking();
    this.startPedometerTracking();   // ← Layer 3
    this.scheduleHoldExpiry();
  }

  private extendHold(): void {
    this.clearHoldTimer();
    this.scheduleHoldExpiry();
  }

  private cancelHold(): void {
    this.gpsLostAt = null;
    this.clearHoldTimer();
    this.stopMotionTracking();
    this.stopPedometerTracking();
  }

  private scheduleHoldExpiry(): void {
    this.holdTimer = setTimeout(() => {
      this.gpsLostAt = null;
      this.stopMotionTracking();
      this.stopPedometerTracking();
      this.fireTransitEnd();
    }, GPS_HOLD_MS);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
  }

  // ─── DeviceMotion tracking (Layer 2) ─────────────────────────────────────────
  private startMotionTracking(): void {
    if (this.motionSub) return;
    this.motionWindow = [];
    this.motionAlive  = false;
    DeviceMotion.setUpdateInterval(MOTION_SAMPLE_RATE_MS);
    this.motionSub = DeviceMotion.addListener((data) => {
      const a = data.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      this.motionWindow.push(mag);
      if (this.motionWindow.length > MOTION_WINDOW_SIZE) this.motionWindow.shift();
      if (this.motionWindow.length === MOTION_WINDOW_SIZE) {
        const variance = this.computeVariance(this.motionWindow);
        this.motionAlive = variance > MOTION_VAR_THRESHOLD;
        if (this.motionAlive && this.isGPSHoldActive()) this.extendHold();
      }
    });
  }

  private stopMotionTracking(): void {
    this.motionSub?.remove();
    this.motionSub = null;
    this.motionWindow = [];
    this.motionAlive = false;
  }

  private computeVariance(values: number[]): number {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  }

  // ─── Pedometer tracking (Layer 3) ────────────────────────────────────────────
  // Pedometer.watchStepCount returns cumulative steps since subscription start.
  // 10 steps ≈ the user has walked onto the platform — fire immediately.
  private startPedometerTracking(): void {
    if (this.pedoSub) return;
    this.pedometerSteps = 0;

    Pedometer.isAvailableAsync().then((available) => {
      if (!available || !this.isGPSHoldActive()) return;
      this.pedoSub = Pedometer.watchStepCount(({ steps }) => {
        // `steps` = cumulative count since watchStepCount was called (iOS)
        this.pedometerSteps = steps;

        // Gate 1: record when walking first begins
        if (steps > 0 && this.walkFirstStepAt === null) {
          this.walkFirstStepAt = Date.now();
        }

        // Gate 2: steps threshold crossed — start the confirmation window
        if (steps >= WALK_MIN_STEPS && this.walkConfirmTimer === null && this.walkFirstStepAt !== null) {
          const elapsed = Date.now() - this.walkFirstStepAt;
          if (elapsed >= WALK_MIN_DURATION_MS) {
            // Already sustained long enough → fire immediately
            this.forcedTransitEndBySteps();
          } else {
            // Wait out the remaining duration, then re-check steps are still accumulating
            const remaining = WALK_MIN_DURATION_MS - elapsed;
            this.walkConfirmTimer = setTimeout(() => {
              this.walkConfirmTimer = null;
              // Re-check: user must still be stepping (steps continued accumulating)
              if (this.pedometerSteps >= WALK_MIN_STEPS && this.isGPSHoldActive()) {
                this.forcedTransitEndBySteps();
              }
              // If steps stopped (user paused mid-stride), skip — not a clean exit
            }, remaining);
          }
        }
      });
    });
  }

  private stopPedometerTracking(): void {
    this.pedoSub?.remove();
    this.pedoSub = null;
    this.pedometerSteps  = 0;
    this.walkFirstStepAt = null;
    if (this.walkConfirmTimer) {
      clearTimeout(this.walkConfirmTimer);
      this.walkConfirmTimer = null;
    }
  }

  // The definitive "left the train" signal:
  // Inject a synthetic stopped-speed sample into the learner so
  // sessionCount is properly incremented and route profile is persisted.
  private forcedTransitEndBySteps(): void {
    this.cancelHold(); // clears hold timer + stops motion + stops pedometer

    if (this.lastLocation) {
      // Synthetic sample with speed=0 → triggers transitEnded in learner
      const sample: MovementSample = {
        timestamp: Date.now(),
        latitude:  this.lastLocation.latitude,
        longitude: this.lastLocation.longitude,
        speed: 0,
      };
      const result = this.learner.addSample(sample);
      if (result.transitEnded) {
        this.handleTransitEnded(result.transitEnded);
        if (result.recognized) {
          useUNSStore.getState().setShowLocationPromotion(true);
        }
        return;
      }
    }

    // Fallback: learner didn't fire (session was below CONFIRM_MS),
    // but still clear UI state cleanly
    this.fireTransitEnd();
  }

  // ─── Location update handler ──────────────────────────────────────────────────
  private onLocationUpdate(location: Location.LocationObject): void {
    const rawSpeed = location.coords.speed ?? -1;
    const isGPSLost = rawSpeed < 0;
    const speed = Math.max(0, rawSpeed);

    // Save for synthetic sample injection
    if (!isGPSLost) {
      this.lastLocation = {
        latitude:  location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: location.timestamp,
      };
    }

    const store = useUNSStore.getState();

    if (isGPSLost && store.isMoving) {
      if (!this.isGPSHoldActive()) this.startHold();
      // While in hold, keep feeding synthetic "still fast" samples so the
      // learner accumulates duration without fragmenting the session
      const sample: MovementSample = {
        timestamp: location.timestamp,
        latitude:  this.lastLocation?.latitude  ?? location.coords.latitude,
        longitude: this.lastLocation?.longitude ?? location.coords.longitude,
        speed: TRANSIT_SPEED_MS + 0.1,
      };
      this.learner.addSample(sample);
      return;
    }

    if (!isGPSLost && this.isGPSHoldActive()) {
      this.cancelHold();
    }

    const sample: MovementSample = {
      timestamp: location.timestamp,
      latitude:  location.coords.latitude,
      longitude: location.coords.longitude,
      speed,
    };

    const result = this.learner.addSample(sample);

    if (result.transitStarted) {
      store.setIsMoving(true);
      this.subscribeLocation('fast');
    }

    if (result.transitEnded) {
      this.handleTransitEnded(result.transitEnded);
    }

    if (result.recognized) {
      store.setShowLocationPromotion(true);
    }

    if (!this.learner.isInTransit() && !this.isGPSHoldActive()) {
      store.setIsMoving(false);
      this.recalcSamplingRate();
    }
  }

  private handleTransitEnded(profile: import('../types').RouteProfile): void {
    const store = useUNSStore.getState();
    store.addRouteProfile(profile);
    store.setActiveRoute(profile);
    store.setIsMoving(false);
    this.recalcSamplingRate();
  }

  private fireTransitEnd(): void {
    const store = useUNSStore.getState();
    store.setIsMoving(false);
    this.recalcSamplingRate();
  }

  // ─── Public accessors ─────────────────────────────────────────────────────────
  getLearner()           { return this.learner; }
  getLearnedRoutes()     { return this.learner.getLearnedRoutes(); }
  getTotalSessionCount() { return this.learner.getTotalSessionCount(); }
  hasRecognizedRoute()   { return this.learner.hasRecognizedRoute(); }

  get debugMotionAlive():   boolean { return this.motionAlive; }
  get debugGPSHoldActive(): boolean { return this.isGPSHoldActive(); }
  get debugPedometerSteps():number  { return this.pedometerSteps; }
  get debugGPSLostCount():  number  { return this.gpsLostCount; }

  resetSessionStats(): void { this.gpsLostCount = 0; }
}

export const locationEngine = new LocationEngine();
