import { soundManager } from '../audio/soundManager';
import { haptics } from '../utils/haptics';
import { SKINS } from '../data/skins';
import { getThemeProgression, lerpColor, PASTEL_THEMES, PastelTheme, rgbToString } from '../data/themes';
import { ActivePowerUp, ComboState, PowerUpType, RunSummary, SkinId } from '../types/game';

interface Point {
  x: number;
  y: number;
}

interface Obstacle {
  id: number;
  type: 'RED_BLOCK' | 'RED_SPIKE' | 'MOVING_BARRIER' | 'ROTATING_BLADE' | 'SAFE_PASSAGE';
  lane: number; // 0, 1, 2
  x: number;
  y: number;
  width: number;
  height: number;
  speedMultiplier: number;
  rotation: number;
  rotSpeed: number;
  moveRange?: { minX: number; maxX: number; dir: number; speed: number };
  dodged: boolean;
}

interface Collectible {
  id: number;
  type: 'STAR' | 'COIN' | 'POWERUP_SHIELD' | 'POWERUP_MAGNET' | 'POWERUP_SLOWMO' | 'POWERUP_DOUBLE';
  powerUpType?: PowerUpType;
  lane: number;
  x: number;
  y: number;
  radius: number;
  rotation: number;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  shape?: 'circle' | 'star' | 'shard';
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isRunning = false;
  private isPaused = false;
  private animFrameId: number | null = null;
  private lastTime = 0;
  private boundLoop: (timestamp: number) => void;

  // Viewport & Scale
  private logicalWidth = 360;
  private logicalHeight = 640;
  private dpr = 1;
  private laneCenters: number[] = [60, 180, 300];
  private laneWidth = 120;

  // Cached graphics objects to prevent GC spikes
  private cachedBgGradient: CanvasGradient | null = null;
  private cachedBgHeight = 0;
  private cachedThemeKey = '';

  // Player state
  private player = {
    lane: 1, // 0: Left, 1: Center, 2: Right
    x: 180,
    y: 520,
    targetX: 180,
    radius: 24,
    squashX: 1,
    squashY: 1,
    eyeBlinkTimer: 2.5,
    isBlinking: false,
    happyTimer: 0,
    shockTimer: 0,
    invincibleTimer: 0,
    animAngle: 0,
  };

  private selectedSkinId: SkinId = 'original_blue';

  // Game metrics
  private score = 0;
  private coinsCollectedThisRun = 0;
  private starsCollectedThisRun = 0;
  private obstaclesDodgedThisRun = 0;
  private survivalTime = 0; // seconds
  private distanceAccumulator = 0;
  private milestonesTriggered = new Set<number>();
  private lastScoreBroadcastTime = 0;
  private lastBroadcastScore = -1;

  // Speed and spawning
  private baseSpeed = 310; // px/sec
  private currentSpeed = 310;
  private spawnTimer = 0;
  private nextSpawnInterval = 1.6;

  // Entities
  private obstacles: Obstacle[] = [];
  private collectibles: Collectible[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  // Active Power-ups
  private activePowerUps: Map<PowerUpType, { duration: number; maxDuration: number }> = new Map();

  // Screen Shake
  private shakeMagnitude = 0;
  private shakeAngle = 0;
  private reducedMotion = false;

  // Theme Progression
  private currentThemeIndex = 0;

  // Combo Meter System
  private comboCount = 0;
  private comboTimer = 0;
  private maxComboTimer = 2.4;
  private comboMultiplier = 1.0;
  private lastComboBroadcastTime = 0;

  // Callbacks
  public onScoreUpdate?: (score: number) => void;
  public onCoinsUpdate?: (coins: number) => void;
  public onPowerUpChange?: (powerUps: ActivePowerUp[]) => void;
  public onMilestone?: (milestoneText: string) => void;
  public onThemeChange?: (theme: PastelTheme) => void;
  public onComboUpdate?: (combo: ComboState) => void;
  public onGameOver?: (summary: RunSummary) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;

    // Cache bound loop once to eliminate per-frame GC allocations
    this.boundLoop = this.loop.bind(this);

    this.resize();
  }

  public setSkin(skinId: SkinId) {
    this.selectedSkinId = skinId;
  }

  public setReducedMotion(enabled: boolean) {
    this.reducedMotion = enabled;
  }

  public resize() {
    // Intelligently cap DPR to prevent GPU memory saturation on high-density mobile screens
    const isTouch = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    const maxDpr = isTouch ? 1.75 : 2.0;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width) || 360;
    const h = Math.round(rect.height) || 640;

    this.logicalWidth = w;
    this.logicalHeight = h;

    const newCanvasW = Math.floor(w * this.dpr);
    const newCanvasH = Math.floor(h * this.dpr);

    // Only resize canvas element buffer if actual resolution changed
    if (this.canvas.width !== newCanvasW || this.canvas.height !== newCanvasH) {
      this.canvas.width = newCanvasW;
      this.canvas.height = newCanvasH;
      this.cachedBgGradient = null; // Invalidate background gradient cache
    }

    this.ctx.resetTransform?.();
    this.ctx.scale(this.dpr, this.dpr);

    // Dynamic lane calculation
    this.laneWidth = this.logicalWidth / 3;
    this.laneCenters = [
      this.laneWidth * 0.5,
      this.laneWidth * 1.5,
      this.laneWidth * 2.5,
    ];

    // Responsive player radius & vertical placement adapted to viewport height
    this.player.radius = Math.max(18, Math.min(28, Math.min(this.laneWidth * 0.22, this.logicalHeight * 0.046)));
    const bottomMargin = Math.max(75, Math.min(115, this.logicalHeight * 0.17));
    this.player.y = this.logicalHeight - bottomMargin;
    this.player.targetX = this.laneCenters[this.player.lane];
    this.player.x = this.player.targetX;
  }

  public start() {
    this.reset();
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.animFrameId = requestAnimationFrame(this.boundLoop);
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.lastTime = performance.now();
      this.animFrameId = requestAnimationFrame(this.boundLoop);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public reset() {
    this.score = 0;
    this.coinsCollectedThisRun = 0;
    this.starsCollectedThisRun = 0;
    this.obstaclesDodgedThisRun = 0;
    this.survivalTime = 0;
    this.distanceAccumulator = 0;
    this.currentSpeed = this.baseSpeed;
    this.spawnTimer = 0.6; // Quick initial spawn
    this.nextSpawnInterval = 1.75;
    this.milestonesTriggered.clear();

    this.player.lane = 1;
    this.player.targetX = this.laneCenters[1];
    this.player.x = this.player.targetX;
    this.player.squashX = 1;
    this.player.squashY = 1;
    this.player.eyeBlinkTimer = 2;
    this.player.isBlinking = false;
    this.player.happyTimer = 0;
    this.player.shockTimer = 0;
    this.player.invincibleTimer = 0;

    this.obstacles = [];
    this.collectibles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.activePowerUps.clear();
    this.currentThemeIndex = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1.0;
    this.broadcastCombo();
    this.onThemeChange?.(PASTEL_THEMES[0]);
    this.onScoreUpdate?.(0);
    this.onCoinsUpdate?.(0);
    this.broadcastPowerUps();
  }

  // --- CONTROLS ---

  public moveLeft() {
    if (!this.isRunning || this.isPaused || this.player.shockTimer > 0) return;
    if (this.player.lane > 0) {
      this.player.lane--;
      this.player.targetX = this.laneCenters[this.player.lane];
      this.player.squashX = 1.35;
      this.player.squashY = 0.72;
      haptics.light();
      soundManager.playMove();
      this.spawnMoveDust(this.player.x + 10, this.player.y);
    }
  }

  public moveRight() {
    if (!this.isRunning || this.isPaused || this.player.shockTimer > 0) return;
    if (this.player.lane < 2) {
      this.player.lane++;
      this.player.targetX = this.laneCenters[this.player.lane];
      this.player.squashX = 1.35;
      this.player.squashY = 0.72;
      haptics.light();
      soundManager.playMove();
      this.spawnMoveDust(this.player.x - 10, this.player.y);
    }
  }

  public setLane(laneIndex: number) {
    if (!this.isRunning || this.isPaused || this.player.shockTimer > 0) return;
    const clamped = Math.max(0, Math.min(2, laneIndex));
    if (clamped !== this.player.lane) {
      this.player.lane = clamped;
      this.player.targetX = this.laneCenters[clamped];
      this.player.squashX = 1.35;
      this.player.squashY = 0.72;
      haptics.light();
      soundManager.playMove();
      this.spawnMoveDust(this.player.x, this.player.y);
    }
  }

  public triggerScreenShake(amount = 14) {
    if (this.reducedMotion) return;
    this.shakeMagnitude = amount;
    this.shakeAngle = Math.random() * Math.PI * 2;
  }

  // --- MAIN LOOP ---

  private loop(timestamp: number) {
    if (!this.isRunning) return;

    // Cap delta time to 50ms to prevent physics spikes or tunneling on frame drops
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (!this.isPaused) {
      this.update(dt);
    }

    this.render();

    if (this.isRunning && !this.isPaused) {
      this.animFrameId = requestAnimationFrame(this.boundLoop);
    }
  }

  private update(dt: number) {
    this.survivalTime += dt;

    // Difficulty ramp:
    // Gradually increase speed and frequency of red obstacles as the player's current score increases
    const scoreDiff = this.getScoreDifficulty();
    let targetSpeed = this.baseSpeed + scoreDiff * 340;

    // Endless scaling for elite runs beyond 2000 score
    if (this.score > 2000) {
      targetSpeed += Math.min(80, ((this.score - 2000) / 1000) * 30);
    }

    // Slow-mo powerup modifies hazard & scrolling speed
    if (this.activePowerUps.has('SLOWMO')) {
      targetSpeed *= 0.52;
    }
    this.currentSpeed = targetSpeed;

    // Score accumulation through survival distance
    const isDouble = this.activePowerUps.has('DOUBLE');
    const scoreRate = (isDouble ? 2 : 1) * this.comboMultiplier * 12; // 12 points per second survival
    this.distanceAccumulator += dt * scoreRate;
    if (this.distanceAccumulator >= 1) {
      const added = Math.floor(this.distanceAccumulator);
      this.distanceAccumulator -= added;
      this.score += added;

      // Throttle score dispatch to React (max 10-12 times/sec) to avoid React DOM churn
      const now = performance.now();
      if (now - this.lastScoreBroadcastTime > 85) {
        this.lastScoreBroadcastTime = now;
        this.lastBroadcastScore = this.score;
        this.onScoreUpdate?.(this.score);
      }
      this.checkMilestones();
      this.checkThemeProgression();
    }

    // Combo timer decay
    if (this.comboCount > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.resetCombo();
      } else {
        const now = performance.now();
        // Throttle combo gauge timer broadcast to React (5 times/sec)
        if (now - this.lastComboBroadcastTime > 180) {
          this.broadcastCombo();
        }
      }
    }

    // Power-up durations update
    let powerUpsChanged = false;
    for (const [type, state] of this.activePowerUps.entries()) {
      state.duration -= dt;
      if (state.duration <= 0) {
        this.activePowerUps.delete(type);
        powerUpsChanged = true;
      }
    }
    if (powerUpsChanged) {
      this.broadcastPowerUps();
    }

    // Player spring physics & squash/stretch recovery
    this.player.x += (this.player.targetX - this.player.x) * (1 - Math.exp(-22 * dt));
    this.player.squashX += (1 - this.player.squashX) * (1 - Math.exp(-14 * dt));
    this.player.squashY += (1 - this.player.squashY) * (1 - Math.exp(-14 * dt));
    this.player.animAngle += dt * 4;

    // Blinking
    this.player.eyeBlinkTimer -= dt;
    if (this.player.eyeBlinkTimer <= 0) {
      this.player.isBlinking = true;
      if (this.player.eyeBlinkTimer <= -0.15) {
        this.player.isBlinking = false;
        this.player.eyeBlinkTimer = 2.5 + Math.random() * 2.5;
      }
    }

    // Happy reaction timer
    if (this.player.happyTimer > 0) {
      this.player.happyTimer -= dt;
    }

    // Invincible post-shield-break flash
    if (this.player.invincibleTimer > 0) {
      this.player.invincibleTimer -= dt;
    }

    // Screen shake decay
    if (this.shakeMagnitude > 0) {
      this.shakeMagnitude *= Math.exp(-10 * dt);
      if (this.shakeMagnitude < 0.2) this.shakeMagnitude = 0;
    }

    // Spawning logic: Obstacle frequency increases dynamically as player's score rises
    // (Interval between waves scales down from ~1.75s at start to ~0.65s at high score)
    const baseInterval = 1.75;
    const minInterval = 0.65;
    this.nextSpawnInterval = Math.max(minInterval, baseInterval - scoreDiff * 1.10);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnPattern();
      this.spawnTimer = this.nextSpawnInterval;
    }

    // Update Obstacles
    const scrollDelta = this.currentSpeed * dt;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.y += scrollDelta * obs.speedMultiplier;
      obs.rotation += obs.rotSpeed * dt;

      // Moving barrier patrol
      if (obs.moveRange) {
        obs.x += obs.moveRange.dir * obs.moveRange.speed * dt;
        if (obs.x >= obs.moveRange.maxX) {
          obs.x = obs.moveRange.maxX;
          obs.moveRange.dir = -1;
        } else if (obs.x <= obs.moveRange.minX) {
          obs.x = obs.moveRange.minX;
          obs.moveRange.dir = 1;
        }
      }

      // Check dodged
      if (!obs.dodged && obs.y > this.player.y + this.player.radius) {
        obs.dodged = true;
        this.obstaclesDodgedThisRun++;
        this.registerComboEvent('dodge');
      }

      // Check collision with player
      if (this.player.invincibleTimer <= 0 && this.checkObstacleCollision(obs)) {
        this.resetCombo();
        if (this.activePowerUps.has('SHIELD')) {
          // Shield saves the day!
          this.activePowerUps.delete('SHIELD');
          this.broadcastPowerUps();
          haptics.shieldBreak();
          soundManager.playShieldBreak();
          this.triggerScreenShake(8);
          this.player.invincibleTimer = 1.0;
          this.spawnShieldShatterParticles(this.player.x, this.player.y);
          this.addFloatingText(this.player.x, this.player.y - 30, 'SHIELD SAVED!', '#72D7FF');
          // Destroy the colliding obstacle
          this.obstacles.splice(i, 1);
          continue;
        } else {
          // Collision -> Game Over
          this.handleGameOver('Collided with a Red Obstacle!');
          return;
        }
      }

      // Despawn off-screen
      if (obs.y > this.logicalHeight + 100) {
        this.obstacles.splice(i, 1);
      }
    }

    // Update Collectibles
    const hasMagnet = this.activePowerUps.has('MAGNET');
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const item = this.collectibles[i];
      item.y += scrollDelta;
      item.rotation += dt * 3;

      // Coin Magnet effect
      if (hasMagnet && item.type === 'COIN') {
        const dx = this.player.x - item.x;
        const dy = this.player.y - item.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 260) {
          const pullSpeed = 480 * dt;
          item.x += (dx / dist) * pullSpeed;
          item.y += (dy / dist) * pullSpeed;
        }
      }

      // Check collection
      const pDist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
      if (pDist < this.player.radius + item.radius) {
        this.collectItem(item);
        this.collectibles.splice(i, 1);
        continue;
      }

      // Despawn off-screen
      if (item.y > this.logicalHeight + 60) {
        this.collectibles.splice(i, 1);
      }
    }

    // Update Particles (capped at 32 active particles for smooth 60fps)
    if (this.particles.length > 32) {
      this.particles.splice(0, this.particles.length - 32);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= p.decay * dt;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update Floating Text popups
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.alpha -= dt * 1.5;
      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  // --- COLLISION DETECTION ---

  private checkObstacleCollision(obs: Obstacle): boolean {
    const px = this.player.x;
    const py = this.player.y;
    const pr = this.player.radius * 0.82; // Slight generous hitbox for player feel

    if (obs.type === 'ROTATING_BLADE') {
      const dist = Math.hypot(px - obs.x, py - obs.y);
      return dist < pr + obs.width * 0.44;
    }

    // Spikes, Blocks, Moving Barriers are Box/AABB tests with inset
    const boxLeft = obs.x - obs.width / 2;
    const boxRight = obs.x + obs.width / 2;
    const boxTop = obs.y - obs.height / 2;
    const boxBottom = obs.y + obs.height / 2;

    const closestX = Math.max(boxLeft, Math.min(px, boxRight));
    const closestY = Math.max(boxTop, Math.min(py, boxBottom));

    const distX = px - closestX;
    const distY = py - closestY;
    const distanceSquared = distX * distX + distY * distY;

    return distanceSquared < pr * pr;
  }

  // --- ITEM COLLECTION ---

  private collectItem(item: Collectible) {
    this.player.happyTimer = 0.45;
    this.player.squashX = 0.9;
    this.player.squashY = 1.15;

    const isDouble = this.activePowerUps.has('DOUBLE');

    if (item.type === 'COIN') {
      this.registerComboEvent('coin');
      const amount = isDouble ? 2 : 1;
      this.coinsCollectedThisRun += amount;
      this.onCoinsUpdate?.(this.coinsCollectedThisRun);
      haptics.coin();
      soundManager.playCoin();
      this.spawnCoinSparkles(item.x, item.y);
      this.addFloatingText(item.x, item.y, isDouble ? '+2 COINS!' : '+1 COIN', '#FFD65A');
    } else if (item.type === 'STAR') {
      this.registerComboEvent('star');
      const baseBonus = isDouble ? 40 : 20;
      const bonus = Math.round(baseBonus * this.comboMultiplier);
      this.score += bonus;
      this.starsCollectedThisRun++;
      this.onScoreUpdate?.(this.score);
      haptics.star();
      soundManager.playStar();
      this.spawnStarBurst(item.x, item.y);
      const bonusText = this.comboMultiplier > 1
        ? `+${bonus} STAR (${this.comboMultiplier.toFixed(1)}x)!`
        : (isDouble ? `+${bonus} STAR 2X!` : `+${bonus} STAR!`);
      this.addFloatingText(item.x, item.y, bonusText, '#FFD65A');
      this.checkMilestones();
      this.checkThemeProgression();
    } else if (item.powerUpType) {
      haptics.powerup();
      soundManager.playPowerup();
      this.activatePowerUp(item.powerUpType);
      this.spawnStarBurst(item.x, item.y, '#72D7FF');
    }
  }

  private activatePowerUp(type: PowerUpType) {
    let maxDur = 7;
    let label = '';
    let color = '#72D7FF';

    switch (type) {
      case 'SHIELD':
        maxDur = 14;
        label = 'SHIELD ON!';
        color = '#72D7FF';
        break;
      case 'MAGNET':
        maxDur = 8;
        label = 'COIN MAGNET!';
        color = '#B8A7FF';
        break;
      case 'SLOWMO':
        maxDur = 6;
        label = 'SLOW MOTION!';
        color = '#8DE5B5';
        break;
      case 'DOUBLE':
        maxDur = 8;
        label = 'DOUBLE SCORE 2X!';
        color = '#FFD65A';
        break;
    }

    this.activePowerUps.set(type, { duration: maxDur, maxDuration: maxDur });
    this.broadcastPowerUps();
    this.addFloatingText(this.player.x, this.player.y - 45, label, color);
  }

  private broadcastPowerUps() {
    const list: ActivePowerUp[] = [];
    for (const [type, val] of this.activePowerUps.entries()) {
      list.push({ type, duration: Math.max(0, val.duration), maxDuration: val.maxDuration });
    }
    this.onPowerUpChange?.(list);
  }

  private checkMilestones() {
    const milestones = [
      { score: 100, text: '100 POINTS - NICE START!' },
      { score: 250, text: '250 POINTS - AMAZING!' },
      { score: 500, text: '500 POINTS - SUPERSTAR!' },
      { score: 1000, text: '1000 POINTS - LEGENDARY!' },
    ];

    for (const m of milestones) {
      if (this.score >= m.score && !this.milestonesTriggered.has(m.score)) {
        this.milestonesTriggered.add(m.score);
        soundManager.playMilestone();
        this.onMilestone?.(m.text);
        this.addFloatingText(this.logicalWidth / 2, this.logicalHeight * 0.35, m.text, '#FFD65A');
      }
    }
  }

  private checkThemeProgression() {
    const { themeIndex, currentTheme } = getThemeProgression(this.score);
    if (themeIndex !== this.currentThemeIndex) {
      this.currentThemeIndex = themeIndex;
      soundManager.playStar();
      this.onThemeChange?.(currentTheme);
      this.addFloatingText(
        this.logicalWidth / 2,
        this.logicalHeight * 0.42,
        `${currentTheme.badgeEmoji} ${currentTheme.name.toUpperCase()}!`,
        currentTheme.accentHex
      );
      this.spawnThemeBurst(currentTheme.accentHex);
    }
  }

  private spawnThemeBurst(accentColor: string) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const speed = 70 + Math.random() * 90;
      this.particles.push({
        x: this.logicalWidth / 2,
        y: this.logicalHeight * 0.42,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.5 + Math.random() * 3,
        color: accentColor,
        alpha: 1,
        decay: 1.4,
        shape: 'circle',
      });
    }
  }

  // --- COMBO STREAK & MULTIPLIER SYSTEM ---

  public calculateMultiplier(count: number): number {
    if (count >= 20) return 4.0;
    if (count >= 15) return 3.0;
    if (count >= 10) return 2.5;
    if (count >= 6) return 2.0;
    if (count >= 3) return 1.5;
    return 1.0;
  }

  public registerComboEvent(source: 'dodge' | 'coin' | 'star') {
    const prevMultiplier = this.comboMultiplier;
    this.comboCount++;
    this.comboTimer = this.maxComboTimer;
    this.comboMultiplier = this.calculateMultiplier(this.comboCount);

    // Audio feedback with rising pitch
    soundManager.playCombo(this.comboCount);

    // Trigger floating text & visual burst when multiplier increases
    if (this.comboMultiplier > prevMultiplier) {
      soundManager.playStar();
      const multText = `${this.comboMultiplier.toFixed(1)}x MULTIPLIER! 🔥`;
      this.addFloatingText(this.player.x, this.player.y - 48, multText, '#FF4D65');
      this.spawnStarBurst(this.player.x, this.player.y, '#FFD65A');
      this.triggerScreenShake(5);
    } else if (this.comboCount >= 3) {
      const label = source === 'dodge' ? 'DODGE!' : source === 'star' ? 'STAR!' : 'COIN!';
      this.addFloatingText(this.player.x, this.player.y - 34, `${this.comboCount}x ${label}`, '#B8A7FF');
    }

    this.broadcastCombo();
  }

  public resetCombo() {
    if (this.comboCount > 0) {
      this.comboCount = 0;
      this.comboTimer = 0;
      this.comboMultiplier = 1.0;
      this.broadcastCombo();
    }
  }

  public broadcastCombo() {
    this.lastComboBroadcastTime = performance.now();
    this.onComboUpdate?.({
      count: this.comboCount,
      multiplier: this.comboMultiplier,
      timer: Math.max(0, this.comboTimer),
      maxTimer: this.maxComboTimer,
    });
  }

  // --- SCORE-DRIVEN DIFFICULTY SYSTEM ---

  /**
   * Calculates progressive difficulty (0.0 to 1.0+) driven primarily by the player's current score.
   * As score increases, red obstacles become faster and spawn with higher frequency.
   *
   * Key milestones:
   *  - score 0: 0.0 (relaxing intro, speed ~310 px/s, spawn interval ~1.75s)
   *  - score 150: ~0.22 (speed ~385 px/s, spawn interval ~1.50s)
   *  - score 350: ~0.42 (speed ~450 px/s, spawn interval ~1.28s)
   *  - score 700: ~0.64 (speed ~525 px/s, spawn interval ~1.05s)
   *  - score 1200: ~0.82 (speed ~590 px/s, spawn interval ~0.85s)
   *  - score 2000+: 1.0 (speed ~650 px/s, spawn interval ~0.65s)
   */
  public getScoreDifficulty(): number {
    // Primary score curve: smooth logarithmic progression from 0 to 2200 score
    const scoreFactor = Math.min(1.0, Math.log10(1 + this.score / 200) / Math.log10(1 + 2200 / 200));
    // Time secondary factor ensures prolonged runs also maintain healthy challenge
    const timeFactor = Math.min(0.85, this.survivalTime / 110);
    return Math.min(1.0, Math.max(scoreFactor, timeFactor));
  }

  public getCurrentTheme(): PastelTheme {
    return PASTEL_THEMES[this.currentThemeIndex] || PASTEL_THEMES[0];
  }

  private handleGameOver(cause: string) {
    this.isRunning = false;
    this.player.shockTimer = 1.5;
    this.triggerScreenShake(16);
    haptics.collision();
    soundManager.playHit();
    soundManager.playGameOver();
    this.spawnGameOverExplosion(this.player.x, this.player.y);

    const summary: RunSummary = {
      score: this.score,
      coinsEarned: this.coinsCollectedThisRun,
      starsCollected: this.starsCollectedThisRun,
      survivalTime: Math.floor(this.survivalTime),
      isNewHighScore: false, // will be resolved by UI against stored highscore
      cause,
    };

    // Render one final frame with the shocked expression and particles
    this.render();

    setTimeout(() => {
      this.onGameOver?.(summary);
    }, 450);
  }

  // --- SPAWNER PATTERNS (ALWAYS FAIR) ---

  private spawnPattern() {
    const spawnY = -60;
    const rand = Math.random();

    // Adjust pattern distribution dynamically based on player's current score
    // - Low score (< 150): gentler introduction with 70% single blocks
    // - Mid score (150-450): balanced variety of safe passages and spinning blades
    // - High score (450+): complex combinations, moving barriers, and dense corridors
    let singleThreshold = 0.38;
    let safePassageThreshold = 0.65;
    let bladeThreshold = 0.82;

    if (this.score < 150) {
      singleThreshold = 0.70;
      safePassageThreshold = 0.90;
      bladeThreshold = 0.98;
    } else if (this.score < 450) {
      singleThreshold = 0.50;
      safePassageThreshold = 0.75;
      bladeThreshold = 0.88;
    }

    // 1. Single lane hazard with collectible in other lane
    if (rand < singleThreshold) {
      const redLane = Math.floor(Math.random() * 3);
      this.createObstacle(redLane, spawnY, 'RED_BLOCK');

      // Place star or coin in one of the safe lanes
      const safeLanes = [0, 1, 2].filter((l) => l !== redLane);
      const giftLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
      this.createCollectible(giftLane, spawnY - 40);
    }
    // 2. Safe passage: Two lanes blocked, leaving exactly 1 safe lane
    else if (rand < safePassageThreshold) {
      const safeLane = Math.floor(Math.random() * 3);
      for (let l = 0; l < 3; l++) {
        if (l !== safeLane) {
          this.createObstacle(l, spawnY, 'RED_SPIKE');
        }
      }
      // Place a star in the safe corridor as a reward!
      this.createCollectible(safeLane, spawnY, 'STAR');
    }
    // 3. Rotating danger saw blade
    else if (rand < bladeThreshold) {
      const bladeLane = Math.floor(Math.random() * 3);
      this.createObstacle(bladeLane, spawnY, 'ROTATING_BLADE');

      // Maybe spawn a power-up in another lane
      if (Math.random() < 0.25) {
        const safeLanes = [0, 1, 2].filter((l) => l !== bladeLane);
        const pLane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
        this.createPowerUp(pLane, spawnY - 60);
      }
    }
    // 4. Moving barrier patrolling between two adjacent lanes
    else {
      const startLane = Math.random() < 0.5 ? 0 : 1;
      this.createMovingBarrier(startLane, spawnY);
      // Spawn coins in the untouched lane
      const otherLane = startLane === 0 ? 2 : 0;
      this.createCollectible(otherLane, spawnY - 30, 'COIN');
    }

    // Rare random power-up drop if none currently active
    if (this.activePowerUps.size === 0 && Math.random() < 0.08) {
      const randomLane = Math.floor(Math.random() * 3);
      this.createPowerUp(randomLane, spawnY - 120);
    }
  }

  private createObstacle(lane: number, y: number, type: Obstacle['type']) {
    const x = this.laneCenters[lane];
    let width = this.laneWidth * 0.72;
    let height = this.laneWidth * 0.72;
    let rotSpeed = 0;

    if (type === 'ROTATING_BLADE') {
      width = this.laneWidth * 0.82;
      height = width;
      const scoreDiff = this.getScoreDifficulty();
      rotSpeed = (Math.random() > 0.5 ? 1 : -1) * (2.5 + scoreDiff * 3.5 + Math.random() * 2);
    } else if (type === 'RED_SPIKE') {
      height = this.laneWidth * 0.55;
    }

    this.obstacles.push({
      id: Math.random(),
      type,
      lane,
      x,
      y,
      width,
      height,
      speedMultiplier: 1.0,
      rotation: 0,
      rotSpeed,
      dodged: false,
    });
  }

  private createMovingBarrier(startLane: number, y: number) {
    const minX = this.laneCenters[startLane];
    const maxX = this.laneCenters[startLane + 1];
    const scoreDiff = this.getScoreDifficulty();
    this.obstacles.push({
      id: Math.random(),
      type: 'MOVING_BARRIER',
      lane: startLane,
      x: minX,
      y,
      width: this.laneWidth * 0.7,
      height: this.laneWidth * 0.65,
      speedMultiplier: 0.95,
      rotation: 0,
      rotSpeed: 0,
      moveRange: {
        minX,
        maxX,
        dir: 1,
        speed: 110 + scoreDiff * 95 + Math.random() * 45,
      },
      dodged: false,
    });
  }

  private createCollectible(lane: number, y: number, explicitType?: 'STAR' | 'COIN') {
    const x = this.laneCenters[lane];
    const type = explicitType || (Math.random() < 0.35 ? 'STAR' : 'COIN');
    this.collectibles.push({
      id: Math.random(),
      type,
      lane,
      x,
      y,
      radius: type === 'STAR' ? 18 : 15,
      rotation: 0,
      collected: false,
    });
  }

  private createPowerUp(lane: number, y: number) {
    const x = this.laneCenters[lane];
    const types: PowerUpType[] = ['SHIELD', 'MAGNET', 'SLOWMO', 'DOUBLE'];
    const selected = types[Math.floor(Math.random() * types.length)];

    let cType: Collectible['type'] = 'POWERUP_SHIELD';
    if (selected === 'MAGNET') cType = 'POWERUP_MAGNET';
    if (selected === 'SLOWMO') cType = 'POWERUP_SLOWMO';
    if (selected === 'DOUBLE') cType = 'POWERUP_DOUBLE';

    this.collectibles.push({
      id: Math.random(),
      type: cType,
      powerUpType: selected,
      lane,
      x,
      y,
      radius: 19,
      rotation: 0,
      collected: false,
    });
  }

  // --- PARTICLES & POPUPS ---

  private spawnMoveDust(x: number, y: number) {
    if (this.reducedMotion) return;
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x,
        y: y + 12,
        vx: (Math.random() - 0.5) * 50,
        vy: 15 + Math.random() * 30,
        radius: 2.5 + Math.random() * 3,
        color: '#EADBC8',
        alpha: 0.5,
        decay: 2.8,
      });
    }
  }

  private spawnCoinSparkles(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const speed = 60 + Math.random() * 65;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 2.5,
        color: '#FFD65A',
        alpha: 1,
        decay: 2.5,
      });
    }
  }

  private spawnStarBurst(x: number, y: number, color = '#FFD65A') {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 75 + Math.random() * 85;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.5 + Math.random() * 2.5,
        color,
        alpha: 1,
        decay: 2.0,
        shape: 'star',
      });
    }
  }

  private spawnShieldShatterParticles(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: '#72D7FF',
        alpha: 1,
        decay: 1.8,
        shape: 'shard',
      });
    }
  }

  private spawnGameOverExplosion(x: number, y: number) {
    const colors = ['#FF4D65', '#FFD65A', '#B8A7FF', '#72D7FF', '#FFFFFF'];
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 150;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.5 + Math.random() * 4.5,
        color: colors[i % colors.length],
        alpha: 1,
        decay: 1.4,
      });
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: string) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      alpha: 1,
      vy: -55,
    });
  }

  // --- RENDERING ---

  private render() {
    const ctx = this.ctx;
    ctx.save();

    // Clear
    ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

    // Apply Screen Shake
    if (this.shakeMagnitude > 0) {
      const sx = Math.cos(this.shakeAngle) * this.shakeMagnitude;
      const sy = Math.sin(this.shakeAngle) * this.shakeMagnitude;
      ctx.translate(sx, sy);
    }

    // 1. Draw Track & Lane dividers
    this.drawTrack(ctx);

    // 2. Draw Collectibles
    this.drawCollectibles(ctx);

    // 3. Draw Obstacles (DANGER RED)
    this.drawObstacles(ctx);

    // 4. Draw Particles
    this.drawParticles(ctx);

    // 5. Draw Player Mascot
    this.drawPlayer(ctx);

    // 6. Draw Floating text popups
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  private drawTrack(ctx: CanvasRenderingContext2D) {
    const { currentTheme, nextTheme, transitionFactor } = getThemeProgression(this.score);

    // Quantize transition factor to 25 discrete steps to cache gradient and prevent GC thrashing
    const quantizedFactor = Math.round(transitionFactor * 25) / 25;
    const themeKey = `${currentTheme.name}_${nextTheme.name}_${quantizedFactor}`;

    if (!this.cachedBgGradient || this.cachedBgHeight !== this.logicalHeight || this.cachedThemeKey !== themeKey) {
      const topRgb = lerpColor(currentTheme.topColor, nextTheme.topColor, transitionFactor);
      const bottomRgb = lerpColor(currentTheme.bottomColor, nextTheme.bottomColor, transitionFactor);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, this.logicalHeight);
      bgGrad.addColorStop(0, rgbToString(topRgb));
      bgGrad.addColorStop(1, rgbToString(bottomRgb));
      this.cachedBgGradient = bgGrad;
      this.cachedBgHeight = this.logicalHeight;
      this.cachedThemeKey = themeKey;
    }

    // Subtle background gradient
    ctx.fillStyle = this.cachedBgGradient;
    ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

    // Dynamic lane divider lines
    ctx.strokeStyle = transitionFactor > 0.5 ? nextTheme.laneLineColor : currentTheme.laneLineColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 16]);

    for (let i = 1; i <= 2; i++) {
      const lx = this.laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, this.logicalHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Lane highlight under player
    ctx.fillStyle = currentTheme.laneHighlightColor;
    ctx.fillRect(
      this.player.lane * this.laneWidth + 4,
      0,
      this.laneWidth - 8,
      this.logicalHeight
    );

    // Subtle speed streaks when running at high speed
    if (this.currentSpeed > 440 && !this.reducedMotion) {
      const alpha = Math.min(0.22, (this.currentSpeed - 440) / 450);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1.5;
      const speedOffset = (this.survivalTime * this.currentSpeed * 0.75) % 90;
      for (let s = -speedOffset; s < this.logicalHeight; s += 70) {
        const lx1 = this.laneWidth * 0.45;
        ctx.beginPath();
        ctx.moveTo(lx1, s);
        ctx.lineTo(lx1, s + 28);
        ctx.stroke();

        const lx2 = this.laneWidth * 2.55;
        ctx.beginPath();
        ctx.moveTo(lx2, s + 35);
        ctx.lineTo(lx2, s + 63);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawObstacles(ctx: CanvasRenderingContext2D) {
    // Red Danger Color Palette (High-performance cartoon styling without expensive shadowBlur)
    const dangerRed = '#FF4D65';
    const darkRed = '#D9233D';
    const highlightRed = '#FF7588';

    for (const obs of this.obstacles) {
      ctx.save();
      ctx.translate(obs.x, obs.y);
      if (obs.rotation !== 0) {
        ctx.rotate(obs.rotation);
      }

      if (obs.type === 'ROTATING_BLADE') {
        const r = obs.width * 0.48;

        // Dark red under-rim for depth
        ctx.fillStyle = darkRed;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2);
        ctx.fill();

        // 4-prong ninja saw hazard
        ctx.fillStyle = dangerRed;
        ctx.beginPath();
        for (let b = 0; b < 4; b++) {
          const a = (b * Math.PI) / 2;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.lineTo(Math.cos(a + 0.38) * (r * 0.35), Math.sin(a + 0.38) * (r * 0.35));
        }
        ctx.closePath();
        ctx.fill();

        // Center hub
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = darkRed;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'RED_SPIKE') {
        const w = obs.width;
        const h = obs.height;

        // Base anchor bar
        ctx.fillStyle = darkRed;
        ctx.beginPath();
        ctx.roundRect(-w / 2, h / 2 - 6, w, 8, 3);
        ctx.fill();

        // Pointy triangular spike row
        ctx.fillStyle = dangerRed;
        ctx.beginPath();
        ctx.moveTo(-w / 2, h / 2 - 2);
        ctx.lineTo(-w / 3, -h / 2);
        ctx.lineTo(-w / 6, h / 3);
        ctx.lineTo(0, -h / 2);
        ctx.lineTo(w / 6, h / 3);
        ctx.lineTo(w / 3, -h / 2);
        ctx.lineTo(w / 2, h / 2 - 2);
        ctx.closePath();
        ctx.fill();

        // White warning teeth accent
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, -h / 4, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // RED_BLOCK or MOVING_BARRIER (Cute Menacing Red Hazard Box)
        const w = obs.width;
        const h = obs.height;
        const radius = 14;

        // 3D Bottom Lip / Shadow bevel in darkRed
        ctx.fillStyle = darkRed;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2 + 4, w, h, radius);
        ctx.fill();

        // Main rounded danger block
        ctx.fillStyle = dangerRed;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, radius);
        ctx.fill();

        // Top glossy highlight
        ctx.fillStyle = highlightRed;
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.36, [11, 11, 4, 4]);
        ctx.fill();

        // Cute angry eyebrows & eyes on red block
        const eyeOffsetX = w * 0.22;
        const eyeOffsetY = -2;

        // Angry slanting eyebrows
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-eyeOffsetX - 7, eyeOffsetY - 8);
        ctx.lineTo(-eyeOffsetX + 7, eyeOffsetY - 5);
        ctx.moveTo(eyeOffsetX + 7, eyeOffsetY - 8);
        ctx.lineTo(eyeOffsetX - 7, eyeOffsetY - 5);
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(-eyeOffsetX, eyeOffsetY, 5, 0, Math.PI * 2);
        ctx.arc(eyeOffsetX, eyeOffsetY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = darkRed;
        ctx.beginPath();
        ctx.arc(-eyeOffsetX + 1, eyeOffsetY, 2.5, 0, Math.PI * 2);
        ctx.arc(eyeOffsetX - 1, eyeOffsetY, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Cute frowning mouth
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 12, 6, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawCollectibles(ctx: CanvasRenderingContext2D) {
    for (const item of this.collectibles) {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);

      if (item.type === 'COIN') {
        // Soft outer glow ring
        ctx.fillStyle = 'rgba(255, 214, 90, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius + 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Outer coin rim
        ctx.fillStyle = '#FFAE33';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();

        // Coin face
        ctx.fillStyle = '#FFD65A';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius * 0.85, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Inner coin core
        ctx.fillStyle = '#FFAE33';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.type === 'STAR') {
        // Outer soft glow star
        this.renderStar(ctx, 0, 0, 5, item.radius + 4, (item.radius + 4) * 0.45, 'rgba(255, 214, 90, 0.28)', 'rgba(255, 214, 90, 0.15)');

        // Golden star
        this.renderStar(ctx, 0, 0, 5, item.radius, item.radius * 0.45, '#FFD65A', '#FFFFFF');
      } else {
        // Power-Up Orbs
        let orbColor = '#72D7FF';
        let orbSymbol = '🛡️';

        if (item.powerUpType === 'MAGNET') {
          orbColor = '#B8A7FF';
          orbSymbol = '🧲';
        } else if (item.powerUpType === 'SLOWMO') {
          orbColor = '#8DE5B5';
          orbSymbol = '⏳';
        } else if (item.powerUpType === 'DOUBLE') {
          orbColor = '#FFD65A';
          orbSymbol = '2X';
        }

        // Translucent outer aura
        ctx.fillStyle = `${orbColor}44`;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius + 4, 0, Math.PI * 2);
        ctx.fill();

        // Vibrant orb body
        ctx.fillStyle = orbColor;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();

        // Glass highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius * 0.75, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold 13px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#343047';
        ctx.fillText(orbSymbol, 0, 1);
      }

      ctx.restore();
    }
  }

  private renderStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    spikes: number,
    outerR: number,
    innerR: number,
    fillColor: string,
    edgeColor: string
  ) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerR;
      let y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const skin = SKINS[this.selectedSkinId] || SKINS.original_blue;
    const p = this.player;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Squash & Stretch
    ctx.scale(p.squashX, p.squashY);

    // Invincibility flashing
    if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer * 14) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    // 1. Shadow underneath
    ctx.save();
    ctx.scale(1 / p.squashX, 1 / p.squashY);
    ctx.fillStyle = 'rgba(52, 48, 71, 0.15)';
    ctx.beginPath();
    ctx.ellipse(0, p.radius * 1.1, p.radius * 0.95, p.radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Active Shield Bubble effect (Crisp double ring)
    if (this.activePowerUps.has('SHIELD')) {
      ctx.save();
      const shieldPulse = Math.sin(p.animAngle * 4) * 3;
      const shieldR = p.radius + 10 + shieldPulse;

      // Outer soft aura
      ctx.strokeStyle = 'rgba(114, 215, 255, 0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
      ctx.stroke();

      // Sharp inner barrier
      ctx.strokeStyle = 'rgba(114, 215, 255, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(114, 215, 255, 0.18)';
      ctx.fill();
      ctx.restore();
    }

    // 3. Active Magnet Flux rings
    if (this.activePowerUps.has('MAGNET')) {
      ctx.save();
      ctx.strokeStyle = 'rgba(184, 167, 255, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3.5. Active Combo Streak Aura & Multiplier Ring
    if (this.comboCount >= 3) {
      ctx.save();
      const pulse = Math.sin(p.animAngle * 6) * 3;
      const ringRadius = p.radius + 6 + pulse;

      let ringColor = 'rgba(141, 229, 181, 0.85)'; // 1.5x mint
      if (this.comboMultiplier >= 3.0) {
        ringColor = 'rgba(255, 77, 101, 0.95)'; // 3.0x+ flaming red
      } else if (this.comboMultiplier >= 2.0) {
        ringColor = 'rgba(255, 214, 90, 0.95)'; // 2.0x gold
      }

      // Outer glow ring
      ctx.strokeStyle = `${ringColor}`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -p.animAngle * 12;

      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Multiplier floating badge above character
      if (this.comboMultiplier > 1.0) {
        ctx.font = 'bold 11px Fredoka, sans-serif';
        ctx.fillStyle = ringColor;
        ctx.textAlign = 'center';
        ctx.fillText(`${this.comboMultiplier.toFixed(1)}x`, 0, -p.radius - 12);
      }
      ctx.restore();
    }

    // 4. Character Body Gradient
    const bodyGrad = ctx.createRadialGradient(
      -p.radius * 0.3,
      -p.radius * 0.35,
      p.radius * 0.1,
      0,
      0,
      p.radius
    );

    if (skin.isRainbow) {
      const hue = (p.animAngle * 40) % 360;
      bodyGrad.addColorStop(0, `hsl(${hue}, 95%, 75%)`);
      bodyGrad.addColorStop(1, `hsl(${(hue + 60) % 360}, 90%, 55%)`);
    } else if (skin.isGalaxy) {
      bodyGrad.addColorStop(0, '#7597DE');
      bodyGrad.addColorStop(0.5, '#4B1055');
      bodyGrad.addColorStop(1, '#1A0835');
    } else {
      bodyGrad.addColorStop(0, skin.accentColor);
      bodyGrad.addColorStop(0.4, skin.primaryColor);
      bodyGrad.addColorStop(1, skin.secondaryColor);
    }

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight gloss
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(
      -p.radius * 0.32,
      -p.radius * 0.38,
      p.radius * 0.35,
      p.radius * 0.2,
      -Math.PI / 4,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Special accessories
    if (skin.hasCrown) {
      // Golden Crown
      ctx.save();
      ctx.translate(0, -p.radius * 0.95);
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#FFA500';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-14, -12);
      ctx.lineTo(-7, -5);
      ctx.lineTo(0, -15);
      ctx.lineTo(7, -5);
      ctx.lineTo(14, -12);
      ctx.lineTo(14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Crown Jewels
      ctx.fillStyle = '#FF4D65';
      ctx.beginPath();
      ctx.arc(0, -6, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (skin.hasLeaves) {
      // Sprout / leaf antenna
      ctx.save();
      ctx.translate(0, -p.radius * 0.92);
      ctx.rotate(Math.sin(p.animAngle * 5) * 0.2);
      ctx.fillStyle = '#53D393';
      ctx.beginPath();
      ctx.ellipse(-5, -6, 6, 3, -Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(5, -6, 6, 3, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (skin.hasStars) {
      // Floating stardust halo
      ctx.save();
      const stX = Math.cos(p.animAngle * 3) * (p.radius + 6);
      const stY = Math.sin(p.animAngle * 3) * (p.radius * 0.5);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(stX, stY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Rosy Cheeks
    ctx.fillStyle = 'rgba(255, 110, 150, 0.45)';
    ctx.beginPath();
    ctx.ellipse(-p.radius * 0.52, p.radius * 0.25, 4.5, 2.8, 0, 0, Math.PI * 2);
    ctx.ellipse(p.radius * 0.52, p.radius * 0.25, 4.5, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // 5. Expressive Eyes & Mouth
    const eyeSpacing = p.radius * 0.38;
    const eyeY = -p.radius * 0.08;

    // Movement direction look offset
    const targetOffset = (p.targetX - p.x) * 0.08;
    const lookX = Math.max(-4, Math.min(4, targetOffset));

    if (p.shockTimer > 0) {
      // SHOCKED FACE (Game Over state)
      // Large spiral/wide surprise eyes
      ctx.strokeStyle = '#343047';
      ctx.lineWidth = 2.5;

      // Left eye X
      ctx.beginPath();
      ctx.moveTo(-eyeSpacing - 4, eyeY - 4);
      ctx.lineTo(-eyeSpacing + 4, eyeY + 4);
      ctx.moveTo(-eyeSpacing + 4, eyeY - 4);
      ctx.lineTo(-eyeSpacing - 4, eyeY + 4);
      ctx.stroke();

      // Right eye X
      ctx.beginPath();
      ctx.moveTo(eyeSpacing - 4, eyeY - 4);
      ctx.lineTo(eyeSpacing + 4, eyeY + 4);
      ctx.moveTo(eyeSpacing + 4, eyeY - 4);
      ctx.lineTo(eyeSpacing - 4, eyeY + 4);
      ctx.stroke();

      // Wide open 'O' mouth
      ctx.fillStyle = '#343047';
      ctx.beginPath();
      ctx.ellipse(0, p.radius * 0.38, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.happyTimer > 0) {
      // HAPPY CHEERING FACE (^ ^)
      ctx.strokeStyle = '#343047';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';

      // Left happy arc
      ctx.beginPath();
      ctx.arc(-eyeSpacing, eyeY, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();

      // Right happy arc
      ctx.beginPath();
      ctx.arc(eyeSpacing, eyeY, 5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();

      // Big open happy smile
      ctx.fillStyle = '#343047';
      ctx.beginPath();
      ctx.arc(0, p.radius * 0.28, 7, 0, Math.PI);
      ctx.fill();
    } else if (p.isBlinking) {
      // BLINKING FACE (- -)
      ctx.strokeStyle = '#343047';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(-eyeSpacing - 5, eyeY);
      ctx.lineTo(-eyeSpacing + 5, eyeY);
      ctx.moveTo(eyeSpacing - 5, eyeY);
      ctx.lineTo(eyeSpacing + 5, eyeY);
      ctx.stroke();

      // Small cute smile
      ctx.beginPath();
      ctx.arc(0, p.radius * 0.25, 4, 0, Math.PI);
      ctx.stroke();
    } else {
      // NORMAL CHEERFUL FACE
      // Eye Whites
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-eyeSpacing + lookX, eyeY, 6.5, 0, Math.PI * 2);
      ctx.arc(eyeSpacing + lookX, eyeY, 6.5, 0, Math.PI * 2);
      ctx.fill();

      // Big friendly pupils
      ctx.fillStyle = '#343047';
      ctx.beginPath();
      ctx.arc(-eyeSpacing + lookX * 1.4, eyeY, 4.2, 0, Math.PI * 2);
      ctx.arc(eyeSpacing + lookX * 1.4, eyeY, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // Specular twinkles in eyes
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-eyeSpacing + lookX * 1.4 - 1.5, eyeY - 1.5, 1.8, 0, Math.PI * 2);
      ctx.arc(eyeSpacing + lookX * 1.4 - 1.5, eyeY - 1.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Cute small smiling mouth
      ctx.strokeStyle = '#343047';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, p.radius * 0.28, 4.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;

      if (p.shape === 'star') {
        this.renderStar(ctx, p.x, p.y, 4, p.radius, p.radius * 0.5, p.color, p.color);
      } else if (p.shape === 'shard') {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.radius);
        ctx.lineTo(p.x + p.radius, p.y + p.radius);
        ctx.lineTo(p.x - p.radius, p.y + p.radius);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.font = 'bold 15px var(--font-heading), system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Outline
      ctx.strokeStyle = '#343047';
      ctx.lineWidth = 3.5;
      ctx.strokeText(ft.text, ft.x, ft.y);

      // Text Fill
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}
