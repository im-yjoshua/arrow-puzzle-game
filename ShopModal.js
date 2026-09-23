import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Image,
  Alert,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
  withRepeat,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { useCurrency } from './CurrencyContext';
import { useTheme, THEMES } from './ThemeContext';
import { APP_ICONS, setAlternateAppIcon, getEquippedAppIcon, getOwnedIcons, addOwnedIcon } from './AppIconManager';
import { fetchOfferings, purchaseStorePackage, getPackageReward } from './PurchasesManager';
import JuicyButton from './JuicyButton';
import AudioController from './AudioController';
import { useStore } from './store';

const { width, height } = Dimensions.get('window');

export const OWNED_THEMES_STORAGE_KEY = '@owned_themes';

export const SHOP_THEMES = [
  {
    id: 'default',
    name: 'Default',
    description: 'Crisp creamy linen with espresso arrows',
    price: 0,
    isDefault: true,
    palette: THEMES.default,
  },
  {
    id: 'mocha',
    name: 'Mocha',
    description: 'Warm cafe roast with olive & terracotta accents',
    price: 500,
    palette: THEMES.mocha,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep obsidian backdrop with neon laser arrows',
    price: 1000,
    palette: THEMES.midnight,
  },
];

/**
 * Rotating Reanimated Spinner for In-App Purchase action buttons
 */
export const ReanimatedSpinner = ({ color = '#FFF', size = 16 }) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: 'rgba(255, 255, 255, 0.25)',
          borderTopColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

/**
 * Animated Juicy Button with Red Error Wiggle on Insufficient Funds
 */
export const WiggleButton = React.forwardRef(({ style, disabledStyle, textStyle, onPress, title, disabled, ...props }, ref) => {
  const wiggle = useSharedValue(0);
  const isError = useSharedValue(0);
  const scale = useSharedValue(1);
  const { settings } = useStore();

  const triggerWiggle = () => {
    if (settings.haptics) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    isError.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 400 })
    );
    wiggle.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 })
    );
  };

  React.useImperativeHandle(ref, () => ({
    triggerWiggle,
  }));

  const animatedStyle = useAnimatedStyle(() => {
    const errorBorder = interpolateColor(
      isError.value,
      [0, 1],
      ['rgba(0,0,0,0)', '#E74C3C']
    );
    return {
      transform: [
        { translateX: wiggle.value },
        { scale: scale.value },
      ],
      borderColor: errorBorder,
      borderWidth: isError.value > 0 ? 2 : 0,
    };
  });

  const handlePressIn = () => {
    if (disabled) return;
    if (settings.haptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    scale.value = withTiming(0.92, { duration: 100 });
  };

  const handlePressOut = () => {
    if (disabled) return;
    scale.value = withSpring(1.0, { damping: 10, stiffness: 200 });
  };

  return (
    <Animated.View style={animatedStyle}>
      <JuicyButton
        style={[style, disabled && disabledStyle]}
        onPress={onPress}
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...props}
      >
        <Text style={textStyle}>{title}</Text>
      </JuicyButton>
    </Animated.View>
  );
});

export const ThemeTabContainer = ({
  themes = SHOP_THEMES,
  ownedThemes = ['default'],
  activeTheme = 'default',
  theme,
  onThemeAction,
  themeWiggleRefs,
}) => {
  return (
    <View style={[styles.tabContainer, styles.themeTabContainer]} testID="ThemeTabContainer">
      {themes.map((item) => {
        const isOwned = ownedThemes.includes(item.id);
        const isEquipped = activeTheme === item.id;

        return (
          <View
            key={item.id}
            testID={`theme-card-${item.id}`}
            style={[
              styles.itemCard,
              { backgroundColor: theme.pillBg, borderColor: isEquipped ? '#4CAF50' : theme.border },
              isEquipped && styles.equippedCard,
            ]}
          >
            {/* Left info & Color Swatch */}
            <View style={styles.cardLeft}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{item.name}</Text>
                {isEquipped && (
                  <View style={styles.equippedBadge}>
                    <Text style={styles.equippedBadgeText}>Equipped ✓</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{item.description}</Text>

              {/* Color Preview Swatch */}
              <View style={styles.palettePreview}>
                <View style={[styles.swatch, { backgroundColor: item.palette.backgroundColor }]} title="Background" />
                <View style={[styles.swatch, { backgroundColor: item.palette.arrowDefaultColor }]} title="Arrows" />
                <View style={[styles.swatch, { backgroundColor: item.palette.arrowSuccessColor }]} title="Slither" />
                <View style={[styles.swatch, { backgroundColor: item.palette.arrowErrorColor }]} title="Error" />
              </View>
            </View>

            {/* Action Button */}
            <View style={styles.cardAction}>
              <WiggleButton
                ref={(el) => {
                  if (themeWiggleRefs && themeWiggleRefs.current) {
                    themeWiggleRefs.current[item.id] = el;
                  }
                }}
                style={[
                  styles.actionButton,
                  isEquipped
                    ? styles.equippedButton
                    : isOwned
                    ? styles.equipButton
                    : styles.buyButton,
                ]}
                textStyle={[
                  styles.actionButtonText,
                  isEquipped && styles.equippedButtonText,
                ]}
                title={
                  isEquipped
                    ? 'Equipped ✓'
                    : isOwned
                    ? 'Equip'
                    : `🪙 ${item.price}`
                }
                disabled={isEquipped}
                onPress={() => onThemeAction(item)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
};

export const OffersTabContainer = ({
  theme,
  hasUnlimitedHearts = false,
  hearts = 5,
  offerWiggleRef,
  onBuyHeartRefill,
  onBuyPackage,
}) => {
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [realMoneyPackages, setRealMoneyPackages] = useState([]);
  const [purchasingPackageId, setPurchasingPackageId] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setOfferingsLoading(true);
    fetchOfferings()
      .then((packages) => {
        if (isMounted) {
          setRealMoneyPackages(packages || []);
        }
      })
      .catch((err) => {
        console.warn('[OffersTabContainer] Failed to fetch offerings:', err);
        if (isMounted) setRealMoneyPackages([]);
      })
      .finally(() => {
        if (isMounted) setOfferingsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePurchase = async (pkg) => {
    const pkgId = pkg.identifier || pkg.product?.identifier;
    setPurchasingPackageId(pkgId);
    try {
      if (onBuyPackage) {
        await onBuyPackage(pkg);
      }
    } finally {
      setPurchasingPackageId(null);
    }
  };

  return (
    <View style={styles.tabContainer} testID="OffersTabContainer">
      {/* Real-Money Store Bundles Header */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeaderTitle, { color: theme.text }]}>
          ⚡ Store Bundles (IAP)
        </Text>
        <Text style={[styles.sectionHeaderBadge, { color: theme.textSecondary }]}>
          Official Store
        </Text>
      </View>

      {/* Loading State for RevenueCat Offerings */}
      {offeringsLoading ? (
        <View
          style={[styles.loadingOffersBox, { backgroundColor: theme.pillBg, borderColor: theme.border }]}
          testID="offers-loading-indicator"
        >
          <ActivityIndicator size="large" color={theme.arrowDefaultColor || '#4A3B32'} />
          <Text style={[styles.loadingOffersText, { color: theme.textSecondary }]}>
            Fetching store offerings...
          </Text>
        </View>
      ) : realMoneyPackages.length === 0 ? (
        <View style={[styles.emptyOffersCard, { backgroundColor: theme.pillBg, borderColor: theme.border }]}>
          <Text style={styles.emptyOffersEmoji}>🛍️</Text>
          <Text style={[styles.emptyOffersTitle, { color: theme.text }]}>
            Store Offers Coming Soon
          </Text>
          <Text style={[styles.emptyOffersSub, { color: theme.textSecondary }]}>
            In-app purchase packages are being configured in the store dashboard.
          </Text>
        </View>
      ) : (
        realMoneyPackages.map((pkg) => {
          const reward = getPackageReward(pkg);
          const pkgId = pkg.identifier || pkg.product?.identifier;
          const isPurchasingThis = purchasingPackageId === pkgId;
          const isDiamonds = reward.type === 'diamonds';
          const isUnlimitedHearts = reward.type === 'unlimited_hearts';
          const isOwned = isUnlimitedHearts && hasUnlimitedHearts;

          return (
            <View
              key={pkgId}
              testID={`package-card-${pkgId}`}
              style={[
                styles.itemCard,
                { backgroundColor: theme.pillBg, borderColor: isOwned ? '#E74C3C' : theme.border },
                isOwned && styles.unlimitedHeartsCardOwned,
              ]}
            >
              <Text style={styles.bigOfferIcon}>
                {isUnlimitedHearts ? '♾️' : isDiamonds ? '💎' : '🪙'}
              </Text>

              <View style={[styles.cardLeft, { marginLeft: 12 }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {pkg.product.title}
                  </Text>
                  {isUnlimitedHearts ? (
                    <View style={[styles.rewardBadge, { backgroundColor: isOwned ? '#FFEBEE' : '#FCE4EC' }]}>
                      <Text style={[styles.rewardBadgeText, { color: '#D32F2F' }]}>
                        {isOwned ? 'Active ∞' : 'Permanent VIP'}
                      </Text>
                    </View>
                  ) : reward.amount > 0 && (
                    <View style={[styles.rewardBadge, { backgroundColor: isDiamonds ? '#E1F5FE' : '#FFF9C4' }]}>
                      <Text style={[styles.rewardBadgeText, { color: isDiamonds ? '#0288D1' : '#F57F17' }]}>
                        +{reward.amount.toLocaleString()} {isDiamonds ? '💎' : '🪙'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
                  {isOwned
                    ? 'Active! All heart deductions and penalties are permanently disabled.'
                    : pkg.product.description}
                </Text>
              </View>

              <View style={styles.cardAction}>
                {isOwned ? (
                  <View style={styles.equippedBadge}>
                    <Text style={styles.equippedBadgeText}>Owned ✓</Text>
                  </View>
                ) : (
                  <JuicyButton
                    style={[
                      styles.actionButton,
                      isUnlimitedHearts
                        ? styles.buyUnlimitedHeartButton
                        : isDiamonds
                        ? styles.buyDiamondButton
                        : styles.buyIapGoldButton,
                      isPurchasingThis && styles.disabledActionBtn,
                    ]}
                    disabled={Boolean(purchasingPackageId)}
                    onPress={() => handlePurchase(pkg)}
                  >
                    {isPurchasingThis ? (
                      <ReanimatedSpinner color="#FFF" size={16} />
                    ) : (
                      <Text style={styles.actionButtonText} testID={`package-price-${pkgId}`}>
                        {pkg.product.priceString}
                      </Text>
                    )}
                  </JuicyButton>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* In-Game Coin Exchanges */}
      <View style={[styles.sectionHeaderRow, { marginTop: 12 }]}>
        <Text style={[styles.sectionHeaderTitle, { color: theme.text }]}>
          ❤️ Energy Refills
        </Text>
        <Text style={[styles.sectionHeaderBadge, { color: theme.textSecondary }]}>
          Coins
        </Text>
      </View>

      <View style={[styles.itemCard, { backgroundColor: theme.pillBg, borderColor: theme.border }]}>
        <Text style={styles.bigOfferIcon}>❤️</Text>

        <View style={[styles.cardLeft, { marginLeft: 12 }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Refill 3 Hearts</Text>
          <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
            {hasUnlimitedHearts
              ? 'Unlimited Hearts is active! Your lives never deplete.'
              : `Instantly restore 3 lives to keep your run alive (Max: 5 ❤️). Current: ${hearts}/5.`}
          </Text>
        </View>

        <View style={styles.cardAction}>
          <WiggleButton
            ref={offerWiggleRef}
            style={[
              styles.actionButton,
              (hearts >= 5 || hasUnlimitedHearts) ? styles.disabledActionBtn : styles.buyButton,
            ]}
            textStyle={styles.actionButtonText}
            title={hasUnlimitedHearts ? 'Active ∞' : hearts >= 5 ? 'Hearts Full' : '🪙 100'}
            disabled={hearts >= 5 || hasUnlimitedHearts}
            onPress={onBuyHeartRefill}
          />
        </View>
      </View>
    </View>
  );
};

export const ShopModal = ({ visible, onClose }) => {
  const [activeTab, setActiveTab] = useState('Themes'); // 'Themes' | 'Icons' | 'Offers' | 'Hints'
  const [ownedThemes, setOwnedThemes] = useState(['default']);
  const [ownedIcons, setOwnedIcons] = useState(['default']);
  const [equippedIcon, setEquippedIcon] = useState('default');

  const {
    coins,
    diamonds,
    hearts,
    hints,
    hasUnlimitedHearts,
    setUnlimitedHearts,
    addCoins,
    addDiamonds,
    spendCoins,
    spendDiamonds,
    addHearts,
    addHints,
  } = useCurrency();

  const { theme, activeTheme, setTheme } = useTheme();
  const { settings } = useStore();

  // Real-Money Offerings state (RevenueCat)
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const [realMoneyPackages, setRealMoneyPackages] = useState([]);
  const [purchasingPackageId, setPurchasingPackageId] = useState(null);

  // Wiggle button refs for error animations
  const offerWiggleRef = useRef(null);
  const hintWiggleRef = useRef(null);
  const themeWiggleRefs = useRef({});
  const iconWiggleRefs = useRef({});

  // Fetch active store offerings from RevenueCat whenever the Offers tab is selected or modal opens
  useEffect(() => {
    if (visible && activeTab === 'Offers') {
      let isMounted = true;
      setOfferingsLoading(true);
      fetchOfferings()
        .then((packages) => {
          if (isMounted) {
            setRealMoneyPackages(packages || []);
          }
        })
        .catch((err) => {
          console.warn('[ShopModal] Failed to fetch offerings:', err);
          if (isMounted) setRealMoneyPackages([]);
        })
        .finally(() => {
          if (isMounted) setOfferingsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [visible, activeTab]);

  // Load owned themes & icons and currently equipped icon on open
  useEffect(() => {
    if (visible) {
      // 1. Load owned themes
      AsyncStorage.getItem(OWNED_THEMES_STORAGE_KEY).then((data) => {
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) setOwnedThemes(parsed);
          } catch (_) {}
        }
      });

      // 2. Load owned icons
      getOwnedIcons().then(setOwnedIcons);

      // 3. Load equipped icon
      getEquippedAppIcon().then(setEquippedIcon);
    }
  }, [visible]);

  // Handle Theme Purchase / Equip
  const handleThemeAction = async (item) => {
    const isOwned = ownedThemes.includes(item.id);

    if (isOwned) {
      // Equip theme
      setTheme(item.id);
      if (settings.haptics) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_) {}
      }
      return;
    }

    // Purchase theme: strictly check coins first
    if (coins < item.price) {
      themeWiggleRefs.current[item.id]?.triggerWiggle();
      Alert.alert(
        'Not Enough Coins',
        `You need ${item.price} coins to unlock ${item.name}. Keep solving puzzles to earn more!`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (spendCoins(item.price)) {
      const updated = Array.from(new Set([...ownedThemes, item.id]));
      setOwnedThemes(updated);
      try {
        await AsyncStorage.setItem(OWNED_THEMES_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save owned themes to storage:', err);
      }
      AudioController.playLevelComplete();
      if (settings.haptics) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (_) {}
      }
    } else {
      themeWiggleRefs.current[item.id]?.triggerWiggle();
    }
  };

  // Handle Icon Purchase / Equip
  const handleIconAction = async (item) => {
    const isOwned = ownedIcons.includes(item.id);

    if (isOwned) {
      // Equip icon natively
      await setAlternateAppIcon(item.id);
      setEquippedIcon(item.id);
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return;
    }

    // Purchase icon
    if (spendDiamonds(item.priceDiamonds)) {
      const updated = await addOwnedIcon(item.id);
      setOwnedIcons(updated);
      await setAlternateAppIcon(item.id);
      setEquippedIcon(item.id);
      AudioController.playLevelComplete();
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      // Insufficient diamonds: trigger wiggle
      iconWiggleRefs.current[item.id]?.triggerWiggle();
      Alert.alert(
        'Not Enough Diamonds',
        `You need ${item.priceDiamonds} diamonds to unlock this app icon.`,
        [{ text: 'OK' }]
      );
    }
  };

  // Handle Heart Refill Offer Purchase
  const handleBuyHeartRefill = () => {
    if (hearts >= 5) {
      Alert.alert('Hearts Full', 'Your hearts are already at maximum capacity (5 ❤️)!');
      return;
    }

    if (spendCoins(100)) {
      addHearts(3);
      AudioController.playLevelComplete();
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      // Insufficient coins: trigger wiggle
      offerWiggleRef.current?.triggerWiggle();
      Alert.alert(
        'Not Enough Coins',
        'You need 100 coins to refill 3 hearts.',
        [{ text: 'OK' }]
      );
    }
  };

  // Handle Hint Pack Purchase
  const handleBuyHintPack = () => {
    if (spendDiamonds(50)) {
      addHints(3);
      AudioController.playLevelComplete();
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      // Insufficient diamonds: trigger wiggle
      hintWiggleRef.current?.triggerWiggle();
      Alert.alert(
        'Not Enough Diamonds',
        'You need 50 diamonds to buy 3 hints.',
        [{ text: 'OK' }]
      );
    }
  };

  // Handle Real-Money Consumable Package Purchase via RevenueCat
  const handleBuyRealMoneyPackage = async (pkg) => {
    if (!pkg || purchasingPackageId) return;

    const pkgId = pkg.identifier || pkg.product?.identifier;
    setPurchasingPackageId(pkgId);

    try {
      const result = await purchaseStorePackage(pkg);

      if (result.success) {
        // Resolve reward from package
        const reward = getPackageReward(pkg);

        if (reward.type === 'unlimited_hearts') {
          setUnlimitedHearts(true);
          AudioController.playLevelComplete();
          if (settings.haptics) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          Alert.alert(
            'Unlimited Hearts Activated! ❤️ ∞',
            'You now have permanent infinite lives! Tap freely without any penalty.',
            [{ text: 'Awesome!' }]
          );
        } else if (reward.type === 'diamonds' && reward.amount > 0) {
          addDiamonds(reward.amount);
          AudioController.playLevelComplete();
          if (settings.haptics) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          Alert.alert(
            'Purchase Successful! 💎',
            `Thank you! Added ${reward.amount} Diamonds to your balance.`,
            [{ text: 'Awesome!' }]
          );
        } else if (reward.type === 'coins' && reward.amount > 0) {
          addCoins(reward.amount);
          AudioController.playLevelComplete();
          if (settings.haptics) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          Alert.alert(
            'Purchase Successful! 🪙',
            `Thank you! Added ${reward.amount.toLocaleString()} Coins to your balance.`,
            [{ text: 'Awesome!' }]
          );
        } else {
          // Fallback reward if package identifier isn't recognized
          addDiamonds(50);
          AudioController.playLevelComplete();
          Alert.alert('Purchase Complete', 'Your purchase was processed successfully!');
        }
      } else if (result.userCancelled) {
        // User cancelled the native OS prompt - NEVER deposit funds!
        console.log('[ShopModal] Purchase cancelled by user; no funds deposited');
      } else {
        Alert.alert(
          'Purchase Incomplete',
          'Unable to complete purchase with the store. Please try again later.'
        );
      }
    } catch (error) {
      console.warn('[ShopModal] Purchase error:', error);
      Alert.alert('Purchase Error', 'An unexpected error occurred while processing your purchase.');
    } finally {
      setPurchasingPackageId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
        <View style={[styles.modalContent, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header Row */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>🛍️ In-Game Shop</Text>
              <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Custom palettes, icons & power-ups</Text>
            </View>

            {/* Currency Badges */}
            <View style={styles.headerRight}>
              <View style={styles.currencyPillsRow}>
                <View style={[styles.currencyPill, { backgroundColor: theme.pillBg }]}>
                  <Text style={styles.currencyEmoji}>🪙</Text>
                  <Text style={[styles.currencyText, { color: theme.text }]}>{coins}</Text>
                </View>
                <View style={[styles.currencyPill, { backgroundColor: theme.pillBg }]}>
                  <Text style={styles.currencyEmoji}>💎</Text>
                  <Text style={[styles.currencyText, { color: theme.text }]}>{diamonds || 0}</Text>
                </View>
              </View>
              <JuicyButton style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeButtonText}>✕</Text>
              </JuicyButton>
            </View>
          </View>

          {/* Top 4-Tab Navigation Row */}
          <View style={[styles.tabsBar, { borderBottomColor: theme.border }]}>
            {['Themes', 'Icons', 'Offers', 'Hints'].map((tab) => {
              const isActive = activeTab === tab;
              return (
                <JuicyButton
                  key={tab}
                  style={[
                    styles.tabButton,
                    isActive && [styles.tabButtonActive, { borderBottomColor: theme.arrowDefaultColor || '#4A3B32' }],
                  ]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: isActive ? (theme.arrowDefaultColor || '#4A3B32') : theme.textSecondary },
                      isActive && styles.tabTextActive,
                    ]}
                  >
                    {tab === 'Themes' && '🎨 '}
                    {tab === 'Icons' && '📱 '}
                    {tab === 'Offers' && '❤️ '}
                    {tab === 'Hints' && '💡 '}
                    {tab}
                  </Text>
                </JuicyButton>
              );
            })}
          </View>

          {/* Tab Content Container */}
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* 1. Themes Tab */}
            {activeTab === 'Themes' && (
              <ThemeTabContainer
                themes={SHOP_THEMES}
                ownedThemes={ownedThemes}
                activeTheme={activeTheme}
                theme={theme}
                onThemeAction={handleThemeAction}
                themeWiggleRefs={themeWiggleRefs}
              />
            )}

            {/* 2. Icons Tab */}
            {activeTab === 'Icons' && (
              <View style={styles.tabContainer}>
                {APP_ICONS.map((icon) => {
                  const isOwned = ownedIcons.includes(icon.id);
                  const isEquipped = equippedIcon === icon.id;

                  return (
                    <View
                      key={icon.id}
                      style={[
                        styles.itemCard,
                        { backgroundColor: theme.pillBg, borderColor: isEquipped ? '#4CAF50' : theme.border },
                        isEquipped && styles.equippedCard,
                      ]}
                    >
                      <Image source={icon.iconImage} style={styles.iconPreviewImage} resizeMode="contain" />

                      <View style={[styles.cardLeft, { marginLeft: 14 }]}>
                        <View style={styles.cardHeaderRow}>
                          <Text style={[styles.cardTitle, { color: theme.text }]}>{icon.name}</Text>
                          {isEquipped && <View style={styles.equippedBadge}><Text style={styles.equippedBadgeText}>Active ✓</Text></View>}
                        </View>
                        <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{icon.description}</Text>
                      </View>

                      <View style={styles.cardAction}>
                        <WiggleButton
                          ref={(el) => (iconWiggleRefs.current[icon.id] = el)}
                          style={[
                            styles.actionButton,
                            isEquipped
                              ? styles.equippedButton
                              : isOwned
                              ? styles.equipButton
                              : styles.buyDiamondButton,
                          ]}
                          textStyle={[
                            styles.actionButtonText,
                            isEquipped && styles.equippedButtonText,
                          ]}
                          title={
                            isEquipped
                              ? 'Equipped'
                              : isOwned
                              ? 'Equip'
                              : `💎 ${icon.priceDiamonds}`
                          }
                          disabled={isEquipped}
                          onPress={() => handleIconAction(icon)}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* 3. Offers Tab */}
            {activeTab === 'Offers' && (
              <OffersTabContainer
                theme={theme}
                hasUnlimitedHearts={hasUnlimitedHearts}
                hearts={hearts}
                offerWiggleRef={offerWiggleRef}
                onBuyHeartRefill={handleBuyHeartRefill}
                onBuyPackage={handleBuyRealMoneyPackage}
              />
            )}

            {/* 4. Hints Tab */}
            {activeTab === 'Hints' && (
              <View style={styles.tabContainer}>
                <View style={[styles.itemCard, { backgroundColor: theme.pillBg, borderColor: theme.border }]}>
                  <Text style={styles.bigOfferIcon}>💡</Text>

                  <View style={[styles.cardLeft, { marginLeft: 12 }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Buy 3 Hints</Text>
                    <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
                      Instantly reveal a valid arrow without watching ads. Owned: {hints} 💡.
                    </Text>
                  </View>

                  <View style={styles.cardAction}>
                    <WiggleButton
                      ref={hintWiggleRef}
                      style={[styles.actionButton, styles.buyDiamondButton]}
                      textStyle={styles.actionButtonText}
                      title="💎 50"
                      onPress={handleBuyHintPack}
                    />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: height * 0.82,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currencyPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  currencyEmoji: {
    fontSize: 12,
  },
  currencyText: {
    fontSize: 12,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#666',
  },
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#4A3B32',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    fontWeight: '900',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  tabContainer: {
    gap: 12,
  },
  themeTabContainer: {
    gap: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  equippedCard: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cardLeft: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  equippedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  equippedBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2E7D32',
  },
  cardDescription: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginBottom: 8,
  },
  palettePreview: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  iconPreviewImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  bigOfferIcon: {
    fontSize: 34,
    marginRight: 4,
  },
  cardAction: {
    marginLeft: 10,
  },
  actionButton: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 80,
  },
  buyButton: {
    backgroundColor: '#4A7C59',
  },
  buyDiamondButton: {
    backgroundColor: '#2980B9',
  },
  buyIapGoldButton: {
    backgroundColor: '#D4AC0D',
  },
  buyUnlimitedHeartButton: {
    backgroundColor: '#E74C3C',
  },
  unlimitedHeartsCardOwned: {
    borderColor: '#E74C3C',
    borderWidth: 2,
  },
  equipButton: {
    backgroundColor: '#34495E',
  },
  equippedButton: {
    backgroundColor: '#E0E0E0',
  },
  disabledActionBtn: {
    backgroundColor: '#BDBDBD',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  equippedButtonText: {
    color: '#757575',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHeaderBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  loadingOffersBox: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingOffersText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyOffersCard: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyOffersEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyOffersTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyOffersSub: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
  },
  rewardBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rewardBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});

export default ShopModal;
