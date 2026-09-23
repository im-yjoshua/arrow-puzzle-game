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
      console.log('[PurchasesManager] Expo Go preview detected with placeholder/native keys. In-app purchases are disabled until real RevenueCat keys are configured.');
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
 * Returns an empty list when the SDK is unconfigured or the dashboard has no
 * packages yet — the shop renders a "coming soon" state instead of fake products.
 */
export const fetchOfferings = async (): Promise<PurchasesPackage[]> => {
  try {
    if (!isPurchasesConfigured && isNativeAvailable) {
      await initializePurchases();
    }

    if (!isPurchasesConfigured) {
      console.log('[PurchasesManager] Purchases not configured; no offerings available');
      return [];
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

    console.log('[PurchasesManager] No active packages on dashboard; returning empty offerings');
    return [];
  } catch (error) {
    console.warn('[PurchasesManager] Failed to fetch live offerings:', error);
    return [];
  }
};

export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  userCancelled?: boolean;
  error?: any;
}

/**
 * Purchases a RevenueCat package via the native store.
 * Never simulates success: if the SDK is unconfigured (Expo Go / missing keys),
 * the purchase fails loudly instead of granting free items.
 */
export const purchaseStorePackage = async (pkg: PurchasesPackage): Promise<PurchaseResult> => {
  if (!pkg) {
    return { success: false, error: new Error('Invalid package') };
  }

  // Purchases unavailable — fail instead of simulating a grant.
  if (!isPurchasesConfigured) {
    console.warn(`[PurchasesManager] Purchase blocked for ${pkg.identifier}: RevenueCat not configured`);
    return { success: false, error: new Error('In-app purchases are not available right now.') };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error?.userCancelled) {
      console.log('[PurchasesManager] User cancelled OS purchase modal');
      return { success: false, userCancelled: true };
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
};
