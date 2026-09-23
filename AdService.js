import { Platform, View, Text, StyleSheet } from 'react-native';

// Google AdMob Test IDs (swap for real ad unit IDs before production launch)
const bannerAdId = Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111';
const interstitialAdId = Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712';
const rewardedAdId = Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917';

let MobileAds, BannerAdComponent, InterstitialAd, RewardedAd, BannerAdSize, AdEventType, RewardedAdEventType;
let isNativeAdMobAvailable = false;

try {
  // If running in a Dev Client with native code, this require will succeed.
  const AdsModule = require('react-native-google-mobile-ads');
  MobileAds = AdsModule.default;
  BannerAdComponent = AdsModule.BannerAd;
  InterstitialAd = AdsModule.InterstitialAd;
  RewardedAd = AdsModule.RewardedAd;
  BannerAdSize = AdsModule.BannerAdSize;
  AdEventType = AdsModule.AdEventType;
  RewardedAdEventType = AdsModule.RewardedAdEventType;
  
  MobileAds().initialize();
  isNativeAdMobAvailable = true;
} catch (error) {
  console.warn("Native AdMob module not found (likely running in Expo Go). Using mock AdService.");
  isNativeAdMobAvailable = false;
}

export const AdService = {
  isMock: !isNativeAdMobAvailable,
  
  BannerAd: (props) => {
    if (isNativeAdMobAvailable) {
      return <BannerAdComponent unitId={bannerAdId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} {...props} />;
    } else {
      // Mock Banner for Expo Go
      return (
        <View style={styles.mockBanner}>
          <Text style={styles.mockBannerText}>Mock Banner Ad (Expo Go)</Text>
        </View>
      );
    }
  },

  // Safety net: if an ad neither loads nor errors within this window, treat it as
  // failed so the game can never soft-lock waiting on an ad callback.
  _AD_TIMEOUT_MS: 15000,

  // onClose always fires exactly once (ad closed, failed, or timed out).
  // onError fires only on failure/timeout, before onClose.
  showInterstitial: (onClose, onError) => {
    if (!isNativeAdMobAvailable) {
      console.log("Mock Interstitial Ad: Showing and closing...");
      setTimeout(() => { if (onClose) onClose(); }, 1000);
      return;
    }
    const interstitial = InterstitialAd.createForAdRequest(interstitialAdId, { requestNonPersonalizedAdsOnly: true });
    let finished = false;
    let unsubscribeLoaded, unsubscribeClosed, unsubscribeError;
    const cleanup = () => {
      clearTimeout(safetyTimer);
      if (unsubscribeLoaded) unsubscribeLoaded();
      if (unsubscribeClosed) unsubscribeClosed();
      if (unsubscribeError) unsubscribeError();
    };
    const finish = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) {
        console.warn('[Ads] Interstitial failed:', error && error.message ? error.message : error);
        if (onError) { try { onError(error); } catch (_) {} }
      }
      if (onClose) { try { onClose(); } catch (_) {} }
    };
    const safetyTimer = setTimeout(() => finish(new Error('ad load timeout')), AdService._AD_TIMEOUT_MS);
    unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
      try {
        interstitial.show();
      } catch (e) {
        finish(e);
      }
    });
    unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, () => finish());
    unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => finish(error));
    try {
      interstitial.load();
    } catch (e) {
      finish(e);
    }
  },

  showRewarded: (onReward, onClose, onError) => {
    if (!isNativeAdMobAvailable) {
      console.log("Mock Rewarded Ad: User watched ad. Granting reward...");
      setTimeout(() => {
        if (onReward) onReward();
        if (onClose) onClose();
      }, 1500);
      return;
    }
    const rewarded = RewardedAd.createForAdRequest(rewardedAdId, { requestNonPersonalizedAdsOnly: true });
    let rewardedUser = false;
    let finished = false;
    let unsubscribeLoaded, unsubscribeEarned, unsubscribeClose, unsubscribeError;
    const cleanup = () => {
      clearTimeout(safetyTimer);
      if (unsubscribeLoaded) unsubscribeLoaded();
      if (unsubscribeEarned) unsubscribeEarned();
      if (unsubscribeClose) unsubscribeClose();
      if (unsubscribeError) unsubscribeError();
    };
    const finish = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) {
        console.warn('[Ads] Rewarded failed:', error && error.message ? error.message : error);
        if (onError) { try { onError(error); } catch (_) {} }
      }
      if (onClose) { try { onClose(); } catch (_) {} }
    };
    const safetyTimer = setTimeout(() => finish(new Error('ad load timeout')), AdService._AD_TIMEOUT_MS);
    unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      try {
        rewarded.show();
      } catch (e) {
        finish(e);
      }
    });
    unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
      rewardedUser = true;
      if (onReward) { try { onReward(reward); } catch (_) {} }
    });
    unsubscribeClose = rewarded.addAdEventListener(AdEventType.CLOSED, () => finish());
    unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, (error) => finish(error));
    try {
      rewarded.load();
    } catch (e) {
      finish(e);
    }
  }
};

const styles = StyleSheet.create({
  mockBanner: {
    width: '100%',
    height: 50,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockBannerText: {
    color: '#fff',
    fontWeight: 'bold',
  }
});
