import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, LogBox, ScrollView, Modal, ActivityIndicator, Switch, Image, ImageBackground, Alert } from 'react-native';
import { SafeAreaView as SafeAreaViewContext, SafeAreaProvider } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSequence, 
  withTiming, 
  withRepeat,
  withSpring, 
  FadeIn,
  ZoomIn,
  interpolateColor, withDelay,
  Easing,
  useAnimatedProps,
  interpolate,
  Extrapolation,
  makeMutable
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateLevel, DIFFICULTY_CONFIGS } from './LevelGenerator';
import { DifficultySelector, DIFFICULTIES } from './DifficultySelector';
import { useStore } from './store';
import { AdService } from './AdService';
import AudioController from './AudioController';
import { CATALOG } from './Catalog';
import DailyRewardModal, { checkDailyRewardStatus } from './DailyRewardModal';
import NotificationManager from './NotificationManager';
import { ThemeProvider, useTheme } from './ThemeContext';
import { CurrencyProvider, useCurrency } from './CurrencyContext';
import CelebrationOverlay from './CelebrationOverlay';
import ShopModal from './ShopModal';
import PurchasesManager from './PurchasesManager';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedImage = Animated.createAnimatedComponent(Image);

LogBox.ignoreLogs(['[Reanimated] Initial values for animation are missing']);

const { width } = Dimensions.get('window');
const DEFAULT_COLS = 7;
const DEFAULT_ROWS = 10;
const CELL_SIZE = Math.floor((width - 24) / DEFAULT_COLS);
const ROWS = DEFAULT_ROWS;
const COLS = DEFAULT_COLS;
const BOARD_WIDTH = CELL_SIZE * COLS;
const BOARD_HEIGHT = CELL_SIZE * ROWS;

const RARE_DROPS = CATALOG.filter(item => item.rarity === 'epic' || item.rarity === 'mythic');

/**
 * Modern replacement for deprecated InteractionManager using requestIdleCallback / setTimeout fallback.
 */
const scheduleIdleTask = (callback, delay = 0) => {
  let isCancelled = false;
  let timerId = null;
  let idleHandle = null;

  const run = () => {
    if (isCancelled) return;
    if (typeof requestIdleCallback === 'function') {
      idleHandle = requestIdleCallback(() => {
        if (!isCancelled) callback();
      }, { timeout: 250 });
    } else {
      callback();
    }
  };

  if (delay > 0) {
    timerId = setTimeout(run, delay);
  } else {
    run();
  }

  return {
    cancel: () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      if (idleHandle && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle);
      }
    },
  };
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const JuicyButton = ({ style, onPress, children, ...props }) => {
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

export default function App() {
  useEffect(() => {
    try {
      // Initialize RevenueCat SDK inside main App root with platform placeholder keys
      PurchasesManager.initializePurchases().catch((err) => {
        console.warn('[RevenueCat] Purchases.configure caught error:', err);
      });
    } catch (e) {
      console.warn('[RevenueCat] Purchases.configure try/catch caught error:', e);
    }
  }, []);

  return (
    <CurrencyProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </CurrencyProvider>
  );
}

function MainApp() {
  const [currentScreen, setCurrentScreen] = useState('home'); 
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [dailyRewardVisible, setDailyRewardVisible] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  
  const { _hasHydrated, settings, equippedBackground } = useStore();
  const { theme } = useTheme();

  useEffect(() => {
    if (_hasHydrated) {
      AudioController.initBgm().then(() => {
        AudioController.updateBgmState(settings.bgm);
      });
      AudioController.preloadSfx();

      // On app launch, request notification permissions and schedule daily 24h retention reminder
      NotificationManager.initializeDailyRetentionNotificationsAsync().catch((err) => {
        console.warn('Failed to initialize daily retention notifications:', err);
      });

      // On app launch, initialize RevenueCat SDK for In-App Purchases
      PurchasesManager.initializePurchases().catch((err) => {
        console.warn('Failed to initialize PurchasesManager:', err);
      });

      // On app launch, check if a new calendar day has started
      checkDailyRewardStatus().then((status) => {
        if (status.canClaim) {
          setDailyRewardVisible(true);
        }
      });
    }
  }, [_hasHydrated]);

  useEffect(() => {
    if (_hasHydrated) {
      AudioController.updateBgmState(settings.bgm);
    }
  }, [settings.bgm, _hasHydrated]);

  if (!_hasHydrated || isAppLoading) {
    return (
      <SafeAreaProvider>
        <View style={[styles.launchScreenContainer, { backgroundColor: theme.background }]}>
          <DynamicAppIcon />
          <HomeLoadingBar onComplete={() => setIsAppLoading(false)} />
        </View>
      </SafeAreaProvider>
    );
  }

  const bgItem = CATALOG.find(i => i.id === equippedBackground);
  const BackgroundComponent = bgItem ? ImageBackground : View;
  const bgProps = bgItem ? { source: bgItem.image, style: styles.container, resizeMode: 'cover' } : { style: [styles.container, { backgroundColor: theme.background }] };

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <BackgroundComponent {...bgProps}>
        {currentScreen === 'home' ? (
          <HomeScreen 
            onPlay={() => setCurrentScreen('game')} 
            onOpenSettings={() => setSettingsVisible(true)} 
            onOpenDailyReward={() => setDailyRewardVisible(true)}
          />
        ) : (
          <GameScreen onBack={() => setCurrentScreen('home')} />
        )}
        
        <SettingsModal 
          visible={settingsVisible} 
          onClose={() => setSettingsVisible(false)} 
        />

        <DailyRewardModal 
          visible={dailyRewardVisible} 
          onClose={() => setDailyRewardVisible(false)} 
        />
      </BackgroundComponent>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const DynamicAppIcon = () => {
  const [iconSource, setIconSource] = useState(require('./assets/icon.png'));
  const iconScale = useSharedValue(0);

  useEffect(() => {
    // Read currently equipped App Icon from AsyncStorage
    AsyncStorage.getItem('equippedAppIcon').then((val) => {
      if (val) {
        if (val === 'foreground') setIconSource(require('./assets/android-icon-foreground.png'));
        else if (val === 'splash') setIconSource(require('./assets/splash-icon.png'));
        else if (val === 'icon-dark') setIconSource(require('./assets/icon-dark.png'));
        else if (val === 'icon-gold') setIconSource(require('./assets/icon-gold.png'));
        else if (val === 'default') setIconSource(require('./assets/icon.png'));
        else {
          try {
            const parsed = JSON.parse(val);
            if (parsed?.uri) setIconSource({ uri: parsed.uri });
          } catch (_) {}
        }
      }
    });

    // Scale icon from 0 to 1 with a slight bounce (damping: 10, stiffness: 100)
    iconScale.value = withSpring(1, { damping: 10, stiffness: 100 });
  }, []);

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }]
  }));

  return (
    <View style={styles.appIconWrapper}>
      <AnimatedImage
        source={iconSource}
        style={[styles.homeAppIcon, animatedIconStyle]}
        resizeMode="contain"
      />
    </View>
  );
};

const HomeLoadingBar = ({ onComplete }) => {
  const { theme } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(100, { duration: 1500, easing: Easing.inOut(Easing.ease) });
    const timer = setTimeout(() => {
      if (typeof onComplete === 'function') {
        try {
          onComplete();
        } catch (_) {}
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const animatedBarStyle = useAnimatedStyle(() => {
    return {
      width: `${progress.value}%`,
    };
  });

  return (
    <View style={{ width: 220, alignItems: 'center', marginTop: 32 }}>
      <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 12, fontWeight: 'bold' }}>
        Loading 10,000+ levels...
      </Text>
      <View style={{ width: '100%', height: 10, backgroundColor: 'rgba(128, 128, 128, 0.2)', borderRadius: 5, overflow: 'hidden' }}>
        <Animated.View style={[{ height: '100%', backgroundColor: theme.arrow, borderRadius: 5 }, animatedBarStyle]} />
      </View>
    </View>
  );
};

const HomeScreen = ({ onPlay, onOpenSettings, onOpenDailyReward }) => {
  const { theme } = useTheme();
  const currency = useCurrency();
  const { currentLevel, activeDifficulty, setActiveDifficulty } = useStore();

  const activeLevel = typeof currentLevel === 'object' && currentLevel !== null
    ? (currentLevel[activeDifficulty] || 1)
    : (typeof currentLevel === 'number' ? currentLevel : 1);

  const diffLabel = DIFFICULTIES.find(d => d.key === activeDifficulty)?.label || 'Medium';

  return (
    <SafeAreaViewContext style={[styles.homeContainer, { backgroundColor: theme.background }]}>
      <View style={styles.homeTopBar}>
        <JuicyButton style={[styles.homeDailyButton, { backgroundColor: theme.card }]} onPress={onOpenDailyReward}>
          <Text style={[styles.homeDailyText, { color: theme.text }]}>🎁 Rewards</Text>
        </JuicyButton>

        <View style={styles.navStats}>
          <View style={[styles.navPill, { backgroundColor: theme.pillBg }]}>
            <Text style={styles.navEmoji}>🪙</Text>
            <Text style={[styles.navStatText, { color: theme.text }]}>{currency.coins}</Text>
          </View>
          <View style={[styles.navPill, { backgroundColor: theme.pillBg }]}>
            <Text style={styles.navEmoji}>💎</Text>
            <Text style={[styles.navStatText, { color: theme.text }]}>{currency.diamonds || 0}</Text>
          </View>
          <View style={[styles.navPill, { backgroundColor: theme.pillBg }]}>
            <Text style={styles.navEmoji}>❤️</Text>
            <Text style={[styles.navStatText, { color: theme.text }]}>
              {currency.hasUnlimitedHearts || currency.unlimitedHearts ? '∞' : currency.hearts}
            </Text>
          </View>
        </View>

        <JuicyButton style={[styles.homeSettingsButton, { backgroundColor: theme.card }]} onPress={onOpenSettings}>
          <Text style={styles.homeSettingsText}>⚙️</Text>
        </JuicyButton>
      </View>
      
      <View style={styles.homeContent}>
        <DynamicAppIcon />
        <Text style={[styles.homeTitle, { color: theme.text }]}>Tangle Maze</Text>
        <Text style={[styles.homeSubtitle, { color: theme.textSecondary }]}>Seamless Labyrinth Puzzle</Text>
        
        {/* 4-Tier Difficulty Selector Segmented Slider */}
        <DifficultySelector
          activeDifficulty={activeDifficulty}
          onSelectDifficulty={setActiveDifficulty}
        />

        {/* Dynamic Multi-Track Level Badge */}
        <View style={styles.homeLevelBadge}>
          <Text style={[styles.homeLevelLabel, { color: theme.textSecondary }]}>
            {diffLabel.toUpperCase()} MODE
          </Text>
          <Text style={[styles.homeLevelNumber, { color: theme.text }]}>
            Level {activeLevel}
          </Text>
        </View>

        {/* Play Button */}
        <JuicyButton style={[styles.playButton, { backgroundColor: theme.text }]} onPress={onPlay}>
          <Text style={[styles.playButtonText, { color: theme.card || '#F3EBE1' }]}>
            PLAY LEVEL {activeLevel} ▶
          </Text>
        </JuicyButton>
      </View>
    </SafeAreaViewContext>
  );
};

const SettingsModal = ({ visible, onClose }) => {
  const { settings, toggleSetting, activeDifficulty, setActiveDifficulty } = useStore();
  const { theme, isDark, toggleTheme } = useTheme();
  const currency = useCurrency();
  const [isRestoring, setIsRestoring] = useState(false);

  const handleAuth = (provider) => {
    console.log(`Auth triggered for: ${provider}`);
  };

  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    try {
      const result = await PurchasesManager.restorePurchases();
      if (result.success) {
        const hasUnlimited = PurchasesManager.hasUnlimitedHeartsEntitlement(result.customerInfo);
        if (hasUnlimited) {
          currency.setUnlimitedHearts(true);
          AudioController.playLevelComplete();
          Alert.alert(
            'Purchases Restored! ❤️ ∞',
            'Your Unlimited Hearts purchase was successfully restored. Enjoy playing stress-free!',
            [{ text: 'Great!' }]
          );
        } else {
          Alert.alert(
            'Restore Completed',
            'Previous purchases were restored. No active Unlimited Hearts package was found for this account.',
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert('Restore Failed', 'Unable to reach the store. Please check your internet connection.');
      }
    } catch (err) {
      console.warn('[SettingsModal] Restore purchases error:', err);
      Alert.alert('Restore Error', 'An error occurred while restoring purchases.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
        <View style={[styles.settingsContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Settings</Text>
            <JuicyButton style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Done</Text>
            </JuicyButton>
          </View>

          <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: 6 }]}>
            <Text style={[styles.settingLabel, { color: theme.text, marginBottom: 6 }]}>Difficulty</Text>
            <DifficultySelector
              activeDifficulty={activeDifficulty}
              onSelectDifficulty={setActiveDifficulty}
              style={{ maxWidth: '100%', marginVertical: 2 }}
            />
          </View>
          
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
            <Switch 
              value={isDark} 
              onValueChange={toggleTheme} 
              trackColor={{ false: '#d3d3d3', true: '#8EAA78' }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Background Music</Text>
            <Switch 
              value={settings.bgm} 
              onValueChange={() => toggleSetting('bgm')} 
              trackColor={{ false: '#d3d3d3', true: '#8EAA78' }}
            />
          </View>
          
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Sound Effects</Text>
            <Switch 
              value={settings.sfx} 
              onValueChange={() => toggleSetting('sfx')} 
              trackColor={{ false: '#d3d3d3', true: '#8EAA78' }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.text }]}>Haptics</Text>
            <Switch 
              value={settings.haptics} 
              onValueChange={() => toggleSetting('haptics')} 
              trackColor={{ false: '#d3d3d3', true: '#8EAA78' }}
            />
          </View>

          <View style={styles.authSection}>
            <Text style={[styles.authTitle, { color: theme.textSecondary }]}>Purchases & Account</Text>
            <JuicyButton
              style={[styles.restoreButton, { backgroundColor: theme.pillBg, borderColor: theme.border }]}
              onPress={handleRestorePurchases}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={theme.text} />
              ) : (
                <Text style={[styles.restoreButtonText, { color: theme.text }]}>🔄 Restore Purchases</Text>
              )}
            </JuicyButton>

            <JuicyButton style={[styles.authButton, styles.appleAuth]} onPress={() => handleAuth('Apple')}>
              <Text style={styles.appleAuthText}> Sign in with Apple</Text>
            </JuicyButton>
            <JuicyButton style={[styles.authButton, styles.googleAuth]} onPress={() => handleAuth('Google')}>
              <Text style={styles.googleAuthText}>G Sign in with Google</Text>
            </JuicyButton>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Individual dot with Reanimated color interpolation for diagonal celebration wave
// and synchronized reveal bound to the strokeDashoffset of the slithering arrow above it
const CanvasDot = React.memo(({ r, c, offset, dotSize, cellSize = CELL_SIZE, isComplete, arrowInfo }) => {
  const colorProgress = useSharedValue(0);
  const { theme } = useTheme();

  useEffect(() => {
    if (isComplete) {
      // Stagger color wave diagonally from top-left (r+c=0) to bottom-right
      const delay = (r + c) * 18;
      colorProgress.value = withDelay(
        delay,
        withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) })
      );
    } else {
      // Revert smoothly back to default
      colorProgress.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
    }
  }, [isComplete]);

  const animatedStyle = useAnimatedStyle(() => {
    // 1. Reveal opacity: if an arrow is above this dot, reveal opacity increases as the arrow's tail slithers over it
    let baseOpacity = 0.35;
    if (arrowInfo && arrowInfo.progress) {
      const dist = arrowInfo.index * cellSize;
      baseOpacity = interpolate(
        arrowInfo.progress.value,
        [dist, dist + cellSize * 0.6],
        [0, 0.35],
        Extrapolation.CLAMP
      );
    }

    // 2. Color wave during celebration
    const bgColor = interpolateColor(
      colorProgress.value,
      [0, 1],
      [theme.dotColor || theme.dot, theme.arrowSuccessColor || '#5CB85C']
    );

    const opacity = baseOpacity + colorProgress.value * (0.9 - baseOpacity);
    const scale = 1 + colorProgress.value * 0.5; // celebratory pop
    return {
      backgroundColor: bgColor,
      opacity,
      transform: [{ scale }]
    };
  }, [theme.dotColor, theme.dot, theme.arrowSuccessColor, arrowInfo, cellSize]);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: r * cellSize + offset,
          left: c * cellSize + offset,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
        },
        animatedStyle,
      ]}
    />
  );
});

// Underlying dotted canvas grid.
// Sits strictly beneath the active arrows (zIndex: 0) and celebrates with a sweeping green wave upon level completion.
const DottedGridCanvas = React.memo(({ isComplete = false, onWaveComplete, cellArrowMap = {}, rows = ROWS, cols = COLS, cellSize = CELL_SIZE }) => {
  const dotSize = Math.max(3, Math.round(cellSize * 0.1));
  const offset = Math.floor((cellSize - dotSize) / 2);
  const waveDriver = useSharedValue(0);

  useEffect(() => {
    if (isComplete) {
      waveDriver.value = 0;
      const totalWaveDuration = (rows - 1 + cols - 1) * 18 + 350 + 100;
      waveDriver.value = withTiming(1, { duration: totalWaveDuration });
      const timer = setTimeout(() => {
        if (typeof onWaveComplete === 'function') {
          try {
            onWaveComplete();
          } catch (_) {}
        }
      }, totalWaveDuration);
      return () => clearTimeout(timer);
    } else {
      waveDriver.value = 0;
    }
  }, [isComplete, rows, cols, onWaveComplete]);

  // The dot grid only depends on board geometry + arrow coverage: memoize the
  // element array so parent re-renders don't rebuild ~100+ elements.
  const dots = React.useMemo(() => (
    Array.from({ length: rows }).map((_, r) =>
      Array.from({ length: cols }).map((_, c) => (
        <CanvasDot
          key={`dot-${r}-${c}`}
          r={r}
          c={c}
          offset={offset}
          dotSize={dotSize}
          cellSize={cellSize}
          isComplete={isComplete}
          arrowInfo={cellArrowMap[r * cols + c]}
        />
      ))
    )
  ), [rows, cols, offset, dotSize, cellSize, isComplete, cellArrowMap]);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]} pointerEvents="none">
      {dots}
    </View>
  );
});
// NOTE: React.memo's second argument must be a compare function, not a deps
// array (the old `[isComplete, rows, cols, onWaveComplete]` array was invalid
// API usage). Default shallow comparison is exactly right here: every prop is
// a primitive except cellArrowMap, which is memoized in the parent and only
// changes identity when the arrows or columns change.

const HYPE_WORDS = ["Great!", "Amazing!", "Fabulous!", "Perfect!"];

// Star rating for a completed level: 3 for a flawless run, 2 for a couple of
// slips, 1 for finishing at all.
function calcStars(mistakes, hintsUsed) {
  if (mistakes <= 0 && hintsUsed <= 0) return 3;
  if (mistakes <= 2 && hintsUsed <= 1) return 2;
  return 1;
}

// Reusable floating hype text popup with Reanimated physics
const FloatingText = React.memo(({ id, text, x, y, rotation, onComplete }) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    translateY.value = withTiming(-30, { duration: 800, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(0, { duration: 800, easing: Easing.in(Easing.quad) });
    const timer = setTimeout(() => {
      if (typeof onComplete === 'function') {
        try {
          onComplete(id);
        } catch (_) {}
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [id, onComplete]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [
        { translateY: translateY.value },
        { rotate: `${rotation}deg` }
      ]
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingTextContainer,
        {
          left: x - 60,
          top: y - 16,
        },
        animatedStyle,
      ]}
    >
      <Text style={styles.floatingText}>{text}</Text>
    </Animated.View>
  );
});

// Resolve an arrow's facing direction.
// The generator stores each arrow's guaranteed-clear escape direction at build time
// (levels are solvable by construction), so the stored direction is authoritative.
// Body geometry is only a fallback for arrow objects built without one.
export const getArrowOrthogonalDirection = (arrow) => {
  if (arrow && arrow.direction) {
    return arrow.direction;
  }
  if (!arrow || !arrow.cells || arrow.cells.length < 2) {
    return 'right';
  }
  const cells = arrow.cells;
  const N = cells.length;
  const head = cells[N - 1];
  const prev = cells[N - 2];

  const dr = head.r - prev.r;
  const dc = head.c - prev.c;

  if (dc > 0) return 'right'; // 0 degrees (East)
  if (dr > 0) return 'down';  // 90 degrees (South)
  if (dc < 0) return 'left';  // 180 degrees (West)
  if (dr < 0) return 'up';    // 270 degrees (North)

  return arrow.direction || 'right';
};

// Head-Clearance Collision Detection:
// Checks strictly the single grid coordinate directly in front of the arrow's head.
// Completely ignores adjacent tiles touching the arrow's tail or body.
export const canMove = (arrow, boardGrid) => {
  if (!arrow || !arrow.cells || arrow.cells.length === 0 || !boardGrid) return false;
  const head = arrow.cells[arrow.cells.length - 1];
  if (!head) return false;
  let targetR = head.r;
  let targetC = head.c;

  const dir = getArrowOrthogonalDirection(arrow);

  // Dynamically read head's facing direction (check X+1, X-1, Y+1, or Y-1)
  if (dir === 'up') targetR -= 1;
  else if (dir === 'down') targetR += 1;
  else if (dir === 'left') targetC -= 1;
  else if (dir === 'right') targetC += 1;

  const gRows = boardGrid.length;
  const gCols = boardGrid[0]?.length || 0;

  // Off the board (out of bounds) -> unblocked
  if (targetR < 0 || targetR >= gRows || targetC < 0 || targetC >= gCols) {
    return true;
  }

  // On the board -> unblocked only if that single target cell is completely empty (null).
  // The ?. guards against ragged/malformed rows; unknown cells count as blocked.
  return boardGrid[targetR]?.[targetC] === null;
};

const GameScreen = ({ onBack }) => {
  const [grid, setGrid] = useState(null);
  const [isWon, setIsWon] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);
  const [isGameOver, setIsGameOver] = useState(false);
  // Hearts (strikes) live in CurrencyContext — the header and the in-game
  // hearts row both read currency.hearts as the single source of truth.
  const [blocksLeft, setBlocksLeft] = useState(0);
  const [activeArrowsState, setActiveArrowsState] = useState([]);
  const [isLevelComplete, setIsLevelComplete] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState([]);
  const [shopVisible, setShopVisible] = useState(false);
  const [isAdLoading, setIsAdLoading] = useState(false);
  const [nextLevelMatrix, setNextLevelMatrix] = useState(null);
  const nextLevelMatrixRef = React.useRef(null);
  const activeSlitheringCountRef = React.useRef(0);
  // Mirrors the ids of arrows still on the board so completion side effects
  // can run outside of setState updaters (updaters must stay pure). Also makes
  // completion idempotent: a duplicate or stale slither callback for the same
  // arrow is ignored instead of double-firing the celebration or driving the
  // counter negative.
  const liveArrowIdsRef = React.useRef(new Set());
  const isBufferingRef = React.useRef(false);
  // Per-level performance stats for the star rating. Reset on every board load.
  const mistakesRef = React.useRef(0);
  const hintsUsedRef = React.useRef(0);
  const [earnedStars, setEarnedStars] = useState(0);

  const { theme } = useTheme();
  const arrowProgressRef = React.useRef({});

  // Tutorial tooltip state & persistence
  const [hasSeenTutorial, setHasSeenTutorial] = useState(true);
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const tutorialRef = React.useRef(null);
  // Bumped to replay the tutorial on demand (fresh overlay state each run).
  const [tutorialRunId, setTutorialRunId] = useState(0);

  // Final tutorial dismissal: hide + remember that the player has seen it.
  const handleTutorialDone = React.useCallback(() => {
    setIsTutorialActive(false);
    AsyncStorage.setItem('hasSeenTutorial', 'true').catch(() => {});
    setHasSeenTutorial(true);
  }, []);

  // Persistent "How to Play" entry: replay the tutorial on the current board.
  const replayTutorial = React.useCallback(() => {
    setTutorialRunId((id) => id + 1);
    setIsTutorialActive(true);
  }, []);

  // Ensure each arrow has a shared value for slither progress & dot reveal synchronization
  for (const arrow of activeArrowsState) {
    if (!arrowProgressRef.current[arrow.id]) {
      arrowProgressRef.current[arrow.id] = makeMutable(0);
    }
  }

  const floatingIdRef = React.useRef(0);
  const lastTapTimeRef = React.useRef(0);
  const comboCountRef = React.useRef(0);
  // Visible combo meter (combo ≥ 2). Synced with comboCountRef wherever it changes.
  const [combo, setCombo] = useState(0);

  const handleFloatingComplete = React.useCallback((id) => {
    setFloatingTexts(prev => prev.filter(item => item.id !== id));
  }, []);

  const { currentLevel, activeDifficulty, levelUp, settings } = useStore();
  const currency = useCurrency();
  
  const activeLevel = typeof currentLevel === 'object' && currentLevel !== null
    ? (currentLevel[activeDifficulty] || 1)
    : (typeof currentLevel === 'number' ? currentLevel : 1);

  // Check hasSeenTutorial flag from AsyncStorage on mount / level change.
  // The tutorial auto-shows on the first level the player ever opens, on any
  // difficulty (the default is medium, so gating on easy would skip most
  // new players entirely).
  useEffect(() => {
    AsyncStorage.getItem('hasSeenTutorial').then((val) => {
      const seen = val === 'true';
      setHasSeenTutorial(seen);
      if (!seen && activeLevel === 1) {
        setIsTutorialActive(true);
      } else {
        setIsTutorialActive(false);
      }
    }).catch(() => {
      setHasSeenTutorial(true);
      setIsTutorialActive(false);
    });
  }, [activeLevel, activeDifficulty]);

  const currentDiffConfig = DIFFICULTY_CONFIGS[activeDifficulty] || DIFFICULTY_CONFIGS.medium;
  const currentGridRows = grid ? grid.length : currentDiffConfig.rows;
  const currentGridCols = grid && grid[0] ? grid[0].length : currentDiffConfig.cols;
  const boardPadding = 24;
  const availableWidth = width - boardPadding;
  const dynamicCellSize = Math.floor(availableWidth / currentGridCols);
  const currentBoardWidth = dynamicCellSize * currentGridCols;
  const currentBoardHeight = dynamicCellSize * currentGridRows;

  // Maps board cells to the arrow covering them, keyed by integer r * cols + c
  // (avoids per-dot template-string allocation on every lookup). Only cells
  // under an arrow get an entry; everything else looks up as undefined.
  const cellArrowMap = React.useMemo(() => {
    const map = {};
    for (const arrow of activeArrowsState) {
      const p = arrowProgressRef.current[arrow.id];
      if (arrow.cells && p) {
        arrow.cells.forEach((cell, idx) => {
          map[cell.r * currentGridCols + cell.c] = { progress: p, index: idx };
        });
      }
    }
    return map;
  }, [activeArrowsState, currentGridCols]);

  const isAutoAdvancingRef = React.useRef(false);
  const boardFadeOpacity = useSharedValue(1);

  const arrowLayerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: boardFadeOpacity.value,
  }));

  const buildLevelMatrix = React.useCallback((levelNum, diff = activeDifficulty) => {
    const level = generateLevel(diff, levelNum);
    const gridToUse = level.grid;

    const uniqueArrows = new Map();
    const gRows = gridToUse.length;
    const gCols = gridToUse[0]?.length || 0;
    for (let r = 0; r < gRows; r++) {
      for (let c = 0; c < gCols; c++) {
        const cell = gridToUse[r][c];
        if (cell && cell.type === 'arrow' && !uniqueArrows.has(cell.id)) {
          uniqueArrows.set(cell.id, cell);
        }
      }
    }
    const arrowsArray = Array.from(uniqueArrows.values());

    // Levels are solvable by construction (see LevelGenerator) — no re-validation needed.
    return {
      grid: gridToUse,
      arrows: arrowsArray,
      levelNumber: levelNum,
      difficulty: diff,
      rows: gRows,
      cols: gCols,
    };
  }, [activeDifficulty]);

  // Celebration finished -> show the win chest (RewardModal). The actual advance to
  // the next level happens after the chest, via handleNextLevel.
  const handleCelebrationDone = React.useCallback(() => {
    setIsLevelComplete(false);
    setIsWon(true);
  }, []);

  const handleWaveComplete = React.useCallback(() => {
    try {
      // 1. Award coins silently in-memory (stripping any broken AsyncStorage writes)
      if (typeof currency.addCoins === 'function') {
        currency.addCoins(25);
      }
      if (settings?.haptics) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_) {}
      }

      // 2. Hide current empty arrows by setting fade opacity to 0
      boardFadeOpacity.value = 0;

      // 3. Mark auto-advancing so useEffect([activeLevel, activeDifficulty]) doesn't unmount or flash loading
      isAutoAdvancingRef.current = true;

      // 4. Reset the celebration state
      setIsLevelComplete(false);

      // 5. Safely increment the level state
      try {
        if (typeof levelUp === 'function') {
          levelUp();
        }
      } catch (lvlErr) {
        console.warn('[LevelComplete] levelUp error:', lvlErr);
      }

      const nextLevelNum = (typeof activeLevel === 'number' ? activeLevel : 1) + 1;

      // 6. Check if nextLevelMatrix exists in buffer
      let nextMatrix = null;
      const buffered = nextLevelMatrixRef.current || nextLevelMatrix;

      if (
        buffered &&
        buffered.grid &&
        Array.isArray(buffered.grid) &&
        Array.isArray(buffered.arrows) &&
        buffered.difficulty === activeDifficulty
      ) {
        // 0ms INSTANT SWAP: Use pre-buffered matrix
        nextMatrix = buffered;
        console.log(`[LevelComplete] Using pre-buffered matrix for ${activeDifficulty} Level ${nextLevelNum}`);
      } else {
        // Fallback: If buffer is null or failed, manually call LevelGenerator synchronously
        console.log(`[LevelComplete] Buffer missing or null, synchronously generating ${activeDifficulty} Level ${nextLevelNum}`);
        nextMatrix = buildLevelMatrix(nextLevelNum, activeDifficulty);
      }

      // Clear the buffer state and ref
      nextLevelMatrixRef.current = null;
      setNextLevelMatrix(null);

      if (nextMatrix && nextMatrix.grid && Array.isArray(nextMatrix.arrows)) {
        // Reset arrow tracking and initialize shared values for all arrows
        arrowProgressRef.current = {};
        arrowRefs.current = {};
        for (const a of nextMatrix.arrows) {
          arrowProgressRef.current[a.id] = makeMutable(0);
        }

        // Safely swap into the active board state
        setGrid(nextMatrix.grid);
        setActiveArrowsState(nextMatrix.arrows);
        liveArrowIdsRef.current = new Set(nextMatrix.arrows.map(a => a.id));
        mistakesRef.current = 0;
        hintsUsedRef.current = 0;
        setEarnedStars(0);
        arrowRefCallbacksRef.current = {};
        setBlocksLeft(nextMatrix.arrows.length);
        currency.refillHearts(3);
        setIsGameOver(false);
        setIsWon(false);
        setIsGenerating(false);
        setFloatingTexts([]);
        comboCountRef.current = 0;
        setCombo(0);
        activeSlitheringCountRef.current = 0;

        // Instantly fade in the new board smoothly
        boardFadeOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
      } else {
        console.error('[LevelComplete] Generated matrix invalid, falling back to initLevel');
        initLevel();
      }
    } catch (error) {
      console.error('[LevelComplete] Error during level complete celebration callback:', error);
      // Fallback recovery to avoid breaking React tree
      try {
        setIsLevelComplete(false);
        initLevel();
      } catch (_) {}
    }
  }, [currency.addCoins, levelUp, settings?.haptics, activeLevel, activeDifficulty, buildLevelMatrix, nextLevelMatrix]);

  const initLevel = () => {
    setIsWon(false);
    setIsGameOver(false);
    setIsLevelComplete(false);
    setIsAdLoading(false);
    currency.refillHearts(3);
    setFloatingTexts([]);
    comboCountRef.current = 0;
    setCombo(0);
    boardFadeOpacity.value = 1;
    activeSlitheringCountRef.current = 0;

    // Check if nextLevelMatrix is already pre-buffered for this level and difficulty
    const buffered = nextLevelMatrixRef.current || nextLevelMatrix;
    if (buffered && buffered.levelNumber === activeLevel && buffered.difficulty === activeDifficulty) {
      nextLevelMatrixRef.current = null;
      setNextLevelMatrix(null);
      arrowProgressRef.current = {};
      arrowRefs.current = {};
      for (const a of buffered.arrows) {
        arrowProgressRef.current[a.id] = makeMutable(0);
      }
      setGrid(buffered.grid);
      setActiveArrowsState(buffered.arrows);
      liveArrowIdsRef.current = new Set(buffered.arrows.map(a => a.id));
      mistakesRef.current = 0;
      hintsUsedRef.current = 0;
      setEarnedStars(0);
      arrowRefCallbacksRef.current = {};
      setBlocksLeft(buffered.arrows.length);
      setIsGenerating(false);
      return;
    }

    // Otherwise standard generate
    setIsGenerating(true);
    setGrid(null);
    setActiveArrowsState([]);
    liveArrowIdsRef.current = new Set();
    mistakesRef.current = 0;
    hintsUsedRef.current = 0;
    setEarnedStars(0);
    arrowRefCallbacksRef.current = {};
    arrowProgressRef.current = {};

    scheduleIdleTask(() => {
      const matrix = buildLevelMatrix(activeLevel, activeDifficulty);
      setGrid(matrix.grid);
      setActiveArrowsState(matrix.arrows);
      liveArrowIdsRef.current = new Set(matrix.arrows.map(a => a.id));
      mistakesRef.current = 0;
      hintsUsedRef.current = 0;
      setEarnedStars(0);
      arrowRefCallbacksRef.current = {};
      setBlocksLeft(matrix.arrows.length);
      setIsGenerating(false);
    }, 60);
  };

  useEffect(() => {
    if (isAutoAdvancingRef.current) {
      isAutoAdvancingRef.current = false;
      return;
    }
    initLevel();
  }, [activeLevel, activeDifficulty]);

  // Background buffer: silently pre-generate Level N+1 in background with matching activeDifficulty
  useEffect(() => {
    // Only buffer once the current level has finished rendering
    if (isGenerating || !grid) return;

    // If nextLevelMatrix is already pre-generated for activeLevel + 1 with activeDifficulty, do nothing
    if (
      nextLevelMatrixRef.current && 
      nextLevelMatrixRef.current.levelNumber === activeLevel + 1 &&
      nextLevelMatrixRef.current.difficulty === activeDifficulty
    ) {
      return;
    }

    let isCancelled = false;

    // Yield to user taps and animations via requestIdleCallback
    const task = scheduleIdleTask(() => {
      const checkAndGenerate = () => {
        if (isCancelled || isBufferingRef.current) return;

        // Do not trigger background generation while Reanimated slithering animations are actively running
        if (activeSlitheringCountRef.current > 0) {
          setTimeout(checkAndGenerate, 150);
          return;
        }

        isBufferingRef.current = true;
        try {
          const nextMatrix = buildLevelMatrix(activeLevel + 1, activeDifficulty);
          if (!isCancelled) {
            nextLevelMatrixRef.current = nextMatrix;
            setNextLevelMatrix(nextMatrix);
            console.log(`[LevelBuffer] Silently pre-generated ${activeDifficulty.toUpperCase()} Level ${activeLevel + 1} in background!`);
          }
        } catch (err) {
          console.warn('[LevelBuffer] Failed to pre-generate next level:', err);
        } finally {
          isBufferingRef.current = false;
        }
      };

      checkAndGenerate();
    }, 80);

    return () => {
      isCancelled = true;
      if (task && typeof task.cancel === 'function') {
        task.cancel();
      }
    };
  }, [activeLevel, activeDifficulty, isGenerating, grid, buildLevelMatrix]);


  const arrowRefs = React.useRef({});

  // Stable per-arrow ref callbacks. React 19 passes `ref` as a regular prop,
  // so React.memo shallow-compares it — an inline callback ref would create a
  // new function every render and defeat ArrowBlock memoization. Ids repeat
  // across levels (`block_0`, …), so the cache is cleared on every board load
  // next to the arrowRefs reset.
  const arrowRefCallbacksRef = React.useRef({});
  const getArrowRefCallback = React.useCallback((id) => {
    const cache = arrowRefCallbacksRef.current;
    if (!cache[id]) {
      cache[id] = (el) => {
        arrowRefs.current[id] = el;
      };
    }
    return cache[id];
  }, []);

  const targetTutorialArrow = React.useMemo(() => {
    if (!grid || activeArrowsState.length === 0) return null;
    return activeArrowsState.find(arrow => canMove(arrow, grid)) || activeArrowsState[0] || null;
  }, [grid, activeArrowsState]);

  const handleCellPress = (r, c) => {
    if (isWon || isGameOver || !grid) return;
    const clickedArrow = activeArrowsState.find(arrow => 
      arrow.cells.some(cell => cell.r === r && cell.c === c)
    );
    
    if (clickedArrow) {
      const h = clickedArrow.cells[clickedArrow.cells.length - 1];
      if (!grid[h.r] || grid[h.r]?.[h.c]?.id !== clickedArrow.id) return;

      // Color transition strictly locked inside this if/else block:
      // IF 'canMove' is true: Immediately trigger withTiming to Green & slither
      // IF 'canMove' is false: Immediately trigger withTiming to Red and execute the wiggle
      if (canMove(clickedArrow, grid)) {
        if (settings.haptics) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        // On the very first successful arrow tap, advance the tutorial to step 2
        // (combo/hearts/hints). The overlay's "Got it!" finishes the tutorial.
        if (isTutorialActive) {
          tutorialRef.current?.nextStep();
        }
        // Instantly clear footprints so arrows behind can slither simultaneously
        setGrid(prevGrid => {
          const ng = prevGrid.map(row => [...row]);
          for (const cell of clickedArrow.cells) ng[cell.r][cell.c] = null;
          return ng;
        });

        AudioController.playValidArrow();
        activeSlitheringCountRef.current += 1;
        arrowRefs.current[clickedArrow.id]?.slither();

        // Rapid taps chain a combo: every combo tap (x2 and up) pays +1 coin and
        // lights the combo meter. A slow tap restarts the chain at x1.
        const now = Date.now();
        const isRapid = now - lastTapTimeRef.current < 600;
        lastTapTimeRef.current = now;
        const newCombo = isRapid ? comboCountRef.current + 1 : 1;
        comboCountRef.current = newCombo;
        setCombo(newCombo);

        if (newCombo >= 2) {
          currency.addCoins(1);
          const word = `🔥 x${newCombo}  +1 🪙`;
          const rotation = Math.floor(Math.random() * 11) - 5; // -5deg to 5deg
          const x = c * dynamicCellSize + dynamicCellSize / 2;
          const y = r * dynamicCellSize + dynamicCellSize / 2;
          const newId = ++floatingIdRef.current;

          setFloatingTexts(prev => [
            ...prev,
            { id: newId, text: word, x, y, rotation }
          ]);
        } else if (Math.random() < 0.3) {
          const word = HYPE_WORDS[Math.floor(Math.random() * HYPE_WORDS.length)];
          const rotation = Math.floor(Math.random() * 11) - 5; // -5deg to 5deg
          const x = c * dynamicCellSize + dynamicCellSize / 2;
          const y = r * dynamicCellSize + dynamicCellSize / 2;
          const newId = ++floatingIdRef.current;

          setFloatingTexts(prev => [
            ...prev,
            { id: newId, text: word, x, y, rotation }
          ]);
        }
      } else {
        // A wrong tap counts against the star rating, even with unlimited hearts.
        mistakesRef.current += 1;
        // If player has Unlimited Hearts, bypass heart deduction and do not trigger Game Over!
        if (!currency.hasUnlimitedHearts && !currency.unlimitedHearts) {
          const remaining = currency.useHeart();
          if (remaining <= 0) {
            setIsGameOver(true);
          }
        }

        AudioController.playInvalidArrow();
        comboCountRef.current = 0;
        setCombo(0);
        arrowRefs.current[clickedArrow.id]?.wiggle();
      }
    }
  };

  // Stable identity so memoized ArrowBlocks don't re-render when the parent does.
  // Completion side effects run outside the setState updater (updaters stay pure).
  // Idempotent: a duplicate/stale callback for an already-completed arrow is
  // ignored, so the celebration can only fire once per board.
  const handleSlitherComplete = React.useCallback((arrowId) => {
    if (!liveArrowIdsRef.current.has(arrowId)) {
      return;
    }
    liveArrowIdsRef.current.delete(arrowId);
    activeSlitheringCountRef.current = Math.max(0, activeSlitheringCountRef.current - 1);
    setActiveArrowsState(prev => prev.filter(a => a.id !== arrowId));
    setBlocksLeft(prev => Math.max(0, prev - 1));
    if (liveArrowIdsRef.current.size === 0) {
      // Award + persist the star rating for this level (best score is kept).
      const stars = calcStars(mistakesRef.current, hintsUsedRef.current);
      const st = useStore.getState();
      const diff = st.activeDifficulty || 'medium';
      const lvl = typeof st.currentLevel === 'object' && st.currentLevel !== null
        ? st.currentLevel[diff] : 1;
      st.setStarRating(diff, lvl, stars);
      setEarnedStars(stars);
      setIsLevelComplete(true);
      AudioController.playLevelComplete();
      if (useStore.getState().settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  }, []);

  // Win chest "Next Level" -> interstitial every 3rd level, then advance.
  // Ad failures can't soft-lock: AdService guarantees onClose fires (error/timeout).
  const handleNextLevel = () => {
    if (activeLevel % 3 === 0) {
      AdService.showInterstitial(() => {
        handleWaveComplete();
      });
    } else {
      handleWaveComplete();
    }
  };

  const handleWatchAdRevive = () => {
    AdService.showRewarded(
      () => {
        currency.refillHearts(3);
        setIsGameOver(false);
        if (settings.haptics) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
      null,
      () => {
        Alert.alert('Ad unavailable', 'The ad could not be loaded. Check your connection and try again.');
      }
    );
  };

  const triggerHintHighlight = () => {
    const validArrows = activeArrowsState.filter(arrow => canMove(arrow, grid));
    if (validArrows.length > 0) {
      const chosenArrow = validArrows[Math.floor(Math.random() * validArrows.length)];
      arrowRefs.current[chosenArrow.id]?.highlight();
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }
  };

  const handleHintPress = () => {
    if (isAdLoading || isGameOver || isWon || isGenerating || !grid || activeArrowsState.length === 0) {
      return;
    }

    // If player has inventory hints, consume 1 immediately without showing an ad!
    if (currency.hints > 0) {
      if (currency.useHint()) {
        hintsUsedRef.current += 1;
        triggerHintHighlight();
        return;
      }
    }

    // Otherwise, load and display Rewarded Ad
    setIsAdLoading(true);

    AdService.showRewarded(
      () => {
        hintsUsedRef.current += 1;
        triggerHintHighlight();
      },
      () => {
        setIsAdLoading(false);
      },
      () => {
        setIsAdLoading(false);
        Alert.alert('Ad unavailable', 'The ad could not be loaded. Check your connection and try again.');
      }
    );
  };

  const handleSpendDiamondsRevive = () => {
    // Single debit: CurrencyContext is the only diamonds ledger.
    if (currency.spendDiamonds(50)) {
      currency.refillHearts(3);
      setIsGameOver(false);
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(
        'Not Enough Diamonds',
        `You have ${currency.diamonds || 0} diamonds. You need 50 diamonds to revive. Watch an ad instead!`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Watch Ad', onPress: handleWatchAdRevive },
        ]
      );
    }
  };

  const handleDeclineRevive = () => {
    setIsGameOver(false);
    initLevel();
  };

  return (
    <SafeAreaViewContext style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={styles.navBar}>
        <JuicyButton style={[styles.backButton, { backgroundColor: theme.card }]} onPress={onBack}>
          <Text style={[styles.backButtonText, { color: theme.text }]}>←</Text>
        </JuicyButton>
        <View style={styles.navStats}>
          <View style={[styles.navPill, { backgroundColor: theme.pillBg }]}>
            <Text style={styles.navEmoji}>🪙</Text>
            <Text style={[styles.navStatText, { color: theme.text }]}>{currency.coins}</Text>
          </View>
          <View style={[styles.navPill, { backgroundColor: theme.pillBg }]}>
            <Text style={styles.navEmoji}>💎</Text>
            <Text style={[styles.navStatText, { color: theme.text }]}>{currency.diamonds || 0}</Text>
          </View>
          <View style={[styles.navPill, { backgroundColor: theme.pillBg }]}>
            <Text style={styles.navEmoji}>❤️</Text>
            <Text style={[styles.navStatText, { color: theme.text }]}>
              {currency.hasUnlimitedHearts || currency.unlimitedHearts ? '∞' : currency.hearts}
            </Text>
          </View>
        </View>
        <Text style={[styles.levelText, { color: theme.textSecondary }]}>
          {activeDifficulty === 'extraHard' ? 'EX-HARD' : activeDifficulty.toUpperCase()} • Lvl {activeLevel}
        </Text>
        <JuicyButton style={styles.howToPlayButton} onPress={replayTutorial}>
          <Text style={styles.howToPlayButtonText}>?</Text>
        </JuicyButton>
        <JuicyButton style={styles.shopButton} onPress={() => setShopVisible(true)}>
          <Text style={styles.shopButtonText}>Shop</Text>
        </JuicyButton>
      </View>

      <View style={styles.header}>
        <View style={styles.heartsContainer}>
          {currency.hasUnlimitedHearts || currency.unlimitedHearts ? (
            <View style={styles.unlimitedHeartsBadge}>
              <Text style={styles.infinityIcon}>❤️ ∞</Text>
            </View>
          ) : (
            [1, 2, 3].map(i => (
              <Text key={i} style={[styles.heartIcon, currency.hearts < i && styles.heartEmpty]}>
                {currency.hearts >= i ? '❤️' : '🤍'}
              </Text>
            ))
          )}
        </View>
        <Text style={[styles.blocksLeftText, { color: theme.textSecondary }]}>
          {isGenerating ? 'Building maze...' : `${blocksLeft} arrows remaining`}
        </Text>
        {combo >= 2 && (
          <Text style={styles.comboMeter}>🔥 COMBO x{combo}</Text>
        )}
      </View>
      
      <View style={styles.boardWrapper} pointerEvents={isGameOver || isGenerating ? 'none' : 'auto'}>
        <View style={[styles.board, { width: currentBoardWidth, height: currentBoardHeight }]}>
          {/* Underlying dotted grid canvas with green celebration wave & synced dot reveal */}
          <DottedGridCanvas 
            isComplete={isLevelComplete} 
            cellArrowMap={cellArrowMap} 
            rows={currentGridRows}
            cols={currentGridCols}
            cellSize={dynamicCellSize}
          />

          {isGenerating ? (
            <View style={styles.buildingMazeCenter}>
              <Text style={[styles.buildingMazeText, { color: theme.textSecondary }]}>Building maze...</Text>
            </View>
          ) : (
            grid && (
              <>
                {/* Active Arrow Blocks Layer with 600ms Fade-In */}
                <Animated.View style={[StyleSheet.absoluteFill, arrowLayerAnimatedStyle]} pointerEvents="box-none">
                  {activeArrowsState.map((arrow) => (
                    <ArrowBlock 
                      key={arrow.id} 
                      ref={getArrowRefCallback(arrow.id)}
                      arrow={arrow}
                      arrowId={arrow.id}
                      progressSharedValue={arrowProgressRef.current[arrow.id]}
                      onSlitherComplete={handleSlitherComplete}
                      cellSize={dynamicCellSize}
                      rows={currentGridRows}
                      cols={currentGridCols}
                      activeDifficulty={activeDifficulty}
                    />
                  ))}
                </Animated.View>

                {floatingTexts.map((item) => (
                  <FloatingText
                    key={item.id}
                    id={item.id}
                    text={item.text}
                    x={item.x}
                    y={item.y}
                    rotation={item.rotation}
                    onComplete={handleFloatingComplete}
                  />
                ))}
                
                {Array.from({ length: currentGridRows }).map((_, r) => 
                  Array.from({ length: currentGridCols }).map((_, c) => (
                    <Pressable key={`cell-${r}-${c}`}
                      style={{
                        position: 'absolute',
                        top: r * dynamicCellSize,
                        left: c * dynamicCellSize,
                        width: dynamicCellSize,
                        height: dynamicCellSize,
                        zIndex: 10,
                      }}
                      onPress={() => handleCellPress(r, c)}
                    />
                  ))
                )}

                {isTutorialActive && !isWon && (
                  <TutorialOverlay
                    key={tutorialRunId}
                    ref={tutorialRef}
                    targetArrow={targetTutorialArrow}
                    dynamicCellSize={dynamicCellSize}
                    screenWidth={width}
                    onDismissed={handleTutorialDone}
                  />
                )}
              </>
            )
          )}

          {/* Celebratory glowing text & bottom-screen confetti cannon overlay */}
          {isLevelComplete && (
            <CelebrationOverlay onCelebrationDone={handleCelebrationDone} />
          )}
        </View>
      </View>
      
      <RewardModal visible={isWon} onNextLevel={handleNextLevel} stars={earnedStars} />
      
      <GameOverModal
        visible={isGameOver && !isWon}
        onWatchAd={handleWatchAdRevive}
        onSpendDiamonds={handleSpendDiamondsRevive}
        onDecline={handleDeclineRevive}
        diamonds={currency.diamonds || 0}
      />

      <ShopModal visible={shopVisible} onClose={() => setShopVisible(false)} />
      
      {/* Floating Hint JuicyButton (lightbulb icon) */}
      <JuicyButton 
        style={[
          styles.floatingHintButton,
          (isAdLoading || isGameOver || isGenerating || blocksLeft === 0) && styles.floatingHintButtonDisabled
        ]}
        onPress={handleHintPress}
        disabled={isAdLoading || isGameOver || isGenerating || blocksLeft === 0}
      >
        {isAdLoading ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.hintText}>Loading...</Text>
          </>
        ) : (
          <>
            <Text style={styles.hintIcon}>💡</Text>
            <Text style={styles.hintText}>{currency.hints > 0 ? `Hint (${currency.hints})` : 'Hint'}</Text>
          </>
        )}
      </JuicyButton>

      <View style={styles.adBannerContainer}>
        <AdService.BannerAd />
      </View>
    </SafeAreaViewContext>
  );
};

const GameOverModal = ({ visible, onWatchAd, onSpendDiamonds, onDecline, diamonds }) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <View style={styles.gameOverBackdrop}>
        <Animated.View style={styles.gameOverCard} entering={ZoomIn}>
          <Text style={styles.gameOverHeartEmoji}>💔</Text>
          <Text style={styles.gameOverTitle}>Game Over</Text>
          <Text style={styles.gameOverSubtitle}>
            Out of Hearts! Revive now to continue this puzzle without losing your progress.
          </Text>

          <View style={styles.gameOverActions}>
            <JuicyButton style={styles.reviveAdButton} onPress={onWatchAd}>
              <Text style={styles.reviveAdButtonText}>Watch Ad (+3 Hearts)</Text>
            </JuicyButton>

            <JuicyButton 
              style={[styles.reviveDiamondButton, (diamonds || 0) < 50 && styles.reviveDiamondButtonDisabled]} 
              onPress={onSpendDiamonds}
            >
              <Text style={styles.reviveDiamondButtonText}>Spend 50 Diamonds</Text>
            </JuicyButton>

            <JuicyButton style={styles.gameOverDeclineButton} onPress={onDecline}>
              <Text style={styles.gameOverDeclineText}>Give Up & Restart</Text>
            </JuicyButton>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const TutorialOverlay = React.forwardRef(({ targetArrow, dynamicCellSize = CELL_SIZE, screenWidth = width, onDismissed }, ref) => {
  const pulse = useSharedValue(1);
  const opacity = useSharedValue(1);
  const [isDismissed, setIsDismissed] = useState(false);
  const [step, setStep] = useState(0);

  const dismiss = React.useCallback(() => {
    opacity.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.quad) });
    setTimeout(() => {
      setIsDismissed(true);
      if (typeof onDismissed === 'function') {
        try {
          onDismissed();
        } catch (_) {}
      }
    }, 350);
  }, [onDismissed]);

  React.useImperativeHandle(ref, () => ({
    dismiss,
    // Advance from the "tap to slide" pointer to the how-to-play card.
    nextStep: () => setStep(1),
  }), [dismiss]);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.0, { duration: 750, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: pulse.value }],
    };
  });

  if (isDismissed) return null;

  // Step 2: centered how-to-play card with a Got it! button.
  if (step >= 1) {
    return (
      <View style={styles.tutorialOverlay} pointerEvents="none">
        <View style={styles.tutorialCard} pointerEvents="auto">
          <Text style={styles.tutorialCardTitle}>How to play</Text>
          <Text style={styles.tutorialCardLine}>👆 Tap an arrow to slide it out of the maze</Text>
          <Text style={styles.tutorialCardLine}>🔥 Tap fast to chain COMBO coins</Text>
          <Text style={styles.tutorialCardLine}>❤️ Wrong taps cost a heart</Text>
          <Text style={styles.tutorialCardLine}>💡 Stuck? Spend a hint to reveal a move</Text>
          <JuicyButton style={styles.tutorialGotIt} onPress={dismiss}>
            <Text style={styles.tutorialGotItText}>Got it!</Text>
          </JuicyButton>
        </View>
      </View>
    );
  }

  // Step 1: pulsing pointer anchored at a movable arrow.
  let pointerPosStyle = {};
  if (targetArrow && targetArrow.cells && targetArrow.cells.length > 0) {
    const head = targetArrow.cells[targetArrow.cells.length - 1];
    const targetX = head.c * dynamicCellSize + dynamicCellSize / 2;
    const targetY = head.r * dynamicCellSize + dynamicCellSize / 2;
    const isRightHalf = targetX > screenWidth / 2;

    pointerPosStyle = {
      top: Math.max(10, Math.round(targetY - 24)),
      ...(isRightHalf ? { right: 15 } : { left: Math.max(15, Math.round(targetX - 55)) }),
    };
  } else {
    pointerPosStyle = {
      top: Math.round(dynamicCellSize * 2),
      left: 15,
    };
  }

  return (
    <View style={styles.tutorialOverlay} pointerEvents="none">
      <Animated.View style={[styles.tutorialPointer, pointerPosStyle, animStyle]} pointerEvents="none">
        <Text style={styles.tutorialText}>Tap an arrow to slide it out!</Text>
      </Animated.View>
      <View style={styles.tutorialSkipWrap} pointerEvents="auto">
        <JuicyButton style={styles.tutorialSkip} onPress={dismiss}>
          <Text style={styles.tutorialSkipText}>Skip</Text>
        </JuicyButton>
      </View>
    </View>
  );
});

const RewardModal = ({ visible, onNextLevel, stars = 0 }) => {
  const { addItem, settings } = useStore();
  const currency = useCurrency();
  const [droppedItem, setDroppedItem] = useState(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (visible) {
      setOpened(false);
      setDroppedItem(null);
    }
  }, [visible]);

  const handleOpen = () => {
    if (opened) return;
    setOpened(true);
    currency.addCoins(50);
    
    if (settings.haptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    
    if (Math.random() < 0.15 && RARE_DROPS.length > 0) {
      const rare = RARE_DROPS[Math.floor(Math.random() * RARE_DROPS.length)];
      setDroppedItem(rare);
      addItem(rare);
    }
  };

  if (!visible) return null;

  return (
    <Animated.View style={styles.rewardOverlay} entering={FadeIn}>
      <Text style={styles.winText}>Maze Solved!</Text>
      {stars > 0 && (
        <Text style={styles.starRow}>
          {'★'.repeat(stars)}{'☆'.repeat(Math.max(0, 3 - stars))}
        </Text>
      )}
            {!opened ? (
        <JuicyButton style={styles.chestToOpen} onPress={handleOpen}>
          <Text style={styles.chestEmoji}>🎁</Text>
          <Text style={styles.chestHint}>Tap to Open</Text>
        </JuicyButton>
      ) : (
        <Animated.View style={styles.rewardContent} entering={ZoomIn}>
          <Text style={styles.rewardCoins}>+50 🪙</Text>
          {droppedItem && (
            <View style={styles.rareDropBox}>
              <Text style={styles.rareDropLabel}>Rare Drop!</Text>
              <Image source={droppedItem.image} style={styles.droppedImage} />
              <Text style={styles.rareDropName}>{droppedItem.name}</Text>
            </View>
          )}
          <JuicyButton style={[styles.retryButton, { marginTop: 30 }]} onPress={onNextLevel}>
            <Text style={styles.retryText}>Next Level</Text>
          </JuicyButton>
        </Animated.View>
      )}
    </Animated.View>
  );
};

// Memoized: arrows are immutable data, and all props (arrow identity, shared
// values, stable callbacks, primitive geometry) are referentially stable across
// parent re-renders, so surviving arrows skip re-render entirely.
const ArrowBlock = React.memo(React.forwardRef(({ arrow, arrowId, onSlitherComplete, progressSharedValue, cellSize = CELL_SIZE, rows = ROWS, cols = COLS, activeDifficulty = 'medium' }, ref) => {
  const wiggle = useSharedValue(0);
  const isGreen = useSharedValue(0);
  const isRed = useSharedValue(0);
  const isGold = useSharedValue(0);
  const scale = useSharedValue(1);
  const fallbackProgress = useSharedValue(0);
  const progress = progressSharedValue || fallbackProgress;
  const { settings } = useStore();
  const { theme } = useTheme();

  // Tracks the pending slither-completion timeout so it can be cancelled if the
  // arrow unmounts (level change / restart) or slither() is re-triggered.
  const slitherTimeoutRef = React.useRef(null);
  React.useEffect(() => {
    return () => {
      if (slitherTimeoutRef.current) {
        clearTimeout(slitherTimeoutRef.current);
        slitherTimeoutRef.current = null;
      }
    };
  }, []);

  const cells = arrow.cells;
  const N = cells.length;
  const head = cells[N - 1];

  // Strictly calculate final orthogonal direction (0°, 90°, 180°, 270°) by comparing last two grid tiles
  const finalDir = getArrowOrthogonalDirection(arrow);
  
  // SVG geometry depends only on immutable arrow data + board geometry:
  // compute once per arrow instead of on every parent re-render.
  const { d, svgWidth, svgHeight, svgLeft, svgTop, svgMinC, svgMinR, center, EXIT_DIST, totalLen, snakeLen } = React.useMemo(() => {
    const minR = Math.min(...cells.map(c => c.r));
    const maxR = Math.max(...cells.map(c => c.r));
    const minC = Math.min(...cells.map(c => c.c));
    const maxC = Math.max(...cells.map(c => c.c));

    let exitR = maxR, exitC = maxC, startR = minR, startC = minC;

    let exitTiles = 0;
    if (finalDir === 'right') exitTiles = cols - head.c + 1;
    if (finalDir === 'left') exitTiles = head.c + 2;
    if (finalDir === 'down') exitTiles = rows - head.r + 1;
    if (finalDir === 'up') exitTiles = head.r + 2;

    const snakeLen = (N - 1) * cellSize;
    const EXIT_DIST = exitTiles * cellSize + snakeLen;

    if (finalDir === 'up') startR = -10;
    if (finalDir === 'down') exitR = rows + 10;
    if (finalDir === 'left') startC = -10;
    if (finalDir === 'right') exitC = cols + 10;

    const svgMinR = Math.min(minR, startR);
    const svgMaxR = Math.max(maxR, exitR);
    const svgMinC = Math.min(minC, startC);
    const svgMaxC = Math.max(maxC, exitC);

    const svgWidth = (svgMaxC - svgMinC + 1) * cellSize;
    const svgHeight = (svgMaxR - svgMinR + 1) * cellSize;
    const svgLeft = svgMinC * cellSize;
    const svgTop = svgMinR * cellSize;

    const center = cellSize / 2;
    let d = '';
    for (let i = 0; i < N; i++) {
      const cx = (cells[i].c - svgMinC) * cellSize + center;
      const cy = (cells[i].r - svgMinR) * cellSize + center;
      if (i === 0) d += `M ${cx} ${cy} `;
      else d += `L ${cx} ${cy} `;
    }

    let exitX = (head.c - svgMinC) * cellSize + center;
    let exitY = (head.r - svgMinR) * cellSize + center;
    if (finalDir === 'right') exitX += EXIT_DIST;
    if (finalDir === 'left') exitX -= EXIT_DIST;
    if (finalDir === 'down') exitY += EXIT_DIST;
    if (finalDir === 'up') exitY -= EXIT_DIST;
    d += `L ${exitX} ${exitY}`;

    const totalLen = snakeLen + EXIT_DIST;
    return { d, svgWidth, svgHeight, svgLeft, svgTop, svgMinC, svgMinR, center, EXIT_DIST, totalLen, snakeLen };
  }, [arrow, cellSize, rows, cols]);
  const slitherDuration = 500;

  React.useImperativeHandle(ref, () => ({
    slither: () => {
      // IF 'canMove' is true: Immediately trigger withTiming to Green with zero red flashing
      isRed.value = 0;
      isGold.value = 0;
      scale.value = 1;
      isGreen.value = withTiming(1, { duration: 150 });
      progress.value = withTiming(EXIT_DIST, { duration: slitherDuration, easing: Easing.inOut(Easing.ease) });
      if (slitherTimeoutRef.current) {
        clearTimeout(slitherTimeoutRef.current);
      }
      slitherTimeoutRef.current = setTimeout(() => {
        slitherTimeoutRef.current = null;
        if (typeof onSlitherComplete === 'function') {
          try {
            onSlitherComplete(arrowId);
          } catch (_) {}
        }
      }, slitherDuration);
    },
    wiggle: () => {
      // IF 'canMove' is false: Immediately trigger withTiming to Red and execute the wiggle
      if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      isGreen.value = 0;
      isGold.value = 0;
      scale.value = 1;
      isRed.value = withTiming(1, { duration: 150 });
      wiggle.value = withSequence(
        withTiming(-5, { duration: 40 }),
        withTiming(5, { duration: 40 }),
        withTiming(-5, { duration: 40 }),
        withTiming(5, { duration: 40 }),
        withTiming(0, { duration: 40 })
      );
    },
    highlight: () => {
      // Hint animation: Turn glowing gold/yellow and pulse scale 1.0 to 1.1
      isRed.value = 0;
      isGreen.value = 0;
      isGold.value = withTiming(1, { duration: 250 });
      scale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 350, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }));

  const animatedStyle = useAnimatedStyle(() => {
    return {
      zIndex: progress.value > 0 ? 100 : (isGold.value > 0 ? 50 : 1),
      transform: [
        { translateX: wiggle.value },
        { scale: scale.value }
      ]
    };
  });

  const animatedPathProps = useAnimatedProps(() => {
    let strokeColor = theme.arrowDefaultColor || theme.arrow;
    if (isGreen.value > 0) {
      strokeColor = interpolateColor(
        isGreen.value,
        [0, 1],
        [theme.arrowDefaultColor || theme.arrow, theme.arrowSuccessColor || '#5CB85C']
      );
    } else if (isRed.value > 0) {
      strokeColor = interpolateColor(
        isRed.value,
        [0, 1],
        [theme.arrowDefaultColor || theme.arrow, theme.arrowErrorColor || '#D9534F']
      );
    } else if (isGold.value > 0) {
      strokeColor = interpolateColor(
        isGold.value,
        [0, 1],
        [theme.arrowDefaultColor || theme.arrow, theme.arrowHighlightColor || '#F5A623']
      );
    }
    return {
      strokeDashoffset: -progress.value,
      stroke: strokeColor
    };
  }, [theme.arrowDefaultColor, theme.arrowSuccessColor, theme.arrowErrorColor, theme.arrowHighlightColor, theme.arrow]);

  const animatedHeadStyle = useAnimatedStyle(() => {
    let tx = 0, ty = 0;
    if (finalDir === 'right') tx = progress.value;
    if (finalDir === 'left') tx = -progress.value;
    if (finalDir === 'down') ty = progress.value;
    if (finalDir === 'up') ty = -progress.value;
    return {
      transform: [{ translateX: tx }, { translateY: ty }]
    };
  });

  const animatedHeadProps = useAnimatedProps(() => {
    let strokeColor = theme.arrowDefaultColor || theme.arrow;
    if (isGreen.value > 0) {
      strokeColor = interpolateColor(
        isGreen.value,
        [0, 1],
        [theme.arrowDefaultColor || theme.arrow, theme.arrowSuccessColor || '#5CB85C']
      );
    } else if (isRed.value > 0) {
      strokeColor = interpolateColor(
        isRed.value,
        [0, 1],
        [theme.arrowDefaultColor || theme.arrow, theme.arrowErrorColor || '#D9534F']
      );
    } else if (isGold.value > 0) {
      strokeColor = interpolateColor(
        isGold.value,
        [0, 1],
        [theme.arrowDefaultColor || theme.arrow, theme.arrowHighlightColor || '#F5A623']
      );
    }
    return {
      stroke: strokeColor
    };
  }, [theme.arrowDefaultColor, theme.arrowSuccessColor, theme.arrowErrorColor, theme.arrowHighlightColor, theme.arrow]);

  // Scale stroke slightly down for Extra-Hard so the dense matrix remains crisp and legible
  const isExtraHard = activeDifficulty === 'extraHard';
  const STROKE = isExtraHard
    ? Math.max(1.5, Math.round(cellSize * 0.11))
    : Math.max(2, Math.round(cellSize * 0.15) - 2);
  
  // Exact center coordinate of the final grid cell
  const HEAD_SIZE = Math.round(cellSize * (isExtraHard ? 0.22 : 0.25));

  // 4 hardcoded orthogonal SVG path strings based strictly on the final vector (0, 90, 180, or 270 degrees).
  // Tip is aligned flush with the center of the final grid cell (hx, hy).
  const headPath = React.useMemo(() => {
    const hx = (head.c - svgMinC) * cellSize + center;
    const hy = (head.r - svgMinR) * cellSize + center;
    if (finalDir === 'right') {
      // 0 degrees - pointing Right (+X)
      return `M ${hx - HEAD_SIZE} ${hy - HEAD_SIZE} L ${hx} ${hy} L ${hx - HEAD_SIZE} ${hy + HEAD_SIZE}`;
    } else if (finalDir === 'down') {
      // 90 degrees - pointing Down (+Y)
      return `M ${hx - HEAD_SIZE} ${hy - HEAD_SIZE} L ${hx} ${hy} L ${hx + HEAD_SIZE} ${hy - HEAD_SIZE}`;
    } else if (finalDir === 'left') {
      // 180 degrees - pointing Left (-X)
      return `M ${hx + HEAD_SIZE} ${hy - HEAD_SIZE} L ${hx} ${hy} L ${hx + HEAD_SIZE} ${hy + HEAD_SIZE}`;
    } else if (finalDir === 'up') {
      // 270 degrees - pointing Up (-Y)
      return `M ${hx - HEAD_SIZE} ${hy + HEAD_SIZE} L ${hx} ${hy} L ${hx + HEAD_SIZE} ${hy + HEAD_SIZE}`;
    }
    return '';
  }, [arrow, cellSize, svgMinC, svgMinR, center, HEAD_SIZE]);

  return (
    <Animated.View style={[animatedStyle, { position: 'absolute', left: svgLeft, top: svgTop, width: svgWidth, height: svgHeight }]} pointerEvents="none">
      <Svg width="100%" height="100%" pointerEvents="none" style={{ overflow: 'visible' }}>
        <AnimatedPath 
          d={d} 
          strokeWidth={STROKE} 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          fill="none" 
          strokeDasharray={`${snakeLen} ${totalLen}`} 
          animatedProps={animatedPathProps}
        />
        <AnimatedPath 
          d={headPath} 
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none" 
          style={animatedHeadStyle} 
          animatedProps={animatedHeadProps}
        />
      </Svg>
    </Animated.View>
  );
}));



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3EBE1',
  },
  homeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeTopBar: {
    position: 'absolute',
    top: 50,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  homeDailyButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeDailyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4A3B32',
  },
  homeSettingsButton: {
    padding: 8,
    backgroundColor: '#FFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  homeSettingsText: {
    fontSize: 20,
  },
  homeContent: {
    alignItems: 'center',
  },
  homeTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#261E1A',
    marginBottom: 5,
  },
  homeSubtitle: {
    fontSize: 16,
    color: '#7A6E65',
    marginBottom: 20,
    fontWeight: '600',
  },
  homeLevelBadge: {
    marginVertical: 14,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  homeLevelLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  homeLevelNumber: {
    fontSize: 22,
    fontWeight: '900',
  },
  playButton: {
    backgroundColor: '#261E1A',
    paddingHorizontal: 44,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 6,
  },
  playButtonText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F3EBE1',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsContainer: {
    width: '85%',
    backgroundColor: '#F3EBE1',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#261E1A',
  },
  closeButton: {
    padding: 6,
  },
  closeButtonText: {
    color: '#7A6E65',
    fontWeight: 'bold',
    fontSize: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#261E1A',
  },
  authSection: {
    marginTop: 26,
  },
  authTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7A6E65',
    marginBottom: 12,
  },
  authButton: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  appleAuth: {
    backgroundColor: '#000',
  },
  appleAuthText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  googleAuth: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  googleAuthText: {
    color: '#261E1A',
    fontSize: 15,
    fontWeight: 'bold',
  },
  safeArea: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#261E1A',
  },
  navStats: {
    flexDirection: 'row',
    gap: 8,
  },
  navPill: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    gap: 4,
  },
  navEmoji: {
    fontSize: 13,
  },
  navStatText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#261E1A',
  },
  levelText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#7A6E65',
  },
  shopButton: {
    backgroundColor: '#261E1A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
  },
  shopButtonText: {
    color: '#F3EBE1',
    fontWeight: '800',
    fontSize: 13,
  },
  howToPlayButton: {
    backgroundColor: '#8EAA78',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    marginRight: 8,
  },
  howToPlayButtonText: {
    color: '#261E1A',
    fontWeight: '800',
    fontSize: 13,
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  heartsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  heartIcon: {
    fontSize: 22,
  },
  heartEmpty: {
    opacity: 0.25,
  },
  infinityIcon: {
    fontSize: 22,
    fontWeight: '900',
    color: '#E74C3C',
    textShadowColor: 'rgba(231, 76, 60, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  unlimitedHeartsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.12)',
  },
  restoreButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  blocksLeftText: {
    fontSize: 14,
    color: '#7A6E65',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  comboMeter: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#E8641B',
  },
  boardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  board: {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  buildingMazeCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    pointerEvents: 'none',
  },
  buildingMazeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7A6E65',
    letterSpacing: 0.5,
  },
  gameOverBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 15, 12, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  gameOverCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFDF9',
    borderRadius: 26,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 1,
    borderColor: '#EFE7DC',
  },
  gameOverHeartEmoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  gameOverTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#261E1A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  gameOverSubtitle: {
    fontSize: 15,
    color: '#7A6E65',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 26,
    paddingHorizontal: 8,
    fontWeight: '500',
  },
  gameOverActions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  reviveAdButton: {
    width: '100%',
    backgroundColor: '#5CB85C',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#5CB85C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  reviveAdButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  reviveDiamondButton: {
    width: '100%',
    backgroundColor: '#261E1A',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  reviveDiamondButtonDisabled: {
    opacity: 0.7,
  },
  reviveDiamondButtonText: {
    color: '#F3EBE1',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  gameOverDeclineButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  gameOverDeclineText: {
    color: '#9E9389',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  winText: {
    color: '#261E1A',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 18,
  },
  starRow: {
    fontSize: 34,
    color: '#F5A623',
    letterSpacing: 6,
    marginBottom: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#261E1A',
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 16,
  },
  retryText: {
    color: '#F3EBE1',
    fontSize: 16,
    fontWeight: '800',
  },
  rewardOverlay: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#FFF',
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    zIndex: 200,
    borderWidth: 1,
    borderColor: '#E8E2D9',
  },
  chestToOpen: {
    alignItems: 'center',
    padding: 16,
  },
  chestEmoji: {
    fontSize: 56,
  },
  chestHint: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#261E1A',
  },
  rewardContent: {
    alignItems: 'center',
  },
  rewardCoins: {
    fontSize: 30,
    fontWeight: '900',
    color: '#261E1A',
  },
  rareDropBox: {
    marginTop: 18,
    backgroundColor: '#F3EBE1',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  rareDropLabel: {
    color: '#8EAA78',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  rareDropName: {
    marginTop: 4,
    color: '#261E1A',
    fontWeight: '600',
  },
  droppedImage: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
    marginVertical: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F3EBE1',
  },
  modeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#B0A79E',
  },
  modeTextActive: {
    color: '#261E1A',
  },
  modalCoins: {
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  modalCoinsText: {
    fontWeight: '800',
    color: '#261E1A',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    gap: 10,
    marginBottom: 10,
  },
  tabButton: {
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: 18,
    backgroundColor: '#EBE5DC',
  },
  tabButtonActive: {
    backgroundColor: '#261E1A',
  },
  tabText: {
    color: '#7A6E65',
    fontWeight: 'bold',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFF',
  },
  scrollGrid: {
    padding: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  emptyText: {
    color: '#7A6E65',
    fontSize: 15,
    textAlign: 'center',
    width: '100%',
    marginTop: 50,
  },
  itemCard: {
    width: (width - 50) / 2,
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E8E2D9',
  },
  itemCardPremium: {
    backgroundColor: '#F7F3EE',
  },
  catalogImage: {
    width: 54,
    height: 54,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  emojiDim: {
    opacity: 0.3,
  },
  itemName: {
    color: '#261E1A',
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
    fontSize: 12,
  },
  buyButton: {
    backgroundColor: '#261E1A',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  buyButtonOwned: {
    backgroundColor: '#EBE5DC',
  },
  buyButtonPremium: {
    backgroundColor: '#DCD5CB',
  },
  buyButtonEquipped: {
    backgroundColor: '#8EAA78',
  },
  buyText: {
    fontWeight: 'bold',
    color: '#F3EBE1',
    fontSize: 12,
  },
  buyTextEquipped: {
    color: '#FFF',
  },
  adBannerContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 8,
  },
  tutorialOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    backgroundColor: 'transparent',
    borderRadius: 8,
  },
  tutorialPointer: {
    position: 'absolute',
    backgroundColor: '#261E1A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 60,
  },
  tutorialText: {
    fontWeight: 'bold',
    color: '#F3EBE1',
    fontSize: 13,
  },
  tutorialSkipWrap: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 61,
  },
  tutorialSkip: {
    backgroundColor: 'rgba(38, 30, 26, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  tutorialSkipText: {
    color: '#F3EBE1',
    fontWeight: '700',
    fontSize: 12,
  },
  tutorialCard: {
    position: 'absolute',
    top: '28%',
    left: 32,
    right: 32,
    backgroundColor: '#F3EBE1',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 62,
  },
  tutorialCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#261E1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  tutorialCardLine: {
    fontSize: 14,
    color: '#4A3F35',
    marginBottom: 8,
    lineHeight: 20,
  },
  tutorialGotIt: {
    backgroundColor: '#261E1A',
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  tutorialGotItText: {
    color: '#F3EBE1',
    fontWeight: '800',
    fontSize: 15,
  },
  floatingTextContainer: {
    position: 'absolute',
    width: 120,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    pointerEvents: 'none',
  },
  floatingText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#3E6B48',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    letterSpacing: 0.5,
  },
  floatingHintButton: {
    position: 'absolute',
    bottom: 65,
    right: 20,
    backgroundColor: '#F5A623',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 60,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  floatingHintButtonDisabled: {
    opacity: 0.6,
  },
  hintIcon: {
    fontSize: 18,
  },
  hintText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  appIconWrapper: {
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  homeAppIcon: {
    width: 96,
    height: 96,
    borderRadius: 22,
  },
  launchScreenContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
