import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HYPE_TITLES = [
  "AMAZING!",
  "FABULOUS!",
  "PERFECT!",
  "BRILLIANT!",
  "SPECTACULAR!"
];

const CONFETTI_COLORS = [
  '#FFD700', // Gold
  '#FF4757', // Coral Red
  '#2ED573', // Vibrant Green
  '#1E90FF', // Dodger Blue
  '#FFA502', // Orange
  '#9B51E0', // Purple
  '#70A1FF', // Pastel Blue
  '#FF6B81', // Pink
];

// Individual high-performance Reanimated confetti particle
const ConfettiParticle = React.memo(({ index }) => {
  const progress = useSharedValue(0);

  const config = useMemo(() => {
    // Distribute particles across an upward explosion arc
    const angle = ((index % 30) / 30) * Math.PI * 0.8 + 0.1 * Math.PI; // 18 deg to 162 deg (upward fan)
    const power = 380 + Math.random() * 320; // Upward force
    const destX = Math.cos(angle) * (power * (0.6 + Math.random() * 0.4));
    const destY = -Math.sin(angle) * power;
    const fallY = destY + 300 + Math.random() * 250; // Gravity pull
    const rotZ = Math.floor(Math.random() * 720) - 360;
    const rotY = Math.floor(Math.random() * 720) - 360;
    const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
    const isCircle = index % 3 === 0;
    const sizeW = 7 + Math.random() * 5;
    const sizeH = isCircle ? sizeW : 5 + Math.random() * 6;

    return { destX, destY, fallY, rotZ, rotY, color, isCircle, sizeW, sizeH };
  }, [index]);

  useEffect(() => {
    // 1400ms burst & fall animation
    progress.value = withTiming(1, { duration: 1400, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    
    // Upward arc with gravity pull
    let curX = config.destX * p;
    let curY = 0;
    if (p < 0.4) {
      // Fast upward burst
      const burstP = p / 0.4;
      curY = config.destY * burstP;
    } else {
      // Arcing downward with gravity
      const fallP = (p - 0.4) / 0.6;
      curY = config.destY + (config.fallY - config.destY) * (fallP * fallP);
    }

    const opacity = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
    const rotZ = `${config.rotZ * p}deg`;
    const rotY = `${config.rotY * p}deg`;

    return {
      opacity,
      transform: [
        { translateX: curX },
        { translateY: curY },
        { rotateZ: rotZ },
        { rotateY: rotY },
        { scale: 1 - p * 0.2 }
      ]
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          bottom: 30,
          left: SCREEN_WIDTH / 2,
          width: config.sizeW,
          height: config.sizeH,
          backgroundColor: config.color,
          borderRadius: config.isCircle ? config.sizeW / 2 : 2,
        },
        animatedStyle
      ]}
    />
  );
});

// Particle Generator firing from bottom of screen
const ConfettiCannon = React.memo(() => {
  const particles = useMemo(() => Array.from({ length: 60 }), []);

  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {particles.map((_, i) => (
        <ConfettiParticle key={`confetti-${i}`} index={i} />
      ))}
    </View>
  );
});

export const CelebrationOverlay = ({ onCelebrationDone }) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const randomTitle = useMemo(() => {
    return HYPE_TITLES[Math.floor(Math.random() * HYPE_TITLES.length)];
  }, []);

  useEffect(() => {
    // 1. Spring up the glowing text from the center
    scale.value = withSpring(1, { damping: 8, stiffness: 120 });
    opacity.value = withTiming(1, { duration: 250 });

    // 2. Automatically advance after 1500ms on the JavaScript thread
    let advanceTimer = null;
    const timer = setTimeout(() => {
      // Fade out banner right before advance
      opacity.value = withTiming(0, { duration: 200 });
      advanceTimer = setTimeout(() => {
        if (onCelebrationDone) {
          try {
            onCelebrationDone();
          } catch (e) {
            console.error('[CelebrationOverlay] Error invoking onCelebrationDone:', e);
          }
        }
      }, 200);
    }, 1500);

    return () => {
      clearTimeout(timer);
      if (advanceTimer) clearTimeout(advanceTimer);
    };
  }, [onCelebrationDone]);

  const animatedBannerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }]
  }));

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Confetti cannon firing from the bottom of the screen */}
      <ConfettiCannon />

      {/* Stylized Glowing Text in the center of the grid */}
      <Animated.View style={[styles.centerBanner, animatedBannerStyle]}>
        <Text style={styles.celebrationSub}>LEVEL COMPLETE</Text>
        <Text style={styles.celebrationText}>{randomTitle}</Text>
        <View style={styles.shineBadge}>
          <Text style={styles.shineBadgeText}>✨ +25 COINS ✨</Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 210,
    pointerEvents: 'none',
  },
  centerBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: 'rgba(38, 30, 26, 0.92)',
    borderWidth: 2,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 16,
    zIndex: 220,
  },
  celebrationSub: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  celebrationText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  shineBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.5)',
  },
  shineBadgeText: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  }
});

export default CelebrationOverlay;
