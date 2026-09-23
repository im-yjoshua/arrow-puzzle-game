import React from 'react';
import { Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useStore } from './store';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const JuicyButton = ({ style, onPress, children, ...props }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }]
    };
  });

  const handlePressIn = () => {
    if (props.disabled) return;
    if (useStore.getState().settings.haptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    scale.value = withTiming(0.92, { duration: 100 });
  };

  const handlePressOut = () => {
    if (props.disabled) return;
    scale.value = withSpring(1.0, { damping: 10, stiffness: 200 });
  };

  return (
    <AnimatedPressable
      style={[style, animatedStyle]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
};

export default JuicyButton;
