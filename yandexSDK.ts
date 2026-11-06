/**
 * Yandex Games SDK Official Integration Service
 * Documentation: https://yandex.ru/dev/games/doc/en/
 */

export interface YandexEnvironment {
  i18n: {
    lang: string;
    tld: string;
  };
  app: {
    id: string;
  };
}

export interface YandexDeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet' | 'tv';
  isMobile: () => boolean;
  isTablet: () => boolean;
  isDesktop: () => boolean;
  isTV: () => boolean;
}

export interface YandexPlayer {
  getMode: () => 'lite' | '';
  getName: () => string;
  getPhoto: (size: 'small' | 'medium' | 'large') => string;
  getUniqueID: () => string;
  getData: (keys?: string[]) => Promise<Record<string, unknown>>;
  setData: (data: Record<string, unknown>, flush?: boolean) => Promise<void>;
  getStats: (keys?: string[]) => Promise<Record<string, number>>;
  setStats: (stats: Record<string, number>) => Promise<void>;
  incrementStats: (increments: Record<string, number>) => Promise<Record<string, number>>;
}

export interface YandexFullscreen {
  status: 'on' | 'off';
  request: () => Promise<void>;
  exit: () => Promise<void>;
}

export interface YandexAdv {
  showRewardedVideo: (params: {
    callbacks: {
      onOpen?: () => void;
      onRewarded?: () => void;
      onClose?: () => void;
      onError?: (error: unknown) => void;
    };
  }) => void;
  showFullscreenAdv?: (params: {
    callbacks: {
      onOpen?: () => void;
      onClose?: (wasShown: boolean) => void;
      onError?: (error: unknown) => void;
    };
  }) => void;
}

export interface YandexSDK {
  environment: YandexEnvironment;
  deviceInfo: YandexDeviceInfo;
  features: {
    LoadingAPI?: {
      ready: () => void;
    };
    GameplayAPI?: {
      start: () => void;
      stop: () => void;
    };
  };
  screen?: {
    fullscreen?: YandexFullscreen;
  };
  adv: YandexAdv;
  getPlayer: (options?: { scopes?: boolean; signed?: boolean }) => Promise<YandexPlayer>;
}

declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<YandexSDK>;
    };
    ysdk?: YandexSDK;
  }
}

export interface CloudSavePayload {
  highScore: number;
  totalCoins: number;
  selectedSkinId: string;
  unlockedSkins: string[];
  stats: Record<string, unknown>;
  achievements: unknown[];
  lastDailyClaim?: string;
  updatedAt: number;
}

class YandexGamesService {
  private ysdk: YandexSDK | null = null;
  private player: YandexPlayer | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private isGameplayActive = false;
  private isReadyNotified = false;
  private detectedLang: 'en' | 'ru' = 'en';

  /**
   * Initializes the Yandex Games SDK asynchronously.
   * Safe to call in any environment (handles missing SDK, offline, local dev).
   */
  public async init(): Promise<{
    isAvailable: boolean;
    lang: 'en' | 'ru';
    deviceType: string;
  }> {
    if (this.isInitialized) {
      return {
        isAvailable: !!this.ysdk,
        lang: this.detectedLang,
        deviceType: this.ysdk?.deviceInfo.type || 'desktop',
      };
    }

    if (this.isInitializing) {
      // Return default while initializing
      return { isAvailable: false, lang: this.detectedLang, deviceType: 'desktop' };
    }

    this.isInitializing = true;

    // Check if YaGames is loaded in window
    if (typeof window !== 'undefined' && window.YaGames) {
      try {
        const ysdkInstance = await window.YaGames.init();
        this.ysdk = ysdkInstance;
        window.ysdk = ysdkInstance;

        // Detect language
        const rawLang = ysdkInstance.environment.i18n.lang.toLowerCase();
        if (
          rawLang.startsWith('ru') ||
          rawLang.startsWith('be') ||
          rawLang.startsWith('uk') ||
          rawLang.startsWith('kk') ||
          rawLang.startsWith('uz')
        ) {
          this.detectedLang = 'ru';
        } else {
          this.detectedLang = 'en';
        }

        // Initialize Player API
        try {
          this.player = await ysdkInstance.getPlayer({ scopes: false });
        } catch (playerErr) {
          console.warn('[YandexSDK] Guest player mode or player unavailable:', playerErr);
        }

        this.isInitialized = true;
        this.isInitializing = false;

        return {
          isAvailable: true,
          lang: this.detectedLang,
          deviceType: ysdkInstance.deviceInfo.type || 'desktop',
        };
      } catch (err) {
        console.warn('[YandexSDK] YaGames.init() failed, falling back to local mode:', err);
      }
    } else {
      console.log('[YandexSDK] Running in standalone / local dev mode without YaGames global.');
    }

    // Fallback: detect browser language
    if (typeof navigator !== 'undefined') {
      const browserLang = (navigator.language || '').toLowerCase();
      if (
        browserLang.startsWith('ru') ||
        browserLang.startsWith('be') ||
        browserLang.startsWith('uk')
      ) {
        this.detectedLang = 'ru';
      }
    }

    this.isInitialized = true;
    this.isInitializing = false;

    return {
      isAvailable: false,
      lang: this.detectedLang,
      deviceType: 'desktop',
    };
  }

  /**
   * Official LoadingAPI.ready()
   * MUST be called once when the game assets are initialized and game is ready to play.
   */
  public notifyReady(): void {
    if (this.isReadyNotified) return;

    if (this.ysdk?.features.LoadingAPI?.ready) {
      try {
        this.ysdk.features.LoadingAPI.ready();
        this.isReadyNotified = true;
      } catch (err) {
        console.warn('[YandexSDK] LoadingAPI.ready() call failed:', err);
      }
    } else {
      this.isReadyNotified = true;
    }
  }

  /**
   * Official GameplayAPI.start()
   * Called when an active run starts. Prevents duplicate calls.
   */
  public gameplayStart(): void {
    if (this.isGameplayActive) return;

    this.isGameplayActive = true;
    if (this.ysdk?.features.GameplayAPI?.start) {
      try {
        this.ysdk.features.GameplayAPI.start();
      } catch (err) {
        console.warn('[YandexSDK] GameplayAPI.start() call failed:', err);
      }
    }
  }

  /**
   * Official GameplayAPI.stop()
   * Called when run pauses, ends (Game Over), or exits to menu.
   */
  public gameplayStop(): void {
    if (!this.isGameplayActive) return;

    this.isGameplayActive = false;
    if (this.ysdk?.features.GameplayAPI?.stop) {
      try {
        this.ysdk.features.GameplayAPI.stop();
      } catch (err) {
        console.warn('[YandexSDK] GameplayAPI.stop() call failed:', err);
      }
    }
  }

  /**
   * Saves game progress to Yandex Cloud (Player API) and syncs with stats.
   */
  public async saveCloudData(payload: CloudSavePayload): Promise<boolean> {
    if (!this.player) return false;

    try {
      // 1. Save state payload
      await this.player.setData({ dtr_save: payload }, true);

      // 2. Set stats (e.g. for leaderboards)
      if (typeof payload.highScore === 'number') {
        await this.player.setStats({
          highScore: payload.highScore,
          totalCoins: payload.totalCoins,
        });
      }
      return true;
    } catch (err) {
      console.warn('[YandexSDK] Failed to save player data to cloud:', err);
      return false;
    }
  }

  /**
   * Loads game progress from Yandex Cloud (Player API).
   */
  public async loadCloudData(): Promise<CloudSavePayload | null> {
    if (!this.player) return null;

    try {
      const data = await this.player.getData(['dtr_save']);
      if (data && data.dtr_save) {
        return data.dtr_save as CloudSavePayload;
      }
    } catch (err) {
      console.warn('[YandexSDK] Failed to load player data from cloud:', err);
    }
    return null;
  }

  /**
   * Rewarded Video Ads
   * Only calls onRewarded when the player legitimately watches the full ad.
   */
  public showRewardedVideo(options: {
    onOpen?: () => void;
    onRewarded: () => void;
    onClose?: () => void;
    onError?: (error: unknown) => void;
  }): void {
    let hasEarnedReward = false;

    if (this.ysdk?.adv?.showRewardedVideo) {
      try {
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => {
              options.onOpen?.();
            },
            onRewarded: () => {
              hasEarnedReward = true;
            },
            onClose: () => {
              if (hasEarnedReward) {
                options.onRewarded();
              }
              options.onClose?.();
            },
            onError: (err) => {
              console.warn('[YandexSDK] Rewarded ad error:', err);
              options.onError?.(err);
              options.onClose?.();
            },
          },
        });
      } catch (err) {
        console.warn('[YandexSDK] showRewardedVideo invocation failed:', err);
        options.onError?.(err);
        options.onClose?.();
      }
    } else {
      // Fallback for local development testing: Simulate a brief rewarded ad
      console.log('[YandexSDK Mock Ad] Simulating rewarded video ad for local testing...');
      options.onOpen?.();
      setTimeout(() => {
        options.onRewarded();
        options.onClose?.();
      }, 1200);
    }
  }

  /**
   * Fullscreen API support
   */
  public async toggleFullscreen(): Promise<boolean> {
    const fs = this.ysdk?.screen?.fullscreen;
    if (fs) {
      try {
        if (fs.status === 'on') {
          await fs.exit();
          return false;
        } else {
          await fs.request();
          return true;
        }
      } catch {
        // Fallback to browser standard
      }
    }

    // Standard HTML5 fullscreen fallback
    if (typeof document !== 'undefined') {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          return true;
        } else {
          await document.exitFullscreen();
          return false;
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  public isFullscreen(): boolean {
    if (this.ysdk?.screen?.fullscreen) {
      return this.ysdk.screen.fullscreen.status === 'on';
    }
    if (typeof document !== 'undefined') {
      return !!document.fullscreenElement;
    }
    return false;
  }

  public getLanguage(): 'en' | 'ru' {
    return this.detectedLang;
  }

  public setLanguage(lang: 'en' | 'ru'): void {
    this.detectedLang = lang;
  }

  public isSDKAvailable(): boolean {
    return !!this.ysdk;
  }

  public getPlayerName(): string {
    return this.player?.getName() || '';
  }
}

export const yandexGames = new YandexGamesService();
