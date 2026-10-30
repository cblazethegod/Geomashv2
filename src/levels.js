// Level data for GEOMASH. All distances are world units, speed is units/second.
// A level is authored as a flat list of entities; the engine turns it into
// spatial buckets on load.

class LevelBuilder {
  constructor(config) {
    this.config = config;
    this.entities = [];
    this.length = config.length;
    this._coin = 0;
  }

  raw(e) { this.entities.push(e); return this; }

  spike(x, count = 1, { y = 0, gap = 1 } = {}) {
    for (let i = 0; i < count; i++) this.raw({ type: 'spike', x: x + i * gap, y, w: 1, h: 1 });
    return this;
  }

  spikes(x, count = 1, opts = {}) { return this.spike(x, count, opts); }

  block(x, y, w, h, style = 'solid') {
    this.raw({ type: 'block', x: x + w / 2, y, w, h, style });
    return this;
  }

  saw(x, y = 1.15, r = 0.78) { this.raw({ type: 'saw', x, y, r }); return this; }

  pad(x, y = 0) { this.raw({ type: 'pad', x, y, w: 1.5 }); return this; }

  orb(x, y, kind = 'yellow') { this.raw({ type: 'orb', x, y, kind }); return this; }

  portal(x, y, mode) { this.raw({ type: 'portal', x, y, mode }); return this; }

  coin(x, y) { this.raw({ type: 'coin', x, y, id: this._coin++ }); return this; }

  checkpoint(x, y = 0.5) { this.raw({ type: 'checkpoint', x, y }); return this; }

  finish(x) { this.raw({ type: 'finish', x }); return this; }

  shipSection(start, end, { gap = 3.4, step = 11, centers = [3.6, 5.6, 4.2, 6.2] } = {}) {
    this.portal(start - 16, 3.8, 'ship');
    let i = 0;
    for (let x = start; x <= end; x += step) {
      const c = centers[i % centers.length];
      if (c - gap / 2 > 0.15) this.block(x - 0.7, 0, 1.4, c - gap / 2);
      this.block(x - 0.7, c + gap / 2, 1.4, 10 - (c + gap / 2));
      i++;
    }
    this.portal(end + 16, 1.4, 'cube');
    return this;
  }

  waveSection(start, end, { gap = 4.2, step = 9, centers = [3.2, 5.8, 3.4, 5.4], coinAt = 0.5 } = {}) {
    this.portal(start - 14, 4.2, 'wave');
    let i = 0;
    for (let x = start; x <= end; x += step) {
      const c = centers[i % centers.length];
      if (c - gap / 2 > 0.1) this.block(x - 0.7, 0, 1.4, c - gap / 2, 'hazard');
      this.block(x - 0.7, c + gap / 2, 1.4, 10 - (c + gap / 2), 'hazard');
      i++;
    }
    const cx = start + (end - start) * coinAt;
    this.coin(cx, 4.5);
    this.portal(end + 16, 1.3, 'cube');
    return this;
  }
}

function levelOne() {
  const b = new LevelBuilder({
    id: 'stereo-neon', index: 1, name: 'STEREO NEON', difficulty: 'NORMAL', difficultyRank: 2,
    theme: 'city', accent: '#2ef2ff', accent2: '#ff2fd0', bpm: 128, speed: 11.5, length: 660,
    desc: 'A midnight sprint through a city of light. Find the rhythm, trust the jump.',
    song: 'MIDNIGHT SIGNAL', artist: 'NEON DIVISION', tip: 'Hold jump to chain jumps the instant you land.'
  });

  // --- ignition -------------------------------------------------------------
  b.spike(30); b.spike(38); b.spikes(46, 2);
  b.block(56, 0, 4, 1); b.spike(66); b.spikes(74, 2); b.saw(84);
  b.spike(92); b.spike(100);

  // --- first flight ---------------------------------------------------------
  b.pad(109); b.coin(113.5, 5.15);
  b.spikes(122, 2); b.block(132, 0, 4, 1); b.spike(142); b.spikes(150, 2);
  b.saw(159); b.spike(168); b.spike(176); b.orb(184, 2.5); b.spikes(188, 2);

  // --- skyline (ship) -------------------------------------------------------
  b.shipSection(210, 322, { gap: 3.5, step: 11, centers: [3.5, 5.8, 4.1, 6.3] });
  b.coin(264, 4.2);

  // --- rebound --------------------------------------------------------------
  b.spike(348); b.spikes(356, 2); b.block(366, 0, 4, 1); b.spike(376); b.saw(384);
  b.spikes(393, 2); b.pad(402); b.block(408, 0, 5, 1.5); b.spike(419); b.spikes(427, 2);

  // --- tunnel (wave) --------------------------------------------------------
  b.waveSection(458, 566, { gap: 4.4, step: 9, centers: [3.1, 5.9, 3.2, 5.6] });

  // --- final push -----------------------------------------------------------
  b.spike(590); b.spikes(598, 2); b.block(608, 0, 4, 1); b.spike(618);
  b.saw(626); b.spikes(634, 2); b.spike(643); b.pad(650);
  b.finish(660);
  return b.config && { ...b.config, entities: b.entities };
}

function levelTwo() {
  const b = new LevelBuilder({
    id: 'cyber-drift', index: 2, name: 'CYBER DRIFT', difficulty: 'HARD', difficultyRank: 3,
    theme: 'sunset', accent: '#ff2fd0', accent2: '#ffb13d', bpm: 140, speed: 12.6, length: 760,
    desc: 'Sunset highways, laser saws, and a synth line that refuses to quit. Drift or die.',
    song: 'CHROME SUNSET', artist: 'V/ISION', tip: 'Release jump early to land sooner. Precision beats panic.'
  });

  b.spike(28); b.spikes(36, 2); b.block(45, 0, 3, 1); b.saw(54); b.spikes(63, 2);
  b.spike(72); b.pad(80); b.coin(84.5, 5.2); b.spikes(94, 2); b.block(103, 0, 4, 1);
  b.saw(113); b.spike(122); b.spikes(130, 3); b.block(142, 0, 3, 2); b.spike(151); b.spike(159);
  b.orb(167, 2.6); b.spikes(171, 3); b.block(182, 0, 4, 1);

  b.shipSection(205, 345, { gap: 3.1, step: 10, centers: [3.2, 6.2, 3.6, 6.6, 4.4] });
  b.coin(278, 5.2);

  b.spikes(370, 2); b.saw(379); b.block(388, 0, 3, 2); b.spike(398); b.spikes(406, 2);
  b.pad(415); b.spikes(419, 3); b.block(434, 0, 5, 1.5); b.saw(445); b.spike(454);
  b.spikes(462, 2); b.orb(470, 2.8); b.spikes(474, 3); b.spike(486); b.block(494, 0, 4, 1);

  b.waveSection(522, 646, { gap: 3.9, step: 8.5, centers: [3.0, 6.0, 3.4, 5.7] });

  b.spikes(672, 2); b.block(681, 0, 3, 1); b.saw(691); b.spike(700); b.spikes(708, 3);
  b.pad(719); b.spikes(724, 2); b.block(736, 0, 4, 2); b.spike(747); b.finish(760);
  return { ...b.config, entities: b.entities };
}

function levelThree() {
  const b = new LevelBuilder({
    id: 'void-protocol', index: 3, name: 'VOID PROTOCOL', difficulty: 'INSANE', difficultyRank: 5,
    theme: 'void', accent: '#b6ff3c', accent2: '#8f5bff', bpm: 150, speed: 13.8, length: 880,
    desc: 'The edge of the simulation. Everything is faster here. Including your heartbeat.',
    song: 'ZERO POINT', artist: 'NULL//SIGNAL', tip: 'In the wave, small taps beat long holds. Breathe with the beat.'
  });

  b.spike(26); b.spike(33); b.spikes(40, 2); b.saw(48); b.spike(56); b.spikes(63, 2);
  b.block(72, 0, 3, 1); b.spike(81); b.saw(89); b.spikes(97, 3); b.pad(102); b.coin(106.5, 5.2);
  b.spike(118); b.spikes(125, 2); b.block(134, 0, 3, 2); b.spike(143); b.orb(150, 2.7);
  b.spikes(154, 3); b.saw(164); b.spikes(172, 2); b.spike(180);

  b.shipSection(205, 375, { gap: 2.9, step: 9.5, centers: [3.0, 6.4, 3.5, 6.8, 4.6] });
  b.coin(290, 6.6);

  b.spikes(400, 2); b.block(409, 0, 3, 1); b.saw(418); b.spike(427); b.spikes(434, 3);
  b.pad(444); b.spikes(449, 3); b.block(463, 0, 5, 2); b.saw(477); b.spike(486); b.spikes(492, 2);
  b.orb(498, 2.6); b.spikes(502, 3); b.spike(514); b.block(522, 0, 3, 1); b.spikes(531, 2);

  b.waveSection(558, 704, { gap: 3.6, step: 8, centers: [3.0, 6.2, 3.3, 5.9, 4.6] });

  b.spike(730); b.spikes(738, 3); b.block(749, 0, 4, 2); b.saw(760); b.spike(769);
  b.pad(778); b.spikes(782, 3); b.block(797, 0, 5, 1.5); b.spike(808); b.saw(816);
  b.spikes(824, 2); b.spike(833); b.block(842, 0, 4, 1); b.spikes(853, 3); b.spike(866); b.finish(880);
  return { ...b.config, entities: b.entities };
}

export const LEVELS = [levelOne(), levelTwo(), levelThree()];

export const THEMES = {
  city: {
    sky: ['#080313', '#1a0b3c', '#071326'],
    fog: 0x09041a,
    ground: 0x150d2e,
    grid: [0x2ef2ff, 0xff2fd0],
    glow: 0x2ef2ff,
    ambient: 0x4a2f8f,
    key: 0x9fdcff,
    rim: 0xff2fd0,
    stars: 0xb9d8ff,
    mountain: 0x1a0d3c
  },
  sunset: {
    sky: ['#0c0414', '#35102f', '#180518'],
    fog: 0x120519,
    ground: 0x240d28,
    grid: [0xff2fd0, 0xffb13d],
    glow: 0xff2fd0,
    ambient: 0x7a2f50,
    key: 0xffd7b0,
    rim: 0xff3b9a,
    stars: 0xffccb8,
    mountain: 0x2a0a28
  },
  void: {
    sky: ['#03060a', '#0b1722', '#050208'],
    fog: 0x04080d,
    ground: 0x0b1820,
    grid: [0xb6ff3c, 0x8f5bff],
    glow: 0xb6ff3c,
    ambient: 0x2e5a44,
    key: 0xd8ffd0,
    rim: 0x8f5bff,
    stars: 0xd9ffcf,
    mountain: 0x0a1a18
  }
};

export const TOTAL_STARS = LEVELS.length * 3;
