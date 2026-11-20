import { BIRD_SPECIES, BirdSpeciesId } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }
    return this.ctx;
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = Math.floor(ctx.sampleRate * 0.14);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.35;
    }
    return buffer;
  }

  public unlock() {
    this.ensureContext();
  }

  public suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public dispose() {
    this.noiseBuffer = null;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  private playTone(
    type: OscillatorType,
    f0: number,
    f1: number,
    startTime: number,
    duration: number,
    peakGain: number
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, startTime);
    if (f1 !== f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), startTime + duration * 0.82);
    }

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.02, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  public chirp(speciesId: BirdSpeciesId) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const base = BIRD_SPECIES[speciesId]?.pitchHz ?? 1200;
    const now = ctx.currentTime;

    this.playTone('sine', base * 0.92, base * 1.28, now, 0.058, 0.11);
    this.playTone('sine', base * 1.05, base * 1.42, now + 0.065, 0.058, 0.11);
  }

  public flapAndLand(delaySec = 0) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime + delaySec;

    // Reuse pre-allocated noise buffer (zero Float32Array allocation per flap)
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(1250, now + 0.12);
    filter.Q.value = 1.6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.14, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, now + 0.14);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
    };
    noise.start(now);

    // Soft wood tap on landing
    this.playTone('triangle', 220, 110, now + 0.21, 0.055, 0.08);
  }

  public wakeUp() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone('sine', 660, 740, now, 0.11, 0.09);
    this.playTone('sine', 880, 985, now + 0.055, 0.11, 0.09);
    this.playTone('sine', 1175, 1315, now + 0.11, 0.11, 0.09);
  }

  public invalidMove() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playTone('sine', 185, 120, ctx.currentTime, 0.12, 0.1);
  }

  public flockComplete() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    for (let i = 0; i < chord.length; i++) {
      const f = chord[i];
      this.playTone('triangle', f, f * 1.03, now + i * 0.055, 0.24, 0.11);
    }
  }

  public victory() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone('triangle', 523.25, 523.25, now, 0.14, 0.13);
    this.playTone('triangle', 659.25, 659.25, now + 0.1, 0.14, 0.13);
    this.playTone('triangle', 783.99, 783.99, now + 0.2, 0.14, 0.13);
    this.playTone('triangle', 1046.5, 1046.5, now + 0.32, 0.36, 0.13);
    this.playTone('triangle', 987.77, 987.77, now + 0.48, 0.12, 0.13);
    this.playTone('triangle', 1046.5, 1046.5, now + 0.6, 0.45, 0.13);
  }

  public gameOver() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone('sine', 392, 392, now, 0.2, 0.1);
    this.playTone('sine', 349.23, 349.23, now + 0.13, 0.2, 0.1);
    this.playTone('sine', 311.13, 311.13, now + 0.26, 0.2, 0.1);
    this.playTone('sine', 261.63, 261.63, now + 0.39, 0.2, 0.1);
  }

  public boosterUse() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.playTone('sine', 740, 740, now, 0.16, 0.09);
    this.playTone('sine', 987.77, 987.77, now + 0.04, 0.16, 0.09);
    this.playTone('sine', 1479.98, 1479.98, now + 0.08, 0.16, 0.09);
  }

  public uiClick() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playTone('sine', 520, 680, ctx.currentTime, 0.04, 0.05);
  }
}

export const sound = new SoundEngine();
