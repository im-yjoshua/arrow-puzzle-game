import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Configure foreground notification presentation handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const CHANNEL_ID = 'daily-rewards';

/**
 * Configure Android notification channel (required for Android 8+)
 */
export const setupNotificationChannelAsync = async (): Promise<void> => {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Daily Rewards & Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        lightColor: '#4A3B32',
      });
    } catch (err) {
      console.warn('Error creating Android notification channel:', err);
    }
  }
};

/**
 * Request OS-level notification permissions on app launch.
 * Handles denial gracefully without crashing.
 */
export const requestNotificationPermissionsAsync = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus === 'granted') {
      await setupNotificationChannelAsync();
      return true;
    }

    return false;
  } catch (error) {
    console.warn('Error requesting notification permissions:', error);
    return false;
  }
};

/**
 * Cancel all currently scheduled local notifications to prevent overlapping reminders.
 */
export const cancelAllScheduledRemindersAsync = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn('Error cancelling scheduled notifications:', error);
  }
};

/**
 * Schedule a repeating daily local notification 24 hours from the current time.
 * Clears any pending notifications beforehand to ensure no overlaps.
 */
export const scheduleDailyReminderAsync = async (
  title: string = 'Your Daily Reward is ready! 🎁',
  body: string = 'Claim your coins and hearts now to keep your streak alive!'
): Promise<string | null> => {
  try {
    // Clear any existing scheduled notifications first
    await cancelAllScheduledRemindersAsync();

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { type: 'daily_reward' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 24 * 60 * 60, // 24 hours
        repeats: true,
      },
    });

    return notificationId;
  } catch (error) {
    console.warn('Error scheduling daily reminder notification:', error);
    return null;
  }
};

/**
 * Full app launch routine: requests permission, and if granted, clears old reminders
 * and schedules the new 24h daily reminder.
 */
export const initializeDailyRetentionNotificationsAsync = async (): Promise<boolean> => {
  try {
    const granted = await requestNotificationPermissionsAsync();
    if (granted) {
      await scheduleDailyReminderAsync();
      return true;
    }
    return false;
  } catch (error) {
    console.warn('Error in initializeDailyRetentionNotificationsAsync:', error);
    return false;
  }
};

export default {
  setupNotificationChannelAsync,
  requestNotificationPermissionsAsync,
  cancelAllScheduledRemindersAsync,
  scheduleDailyReminderAsync,
  initializeDailyRetentionNotificationsAsync,
};
