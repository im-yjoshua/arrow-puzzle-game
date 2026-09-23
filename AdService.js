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

  showInterstitial: (onClose) => {
    if (isNativeAdMobAvailable) {
      const interstitial = InterstitialAd.createForAdRequest(interstitialAdId, { requestNonPersonalizedAdsOnly: true });
      const unsubscribe = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        interstitial.show();
      });
      const unsubscribeClose = interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        if (onClose) onClose();
        unsubscribe();
        unsubscribeClose();
      });
      interstitial.load();
    } else {
      console.log("Mock Interstitial Ad: Showing and closing...");
      setTimeout(() => { if (onClose) onClose(); }, 1000);
    }
  },

  showRewarded: (onReward, onClose) => {
    if (isNativeAdMobAvailable) {
      const rewarded = RewardedAd.createForAdRequest(rewardedAdId, { requestNonPersonalizedAdsOnly: true });
      let rewardedUser = false;
      let unsubscribeClose, unsubscribeLoaded, unsubscribeEarned, unsubscribeError;
      const cleanup = () => {
        if (unsubscribeLoaded) unsubscribeLoaded();
        if (unsubscribeEarned) unsubscribeEarned();
        if (unsubscribeClose) unsubscribeClose();
        if (unsubscribeError) unsubscribeError();
      };
      unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        rewarded.show();
      });
      unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, reward => {
        rewardedUser = true;
        if (onReward) onReward(reward);
      });
      unsubscribeClose = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
        if (!rewardedUser && onClose) onClose(); // called if closed without reward
        else if (onClose) onClose();
        cleanup();
      });
      unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
        console.warn("Rewarded ad error:", error);
        if (onClose) onClose();
        cleanup();
      });
      rewarded.load();
    } else {
      console.log("Mock Rewarded Ad: User watched ad. Granting reward...");
      setTimeout(() => {
        if (onReward) onReward();
        if (onClose) onClose();
      }, 1500);
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
