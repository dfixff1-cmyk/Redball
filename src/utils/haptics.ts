/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mobile Haptic Vibration Manager
 * Wraps navigator.vibrate() with device safety checks and calibrated arcade patterns
 */

class HapticsManager {
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        if (window.ytgame?.IN_PLAYABLES_ENV === true) return;
        const stored = localStorage.getItem('dont_touch_red_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed.vibrationEnabled === 'boolean') {
            this.enabled = parsed.vibrationEnabled;
          }
        }
      } catch {
        this.enabled = true;
      }
    }
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Safe wrapper around navigator.vibrate()
   */
  public vibrate(pattern: number | number[]): boolean {
    if (!this.enabled) return false;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        return navigator.vibrate(pattern);
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Subtle tick for generic UI button presses, tabs, and toggles
   */
  public click() {
    this.vibrate(10);
  }

  /**
   * Ultra-light tap for lane swipes and slider adjustments
   */
  public light() {
    this.vibrate(8);
  }

  /**
   * Medium affirmative tap for equipping skins, claiming rewards, or opening modals
   */
  public medium() {
    this.vibrate(18);
  }

  /**
   * Crisp tactile feedback on collecting a coin
   */
  public coin() {
    this.vibrate(15);
  }

  /**
   * Double-tap burst on collecting a star
   */
  public star() {
    this.vibrate([15, 30, 20]);
  }

  /**
   * Dynamic escalating pulse on combo increments
   */
  public combo(streakCount: number) {
    const pulse = Math.min(32, 10 + streakCount * 2);
    this.vibrate(pulse);
  }

  /**
   * Triple-pulse wave on collecting a special power-up
   */
  public powerup() {
    this.vibrate([20, 35, 30]);
  }

  /**
   * Heavy punchy rumble on colliding with a red obstacle
   */
  public collision() {
    this.vibrate([80, 50, 120]);
  }

  /**
   * Sharp fracture pulse when the shield absorbs a fatal red impact
   */
  public shieldBreak() {
    this.vibrate([50, 40, 60]);
  }

  /**
   * Resonant low-frequency rumble on run over
   */
  public gameOver() {
    this.vibrate([100, 60, 150]);
  }

  /**
   * Celebratory pattern for milestones, achievements, or high scores
   */
  public success() {
    this.vibrate([20, 40, 25, 40, 35]);
  }
}

export const haptics = new HapticsManager();
