/**
 * Web Audio API Sound and Procedural Music Engine
 * Zero external audio files needed; ultra-low latency, crisp synth tones
 */

import { haptics } from '../utils/haptics';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isInitialized = false;
  private soundEnabled = true;
  private musicEnabled = true;
  private vibrationEnabled = true;
  private masterVolume = 0.8;
  private platformAudioEnabled = true;
  private musicInterval: number | null = null;
  private musicStep = 0;
  private bgmGainNode: GainNode | null = null;
  private masterGainNode: GainNode | null = null;

  constructor() {
    // Lazy initialized on first user gesture
  }

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended' && this.platformAudioEnabled) {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.masterGainNode = this.ctx.createGain();
      this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
      this.masterGainNode.connect(this.ctx.destination);

      this.bgmGainNode = this.ctx.createGain();
      this.bgmGainNode.gain.setValueAtTime(this.musicEnabled ? 0.22 : 0, this.ctx.currentTime);
      this.bgmGainNode.connect(this.masterGainNode);

      this.isInitialized = true;
      if (this.platformAudioEnabled) {
        if (this.musicEnabled) this.startBgm();
      } else {
        // YouTube may start the game with audio disabled; do not let a later
        // user gesture accidentally resume the AudioContext.
        void this.ctx.suspend();
      }
    } catch {
      // Audio context might fail in restricted environments; fail gracefully
    }
  }

  public setConfig(settings: {
    soundEnabled: boolean;
    musicEnabled: boolean;
    vibrationEnabled: boolean;
    masterVolume: number;
  }) {
    this.soundEnabled = settings.soundEnabled;
    this.musicEnabled = settings.musicEnabled;
    this.vibrationEnabled = settings.vibrationEnabled;
    this.masterVolume = settings.masterVolume;
    haptics.setEnabled(this.vibrationEnabled);

    if (this.ctx && this.masterGainNode) {
      this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    if (this.ctx && this.bgmGainNode) {
      this.bgmGainNode.gain.setValueAtTime(this.musicEnabled ? 0.22 : 0, this.ctx.currentTime);
    }

    if (this.musicEnabled && !this.musicInterval && this.isInitialized) {
      this.startBgm();
    } else if (!this.musicEnabled && this.musicInterval) {
      this.stopBgm();
    }
  }

  public setPausedOrMuted(isMuted: boolean) {
    this.platformAudioEnabled = !isMuted;
    if (!this.ctx || !this.masterGainNode) return;
    try {
      if (isMuted) {
        this.masterGainNode.gain.setValueAtTime(0, this.ctx.currentTime);
        if (this.ctx.state === 'running') {
          this.ctx.suspend();
        }
      } else {
        this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }
    } catch {
      // Ignore audio state transition errors
    }
  }

  public vibrate(pattern: number | number[]) {
    haptics.vibrate(pattern);
  }

  // --- SOUND EFFECTS ---

  public playClick() {
    this.vibrate(10);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    this.init();
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGainNode);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignore
    }
  }

  public playMove() {
    this.vibrate(8);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.07);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGainNode);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Ignore
    }
  }

  public playCombo(comboCount: number) {
    this.vibrate(Math.min(32, 10 + comboCount * 2));
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch rises dynamically with combo streak (520Hz up to 1350Hz)
      const baseFreq = Math.min(1350, 520 + comboCount * 45);
      osc.type = comboCount >= 10 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.09);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      osc.connect(gain);
      gain.connect(this.masterGainNode);

      osc.start(now);
      osc.stop(now + 0.11);
    } catch {
      // Ignore
    }
  }

  public playCoin() {
    this.vibrate(15);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      // High-pitched crystal coin two-tone chime (B5 -> E6)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(987.77, now); // B5
      osc1.frequency.setValueAtTime(1318.51, now + 0.07); // E6

      osc2.frequency.setValueAtTime(1975.53, now); // B6 overtone
      osc2.frequency.setValueAtTime(2637.02, now + 0.07); // E7 overtone

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterGainNode);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  public playStar() {
    this.vibrate([15, 30, 20]);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      // Magical 3-note arpeggiated star chime
      const notes = [1046.50, 1318.51, 1567.98]; // C6, E6, G6
      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGainNode) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.05;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25, startTime + 0.18);

        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

        osc.connect(gain);
        gain.connect(this.masterGainNode);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } catch {
      // Ignore
    }
  }

  public playPowerup() {
    this.vibrate([20, 35, 30]);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGainNode);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  public playShieldBreak() {
    this.vibrate([50, 40, 60]);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGainNode);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Ignore
    }
  }

  public playHit() {
    this.vibrate([80, 50, 120]);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      // Low impact cartoon thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGainNode);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  public playGameOver() {
    this.vibrate([100, 60, 150]);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      const sadNotes = [392.00, 369.99, 329.63, 293.66]; // G4, F#4, E4, D4
      sadNotes.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGainNode) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.12;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.9, startTime + 0.2);

        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

        osc.connect(gain);
        gain.connect(this.masterGainNode);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } catch {
      // Ignore
    }
  }

  public playMilestone() {
    this.vibrate([25, 35, 25, 35, 60]);
    if (!this.soundEnabled || !this.ctx || !this.masterGainNode) return;
    try {
      const now = this.ctx.currentTime;
      const fanfare = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      fanfare.forEach((freq, idx) => {
        if (!this.ctx || !this.masterGainNode) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = now + idx * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);

        osc.connect(gain);
        gain.connect(this.masterGainNode);

        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    } catch {
      // Ignore
    }
  }

  // --- PROCEDURAL UPLIFTING ARCADE BGM ---
  // A gentle, joyful, cute lofi/chiptune arpeggiator that loops endlessly without tiring the ears

  private startBgm() {
    if (this.musicInterval) return;

    // Upbeat pentatonic chord progression in C major / A minor
    const chordNotes = [
      [261.63, 329.63, 392.00, 523.25], // C Major
      [220.00, 261.63, 329.63, 440.00], // A minor
      [174.61, 220.00, 261.63, 349.23], // F Major
      [196.00, 246.94, 293.66, 392.00], // G Major
    ];

    const stepDuration = 220; // ms per note

    this.musicInterval = window.setInterval(() => {
      if (!this.musicEnabled || !this.ctx || !this.bgmGainNode || this.ctx.state !== 'running') {
        return;
      }

      try {
        const chordIndex = Math.floor(this.musicStep / 8) % chordNotes.length;
        const noteIndex = this.musicStep % 4;
        const currentChord = chordNotes[chordIndex];
        const freq = currentChord[noteIndex];

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        // Warm rounded sine and soft triangle wave
        osc.type = (this.musicStep % 2 === 0) ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        noteGain.gain.setValueAtTime(0.08, now);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(noteGain);
        noteGain.connect(this.bgmGainNode);

        osc.start(now);
        osc.stop(now + 0.2);

        this.musicStep++;
      } catch {
        // Catch any audio glitches
      }
    }, stepDuration);
  }

  private stopBgm() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export const soundManager = new SoundEngine();
