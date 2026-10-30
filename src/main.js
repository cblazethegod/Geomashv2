import { LEVELS } from './levels.js';
import { Game, formatTime } from './game.js';
import { World } from './world.js';
import { audio } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = (n) => String(n).padStart(2, '0');

const STORE_KEY = 'geomash.save.v2';
const DEFAULT_SAVE = {
  selected: 0,
  records: {},
  totalAttempts: 0,
  totalJumps: 0,
  settings: {
    music: 70, sfx: 80, muted: false, bloom: true, shake: true,
    trail: true, scale: 100, checkpoints: true, pulse: true
  }
};

function loadSave() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_SAVE),
      ...parsed,
      records: parsed.records || {},
      settings: { ...DEFAULT_SAVE.settings, ...(parsed.settings || {}) }
    };
  } catch { return structuredClone(DEFAULT_SAVE); }
}

let save = loadSave();
const game = new Game();
let world = null;
let selected = clamp(Number(save.selected) || 0, 0, LEVELS.length - 1);
let gameActive = false;
let paused = false;
let deathTimer = null;
let completeTimer = null;
let lastFrame = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;
let saveQueued = false;
let bootDone = false;
let autoScaleFactor = 1;
let autoScaleStep = 0;
let perfClock = 0;
let perfFrames = 0;
let perfWarmup = 2.5;

const $body = document.body;
const $topbar = $('#topbar');
const $menu = $('#screen-menu');
const $hud = $('#hud');
const $hudStart = $('#hud-start');
const $pause = $('#screen-pause');
const $complete = $('#screen-complete');
const $deathFlash = $('#death-flash');
const $toast = $('#toast');

const DIFF_CLASS = { NORMAL: 'normal', HARD: 'hard', INSANE: 'insane', EXTREME: 'extreme' };
const ACCENT_CLASS = ['cyan', 'magenta', 'lime'];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function recordFor(id) {
  if (!save.records[id]) save.records[id] = { best: 0, coins: 0, completed: false, clean: false, attempts: 0, bestTime: 0 };
  return save.records[id];
}

function levelStars(level) {
  const r = save.records[level.id];
  if (!r) return 0;
  return (r.completed ? 1 : 0) + ((r.coins || 0) >= 3 ? 1 : 0) + (r.clean ? 1 : 0);
}

function totalStars() { return LEVELS.reduce((sum, l) => sum + levelStars(l), 0); }
function totalCoins() { return LEVELS.reduce((sum, l) => sum + Math.min(3, save.records[l.id]?.coins || 0), 0); }
function completedCount() { return LEVELS.filter((l) => save.records[l.id]?.completed).length; }

function persist(immediate = false) {
  save.selected = selected;
  if (immediate) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch {}
    saveQueued = false;
    return;
  }
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(save)); } catch {}
  }, 300);
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function toast(message, tone = '', duration = 1600) {
  $toast.textContent = message;
  $toast.className = `toast show ${tone}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { $toast.className = 'toast'; }, duration);
}

function hudToast(message, tone = '', duration = 1400) {
  const el = $('#hud-toast');
  el.textContent = message;
  el.className = `hud-toast show ${tone}`;
  clearTimeout(hudToast._timer);
  hudToast._timer = setTimeout(() => { el.className = 'hud-toast'; }, duration);
}

function setStartOverlay(show, title = 'READY?', sub = 'TAP OR PRESS SPACE TO BEGIN') {
  $hudStart.classList.toggle('hide', !show);
  $('.start-title').textContent = title;
  $('.start-sub').textContent = sub;
}

function clickSound() { try { audio.sfx('ui'); } catch {} }

function updateStats() {
  const stars = totalStars();
  const coins = totalCoins();
  const level = 1 + Math.floor(stars / 4);
  $('#stat-stars').textContent = stars;
  $('#stat-coins').textContent = coins;
  $('#stat-level').textContent = level;
  $('#hero-best').textContent = `${Math.round(recordFor(LEVELS[selected].id).best || 0)}%`;
  $('#hero-attempts').textContent = save.totalAttempts.toLocaleString();
  $('#hero-jumps').textContent = save.totalJumps.toLocaleString();
  $('#hero-completions').textContent = completedCount();
  $('#levels-completed').textContent = completedCount();
}

function updateCard() {
  const level = LEVELS[selected];
  const rec = recordFor(level.id);
  const stars = levelStars(level);
  const card = $('#level-card');
  card.dataset.accent = ACCENT_CLASS[selected % ACCENT_CLASS.length];
  $('#deck-index').textContent = pad2(selected + 1);
  $('#deck-total').textContent = pad2(LEVELS.length);
  $('#card-title').textContent = level.name;
  $('#card-desc').textContent = level.desc;
  $('#card-diff').textContent = level.difficulty;
  $('#card-diff').className = `diff ${DIFF_CLASS[level.difficulty] || 'normal'}`;
  $('#card-bpm').textContent = `${level.bpm} BPM`;
  $('#card-best').textContent = `${Math.round(rec.best || 0)}%`;
  $('#card-fill').style.width = `${clamp(rec.best || 0, 0, 100)}%`;
  $('#card-stars').textContent = stars;
  $('#card-coins').textContent = Math.min(3, rec.coins || 0);
  $('#menu-tip').textContent = level.tip;
  $('#play-level-name').textContent = `${pad2(selected + 1)} / ${level.name}`;
  $('#deck-dots').innerHTML = LEVELS.map((l, i) => `<span class="deck-dot ${i === selected ? 'active' : ''}" data-dot="${i}"></span>`).join('');
  $$('#deck-dots .deck-dot').forEach((dot) => dot.addEventListener('click', () => chooseLevel(Number(dot.dataset.dot))));
  // card art accents
  document.documentElement.style.setProperty('--accent', level.accent);
  document.documentElement.style.setProperty('--accent-2', level.accent2);
}

function buildLevelGrid() {
  const grid = $('#level-grid');
  grid.innerHTML = LEVELS.map((level, i) => {
    const rec = recordFor(level.id);
    const stars = levelStars(level);
    return `
      <article class="level-tile" style="--tile-accent:${level.accent}" data-level="${i}">
        <div class="level-tile-art">
          <div class="art-grid"></div>
          <div class="art-sun"></div>
          <div class="art-cube"><i></i></div>
          <div class="art-spike s1"></div><div class="art-spike s2"></div><div class="art-spike s3"></div>
          <div class="art-floor"></div>
          <div class="art-scan"></div>
          <span class="tile-number">0${i + 1}</span>
        </div>
        <div class="tile-body">
          <div class="card-kicker"><span class="diff ${DIFF_CLASS[level.difficulty] || 'normal'}">${level.difficulty}</span><span>${level.bpm} BPM</span></div>
          <h3>${level.name}</h3>
          <p>${level.desc}</p>
          <div class="tile-meta"><span>BEST RUN <b>${Math.round(rec.best || 0)}%</b></span><span>★ <b>${stars}</b>/3 &nbsp; ● <b>${Math.min(3, rec.coins || 0)}</b>/3</span></div>
          <div class="tile-bar"><i style="width:${clamp(rec.best || 0, 0, 100)}%"></i></div>
          <div class="tile-actions">
            <button class="card-play" data-play="${i}">PLAY <span>→</span></button>
            <button class="tile-practice" data-practice="${i}">PRACTICE</button>
          </div>
        </div>
      </article>`;
  }).join('');
  grid.querySelectorAll('[data-play]').forEach((btn) => btn.addEventListener('click', () => {
    clickSound();
    startLevel(Number(btn.dataset.play), false);
  }));
  grid.querySelectorAll('[data-practice]').forEach((btn) => btn.addEventListener('click', () => {
    clickSound();
    startLevel(Number(btn.dataset.practice), true);
  }));
}

function showOverlay(name) {
  closeOverlays();
  const el = $(`#screen-${name}`);
  if (!el) return;
  el.classList.remove('hidden');
  if (name === 'levels') buildLevelGrid();
  if (name === 'settings') syncSettingsUI();
  clickSound();
}
function closeOverlays() {
  ['levels', 'help', 'settings'].forEach((n) => $(`#screen-${n}`)?.classList.add('hidden'));
}

function chooseLevel(index) {
  selected = (index + LEVELS.length) % LEVELS.length;
  save.selected = selected;
  persist();
  updateCard();
  updateStats();
  if (world) world.buildMenu(LEVELS[selected]);
  if (!$('#screen-levels').classList.contains('hidden')) buildLevelGrid();
  try { audio.sfx('ui'); } catch {}
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function applySettings() {
  const s = save.settings;
  audio.setVolumes(s.music / 100, s.sfx / 100);
  audio.setMuted(!!s.muted);
  if (world) {
    world.setBloom(s.bloom && s.scale > 50);
    world.setShake(!!s.shake);
    world.setTrail(!!s.trail);
    world.setRenderScale(((s.scale || 100) / 100) * autoScaleFactor);
    world.beatPulseEnabled = !!s.pulse;
  }
  game.checkpointsSetting = !!s.checkpoints;
}

function syncSettingsUI() {
  const s = save.settings;
  $('#set-music').value = s.music;
  $('#set-music-val').textContent = s.music;
  $('#set-sfx').value = s.sfx;
  $('#set-sfx-val').textContent = s.sfx;
  $('#set-scale').value = s.scale;
  $('#set-scale-val').textContent = s.scale;
  const setToggle = (id, on) => {
    const el = $(id);
    el.classList.toggle('on', !!on);
    el.setAttribute('aria-checked', String(!!on));
  };
  setToggle('#set-mute', s.muted);
  setToggle('#set-bloom', s.bloom);
  setToggle('#set-shake', s.shake);
  setToggle('#set-trail', s.trail);
  setToggle('#set-checkpoints', s.checkpoints);
  setToggle('#set-pulse', s.pulse);
}

function bindToggle(id, key, after) {
  const el = $(id);
  el.addEventListener('click', () => {
    save.settings[key] = !save.settings[key];
    el.classList.toggle('on', save.settings[key]);
    el.setAttribute('aria-checked', String(save.settings[key]));
    persist();
    if (after) after(save.settings[key]);
    clickSound();
  });
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
function startLevel(index, practice = false) {
  selected = clamp(index, 0, LEVELS.length - 1);
  save.selected = selected;
  persist();
  const level = LEVELS[selected];
  try { audio.init(); audio.setTrack(level.id); audio.setPaused(false); audio.resume?.(); } catch {}
  closeOverlays();
  $menu.classList.add('hidden');
  $complete.classList.add('hidden');
  $pause.classList.add('hidden');
  $topbar.classList.add('hidden');
  $hud.classList.add('active');
  $body.classList.add('playing');
  $('#practice-badge').classList.toggle('on', practice);
  $('#hud-title').textContent = level.name;
  $('#hud-diff').textContent = level.difficulty;
  $('#hud-diff').className = `diff ${DIFF_CLASS[level.difficulty] || 'normal'}`;
  $('#hud-song').textContent = `${level.song} — ${level.bpm} BPM`;
  $('#hud-attempts').textContent = '1';
  $('#hud-coins').textContent = '0';
  $('#hud-fill').style.width = '0%';
  $('#hud-marker').style.left = '0%';
  $('#hud-pct').textContent = '0%';
  $('#hud-mode').textContent = 'CUBE';
  setStartOverlay(true);
  game.load(level.id, { practice });
  game.checkpointsSetting = !!save.settings.checkpoints;
  if (!world) return;
  world.buildGame(level, game);
  world.clearFx();
  world.showPlayer(true);
  gameActive = true;
  paused = false;
  updateCard();
  updateStats();
}

function beginRun() {
  if (!gameActive || paused) return;
  if (game.state === 'idle') {
    game.start();
    setStartOverlay(false);
    hudToast('GO', '');
    try { audio.init(); audio.setTrack(LEVELS[selected].id); } catch {}
  }
}

function updateHud() {
  if (!gameActive) return;
  const pct = game.getProgress();
  $('#hud-fill').style.width = `${pct}%`;
  $('#hud-marker').style.left = `${pct}%`;
  $('#hud-pct').textContent = `${Math.round(pct)}%`;
  $('#hud-attempts').textContent = game.attempt;
  $('#hud-coins').textContent = game.coins.size;
  $('#hud-mode').textContent = game.getModeLabel();
}

function retryRun() {
  if (!gameActive) return;
  deathTimer = null;
  if (!gameActive || paused) return;
  game.retry();
  if (world) { world.clearFx(); world.showPlayer(true); }
  try { audio.setPaused(false); audio.resume?.(); } catch {}
  $('#hud-coins').textContent = game.coins.size;
  $('#hud-attempts').textContent = game.attempt;
  setStartOverlay(false);
  hudToast(`ATTEMPT ${game.attempt}`, '', 900);
  $('#death-flash').classList.remove('flash');
}

function pauseGame() {
  if (!gameActive || paused) return;
  if (game.state !== 'running') return;
  paused = true;
  $('#pause-pct').textContent = `${Math.round(game.getProgress())}%`;
  $('#pause-attempts').textContent = game.attempt;
  $('#pause-coins').textContent = `${game.coins.size}/3`;
  $('#pause-tip').textContent = game.level.tip;
  $pause.classList.remove('hidden');
  try { audio.setPaused(true); } catch {}
  clickSound();
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  $pause.classList.add('hidden');
  try { audio.setPaused(false); } catch {}
  lastFrame = performance.now();
}

function quitToMenu() {
  gameActive = false;
  paused = false;
  clearTimeout(deathTimer); deathTimer = null;
  clearTimeout(completeTimer); completeTimer = null;
  $pause.classList.add('hidden');
  $complete.classList.add('hidden');
  $hud.classList.remove('active');
  $body.classList.remove('playing');
  $topbar.classList.remove('hidden');
  $menu.classList.remove('hidden');
  closeOverlays();
  game.state = 'idle';
  try { audio.init(); audio.setTrack('menu'); audio.setPaused(false); } catch {}
  if (world) {
    world.buildMenu(LEVELS[selected]);
    world.clearFx();
  }
  updateStats();
  updateCard();
}

function completeRun() {
  const level = LEVELS[selected];
  const rec = recordFor(level.id);
  const practice = game.practice;
  const attempts = game.attempt;
  const coins = game.coins.size;
  const clean = attempts === 1 && !practice;
  const prevStars = levelStars(level);
  if (!practice) {
    rec.completed = true;
    rec.best = 100;
    rec.coins = Math.max(rec.coins || 0, coins);
    if (clean) rec.clean = true;
    if (!rec.bestTime || game.levelTime < rec.bestTime) rec.bestTime = game.levelTime;
    rec.attempts = (rec.attempts || 0) + attempts;
  }
  persist();
  const stars = Math.max(0, levelStars(level) - prevStars);
  const rank = practice ? 'P' : ((attempts <= 2 && coins === 3) ? 'S' : attempts <= 4 ? 'A' : attempts <= 9 ? 'B' : 'C');
  $('#complete-rank').textContent = rank;
  $('#complete-level').textContent = level.name;
  $('#complete-sub').textContent = practice ? 'PRACTICE RUN · NOT COUNTED' : clean ? 'CLEAN RUN · NO DEATHS' : 'LEVEL COMPLETE';
  $('#complete-time').textContent = formatTime(game.levelTime);
  $('#complete-attempts').textContent = attempts;
  $('#complete-coins').textContent = `${coins}/3`;
  $('#complete-stars').textContent = practice ? '—' : `+${stars}`;
  const nextIndex = (selected + 1) % LEVELS.length;
  $('#btn-next-level').dataset.next = nextIndex;
  $('#next-level-name').textContent = LEVELS[nextIndex].name;
  $('#replay-level-name').textContent = level.name;
  $('#screen-complete').classList.remove('hidden');
  hudToast('LEVEL CLEARED', 'gold', 1600);
  updateStats();
  updateCard();
  if (!practice) toast(`★ ${level.name} CLEARED`, '', 2200);
  try { audio.sfx('complete'); audio.setPaused(true); } catch {}
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
function bindEvents() {
  // nav
  $$('[data-nav]').forEach((btn) => btn.addEventListener('click', () => {
    const nav = btn.dataset.nav;
    clickSound();
    if (nav === 'play') { closeOverlays(); $menu.classList.remove('hidden'); }
    else showOverlay(nav);
    $$('[data-nav]').forEach((b) => b.classList.toggle('is-active', b === btn));
  }));
  $$('[data-close]').forEach((btn) => btn.addEventListener('click', () => { closeOverlays(); clickSound(); }));

  $('#btn-play').addEventListener('click', () => { clickSound(); startLevel(selected, false); });
  $('#btn-practice').addEventListener('click', () => { clickSound(); startLevel(selected, true); });
  $('#btn-card-play').addEventListener('click', () => { clickSound(); startLevel(selected, false); });
  $('#deck-prev').addEventListener('click', () => chooseLevel(selected - 1));
  $('#deck-next').addEventListener('click', () => chooseLevel(selected + 1));
  $('#user-chip').addEventListener('click', () => { chooseLevel(selected + 1); toast('LOADOUT UPDATED'); });

  $('#btn-pause').addEventListener('click', (e) => { e.stopPropagation(); pauseGame(); });
  $('#btn-resume').addEventListener('click', resumeGame);
  $('#btn-restart').addEventListener('click', () => {
    pauseGame._skip = true;
    paused = false;
    $pause.classList.add('hidden');
    game.restart(true);
    if (world) { world.clearFx(); world.showPlayer(true); }
    setStartOverlay(false);
    updateHud();
    hudToast(`ATTEMPT ${game.attempt}`, '', 900);
    try { audio.setPaused(false); } catch {}
    clickSound();
  });
  $('#btn-quit').addEventListener('click', quitToMenu);
  $('#btn-menu').addEventListener('click', quitToMenu);
  $('#btn-replay').addEventListener('click', () => { clickSound(); startLevel(selected, false); });
  $('#btn-next-level').addEventListener('click', () => {
    const next = Number($('#btn-next-level').dataset.next || 0);
    clickSound();
    startLevel(next, false);
  });

  // settings
  $('#set-music').addEventListener('input', (e) => {
    save.settings.music = Number(e.target.value);
    $('#set-music-val').textContent = save.settings.music;
    audio.setVolumes(save.settings.music / 100, save.settings.sfx / 100);
    persist();
  });
  $('#set-sfx').addEventListener('input', (e) => {
    save.settings.sfx = Number(e.target.value);
    $('#set-sfx-val').textContent = save.settings.sfx;
    audio.setVolumes(save.settings.music / 100, save.settings.sfx / 100);
    persist();
  });
  $('#set-scale').addEventListener('input', (e) => {
    save.settings.scale = Number(e.target.value);
    $('#set-scale-val').textContent = save.settings.scale;
    autoScaleFactor = 1; autoScaleStep = 0;
    if (world) world.setRenderScale(save.settings.scale / 100);
    persist();
  });
  bindToggle('#set-mute', 'muted', (v) => audio.setMuted(v));
  bindToggle('#set-bloom', 'bloom', (v) => world && world.setBloom(v && save.settings.scale > 50));
  bindToggle('#set-shake', 'shake', (v) => world && world.setShake(v));
  bindToggle('#set-trail', 'trail', (v) => world && world.setTrail(v));
  bindToggle('#set-checkpoints', 'checkpoints', (v) => { game.checkpointsSetting = v; });
  bindToggle('#set-pulse', 'pulse', (v) => { if (world) world.beatPulseEnabled = v; });

  // game events
  game.on('start', () => {
    save.totalAttempts++;
    recordFor(LEVELS[selected].id).attempts = (recordFor(LEVELS[selected].id).attempts || 0) + 1;
    persist();
    $('#hud-attempts').textContent = game.attempt;
  });
  game.on('jump', (e) => {
    save.totalJumps++;
    if (world) world.jump(e.x, e.y, e.orb);
    try { audio.sfx('jump'); } catch {}
    if (save.totalJumps % 10 === 0) persist();
  });
  game.on('pad', (e) => {
    if (world) world.pad(e.x, e.y);
    try { audio.sfx('jump'); } catch {}
  });
  game.on('coin', (e) => {
    if (world) world.coinBurst(e.x, e.y, 0.3);
    try { audio.sfx('coin'); } catch {}
    hudToast(`COIN ${e.count} / 3`, 'gold', 1000);
    const rec = recordFor(LEVELS[selected].id);
    rec.coins = Math.max(rec.coins || 0, game.coins.size);
    persist();
    updateCard();
    updateHud();
  });
  game.on('portal', (e) => {
    if (world) world.portal(e.mode, e.x, e.y);
    try { audio.sfx('portal'); } catch {}
    hudToast(`${e.mode.toUpperCase()} MODE`, '', 900);
    updateHud();
  });
  game.on('death', (e) => {
    if (world) world.death(e.x, e.y);
    try { audio.sfx('death'); } catch {}
    $deathFlash.classList.add('flash');
    setTimeout(() => $deathFlash.classList.remove('flash'), 110);
    const rec = recordFor(LEVELS[selected].id);
    if (!game.practice) {
      rec.best = Math.max(rec.best || 0, e.progress);
      rec.coins = Math.max(rec.coins || 0, game.coins.size);
      persist();
    }
    updateStats();
    updateCard();
    updateHud();
    clearTimeout(deathTimer);
    deathTimer = setTimeout(retryRun, 680);
  });
  game.on('respawn', () => {
    if (world) { world.clearFx(); world.showPlayer(true); }
  });
  game.on('complete', () => {
    if (world) world.complete(game.player.x, game.player.y);
    clearTimeout(completeTimer);
    completeTimer = setTimeout(completeRun, 850);
  });

  // input
  const isInteractive = (el) => el && el.closest('button, input, .overlay-screen, .modal-screen, .topbar, .level-card');
  window.addEventListener('pointerdown', (e) => {
    try { audio.init(); audio.resume?.(); } catch {}
    if (!gameActive) return;
    if (paused) return;
    if (isInteractive(e.target)) return;
    if (game.state === 'complete') return;
    beginRun();
    if (game.state === 'running') game.press();
  }, { passive: true });
  window.addEventListener('pointerup', () => { if (gameActive) game.release(); }, { passive: true });
  window.addEventListener('pointercancel', () => { if (gameActive) game.release(); }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (gameActive) {
        e.preventDefault();
        if (paused) resumeGame(); else pauseGame();
      } else closeOverlays();
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (!gameActive) {
        if (!$('#screen-menu').classList.contains('hidden') && !e.target.closest('button, input')) {
          e.preventDefault();
          startLevel(selected, false);
        }
        return;
      }
      e.preventDefault();
      if (paused) return;
      beginRun();
      if (game.state === 'running') game.press();
    }
    if (!gameActive) {
      if (e.code === 'ArrowRight') chooseLevel(selected + 1);
      if (e.code === 'ArrowLeft') chooseLevel(selected - 1);
      if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) chooseLevel(Number(e.code.slice(-1)) - 1);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      if (gameActive) game.release();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameActive && !paused && game.state === 'running') pauseGame();
  });
  window.addEventListener('blur', () => {
    if (gameActive && !paused && game.state === 'running') pauseGame();
  });
  window.addEventListener('beforeunload', () => persist(true));
  window.addEventListener('contextmenu', (e) => { if (gameActive) e.preventDefault(); });

  // audio pulses
  audio.onBeat((power) => {
    if (!world) return;
    if (save.settings.pulse === false) return;
    world.beat(power);
  });

  // click sounds on all buttons except game input
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn && !btn.closest('#hud') && btn.id !== 'btn-pause') clickSound();
  });
}

// ---------------------------------------------------------------------------
// Boot + loop
// ---------------------------------------------------------------------------
async function boot() {
  try {
    await document.fonts?.ready;
  } catch {}
  const statuses = [
    'CALIBRATING BASS CANNON',
    'WARMING NEON SHADERS',
    'TUNING GRAVITY',
    'LOADING LEVEL DECK',
    'SYNCING HEARTBEAT'
  ];
  let progress = 0;
  let si = 0;
  const fill = $('#boot-fill');
  const pct = $('#boot-pct');
  const status = $('#boot-status');
  const timer = setInterval(() => {
    progress = Math.min(100, progress + Math.random() * 16 + 6);
    fill.style.width = `${progress}%`;
    pct.textContent = `${Math.floor(progress)}%`;
    if (progress > (si + 1) * 19 && si < statuses.length - 1) {
      si++;
      status.textContent = statuses[si];
    }
    if (progress >= 100) {
      clearInterval(timer);
      status.textContent = 'READY TO RUN';
      setTimeout(finishBoot, 380);
    }
  }, 120);

  try {
    world = new World($('#scene'));
  } catch (err) {
    console.error(err);
    status.textContent = 'WEBGL UNAVAILABLE — TRY A MODERN BROWSER';
    return;
  }
  world.beatPulseEnabled = save.settings.pulse;
  applySettings();
  bindEvents();
  buildLevelGrid();
  updateStats();
  updateCard();
  world.buildMenu(LEVELS[selected]);
  syncSettingsUI();
  game.load(LEVELS[selected].id, { practice: false });

  const params = new URLSearchParams(location.search);
  if (params.get('debug') === '1') {
    $('#fps').classList.add('show');
    setInterval(() => { const f = fpsFrames ? Math.round(fpsAccum / fpsFrames) : 0; $('#fps').textContent = `${f} FPS`; }, 500);
  }

  requestAnimationFrame(loop);

  setTimeout(async () => {
    if (!bootDone) return;
    if (params.get('play') === '1') {
      const idx = clamp(Number(params.get('level') || selected), 0, LEVELS.length - 1);
      startLevel(idx, false);
      if (params.get('practice') === '1') startLevel(idx, true);
    }
  }, 2200);
}

function finishBoot() {
  bootDone = true;
  $('#boot').classList.add('done');
  // Start menu ambience on the first interaction (autoplay policy friendly).
  const kick = () => {
    try { audio.init(); audio.setTrack('menu'); } catch {}
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}

function adaptQuality(raw) {
  if (autoScaleStep >= 2) return;
  if (perfWarmup > 0) { perfWarmup -= raw; return; }
  perfClock += raw;
  perfFrames++;
  if (perfClock < 3) return;
  const fps = perfFrames / perfClock;
  perfClock = 0;
  perfFrames = 0;
  if (fps >= 45) return;
  autoScaleStep = fps < 32 ? 2 : 1;
  autoScaleFactor = autoScaleStep === 2 ? 0.68 : 0.82;
  if (!world) return;
  if (autoScaleStep === 2) world.setBloom(false);
  world.setRenderScale(((save.settings.scale || 100) / 100) * autoScaleFactor);
}

function loop(now) {
  const raw = (now - lastFrame) / 1000;
  lastFrame = now;
  const dt = Math.min(raw, 0.05);
  fpsAccum += raw; fpsFrames++;
  if (fpsFrames >= 30) { fpsAccum = 0; fpsFrames = 0; }

  adaptQuality(raw);

  if (!world) { requestAnimationFrame(loop); return; }
  if (gameActive) {
    if (!paused) game.update(dt);
    world.renderGame(paused ? 0 : dt, game);
    updateHud();
  } else {
    world.renderMenu(dt);
  }
  requestAnimationFrame(loop);
}

// Boot only after module is ready.
boot();

// Debug / automation surface.
window.__GEOMASH__ = {
  get world() { return world; },
  game, audio, LEVELS,
  startLevel,
  quitToMenu,
  beginRun,
  get state() { return { gameActive, paused, selected, save, gameState: game.state, progress: game.getProgress() }; },
  press() { beginRun(); game.press(); },
  release() { game.release(); },
  chooseLevel,
  skipIntro() { setStartOverlay(false); }
};
