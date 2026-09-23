import { requireOptionalNativeModule } from 'expo-modules-core';
import { useStore } from './store';

let isAudioAvailable: boolean | null = null;
let AudioModule: any = null;

/**
 * Safely resolves expo-av Audio module without triggering native module missing errors.
 * In Expo Go (SDK 53+ / 57), ExponentAV native module is removed.
 * Calling require('expo-av') directly causes ExponentAV.js to execute requireNativeModule('ExponentAV'),
 * which triggers native C++ error logging (NativeJSLogger.onNewError -> console.error).
 * By probing with requireOptionalNativeModule first, we ensure require('expo-av') is NEVER
 * evaluated unless the native ExponentAV module is actually compiled into the host runtime.
 */
function getAudio(): any | null {
  if (isAudioAvailable === false) return null;
  if (AudioModule) return AudioModule;

  try {
    // 1. First probe if the ExponentAV native module exists without throwing or logging
    const nativeAV =
      (typeof globalThis !== 'undefined' && (globalThis as any)?.expo?.modules?.['ExponentAV']) ||
      requireOptionalNativeModule('ExponentAV');

    if (!nativeAV) {
      isAudioAvailable = false;
      return null;
    }

    // 2. Only require expo-av if the native module actually exists in this binary
    const av = require('expo-av');
    if (av && av.Audio) {
      AudioModule = av.Audio;
      isAudioAvailable = true;
      return AudioModule;
    }
  } catch (_) {
    isAudioAvailable = false;
  }

  isAudioAvailable = false;
  return null;
}

class AudioController {
  private bgmSound: any | null = null;
  private sfxPopSound: any | null = null;
  private sfxThudSound: any | null = null;
  private sfxChimeSound: any | null = null;

  private isBgmLoading: boolean = false;
  private isBgmPlaying: boolean = false;
  private isAudioModeConfigured: boolean = false;

  private async configureAudioMode(): Promise<void> {
    if (this.isAudioModeConfigured) return;
    const Audio = getAudio();
    if (!Audio) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      this.isAudioModeConfigured = true;
    } catch (e) {
      console.warn('AudioController: Could not configure audio mode', e);
    }
  }

  /**
   * Initializes and loads the background music asynchronously.
   * Loads local audio asset and configures it to loop.
   */
  public async initBgm(): Promise<void> {
    if (this.bgmSound || this.isBgmLoading) return;
    const Audio = getAudio();
    if (!Audio) return;
    this.isBgmLoading = true;

    try {
      await this.configureAudioMode();

      // Load local BGM audio asset asynchronously
      const bgmAsset = require('./assets/audio/bgm.mp3');
      const { sound } = await Audio.Sound.createAsync(
        bgmAsset,
        {
          isLooping: true,
          volume: 0.35,
          shouldPlay: false,
        }
      );

      this.bgmSound = sound;
      this.isBgmLoading = false;

      // Check current store setting for BGM
      const isBgmEnabled = useStore.getState().settings.bgm;
      if (isBgmEnabled) {
        await this.playBgm();
      }
    } catch (error) {
      this.isBgmLoading = false;
      console.warn('AudioController: Failed to load background music:', error);
    }
  }

  public async playBgm(): Promise<void> {
    if (!this.bgmSound) {
      await this.initBgm();
      return;
    }

    try {
      const status = await this.bgmSound.getStatusAsync();
      if (status.isLoaded && !status.isPlaying) {
        await this.bgmSound.playAsync();
        this.isBgmPlaying = true;
      }
    } catch (e) {
      console.warn('AudioController: Failed to play BGM:', e);
    }
  }

  public async pauseBgm(): Promise<void> {
    if (!this.bgmSound) return;
    try {
      const status = await this.bgmSound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await this.bgmSound.pauseAsync();
        this.isBgmPlaying = false;
      }
    } catch (e) {
      console.warn('AudioController: Failed to pause BGM:', e);
    }
  }

  public async updateBgmState(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.playBgm();
    } else {
      await this.pauseBgm();
    }
  }

  /**
   * Preloads short sound effects asynchronously so they play instantly on tap with zero latency.
   */
  public async preloadSfx(): Promise<void> {
    const Audio = getAudio();
    if (!Audio) return;

    try {
      await this.configureAudioMode();

      const [popResult, thudResult, chimeResult] = await Promise.all([
        Audio.Sound.createAsync(require('./assets/audio/sfx_pop.wav'), { volume: 0.6 }),
        Audio.Sound.createAsync(require('./assets/audio/sfx_thud.wav'), { volume: 0.55 }),
        Audio.Sound.createAsync(require('./assets/audio/sfx_chime.wav'), { volume: 0.7 }),
      ]);

      this.sfxPopSound = popResult.sound;
      this.sfxThudSound = thudResult.sound;
      this.sfxChimeSound = chimeResult.sound;
    } catch (error) {
      console.warn('AudioController: Failed to preload SFX:', error);
    }
  }

  /**
   * Play SFX for a valid unblocked arrow (soft pop/click)
   */
  public playValidArrow(): void {
    const sfxEnabled = useStore.getState().settings.sfx;
    if (!sfxEnabled) return;

    this.playSound(this.sfxPopSound, require('./assets/audio/sfx_pop.wav'), 0.6);
  }

  /**
   * Play SFX for an invalid blocked arrow (error thud)
   */
  public playInvalidArrow(): void {
    const sfxEnabled = useStore.getState().settings.sfx;
    if (!sfxEnabled) return;

    this.playSound(this.sfxThudSound, require('./assets/audio/sfx_thud.wav'), 0.55);
  }

  /**
   * Play SFX for level completion (celebratory chime)
   */
  public playLevelComplete(): void {
    const sfxEnabled = useStore.getState().settings.sfx;
    if (!sfxEnabled) return;

    this.playSound(this.sfxChimeSound, require('./assets/audio/sfx_chime.wav'), 0.7);
  }

  private async playSound(cachedSound: any | null, asset: any, volume: number): Promise<void> {
    const Audio = getAudio();
    if (!Audio) return;

    try {
      if (cachedSound) {
        const status = await cachedSound.getStatusAsync();
        if (status.isLoaded) {
          await cachedSound.replayAsync();
          return;
        }
      }

      // Fallback: create & play asynchronously if not yet preloaded
      const { sound } = await Audio.Sound.createAsync(asset, { volume, shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) {
      console.warn('AudioController: SFX playback error:', e);
    }
  }

  public async cleanup(): Promise<void> {
    try {
      if (this.bgmSound) {
        await this.bgmSound.unloadAsync();
        this.bgmSound = null;
      }
      if (this.sfxPopSound) {
        await this.sfxPopSound.unloadAsync();
        this.sfxPopSound = null;
      }
      if (this.sfxThudSound) {
        await this.sfxThudSound.unloadAsync();
        this.sfxThudSound = null;
      }
      if (this.sfxChimeSound) {
        await this.sfxChimeSound.unloadAsync();
        this.sfxChimeSound = null;
      }
    } catch (e) {
      console.warn('AudioController: Cleanup error:', e);
    }
  }
}

export default new AudioController();
