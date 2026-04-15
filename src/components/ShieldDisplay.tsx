/**
 * ShieldDisplay — "Noise Absorption" visual
 *
 * Two-layer effect:
 *   1. Wave rings: scale out continuously, speed tracks noiseLevel
 *   2. Absorb flash: when noiseLevel crosses threshold, the core
 *      flashes bright + the hex border pulses — "eating" the noise
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  interpolate,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, ANIMATION, NOISE_THRESHOLD } from '../constants/theme';
import { SanctuaryMode } from '../types';
import { MODE_CONFIG } from '../constants/theme';

const { width } = Dimensions.get('window');
const SHIELD_SIZE = width * 0.72;

// ─── Wave ring — scales outward, speed driven by noise ──────────────────────
function NoiseWaveRing({
  noiseLevel,
  color,
  index,
}: {
  noiseLevel: number;
  color: string;
  index: number;
}) {
  const scale = useSharedValue(0.82);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Faster + more opaque when noisier
    const speed = 900 + (1 - noiseLevel) * 1600;
    const peakOpacity = 0.08 + noiseLevel * 0.28;

    scale.value = withRepeat(
      withSequence(
        withTiming(1.0 + index * 0.1, { duration: speed, easing: Easing.out(Easing.sin) }),
        withTiming(0.82, { duration: speed * 0.7, easing: Easing.in(Easing.sin) })
      ),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(peakOpacity, { duration: speed }),
        withTiming(0, { duration: speed * 0.7 })
      ),
      -1,
      false
    );
  }, [Math.round(noiseLevel * 5)]); // re-trigger only on meaningful changes

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const size = SHIELD_SIZE + index * 40;
  const offset = (SHIELD_SIZE - size) / 2;

  return (
    <Animated.View
      style={[
        styles.waveRing,
        animStyle,
        { width: size, height: size, borderRadius: size / 2, borderColor: color, top: offset, left: offset },
      ]}
    />
  );
}

// ─── Absorb particle — brief flash emitted from shield edge on spike ─────────
function AbsorbParticle({ trigger, color }: { trigger: number; color: string }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    // Quick burst: expand and fade
    scale.value = withSequence(
      withTiming(1.3, { duration: ANIMATION.shieldAbsorbMs * 0.4, easing: Easing.out(Easing.cubic) }),
      withTiming(1.6, { duration: ANIMATION.shieldAbsorbMs * 0.6, easing: Easing.in(Easing.quad) })
    );
    opacity.value = withSequence(
      withTiming(0.7, { duration: ANIMATION.shieldAbsorbMs * 0.3 }),
      withTiming(0, { duration: ANIMATION.shieldAbsorbMs * 0.7 })
    );
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.absorbRing,
        style,
        { borderColor: color, width: SHIELD_SIZE * 0.88, height: SHIELD_SIZE * 0.88,
          borderRadius: SHIELD_SIZE * 0.44,
          top: SHIELD_SIZE * 0.06, left: SHIELD_SIZE * 0.06 },
      ]}
    />
  );
}

// ─── Core shield ─────────────────────────────────────────────────────────────
function ShieldCore({
  isActive,
  mode,
  noiseLevel,
  absorbTrigger,
}: {
  isActive: boolean;
  mode: SanctuaryMode;
  noiseLevel: number;
  absorbTrigger: number;
}) {
  const modeColor = MODE_CONFIG[mode].color;
  const scale = useSharedValue(0);
  const rotation = useSharedValue(0);
  const coreGlow = useSharedValue(0.6);
  const hexBorderWidth = useSharedValue(0.5);
  const absorbFlash = useSharedValue(0);

  // Expand / collapse on activation
  useEffect(() => {
    if (isActive) {
      scale.value = withSpring(1, { damping: 14, stiffness: 80 });
      rotation.value = withRepeat(
        withTiming(360, { duration: 22000, easing: Easing.linear }), -1, false
      );
      coreGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: ANIMATION.shieldPulseMs * 0.5 }),
          withTiming(0.55, { duration: ANIMATION.shieldPulseMs * 0.5 })
        ),
        -1,
        false
      );
    } else {
      scale.value = withTiming(0, { duration: 500 });
      cancelAnimation(rotation);
      cancelAnimation(coreGlow);
      coreGlow.value = 0;
    }
  }, [isActive]);

  // Noise absorption flash — triggered when noiseLevel crosses threshold
  useEffect(() => {
    if (noiseLevel > NOISE_THRESHOLD.lowFreqRamp && isActive) {
      // Hex border pulses thicker + brighter
      hexBorderWidth.value = withSequence(
        withTiming(2.5, { duration: 120 }),
        withTiming(0.5, { duration: 350 })
      );
      coreGlow.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0.65, { duration: 500 })
      );
    }
  }, [Math.round(noiseLevel * 8)]);

  // High-freq spike → sharp absorb flash on orb
  useEffect(() => {
    if (absorbTrigger === 0) return;
    absorbFlash.value = withSequence(
      withTiming(1, { duration: 60 }),
      withTiming(0, { duration: 340 })
    );
    hexBorderWidth.value = withSequence(
      withTiming(3, { duration: 60 }),
      withTiming(0.5, { duration: 400 })
    );
  }, [absorbTrigger]);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotation.value}deg` }],
    opacity: interpolate(scale.value, [0, 1], [0, 1]),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: coreGlow.value,
    shadowOpacity: coreGlow.value * 0.8,
  }));

  const hexBorderStyle = useAnimatedStyle(() => ({
    borderWidth: hexBorderWidth.value,
  }));

  const absorbFlashStyle = useAnimatedStyle(() => ({
    opacity: absorbFlash.value,
  }));

  // Inner orb color interpolates: mode color → absorb white on spike
  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.7 + coreGlow.value * 0.3,
  }));

  return (
    <Animated.View style={[styles.shieldShell, shellStyle]}>
      {/* Hex border — pulses on noise absorption */}
      <Animated.View style={[styles.hexBorder, hexBorderStyle, { borderColor: modeColor + '55' }]} />

      {/* Gradient fill */}
      <Animated.View style={[styles.hexInner, glowStyle]}>
        <LinearGradient
          colors={[modeColor + '18', COLORS.bgCard + 'BB', COLORS.bg + 'FF']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      {/* Absorb flash overlay — bright white flare on spike */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.hexInner,
          absorbFlashStyle,
          { backgroundColor: COLORS.shieldAbsorb + '30' },
        ]}
      />

      {/* Center orb */}
      <Animated.View
        style={[
          styles.centerOrb,
          glowStyle,
          { backgroundColor: modeColor + '35', shadowColor: modeColor },
        ]}
      >
        <Animated.View style={[styles.innerOrb, orbStyle, { backgroundColor: modeColor + '90' }]} />

        {/* Spike absorb flash on orb */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: SHIELD_SIZE * 0.14, backgroundColor: COLORS.shieldAbsorb + '60' },
            absorbFlashStyle,
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
interface Props {
  isActive: boolean;
  mode: SanctuaryMode;
  noiseLevel: number;
  absorbTrigger?: number;   // increment to fire one absorb flash
}

export function ShieldDisplay({ isActive, mode, noiseLevel, absorbTrigger = 0 }: Props) {
  const modeColor = MODE_CONFIG[mode].color;

  return (
    <View style={styles.container}>
      {isActive && (
        <>
          <NoiseWaveRing noiseLevel={noiseLevel} color={modeColor} index={0} />
          <NoiseWaveRing noiseLevel={noiseLevel} color={modeColor} index={1} />
          <NoiseWaveRing noiseLevel={noiseLevel} color={modeColor} index={2} />
          <AbsorbParticle trigger={absorbTrigger} color={COLORS.shieldAbsorb} />
        </>
      )}
      <ShieldCore
        isActive={isActive}
        mode={mode}
        noiseLevel={noiseLevel}
        absorbTrigger={absorbTrigger}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SHIELD_SIZE,
    height: SHIELD_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  waveRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  absorbRing: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  shieldShell: {
    width: SHIELD_SIZE * 0.84,
    height: SHIELD_SIZE * 0.84,
    borderRadius: SHIELD_SIZE * 0.42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hexBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SHIELD_SIZE * 0.42,
  },
  hexInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: SHIELD_SIZE * 0.42,
  },
  centerOrb: {
    width: SHIELD_SIZE * 0.26,
    height: SHIELD_SIZE * 0.26,
    borderRadius: SHIELD_SIZE * 0.13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    overflow: 'hidden',
  },
  innerOrb: {
    width: SHIELD_SIZE * 0.13,
    height: SHIELD_SIZE * 0.13,
    borderRadius: SHIELD_SIZE * 0.065,
  },
});
