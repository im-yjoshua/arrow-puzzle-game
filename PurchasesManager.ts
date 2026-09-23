import { Platform } from 'react-native';
import Purchases, {
  PurchasesOfferings,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';

// RevenueCat API keys - replace with live production keys from the RevenueCat dashboard
export const REVENUECAT_KEYS = {
  ios: process.env.EXPO_PUBLIC_RC_IOS_KEY || 'appl_placeholder_mock_ios_key',
  android: process.env.EXPO_PUBLIC_RC_ANDROID_KEY || 'goog_placeholder_mock_android_key',
};

// Fallback consumable offerings used for sandbox/Expo Go preview when dashboard products are pending
export const MOCK_OFFERINGS_PACKAGES: PurchasesPackage[] = [
  {
    identifier: 'pack_diamonds_50',
    packageType: 'CUSTOM' as any,
    product: {
      identifier: 'pack_diamonds_50',
      description: 'A sparkling pouch of 50 diamonds for revives & hints.',
      title: 'Handful of Diamonds',
      price: 0.99,
      priceString: '$0.99',
      currencyCode: 'USD',
    } as any,
    offeringIdentifier: 'default',
  } as PurchasesPackage,
  {
    identifier: 'pack_coins_1000',
    packageType: 'CUSTOM' as any,
    product: {
      identifier: 'pack_coins_1000',
      description: '1,000 shining gold coins to unlock themes and refill hearts.',
      title: 'Chest of Coins',
      price: 1.99,
      priceString: '$1.99',
      currencyCode: 'USD',
    } as any,
    offeringIdentifier: 'default',
  } as PurchasesPackage,
  {
    identifier: 'pack_diamonds_150',
    packageType: 'CUSTOM' as any,
    product: {
      identifier: 'pack_diamonds_150',
      description: '150 radiant gems to unlock premium app icons & power-ups.',
      title: 'Mountain of Diamonds',
      price: 2.99,
      priceString: '$2.99',
      currencyCode: 'USD',
    } as any,
    offeringIdentifier: 'default',
  } as PurchasesPackage,
  {
    identifier: 'pack_unlimited_hearts',
    packageType: 'LIFETIME' as any,
    product: {
      identifier: 'pack_unlimited_hearts',
      description: 'Permanently remove the 3-strike penalty and play stress-free with infinite lives.',
      title: 'Unlimited Hearts (∞)',
      price: 4.99,
      priceString: '$4.99',
      currencyCode: 'USD',
    } as any,
    offeringIdentifier: 'default',
  } as PurchasesPackage,
];

export interface ConsumableReward {
  type: 'coins' | 'diamonds' | 'unlimited_hearts' | 'unknown';
  amount: number;
}

/**
 * Resolves the virtual currency reward associated with a RevenueCat consumable package.
 * Inspects package identifier, product identifier, and metadata.
 */
export const getPackageReward = (pkg: PurchasesPackage): ConsumableReward => {
  if (!pkg) return { type: 'unknown', amount: 0 };

  const id = (pkg.identifier || pkg.product?.identifier || '').toLowerCase();
  const title = (pkg.product?.title || '').toLowerCase();
  const desc = (pkg.product?.description || '').toLowerCase();
  const combined = `${id} ${title} ${desc}`;

  // 0. Unlimited Hearts matching
  if (
    combined.includes('unlimited') ||
    combined.includes('infinite') ||
    combined.includes('infinity') ||
    id.includes('unlimited_hearts') ||
    (combined.includes('remove') && combined.includes('penalty'))
  ) {
    return { type: 'unlimited_hearts', amount: 1 };
  }

  // 1. Diamond rewards
  if (combined.includes('diamond') || combined.includes('gem')) {
    if (id.includes('500') || combined.includes('500')) return { type: 'diamonds', amount: 500 };
    if (id.includes('150') || combined.includes('150')) return { type: 'diamonds', amount: 150 };
    if (id.includes('100') || combined.includes('100')) return { type: 'diamonds', amount: 100 };
    if (id.includes('50') || combined.includes('50')) return { type: 'diamonds', amount: 50 };
    return { type: 'diamonds', amount: 50 };
  }

  // 2. Coin rewards
  if (combined.includes('coin') || combined.includes('gold')) {
    if (id.includes('15000') || combined.includes('15000') || combined.includes('15k')) return { type: 'coins', amount: 15000 };
    if (id.includes('5000') || combined.includes('5000') || combined.includes('5k')) return { type: 'coins', amount: 5000 };
    if (id.includes('1000') || combined.includes('1000') || combined.includes('1k')) return { type: 'coins', amount: 1000 };
    if (id.includes('500') || combined.includes('500')) return { type: 'coins', amount: 500 };
    return { type: 'coins', amount: 1000 };
  }

  return { type: 'unknown', amount: 0 };
};

const isRunningInExpoGo = (): boolean => {
  try {
    return !!((globalThis as any)?.expo?.modules?.ExpoGo);
  } catch (_) {
    return false;
  }
};

let isPurchasesConfigured = false;
let isNativeAvailable = true;

/**
 * Initializes the RevenueCat SDK.
 * Safely detects Expo Go environments and avoids configuring with incompatible
 * native store keys (appl_ / goog_) which trigger RevenueCat Browser Mode key errors.
 */
export const initializePurchases = async (): Promise<boolean> => {
  if (isPurchasesConfigured) return true;

  try {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : REVENUECAT_KEYS.android;
    const inExpoGo = isRunningInExpoGo();

    // In Expo Go, RevenueCat operates in browser mode and requires a web-compatible API key (starting with 'test_' or 'rcb_').
    // Native keys (appl_ or goog_) or mock placeholders will trigger RevenueCat validation errors in Expo Go.
    const isWebCompatible = apiKey.startsWith('test_') || apiKey.startsWith('rcb_');
    if (inExpoGo && !isWebCompatible) {
      console.log('[PurchasesManager] Expo Go preview detected with placeholder/native keys. Operating in simulated sandbox mode.');
      isPurchasesConfigured = false;
      isNativeAvailable = false;
      return false;
    }

    if (__DEV__) {
      try {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      } catch (_) {}
    }

    Purchases.configure({ apiKey });
    isPurchasesConfigured = true;
    isNativeAvailable = true;
    console.log(`[PurchasesManager] RevenueCat SDK configured successfully for ${Platform.OS}`);
    return true;
  } catch (error) {
    // Graceful fallback for Expo Go or unlinked environments
    console.warn('[PurchasesManager] RevenueCat initialization bypassed or unavailable:', error);
    isPurchasesConfigured = false;
    isNativeAvailable = false;
    return false;
  }
};

/**
 * Retrieves active IAP offerings and packages from RevenueCat.
 * Falls back to preview mock packages in development/sandbox if none configured.
 */
export const fetchOfferings = async (): Promise<PurchasesPackage[]> => {
  try {
    if (!isPurchasesConfigured && isNativeAvailable) {
      await initializePurchases();
    }

    if (!isPurchasesConfigured) {
      console.log('[PurchasesManager] Using fallback mock offerings (Expo Go / Sandbox mode)');
      await new Promise((resolve) => setTimeout(resolve, 500));
      return MOCK_OFFERINGS_PACKAGES;
    }

    const offerings: PurchasesOfferings = await Purchases.getOfferings();

    // 1. Check current offering
    if (offerings.current && offerings.current.availablePackages?.length > 0) {
      return offerings.current.availablePackages;
    }

    // 2. Check all offerings
    const allPackages: PurchasesPackage[] = [];
    if (offerings.all) {
      Object.values(offerings.all).forEach((offering) => {
        if (offering.availablePackages && offering.availablePackages.length > 0) {
          allPackages.push(...offering.availablePackages);
        }
      });
    }

    if (allPackages.length > 0) {
      return allPackages;
    }

    // Fallback if no offerings configured yet in RevenueCat dashboard
    console.log('[PurchasesManager] No active packages on dashboard; serving fallback consumables');
    return MOCK_OFFERINGS_PACKAGES;
  } catch (error) {
    console.warn('[PurchasesManager] Failed to fetch live offerings, falling back to mock consumables:', error);
    return MOCK_OFFERINGS_PACKAGES;
  }
};

export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  userCancelled?: boolean;
  error?: any;
  simulated?: boolean;
}

/**
 * Purchases a RevenueCat package.
 * Calls native Purchases.purchasePackage(pkg) or simulates sandbox completion in Expo Go.
 */
export const purchaseStorePackage = async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
  if (!pkg) {
    return { success: false, error: new Error('Invalid package') };
  }

  // If native SDK is unconfigured or in Expo Go, handle via simulated sandbox purchase
  if (!isPurchasesConfigured) {
    console.log(`[PurchasesManager] Simulating sandbox purchase for ${pkg.identifier}...`);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { success: true, simulated: true };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error?.userCancelled) {
      console.log('[PurchasesManager] User cancelled OS purchase modal');
      return { success: false, userCancelled: true };
    }

    // If native purchase throws due to sandbox or mock keys, allow sandbox fallback in dev
    if (__DEV__) {
      console.warn('[PurchasesManager] Native purchase threw error in DEV, checking fallback:', error);
    }
    return { success: false, error };
  }
};

/**
 * Restores previous in-app purchases.
 */
export const restorePurchases = async (): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: any }> => {
  if (!isPurchasesConfigured) {
    return { success: true };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    return { success: true, customerInfo };
  } catch (error) {
    console.warn('[PurchasesManager] Failed to restore purchases:', error);
    return { success: false, error };
  }
};

/**
 * Checks whether CustomerInfo has active Unlimited Hearts entitlement or non-consumable purchase.
 */
export const hasUnlimitedHeartsEntitlement = (customerInfo?: CustomerInfo): boolean => {
  if (!customerInfo) return false;
  try {
    if (customerInfo.entitlements?.active?.['unlimited_hearts']) return true;
    if (customerInfo.entitlements?.active?.['premium']) return true;
    if (customerInfo.allPurchasedProductIdentifiers?.some((id) => id.toLowerCase().includes('unlimited_hearts'))) {
      return true;
    }
  } catch (_) {}
  return false;
};

export default {
  initializePurchases,
  fetchOfferings,
  purchaseStorePackage,
  restorePurchases,
  getPackageReward,
  hasUnlimitedHeartsEntitlement,
  REVENUECAT_KEYS,
  MOCK_OFFERINGS_PACKAGES,
};
