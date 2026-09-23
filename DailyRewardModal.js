import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSequence, 
  withTiming, 
  withSpring, 
  Easing 
} from 'react-native-reanimated';
import { useStore } from './store';
import { useCurrency } from './CurrencyContext';
import AudioController from './AudioController';
import JuicyButton from './JuicyButton';

export const DAILY_REWARD_STORAGE_KEY = '@daily_reward_progress';

// Tolerance for small backward jumps (NTP corrections, timezone changes).
// Larger backward jumps are treated as clock tampering and freeze claims.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export const DAILY_REWARDS = [
  { day: 1, label: 'Day 1', rewardType: 'coins', amount: 50, icon: '🪙', title: '+50 Coins' },
  { day: 2, label: 'Day 2', rewardType: 'lives', amount: 2, icon: '❤️', title: '+2 Hearts' },
  { day: 3, label: 'Day 3', rewardType: 'coins', amount: 100, icon: '🪙', title: '+100 Coins' },
  { day: 4, label: 'Day 4', rewardType: 'diamonds', amount: 5, icon: '💎', title: '+5 Diamonds' },
  { day: 5, label: 'Day 5', rewardType: 'coins', amount: 150, icon: '🪙', title: '+150 Coins' },
  { day: 6, label: 'Day 6', rewardType: 'lives', amount: 3, icon: '❤️', title: '+3 Hearts' },
  { day: 7, label: 'Day 7', rewardType: 'jackpot', amount: 10, bonusCoins: 250, icon: '👑', title: '10 💎 + 250 🪙', isBig: true },
];

export const checkDailyRewardStatus = async () => {
  try {
    const raw = await AsyncStorage.getItem(DAILY_REWARD_STORAGE_KEY);
    const now = Date.now();
    const todayDateStr = new Date(now).toDateString();

    if (!raw) {
      return { canClaim: true, streak: 1, lastClaimedDate: null, clockTampered: false };
    }

    const data = JSON.parse(raw);
    const { lastClaimedDate, lastClaimedTimestamp, streak } = data;

    // Backward clock: device time is earlier than the last recorded claim.
    // Freeze rewards until the clock catches up — prevents re-claiming the
    // same day by rewinding the device clock. (Forward jumps that land on a
    // "new day" are indistinguishable from real next-day logins without
    // server time; the streak still only advances one day per claim.)
    if (lastClaimedTimestamp && now < lastClaimedTimestamp - CLOCK_SKEW_TOLERANCE_MS) {
      return { canClaim: false, streak: streak || 1, lastClaimedDate, clockTampered: true };
    }

    if (lastClaimedDate === todayDateStr) {
      return { canClaim: false, streak: streak || 1, lastClaimedDate, clockTampered: false };
    }

    // Check if player missed more than 48 hours
    const hoursElapsed = (now - (lastClaimedTimestamp || 0)) / (1000 * 60 * 60);

    let nextStreak = streak || 0;
    if (hoursElapsed > 48) {
      // Streak broken, reset to Day 1
      nextStreak = 1;
    } else {
      // Consecutive login, advance streak (loops 1 to 7)
      nextStreak = (streak % 7) + 1;
    }

    return { canClaim: true, streak: nextStreak, lastClaimedDate, clockTampered: false };
  } catch (e) {
    console.warn('Error reading daily reward status:', e);
    return { canClaim: true, streak: 1, lastClaimedDate: null, clockTampered: false };
  }
};

export const DailyRewardModal = ({ visible, onClose }) => {
  const [currentStreak, setCurrentStreak] = useState(1);
  const [canClaim, setCanClaim] = useState(false);
  const [claimedToday, setClaimedToday] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clockTampered, setClockTampered] = useState(false);
  // Ref guard: state updates are async, so a rapid double-tap could otherwise
  // slip past the isClaiming check and grant twice.
  const claimingRef = useRef(false);

  const { addCoins: addCoinsCurrency, addDiamonds: addDiamondsCurrency, addHearts: addHeartsCurrency } = useCurrency();
  const { settings } = useStore();
  const claimButtonScale = useSharedValue(1);

  const refreshStatus = async () => {
    setLoading(true);
    const status = await checkDailyRewardStatus();
    setCurrentStreak(status.streak);
    setCanClaim(status.canClaim);
    setClaimedToday(!status.canClaim);
    setClockTampered(!!status.clockTampered);
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      refreshStatus();
    }
  }, [visible]);

  const handleClaim = async () => {
    if (!canClaim || claimedToday || isClaiming || claimingRef.current) return;
    claimingRef.current = true;
    setIsClaiming(true);

    try {
      // Button celebration bounce
      claimButtonScale.value = withSequence(
        withTiming(0.88, { duration: 100 }),
        withSpring(1.05, { damping: 10, stiffness: 200 }),
        withTiming(1, { duration: 150 })
      );

      const reward = DAILY_REWARDS[currentStreak - 1];
      if (reward) {
        // Single ledger: CurrencyContext only. (The old zustand store mirror
        // was a shadow balance the UI never displayed.)
        if (reward.rewardType === 'coins') {
          addCoinsCurrency(reward.amount);
        } else if (reward.rewardType === 'diamonds') {
          addDiamondsCurrency(reward.amount);
        } else if (reward.rewardType === 'lives' || reward.rewardType === 'hearts') {
          addHeartsCurrency(reward.amount);
        } else if (reward.rewardType === 'jackpot') {
          addDiamondsCurrency(reward.amount);
          if (reward.bonusCoins) {
            addCoinsCurrency(reward.bonusCoins);
          }
        }
      }

      // Audio and haptics
      AudioController.playLevelComplete();
      if (settings.haptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Save to AsyncStorage — only mark claimed after the save succeeds, so a
      // storage failure leaves the reward claimable instead of stuck.
      const now = Date.now();
      const todayDateStr = new Date(now).toDateString();
      await AsyncStorage.setItem(DAILY_REWARD_STORAGE_KEY, JSON.stringify({
        lastClaimedDate: todayDateStr,
        lastClaimedTimestamp: now,
        streak: currentStreak,
      }));

      setCanClaim(false);
      setClaimedToday(true);
    } catch (e) {
      console.warn('Daily reward claim failed:', e);
      Alert.alert('Claim failed', 'Could not save your reward. Please try again.');
    } finally {
      claimingRef.current = false;
      setIsClaiming(false);
    }
  };

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: claimButtonScale.value }],
  }));

  const activeReward = DAILY_REWARDS[currentStreak - 1];

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>🎁 Daily Rewards</Text>
              <Text style={styles.subtitle}>Log in daily for legendary prizes!</Text>
            </View>
            <JuicyButton style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </JuicyButton>
          </View>

          {/* 7-Day Calendar Grid */}
          <View style={styles.gridContainer}>
            {/* Days 1 to 6 */}
            <View style={styles.daysRow}>
              {DAILY_REWARDS.slice(0, 3).map((item) => renderCard(item, currentStreak, claimedToday))}
            </View>
            <View style={styles.daysRow}>
              {DAILY_REWARDS.slice(3, 6).map((item) => renderCard(item, currentStreak, claimedToday))}
            </View>

            {/* Day 7 Grand Prize Card */}
            {renderDay7Card(DAILY_REWARDS[6], currentStreak, claimedToday)}
          </View>

          {/* Action Footer */}
          <Animated.View style={[styles.footer, animatedButtonStyle]}>
            {clockTampered ? (
              <View style={styles.tamperNotice}>
                <Text style={styles.tamperNoticeText}>
                  ⚠️ Your device clock looks incorrect. Daily rewards are paused until your clock is set correctly.
                </Text>
              </View>
            ) : canClaim && !claimedToday ? (
              <JuicyButton 
                style={[styles.claimButton, isClaiming && styles.claimButtonDisabled]} 
                onPress={handleClaim}
                disabled={isClaiming || claimedToday || !canClaim}
              >
                <Text style={styles.claimButtonText}>
                  {isClaiming ? 'Claiming...' : `Claim ${activeReward?.title || 'Reward'}! 🎉`}
                </Text>
              </JuicyButton>
            ) : (
              <JuicyButton style={styles.claimedButton} onPress={onClose}>
                <Text style={styles.claimedButtonText}>
                  Claimed Today ✓ (Come Back Tomorrow)
                </Text>
              </JuicyButton>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
};

const renderCard = (item, currentStreak, claimedToday) => {
  const isClaimed = item.day < currentStreak || (item.day === currentStreak && claimedToday);
  const isToday = item.day === currentStreak && !claimedToday;
  const isLocked = item.day > currentStreak;

  return (
    <View
      key={`day-${item.day}`}
      style={[
        styles.card,
        isToday && styles.cardToday,
        isClaimed && styles.cardClaimed,
        isLocked && styles.cardLocked,
      ]}
    >
      <Text style={[styles.cardDayLabel, isToday && styles.cardDayLabelToday]}>{item.label}</Text>
      <Text style={styles.cardIcon}>{isClaimed ? '✓' : item.icon}</Text>
      <Text style={[styles.cardTitle, isToday && styles.cardTitleToday]}>{item.title}</Text>

      {isLocked && <Text style={styles.lockBadge}>🔒</Text>}
      {isClaimed && <Text style={styles.claimedBadge}>Claimed</Text>}
      {isToday && <Text style={styles.readyBadge}>Ready!</Text>}
    </View>
  );
};

const renderDay7Card = (item, currentStreak, claimedToday) => {
  const isClaimed = item.day < currentStreak || (item.day === currentStreak && claimedToday);
  const isToday = item.day === currentStreak && !claimedToday;
  const isLocked = item.day > currentStreak;

  return (
    <View
      key={`day-${item.day}`}
      style={[
        styles.day7Card,
        isToday && styles.cardToday,
        isClaimed && styles.cardClaimed,
        isLocked && styles.cardLocked,
      ]}
    >
      <View style={styles.day7Left}>
        <View style={styles.day7HeaderRow}>
          <Text style={[styles.day7Label, isToday && styles.cardDayLabelToday]}>{item.label} - Grand Prize!</Text>
          {isToday && <Text style={styles.readyBadge}>Ready!</Text>}
          {isClaimed && <Text style={styles.claimedBadge}>Claimed</Text>}
          {isLocked && <Text style={styles.lockBadge}>🔒 Locked</Text>}
        </View>
        <Text style={styles.day7RewardTitle}>💎 10 Diamonds + 🪙 250 Coins</Text>
      </View>
      <Text style={styles.day7Icon}>{isClaimed ? '✓' : item.icon}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(38, 30, 26, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FBF8F4',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#E8E2D9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4A3B32',
  },
  subtitle: {
    fontSize: 12,
    color: '#8C7D70',
    marginTop: 2,
    fontWeight: '600',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAE3D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#6B5E55',
    fontWeight: 'bold',
  },
  gridContainer: {
    marginBottom: 16,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E8E2D9',
    position: 'relative',
  },
  cardToday: {
    borderColor: '#4A7C59',
    backgroundColor: '#F3F9F4',
    borderWidth: 2,
    shadowColor: '#4A7C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  cardClaimed: {
    backgroundColor: '#F5F2EB',
    borderColor: '#D8D1C7',
    opacity: 0.75,
  },
  cardLocked: {
    backgroundColor: '#FAF7F2',
    opacity: 0.6,
  },
  cardDayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8C7D70',
    marginBottom: 4,
  },
  cardDayLabelToday: {
    color: '#4A7C59',
    fontWeight: '800',
  },
  cardIcon: {
    fontSize: 24,
    marginVertical: 4,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A3B32',
    textAlign: 'center',
  },
  cardTitleToday: {
    color: '#4A7C59',
    fontWeight: '800',
  },
  lockBadge: {
    fontSize: 10,
    marginTop: 4,
  },
  claimedBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8C7D70',
    marginTop: 3,
  },
  readyBadge: {
    fontSize: 9,
    fontWeight: '900',
    color: '#4A7C59',
    marginTop: 3,
  },
  day7Card: {
    backgroundColor: '#FFF8EB',
    borderRadius: 16,
    padding: 14,
    marginTop: 2,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#E6A838',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  day7Left: {
    flex: 1,
  },
  day7HeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  day7Label: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9C6E15',
  },
  day7RewardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4A3B32',
  },
  day7Icon: {
    fontSize: 32,
    marginLeft: 10,
  },
  footer: {
    width: '100%',
  },
  claimButton: {
    backgroundColor: '#4A7C59',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#4A7C59',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  claimButtonDisabled: {
    opacity: 0.6,
  },
  claimButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  claimedButton: {
    backgroundColor: '#EBE5DC',
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
  },
  claimedButtonText: {
    color: '#7A6E65',
    fontSize: 13,
    fontWeight: '800',
  },
  tamperNotice: {
    backgroundColor: '#FDECEA',
    borderColor: '#E74C3C',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  tamperNoticeText: {
    color: '#A93226',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default DailyRewardModal;
