import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { THEMES } from './levels.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

function disposeNode(node) {
  node.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

function glowTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.28, inner.replace(/[\d.]+\)$/, '0.55)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyTexture(theme, accent, accent2) {
  const w = 1600, h = 900;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, theme.sky[0]);
  grad.addColorStop(0.52, theme.sky[1]);
  grad.addColorStop(0.63, theme.sky[2]);
  grad.addColorStop(1, '#020106');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // stars
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.52;
    const a = Math.random() * 0.7 + 0.1;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
    ctx.fillRect(x, y, Math.random() * 1.8 + 0.4, Math.random() * 1.8 + 0.4);
  }

  // sun / portal disc
  const sx = w * 0.66, sy = h * 0.49, sr = h * 0.23;
  const halo = ctx.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 2.4);
  halo.addColorStop(0, `${accent2}55`);
  halo.addColorStop(0.4, `${accent2}18`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  const sun = ctx.createRadialGradient(sx - sr * 0.25, sy - sr * 0.3, sr * 0.05, sx, sy, sr);
  sun.addColorStop(0, 'rgba(255,255,255,0.95)');
  sun.addColorStop(0.28, accent);
  sun.addColorStop(0.7, accent2);
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // retro slices through the disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 7; i++) {
    const y = sy + sr * 0.05 + i * (sr * 0.13);
    ctx.fillStyle = `rgba(6,3,13,${0.45 + i * 0.07})`;
    ctx.fillRect(sx - sr, y, sr * 2, 4 + i * 2.2);
  }
  ctx.restore();

  // horizon haze
  const hz = ctx.createLinearGradient(0, h * 0.57, 0, h * 0.72);
  hz.addColorStop(0, 'rgba(0,0,0,0)');
  hz.addColorStop(0.55, `${accent}24`);
  hz.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hz;
  ctx.fillRect(0, h * 0.55, w, h * 0.2);

  // distant skyline
  ctx.fillStyle = 'rgba(5,2,12,0.82)';
  let x = 0;
  while (x < w) {
    const bw = rnd(24, 90);
    const bh = rnd(20, 120) * (x < w * 0.5 ? 1.2 : 0.85);
    ctx.fillRect(x, h * 0.63 - bh, bw, bh + 4);
    x += bw + rnd(6, 34);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeEnvMap(renderer, theme, accent, accent2) {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05030c');
  g.addColorStop(0.48, theme.sky[1]);
  g.addColorStop(0.52, '#0b0618');
  g.addColorStop(1, '#020105');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    ctx.globalAlpha = rnd(0.08, 0.38);
    ctx.fillStyle = i % 2 ? accent : accent2;
    const bw = rnd(6, 44), bh = rnd(10, 90);
    ctx.fillRect(rnd(0, w), rnd(h * 0.3, h * 0.75), bw, bh);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function blockTexture(accent, accent2) {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0618';
  ctx.fillRect(0, 0, s, s);
  // subtle panel noise
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
  ctx.strokeStyle = accent + '33';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((s / 4) * i, 0);
    ctx.lineTo((s / 4) * i, s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (s / 4) * i);
    ctx.lineTo(s, (s / 4) * i);
    ctx.stroke();
  }
  ctx.strokeStyle = accent + '99';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, s - 4, s - 4);
  ctx.strokeStyle = accent2 + '55';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s * 0.15, s * 0.82);
  ctx.lineTo(s * 0.38, s * 0.82);
  ctx.lineTo(s * 0.52, s * 0.66);
  ctx.lineTo(s * 0.8, s * 0.66);
  ctx.stroke();
  ctx.fillStyle = accent + 'cc';
  ctx.fillRect(s * 0.12, s * 0.12, s * 0.12, s * 0.03);
  ctx.fillStyle = accent2 + 'aa';
  ctx.fillRect(s * 0.76, s * 0.12, s * 0.12, s * 0.03);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const GROUND_VERT = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const GROUND_FRAG = `
uniform float uTime;
uniform float uPulse;
uniform float uPlayerX;
uniform vec3 uAccent;
uniform vec3 uAccent2;
varying vec3 vWorld;
float gridLine(vec2 p, float scale) {
  vec2 g = p * scale;
  vec2 d = abs(fract(g - 0.5) - 0.5) / fwidth(g);
  return 1.0 - min(min(d.x, d.y), 1.0);
}
void main() {
  vec2 p = vWorld.xz;
  float fine = gridLine(p, 0.5);
  float major = gridLine(p, 0.1);
  float d = abs(p.x - uPlayerX);
  float nearGlow = exp(-d * d * 0.014);
  float scan = smoothstep(0.86, 1.0, sin(p.x * 0.55 - uTime * 2.6) * 0.5 + 0.5);
  vec3 base = vec3(0.012, 0.009, 0.035);
  vec3 col = base;
  col += uAccent * fine * (0.18 + uPulse * 0.18);
  col += uAccent2 * major * 0.16;
  col += uAccent * nearGlow * 0.34;
  col += uAccent2 * scan * 0.035;
  float dist = length(p - cameraPosition.xz);
  col *= exp(-dist * 0.013);
  gl_FragColor = vec4(col, 1.0);
}`;

class ParticleField {
  constructor(scene, max = 900) {
    this.max = max;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.siz = new Float32Array(max);
    this.alp = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    for (let i = 0; i < max; i++) { this.pos[i * 3 + 1] = -1000; this.alp[i] = 0; }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.siz, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alp, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) } },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (320.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.06, d) * vAlpha;
          gl_FragColor = vec4(vColor * (1.2 + a), a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.mat = mat;
  }

  spawn(x, y, z, color, opts = {}) {
    const i = this.cursor++ % this.max;
    const { vx = 0, vy = 0, vz = 0, size = 0.3, life = 0.8, gravity = 0, drag = 0.98 } = opts;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.baseSize[i] = size;
    this.siz[i] = size;
    this.alp[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  burst(x, y, z, color, count, speed, opts = {}) {
    const { size = 0.35, life = 0.9, gravity = 0, drag = 0.94, spread = Math.PI * 2 } = opts;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * spread;
      const s = speed * rnd(0.25, 1);
      this.spawn(x, y, z, color, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s + (opts.vy || 0),
        vz: rnd(-s * 0.2, s * 0.2),
        size: size * rnd(0.45, 1.4),
        life: life * rnd(0.55, 1.2),
        gravity,
        drag
      });
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, alp, siz, baseSize, grav, drag } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { if (alp[i] !== 0) { alp[i] = 0; siz[i] = 0; } continue; }
      life[i] -= dt;
      const k = Math.max(0, life[i] / maxLife[i]);
      alp[i] = k * k;
      siz[i] = baseSize[i] * (0.4 + k * 0.8);
      vel[i * 3] *= drag[i];
      vel[i * 3 + 1] = vel[i * 3 + 1] * drag[i] - grav[i] * dt;
      vel[i * 3 + 2] *= drag[i];
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.max; i++) { this.life[i] = 0; this.alp[i] = 0; this.siz[i] = 0; }
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

class RingPool {
  constructor(scene) {
    this.items = [];
    const geo = new THREE.RingGeometry(0.72, 0.86, 56);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.z = 2;
      scene.add(mesh);
      this.items.push({ mesh, mat, life: 0, max: 1, speed: 1, grow: 1 });
    }
    this.cursor = 0;
  }

  spawn(x, y, color, { life = 0.5, speed = 9, size = 1, grow = 1 } = {}) {
    const it = this.items[this.cursor++ % this.items.length];
    it.mesh.position.set(x, y, 1.4);
    it.mesh.visible = true;
    it.mesh.scale.setScalar(size);
    it.mesh.rotation.z = Math.random() * Math.PI;
    it.mat.color.copy(color);
    it.mat.opacity = 0.9;
    it.life = life;
    it.max = life;
    it.speed = speed;
    it.grow = grow;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      it.mesh.scale.addScalar(it.speed * dt);
      it.mat.opacity = k * 0.8;
      if (it.life <= 0) it.mesh.visible = false;
    }
  }

  clear() { for (const it of this.items) { it.life = 0; it.mesh.visible = false; } }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setClearColor(0x05020c, 1);
    this.maxDpr = 1.5;
    this.scale = 1;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.62, 0.5, 0.48);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);

    this.mode = 'menu';
    this.time = 0;
    this.pulse = 0;
    this.shake = 0;
    this.shakeTime = 0;
    this.bloomEnabled = true;
    this.trailEnabled = true;
    this.shakeEnabled = true;
    this.menuLevel = null;
    this.level = null;
    this.game = null;
    this.tmpColor = new THREE.Color();

    this.menuScene = null;
    this.menuCam = null;
    this.buildMenu(null);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr) * this.scale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    if (this.menuCam) { this.menuCam.aspect = w / h; this.menuCam.updateProjectionMatrix(); }
    if (this.gameCam) { this.gameCam.aspect = w / h; this.gameCam.updateProjectionMatrix(); }
  }

  setRenderScale(scale) {
    this.scale = clamp(scale, 0.5, 1);
    this.resize();
  }

  setBloom(on) { this.bloomEnabled = on; this.bloom.enabled = on; }
  setTrail(on) { this.trailEnabled = on; }
  setShake(on) { this.shakeEnabled = on; }
  setQuality(level) {
    const low = level === 'low';
    this.maxDpr = low ? 1 : 1.5;
    this.setBloom(!low);
    this.resize();
  }

  beat(power = 1) {
    if (this.beatPulseEnabled === false) return;
    this.pulse = Math.max(this.pulse, power);
    if (this.menuHero) {
      this.menuHeroPulse = Math.max(this.menuHeroPulse || 0, power);
    }
  }

  addShake(amount) {
    if (!this.shakeEnabled) return;
    this.shake = Math.max(this.shake, amount);
  }

  themeFor(level) {
    const theme = THEMES[level?.theme || 'city'];
    const accent = new THREE.Color(level?.accent || '#2ef2ff');
    const accent2 = new THREE.Color(level?.accent2 || '#ff2fd0');
    return { theme, accent, accent2 };
  }

  // ---------------------------------------------------------------------------
  // Menu scene
  // ---------------------------------------------------------------------------
  buildMenu(level) {
    this.menuLevel = level;
    if (this.menuScene) disposeNode(this.menuScene);
    const themeData = this.themeFor(level || { theme: 'city', accent: '#2ef2ff', accent2: '#ff2fd0' });
    const { theme, accent, accent2 } = themeData;
    this.menuAccent = accent;
    this.menuAccent2 = accent2;
    const scene = new THREE.Scene();
    scene.background = skyTexture(theme, `#${accent.getHexString()}`, `#${accent2.getHexString()}`);
    scene.fog = new THREE.FogExp2(theme.fog, 0.0075);
    scene.environment = makeEnvMap(this.renderer, theme, `#${accent.getHexString()}`, `#${accent2.getHexString()}`);
    const cam = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.1, 260);
    cam.position.set(0.4, 3.7, 15.5);
    cam.lookAt(0.9, 2.9, 0);
    scene.add(new THREE.AmbientLight(theme.ambient, 1.35));
    const key = new THREE.DirectionalLight(theme.key, 2.4);
    key.position.set(-3, 9, 8);
    scene.add(key);
    const rim = new THREE.PointLight(accent2, 60, 40, 2);
    rim.position.set(7, 4, -4);
    scene.add(rim);
    const fill = new THREE.PointLight(accent, 34, 30, 2);
    fill.position.set(-6, 2, 8);
    scene.add(fill);

    this.menuGround = this.createGround(scene, theme, accent, accent2);
    const city = this.createCity(theme, accent, accent2, true);
    scene.add(city);
    this.menuCity = city;
    const stars = this.createStars(theme);
    scene.add(stars);
    this.menuStars = stars;

    const hero = new THREE.Group();
    hero.position.set(1.3, 3.55, 0);
    const cube = this.createCubeVisual(accent, accent2, 2.7);
    hero.add(cube);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: accent, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.set(6.4, 6.4, 1);
    halo.position.z = -0.6;
    hero.add(halo);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, toneMapped: false }));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: accent2, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, toneMapped: false }));
    hero.add(ring1, ring2);
    this.menuHero = hero;
    this.menuRing1 = ring1;
    this.menuRing2 = ring2;
    scene.add(hero);

    // portal behind the hero
    const portal = new THREE.Group();
    portal.position.set(1.3, 3.8, -7);
    const p1 = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.06, 8, 120), new THREE.MeshBasicMaterial({ color: accent2, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, toneMapped: false }));
    const p2 = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.02, 8, 120), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, toneMapped: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ color: accent2, transparent: true, opacity: 0.05, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    portal.add(p1, p2, disc);
    this.menuPortal = portal;
    scene.add(portal);

    // ground spikes and platform fragments for a diorama feel
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x160a24, metalness: 0.8, roughness: 0.25, emissive: accent2, emissiveIntensity: 0.22 });
    const spikeGeo = this.spikeGeometry();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(spikeGeo, spikeMat);
      s.position.set(4.6 + i * 1.25, 0, rnd(-1, 2));
      s.scale.setScalar(rnd(0.8, 1.5));
      scene.add(s);
    }
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.24, 2.6), new THREE.MeshStandardMaterial({ color: 0x0b0618, metalness: 0.9, roughness: 0.2, emissive: accent, emissiveIntensity: 0.06 }));
    pedestal.position.set(1.3, 0.12, 0);
    scene.add(pedestal);
    const pedEdge = new THREE.LineSegments(new THREE.EdgesGeometry(pedestal.geometry), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.8, toneMapped: false }));
    pedEdge.position.copy(pedestal.position);
    scene.add(pedEdge);

    this.menuParticles = new ParticleField(scene, 500);
    this.menuRings = new RingPool(scene);
    this.menuScene = scene;
    this.menuCam = cam;
    this.menuClock = 0;
    this.menuHeroPulse = 0;
    this.menuSparks = 0;
  }

  // ---------------------------------------------------------------------------
  // Game scene
  // ---------------------------------------------------------------------------
  buildGame(level, game) {
    this.level = level;
    this.game = game;
    if (this.gameScene) disposeNode(this.gameScene);
    const { theme, accent, accent2 } = this.themeFor(level);
    this.accent = accent;
    this.accent2 = accent2;
    this.theme = theme;

    const scene = new THREE.Scene();
    scene.background = skyTexture(theme, `#${accent.getHexString()}`, `#${accent2.getHexString()}`);
    scene.fog = new THREE.FogExp2(theme.fog, 0.012);
    scene.environment = makeEnvMap(this.renderer, theme, `#${accent.getHexString()}`, `#${accent2.getHexString()}`);
    const cam = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 260);
    cam.position.set(4, 3.2, 13.2);
    scene.add(new THREE.AmbientLight(theme.ambient, 1.3));
    const hemi = new THREE.HemisphereLight(theme.key, theme.ground, 0.8);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(theme.key, 2.1);
    key.position.set(5, 16, 12);
    scene.add(key);
    const rim = new THREE.PointLight(accent2, 60, 45, 2);
    rim.position.set(10, 7, -6);
    scene.add(rim);

    const ground = this.createGround(scene, theme, accent, accent2);
    this.gameGround = ground;
    const city = this.createCity(theme, accent, accent2, false);
    scene.add(city);
    this.gameCity = city;
    const stars = this.createStars(theme);
    scene.add(stars);
    this.gameStars = stars;

    const decor = new THREE.Group();
    scene.add(decor);
    this.gameDecor = decor;
    this.buildDecor(decor, level, accent, accent2);

    const levelGroup = new THREE.Group();
    scene.add(levelGroup);
    this.levelGroup = levelGroup;

    this.blockTex = blockTexture(`#${accent.getHexString()}`, `#${accent2.getHexString()}`);
    this.blockMat = new THREE.MeshStandardMaterial({
      color: 0x241a42, map: this.blockTex, metalness: 0.82, roughness: 0.24,
      emissive: accent, emissiveIntensity: 0.16, envMapIntensity: 1.15
    });
    this.blockHazardMat = new THREE.MeshStandardMaterial({
      color: 0x2a1024, map: this.blockTex, metalness: 0.8, roughness: 0.3,
      emissive: 0xff3b5c, emissiveIntensity: 0.20, envMapIntensity: 1.1
    });
    this.blockEdgeMat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.92, toneMapped: false });
    this.blockEdgeHazardMat = new THREE.LineBasicMaterial({ color: 0xff5c78, transparent: true, opacity: 0.94, toneMapped: false });
    this.hazardMat = new THREE.MeshStandardMaterial({ color: 0x210814, metalness: 0.86, roughness: 0.2, emissive: 0xff2f4d, emissiveIntensity: 0.5, envMapIntensity: 1.2 });
    this.glowTex = glowTexture();
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.unitEdges = new THREE.EdgesGeometry(this.unitBox);
    this.spikeGeo = this.spikeGeometry();

    this.createLevelObjects(level, levelGroup);
    this.createPlayer(scene);
    this.gameParticles = new ParticleField(scene, 1100);
    this.gameRings = new RingPool(scene);
    this.gameScene = scene;
    this.gameCam = cam;
    this.camTarget = new THREE.Vector3(8, 2, 0);
    this.camPos = new THREE.Vector3(2.2, 3.25, 13.2);
    this.lastPlayer = { x: 0, y: 0 };
    this.trailAccum = 0;
    this.deathTime = 0;
    this.levelEnd = level.length;
    this.flash = 0;
    this.pulse = 0;
    this.portalCue = 0;
  }

  spikeGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0);
    shape.lineTo(0.5, 0);
    shape.lineTo(0, 1);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false, steps: 1 });
    geo.translate(0, 0, -0.4);
    return geo;
  }

  createGround(scene, theme, accent, accent2) {
    this.groundUniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uPlayerX: { value: 0 },
      uAccent: { value: accent.clone() },
      uAccent2: { value: accent2.clone() }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: this.groundUniforms,
      side: THREE.DoubleSide
    });
    const geo = new THREE.PlaneGeometry(620, 90);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, -26);
    scene.add(mesh);
    // leading edge lip
    const lipMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, toneMapped: false, blending: THREE.AdditiveBlending });
    const lip = new THREE.Mesh(new THREE.BoxGeometry(620, 0.025, 0.05), lipMat);
    lip.position.set(0, 0.012, -2.2);
    scene.add(lip);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(620, 70), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.set(0, -0.08, -22);
    scene.add(under);
    return { mesh, lip, under };
  }

  createCity(theme, accent, accent2, menu) {
    const group = new THREE.Group();
    const count = menu ? 42 : 64;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: theme.mountain, metalness: 0.7, roughness: 0.5, emissive: 0x000000, envMapIntensity: 0.5 });
    const towers = new THREE.InstancedMesh(geo, mat, count);
    const barGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, toneMapped: false, blending: THREE.AdditiveBlending });
    const bars = new THREE.InstancedMesh(barGeo, barMat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const x = menu ? rnd(-42, 46) : rnd(-55, 62);
      const z = rnd(-24, -62);
      const h = rnd(4, menu ? 20 : 27);
      const w = rnd(1.6, 5.5);
      dummy.position.set(x, h / 2 - 0.5, z);
      dummy.scale.set(w, h, rnd(1.4, 3.5));
      dummy.rotation.y = rnd(-0.12, 0.12);
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + rnd(-w / 2, w / 2), h - 0.5 + rnd(0, 2), z - 0.5);
      dummy.scale.set(1, rnd(1, 4), 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bars.setMatrixAt(i, dummy.matrix);
      const c = i % 3 === 0 ? accent2 : accent;
      bars.setColorAt(i, c);
    }
    towers.instanceMatrix.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    group.add(towers, bars);
    group.userData.parallax = menu ? 0.5 : 0.72;
    return group;
  }

  createStars(theme) {
    const count = 900;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd(-140, 200);
      pos[i * 3 + 1] = rnd(4, 80);
      pos[i * 3 + 2] = rnd(-30, -130);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: theme.stars, size: 0.32, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const points = new THREE.Points(geo, mat);
    points.userData.parallax = 0.25;
    return points;
  }

  buildDecor(group, level, accent, accent2) {
    // glowing arches in the deep background
    const ringGeo = new THREE.TorusGeometry(5.2, 0.022, 6, 80);
    const ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, toneMapped: false, depthWrite: false });
    const ringMat2 = ringMat.clone();
    ringMat2.color = accent2;
    ringMat2.opacity = 0.12;
    for (let x = 30; x < level.length; x += 46) {
      const m = new THREE.Mesh(ringGeo, x % 92 === 30 ? ringMat : ringMat2);
      m.position.set(x, 4.4, -15);
      m.rotation.y = 0.05;
      group.add(m);
    }
    // low side rails
    for (const z of [-4.4, 4.4]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(level.length + 100, 0.035, 0.05), new THREE.MeshBasicMaterial({ color: z < 0 ? accent : accent2, transparent: true, opacity: 0.5, toneMapped: false, blending: THREE.AdditiveBlending }));
      rail.position.set(level.length / 2, 0.06, z);
      group.add(rail);
    }
    // pillars
    const pGeo = new THREE.BoxGeometry(0.09, 1, 0.09);
    const pMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3, toneMapped: false, blending: THREE.AdditiveBlending });
    const pInst = new THREE.InstancedMesh(pGeo, pMat, Math.floor(level.length / 18) * 2);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let x = 12; x < level.length; x += 18) {
      for (const z of [-6.5, -9.2]) {
        const h = rnd(1.3, 4.6);
        dummy.position.set(x + rnd(-3, 3), h / 2, z);
        dummy.scale.set(1, h, 1);
        dummy.updateMatrix();
        pInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    pInst.instanceMatrix.needsUpdate = true;
    group.add(pInst);
    // fog cards for depth haze
    const hazeTex = glowTexture(128, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    for (let i = 0; i < 6; i++) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, color: i % 2 ? accent2 : accent, transparent: true, opacity: rnd(0.025, 0.06), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      spr.position.set(rnd(0, level.length), rnd(2, 12), rnd(-10, -40));
      spr.scale.set(rnd(22, 50), rnd(16, 30), 1);
      group.add(spr);
    }
  }

  createLevelObjects(level, group) {
    const accent = this.accent;
    const accent2 = this.accent2;
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc23d, metalness: 1, roughness: 0.18, emissive: 0xff8a00, emissiveIntensity: 0.65, envMapIntensity: 1.4 });
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false });
    const orbMat2 = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.28, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.animated = [];
    this.portals = [];
    this.coinMeshes = new Map();
    this.padMeshes = [];

    for (const e of level.entities) {
      if (e.type === 'block') {
        const isHazard = e.style === 'hazard';
        const mesh = new THREE.Mesh(this.unitBox, isHazard ? this.blockHazardMat : this.blockMat);
        mesh.scale.set(e.w, e.h, 1.25);
        mesh.position.set(e.x, e.y + e.h / 2, 0);
        group.add(mesh);
        const edge = new THREE.LineSegments(this.unitEdges, isHazard ? this.blockEdgeHazardMat : this.blockEdgeMat);
        edge.scale.set(e.w * 1.005, e.h * 1.005, 1.26);
        edge.position.copy(mesh.position);
        group.add(edge);
        // small glowing seam
        if (e.h > 0.8) {
          const seam = new THREE.Mesh(new THREE.PlaneGeometry(e.w * 0.82, 0.018), new THREE.MeshBasicMaterial({ color: isHazard ? 0xff5c78 : accent, transparent: true, opacity: 0.7, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
          seam.position.set(e.x, e.y + e.h * 0.5, 0.64);
          group.add(seam);
        }
      } else if (e.type === 'spike') {
        const g = new THREE.Group();
        const mesh = new THREE.Mesh(this.spikeGeo, this.hazardMat);
        mesh.position.set(e.x, e.y, 0);
        g.add(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(this.spikeGeo), new THREE.LineBasicMaterial({ color: 0xff6a84, transparent: true, opacity: 0.75, toneMapped: false }));
        edges.position.copy(mesh.position);
        g.add(edges);
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.78, 4), new THREE.MeshBasicMaterial({ color: 0xff2f4d, transparent: true, opacity: 0.35, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
        inner.position.set(e.x, e.y + 0.42, 0.42);
        inner.rotation.x = Math.PI;
        g.add(inner);
        group.add(g);
      } else if (e.type === 'saw') {
        const g = new THREE.Group();
        g.position.set(e.x, e.y, 0);
        const gearShape = new THREE.Shape();
        const teeth = 12;
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const r = i % 2 === 0 ? e.r : e.r * 0.76;
          const x = Math.cos(a) * r, y = Math.sin(a) * r;
          if (i === 0) gearShape.moveTo(x, y); else gearShape.lineTo(x, y);
        }
        gearShape.closePath();
        const gear = new THREE.Mesh(new THREE.ExtrudeGeometry(gearShape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }), new THREE.MeshStandardMaterial({ color: 0x2a0b18, metalness: 1, roughness: 0.2, emissive: 0xff2f4d, emissiveIntensity: 0.36, envMapIntensity: 1.3 }));
        gear.position.z = -0.08;
        g.add(gear);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(e.r * 0.25, e.r * 0.25, 0.24, 16), new THREE.MeshStandardMaterial({ color: 0x120610, metalness: 1, roughness: 0.15 }));
        hub.rotation.x = Math.PI / 2;
        g.add(hub);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(e.r * 0.62, 0.02, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff6a84, transparent: true, opacity: 0.7, toneMapped: false, blending: THREE.AdditiveBlending }));
        ring.position.z = 0.12;
        g.add(ring);
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff2f4d, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        spr.scale.set(e.r * 4, e.r * 4, 1);
        g.add(spr);
        g.userData.spin = rnd(1.3, 2.2) * (Math.random() > 0.5 ? 1 : -1);
        this.animated.push(g);
        group.add(g);
      } else if (e.type === 'pad') {
        const g = new THREE.Group();
        g.position.set(e.x, e.y, 0);
        const base = new THREE.Mesh(new THREE.BoxGeometry(e.w, 0.1, 1.25), new THREE.MeshStandardMaterial({ color: 0x2b2205, metalness: 0.9, roughness: 0.25, emissive: 0xffd21e, emissiveIntensity: 0.8 }));
        base.position.y = 0.05;
        g.add(base);
        for (let i = 0; i < 3; i++) {
          const chev = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 3), orbMat);
          chev.position.set(-0.42 + i * 0.42, 0.19, 0.42);
          chev.rotation.z = Math.PI;
          g.add(chev);
        }
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffe14d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        spr.scale.set(3.2, 1.7, 1);
        spr.position.y = 0.1;
        g.add(spr);
        this.padMeshes.push(g);
        group.add(g);
      } else if (e.type === 'orb') {
        const g = new THREE.Group();
        g.position.set(e.x, e.y, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.055, 8, 48), orbMat);
        ring.rotation.x = 0.35;
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 6, 40), orbMat2);
        ring2.rotation.x = -0.5;
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6b0, toneMapped: false }));
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffe14d, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        spr.scale.set(3.4, 3.4, 1);
        g.add(ring, ring2, core, spr);
        g.userData.bob = rnd(0, Math.PI * 2);
        g.userData.orb = true;
        this.animated.push(g);
        group.add(g);
      } else if (e.type === 'coin') {
        const g = new THREE.Group();
        g.position.set(e.x, e.y, 0);
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 28), coinMat);
        coin.rotation.x = Math.PI / 2;
        coin.rotation.z = 0.25;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.025, 6, 36), new THREE.MeshBasicMaterial({ color: 0xffdd77, transparent: true, opacity: 0.8, toneMapped: false, blending: THREE.AdditiveBlending }));
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = 0.25;
        const star = new THREE.Mesh(new THREE.CircleGeometry(0.19, 5), new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false }));
        star.position.z = 0.065;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffb62e, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        spr.scale.set(2.6, 2.6, 1);
        g.add(coin, ring, star, spr);
        g.userData.coin = true;
        g.userData.baseY = e.y;
        this.coinMeshes.set(e.id, g);
        this.animated.push(g);
        group.add(g);
      } else if (e.type === 'portal') {
        const color = e.mode === 'ship' ? 0xff2fd0 : e.mode === 'wave' ? 0xb6ff3c : 0x2ef2ff;
        const g = new THREE.Group();
        g.position.set(e.x, e.y, 0);
        const outer = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.075, 8, 80), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        const inner = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.025, 6, 80), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, toneMapped: false, blending: THREE.AdditiveBlending }));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.42, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        spr.scale.set(7.2, 7.2, 1);
        g.add(outer, inner, disc, spr);
        g.userData.portal = true;
        g.userData.color = color;
        this.portals.push(g);
        this.animated.push(g);
        group.add(g);
      } else if (e.type === 'checkpoint') {
        const g = new THREE.Group();
        g.position.set(e.x, e.y + 1.8, 0);
        const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xb6ff3c, transparent: true, opacity: 0.5, toneMapped: false, wireframe: false }));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 5, 32), new THREE.MeshBasicMaterial({ color: 0xb6ff3c, transparent: true, opacity: 0.5, toneMapped: false }));
        g.add(diamond, ring);
        g.userData.orb = true;
        this.animated.push(g);
        group.add(g);
      } else if (e.type === 'finish') {
        const g = new THREE.Group();
        g.position.set(e.x, 0, 0);
        const gate = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.09, 10, 100), new THREE.MeshBasicMaterial({ color: 0xb6ff3c, toneMapped: false }));
        gate.position.y = 4;
        const gate2 = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.035, 8, 100), new THREE.MeshBasicMaterial({ color: 0x2ef2ff, transparent: true, opacity: 0.7, toneMapped: false, blending: THREE.AdditiveBlending }));
        gate2.position.y = 4;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(3.35, 64), new THREE.MeshBasicMaterial({ color: 0xb6ff3c, transparent: true, opacity: 0.07, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        disc.position.y = 4;
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xb6ff3c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        spr.position.y = 4;
        spr.scale.set(13, 13, 1);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.6, 10, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xb6ff3c, transparent: true, opacity: 0.07, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        beam.position.y = 5;
        g.add(gate, gate2, disc, spr, beam);
        group.add(g);
      }
    }
  }

  createCubeVisual(accent, accent2, size = 0.92) {
    const g = new THREE.Group();
    const bodyGeo = new RoundedBoxGeometry(size, size, size, 3, size * 0.09);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({
      color: 0x17102e, metalness: 0.92, roughness: 0.16,
      emissive: accent, emissiveIntensity: 0.22,
      clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3
    }));
    g.add(body);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size * 1.005, size * 1.005, size * 1.005)), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.95, toneMapped: false }));
    g.add(edges);
    const core = new THREE.Mesh(new THREE.BoxGeometry(size * 0.34, size * 0.34, size * 0.34), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
    core.position.z = size * 0.28;
    g.add(core);
    const core2 = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.62, size * 0.62), new THREE.MeshBasicMaterial({ color: accent2, transparent: true, opacity: 0.16, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    core2.position.z = size * 0.51;
    g.add(core2);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex || glowTexture(), color: accent, transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    spr.scale.set(size * 1.9, size * 1.9, 1);
    g.add(spr);
    g.userData.core = core;
    g.userData.sprite = spr;
    return g;
  }

  createPlayer(scene) {
    const group = new THREE.Group();
    group.position.set(0, 0.5, 0);
    const accent = this.accent, accent2 = this.accent2;
    const cube = this.createCubeVisual(accent, accent2, 0.92);
    const ship = new THREE.Group();
    const shipBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.4, 0.55), new THREE.MeshPhysicalMaterial({ color: 0x190d2e, metalness: 0.95, roughness: 0.14, emissive: accent, emissiveIntensity: 0.3, clearcoat: 1 }));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x2a174c, metalness: 1, roughness: 0.15, emissive: accent, emissiveIntensity: 0.45 }));
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.9;
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.7), new THREE.MeshStandardMaterial({ color: 0x22113c, metalness: 0.95, roughness: 0.2, emissive: accent2, emissiveIntensity: 0.3 }));
    wingL.position.set(-0.2, 0.03, 0.42);
    wingL.rotation.y = 0.18;
    const wingR = wingL.clone();
    wingR.position.z = -0.42;
    wingR.rotation.y = -0.18;
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0x0a2030, metalness: 0.4, roughness: 0.05, transmission: 0.4, emissive: accent, emissiveIntensity: 0.2 }));
    cockpit.position.set(0.25, 0.18, 0);
    cockpit.scale.set(1.6, 0.6, 0.9);
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.22, 12), new THREE.MeshBasicMaterial({ color: accent2, toneMapped: false }));
    engine.rotation.z = Math.PI / 2;
    engine.position.x = -0.72;
    const engGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: accent2, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    engGlow.scale.set(1.4, 1.4, 1);
    engGlow.position.x = -0.9;
    ship.add(shipBody, nose, wingL, wingR, cockpit, engine, engGlow);
    ship.visible = false;

    const wave = new THREE.Group();
    const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), new THREE.MeshStandardMaterial({ color: 0x0b2018, metalness: 0.9, roughness: 0.1, emissive: 0xb6ff3c, emissiveIntensity: 0.8 }));
    const diaEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.34)), new THREE.LineBasicMaterial({ color: 0xd8ffb0, toneMapped: false }));
    const diaGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xb6ff3c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    diaGlow.scale.set(2.6, 2.6, 1);
    wave.add(dia, diaEdge, diaGlow);
    wave.visible = false;

    group.add(cube, ship, wave);
    const light = new THREE.PointLight(accent, 13, 7, 2);
    light.position.set(0, 0, 1);
    group.add(light);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    scene.add(shadow);
    scene.add(group);
    this.playerGroup = group;
    this.playerCube = cube;
    this.playerShip = ship;
    this.playerWave = wave;
    this.playerShadow = shadow;
    this.playerLight = light;
    this.playerMode = 'cube';
  }

  // ---------------------------------------------------------------------------
  // Update / render
  // ---------------------------------------------------------------------------
  updateGame(dt, game) {
    this.time += dt;
    this.pulse = Math.max(0, this.pulse - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const p = game.player;
    if (!p) return;
    const accent = this.accent;
    const accent2 = this.accent2;

    let displayY = p.y;
    if (game.state === 'dead') {
      const t = (performance.now() - p.deathAt) / 1000;
      displayY += Math.max(0, t * 1.4);
    }
    this.playerGroup.position.set(p.x, displayY, 0);
    const mode = p.mode;
    if (mode !== this.playerMode) {
      this.playerMode = mode;
      this.playerCube.visible = mode === 'cube';
      this.playerShip.visible = mode === 'ship';
      this.playerWave.visible = mode === 'wave';
      this.playerLight.color.set(mode === 'wave' ? 0xb6ff3c : mode === 'ship' ? 0xff2fd0 : accent);
    }
    if (game.state === 'dead') {
      this.playerGroup.visible = false;
    } else {
      this.playerGroup.visible = true;
    }
    if (mode === 'cube') {
      this.playerCube.rotation.z = p.rotation;
    } else if (mode === 'ship') {
      this.playerShip.rotation.z = p.rotation;
      this.playerShip.rotation.x = -p.rotation * 0.25;
    } else if (mode === 'wave') {
      this.playerWave.rotation.z = p.rotation;
      this.playerWave.rotation.y += dt * 2.5;
    }
    const core = this.playerCube.userData.core;
    if (core) core.rotation.z -= dt * 2.2;
    this.playerShadow.position.set(p.x, 0.02, 0);
    const h = Math.max(0, p.y - 0.5);
    this.playerShadow.scale.setScalar(clamp(1 - h * 0.05, 0.35, 1));
    this.playerShadow.material.opacity = clamp(0.5 - h * 0.035, 0.06, 0.5);

    // trail
    if (this.trailEnabled && game.state === 'running') {
      this.trailAccum += dt;
      const interval = mode === 'ship' || mode === 'wave' ? 0.012 : 0.025;
      while (this.trailAccum > interval) {
        this.trailAccum -= interval;
        const spread = mode === 'cube' ? 0.35 : 0.25;
        const color = mode === 'wave' ? new THREE.Color(0xb6ff3c) : mode === 'ship' ? accent2 : accent;
        this.gameParticles.spawn(
          p.x - 0.5 + rnd(-spread, spread), p.y + rnd(-spread, spread), rnd(-0.1, 0.2),
          color,
          { vx: rnd(-2.5, 0.5), vy: rnd(-0.3, 0.3), vz: rnd(-0.1, 0.1), size: rnd(0.12, 0.3), life: rnd(0.25, 0.55), drag: 0.93 }
        );
      }
    }

    this.updateCamera(dt, game);
    this.updateAnimated(dt, game);
    if (this.gameParticles) this.gameParticles.update(dt);
    if (this.gameRings) this.gameRings.update(dt);
    if (this.gameGround) {
      const gx = this.gameCam.position.x;
      this.gameGround.mesh.position.x = gx;
      this.gameGround.lip.position.x = gx;
      this.gameGround.under.position.x = gx;
      this.groundUniforms.uTime.value = this.time;
      this.groundUniforms.uPulse.value = this.pulse;
      this.groundUniforms.uPlayerX.value = p.x;
    }
    if (this.gameCity) {
      this.gameCity.position.x = this.gameCam.position.x * 0.72;
      this.gameCity.position.y = Math.sin(this.time * 0.07) * 0.3;
    }
    if (this.gameStars) this.gameStars.position.x = this.gameCam.position.x * 0.32;
    if (this.gameDecor) this.gameDecor.position.x = 0;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.bloom.strength = 0.62 + this.pulse * 0.18 + this.flash * 0.3;
    this.renderer.toneMappingExposure = 1.06 + this.pulse * 0.04;
  }

  updateCamera(dt, game) {
    const p = game.player;
    if (!p) return;
    const mode = p.mode;
    const baseY = mode === 'cube'
      ? clamp(p.y + 2.55, 3.25, 6.2)
      : clamp(p.y + 1.7, 4.2, 9.4);
    const targetX = p.x + 2.2;
    const targetY = mode === 'cube' ? p.y + 1.62 : p.y + 1.0;
    const lerp = 1 - Math.pow(0.001, dt);
    this.camPos.x += (targetX - this.camPos.x) * lerp * 0.9;
    this.camPos.y += (baseY - this.camPos.y) * lerp * 0.8;
    this.camPos.z = 13.2;
    const shake = this.shakeEnabled ? this.shake : 0;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    this.gameCam.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.gameCam.lookAt(p.x + 4.9 + sx * 0.3, targetY + sy * 0.4, 0);
    const targetFov = 54 + this.pulse * 1.2 + (mode === 'wave' ? 2 : 0);
    this.gameCam.fov += (targetFov - this.gameCam.fov) * Math.min(1, dt * 6);
    this.gameCam.updateProjectionMatrix();
  }

  updateAnimated(dt, game) {
    this.animatedClock = (this.animatedClock || 0) + dt;
    for (const g of this.animated) {
      if (g.userData.spin) g.rotation.z += g.userData.spin * dt;
      if (g.userData.bob !== undefined) {
        g.position.y = (g.userData.baseY ?? g.position.y) + Math.sin(this.animatedClock * 2 + g.userData.bob) * 0.16;
        g.rotation.y = Math.sin(this.animatedClock * 1.4 + g.userData.bob) * 0.4;
      }
      if (g.userData.coin) g.rotation.y += dt * 2.4;
      if (g.userData.portal) g.rotation.z += dt * 0.65;
    }
    // hide collected coins with a little pop
    if (game && game.coins) {
      for (const [id, mesh] of this.coinMeshes || []) {
        const collected = game.coins.has(id);
        if (collected) {
          if (mesh.visible) {
            mesh.visible = false;
            this.coinBurst(mesh.position.x, mesh.position.y, mesh.position.z);
          }
        } else if (!mesh.visible) {
          mesh.visible = true;
        }
      }
    }
  }

  updateMenu(dt) {
    this.time += dt;
    this.menuClock += dt;
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.menuHeroPulse = Math.max(0, (this.menuHeroPulse || 0) - dt * 2.2);
    const t = this.menuClock;
    const cam = this.menuCam;
    cam.position.x = 0.4 + Math.sin(t * 0.14) * 0.65;
    cam.position.y = 3.7 + Math.sin(t * 0.2) * 0.18;
    cam.position.z = 15.5 + Math.sin(t * 0.11) * 0.35;
    cam.lookAt(0.9 + Math.sin(t * 0.16) * 0.2, 2.95, 0);
    cam.fov = 47 + Math.sin(t * 0.3) * 0.4 + this.menuHeroPulse * 1.2;
    cam.updateProjectionMatrix();
    if (this.menuHero) {
      this.menuHero.rotation.y = Math.sin(t * 0.28) * 0.28;
      this.menuHero.rotation.x = Math.sin(t * 0.21) * 0.09;
      const s = 1 + this.menuHeroPulse * 0.025;
      this.menuHero.scale.setScalar(s);
      this.menuRing1.rotation.z = t * 0.4;
      this.menuRing1.rotation.x = 0.6 + Math.sin(t * 0.3) * 0.2;
      this.menuRing2.rotation.z = -t * 0.28;
      this.menuRing2.rotation.x = -0.4 + Math.cos(t * 0.24) * 0.2;
    }
    if (this.menuPortal) {
      this.menuPortal.rotation.z = Math.sin(t * 0.18) * 0.08;
    }
    if (this.menuCity) {
      this.menuCity.position.x = Math.sin(t * 0.03) * 2;
    }
    if (this.menuStars) this.menuStars.rotation.y = t * 0.005;
    if (this.menuParticles) {
      this.menuSparks = (this.menuSparks || 0) + dt;
      while (this.menuSparks > 0.07) {
        this.menuSparks -= 0.07;
        const accent = Math.random() > 0.5 ? this.menuAccent : this.menuAccent2;
        this.menuParticles.spawn(rnd(-8, 10), rnd(0.5, 9), rnd(-5, 3), accent, {
          vx: rnd(-0.2, 0.2), vy: rnd(0.15, 0.7), vz: rnd(-0.1, 0.1),
          size: rnd(0.05, 0.2), life: rnd(1.5, 3.5), drag: 0.99
        });
      }
      this.menuParticles.update(dt);
    }
    if (this.menuRings) this.menuRings.update(dt);
    if (this.menuGround) {
      this.groundUniforms.uTime.value = this.time;
      this.groundUniforms.uPulse.value = this.pulse;
      this.groundUniforms.uPlayerX.value = 1.3;
    }
    this.bloom.strength = 0.6 + this.pulse * 0.22;
    this.renderer.toneMappingExposure = 1.08 + this.pulse * 0.05;
  }

  renderGame(dt, game) {
    this.mode = 'game';
    this.updateGame(dt, game);
    this.renderPass.scene = this.gameScene;
    this.renderPass.camera = this.gameCam;
    this.composer.render();
  }

  renderMenu(dt) {
    this.mode = 'menu';
    this.updateMenu(dt);
    this.renderPass.scene = this.menuScene;
    this.renderPass.camera = this.menuCam;
    this.composer.render();
  }

  // ---------------------------------------------------------------------------
  // FX
  // ---------------------------------------------------------------------------
  coinBurst(x, y, z) {
    if (!this.gameParticles) return;
    const gold = new THREE.Color(0xffc23d);
    this.gameParticles.burst(x, y, z + 0.3, gold, 34, 9, { size: 0.3, life: 0.9, drag: 0.92, gravity: 5 });
    this.gameRings.spawn(x, y, gold, { life: 0.45, speed: 6, size: 0.6 });
    this.flash = Math.max(this.flash, 0.6);
  }

  jump(x, y, orb = false) {
    if (!this.gameParticles) return;
    const col = orb ? new THREE.Color(0xffe14d) : this.accent;
    this.gameParticles.burst(x, y - 0.42, 0.2, col, orb ? 22 : 12, orb ? 7 : 4.5, { size: 0.24, life: 0.6, drag: 0.9, gravity: 1.5 });
    if (!orb) this.gameRings.spawn(x, y - 0.4, col, { life: 0.35, speed: 7, size: 0.22 });
    this.addShake(orb ? 0.12 : 0.045);
  }

  pad(x, y) {
    this.gameRings.spawn(x, y + 0.2, new THREE.Color(0xffe14d), { life: 0.4, speed: 11, size: 0.4 });
    this.gameParticles.burst(x, y + 0.3, 0.3, new THREE.Color(0xffe14d), 20, 8, { size: 0.26, life: 0.7, drag: 0.92, gravity: 3 });
    this.addShake(0.2);
    this.flash = Math.max(this.flash, 0.5);
  }

  portal(mode, x, y) {
    const color = mode === 'ship' ? new THREE.Color(0xff2fd0) : mode === 'wave' ? new THREE.Color(0xb6ff3c) : new THREE.Color(0x2ef2ff);
    this.gameRings.spawn(x, y, color, { life: 0.7, speed: 15, size: 0.6 });
    this.gameParticles.burst(x, y, 0.3, color, 42, 13, { size: 0.3, life: 0.9, drag: 0.9 });
    this.addShake(0.22);
    this.flash = 0.9;
  }

  death(x, y) {
    if (!this.gameParticles) return;
    const colors = [this.accent, this.accent2, new THREE.Color(0xffffff), new THREE.Color(0xff3b5c)];
    for (let i = 0; i < 4; i++) {
      this.gameParticles.burst(x, y, rnd(0, 0.5), colors[i], 26, 15, { size: 0.38, life: 1.2, drag: 0.93, gravity: 8 });
    }
    this.gameRings.spawn(x, y, new THREE.Color(0xffffff), { life: 0.6, speed: 22, size: 0.5 });
    this.gameRings.spawn(x, y, new THREE.Color(0xff3b5c), { life: 0.8, speed: 13, size: 1 });
    this.addShake(0.85);
    this.flash = 1.4;
  }

  complete(x, y) {
    if (!this.gameParticles) return;
    const colors = [new THREE.Color(0xb6ff3c), new THREE.Color(0x2ef2ff), new THREE.Color(0xffe14d), new THREE.Color(0xff2fd0)];
    for (let i = 0; i < 6; i++) {
      this.gameParticles.burst(x + rnd(-1, 1), y + rnd(-1, 2), rnd(0, 1), colors[i % colors.length], 26, 14, { size: 0.36, life: 1.5, drag: 0.94, gravity: 5 });
    }
    this.addShake(0.35);
    this.flash = 1.2;
  }

  clearFx() {
    if (this.gameParticles) this.gameParticles.clear();
    if (this.gameRings) this.gameRings.clear();
    this.flash = 0;
    this.shake = 0;
  }

  showPlayer(on) {
    if (this.playerGroup) this.playerGroup.visible = on;
  }
}
