import { LEVELS } from './levels.js';

const FIXED = 1 / 120;
const CUBE = 0.92;
const HALF = CUBE / 2;
const GRAVITY = 70;
const JUMP_V = 17.4;
const PAD_V = 27.5;
const ORB_V = 16.8;
const SHIP_UP = 43;
const SHIP_DOWN = -42;
const SHIP_MAX = 10.5;
const EPS = 0.001;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, t) => a + (b - a) * t;

export class Game {
  constructor() {
    this.level = null;
    this.state = 'idle'; // idle | running | dead | complete
    this.practice = false;
    this.attempt = 1;
    this.coins = new Set();
    this.usedOrbs = new Set();
    this.events = {};
    this.inputHeld = false;
    this.checkpoints = [];
    this.activeCheckpoint = null;
    this.levelTime = 0;
    this.totalTime = 0;
    this.accumulator = 0;
    this.deaths = 0;
    this.cleanRun = true;
    this.checkpointsSetting = true;
    this.runCoins = new Set();
    this.lastCpDist = 0;
    this._coinIndex = new Map();
    this._finish = 0;
    this._modeCache = null;
  }

  on(name, fn) { (this.events[name] ||= []).push(fn); return this; }
  emit(name, payload) { for (const fn of this.events[name] || []) fn(payload); }

  load(levelId, { practice = false } = {}) {
    this.level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    this.levelIndex = this.level.index - 1;
    this.practice = practice;
    this.state = 'idle';
    this.attempt = 1;
    this.deaths = 0;
    this.cleanRun = true;
    this.coins = new Set();
    this.runCoins = new Set();
    this.levelTime = 0;
    this.totalTime = 0;
    this.accumulator = 0;
    this.checkpoints = [];
    this.activeCheckpoint = null;
    this.inputHeld = false;
    this._coinIndex.clear();
    this.level.entities.forEach((e, i) => { if (e.type === 'coin') this._coinIndex.set(e.id, i); });
    this._finish = this.level.entities.find((e) => e.type === 'finish')?.x ?? this.level.length;
    this._buildCheckpoints();
    this._resetPlayer(0);
    this._modeCache = null;
  }

  _buildCheckpoints() {
    const lvl = this.level;
    const hazards = lvl.entities.filter((e) => ['block', 'spike', 'saw'].includes(e.type));
    const portals = lvl.entities.filter((e) => e.type === 'portal');
    const add = (x, mode, y) => this.checkpoints.push({ x, mode, y });
    add(0, 'cube', 0.5);
    for (let x = 26; x < lvl.length - 14; x += 20) {
      const nearHazard = hazards.some((e) => Math.abs(e.x - x) < 7.5);
      const nearPortal = portals.some((e) => Math.abs(e.x - x) < 12);
      if (nearHazard || nearPortal) continue;
      const mode = this._modeAt(x);
      const y = mode === 'cube' ? 0.5 : 4.4;
      const last = this.checkpoints[this.checkpoints.length - 1];
      if (!last || x - last.x > 10) add(x, mode, y);
    }
    // Section portals are guaranteed respawn points.
    for (const p of portals) {
      if (p.mode !== 'cube') add(p.x + 14, p.mode, p.y + 0.4);
    }
    this.checkpoints.sort((a, b) => a.x - b.x);
  }

  _modeAt(x) {
    let mode = 'cube';
    for (const e of this.level.entities) {
      if (e.type === 'portal' && e.x < x) mode = e.mode;
    }
    return mode;
  }

  start() {
    if (this.state === 'running') return;
    this.state = 'running';
    this.levelTime = 0;
    this.accumulator = 0;
    this.emit('start', { attempt: this.attempt });
  }

  restart(full = true) {
    this.attempt++;
    if (full) {
      this.coins.clear();
      this.runCoins.clear();
      this.activeCheckpoint = null;
      this._resetPlayer(0);
      this.levelTime = 0;
    } else {
      this._respawn();
    }
    this.state = 'running';
    this.cleanRun = this.cleanRun && full;
    this.emit('start', { attempt: this.attempt });
  }

  retry() {
    this.attempt++;
    this.cleanRun = false;
    if (!this.practice) {
      this.coins.clear();
      this.runCoins.clear();
    }
    this._respawn();
    this.state = 'running';
    this.emit('start', { attempt: this.attempt });
  }

  _resetPlayer(startX = 0) {
    const portal = this.level.entities.filter((e) => e.type === 'portal' && e.x <= startX).pop();
    let mode = 'cube';
    let y = 0.5;
    let vy = 0;
    if (startX > 0) {
      if (this.activeCheckpoint) {
        mode = this.activeCheckpoint.mode;
        y = this.activeCheckpoint.y;
      } else if (portal) {
        mode = portal.mode;
        y = portal.mode === 'cube' ? 0.5 : portal.y;
      }
    }
    this.player = {
      x: startX,
      y,
      vy,
      mode,
      grounded: mode === 'cube',
      gravity: 1,
      rotation: 0,
      targetRotation: 0,
      alive: true,
      invuln: startX > 0 ? 0.6 : 0,
      holding: false,
      lastGroundY: y,
      deathAt: 0,
      trailTick: 0
    };
    this.usedOrbs.clear();
    this.activeCheckpoint = startX > 0 ? this.activeCheckpoint : null;
    this.distance = startX;
    this._modeCache = mode;
  }

  _respawn() {
    let cp = this.checkpoints[0];
    if (this.practice) {
      const diedAt = this.player.x;
      for (const c of this.checkpoints) if (c.x <= diedAt - 0.5) cp = c;
    }
    if (!this.practice || !this.checkpointsSetting) {
      this._resetPlayer(0);
    } else {
      this.activeCheckpoint = cp;
      this._resetPlayer(cp.x);
      this.player.y = cp.y;
      if (cp.mode !== 'cube') this.player.grounded = false;
    }
    this.state = 'running';
    this.cleanRun = false;
    this.emit('respawn', { x: this.player.x, attempt: this.attempt });
  }

  setHolding(v) {
    this.inputHeld = v;
    if (!this.player) return;
    this.player.holding = v;
    if (!v) return;
    if (this.state !== 'running') return;
    if (this.practice && this.state === 'idle') this.start();
    if (this.player.mode === 'cube') {
      if (this.player.grounded) this._jump();
      else this._tryOrb();
    }
  }

  press() { this.setHolding(true); }
  release() { this.setHolding(false); }

  _jump() {
    const p = this.player;
    p.vy = JUMP_V;
    p.grounded = false;
    this.emit('jump', { x: p.x, y: p.y, orb: false });
    this._checkOrbNow = false;
  }

  _tryOrb() {
    const p = this.player;
    for (let i = 0; i < this.level.entities.length; i++) {
      const e = this.level.entities[i];
      if (e.type !== 'orb') continue;
      if (this.usedOrbs.has(i)) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < 1.55 * 1.55) {
        this.usedOrbs.add(i);
        p.vy = ORB_V;
        p.grounded = false;
        this.emit('orb', { x: e.x, y: e.y });
        this.emit('jump', { x: p.x, y: p.y, orb: true });
        return true;
      }
    }
    return false;
  }

  update(dt) {
    if (this.state !== 'running' || !this.player) return;
    this.accumulator += Math.min(dt, 0.08);
    let steps = 0;
    while (this.accumulator >= FIXED && steps < 12) {
      this._step(FIXED);
      this.accumulator -= FIXED;
      steps++;
    }
  }

  _step(dt) {
    const p = this.player;
    if (this.state !== 'running') return;
    const lvl = this.level;
    const speed = lvl.speed;
    p.invuln = Math.max(0, p.invuln - dt);
    this.levelTime += dt;
    this.totalTime += dt;
    this.distance = p.x;
    const prevY = p.y;
    const prevBottom = prevY - HALF;

    p.x += speed * dt;

    // ----- movement modes ---------------------------------------------------
    if (p.mode === 'cube') {
      p.vy -= GRAVITY * dt;
      p.vy = Math.max(p.vy, -34);
      p.y += p.vy * dt;
      p.grounded = false;
      p.rotation += dt * 6.4;
      this._cubeCollisions(prevBottom);
      if (p.grounded) {
        p.vy = 0;
        p.targetRotation = Math.round(p.rotation / (Math.PI / 2)) * (Math.PI / 2);
        p.rotation += (p.targetRotation - p.rotation) * Math.min(1, dt * 24);
        if (p.holding && p.invuln <= 0.45) this._jump();
      }
    } else if (p.mode === 'ship') {
      const accel = p.holding ? SHIP_UP : SHIP_DOWN;
      p.vy += accel * dt;
      p.vy = clamp(p.vy, -SHIP_MAX, SHIP_MAX);
      if (!p.holding && Math.abs(p.vy) < 0.6) p.vy -= 2 * dt;
      p.y += p.vy * dt;
      p.rotation = clamp(p.vy * 0.055, -0.5, 0.5);
      p.grounded = false;
      this._shipCollisions();
    } else if (p.mode === 'wave') {
      p.vy = (p.holding ? 1 : -1) * speed * 0.78;
      p.y += p.vy * dt;
      p.rotation = p.holding ? Math.PI / 4 : -Math.PI / 4;
      p.grounded = false;
      this._waveCollisions();
    }

    // ----- world bounds ----------------------------------------------------
    if (p.mode === 'cube') {
      if (p.y - HALF <= 0) {
        p.y = HALF;
        if (p.vy <= 0) { p.vy = 0; p.grounded = true; }
      }
    } else {
      if (p.y - HALF < 0.03 || p.y + HALF > 9.7) {
        this.die('bounds');
        return;
      }
    }
    if (p.y < -6) { this.die('fall'); return; }

    // ----- entity interactions ---------------------------------------------
    this._interact(prevBottom);

    // rotation settle
    if (p.mode === 'cube' && p.grounded) {
      p.rotation += (p.targetRotation - p.rotation) * Math.min(1, dt * 22);
    }

    if (p.x >= this._finish) {
      this.complete();
      return;
    }

    if (p.mode !== this._modeCache) this._modeCache = p.mode;
  }

  _cubeCollisions(prevBottom) {
    const p = this.player;
    const left = p.x - HALF, right = p.x + HALF;
    const bottom = p.y - HALF, top = p.y + HALF;
    let landedTop = -Infinity;
    for (const e of this.level.entities) {
      if (e.type !== 'block') continue;
      if (Math.abs(e.x - p.x) > e.w / 2 + 4) continue;
      const bl = e.x - e.w / 2, br = e.x + e.w / 2;
      const bb = e.y, bt = e.y + e.h;
      if (right <= bl + EPS || left >= br - EPS) continue;
      if (bottom >= bt - 0.06 || top <= bb + EPS) {
        // Above the block (possible landing) or entirely below it.
        if (bottom >= bt - 0.06 && prevBottom >= bt - 0.18 && p.vy <= 0.4) {
          landedTop = Math.max(landedTop, bt);
        }
        continue;
      }
      if (p.invuln > 0) continue;
      this.die('wall');
      return;
    }
    if (landedTop > -Infinity) {
      p.y = landedTop + HALF;
      if (p.vy < 0) p.vy = 0;
      p.grounded = true;
    }
  }

  _shipCollisions() {
    const p = this.player;
    const left = p.x - HALF, right = p.x + HALF;
    const bottom = p.y - HALF, top = p.y + HALF;
    for (const e of this.level.entities) {
      if (e.type !== 'block') continue;
      if (Math.abs(e.x - p.x) > e.w / 2 + 3) continue;
      if (right > e.x - e.w / 2 + EPS && left < e.x + e.w / 2 - EPS && top > e.y + EPS && bottom < e.y + e.h - EPS) {
        if (p.invuln > 0) continue;
        this.die('wall');
        return;
      }
    }
  }

  _waveCollisions() {
    const p = this.player;
    const s = 0.34;
    const left = p.x - s, right = p.x + s;
    const bottom = p.y - s, top = p.y + s;
    for (const e of this.level.entities) {
      if (e.type !== 'block' && e.type !== 'spike') continue;
      if (Math.abs(e.x - p.x) > 4) continue;
      let el, er, eb, et;
      if (e.type === 'block') { el = e.x - e.w / 2; er = e.x + e.w / 2; eb = e.y; et = e.y + e.h; }
      else { el = e.x - e.w / 2; er = e.x + e.w / 2; eb = e.y; et = e.y + e.h * 0.8; }
      if (right > el + EPS && left < er - EPS && top > eb + EPS && bottom < et - EPS) {
        if (p.invuln > 0) continue;
        this.die('wall');
        return;
      }
    }
  }

  _interact(prevBottom) {
    const p = this.player;
    const entities = this.level.entities;
    const px = p.x, py = p.y;
    const left = px - HALF, right = px + HALF, bottom = py - HALF, top = py + HALF;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const dx = e.x - px;
      if (dx > 8) continue;
      if (dx < -8) continue;
      if (e.type === 'spike') {
        const hw = 0.34, hh = e.h * 0.78;
        if (right > e.x - hw && left < e.x + hw && top > e.y && bottom < e.y + hh) {
          if (p.invuln <= 0) { this.die('spike'); return; }
        }
      } else if (e.type === 'saw') {
        const ddx = px - e.x, ddy = py - e.y;
        const r = e.r + 0.36;
        if (ddx * ddx + ddy * ddy < r * r) {
          if (p.invuln <= 0) { this.die('saw'); return; }
        }
      } else if (e.type === 'pad') {
        if (Math.abs(dx) < 1.0 && bottom <= e.y + 0.5 && prevBottom >= e.y - 0.2 && p.vy <= 1) {
          p.vy = PAD_V;
          p.grounded = false;
          this.emit('pad', { x: e.x, y: e.y });
          this.emit('jump', { x: p.x, y: p.y, orb: false, pad: true });
        }
      } else if (e.type === 'coin') {
        if (Math.abs(dx) < 1.15 && Math.abs(py - e.y) < 1.25 && !this.coins.has(e.id)) {
          this.coins.add(e.id);
          this.runCoins.add(e.id);
          this.emit('coin', { id: e.id, x: e.x, y: e.y, count: this.coins.size });
        }
      } else if (e.type === 'portal') {
        if (Math.abs(dx) < 0.9 && p.mode !== e.mode) {
          this._setMode(e.mode, e.y);
          this.emit('portal', { mode: e.mode, x: e.x, y: e.y });
        }
      }
    }
  }

  _setMode(mode, y) {
    const p = this.player;
    p.mode = mode;
    p.vy = mode === 'ship' || mode === 'wave' ? 0 : p.vy;
    p.rotation = 0;
    p.targetRotation = 0;
    p.invuln = Math.max(p.invuln, 0.28);
    if (mode !== 'cube') {
      p.y = y + 0.2;
      p.grounded = false;
    } else {
      p.y = Math.max(0.5, y);
      p.grounded = false;
      p.vy = Math.min(p.vy, 0);
    }
    this.emit('mode', { mode });
  }

  die(cause = 'spike') {
    if (this.state !== 'running') return;
    const p = this.player;
    this.state = 'dead';
    this.deaths++;
    this.cleanRun = false;
    p.alive = false;
    p.deathAt = performance.now();
    this.emit('death', { x: p.x, y: p.y, cause, progress: this.getProgress(), mode: p.mode });
  }

  complete() {
    if (this.state !== 'running') return;
    this.state = 'complete';
    this.player.alive = false;
    this.emit('complete', {
      time: this.levelTime,
      progress: 100,
      coins: this.coins.size,
      attempts: this.attempt
    });
  }

  getProgress() {
    if (!this.level) return 0;
    return clamp((this.player.x / this._finish) * 100, 0, 100);
  }

  getCheckpointProgress() {
    return this.activeCheckpoint ? (this.activeCheckpoint.x / this._finish) * 100 : 0;
  }

  getModeLabel() {
    return (this.player?.mode || 'cube').toUpperCase();
  }

  getHud() {
    return {
      progress: this.getProgress(),
      coins: this.coins.size,
      attempt: this.attempt,
      mode: this.getModeLabel(),
      time: this.levelTime
    };
  }
}

export const formatTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const cs = Math.floor((s % 1) * 100).toString().padStart(2, '0');
  return `${m}:${sec}.${cs}`;
};
