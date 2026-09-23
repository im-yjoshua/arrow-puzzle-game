import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';
import { useStore } from './store';

export const DIFFICULTIES = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
  { key: 'extraHard', label: 'Extra-Hard' },
];

export const DifficultySelector = ({ activeDifficulty = 'medium', onSelectDifficulty, style }) => {
  const { theme } = useTheme();
  const { settings } = useStore();
  const [containerWidth, setContainerWidth] = useState(0);

  const selectedIndex = useSharedValue(
    Math.max(0, DIFFICULTIES.findIndex(d => d.key === activeDifficulty))
  );

  const activeIndex = Math.max(0, DIFFICULTIES.findIndex(d => d.key === activeDifficulty));

  useEffect(() => {
    selectedIndex.value = withSpring(activeIndex, {
      damping: 18,
      stiffness: 170,
      mass: 0.8,
    });
  }, [activeIndex]);

  const padding = 4;
  const segmentWidth = containerWidth > 0 ? (containerWidth - padding * 2) / DIFFICULTIES.length : 0;

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: selectedIndex.value * segmentWidth }],
      width: segmentWidth,
    };
  });

  const handleSelect = (diffKey) => {
    if (diffKey === activeDifficulty) return;
    if (settings?.haptics) {
      Haptics.selectionAsync();
    }
    if (onSelectDifficulty) {
      onSelectDifficulty(diffKey);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.card || 'rgba(0,0,0,0.06)',
          borderColor: theme.border || 'rgba(0,0,0,0.1)',
        },
        style,
      ]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setContainerWidth(w);
      }}
    >
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: theme.accent || theme.arrow || '#8EAA78',
              top: padding,
              bottom: padding,
              left: padding,
            },
            animatedIndicatorStyle,
          ]}
        />
      )}

      {DIFFICULTIES.map((diff) => {
        const isSelected = diff.key === activeDifficulty;
        return (
          <Pressable
            key={diff.key}
            style={styles.segmentButton}
            onPress={() => handleSelect(diff.key)}
          >
            <Text
              style={[
                styles.segmentText,
                {
                  color: isSelected
                    ? (theme.buttonText || '#FFFFFF')
                    : (theme.textSecondary || '#7A6E65'),
                  fontWeight: isSelected ? '800' : '600',
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {diff.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 22,
    padding: 4,
    borderWidth: 1,
    position: 'relative',
    width: '100%',
    maxWidth: 340,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  indicator: {
    position: 'absolute',
    borderRadius: 18,
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  segmentButton: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    paddingHorizontal: 2,
  },
  segmentText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
