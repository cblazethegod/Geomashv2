// Procedural synthwave soundtrack + SFX. No external audio assets required.

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10]
};

const TRACKS = {
  menu: {
    bpm: 112, root: 45, scale: 'minor', progression: [0, 5, 3, 7], mood: 'menu',
    lead: [0, 7, 3, 10, 5, 12, 7, 3, 0, 7, 10, 5, 3, 12, 7, 5]
  },
  'stereo-neon': {
    bpm: 128, root: 45, scale: 'minor', progression: [0, 5, 3, 7], mood: 'anthem',
    lead: [0, 7, 12, 7, 3, 10, 7, 12, 0, 7, 10, 15, 12, 7, 5, 3]
  },
  'cyber-drift': {
    bpm: 140, root: 43, scale: 'dorian', progression: [0, 3, 5, 7], mood: 'drive',
    lead: [0, 5, 7, 12, 10, 7, 5, 3, 0, 5, 12, 15, 12, 10, 7, 5]
  },
  'void-protocol': {
    bpm: 150, root: 41, scale: 'phrygian', progression: [0, 1, 5, 7], mood: 'void',
    lead: [0, 1, 7, 1, 5, 8, 7, 1, 0, 12, 1, 7, 5, 1, 8, 7]
  }
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.7;
    this.sfxVol = 0.8;
    this.muted = false;
    this.track = null;
    this.trackId = 'menu';
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.listeners = new Set();
    this.started = false;
    this._nextKick = 0;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.22;
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol * 0.65;
    this.music.connect(this.comp);
    this.sfx.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Shared echo bus for lead / atmosphere.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.24;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.33;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.music);

    // Simple noise buffer.
    const len = ctx.sampleRate * 1.2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.started = true;
    this.startScheduler();
    this.setTrack('menu');
  }

  startScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.ctx) {
      this.music.gain.setTargetAtTime(this.muted ? 0 : music * 0.5, this.ctx.currentTime, 0.03);
      this.sfx.gain.setTargetAtTime(this.muted ? 0 : sfx * 0.65, this.ctx.currentTime, 0.03);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.04);
  }

  setPaused(paused) {
    if (!this.ctx) return;
    const target = paused ? 0.0001 : this.muted ? 0.0001 : this.musicVol * 0.5;
    this.music.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  onBeat(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setTrack(id, reset = true) {
    if (!this.ctx) { this.trackId = id; return; }
    const def = TRACKS[id] || TRACKS.menu;
    this.trackId = id;
    this.track = def;
    if (reset) {
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.08;
    }
  }

  schedule() {
    if (!this.ctx || !this.track) return;
    const horizon = this.ctx.currentTime + 0.18;
    const stepDur = 60 / this.track.bpm / 4;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 48) {
      this.scheduleStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  scheduleStep(step, t) {
    const tr = this.track;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const chordRoot = tr.root + tr.progression[bar];
    const mood = tr.mood;
    const intensity = mood === 'menu' ? 0.55 : mood === 'void' ? 1 : 0.85;

    if (s % 4 === 0) this.kick(t, intensity);
    if (s === 4 || s === 12) this.snare(t, 0.22 * intensity);
    if (s % 2 === 0) this.hat(t, (s % 4 === 2 ? 0.05 : 0.028) * (mood === 'void' ? 1.5 : 1));

    const bassPat = mood === 'menu' ? [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
      : [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
    if (bassPat[s]) {
      const oct = s === 6 || s === 14 ? 12 : 0;
      this.bass(t, mtof(chordRoot - 12 + oct), mood === 'void' ? 0.2 : 0.16, mood === 'menu' ? 0.18 : 0.09);
    }

    if (mood !== 'menu') {
      if (s % 2 === 0) {
        const note = tr.lead[(s / 2 + bar * 4) % tr.lead.length];
        this.lead(t, mtof(chordRoot + 12 + note), 0.055 * intensity);
      }
      if (s === 0) {
        this.pad(t, [chordRoot, chordRoot + 3, chordRoot + 7, chordRoot + 10], mood === 'void' ? 0.75 : 1.5);
      }
    } else if (s === 0) {
      this.pad(t, [chordRoot, chordRoot + 7, chordRoot + 12], 2.6, 0.028);
    } else if (s === 6 || s === 14) {
      const note = tr.lead[(step + bar) % tr.lead.length];
      this.lead(t, mtof(chordRoot + 12 + note), 0.018);
    }

    // Beat notifications for visual pulses.
    if (s === 0) this.emitBeat(t, mood === 'void' ? 1 : 0.8);
    else if (s === 8 && mood !== 'menu') this.emitBeat(t, 0.45);
  }

  emitBeat(time, power) {
    const now = this.ctx.currentTime;
    const delay = Math.max(0, time - now) * 1000;
    setTimeout(() => {
      for (const fn of this.listeners) {
        try { fn(power); } catch {}
      }
    }, delay);
  }

  gate(node, t, attack, decay, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    return g;
  }

  kick(t, power = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const g = this.gate(osc, t, 0.002, 0.34, 0.85 * power);
    g.connect(this.music);
    osc.start(t); osc.stop(t + 0.4);

    const click = ctx.createBufferSource();
    click.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    click.connect(hp);
    const cg = this.gate(hp, t, 0.001, 0.03, 0.12 * power);
    cg.connect(this.music);
    click.start(t); click.stop(t + 0.05);
  }

  snare(t, power = 0.3) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 1.2;
    src.connect(bp);
    const g = this.gate(bp, t, 0.002, 0.18, power);
    g.connect(this.music);
    src.start(t); src.stop(t + 0.22);
  }

  hat(t, power = 0.04) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7800;
    src.connect(hp);
    const g = this.gate(hp, t, 0.001, 0.045, power);
    g.connect(this.music);
    src.start(t); src.stop(t + 0.06);
  }

  bass(t, freq, power = 0.14, decay = 0.1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.16);
    lp.Q.value = 7;
    osc.connect(lp);
    const g = this.gate(lp, t, 0.005, decay + 0.14, power);
    g.connect(this.music);
    osc.start(t); osc.stop(t + decay + 0.2);
  }

  lead(t, freq, power = 0.05) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3800, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    osc.connect(lp);
    const g = this.gate(lp, t, 0.004, 0.22, power);
    g.connect(this.music);
    g.connect(this.delay);
    osc.start(t); osc.stop(t + 0.3);
  }

  pad(t, notes, dur = 1.6, power = 0.022) {
    const ctx = this.ctx;
    for (const note of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = mtof(note);
      osc.detune.value = (Math.random() * 12 - 6);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.6;
      osc.connect(lp);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(power, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      lp.connect(g);
      g.connect(this.music);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
  }

  sfx(type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const ctx = this.ctx;
    if (type === 'jump') {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(820, t + 0.08);
      const g = this.gate(osc, t, 0.002, 0.1, 0.035);
      g.connect(this.sfx);
      osc.start(t); osc.stop(t + 0.13);
    } else if (type === 'death') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      osc.connect(lp);
      const g = this.gate(lp, t, 0.005, 0.55, 0.28);
      g.connect(this.sfx);
      osc.start(t); osc.stop(t + 0.6);
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      const ng = this.gate(n, t, 0.002, 0.3, 0.18);
      ng.connect(this.sfx);
      n.start(t); n.stop(t + 0.32);
    } else if (type === 'coin') {
      [880, 1320, 1760].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = this.gate(osc, t + i * 0.055, 0.003, 0.15, 0.075);
        g.connect(this.sfx);
        osc.start(t + i * 0.055); osc.stop(t + i * 0.055 + 0.18);
      });
    } else if (type === 'portal') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.28);
      const g = this.gate(osc, t, 0.01, 0.32, 0.1);
      g.connect(this.sfx);
      g.connect(this.delay);
      osc.start(t); osc.stop(t + 0.36);
    } else if (type === 'checkpoint') {
      [660, 990].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = f;
        const g = this.gate(osc, t + i * 0.08, 0.004, 0.16, 0.06);
        g.connect(this.sfx);
        osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.2);
      });
    } else if (type === 'complete') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = this.gate(osc, t + i * 0.09, 0.01, 0.5, 0.09);
        g.connect(this.sfx);
        g.connect(this.delay);
        osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.6);
      });
    } else if (type === 'ui') {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 660;
      const g = this.gate(osc, t, 0.002, 0.04, 0.02);
      g.connect(this.sfx);
      osc.start(t); osc.stop(t + 0.06);
    }
  }
}

export const audio = new AudioEngine();
