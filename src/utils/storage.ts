import { Achievement, GameSettings, GameStats, SkinId } from '../types/game';
import { INITIAL_ACHIEVEMENTS } from '../data/skins';


// YouTube Playables progress must be persisted through ytgame.game.saveData/loadData,
// not browser storage. Keep an in-memory store for the existing storage helpers
// while running inside Playables; standalone and Yandex builds keep localStorage.
const playableMemoryStore = new Map<string, string>();

function getStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  if (typeof window !== 'undefined' && window.ytgame?.IN_PLAYABLES_ENV === true) {
    return {
      getItem: (key) => playableMemoryStore.get(key) ?? null,
      setItem: (key, value) => { playableMemoryStore.set(key, String(value)); },
      removeItem: (key) => { playableMemoryStore.delete(key); },
    };
  }
  return window.localStorage;
}

const STORAGE_KEYS = {
  HIGH_SCORE: 'dtr_high_score',
  COINS: 'dtr_total_coins',
  SELECTED_SKIN: 'dtr_selected_skin',
  UNLOCKED_SKINS: 'dtr_unlocked_skins',
  STATS: 'dtr_lifetime_stats',
  ACHIEVEMENTS: 'dtr_achievements',
  SETTINGS: 'dtr_settings',
  DAILY_REWARD: 'dtr_last_daily_claim',
};

export const defaultSettings: GameSettings = {
  soundEnabled: true,
  musicEnabled: true,
  vibrationEnabled: true,
  reducedMotion: false,
  masterVolume: 0.8,
};

export const defaultStats: GameStats = {
  totalGames: 0,
  highScore: 0,
  totalStars: 0,
  totalCoins: 0,
  longestSurvivalTime: 0,
  totalObstaclesDodged: 0,
};

export function getStoredHighScore(): number {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.HIGH_SCORE);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): void {
  try {
    const current = getStoredHighScore();
    if (score > current) {
      getStorage().setItem(STORAGE_KEYS.HIGH_SCORE, score.toString());
    }
  } catch {
    // Ignore storage errors
  }
}

export function getStoredCoins(): number {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.COINS);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export function addStoredCoins(amount: number): number {
  try {
    const current = getStoredCoins();
    const updated = Math.max(0, current + amount);
    getStorage().setItem(STORAGE_KEYS.COINS, updated.toString());
    return updated;
  } catch {
    return 0;
  }
}

export function getStoredSelectedSkin(): SkinId {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.SELECTED_SKIN) as SkinId;
    return val || 'original_blue';
  } catch {
    return 'original_blue';
  }
}

export function saveStoredSelectedSkin(skinId: SkinId): void {
  try {
    getStorage().setItem(STORAGE_KEYS.SELECTED_SKIN, skinId);
  } catch {
    // Ignore
  }
}

export function getStoredUnlockedSkins(): SkinId[] {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.UNLOCKED_SKINS);
    if (val) {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    return ['original_blue'];
  } catch {
    return ['original_blue'];
  }
}

export function unlockStoredSkin(skinId: SkinId): SkinId[] {
  try {
    const unlocked = getStoredUnlockedSkins();
    if (!unlocked.includes(skinId)) {
      unlocked.push(skinId);
      getStorage().setItem(STORAGE_KEYS.UNLOCKED_SKINS, JSON.stringify(unlocked));
    }
    return unlocked;
  } catch {
    return ['original_blue', skinId];
  }
}

export function getStoredSettings(): GameSettings {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.SETTINGS);
    return val ? { ...defaultSettings, ...JSON.parse(val) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export function saveStoredSettings(settings: GameSettings): void {
  try {
    getStorage().setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export function getStoredStats(): GameStats {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.STATS);
    return val ? { ...defaultStats, ...JSON.parse(val) } : defaultStats;
  } catch {
    return defaultStats;
  }
}

export function updateLifetimeStats(runStats: {
  score: number;
  coins: number;
  stars: number;
  survivalSeconds: number;
  dodged: number;
}): GameStats {
  try {
    const current = getStoredStats();
    const updated: GameStats = {
      totalGames: current.totalGames + 1,
      highScore: Math.max(current.highScore, runStats.score),
      totalCoins: current.totalCoins + runStats.coins,
      totalStars: current.totalStars + runStats.stars,
      longestSurvivalTime: Math.max(current.longestSurvivalTime, Math.floor(runStats.survivalSeconds)),
      totalObstaclesDodged: current.totalObstaclesDodged + runStats.dodged,
    };
    getStorage().setItem(STORAGE_KEYS.STATS, JSON.stringify(updated));
    return updated;
  } catch {
    return defaultStats;
  }
}

export function getStoredAchievements(): Achievement[] {
  try {
    const val = getStorage().getItem(STORAGE_KEYS.ACHIEVEMENTS);
    if (val) {
      const stored = JSON.parse(val) as Achievement[];
      // Merge with INITIAL_ACHIEVEMENTS in case of schema updates
      return INITIAL_ACHIEVEMENTS.map((init) => {
        const found = stored.find((s) => s.id === init.id);
        return found ? { ...init, ...found } : init;
      });
    }
    return INITIAL_ACHIEVEMENTS;
  } catch {
    return INITIAL_ACHIEVEMENTS;
  }
}

export function saveStoredAchievements(achievements: Achievement[]): void {
  try {
    getStorage().setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(achievements));
  } catch {
    // Ignore
  }
}

export function checkDailyRewardClaimed(): boolean {
  try {
    const lastClaim = getStorage().getItem(STORAGE_KEYS.DAILY_REWARD);
    const today = new Date().toDateString();
    return lastClaim === today;
  } catch {
    return false;
  }
}

export function claimDailyReward(): boolean {
  try {
    const today = new Date().toDateString();
    getStorage().setItem(STORAGE_KEYS.DAILY_REWARD, today);
    addStoredCoins(50);
    return true;
  } catch {
    return false;
  }
}

export function resetAllGameData(): void {
  try {
    getStorage().removeItem(STORAGE_KEYS.HIGH_SCORE);
    getStorage().removeItem(STORAGE_KEYS.COINS);
    getStorage().removeItem(STORAGE_KEYS.SELECTED_SKIN);
    getStorage().removeItem(STORAGE_KEYS.UNLOCKED_SKINS);
    getStorage().removeItem(STORAGE_KEYS.STATS);
    getStorage().removeItem(STORAGE_KEYS.ACHIEVEMENTS);
    getStorage().removeItem(STORAGE_KEYS.DAILY_REWARD);
    // keep default settings
  } catch {
    // Ignore
  }
}

export function getStoredLanguage(): 'en' | 'ru' | null {
  try {
    const val = getStorage().getItem('dtr_language');
    if (val === 'en' || val === 'ru') return val;
  } catch {
    // Ignore
  }
  return null;
}

export function saveStoredLanguage(lang: 'en' | 'ru'): void {
  try {
    getStorage().setItem('dtr_language', lang);
  } catch {
    // Ignore
  }
}

export function exportLocalStateForCloud() {
  return {
    highScore: getStoredHighScore(),
    totalCoins: getStoredCoins(),
    selectedSkinId: getStoredSelectedSkin(),
    unlockedSkins: getStoredUnlockedSkins(),
    stats: getStoredStats() as unknown as Record<string, unknown>,
    achievements: getStoredAchievements(),
    settings: getStoredSettings(),
    lastDailyClaim: getStorage().getItem(STORAGE_KEYS.DAILY_REWARD) || undefined,
    updatedAt: Date.now(),
  };
}

export function syncCloudDataWithLocal(cloudData: {
  highScore?: number;
  totalCoins?: number;
  selectedSkinId?: string;
  unlockedSkins?: string[];
  stats?: Record<string, unknown>;
  achievements?: unknown[];
  settings?: GameSettings;
  lastDailyClaim?: string;
}) {
  try {
    if (typeof cloudData.highScore === 'number') {
      const localHigh = getStoredHighScore();
      if (cloudData.highScore > localHigh) {
        saveHighScore(cloudData.highScore);
      }
    }
    if (typeof cloudData.totalCoins === 'number') {
      const localCoins = getStoredCoins();
      if (cloudData.totalCoins > localCoins) {
        getStorage().setItem(STORAGE_KEYS.COINS, cloudData.totalCoins.toString());
      }
    }
    if (Array.isArray(cloudData.unlockedSkins)) {
      const localUnlocked = getStoredUnlockedSkins();
      const merged = Array.from(new Set([...localUnlocked, ...cloudData.unlockedSkins])) as SkinId[];
      getStorage().setItem(STORAGE_KEYS.UNLOCKED_SKINS, JSON.stringify(merged));
    }
    if (cloudData.selectedSkinId) {
      saveStoredSelectedSkin(cloudData.selectedSkinId as SkinId);
    }
    if (cloudData.lastDailyClaim) {
      getStorage().setItem(STORAGE_KEYS.DAILY_REWARD, cloudData.lastDailyClaim);
    }
    if (cloudData.settings && typeof cloudData.settings === 'object') {
      saveStoredSettings({ ...defaultSettings, ...cloudData.settings });
    }
    if (cloudData.stats && typeof cloudData.stats === 'object') {
      const localStats = getStoredStats();
      const incomingStats = cloudData.stats as Partial<GameStats>;
      getStorage().setItem(STORAGE_KEYS.STATS, JSON.stringify({
        totalGames: Math.max(localStats.totalGames, incomingStats.totalGames || 0),
        highScore: Math.max(localStats.highScore, incomingStats.highScore || 0),
        totalStars: Math.max(localStats.totalStars, incomingStats.totalStars || 0),
        totalCoins: Math.max(localStats.totalCoins, incomingStats.totalCoins || 0),
        longestSurvivalTime: Math.max(localStats.longestSurvivalTime, incomingStats.longestSurvivalTime || 0),
        totalObstaclesDodged: Math.max(localStats.totalObstaclesDodged, incomingStats.totalObstaclesDodged || 0),
      }));
    }
    if (Array.isArray(cloudData.achievements)) {
      const localAchievements = getStoredAchievements();
      const cloudAchievements = cloudData.achievements as Achievement[];
      const mergedAchievements = INITIAL_ACHIEVEMENTS.map((initial) => {
        const local = localAchievements.find((item) => item.id === initial.id);
        const cloud = cloudAchievements.find((item) => item && item.id === initial.id);
        const merged = { ...initial, ...(local || {}), ...(cloud || {}) };
        return {
          ...merged,
          progress: Math.max(local?.progress || 0, cloud?.progress || 0),
          unlocked: !!(local?.unlocked || cloud?.unlocked),
          claimed: !!(local?.claimed || cloud?.claimed),
        };
      });
      getStorage().setItem(STORAGE_KEYS.ACHIEVEMENTS, JSON.stringify(mergedAchievements));
    }
  } catch {
    // Ignore
  }
}
