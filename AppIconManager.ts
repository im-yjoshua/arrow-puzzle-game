import AsyncStorage from '@react-native-async-storage/async-storage';

export const EQUIPPED_ICON_KEY = 'equippedAppIcon';
export const OWNED_ICONS_KEY = '@owned_app_icons';

export interface AppIconItem {
  id: string;
  name: string;
  description: string;
  priceDiamonds: number;
  iconImage: any;
  isDefault?: boolean;
}

export const APP_ICONS: AppIconItem[] = [
  {
    id: 'default',
    name: 'Classic Icon',
    description: 'The iconic minimalist labyrinth emblem',
    priceDiamonds: 0,
    iconImage: require('./assets/icon.png'),
    isDefault: true,
  },
  {
    id: 'icon-dark',
    name: 'Dark Mode Icon',
    description: 'Sleek obsidian theme for midnight puzzlers',
    priceDiamonds: 50,
    iconImage: require('./assets/icon-dark.png'),
  },
  {
    id: 'icon-gold',
    name: 'Gold Icon',
    description: 'Opulent gilded crest of a true maze master',
    priceDiamonds: 100,
    iconImage: require('./assets/icon-gold.png'),
  },
];

/**
 * Changes the app icon on the native OS home screen.
 * Wrapped in try/catch to safely operate in Expo Go as well as compiled development builds.
 */
export const setAlternateAppIcon = async (iconName: string): Promise<boolean> => {
  try {
    const targetIcon = iconName === 'default' ? null : iconName;

    // Attempt native swap if a native module is linked
    try {
      // Check for expo-dynamic-app-icon
      const ExpoDynamicIcon = require('expo-dynamic-app-icon');
      if (ExpoDynamicIcon && typeof ExpoDynamicIcon.setAppIcon === 'function') {
        await ExpoDynamicIcon.setAppIcon(targetIcon || 'DEFAULT');
      }
    } catch (_) {
      // Native module not linked in Expo Go; caught gracefully
    }

    // Persist equipped icon to AsyncStorage
    await AsyncStorage.setItem(EQUIPPED_ICON_KEY, iconName);
    return true;
  } catch (error) {
    console.warn('Failed to set alternate app icon:', error);
    try {
      await AsyncStorage.setItem(EQUIPPED_ICON_KEY, iconName);
    } catch (_) {}
    return false;
  }
};

/**
 * Retrieves the currently equipped icon name from AsyncStorage.
 */
export const getEquippedAppIcon = async (): Promise<string> => {
  try {
    const saved = await AsyncStorage.getItem(EQUIPPED_ICON_KEY);
    return saved || 'default';
  } catch (error) {
    console.warn('Error reading equipped app icon:', error);
    return 'default';
  }
};

/**
 * Retrieves the list of owned icon IDs from AsyncStorage.
 */
export const getOwnedIcons = async (): Promise<string[]> => {
  try {
    const saved = await AsyncStorage.getItem(OWNED_ICONS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
    return ['default'];
  } catch (error) {
    console.warn('Error reading owned icons:', error);
    return ['default'];
  }
};

/**
 * Marks an icon as owned and persists to AsyncStorage.
 */
export const addOwnedIcon = async (iconId: string): Promise<string[]> => {
  try {
    const current = await getOwnedIcons();
    if (!current.includes(iconId)) {
      const updated = [...current, iconId];
      await AsyncStorage.setItem(OWNED_ICONS_KEY, JSON.stringify(updated));
      return updated;
    }
    return current;
  } catch (error) {
    console.warn('Error saving owned icon:', error);
    return ['default'];
  }
};

export default {
  APP_ICONS,
  setAlternateAppIcon,
  getEquippedAppIcon,
  getOwnedIcons,
  addOwnedIcon,
};
