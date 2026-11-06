/**
 * Procedural sound effects: every sound is synthesized with Web Audio (noise bursts, filtered
 * oscillators, envelopes), so there are no asset files and each play varies slightly.
 * Buses: master -> { sfx, crowd }. Browsers only allow audio after a key press or click.
 */
const SETTINGS_KEY = 'hoopcareer.audio';

export interface AudioSettings { master: number; sfx: number; crowd: number; muted: boolean }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private crowdBus!: GainNode;
  private noise!: AudioBuffer;
  private crowdFilter!: BiquadFilterNode;
  private crowdGain!: GainNode;
  /** gate for the arena murmur: open in games, shut in menus */
  private arenaGate!: GainNode;
  private arenaOn = false;
  settings: AudioSettings = { master: 0.8, sfx: 0.9, crowd: 0.45, muted: false };

  constructor() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')); } catch { /* defaults */ }
  }

  get running() { return this.ctx?.state === 'running'; }

  /** Create/resume the audio context. Must be called from a user gesture. */
  unlock() {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume();
    } catch { /* audio unavailable */ }
  }

  private build() {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC() as AudioContext;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.crowdBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.sfxBus.connect(this.master); this.crowdBus.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    // 2s of white noise reused by every noise-based sound
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applySettings();
    this.startCrowd();
  }

  applySettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.muted ? 0 : s.master;
    this.sfxBus.gain.value = s.sfx;
    this.crowdBus.gain.value = s.crowd;
  }
  toggleMute() { this.settings.muted = !this.settings.muted; this.applySettings(); return this.settings.muted; }

  // ---------- building blocks ----------
  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!pan || !ctx.createStereoPanner) return this.sfxBus;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    return p;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseHit(o: { type: BiquadFilterType; f: number; f2?: number; q?: number; peak: number; a?: number; d: number; pan?: number; at?: number; dest?: AudioNode }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rand(0.9, 1.1);
    const f = ctx.createBiquadFilter();
    f.type = o.type; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a ?? 0.005) + o.d);
    const g = ctx.createGain();
    this.env(g, t, o.peak, o.a ?? 0.004, o.d);
    src.connect(f).connect(g).connect(o.dest ?? this.out(o.pan ?? 0));
    src.start(t, Math.random() * 1.5, (o.a ?? 0.004) + o.d + 0.05);
  }

  private tone(o: { type?: OscillatorType; f: number; f2?: number; peak: number; a?: number; d: number; pan?: number; at?: number; vib?: { rate: number; depth: number }; lp?: number }) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a ?? 0.004) + o.d);
    if (o.vib) {
      const lfo = ctx.createOscillator(); const lg = ctx.createGain();
      lfo.frequency.value = o.vib.rate; lg.gain.value = o.vib.depth;
      lfo.connect(lg).connect(osc.frequency); lfo.start(t); lfo.stop(t + (o.a ?? 0.004) + o.d + 0.05);
    }
    const g = ctx.createGain();
    this.env(g, t, o.peak, o.a ?? 0.004, o.d);
    let node: AudioNode = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g).connect(this.out(o.pan ?? 0));
    osc.start(t); osc.stop(t + (o.a ?? 0.004) + o.d + 0.05);
  }

  private ok() { return !!this.ctx && this.ctx.state === 'running' && !this.settings.muted; }

  // ---------- sounds ----------
  /** Ball hitting hardwood. hard 0..1 scales loudness. */
  dribble(hard = 0.6, pan = 0) {
    if (!this.ok()) return;
    const k = rand(0.94, 1.06);
    this.tone({ f: 150 * k, f2: 60 * k, peak: 0.55 * hard, a: 0.002, d: 0.11, pan });
    this.tone({ type: 'triangle', f: 310 * k, f2: 180 * k, peak: 0.12 * hard, a: 0.002, d: 0.07, pan });
    this.noiseHit({ type: 'bandpass', f: 1400 * k, q: 1.2, peak: 0.25 * hard, d: 0.03, pan });
  }

  /** Sneaker squeak on hardwood. */
  squeak(pan = 0, strength = 1) {
    if (!this.ok()) return;
    const f = rand(2300, 3300);
    const up = Math.random() < 0.5;
    this.tone({ type: 'sawtooth', f, f2: up ? f * 1.25 : f * 0.8, peak: 0.07 * strength, a: 0.01, d: rand(0.08, 0.16), pan, vib: { rate: rand(28, 45), depth: 180 }, lp: 4200 });
    this.tone({ type: 'sine', f: f * 1.5, f2: up ? f * 1.7 : f * 1.2, peak: 0.03 * strength, a: 0.01, d: 0.09, pan });
  }

  pass(pan = 0, lob = false) {
    if (!this.ok()) return;
    this.noiseHit({ type: 'bandpass', f: 500, f2: lob ? 1300 : 2200, q: 2, peak: 0.12, a: 0.03, d: lob ? 0.3 : 0.16, pan });
    this.tone({ f: 200, f2: 120, peak: 0.12, d: 0.05, pan });
  }
  /** Reward chime for your rebounds: two bright bell notes going up (bigger on an offensive board). */
  ding(big = false) {
    if (!this.ok()) return;
    const k = big ? 1.25 : 1;
    for (const [i, f] of [[0, 1318.5], [1, 1760]] as const) {
      const at = i * 0.085;
      this.tone({ f, peak: 0.22 * k, a: 0.004, d: 0.55, at });
      this.tone({ type: 'triangle', f: f * 2, peak: 0.06 * k, a: 0.003, d: 0.3, at });
      this.tone({ f: f * 2.76, peak: 0.03 * k, a: 0.002, d: 0.18, at }); // bell partial
    }
  }
  catch(pan = 0) {
    if (!this.ok()) return;
    this.noiseHit({ type: 'lowpass', f: 1600, peak: 0.3, d: 0.05, pan });
    this.tone({ f: 170, f2: 90, peak: 0.25, d: 0.06, pan });
  }
  release(pan = 0) {
    if (!this.ok()) return;
    this.noiseHit({ type: 'bandpass', f: 900, f2: 2400, q: 1.5, peak: 0.07, a: 0.04, d: 0.2, pan });
  }

  /**
   * Net sound. big = a clean SWISH (nothing but net): loud and crisp — a sharp cord snap, a long airy "shhhh" sweeping
   * up through the net, a cord rattle tail and the ball's soft whump. Otherwise a quieter net brush (rim-ins, kisses).
   */
  swish(pan = 0, big = true) {
    if (!this.ok()) return;
    if (!big) {
      this.noiseHit({ type: 'highpass', f: 2400, f2: 6500, peak: 0.32, a: 0.02, d: 0.3, pan });
      this.noiseHit({ type: 'bandpass', f: 4200, q: 4, peak: 0.14, a: 0.04, d: 0.22, pan, at: 0.04 });
      this.tone({ f: 140, f2: 70, peak: 0.16, a: 0.01, d: 0.12, pan });
      return;
    }
    this.noiseHit({ type: 'bandpass', f: 7000, q: 3, peak: 1.0, a: 0.0015, d: 0.05, pan });                              // snap
    this.noiseHit({ type: 'bandpass', f: 1800, f2: 7800, q: 0.8, peak: 1.1, a: 0.03, d: 0.55, pan: pan - 0.2 });         // the "shhh" sweeping up (L)
    this.noiseHit({ type: 'bandpass', f: 2100, f2: 8500, q: 0.8, peak: 0.95, a: 0.04, d: 0.6, pan: pan + 0.2, at: 0.015 }); // (R)
    this.noiseHit({ type: 'highpass', f: 5000, f2: 9000, peak: 0.55, a: 0.06, d: 0.75, pan, at: 0.05 });                  // airy tail
    for (let i = 0; i < 4; i++) this.noiseHit({ type: 'bandpass', f: rand(3500, 5200), q: 6, peak: 0.28 / (i + 1), a: 0.004, d: 0.07, pan: pan + rand(-0.2, 0.2), at: 0.08 + i * 0.06 }); // cord rattle
    this.tone({ f: 160, f2: 70, peak: 0.4, a: 0.008, d: 0.18, pan });                                                     // whump
  }
  /** Light rim contact during a roll or rattle. */
  rimTick(pan = 0) {
    if (!this.ok()) return;
    this.metal(pan, 0.12, 0.18);
  }
  /** Ball sailing wide: whoosh, then the crowd's two-note "air-ball" chant. */
  airball(pan = 0) {
    if (!this.ok()) return;
    this.noiseHit({ type: 'bandpass', f: 700, f2: 300, q: 1.2, peak: 0.18, a: 0.08, d: 0.5, pan });
    const ctx = this.ctx!;
    for (let rep = 0; rep < 2; rep++) for (const [i, f] of [[0, 392], [1, 330]] as const) {
      const t0 = 0.6 + rep * 0.9 + i * 0.35;
      for (const det of [0.99, 1, 1.012]) {
        const osc = ctx.createOscillator(); const g = ctx.createGain(); const flt = ctx.createBiquadFilter();
        osc.type = 'sawtooth'; osc.frequency.value = f * det; flt.type = 'lowpass'; flt.frequency.value = 1100;
        const t = ctx.currentTime + t0;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.connect(flt).connect(g).connect(this.crowdBus); osc.start(t); osc.stop(t + 0.4);
      }
    }
  }
  rimIn(pan = 0) {
    if (!this.ok()) return;
    this.metal(pan, 0.18, 0.35);
    this.swish(pan, false);
  }
  clank(pan = 0, board = false) {
    if (!this.ok()) return;
    if (board) {
      this.tone({ f: 110, f2: 70, peak: 0.45, d: 0.16, pan });
      this.noiseHit({ type: 'lowpass', f: 700, peak: 0.35, d: 0.12, pan });
      this.metal(pan, 0.12, 0.25, 0.08);
    } else {
      this.metal(pan, 0.38, 0.55);
      this.noiseHit({ type: 'bandpass', f: 2500, q: 1, peak: 0.2, d: 0.05, pan });
    }
  }
  /** Inharmonic partials = a struck steel rim. */
  private metal(pan: number, peak: number, d: number, at = 0) {
    const base = rand(430, 520);
    for (const [ratio, amp] of [[1, 1], [2.32, 0.6], [3.9, 0.45], [5.6, 0.3], [7.2, 0.18]]) {
      this.tone({ f: base * ratio, peak: peak * amp * 0.5, a: 0.002, d: d / Math.sqrt(ratio), pan, at });
    }
  }
  dunk(pan = 0) {
    if (!this.ok()) return;
    this.tone({ f: 90, f2: 45, peak: 0.6, d: 0.25, pan });
    this.noiseHit({ type: 'lowpass', f: 1200, peak: 0.5, d: 0.12, pan });
    for (let i = 0; i < 5; i++) this.metal(pan, 0.3 / (i + 1), 0.18, i * 0.07);
  }
  bounce(v: number, pan = 0) { this.dribble(Math.min(1, v / 12), pan); }

  thud(pan = 0, hard = false) {
    if (!this.ok()) return;
    this.noiseHit({ type: 'lowpass', f: hard ? 520 : 380, peak: hard ? 0.55 : 0.35, d: hard ? 0.18 : 0.11, pan });
    this.tone({ f: hard ? 95 : 80, f2: 45, peak: hard ? 0.5 : 0.3, d: 0.14, pan });
  }
  /** Loud palm-on-leather clap with a short room tail. */
  block(pan = 0) {
    if (!this.ok()) return;
    for (const [at, f, peak] of [[0, 1800, 0.95], [0.006, 2500, 0.7], [0.013, 1200, 0.6]] as const) this.noiseHit({ type: 'bandpass', f, q: 1.4, peak, a: 0.001, d: 0.045, pan, at });
    this.noiseHit({ type: 'bandpass', f: 1500, q: 0.8, peak: 0.22, a: 0.01, d: 0.28, pan, at: 0.02 }); // room tail
    this.tone({ f: 150, f2: 60, peak: 0.55, d: 0.14, pan });
  }
  steal(pan = 0) {
    if (!this.ok()) return;
    this.noiseHit({ type: 'highpass', f: 2200, peak: 0.3, d: 0.04, pan });
    this.squeak(pan, 0.8);
  }

  /** Referee pea whistle: trilled tone + breath. */
  whistle(long = false) {
    if (!this.ok()) return;
    const f = rand(2700, 3000);
    const blasts = long ? [0, 0.32] : [0];
    for (const at of blasts) {
      this.tone({ f, peak: 0.16, a: 0.015, d: long ? 0.28 : 0.42, vib: { rate: 32, depth: 160 }, at });
      this.noiseHit({ type: 'bandpass', f: f * 1.1, q: 4, peak: 0.06, a: 0.015, d: 0.35, at });
    }
  }
  buzzer() {
    if (!this.ok()) return;
    this.tone({ type: 'square', f: 196, peak: 0.12, a: 0.01, d: 1.1, lp: 1400 });
    this.tone({ type: 'square', f: 197.5, peak: 0.12, a: 0.01, d: 1.1, lp: 1400 });
  }

  // ---------- crowd ----------
  private startCrowd() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    this.crowdFilter = ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass'; this.crowdFilter.frequency.value = 650; this.crowdFilter.Q.value = 0.7;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0.12;
    // slow swell so the murmur breathes
    const lfo = ctx.createOscillator(); const lg = ctx.createGain();
    lfo.frequency.value = 0.13; lg.gain.value = 0.035;
    lfo.connect(lg).connect(this.crowdGain.gain); lfo.start();
    this.arenaGate = ctx.createGain(); this.arenaGate.gain.value = this.arenaOn ? 1 : 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.arenaGate).connect(this.crowdBus);
    src.start();
  }
  /** Arena murmur on (in a game) or off (menus). Remembered until audio is unlocked. */
  setArena(on: boolean) {
    this.arenaOn = on;
    if (!this.ctx || !this.arenaGate) return;
    const g = this.arenaGate.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(on ? 1 : 0, t + 0.6);
  }
  /** Cheer swell (intensity 0..1). */
  cheer(intensity = 0.7) {
    if (!this.ok() || !this.crowdGain) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    const g = this.crowdGain.gain, f = this.crowdFilter.frequency;
    g.cancelScheduledValues(t); f.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t); f.setValueAtTime(f.value, t);
    g.linearRampToValueAtTime(0.12 + 0.55 * intensity, t + 0.25);
    f.linearRampToValueAtTime(900 + 700 * intensity, t + 0.25);
    g.linearRampToValueAtTime(0.12, t + 1.6 + intensity);
    f.linearRampToValueAtTime(650, t + 1.6 + intensity);
    // bright "yeah" layer
    this.noiseHit({ type: 'bandpass', f: 1800, q: 0.8, peak: 0.25 * intensity, a: 0.2, d: 1.0 + intensity, dest: this.crowdBus });
  }
  groan() {
    if (!this.ok()) return;
    this.noiseHit({ type: 'bandpass', f: 520, f2: 260, q: 1.5, peak: 0.25, a: 0.25, d: 1.0, dest: this.crowdBus });
  }

  // ---------- garage workouts (round 39b) ----------
  /** Iron plates clinking on the bar. */
  plates(heavy = false) {
    if (!this.ok()) return;
    const base = heavy ? 520 : 760;
    for (const [at, m] of [[0, 1], [0.045, 1.37], [0.09, 0.83]] as const) {
      this.tone({ type: 'triangle', f: base * m, peak: heavy ? 0.16 : 0.11, a: 0.002, d: 0.35, at });
      this.tone({ f: base * m * 2.71, peak: 0.05, a: 0.002, d: 0.18, at });
    }
    this.noiseHit({ type: 'highpass', f: 3500, peak: 0.08, d: 0.04 });
  }
  /** The bar crashing down (tipped over on the bench). */
  barDrop() {
    if (!this.ok()) return;
    this.plates(true);
    this.tone({ f: 90, f2: 40, peak: 0.55, a: 0.003, d: 0.3, at: 0.02 });
    this.noiseHit({ type: 'lowpass', f: 900, peak: 0.35, d: 0.18, at: 0.02 });
  }
  /** A short breath out on an effortful push. */
  effort() {
    if (!this.ok()) return;
    this.noiseHit({ type: 'bandpass', f: 900, f2: 500, q: 0.9, peak: 0.14, a: 0.02, d: 0.16 });
    this.tone({ type: 'sawtooth', f: 140, f2: 110, peak: 0.03, a: 0.02, d: 0.12, lp: 600 });
  }
  /** A foot landing on the treadmill belt. */
  footfall(speed = 1) {
    if (!this.ok()) return;
    this.tone({ f: 95, f2: 60, peak: 0.18 + 0.06 * Math.min(2, speed), a: 0.002, d: 0.07 });
    this.noiseHit({ type: 'lowpass', f: 700, peak: 0.08, d: 0.04 });
  }
  /** The treadmill motor: a soft hum while it runs (pitch follows the speed). */
  private hum: { osc: OscillatorNode; g: GainNode } | null = null;
  beltHum(on: boolean, speed = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && this.ok()) {
      if (!this.hum) {
        const osc = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0.0001;
        osc.connect(f).connect(g).connect(this.sfxBus); osc.start();
        g.gain.exponentialRampToValueAtTime(0.035, t + 0.4);
        this.hum = { osc, g };
      }
      this.hum.osc.frequency.setTargetAtTime(55 + 25 * speed, t, 0.2);
    } else if (this.hum) {
      const h = this.hum; this.hum = null;
      h.g.gain.setTargetAtTime(0.0001, t, 0.15); h.osc.stop(t + 0.6);
    }
  }
  /** HUD feedback: a bright confirm, or a buzzer for a mistake. */
  blip(good = true) {
    if (!this.ok()) return;
    if (good) { this.tone({ type: 'square', f: 880, peak: 0.05, a: 0.002, d: 0.05, lp: 3000 }); this.tone({ type: 'square', f: 1320, peak: 0.04, a: 0.002, d: 0.06, at: 0.045, lp: 3000 }); }
    else { this.tone({ type: 'square', f: 140, peak: 0.12, a: 0.004, d: 0.28, lp: 1200 }); this.tone({ type: 'square', f: 147, peak: 0.08, a: 0.004, d: 0.28, lp: 1200 }); }
  }
  /** Shot meter tick (higher as it fills). */
  meterTick(level: number) {
    if (!this.ok()) return;
    this.tone({ type: 'triangle', f: 500 + 900 * Math.max(0, Math.min(1, level)), peak: 0.045, a: 0.002, d: 0.035 });
  }
  /** The red-slice perfect release: a bigger fanfare — rising bright arpeggio, sparkle, and a whoosh of fire. */
  perfect() {
    if (!this.ok()) return;
    const notes = [784, 1046.5, 1318.5, 1568, 2093];
    notes.forEach((f, i) => { const at = i * 0.055; this.tone({ f, peak: 0.14, a: 0.003, d: 0.45, at }); this.tone({ type: 'square', f: f / 2, peak: 0.03, a: 0.003, d: 0.25, at, lp: 2500 }); });
    for (let k = 0; k < 6; k++) this.tone({ f: 3000 + Math.random() * 2500, peak: 0.035, a: 0.002, d: 0.12, at: 0.28 + k * 0.045 }); // sparkle
    this.noiseHit({ type: 'lowpass', f: 300, f2: 2400, peak: 0.28, a: 0.12, d: 0.55 });                                       // whoosh of fire
    this.tone({ f: 98, f2: 196, peak: 0.25, a: 0.02, d: 0.4 });
  }
  /** A perfect (green) release. */
  /** Workout XP orbs leaving you (round 42): a soft rising sparkle. */
  orbSend() {
    if (!this.ok()) return;
    this.tone({ type: 'sine', f: 520, f2: 1240, peak: 0.07, a: 0.01, d: 0.22 });
    this.tone({ type: 'triangle', f: 1560, f2: 2480, peak: 0.025, a: 0.005, d: 0.16, at: 0.04 });
  }
  /** An orb landing in its skill card: a bright little pling. */
  orbPop() {
    if (!this.ok()) return;
    this.tone({ f: 1318.5, peak: 0.09, a: 0.002, d: 0.18 });
    this.tone({ type: 'triangle', f: 2637, peak: 0.03, a: 0.002, d: 0.1, at: 0.02 });
  }
  /**
   * Round 52: a footstep while walking around a room. `concrete` = the garage (a short sneaker tap), otherwise a
   * duller thud on the apartment's wood floor; `foot` alternates left / right (a touch of pan and pitch).
   */
  footstep(concrete: boolean, foot: number, run = false) {
    if (!this.ok()) return;
    const pan = foot ? 0.12 : -0.12, k = rand(0.92, 1.08), v = run ? 1.25 : 1;
    if (concrete) {
      this.noiseHit({ type: 'bandpass', f: 2100 * k, q: 1.3, peak: 0.05 * v, a: 0.002, d: 0.028, pan });
      this.tone({ f: 120 * k, f2: 75, peak: 0.07 * v, a: 0.002, d: 0.05, pan });
    } else {
      this.noiseHit({ type: 'lowpass', f: 650 * k, peak: 0.07 * v, a: 0.003, d: 0.06, pan });
      this.tone({ f: 92 * k, f2: 58, peak: 0.1 * v, a: 0.003, d: 0.07, pan });
    }
  }
  /** Round 47: a door latch: a short bright click (two little metal clicks a few ms apart). */
  private latch(at = 0) {
    this.noiseHit({ type: 'highpass', f: 2600, peak: 0.22, a: 0.001, d: 0.025, at });
    this.noiseHit({ type: 'bandpass', f: 1800, q: 3, peak: 0.14, a: 0.001, d: 0.03, at: at + 0.018 });
    this.tone({ type: 'triangle', f: 2400, peak: 0.03, a: 0.001, d: 0.04, at });
  }
  /** A door opening: the latch, then a short wooden creak (low, slightly wobbly, gliding up) and a soft air swish. */
  doorOpen() {
    if (!this.ok()) return;
    this.latch();
    this.tone({ type: 'sawtooth', f: 210, f2: 330, peak: 0.045, a: 0.06, d: 0.28, at: 0.05, vib: { rate: 23, depth: 18 }, lp: 900 });
    this.tone({ type: 'sawtooth', f: 420, f2: 610, peak: 0.018, a: 0.06, d: 0.22, at: 0.07, vib: { rate: 31, depth: 25 }, lp: 1400 });
    this.noiseHit({ type: 'lowpass', f: 500, f2: 1400, peak: 0.08, a: 0.08, d: 0.25, at: 0.1 });
  }
  /** A door closing: a soft wooden thump into the frame, then the latch catching. */
  doorClose() {
    if (!this.ok()) return;
    this.noiseHit({ type: 'lowpass', f: 420, peak: 0.4, a: 0.003, d: 0.16 });
    this.tone({ f: 78, f2: 52, peak: 0.42, a: 0.003, d: 0.18 });
    this.noiseHit({ type: 'bandpass', f: 900, q: 1.2, peak: 0.08, a: 0.004, d: 0.12, at: 0.01 }); // the frame rings a little
    this.latch(0.06);
  }
  /** A locked door: the handle rattles (two quick latch clicks), nothing opens. */
  doorLocked() {
    if (!this.ok()) return;
    this.latch(); this.latch(0.11);
    this.tone({ f: 120, f2: 95, peak: 0.12, a: 0.003, d: 0.08, at: 0.11 });
  }
  greenChime() {
    if (!this.ok()) return;
    for (const [at, f] of [[0, 1046.5], [0.06, 1568], [0.12, 2093]] as const) { this.tone({ f, peak: 0.13, a: 0.003, d: 0.35, at }); this.tone({ type: 'triangle', f: f * 2, peak: 0.04, a: 0.002, d: 0.2, at }); }
  }
}

export const sfx = new Sfx();
(window as any).__sfx = sfx;
