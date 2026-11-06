export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export interface PastelTheme {
  id: string;
  name: string;
  topColor: ColorRGB;
  bottomColor: ColorRGB;
  laneLineColor: string;
  laneHighlightColor: string;
  badgeEmoji: string;
  accentHex: string;
}

export const PASTEL_THEMES: PastelTheme[] = [
  {
    id: 'vanilla_sunrise',
    name: 'Vanilla Sunrise',
    badgeEmoji: '☀️',
    accentHex: '#FFAE33',
    topColor: { r: 255, g: 249, b: 240 },
    bottomColor: { r: 255, g: 242, b: 222 },
    laneLineColor: 'rgba(215, 195, 175, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.45)',
  },
  {
    id: 'pastel_sky',
    name: 'Pastel Sky',
    badgeEmoji: '☁️',
    accentHex: '#72D7FF',
    topColor: { r: 235, g: 246, b: 255 },
    bottomColor: { r: 213, g: 236, b: 255 },
    laneLineColor: 'rgba(150, 200, 240, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.55)',
  },
  {
    id: 'mint_meadow',
    name: 'Mint Meadow',
    badgeEmoji: '🌱',
    accentHex: '#8DE5B5',
    topColor: { r: 236, g: 250, b: 242 },
    bottomColor: { r: 210, g: 244, b: 226 },
    laneLineColor: 'rgba(150, 215, 180, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.55)',
  },
  {
    id: 'lavender_dream',
    name: 'Lavender Dream',
    badgeEmoji: '✨',
    accentHex: '#B8A7FF',
    topColor: { r: 244, g: 240, b: 255 },
    bottomColor: { r: 229, g: 220, b: 255 },
    laneLineColor: 'rgba(185, 170, 240, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.55)',
  },
  {
    id: 'lemon_sorbet',
    name: 'Lemon Sorbet',
    badgeEmoji: '🍋',
    accentHex: '#FFDE59',
    topColor: { r: 255, g: 253, b: 232 },
    bottomColor: { r: 255, g: 247, b: 194 },
    laneLineColor: 'rgba(235, 215, 150, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.55)',
  },
  {
    id: 'blush_blossom',
    name: 'Blush Blossom',
    badgeEmoji: '🌸',
    accentHex: '#FF8EB5',
    topColor: { r: 255, g: 240, b: 245 },
    bottomColor: { r: 255, g: 225, b: 237 },
    laneLineColor: 'rgba(240, 175, 200, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.55)',
  },
  {
    id: 'cosmic_peach',
    name: 'Cosmic Peach',
    badgeEmoji: '🍑',
    accentHex: '#FFA573',
    topColor: { r: 255, g: 243, b: 235 },
    bottomColor: { r: 255, g: 226, b: 209 },
    laneLineColor: 'rgba(235, 180, 150, 0.45)',
    laneHighlightColor: 'rgba(255, 255, 255, 0.55)',
  },
];

export const SCORE_INTERVAL_PER_THEME = 150; // Each theme lasts 150 points

/**
 * Returns current theme, next theme, and the transition interpolation factor (0..1)
 */
export function getThemeProgression(score: number): {
  currentTheme: PastelTheme;
  nextTheme: PastelTheme;
  transitionFactor: number;
  themeIndex: number;
} {
  const totalThemes = PASTEL_THEMES.length;
  // Calculate which theme cycle we are on based on score
  const exactIndex = score / SCORE_INTERVAL_PER_THEME;
  const currentIndex = Math.floor(exactIndex) % totalThemes;
  const nextIndex = (currentIndex + 1) % totalThemes;

  // The last 30 points of the interval smoothly transition into the next theme
  const progressInInterval = score % SCORE_INTERVAL_PER_THEME;
  const transitionWindow = 35; // points over which colors interpolate smoothly
  let transitionFactor = 0;

  if (progressInInterval >= SCORE_INTERVAL_PER_THEME - transitionWindow) {
    transitionFactor = (progressInInterval - (SCORE_INTERVAL_PER_THEME - transitionWindow)) / transitionWindow;
    transitionFactor = Math.max(0, Math.min(1, transitionFactor));
  }

  return {
    currentTheme: PASTEL_THEMES[currentIndex],
    nextTheme: PASTEL_THEMES[nextIndex],
    transitionFactor,
    themeIndex: currentIndex,
  };
}

/**
 * Interpolates smoothly between two RGB colors
 */
export function lerpColor(c1: ColorRGB, c2: ColorRGB, t: number): ColorRGB {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

export function rgbToString(c: ColorRGB): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}
