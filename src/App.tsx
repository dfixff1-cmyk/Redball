import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine } from './engine/GameEngine';
import { soundManager } from './audio/soundManager';
import { haptics } from './utils/haptics';
import { SKINS } from './data/skins';
import { PASTEL_THEMES, PastelTheme } from './data/themes';
import { getTranslation, Language } from './i18n/i18n';
import { youtubePlayables } from './sdk/youtubePlayablesSDK';
import { yandexGames } from './sdk/yandexSDK';
import {
  addStoredCoins,
  checkDailyRewardClaimed,
  claimDailyReward,
  exportLocalStateForCloud,
  getStoredAchievements,
  getStoredCoins,
  getStoredHighScore,
  getStoredLanguage,
  getStoredSelectedSkin,
  getStoredSettings,
  getStoredStats,
  getStoredUnlockedSkins,
  resetAllGameData,
  saveHighScore,
  saveStoredAchievements,
  saveStoredLanguage,
  saveStoredSelectedSkin,
  saveStoredSettings,
  syncCloudDataWithLocal,
  unlockStoredSkin,
  updateLifetimeStats,
} from './utils/storage';
import { Achievement, ActivePowerUp, ComboState, GameSettings, GameStats, RunSummary, ScreenState, SkinId } from './types/game';
import { SkinAvatar } from './components/SkinAvatar';

type Strings = ReturnType<typeof getTranslation>;

const POWERUP_ICONS: Record<ActivePowerUp['type'], string> = {
  SHIELD: '🛡️',
  MAGNET: '🧲',
  SLOWMO: '🐢',
  DOUBLE: '✖️2',
};

function computeAchievements(stats: GameStats, bestRunScore: number, unlockedSkinCount: number): Achievement[] {
  const current = getStoredAchievements();
  const progressFor = (id: string, prev: number): number => {
    switch (id) {
      case 'first_run': return stats.totalGames;
      case 'score_100':
      case 'score_250':
      case 'score_500':
      case 'score_1000': return Math.max(prev, bestRunScore, stats.highScore);
      case 'collect_coins_50': return stats.totalCoins;
      case 'collect_stars_25': return stats.totalStars;
      case 'dodge_100': return stats.totalObstaclesDodged;
      case 'survive_60s': return stats.longestSurvivalTime;
      case 'fashionista': return unlockedSkinCount;
      default: return prev;
    }
  };
  return current.map((a) => {
    const progress = Math.min(a.target, Math.max(a.progress, progressFor(a.id, a.progress)));
    return { ...a, progress, unlocked: a.unlocked || progress >= a.target };
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function App() {
  const isPlayables = youtubePlayables.isInPlayablesEnv();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const screenRef = useRef<ScreenState>('HOME');
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const [screen, setScreenState] = useState<ScreenState>('HOME');
  const [lang, setLang] = useState<Language>(() => getStoredLanguage() ?? 'en');
  const [settings, setSettings] = useState<GameSettings>(() => getStoredSettings());
  const [coins, setCoins] = useState(() => getStoredCoins());
  const [highScore, setHighScore] = useState(() => getStoredHighScore());
  const [selectedSkin, setSelectedSkin] = useState<SkinId>(() => getStoredSelectedSkin());
  const [unlockedSkins, setUnlockedSkins] = useState<SkinId[]>(() => getStoredUnlockedSkins());
  const [stats, setStats] = useState<GameStats>(() => getStoredStats());
  const [achievements, setAchievements] = useState<Achievement[]>(() => getStoredAchievements());
  const [dailyClaimed, setDailyClaimed] = useState(() => checkDailyRewardClaimed());

  const [score, setScore] = useState(0);
  const [runCoins, setRunCoins] = useState(0);
  const [powerUps, setPowerUps] = useState<ActivePowerUp[]>([]);
  const [combo, setCombo] = useState<ComboState>({ count: 0, multiplier: 1, timer: 0, maxTimer: 1 });
  const [milestone, setMilestone] = useState<string | null>(null);
  const [theme, setTheme] = useState<PastelTheme>(PASTEL_THEMES[0]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [adState, setAdState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const t: Strings = getTranslation(lang);

  const setScreen = useCallback((next: ScreenState) => {
    screenRef.current = next;
    setScreenState(next);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1800);
  }, []);

  /** Persist current progress to whichever cloud platform is available. */
  const pushCloudSave = useCallback(() => {
    const payload = exportLocalStateForCloud();
    void youtubePlayables.saveData(payload);
    void yandexGames.saveCloudData(payload);
  }, []);

  const refreshFromStorage = useCallback(() => {
    setCoins(getStoredCoins());
    setHighScore(getStoredHighScore());
    setSelectedSkin(getStoredSelectedSkin());
    setUnlockedSkins(getStoredUnlockedSkins());
    setStats(getStoredStats());
    setAchievements(getStoredAchievements());
    setDailyClaimed(checkDailyRewardClaimed());
    setSettings(getStoredSettings());
  }, []);

  // --- Engine setup ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas);
    engineRef.current = engine;

    engine.onScoreUpdate = setScore;
    engine.onCoinsUpdate = setRunCoins;
    engine.onPowerUpChange = setPowerUps;
    engine.onComboUpdate = setCombo;
    engine.onThemeChange = setTheme;
    engine.onMilestone = (text) => {
      setMilestone(text);
      window.setTimeout(() => setMilestone((cur) => (cur === text ? null : cur)), 1600);
    };

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // Game-over handler reads latest state through storage, so it is safe to (re)assign each render.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.onGameOver = (run) => {
      const previousBest = getStoredHighScore();
      const isNewHighScore = run.score > previousBest;
      saveHighScore(run.score);
      const totalCoins = addStoredCoins(run.coinsEarned);
      const newStats = updateLifetimeStats({
        score: run.score,
        coins: run.coinsEarned,
        stars: run.starsCollected,
        survivalSeconds: run.survivalTime,
        dodged: engine.getObstaclesDodged(),
      });
      const newAchievements = computeAchievements(newStats, run.score, getStoredUnlockedSkins().length);
      saveStoredAchievements(newAchievements);

      const best = Math.max(previousBest, run.score);
      setHighScore(best);
      setCoins(totalCoins);
      setStats(newStats);
      setAchievements(newAchievements);
      setSummary({ ...run, isNewHighScore });
      setAdState('idle');
      setScreen('GAMEOVER');

      yandexGames.gameplayStop();
      void youtubePlayables.sendScore(best);
      pushCloudSave();
    };
  }, [pushCloudSave, setScreen]);

  // --- Settings → audio / engine ---
  useEffect(() => {
    soundManager.setConfig(settings);
    engineRef.current?.setReducedMotion(settings.reducedMotion);
  }, [settings]);

  useEffect(() => {
    engineRef.current?.setSkin(selectedSkin);
  }, [selectedSkin]);

  // --- Platform bootstrapping (cloud load, language, host callbacks) ---
  useEffect(() => {
    let cancelled = false;
    youtubePlayables.firstFrameReady();
    soundManager.setPausedOrMuted(!youtubePlayables.isAudioEnabled());

    (async () => {
      if (youtubePlayables.isInPlayablesEnv()) {
        const raw = await youtubePlayables.loadData();
        if (raw) {
          try {
            syncCloudDataWithLocal(JSON.parse(raw));
          } catch {
            // Ignore malformed save data
          }
        }
        if (!getStoredLanguage()) {
          const hostLang = await youtubePlayables.getLanguage();
          if (!cancelled) setLang(hostLang.toLowerCase().startsWith('ru') ? 'ru' : 'en');
        }
      } else {
        const info = await yandexGames.init();
        if (info.isAvailable) {
          const cloud = await yandexGames.loadCloudData();
          if (cloud) syncCloudDataWithLocal(cloud);
        }
        if (!getStoredLanguage() && !cancelled) {
          const browserRu = navigator.language?.toLowerCase().startsWith('ru');
          setLang(info.isAvailable ? info.lang : browserRu ? 'ru' : 'en');
        }
      }
      if (cancelled) return;
      refreshFromStorage();
      yandexGames.notifyReady();
      youtubePlayables.gameReady();
    })();

    const offAudio = youtubePlayables.onAudioEnabledChange((enabled) => soundManager.setPausedOrMuted(!enabled));
    const offPause = youtubePlayables.onPause(() => {
      if (screenRef.current === 'PLAYING') {
        engineRef.current?.pause();
        setScreen('PAUSED');
      }
      soundManager.setPausedOrMuted(true);
    });
    const offResume = youtubePlayables.onResume(() => {
      soundManager.setPausedOrMuted(!youtubePlayables.isAudioEnabled());
    });

    return () => {
      cancelled = true;
      offAudio();
      offPause();
      offResume();
    };
  }, [refreshFromStorage, setScreen]);

  // Pause automatically when the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && screenRef.current === 'PLAYING') {
        engineRef.current?.pause();
        setScreen('PAUSED');
        yandexGames.gameplayStop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setScreen]);

  // --- Game flow ---
  const startRun = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    soundManager.init();
    soundManager.playClick();
    haptics.click();
    setSummary(null);
    setPowerUps([]);
    setMilestone(null);
    setScreen('PLAYING');
    // Let the canvas become visible before measuring it.
    requestAnimationFrame(() => {
      engine.stop();
      engine.resize();
      engine.setSkin(getStoredSelectedSkin());
      engine.start();
      yandexGames.gameplayStart();
    });
  }, [setScreen]);

  const pauseRun = useCallback(() => {
    if (screenRef.current !== 'PLAYING') return;
    engineRef.current?.pause();
    soundManager.playClick();
    setScreen('PAUSED');
    yandexGames.gameplayStop();
  }, [setScreen]);

  const resumeRun = useCallback(() => {
    soundManager.init();
    soundManager.playClick();
    setScreen('PLAYING');
    engineRef.current?.resume();
    yandexGames.gameplayStart();
  }, [setScreen]);

  const goTo = useCallback((next: ScreenState) => {
    soundManager.init();
    soundManager.playClick();
    haptics.click();
    if (next === 'HOME') {
      engineRef.current?.stop();
      yandexGames.gameplayStop();
    }
    setConfirmReset(false);
    setScreen(next);
  }, [setScreen]);

  // --- Controls: keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;
      const current = screenRef.current;
      if (current === 'PLAYING') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { engine.moveLeft(); e.preventDefault(); }
        else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { engine.moveRight(); e.preventDefault(); }
        else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') pauseRun();
      } else if (current === 'PAUSED' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        resumeRun();
      } else if ((current === 'HOME' || current === 'GAMEOVER') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pauseRun, resumeRun, startRun]);

  // --- Controls: touch / pointer on the canvas ---
  const onPointerDown = (e: React.PointerEvent) => {
    touchStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const engine = engineRef.current;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!engine || !start || screenRef.current !== 'PLAYING') return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) engine.moveLeft(); else engine.moveRight();
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const lane = Math.floor(((e.clientX - rect.left) / rect.width) * 3);
    engine.setLane(lane);
  };

  // --- Shop / achievements / daily / settings actions ---
  const handleSkin = (id: SkinId) => {
    soundManager.init();
    const skin = SKINS[id];
    if (unlockedSkins.includes(id)) {
      saveStoredSelectedSkin(id);
      setSelectedSkin(id);
      soundManager.playClick();
      haptics.click();
      pushCloudSave();
      return;
    }
    if (coins < skin.price) {
      haptics.medium();
      showToast(`🪙 ${skin.price - coins}`);
      return;
    }
    const remaining = addStoredCoins(-skin.price);
    const unlocked = unlockStoredSkin(id);
    saveStoredSelectedSkin(id);
    const newAchievements = computeAchievements(getStoredStats(), 0, unlocked.length);
    saveStoredAchievements(newAchievements);
    setCoins(remaining);
    setUnlockedSkins([...unlocked]);
    setSelectedSkin(id);
    setAchievements(newAchievements);
    soundManager.playPowerup();
    haptics.success();
    pushCloudSave();
  };

  const handleClaimAchievement = (a: Achievement) => {
    if (!a.unlocked || a.claimed) return;
    const updated = achievements.map((x) => (x.id === a.id ? { ...x, claimed: true } : x));
    saveStoredAchievements(updated);
    setAchievements(updated);
    setCoins(addStoredCoins(a.rewardCoins));
    soundManager.init();
    soundManager.playCoin();
    haptics.coin();
    pushCloudSave();
  };

  const handleClaimDaily = () => {
    if (dailyClaimed) return;
    if (claimDailyReward()) {
      setDailyClaimed(true);
      setCoins(getStoredCoins());
      soundManager.init();
      soundManager.playStar();
      haptics.success();
      pushCloudSave();
    }
  };

  const updateSettings = (patch: Partial<GameSettings>) => {
    const next = { ...settings, ...patch };
    saveStoredSettings(next);
    setSettings(next);
    soundManager.init();
    soundManager.playClick();
    pushCloudSave();
  };

  const changeLanguage = (next: Language) => {
    saveStoredLanguage(next);
    yandexGames.setLanguage(next);
    setLang(next);
    soundManager.playClick();
  };

  const handleReset = () => {
    resetAllGameData();
    refreshFromStorage();
    setConfirmReset(false);
    haptics.medium();
    pushCloudSave();
  };

  const handleRewardedAd = () => {
    if (adState !== 'idle') return;
    setAdState('loading');
    soundManager.setPausedOrMuted(true);
    yandexGames.showRewardedVideo({
      onRewarded: () => {
        setCoins(addStoredCoins(100));
        setAdState('done');
        pushCloudSave();
      },
      onClose: () => {
        soundManager.setPausedOrMuted(false);
        setAdState((s) => (s === 'loading' ? 'idle' : s));
      },
    });
  };

  const skinList = useMemo(() => Object.values(SKINS), []);
  const unclaimedCount = achievements.filter((a) => a.unlocked && !a.claimed).length;
  const inRun = screen === 'PLAYING' || screen === 'PAUSED' || screen === 'GAMEOVER';
  const skin = SKINS[selectedSkin] ?? SKINS.original_blue;

  return (
    <div className="fixed inset-0 flex justify-center bg-[#F3E6D3]">
      <div className="relative h-full w-full max-w-[520px] overflow-hidden bg-[#FFF6E9] shadow-2xl">
        {/* Game canvas — always mounted so the engine can measure it */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ visibility: inRun ? 'visible' : 'hidden' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        />

        {/* HUD */}
        {screen === 'PLAYING' && (
          <Hud
            t={t}
            score={score}
            coins={runCoins}
            combo={combo}
            powerUps={powerUps}
            theme={theme}
            milestone={milestone}
            onPause={pauseRun}
          />
        )}

        {screen === 'HOME' && (
          <HomeScreen
            t={t}
            coins={coins}
            highScore={highScore}
            skin={skin}
            dailyClaimed={dailyClaimed}
            unclaimed={unclaimedCount}
            onPlay={startRun}
            onNav={goTo}
          />
        )}

        {screen === 'PAUSED' && (
          <Modal>
            <h2 className="font-display text-3xl font-bold text-[#343047]">{t.pausedTitle}</h2>
            <p className="mt-1 text-sm text-[#7A7590]">{t.pausedSubtitle}</p>
            <div className="mt-5 flex flex-col gap-3">
              <PrimaryButton onClick={resumeRun}>▶ {t.resumeGame}</PrimaryButton>
              <SecondaryButton onClick={startRun}>↻ {t.restartRun}</SecondaryButton>
              <SecondaryButton onClick={() => goTo('HOME')}>⌂ {t.mainMenu}</SecondaryButton>
            </div>
          </Modal>
        )}

        {screen === 'GAMEOVER' && summary && (
          <Modal>
            <div className="text-4xl">😵</div>
            <h2 className="font-display text-3xl font-bold text-[#FF4D65]">{t.gameOverTitle}</h2>
            <p className="text-sm text-[#7A7590]">{t.touchedRed}</p>
            {summary.isNewHighScore && (
              <div className="mt-3 rounded-2xl bg-[#FFF1C2] px-3 py-2 text-sm font-bold text-[#B07A00] animate-pulse">
                {t.newRecord}
              </div>
            )}
            <div className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#9A94AE]">{t.finalScore}</div>
            <div className="font-display text-6xl font-bold text-[#343047]">{summary.score}</div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Stat label={t.coins} value={`🪙 ${summary.coinsEarned}`} />
              <Stat label="★" value={`⭐ ${summary.starsCollected}`} />
              <Stat label={t.survived} value={formatTime(summary.survivalTime)} />
            </div>
            <div className="mt-2 text-xs text-[#9A94AE]">{t.personalBest}: {highScore}</div>
            <div className="mt-5 flex flex-col gap-3">
              <PrimaryButton onClick={startRun}>{t.playAgain}</PrimaryButton>
              {!isPlayables && (
                <SecondaryButton onClick={handleRewardedAd} disabled={adState !== 'idle'}>
                  {adState === 'done' ? t.adWatchedSuccess : adState === 'loading' ? '…' : `🎬 ${t.watchAdCoins}`}
                </SecondaryButton>
              )}
              <div className="grid grid-cols-2 gap-3">
                <SecondaryButton onClick={() => goTo('SHOP')}>🎨 {t.shopSkins}</SecondaryButton>
                <SecondaryButton onClick={() => goTo('HOME')}>⌂ {t.home}</SecondaryButton>
              </div>
            </div>
          </Modal>
        )}

        {screen === 'SHOP' && (
          <Panel title={t.shopTitle} subtitle={t.shopSubtitle} coins={coins} onBack={() => goTo('HOME')}>
            <div className="grid grid-cols-2 gap-3">
              {skinList.map((s) => {
                const owned = unlockedSkins.includes(s.id);
                const equipped = selectedSkin === s.id;
                const affordable = coins >= s.price;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSkin(s.id)}
                    className={`flex flex-col items-center rounded-3xl border-2 bg-white p-3 pt-6 text-center transition active:scale-95 ${
                      equipped ? 'border-[#4CA4FF] shadow-[0_0_0_4px_rgba(76,164,255,0.15)]' : 'border-transparent shadow-sm'
                    }`}
                  >
                    <SkinAvatar skin={s} size={60} className={owned ? '' : 'opacity-60 grayscale-[40%]'} />
                    <div className="mt-2 font-display text-sm font-bold text-[#343047]">{s.name}</div>
                    <div className="line-clamp-2 min-h-[2rem] text-[11px] leading-tight text-[#9A94AE]">{s.tagline}</div>
                    <div
                      className={`mt-2 w-full rounded-full py-1.5 text-xs font-bold ${
                        equipped
                          ? 'bg-[#4CA4FF] text-white'
                          : owned
                            ? 'bg-[#EAF5FF] text-[#4CA4FF]'
                            : affordable
                              ? 'bg-[#FFD65A] text-[#6B4A00]'
                              : 'bg-[#F1ECF4] text-[#9A94AE]'
                      }`}
                    >
                      {equipped ? `✓ ${t.equipped}` : owned ? t.equip : `🪙 ${s.price}`}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-center text-xs text-[#9A94AE]">{t.shopHint}</p>
          </Panel>
        )}

        {screen === 'ACHIEVEMENTS' && (
          <Panel title={t.statsTitle} subtitle={t.statsSubtitle} coins={coins} onBack={() => goTo('HOME')}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[#9A94AE]">{t.careerRecords}</h3>
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t.personalBest} value={String(Math.max(highScore, stats.highScore))} />
              <Stat label={t.runsPlayed} value={String(stats.totalGames)} />
              <Stat label={t.bestTime} value={formatTime(stats.longestSurvivalTime)} />
              <Stat label={t.starsGot} value={`⭐ ${stats.totalStars}`} />
              <Stat label={t.coinsEarned} value={`🪙 ${stats.totalCoins}`} />
              <Stat label={t.hazardsDodged} value={String(stats.totalObstaclesDodged)} />
            </div>
            <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-[#9A94AE]">{t.milestonesRewards}</h3>
            <div className="flex flex-col gap-2">
              {achievements.map((a) => {
                const pct = Math.min(100, Math.round((a.progress / a.target) * 100));
                return (
                  <div key={a.id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ${a.claimed ? 'opacity-60' : ''}`}>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF6E9] text-2xl">{a.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-sm font-bold text-[#343047]">{a.title}</div>
                      <div className="truncate text-[11px] text-[#9A94AE]">{a.description}</div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F1ECF4]">
                        <div className="h-full rounded-full bg-[#8EDB9A]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <button
                      onClick={() => handleClaimAchievement(a)}
                      disabled={!a.unlocked || a.claimed}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                        a.claimed
                          ? 'bg-[#F1ECF4] text-[#9A94AE]'
                          : a.unlocked
                            ? 'bg-[#FFD65A] text-[#6B4A00] animate-pulse'
                            : 'bg-[#F1ECF4] text-[#9A94AE]'
                      }`}
                    >
                      {a.claimed ? '✓' : `🪙 ${a.rewardCoins}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {screen === 'DAILY' && (
          <Panel title={t.dailyTitle} subtitle={dailyClaimed ? t.dailySubtitleClaimed : t.dailySubtitleAvailable} coins={coins} onBack={() => goTo('HOME')}>
            <div className="flex flex-col items-center py-8">
              <button
                onClick={handleClaimDaily}
                disabled={dailyClaimed}
                className={`text-[120px] leading-none transition active:scale-90 ${dailyClaimed ? 'opacity-50' : 'animate-cute-bounce'}`}
                aria-label={t.claimReward}
              >
                {dailyClaimed ? '📭' : '🎁'}
              </button>
              <div className="mt-8 w-full max-w-xs">
                <PrimaryButton onClick={handleClaimDaily} disabled={dailyClaimed}>
                  {dailyClaimed ? `✓ ${t.claimedToday}` : `🪙 ${t.claimReward}`}
                </PrimaryButton>
              </div>
            </div>
          </Panel>
        )}

        {screen === 'SETTINGS' && (
          <Panel title={t.settings} coins={coins} onBack={() => goTo('HOME')}>
            <div className="flex flex-col gap-2">
              <Toggle label={t.soundEffects} subtitle={t.soundSubtitle} value={settings.soundEnabled} onChange={(v) => updateSettings({ soundEnabled: v })} />
              <Toggle label={t.bgmMelody} subtitle={t.bgmSubtitle} value={settings.musicEnabled} onChange={(v) => updateSettings({ musicEnabled: v })} />
              <Toggle label={t.vibrationHaptics} subtitle={t.vibrationSubtitle} value={settings.vibrationEnabled} onChange={(v) => updateSettings({ vibrationEnabled: v })} />
              <Toggle label={t.reducedMotion} subtitle={t.motionSubtitle} value={settings.reducedMotion} onChange={(v) => updateSettings({ reducedMotion: v })} />

              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-[#343047]">{t.masterVolume}</span>
                  <span className="text-sm font-semibold text-[#9A94AE]">{Math.round(settings.masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.masterVolume}
                  onChange={(e) => {
                    const next = { ...settings, masterVolume: Number(e.target.value) };
                    saveStoredSettings(next);
                    setSettings(next);
                  }}
                  className="mt-2 w-full accent-[#4CA4FF]"
                />
              </div>

              {!isPlayables && (
                <button
                  onClick={() => void yandexGames.toggleFullscreen()}
                  className="flex items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.98]"
                >
                  <span>
                    <span className="block font-display font-bold text-[#343047]">{t.fullscreenToggle}</span>
                    <span className="block text-xs text-[#9A94AE]">{t.fullscreenSubtitle}</span>
                  </span>
                  <span className="text-xl">⛶</span>
                </button>
              )}

              <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
                <span>
                  <span className="block font-display font-bold text-[#343047]">{t.languageSetting}</span>
                  <span className="block text-xs text-[#9A94AE]">{t.languageSubtitle}</span>
                </span>
                <div className="flex rounded-full bg-[#F1ECF4] p-1">
                  {(['en', 'ru'] as Language[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => changeLanguage(l)}
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-white text-[#343047] shadow' : 'text-[#9A94AE]'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {confirmReset ? (
                <div className="rounded-2xl border-2 border-[#FFB3BE] bg-[#FFF0F2] p-4 text-center">
                  <div className="font-display font-bold text-[#FF4D65]">{t.resetConfirmTitle}</div>
                  <div className="mt-1 text-xs text-[#7A7590]">{t.resetConfirmSubtitle}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={handleReset} className="rounded-full bg-[#FF4D65] py-2 text-sm font-bold text-white active:scale-95">{t.yesReset}</button>
                    <button onClick={() => setConfirmReset(false)} className="rounded-full bg-white py-2 text-sm font-bold text-[#343047] active:scale-95">{t.cancel}</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)} className="mt-2 rounded-2xl py-3 text-sm font-bold text-[#FF4D65] active:scale-95">
                  {t.resetProgress}
                </button>
              )}
            </div>
          </Panel>
        )}

        {toast && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-[#343047] px-4 py-2 text-sm font-bold text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function HomeScreen(props: {
  t: Strings;
  coins: number;
  highScore: number;
  skin: (typeof SKINS)[SkinId];
  dailyClaimed: boolean;
  unclaimed: number;
  onPlay: () => void;
  onNav: (s: ScreenState) => void;
}) {
  const { t, coins, highScore, skin, dailyClaimed, unclaimed, onPlay, onNav } = props;
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto no-scrollbar bg-gradient-to-b from-[#FFF9F0] via-[#FFF6E9] to-[#FFE9D2] px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {/* Decorative floating hazards */}
      <span className="pointer-events-none absolute left-6 top-28 h-8 w-8 rotate-12 rounded-lg bg-[#FF4D65]/80 animate-float-gentle" />
      <span className="pointer-events-none absolute right-8 top-44 h-6 w-6 rounded-full bg-[#FF4D65]/70 animate-float-gentle [animation-delay:1s]" />
      <span className="pointer-events-none absolute bottom-48 left-10 h-5 w-5 -rotate-12 rounded-md bg-[#FF4D65]/60 animate-float-gentle [animation-delay:2s]" />

      <div className="flex items-center justify-between">
        <CoinPill coins={coins} />
        <button onClick={() => onNav('SETTINGS')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-sm active:scale-90" aria-label={t.settings}>
          ⚙️
        </button>
      </div>

      <div className="mt-6 text-center">
        <div className="font-display text-4xl font-bold leading-none text-[#343047]">{t.gameTitleTop}</div>
        <div className="font-display text-6xl font-bold leading-none text-[#FF4D65] drop-shadow-[0_4px_0_rgba(255,77,101,0.25)]">{t.gameTitleBottom}</div>
        <div className="mx-auto mt-3 inline-block rounded-full bg-[#FFE1E6] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#FF4D65] animate-pulse-glow">
          ⚠ {t.avoidRedBadge}
        </div>
        <p className="mx-auto mt-3 max-w-xs text-sm text-[#7A7590]">{t.homeSubtitle}</p>
      </div>

      <div className="relative my-auto flex flex-col items-center py-6">
        <button onClick={onPlay} className="relative animate-cute-bounce active:scale-90" aria-label={t.playNow}>
          <SkinAvatar skin={skin} size={110} />
        </button>
        <span className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#9A94AE] shadow-sm">{t.tapToPlay}</span>
        <div className="mt-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-[#9A94AE]">{t.personalBest}</div>
          <div className="font-display text-3xl font-bold text-[#343047]">🏆 {highScore}</div>
        </div>
      </div>

      <PrimaryButton onClick={onPlay} big>▶ {t.playNow}</PrimaryButton>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MenuTile icon="🎨" label={t.characterShop} onClick={() => onNav('SHOP')} />
        <MenuTile icon="🏆" label={t.achievements} onClick={() => onNav('ACHIEVEMENTS')} badge={unclaimed} />
        <MenuTile icon="🎁" label={t.dailyGift} onClick={() => onNav('DAILY')} badge={dailyClaimed ? 0 : 1} />
      </div>

      <div className="mt-4 flex justify-center gap-4 text-[11px] font-semibold text-[#B5AEC8]">
        <span>{t.swipeLeft}</span>
        <span>{t.tapLanes}</span>
        <span>{t.swipeRight}</span>
      </div>
    </div>
  );
}

function Hud(props: {
  t: Strings;
  score: number;
  coins: number;
  combo: ComboState;
  powerUps: ActivePowerUp[];
  theme: PastelTheme;
  milestone: string | null;
  onPause: () => void;
}) {
  const { t, score, coins, combo, powerUps, theme, milestone, onPause } = props;
  const comboPct = combo.maxTimer > 0 ? Math.max(0, Math.min(100, (combo.timer / combo.maxTimer) * 100)) : 0;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-start justify-between">
        <div className="rounded-2xl bg-white/85 px-3 py-1.5 shadow-sm backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#9A94AE]">{t.score}</div>
          <div className="font-display text-3xl font-bold leading-none text-[#343047] tabular-nums">{score}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-white/85 px-3 py-1.5 text-sm font-bold text-[#B07A00] shadow-sm backdrop-blur tabular-nums">🪙 {coins}</div>
          <button
            onClick={onPause}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-lg font-bold text-[#343047] shadow-sm backdrop-blur active:scale-90"
            aria-label="Pause"
          >
            ❚❚
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: theme.accentHex }}>
          {theme.badgeEmoji} {theme.name}
        </span>
        {combo.count > 1 && (
          <div className="flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-0.5 shadow-sm">
            <span className="text-[11px] font-bold text-[#FF8E3C]">{t.combo} ×{combo.multiplier.toFixed(1)}</span>
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[#F1ECF4]">
              <span className="block h-full bg-[#FF8E3C] transition-[width] duration-200" style={{ width: `${comboPct}%` }} />
            </span>
          </div>
        )}
      </div>

      {powerUps.length > 0 && (
        <div className="mt-2 flex gap-2">
          {powerUps.map((p) => (
            <div key={p.type} className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/90 text-sm shadow-sm">
              <span className="absolute bottom-0 left-0 right-0 bg-[#8EDB9A]/40" style={{ height: `${(p.duration / p.maxDuration) * 100}%` }} />
              <span className="relative">{POWERUP_ICONS[p.type]}</span>
            </div>
          ))}
        </div>
      )}

      {milestone && (
        <div className="mt-6 text-center font-display text-xl font-bold text-[#FFAE33] drop-shadow-[0_2px_0_rgba(255,255,255,0.9)]">{milestone}</div>
      )}
    </div>
  );
}

function Panel(props: { title: string; subtitle?: string; coins: number; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#FFF6E9]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={props.onBack} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold text-[#343047] shadow-sm active:scale-90" aria-label="Back">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl font-bold text-[#343047]">{props.title}</h2>
          {props.subtitle && <p className="text-xs leading-snug text-[#9A94AE]">{props.subtitle}</p>}
        </div>
        <CoinPill coins={props.coins} />
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">{props.children}</div>
    </div>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#343047]/35 p-5 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-[2rem] bg-[#FFF9F0] p-6 text-center shadow-2xl">{children}</div>
    </div>
  );
}

function PrimaryButton(props: { onClick: () => void; children: React.ReactNode; disabled?: boolean; big?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`w-full rounded-full bg-[#FF4D65] font-display font-bold tracking-wide text-white shadow-[0_6px_0_#D93650] transition active:translate-y-1 active:shadow-[0_2px_0_#D93650] disabled:bg-[#C9C3D6] disabled:shadow-[0_6px_0_#A9A3B8] ${
        props.big ? 'py-4 text-2xl' : 'py-3 text-lg'
      }`}
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className="w-full rounded-full bg-white py-2.5 text-sm font-bold text-[#343047] shadow-sm transition active:scale-95 disabled:opacity-60"
    >
      {props.children}
    </button>
  );
}

function MenuTile(props: { icon: string; label: string; onClick: () => void; badge?: number }) {
  return (
    <button onClick={props.onClick} className="relative flex flex-col items-center gap-1 rounded-2xl bg-white px-2 py-3 shadow-sm transition active:scale-95">
      <span className="text-2xl">{props.icon}</span>
      <span className="text-[11px] font-bold leading-tight text-[#343047]">{props.label}</span>
      {!!props.badge && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF4D65] px-1 text-[10px] font-bold text-white">
          {props.badge}
        </span>
      )}
    </button>
  );
}

function CoinPill({ coins }: { coins: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-2 text-sm font-bold text-[#B07A00] shadow-sm tabular-nums">🪙 {coins}</div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-2 shadow-sm">
      <div className="font-display text-base font-bold text-[#343047]">{value}</div>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-[#9A94AE]">{label}</div>
    </div>
  );
}

function Toggle(props: { label: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.value)}
      className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm active:scale-[0.98]"
      role="switch"
      aria-checked={props.value}
    >
      <span>
        <span className="block font-display font-bold text-[#343047]">{props.label}</span>
        <span className="block text-xs text-[#9A94AE]">{props.subtitle}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${props.value ? 'bg-[#8EDB9A]' : 'bg-[#E2DCE8]'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${props.value ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}
