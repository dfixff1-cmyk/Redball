/**
 * YouTube Playables SDK adapter.
 * Keeps the standalone/Yandex build working when the YouTube host is absent.
 */

export interface YouTubePlayablesApi {
  IN_PLAYABLES_ENV: boolean;
  game: {
    firstFrameReady: () => void;
    gameReady: () => void;
    loadData: () => Promise<string>;
    saveData: (data: string) => Promise<void>;
  };
  system: {
    isAudioEnabled: () => boolean;
    onAudioEnabledChange: (callback: (enabled: boolean) => void) => () => void;
    onPause: (callback: () => void) => () => void;
    onResume: (callback: () => void) => () => void;
    getLanguage: () => Promise<string>;
  };
  engagement?: {
    sendScore: (score: { value: number }) => Promise<void>;
  };
}

declare global {
  interface Window {
    ytgame?: YouTubePlayablesApi;
  }
}

class YouTubePlayablesService {
  private cloudLoadCompleted = false;

  public hasCompletedCloudLoad(): boolean {
    return this.cloudLoadCompleted;
  }

  public isInPlayablesEnv(): boolean {
    return typeof window !== 'undefined' &&
      !!window.ytgame &&
      window.ytgame.IN_PLAYABLES_ENV === true;
  }

  public firstFrameReady(): void {
    if (!this.isInPlayablesEnv()) return;
    try {
      window.ytgame!.game.firstFrameReady();
    } catch (error) {
      console.warn('[YouTube Playables] firstFrameReady failed:', error);
    }
  }

  public gameReady(): void {
    if (!this.isInPlayablesEnv()) return;
    try {
      window.ytgame!.game.gameReady();
    } catch (error) {
      console.warn('[YouTube Playables] gameReady failed:', error);
    }
  }

  public isAudioEnabled(): boolean {
    if (!this.isInPlayablesEnv()) return true;
    try {
      return window.ytgame!.system.isAudioEnabled();
    } catch {
      return true;
    }
  }

  public onAudioEnabledChange(callback: (enabled: boolean) => void): () => void {
    if (!this.isInPlayablesEnv()) return () => undefined;
    try {
      return window.ytgame!.system.onAudioEnabledChange(callback);
    } catch {
      return () => undefined;
    }
  }

  public onPause(callback: () => void): () => void {
    if (!this.isInPlayablesEnv()) return () => undefined;
    try {
      return window.ytgame!.system.onPause(callback);
    } catch {
      return () => undefined;
    }
  }

  public onResume(callback: () => void): () => void {
    if (!this.isInPlayablesEnv()) return () => undefined;
    try {
      return window.ytgame!.system.onResume(callback);
    } catch {
      return () => undefined;
    }
  }

  public async getLanguage(): Promise<string> {
    if (!this.isInPlayablesEnv()) return 'en';
    try {
      return await window.ytgame!.system.getLanguage();
    } catch {
      return 'en';
    }
  }

  public async loadData(): Promise<string | null> {
    if (!this.isInPlayablesEnv()) return null;
    try {
      const data = await window.ytgame!.game.loadData();
      this.cloudLoadCompleted = true;
      return data || null;
    } catch (error) {
      this.cloudLoadCompleted = false;
      console.warn('[YouTube Playables] Cloud load failed:', error);
      return null;
    }
  }

  public async saveData(data: unknown): Promise<void> {
    if (!this.isInPlayablesEnv() || !this.cloudLoadCompleted) return;
    try {
      const serialized = JSON.stringify(data);
      if (serialized.length > 3 * 1024 * 1024) {
        console.warn('[YouTube Playables] Save payload exceeds 3 MiB.');
        return;
      }
      await window.ytgame!.game.saveData(serialized);
    } catch (error) {
      console.warn('[YouTube Playables] Cloud save failed:', error);
    }
  }

  public async sendScore(value: number): Promise<void> {
    if (!this.isInPlayablesEnv() || !window.ytgame?.engagement) return;
    try {
      await window.ytgame.engagement.sendScore({ value: Math.max(0, Math.floor(value)) });
    } catch (error) {
      console.warn('[YouTube Playables] Score submission failed:', error);
    }
  }
}

export const youtubePlayables = new YouTubePlayablesService();
