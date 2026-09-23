import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useStore } from './store';

/**
 * Audio singleton built on expo-audio (Expo SDK 57).
 *
 * expo-audio is included in Expo Go and ships the ExponentAudio native
 * module, so unlike the old expo-av probing hack there is nothing to probe
 * for: player creation is simply wrapped in try/catch so a missing native
 * module degrades to silent no-ops instead of crashing the game.
 *
 * Public API is unchanged from the expo-av version, so no callers change.
 */
class AudioController {
  private bgmPlayer: AudioPlayer | null = null;
  private sfxPopPlayer: AudioPlayer | null = null;
  private sfxThudPlayer: AudioPlayer | null = null;
  private sfxChimePlayer: AudioPlayer | null = null;

  private isBgmLoading: boolean = false;
  private isAudioModeConfigured: boolean = false;

  private async configureAudioMode(): Promise<void> {
    if (this.isAudioModeConfigured) return;
    try {
      // playsInSilentMode: BGM/SFX still play with the iOS silent switch on.
      // Interruption defaults to 'mixWithOthers', which suits short SFX.
      await setAudioModeAsync({ playsInSilentMode: true });
      this.isAudioModeConfigured = true;
    } catch (e) {
      console.warn('AudioController: Could not configure audio mode', e);
    }
  }

  private createPlayer(asset: any, volume: number, loop: boolean = false): AudioPlayer | null {
    try {
      const player = createAudioPlayer(asset);
      player.volume = volume;
      player.loop = loop;
      return player;
    } catch (e) {
      console.warn('AudioController: Could not create audio player', e);
      return null;
    }
  }

  /**
   * Initializes and loads the background music asynchronously.
   */
  public async initBgm(): Promise<void> {
    if (this.bgmPlayer || this.isBgmLoading) return;
    this.isBgmLoading = true;

    try {
      await this.configureAudioMode();
      this.bgmPlayer = this.createPlayer(require('./assets/audio/bgm.mp3'), 0.35, true);
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
    if (!this.bgmPlayer) {
      await this.initBgm();
      return;
    }

    try {
      if (!this.bgmPlayer.playing) {
        this.bgmPlayer.play();
      }
    } catch (e) {
      console.warn('AudioController: Failed to play BGM:', e);
    }
  }

  public async pauseBgm(): Promise<void> {
    if (!this.bgmPlayer) return;
    try {
      if (this.bgmPlayer.playing) {
        this.bgmPlayer.pause();
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
    try {
      await this.configureAudioMode();
      if (!this.sfxPopPlayer) {
        this.sfxPopPlayer = this.createPlayer(require('./assets/audio/sfx_pop.wav'), 0.6);
      }
      if (!this.sfxThudPlayer) {
        this.sfxThudPlayer = this.createPlayer(require('./assets/audio/sfx_thud.wav'), 0.55);
      }
      if (!this.sfxChimePlayer) {
        this.sfxChimePlayer = this.createPlayer(require('./assets/audio/sfx_chime.wav'), 0.7);
      }
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

    this.sfxPopPlayer = this.playReplayable(this.sfxPopPlayer, require('./assets/audio/sfx_pop.wav'), 0.6);
  }

  /**
   * Play SFX for an invalid blocked arrow (error thud)
   */
  public playInvalidArrow(): void {
    const sfxEnabled = useStore.getState().settings.sfx;
    if (!sfxEnabled) return;

    this.sfxThudPlayer = this.playReplayable(this.sfxThudPlayer, require('./assets/audio/sfx_thud.wav'), 0.55);
  }

  /**
   * Play SFX for level completion (celebratory chime)
   */
  public playLevelComplete(): void {
    const sfxEnabled = useStore.getState().settings.sfx;
    if (!sfxEnabled) return;

    this.sfxChimePlayer = this.playReplayable(this.sfxChimePlayer, require('./assets/audio/sfx_chime.wav'), 0.7);
  }

  /**
   * Replays a cached SFX player from the start. Lazily creates (and caches)
   * the player on first use so SFX still work even if preloadSfx() never ran.
   */
  private playReplayable(player: AudioPlayer | null, asset: any, volume: number): AudioPlayer | null {
    try {
      if (!player) {
        player = this.createPlayer(asset, volume);
      }
      if (player) {
        player.seekTo(0);
        player.play();
      }
      return player;
    } catch (e) {
      console.warn('AudioController: SFX playback error:', e);
      return player;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      for (const key of ['bgmPlayer', 'sfxPopPlayer', 'sfxThudPlayer', 'sfxChimePlayer'] as const) {
        const player = this[key];
        if (player) {
          player.remove();
          this[key] = null;
        }
      }
    } catch (e) {
      console.warn('AudioController: Cleanup error:', e);
    }
  }
}

export default new AudioController();
