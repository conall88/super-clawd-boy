import * as THREE from 'three';
import { PX, pixelCanvas, texture, sprite, snap } from './pixel.js';

export const CLAWD = '#d97757';
export const SMEAR = ['#b4532f', '#c8643c', '#9c4526'];

// Palettes follow SMB's look: pale hazy sky, layered flat silhouettes, muted mid-tone terrain.
export const THEMES = {
  datacenter: {
    sky: ['#c9d3da', '#edf1f3'],
    layers: [
      { kind: 'dcFar', color: '#c0cad2', depth: 0.1, drop: 1 },
      { kind: 'dcMid', color: '#a3afba', depth: 0.25, drop: 4 },
      { kind: 'dcNear', color: '#86929e', depth: 0.45, drop: 6 },
    ],
    tile: '#80868f', hi: '#9ba1aa', lo: '#686e77', inset: '#5a6069', line: '#2b2f35', top: '#c0c5cc',
    leds: ['#3fdc8a', '#4aa3ff', '#d97757'],
  },
  cloud: {
    sky: ['#aebdea', '#e4e9fa'],
    layers: [
      { kind: 'cloud', color: '#d2daf5', depth: 0.1, drop: 0 },
      { kind: 'cloud', color: '#bfc9ef', depth: 0.25, drop: 4 },
      { kind: 'cloud', color: '#aab6e6', depth: 0.45, drop: 7 },
    ],
    tile: '#86829f', hi: '#a19dbb', lo: '#6d6986', inset: '#5f5b78', line: '#2d2a3d', top: '#cdc9e4',
    leds: ['#4285f4', '#ea4335', '#fbbc05', '#34a853'],
  },
};

const rect = (g, x, y, w, h, c) => {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
};

function fromRows(rows, pal) {
  return pixelCanvas(rows[0].length, rows.length, (g) =>
    rows.forEach((r, y) => [...r].forEach((ch, x) => pal[ch] && rect(g, x, y, 1, 1, pal[ch]))),
  );
}

// --- Clawd & Sonnet -----------------------------------------------------------
// Based on the Claude Code logo (▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝): flat body, notch eyes,
// side claws, and two pairs of legs. 16x13 px, feet on the bottom row.

const LEG = {
  down: [[0, 0], [0, 1], [0, 2]],
  fwd: [[0, 0], [1, 1], [1, 2]],
  back: [[0, 0], [-1, 1], [-1, 2]],
  up: [[0, 0], [1, 1]],
  tuck: [[0, 0], [-1, 1]],
};
const LEG_X = [3, 5, 10, 12];
const POSES = {
  idle: ['down', 'down', 'down', 'down'],
  run0: ['fwd', 'back', 'fwd', 'back'],
  run1: ['down', 'up', 'down', 'up'],
  run2: ['back', 'fwd', 'back', 'fwd'],
  run3: ['up', 'down', 'up', 'down'],
  jump: ['tuck', 'tuck', 'tuck', 'tuck'],
  fall: ['back', 'back', 'fwd', 'fwd'],
  slide: ['back', 'back', 'back', 'back'],
};

function drawCritter(g, { body, eye, bow }, pose, blink) {
  rect(g, 2, 2, 12, 8, body);
  rect(g, 0, 6, 16, 2, body);
  rect(g, 4, blink ? 5 : 4, 1, blink ? 1 : 2, eye);
  rect(g, 11, blink ? 5 : 4, 1, blink ? 1 : 2, eye);
  if (bow) {
    rect(g, 9, 0, 2, 2, bow);
    rect(g, 12, 0, 2, 2, bow);
    rect(g, 11, 1, 1, 1, '#c2185b');
  }
  POSES[pose].forEach((shape, i) => LEG[shape].forEach(([dx, dy]) => rect(g, LEG_X[i] + dx, 10 + dy, 1, 1, body)));
}

const critterCache = new Map();
function critterFrames(key, pal) {
  if (!critterCache.has(key)) {
    const f = {};
    for (const pose of Object.keys(POSES)) f[pose] = texture(pixelCanvas(16, 13, (g) => drawCritter(g, pal, pose, false)));
    f.blink = texture(pixelCanvas(16, 13, (g) => drawCritter(g, pal, 'idle', true)));
    critterCache.set(key, f);
  }
  return critterCache.get(key);
}
export const clawdFrames = () => critterFrames('clawd', { body: CLAWD, eye: '#141414' });

function makeCritter(frames) {
  const m = sprite(frames.idle, { anchor: 'bottom' });
  m.userData = { frames, phase: 0, blinkT: 1 + Math.random() * 2 };
  return m;
}
export const makeClawd = () => makeCritter(clawdFrames());
export const makeSonnet = () => makeCritter(critterFrames('sonnet', { body: '#f2e8da', eye: '#2a2a2a', bow: '#ff6fa8' }));
export const makeHintGhost = () => makeCritter(critterFrames('ghost', { body: '#8fe8ff', eye: '#12405a' }));

// Picks the frame for the current movement state. Returns true on each footfall (for step sounds).
export function animateClawd(m, { speed = 0, grounded = true, vy = 0, sliding = false, facing = 1, squash = 0, dt = 0 }) {
  const u = m.userData;
  const f = u.frames;
  const running = grounded && speed > 0.3 && !sliding;
  let footfall = false;
  let frame;
  if (running) {
    const prev = u.phase;
    u.phase += dt * (10 + speed * 1.4);
    footfall = Math.floor(prev / Math.PI) !== Math.floor(u.phase / Math.PI);
    frame = f[`run${Math.floor(u.phase / (Math.PI / 2)) % 4}`];
  } else {
    u.phase = 0;
    if (sliding) frame = f.slide;
    else if (!grounded) frame = vy > 0 ? f.jump : f.fall;
    else {
      u.blinkT -= dt;
      if (u.blinkT < -0.12) u.blinkT = 1.5 + Math.random() * 2.5;
      frame = u.blinkT < 0 ? f.blink : f.idle;
    }
  }
  m.material.map = frame;
  m.scale.set(facing * (1 - squash * 0.5), 1 + squash, 1);
  return footfall;
}

// --- hazards & blocks -----------------------------------------------------------

// SMB saws: two offset rings of teeth (the back ring peeks between the front teeth), hub and bolt.
const sawCache = new Map();
export function sawTexture(r) {
  const R = Math.round(r * PX);
  if (!sawCache.has(R)) {
    const size = R * 2;
    const teeth = Math.max(8, Math.round(R * 0.5));
    const depth = Math.max(3, Math.round(R * 0.3));
    const shade = (x, y) => {
      const dx = x + 0.5 - R;
      const dy = y + 0.5 - R;
      const d = Math.hypot(dx, dy);
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) * teeth;
      const tooth = (f) => Math.abs((f % 1) - 0.5) * 2; // 1 at a tip, 0 in the valley
      if (d <= R - 0.5 - depth + tooth(a) * depth) {
        if (d < R * 0.1) return '#3a3d44';
        if (d < R * 0.24) return '#6e737c';
        if (Math.abs(d - R * 0.55) < 0.6) return '#b3b8c0';
        return '#d9dce1';
      }
      if (d <= R - 0.5 - depth + tooth(a + 0.5) * depth * 0.75) return '#a4a9b2';
      return null;
    };
    sawCache.set(R, texture(pixelCanvas(size, size, (g) => {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const c = shade(x, y);
          if (!c) continue;
          const edge = !shade(x - 1, y) || !shade(x + 1, y) || !shade(x, y - 1) || !shade(x, y + 1);
          rect(g, x, y, 1, 1, edge ? '#7d828b' : c);
        }
      }
    })));
  }
  return sawCache.get(R);
}

// Grey mechanical arm a moving saw rides along, with pivot caps at both ends.
export function makeRail(x0, y0, x1, y1) {
  const g = new THREE.Group();
  const len = Math.hypot(x1 - x0, y1 - y0);
  const rod = new THREE.Mesh(new THREE.PlaneGeometry(len, 5 / PX), new THREE.MeshBasicMaterial({ color: '#3b3f45' }));
  const core = new THREE.Mesh(new THREE.PlaneGeometry(len, 3 / PX), new THREE.MeshBasicMaterial({ color: '#8a8f97' }));
  core.position.z = 0.01;
  const angle = Math.atan2(y1 - y0, x1 - x0);
  for (const m of [rod, core]) m.rotation.z = angle;
  g.add(rod, core);
  for (const [x, y] of [[x0, y0], [x1, y1]]) {
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(8 / PX, 8 / PX), new THREE.MeshBasicMaterial({ color: '#3b3f45' }));
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(6 / PX, 6 / PX), new THREE.MeshBasicMaterial({ color: '#9ca1a9' }));
    cap.position.set(x - (x0 + x1) / 2, y - (y0 + y1) / 2, 0.02);
    inner.position.set(cap.position.x, cap.position.y, 0.03);
    g.add(cap, inner);
  }
  g.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return g;
}

let blockTex;
export function blockTextures() {
  blockTex ??= {
    crumble: texture(pixelCanvas(16, 16, (g) => {
      rect(g, 0, 0, 16, 16, '#5a3a08');
      rect(g, 1, 1, 14, 14, '#e0a33a');
      rect(g, 1, 1, 14, 1, '#f5c86a');
      for (const [x, y] of [[4, 3], [5, 4], [5, 5], [6, 6], [10, 8], [11, 9], [11, 10], [12, 11], [7, 11], [8, 12]]) rect(g, x, y, 1, 1, '#8a5a10');
    })),
    shimmer: texture(pixelCanvas(16, 16, (g) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2 === 0) rect(g, x, y, 1, 1, '#7fe3ff');
      rect(g, 0, 0, 16, 1, '#c8f4ff');
      rect(g, 0, 15, 16, 1, '#c8f4ff');
      rect(g, 0, 0, 1, 16, '#c8f4ff');
      rect(g, 15, 0, 1, 16, '#c8f4ff');
    })),
    real: texture(pixelCanvas(16, 16, (g) => {
      rect(g, 0, 0, 16, 16, '#2a6fb0');
      rect(g, 1, 1, 14, 14, '#dff4ff');
      rect(g, 1, 1, 14, 2, '#ffffff');
    })),
    fake: texture(pixelCanvas(16, 16, (g) => {
      for (let i = 0; i < 16; i += 4) {
        rect(g, i, 0, 2, 1, '#ff3b5c');
        rect(g, i, 15, 2, 1, '#ff3b5c');
        rect(g, 0, i, 1, 2, '#ff3b5c');
        rect(g, 15, i, 1, 2, '#ff3b5c');
      }
      for (let i = 3; i < 13; i++) rect(g, i, i, 1, 1, '#ff3b5c');
    })),
    // RLHF pad: green spring plate over a housing stamped with a thumbs-up.
    pad: texture(fromRows([
      'kkkkkkkkkkkkkkkk',
      'kGGGGGGGGGGGGGGk',
      'kggggggggggggggk',
      'kkkkkkkkkkkkkkkk',
      'kdmdmdmdmdmdmdmk',
      'kmmmmmmmmmmmmmmk',
      'kmmmmmmwmmmmmmmk',
      'kmmmmmwwmmmmmmmk',
      'kmmmmmwwmmmmmmmk',
      'kmmmwwwwwwwwmmmk',
      'kmmmwwwwwwwwmmmk',
      'kmmmwwwwwwwmmmmk',
      'kmmmwwwwwwwmmmmk',
      'kmmmmwwwwwwmmmmk',
      'kmmmmmmmmmmmmmmk',
      'kkkkkkkkkkkkkkkk',
    ], { k: '#1e2a24', G: '#9dffc8', g: '#3fdc8a', d: '#3b3f45', m: '#5a6069', w: '#f4f6f8' })),
    // Prompt-injection hologram: a glowing magenta panel on a little projector.
    sign: texture(fromRows([
      '................',
      '.kkkkkkkkkkkkkk.',
      '.kppppppppppppk.',
      '.kpPPPPPpwwppPk.',
      '.kppppppwwppppk.',
      '.kpPPPPpwwpPPPk.',
      '.kppppppwwppppk.',
      '.kpPPPPppppPPPk.',
      '.kppppppwwppppk.',
      '.kppppppppppppk.',
      '.kkkkkkkkkkkkkk.',
      '......p..p......',
      '.....p....p.....',
      '....p......p....',
      '....kkkkkkkk....',
      '...kddddddddk...',
    ], { k: '#2a0f36', p: '#d45cff', P: '#f3b8ff', w: '#ffffff', d: '#4b4f57' })),
    gateShut: texture(fromRows([
      'kkkkkkkkkkkkkkkk',
      'kRRRRRRRRRRRRRRk',
      'kRrrrrrrrrrrrrRk',
      'kRrrrrrrrrrrrrRk',
      'kRrrrrrrrrrrrrRk',
      'kRrwrwrwwwrwwwRk',
      'kRrwrwrrrwrwrwRk',
      'kRrwwwrwwwrwwwRk',
      'kRrrrwrwrrrrrwRk',
      'kRrrrwrwwwrwwwRk',
      'kRrrrrrrrrrrrrRk',
      'kRrrrrrrrrrrrrRk',
      'kRrrrrrrrrrrrrRk',
      'kRrrrrrrrrrrrrRk',
      'kRRRRRRRRRRRRRRk',
      'kkkkkkkkkkkkkkkk',
    ], { k: '#3a0010', R: '#ff5a6e', r: '#c8102e', w: '#ffffff' })),
    gateOpen: texture(pixelCanvas(16, 16, (g) => {
      for (let i = 0; i < 16; i += 4) {
        rect(g, i, 0, 2, 1, '#c8102e');
        rect(g, i, 15, 2, 1, '#c8102e');
        rect(g, 0, i, 1, 2, '#c8102e');
        rect(g, 15, i, 1, 2, '#c8102e');
      }
    })),
    // Checkpoint: a "commit" flag, grey until Clawd touches it, then green.
    ...Object.fromEntries([['flag', '#8a9099', '#b8bec6'], ['flagOn', '#2fbf71', '#9dffc8']].map(([k, cloth, hi]) => [k, texture(fromRows([
      '....kkkkkkkkkk..',
      '...kcccccccccck.',
      '...kchhhhhhhhck.',
      '...kchwwchwwhck.',
      '...kchwchhwchck.',
      '...kchwwchwwhck.',
      '...kcccccccccck.',
      '...kkkkkkkkkkk..',
      '...kp...........',
      '...kp...........',
      '...kp...........',
      '...kp...........',
      '...kp...........',
      '...kp...........',
      '..kkkkk.........',
      '.kdddddk........',
    ], { k: '#1c1f24', c: cloth, h: hi, w: '#ffffff', p: '#c0c5cc', d: '#5a6069' }))])),
    // Conveyor: chevrons on the belt, rollers in the housing. Scrolled via texture offset.
    belt: (() => {
      const t = texture(fromRows([
        'kkkkkkkkkkkkkkkk',
        'bbbybbbbbbbybbbb',
        'bbbbybbbbbbbybbb',
        'bbbybbbbbbbybbbb',
        'kkkkkkkkkkkkkkkk',
        'mmmmmmmmmmmmmmmm',
        'mmkkkmmmmmkkkmmm',
        'mkcccmmmmkcccmmm',
        'mkcocmmmmkcocmmm',
        'mkcccmmmmkcccmmm',
        'mmkkkmmmmmkkkmmm',
        'mmmmmmmmmmmmmmmm',
        'kkkkkkkkkkkkkkkk',
        'bbbbbbbbbbbbbbbb',
        'bbbbbbbbbbbbbbbb',
        'kkkkkkkkkkkkkkkk',
      ], { k: '#1c1f24', b: '#3b3f45', y: '#f5c542', m: '#6e747d', c: '#9ca1a9', o: '#2b2f35' }));
      t.wrapS = THREE.RepeatWrapping;
      return t;
    })(),
  };
  return blockTex;
}

// --- tiles & backdrop ------------------------------------------------------------

// Paints tiles x0..x0+w-1, y0..y0+h-1 (world coords, y up) into one canvas, SMB factory-panel style.
// Splatter is later painted straight onto this canvas.
export function drawTilemap(x0, y0, w, h, solid, theme) {
  return pixelCanvas(w * PX, h * PX, (g) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!solid(x, y)) continue;
        const px = (x - x0) * PX;
        const py = (y0 + h - 1 - y) * PX;
        rect(g, px, py, PX, PX, theme.tile);
        rect(g, px + 1, py + 1, PX - 2, 1, theme.hi);
        rect(g, px + 1, py + 1, 1, PX - 2, theme.hi);
        rect(g, px + 1, py + PX - 2, PX - 2, 1, theme.lo);
        rect(g, px + PX - 2, py + 1, 1, PX - 2, theme.lo);
        rect(g, px, py + PX - 1, PX, 1, theme.inset);
        rect(g, px + PX - 1, py, 1, PX, theme.inset);
        const v = (((x * 7 + y * 13) % 9) + 9) % 9;
        if (v === 0) {
          for (let i = 0; i < 4; i++) rect(g, px + 4, py + 4 + i * 2, 8, 1, theme.inset);
        } else if (v === 1) {
          for (let i = 0; i < 4; i++) rect(g, px + 4 + i * 2, py + 4, 1, 8, theme.inset);
        } else if (v === 2) {
          rect(g, px + 3, py + 6, 10, 4, theme.inset);
          rect(g, px + 4 + (((x * 3 + y) % 7) + 7) % 7, py + 7, 1, 1, theme.leds[(((x + y) % theme.leds.length) + theme.leds.length) % theme.leds.length]);
        } else if (v < 6) {
          for (const [dx, dy] of [[3, 3], [12, 3], [3, 12], [12, 12]]) rect(g, px + dx, py + dy, 1, 1, theme.inset);
        }
        if (!solid(x, y + 1)) {
          rect(g, px, py, PX, 1, theme.line);
          rect(g, px, py + 1, PX, 2, theme.top);
        }
        if (!solid(x, y - 1)) rect(g, px, py + PX - 1, PX, 1, theme.line);
        if (!solid(x - 1, y)) rect(g, px, py, 1, PX, theme.line);
        if (!solid(x + 1, y)) rect(g, px + PX - 1, py, 1, PX, theme.line);
      }
    }
  });
}

// --- parallax silhouettes ---

const LAYER_W = 512;
const LAYER_H = 384;
const HORIZON = 256; // canvas row where the silhouette meets its solid base
const rnd = (n) => Math.floor(Math.random() * n);

function line(g, x0, y0, x1, y1, c, t = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) rect(g, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), t, t, c);
}
function disc(g, cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    rect(g, cx - half, cy + dy, half * 2, 1, c);
  }
}

// Each generator draws one element at x; drawing happens at x-W, x and x+W so the strip tiles seamlessly.
const SILHOUETTES = {
  dcFar(g, c) {
    for (let x = 0; x < LAYER_W; ) {
      const bw = 40 + rnd(70);
      const bh = 30 + rnd(80);
      const chimney = Math.random() < 0.4 ? { x: rnd(bw - 8), h: bh + 30 + rnd(70) } : null;
      const fans = Math.random() < 0.6 ? 1 + rnd(3) : 0;
      for (const o of [-LAYER_W, 0, LAYER_W]) {
        rect(g, x + o, HORIZON - bh, bw, bh, c);
        for (let i = 0; i < fans; i++) rect(g, x + o + 6 + i * 14, HORIZON - bh - 4, 10, 4, c);
        if (chimney) rect(g, x + o + chimney.x, HORIZON - chimney.h, 7, chimney.h, c);
      }
      x += bw + rnd(24);
    }
  },
  dcMid(g, c) {
    const step = LAYER_W / 3;
    for (let i = 0; i < 3; i++) {
      const px = Math.round(i * step + 40);
      for (const o of [-LAYER_W, 0, LAYER_W]) {
        const x = px + o;
        const top = HORIZON - 130;
        line(g, x - 18, HORIZON, x - 4, top, c, 2);
        line(g, x + 18, HORIZON, x + 4, top, c, 2);
        for (let y = HORIZON - 20; y > top + 10; y -= 22) {
          const k = (HORIZON - y) / 130;
          line(g, x - 18 + 14 * k, y, x + 18 - 14 * k, y - 20, c);
          line(g, x + 18 - 14 * k, y, x - 18 + 14 * k, y - 20, c);
        }
        rect(g, x - 28, top + 18, 56, 3, c);
        rect(g, x - 20, top + 44, 40, 3, c);
        rect(g, x - 3, top - 8, 6, 8, c);
        // Sagging power lines to the next pylon.
        for (const [dx, dy] of [[-27, 21], [27, 21], [-19, 47], [19, 47]]) {
          for (let s = 0; s <= step; s++) {
            const t = s / step;
            rect(g, x + dx + s, top + dy + Math.round(22 * 4 * t * (1 - t)), 1, 1, c);
          }
        }
      }
      const bx = px + 50 + rnd(40);
      const bw = 30 + rnd(40);
      const bh = 16 + rnd(30);
      for (const o of [-LAYER_W, 0, LAYER_W]) rect(g, bx + o, HORIZON - bh, bw, bh, c);
    }
  },
  dcNear(g, c) {
    for (let x = 0; x < LAYER_W; ) {
      const kind = rnd(3);
      const bw = kind === 2 ? 60 + rnd(60) : 24 + rnd(40);
      const bh = kind === 2 ? 10 : 18 + rnd(34);
      for (const o of [-LAYER_W, 0, LAYER_W]) {
        if (kind === 2) {
          for (let f = 0; f < bw; f += 8) rect(g, x + o + f, HORIZON - 22, 2, 22, c);
          rect(g, x + o, HORIZON - 20, bw, 2, c);
          rect(g, x + o, HORIZON - 10, bw, 2, c);
        } else {
          rect(g, x + o, HORIZON - bh, bw, bh, c);
          if (kind === 1) disc(g, x + o + (bw >> 1), HORIZON - bh - 2, 7, c);
        }
      }
      x += bw + 6 + rnd(30);
    }
  },
  cloud(g, c) {
    for (let x = 0; x < LAYER_W; ) {
      const r = 14 + rnd(30);
      const cy = HORIZON - r + rnd(20);
      for (const o of [-LAYER_W, 0, LAYER_W]) disc(g, x + o, cy, r, c);
      x += 14 + rnd(Math.max(8, r));
    }
  },
};

const layerCache = new Map();
function layerTexture(kind, color) {
  const key = `${kind}${color}`;
  if (!layerCache.has(key)) {
    const tex = texture(pixelCanvas(LAYER_W, LAYER_H, (g) => {
      SILHOUETTES[kind](g, color);
      rect(g, 0, HORIZON, LAYER_W, LAYER_H - HORIZON, color);
    }));
    tex.wrapS = THREE.RepeatWrapping;
    layerCache.set(key, tex);
  }
  return layerCache.get(key);
}

const skyCache = new Map();
function skyTexture([top, bottom]) {
  const key = top + bottom;
  if (!skyCache.has(key)) {
    const a = new THREE.Color(top);
    const b = new THREE.Color(bottom);
    // Stepped bands rather than a smooth ramp, to stay pixel-art.
    skyCache.set(key, texture(pixelCanvas(1, 8, (g) => {
      for (let i = 0; i < 8; i++) rect(g, 0, i, 1, 1, `#${a.clone().lerp(b, i / 7).getHexString()}`);
    })));
  }
  return skyCache.get(key);
}

// Sky + three parallax silhouette layers. Call `group.userData.update(camX, camY, horizonY)` after moving
// the camera; `horizonY` is the world height where the nearest layer's base settles.
export function makeBackdrop(theme) {
  const group = new THREE.Group();
  const view = { w: 96, h: 64 };
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(view.w, view.h), new THREE.MeshBasicMaterial({ map: skyTexture(theme.sky) }));
  sky.position.z = -9;
  group.add(sky);
  const layers = theme.layers.map((l, i) => {
    const tex = layerTexture(l.kind, l.color).clone();
    tex.repeat.set((view.w * PX) / LAYER_W, 1);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(view.w, LAYER_H / PX),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5 }),
    );
    const base = new THREE.Mesh(new THREE.PlaneGeometry(view.w, 60), new THREE.MeshBasicMaterial({ color: l.color }));
    base.position.y = -LAYER_H / PX / 2 - 30 + 0.01;
    mesh.add(base);
    mesh.userData = { ...l, tex };
    mesh.position.z = -8 + i;
    group.add(mesh);
    return mesh;
  });
  group.userData.update = (camX, camY, horizonY = 0) => {
    sky.position.x = camX;
    sky.position.y = camY;
    for (const m of layers) {
      const { depth, drop, tex } = m.userData;
      const horizon = camY + (horizonY - drop - camY) * depth;
      m.position.x = snap(camX);
      m.position.y = snap(horizon + (HORIZON - LAYER_H / 2) / PX);
      tex.offset.x = Math.round(camX * depth * PX) / LAYER_W;
    }
  };
  return group;
}

// A strip of ground for cutscenes, top at y = 0; tiles in `gap` ([start, end) world x) are left open.
export function makeGround(theme, gap) {
  const solid = (x, y) => y < 0 && !(gap && x >= gap[0] && x < gap[1]);
  const mesh = sprite(texture(drawTilemap(-30, -8, 60, 8, solid, theme)));
  mesh.position.set(0, -4, 0);
  return mesh;
}

// Black rubble in the foreground of cutscenes, like SMB's story scenes.
export function makeRubble() {
  const tex = texture(pixelCanvas(LAYER_W, 40, (g) => {
    for (let x = 0; x < LAYER_W; x += 10 + rnd(20)) {
      const r = 5 + rnd(10);
      for (const o of [-LAYER_W, 0, LAYER_W]) disc(g, x + o, 40 - r + rnd(6), r, '#111111');
    }
    rect(g, 0, 32, LAYER_W, 8, '#111111');
  }));
  const m = sprite(tex);
  return m;
}

// --- characters & props ------------------------------------------------------------

function sparkle(color, light) {
  const S = 24;
  const R = Math.sqrt(11.5);
  return texture(pixelCanvas(S, S, (g) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const k = Math.sqrt(Math.abs(x + 0.5 - 12)) + Math.sqrt(Math.abs(y + 0.5 - 12));
        if (k <= R) rect(g, x, y, 1, 1, k < R * 0.55 ? light : color);
      }
    }
    rect(g, 8, 11, 3, 2, '#ffffff');
    rect(g, 13, 11, 3, 2, '#ffffff');
    rect(g, 10, 11, 1, 2, '#111111');
    rect(g, 13, 11, 1, 2, '#111111');
    rect(g, 7, 9, 2, 1, '#111111');
    rect(g, 9, 10, 2, 1, '#111111');
    rect(g, 15, 9, 2, 1, '#111111');
    rect(g, 13, 10, 2, 1, '#111111');
  }));
}

export function makeTwins() {
  const g = new THREE.Group();
  const a = sprite(sparkle('#4285f4', '#a8c7fa'));
  const b = sprite(sparkle('#9b72cb', '#dcc6f5'));
  g.add(a, b);
  g.userData.stars = [a, b];
  return g;
}

export function animateTwins(g, t, frenzy = 0) {
  const [a, b] = g.userData.stars;
  const w = 2.2 + frenzy * 10;
  const c = Math.cos(t * w);
  const s = Math.sin(t * w);
  a.position.set(c * 0.8, s * 0.4, s * 0.01);
  b.position.set(-c * 0.8, -s * 0.4, -s * 0.01);
  a.rotation.z = Math.sin(t * 3) * 0.2 + frenzy * t * 20;
  b.rotation.z = -Math.sin(t * 3) * 0.2 - frenzy * t * 20;
}

// Dr. Overfit: an evil brain with a face, floating in a jar on a hype-powered robot. The 40x64 px body faces
// left; the brain (22x18, behind the jar glass), the chest-reactor knot and the grabbing arm are separate
// sprites so they can animate.
const OVERFIT = { w: 40, h: 64, brain: [9, 7], face: [11, 11], knot: 40, arm: [-20, 30.5] };

function overfitBody() {
  return pixelCanvas(OVERFIT.w, OVERFIT.h, (c) => {
    // Jar: lid, glass walls and rim (the interior stays clear so the brain shows through).
    rect(c, 7, 0, 26, 4, '#5a6070');
    rect(c, 7, 0, 26, 1, '#7a8090');
    for (const x of [9, 30]) rect(c, x, 2, 1, 1, '#3a3e4a');
    rect(c, 8, 4, 1, 22, '#aee8ff');
    rect(c, 31, 4, 1, 22, '#aee8ff');
    rect(c, 8, 25, 24, 2, '#aee8ff');
    rect(c, 10, 5, 1, 7, '#e6f8ff');
    rect(c, 10, 13, 1, 2, '#e6f8ff');
    rect(c, 11, 27, 18, 3, '#3f4555');
    rect(c, 12, 27, 16, 1, '#6e7689');
    // Shoulders, far arm and chest plate.
    rect(c, 3, 30, 34, 6, '#6e7689');
    rect(c, 3, 30, 34, 1, '#c3cad8');
    for (const x of [5, 34]) rect(c, x, 32, 1, 1, '#3f4555');
    rect(c, 35, 36, 4, 9, '#565d6e');
    rect(c, 34, 45, 5, 4, '#7c8496');
    rect(c, 5, 34, 30, 13, '#3f4555');
    rect(c, 6, 34, 28, 12, '#9aa3b5');
    rect(c, 6, 34, 28, 1, '#c3cad8');
    // Chest reactor (the knot spins in it) and the hype-meter belt.
    rect(c, 13, 34, 14, 12, '#1b1e26');
    rect(c, 13, 34, 14, 1, '#3f4555');
    rect(c, 6, 45, 28, 3, '#2b2f3a');
    for (let x = 8; x < 33; x += 5) rect(c, x, 46, 2, 1, '#ff3344');
    // Hips, jointed legs and feet.
    rect(c, 9, 48, 22, 3, '#2b2f3a');
    for (const x of [10, 23]) {
      rect(c, x, 51, 7, 9, '#3a3f4c');
      rect(c, x, 54, 7, 2, '#6e7689');
      rect(c, x - 3, 60, 11, 4, '#1b1e26');
      rect(c, x - 3, 60, 11, 1, '#3f4555');
    }
  });
}

// The brain's expressions: smug (default), talk, squint, smirk, grin, and laugh/laugh2 (mouth wide/half open).
function brainCanvas(face) {
  const D = '#1a1014';
  const W = '#ffffff';
  return pixelCanvas(22, 18, (c) => {
    rect(c, 3, 0, 16, 1, '#f4a6c0');
    rect(c, 1, 1, 20, 1, '#f4a6c0');
    rect(c, 0, 2, 22, 11, '#f4a6c0');
    rect(c, 0, 13, 22, 3, '#e0859f');
    rect(c, 1, 16, 20, 1, '#e0859f');
    rect(c, 3, 17, 16, 1, '#e0859f');
    for (const [x, y, w, h] of [[4, 2, 5, 1], [9, 2, 1, 3], [12, 1, 1, 3], [13, 3, 5, 1], [17, 2, 2, 1], [2, 5, 4, 1], [6, 5, 1, 2], [10, 5, 4, 1], [15, 5, 5, 1]]) {
      rect(c, x, y, w, h, '#c25b7e');
    }
    const narrow = ['squint', 'smirk', 'grin'].includes(face);
    const shut = face.startsWith('laugh');
    const blink = face === 'blink';
    // Brows slant down to the middle; squinting drops them a pixel.
    const b = narrow ? 1 : 0;
    rect(c, 4, 7 + b, 2, 1, D);
    rect(c, 6, 8 + b, 3, 1, D);
    rect(c, 13, 8 + b, 3, 1, D);
    rect(c, 16, 7 + b, 2, 1, D);
    for (const x of [5, 13]) {
      if (shut) {
        rect(c, x, 10, 1, 1, D);
        rect(c, x + 1, 9, 2, 1, D);
        rect(c, x + 3, 10, 1, 1, D);
      } else if (blink) {
        rect(c, x, 11, 4, 1, D);
      } else if (narrow) {
        rect(c, x, 10, 4, 1, W);
        rect(c, x, 10, 2, 1, D);
      } else {
        rect(c, x, 9, 4, 3, W);
        rect(c, x, 10, 2, 2, D);
      }
    }
    if (face === 'smug' || face === 'blink' || face === 'squint') {
      rect(c, 8, 14, 6, 1, D);
      if (face !== 'squint') rect(c, 14, 13, 1, 1, D);
    } else if (face === 'talk') {
      rect(c, 8, 13, 6, 3, D);
      rect(c, 9, 15, 4, 1, '#ff7a9a');
    } else if (face === 'smirk') {
      rect(c, 8, 14, 5, 1, D);
      rect(c, 13, 13, 2, 1, D);
      rect(c, 15, 12, 1, 1, D);
    } else if (face === 'grin') {
      rect(c, 5, 12, 1, 1, D);
      rect(c, 16, 12, 1, 1, D);
      rect(c, 6, 13, 10, 3, D);
      rect(c, 7, 13, 8, 1, W);
      rect(c, 8, 15, 6, 1, W);
      rect(c, 10, 13, 1, 1, D);
      rect(c, 11, 15, 1, 1, D);
    } else if (face === 'laugh') {
      rect(c, 6, 12, 10, 5, D);
      rect(c, 7, 12, 8, 1, W);
      rect(c, 9, 15, 4, 1, '#ff7a9a');
    } else {
      rect(c, 7, 13, 8, 3, D);
      rect(c, 8, 13, 6, 1, W);
    }
  });
}
const FACES = ['smug', 'blink', 'talk', 'squint', 'smirk', 'grin', 'laugh', 'laugh2'];

// The overfit knot: three tangled loops, glowing in the chest reactor.
function knotCanvas() {
  const n = 12;
  const s = n / 14;
  return pixelCanvas(n, n, (c) => {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        for (let k = 0; k < 3; k++) {
          const th = (k * Math.PI * 2) / 3;
          const dx = x + 0.5 - n / 2 - Math.cos(th) * 2 * s;
          const dy = y + 0.5 - n / 2 - Math.sin(th) * 2 * s;
          const rx = dx * Math.cos(th) + dy * Math.sin(th);
          const ry = -dx * Math.sin(th) + dy * Math.cos(th);
          const v = (rx / (4.6 * s)) ** 2 + (ry / (2.4 * s)) ** 2;
          if (v > 0.5 && v < 1.2) rect(c, x, y, 1, 1, '#ff3344');
        }
      }
    }
  });
}

function armCanvas() {
  return pixelCanvas(18, 7, (c) => {
    rect(c, 6, 2, 12, 4, '#2b2f3a');
    rect(c, 6, 2, 12, 1, '#4a5060');
    rect(c, 0, 0, 7, 7, '#9aa3b5');
    rect(c, 0, 0, 7, 1, '#c3cad8');
    rect(c, 0, 3, 4, 1, '#2b2f3a');
  });
}

// Everything above the hips breathes as one piece; the legs stay planted (the upper half overlaps them, so it
// can sink a pixel without opening a gap).
const HIPS = 51;
const LEDS = [8, 13, 18, 23, 28];
// Bubbles hug the jar walls, clear of his face.
const BUBBLES = [[11, 0], [29, 0.4], [10, 0.75]];
// Art pixel (x, y from the top-left of the body) to the centre of a w x h sprite in Overfit's local space.
const at = (x, y, w = 1, h = 1) => [(x + w / 2 - OVERFIT.w / 2) / PX, (OVERFIT.h - y - h / 2) / PX];
const dot = (w, h, col) => sprite(texture(pixelCanvas(w, h, (c) => rect(c, 0, 0, w, h, col))));

export function makeOverfit() {
  const g = new THREE.Group();
  const full = overfitBody();
  const upperBody = sprite(texture(pixelCanvas(OVERFIT.w, HIPS, (c) => c.drawImage(full, 0, 0))), { anchor: 'bottom' });
  upperBody.position.y = (OVERFIT.h - HIPS) / PX;
  const legs = sprite(texture(pixelCanvas(OVERFIT.w, OVERFIT.h - HIPS + 1, (c) => c.drawImage(full, 0, 1 - HIPS))), { anchor: 'bottom' });
  legs.position.z = -0.02;
  const faces = Object.fromEntries(FACES.map((f) => [f, texture(brainCanvas(f))]));
  const brain = sprite(faces.smug);
  const [bx, by] = OVERFIT.brain;
  const [brainX, brainY] = at(bx, by, 22, 18);
  brain.position.set(brainX, brainY, -0.01);
  const bubbles = BUBBLES.map(() => dot(1, 1, '#d8f4ff'));
  bubbles.forEach((b) => (b.position.z = -0.005));
  const knot = sprite(texture(knotCanvas()));
  knot.position.set(0, (OVERFIT.h - OVERFIT.knot) / PX, 0.01);
  const led = dot(2, 1, '#ffc8ce');
  led.position.z = 0.01;
  const arm = sprite(texture(armCanvas()));
  const armX = OVERFIT.arm[0] / PX;
  arm.position.set(armX, OVERFIT.arm[1] / PX, 0.02);
  const upper = new THREE.Group();
  upper.add(upperBody, brain, ...bubbles, knot, led, arm);
  const jets = [12, 25].map((x) => {
    const j = makeJet();
    j.position.set(at(x, 0)[0], -3.5 / PX, 0);
    return j;
  });
  g.add(legs, upper, ...jets);
  g.userData = {
    knot, arm, armX, armY: arm.position.y, upper, brain, brainY, bubbles, led, jets,
    h: OVERFIT.h / PX,
    faceY: (OVERFIT.h - by - OVERFIT.face[1]) / PX,
    face: (f) => (brain.material.map = faces[f]),
  };
  return g;
}

// Rocket flames under his feet. Drawn above the outro's wipe (they glow, so floating over the black reads fine).
const JET_FRAMES = [
  ['.YYYY.', '.YWWY.', '.OYYO.', '.OYYO.', '..OO..', '..RR..', '..R...'],
  ['.YYYY.', 'YYWWYY', '.OYYO.', '..YO..', '..OO..', '...R..', '......'],
];
function makeJet() {
  const pal = { Y: '#ffd54a', W: '#fff6c4', O: '#ff8a2a', R: '#ff3344' };
  const frames = JET_FRAMES.map((rows) => texture(fromRows(rows, pal)));
  const m = sprite(frames[0], { transparent: true });
  m.material.depthTest = false;
  m.renderOrder = 11;
  m.visible = false;
  m.userData.frames = frames;
  return m;
}

// Idle life between beats: breathing (a fast heave when `heave`), the brain bobbing in the jar out of step with
// it, rising bubbles, a light chasing along the hype-meter belt, and a blink every few seconds when smug.
export function animateOverfit(g, t, { face = 'smug', heave = false, jets = false } = {}) {
  const u = g.userData;
  u.jets.forEach((j, i) => {
    j.visible = jets;
    j.material.map = j.userData.frames[(Math.floor(t * 24) + i) % 2];
  });
  const exhale = heave ? Math.floor(t * 9) % 2 : t % 1.6 > 0.8 ? 1 : 0;
  u.upper.position.y = -exhale / PX;
  u.brain.position.y = u.brainY + (Math.sin(t * 2.6 + 1) > 0.2 ? 1 : 0) / PX;
  u.bubbles.forEach((b, i) => {
    const [x, phase] = BUBBLES[i];
    const k = (t * 0.55 + phase) % 1;
    const [bx, by] = at(x + (Math.sin(t * 5 + i * 2) > 0.5 ? 1 : 0), Math.round(23 - 17 * k));
    b.position.x = bx;
    b.position.y = by;
    b.visible = k < 0.92;
  });
  const [lx, ly] = at(LEDS[Math.floor(t * (heave ? 20 : 7)) % LEDS.length], 46, 2, 1);
  u.led.position.x = lx;
  u.led.position.y = ly;
  u.face(face === 'smug' && t % 2.9 < 0.13 ? 'blink' : face);
}

// Dr. Overfit's solid silhouette for the outro's Bowser-style wipe, assembled from the same canvases (only
// alpha matters). The body sits 10 px in so the arm fits; `face` is the brain's face centre in mask pixels.
// It's grown a pixel all round so his idle breathing never clips against it; a black copy of it fades in behind
// him as the wipe closes, so the extra pixel doesn't show.
const MASK_X = 10;
export const OVERFIT_MASK = { w: OVERFIT.w + MASK_X, h: OVERFIT.h, face: [MASK_X + OVERFIT.brain[0] + OVERFIT.face[0], OVERFIT.brain[1] + OVERFIT.face[1]] };
export const overfitMask = () => {
  const shape = pixelCanvas(OVERFIT_MASK.w, OVERFIT_MASK.h, (c) => {
    c.drawImage(overfitBody(), MASK_X, 0);
    rect(c, MASK_X + 9, 4, 22, 22, '#fff');
    c.drawImage(armCanvas(), MASK_X + OVERFIT.w / 2 + OVERFIT.arm[0] - 9, OVERFIT.h - OVERFIT.arm[1] - 3.5);
  });
  return texture(pixelCanvas(OVERFIT_MASK.w, OVERFIT_MASK.h, (c) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c.drawImage(shape, dx, dy);
  }));
};

// A "HA" for Dr. Overfit's laugh: white letters with a red drop shadow, drawn above the wipe.
export function makeHa() {
  const rows = [
    '##..##..####.',
    '##..##.##..##',
    '##..##.##..##',
    '######.######',
    '######.######',
    '##..##.##..##',
    '##..##.##..##',
  ];
  const tex = texture(pixelCanvas(14, 8, (g) => {
    for (const [dx, col] of [[1, '#ff3344'], [0, '#ffffff']]) {
      rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && rect(g, x + dx, y + dx, 1, 1, col)));
    }
  }));
  const m = sprite(tex, { transparent: true });
  m.material.depthTest = false;
  m.renderOrder = 11;
  return m;
}

export function makeButton() {
  const draw = (pressed) => texture(pixelCanvas(20, 10, (c) => {
    const top = pressed ? 5 : 2;
    rect(c, 4, top, 12, 10 - top - 3, '#e53935');
    rect(c, 5, top, 10, 1, '#ff8a80');
    rect(c, 0, 6, 20, 4, '#2b2f3a');
    rect(c, 0, 6, 20, 1, '#4a5060');
  }));
  const up = draw(false);
  const down = draw(true);
  const m = sprite(up, { anchor: 'bottom' });
  m.userData.press = (on) => (m.material.map = on ? down : up);
  return m;
}

export const makeHeart = () => sprite(texture(fromRows([
  '.##.##..',
  '#######.',
  '#######.',
  '.#####..',
  '..###...',
  '...#....',
], { '#': '#ff6fa8' })));

export const makeTombstone = () => sprite(texture(fromRows([
  '.....##########.....',
  '...##SSSSSSSSSS##...',
  '..#SSSSSSSSSSSSSS#..',
  '.#SSSSSSSSSSSSSSSS#.',
  '.#SSSSSSSSSSSSSSSS#.',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSDDSSDDDSSDDSSSS#',
  '#SSSDSDSSDSSSDSDSSS#',
  '#SSSDDSSSDSSSDDSSSS#',
  '#SSSDSDSSDSSSDSSSSS#',
  '#SSSDSDSDDDSSDSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSSSSSSDDSSSSSSSS#',
  '#SSSSSSSDDDDSSSSSSS#',
  '#SSSSSSSSDDSSSSSSSS#',
  '#SSSSSSSSDDSSSSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '#SSSSSSSSSSSSSSSSSS#',
  '.rr.yy..gg..bb..rr..',
  '.rr.yy..gg..bb..rr..',
], { '#': '#3a3e4a', S: '#737888', D: '#2a2d36', r: '#ea4335', y: '#fbbc05', g: '#34a853', b: '#4285f4' })), { anchor: 'bottom' });

// The Google-branded cage the twins keep Sonnet in (22x20; she stands on its 2 px base). The bars dodge her eyes.
export const makeCage = () => sprite(texture(pixelCanvas(22, 20, (c) => {
  for (const x of [0, 4, 9, 12, 17, 21]) rect(c, x, 3, 1, 15, '#737888');
  rect(c, 0, 0, 22, 3, '#3a3e4a');
  ['#ea4335', '#fbbc05', '#34a853', '#4285f4'].forEach((col, i) => rect(c, 4 + i * 4, 1, 2, 1, col));
  rect(c, 0, 18, 22, 2, '#3a3e4a');
})), { anchor: 'bottom' });
