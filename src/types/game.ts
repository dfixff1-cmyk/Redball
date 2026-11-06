export type ScreenState = 'HOME' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'SHOP' | 'ACHIEVEMENTS' | 'SETTINGS' | 'DAILY';

export type SkinId = 
  | 'original_blue'
  | 'strawberry_pink'
  | 'lemon_yellow'
  | 'mint_green'
  | 'purple_dream'
  | 'rainbow_ball'
  | 'galaxy_ball'
  | 'golden_champion';

export interface Skin {
  id: SkinId;
  name: string;
  description: string;
  price: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  eyeColor?: string;
  hasCrown?: boolean;
  hasLeaves?: boolean;
  hasStars?: boolean;
  isRainbow?: boolean;
  isGalaxy?: boolean;
  tagline: string;
}

export type PowerUpType = 'SHIELD' | 'MAGNET' | 'SLOWMO' | 'DOUBLE';

export interface ActivePowerUp {
  type: PowerUpType;
  duration: number;
  maxDuration: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  rewardCoins: number;
  progress: number;
  target: number;
  unlocked: boolean;
  claimed: boolean;
}

export interface GameStats {
  totalGames: number;
  highScore: number;
  totalStars: number;
  totalCoins: number;
  longestSurvivalTime: number; // in seconds
  totalObstaclesDodged: number;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  vibrationEnabled: boolean;
  reducedMotion: boolean;
  masterVolume: number; // 0 to 1
}

export interface RunSummary {
  score: number;
  coinsEarned: number;
  starsCollected: number;
  survivalTime: number;
  isNewHighScore: boolean;
  cause: string;
}

export interface ComboState {
  count: number;
  multiplier: number;
  timer: number;
  maxTimer: number;
}
