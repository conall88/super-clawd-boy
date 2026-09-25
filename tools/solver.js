// Dev-only level solver: beam search over the real Level physics to prove each level is beatable
// and find a near-optimal time (used to set par, and saved as the hint ghost's route).
// Run it with `node tools/solve.mjs`, or from the browser console on the dev server:
//   const { solve, solveAll } = await import('/tools/solver.js'); solveAll();
import { Level, STEP } from '/src/level.js';
import { LEVELS } from '/src/levels.js';
import { setMuted } from '/src/audio.js';
import { ACTIONS, K as ROUTE_K, playRoute } from '/src/route.js';

const JUMP_BUFFER = 0.12;
const SAW_PERIOD = 3;

// Tile distance to the goal through open space, ignoring gravity: a heuristic that sees around walls.
function distanceField(l) {
  const H = l.h + 8;
  const dist = new Float32Array(l.w * H).fill(Infinity);
  const gx = Math.floor(l.goal.x);
  const gy = Math.floor(l.goal.y);
  dist[gy * l.w + gx] = 0;
  const q = [[gx, gy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    const d = dist[y * l.w + x] + 1;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || nx >= l.w || ny < 0 || ny >= H || dist[ny * l.w + nx] <= d) continue;
      if (l.solid(nx, ny) && !l.gates.has(ny * l.w + nx)) continue;
      dist[ny * l.w + nx] = d;
      q.push([nx, ny]);
    }
  }
  return (p) => {
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y + 0.35);
    const d = tx >= 0 && tx < l.w && ty >= 0 && ty < H ? dist[ty * l.w + tx] : Infinity;
    return d + Math.hypot(p.x - l.goal.x, p.y - l.goal.y) * 0.01;
  };
}

const save = (l) => ({
  p: { ...l.player },
  t: l.t,
  boss: l.boss && { x: l.boss.x, y: l.boss.y },
  cr: [...l.crumbles.values()].map((c) => [c.t, c.gone, c.back]),
});

function load(l, s) {
  Object.assign(l.player, s.p);
  l.t = s.t;
  l.dead = l.won = false;
  if (s.boss) Object.assign(l.boss, s.boss);
  let i = 0;
  for (const c of l.crumbles.values()) [c.t, c.gone, c.back] = s.cr[i++];
}

// Search copy: no replay recording, and death/win just set flags.
function searchLevel(def) {
  const l = new Level(def, { headless: true });
  const sink = { push() {}, slice: () => sink };
  l.attempt = { frames: sink, boss: sink };
  l.die = function () { this.dead = true; };
  l.win = function () { this.won = true; };
  return l;
}

// Returns { time, actions, verified, minBossGap } or null. `mods` tweaks the level def (e.g. boss speed) for
// stress tests; `K` is frames per decision (6 = 0.05s; larger means sloppier, more human-like input);
// `start` ({ x, y } in tiles, optional world time `t`) begins the search mid-level, to check one section of a
// long level at a time (and, with `t`, at a chosen point in the saw/gate beat).
function begin(l, { t = 0, ...pos }) {
  Object.assign(l.player, pos);
  l.t = t;
  l.updateSaws();
  l.updateGates();
}

export function solve(idx, { beam = 2000, maxT = 30, mods = {}, K = ROUTE_K, start } = {}) {
  const def = { ...LEVELS[idx], ...mods, boss: LEVELS[idx].boss && { ...LEVELS[idx].boss, ...mods.boss } };
  setMuted(true);
  const l = searchLevel(def);
  if (start) begin(l, start);
  const h = distanceField(l);
  const key = (p) =>
    `${Math.round(p.x * 4)},${Math.round(p.y * 4)},${Math.round(p.vx / 2)},${Math.round(p.vy / 3)},${p.onGround | 0}` +
    `,${l.timed ? Math.floor((l.t % SAW_PERIOD) / 0.25) : ''},${[...l.crumbles.values()].filter((c) => c.gone).length}` +
    `,${Math.ceil(p.inject / 0.25)}`;
  const inp = { left: false, right: false, jump: false, run: true, think: false };
  const seen = new Set();
  let layer = [{ s: save(l), jump: 0, path: null }];
  let result = null;

  search: for (let depth = 0; depth * K * STEP < maxT && layer.length; depth++) {
    const next = [];
    for (const node of layer) {
      for (let a = 0; a < ACTIONS.length; a++) {
        const { dir, jump } = ACTIONS[a];
        load(l, node.s);
        inp.left = dir < 0;
        inp.right = dir > 0;
        inp.jump = !!jump;
        let dead = false;
        for (let f = 0; f < K; f++) {
          if (f === 0 && jump && !node.jump) l.player.jumpBuf = JUMP_BUFFER;
          l.step(inp);
          if (l.dead) {
            dead = true;
            break;
          }
          if (l.won) {
            result = { time: (depth * K + f + 1) * STEP, path: { a, prev: node.path } };
            break search;
          }
        }
        if (dead) continue;
        const k = key(l.player);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push({ s: save(l), jump, path: { a, prev: node.path }, h: h(l.player) });
      }
    }
    next.sort((x, y) => x.h - y.h);
    layer = next.slice(0, beam);
  }

  setMuted(false);
  if (!result) return null;
  const actions = [];
  for (let n = result.path; n; n = n.prev) actions.unshift(n.a);
  return { time: result.time, actions, start, ...replayStats(def, actions, K, start) };
}

function replay(def, { actions, start }, K, onStep) {
  setMuted(true);
  const l = new Level(def, { headless: true });
  if (start) begin(l, start);
  playRoute(l, actions, onStep, K);
  setMuted(false);
  return l;
}

// Draws a solution's route onto the ASCII map ('o' = path), to eyeball whether it skips the intended challenge.
export function trace(idx, route, K = ROUTE_K) {
  const def = LEVELS[idx];
  const w = Math.max(...def.map.map((r) => r.length));
  const rows = def.map.map((r) => [...r.padEnd(w)]);
  replay(def, route, K, (l) => {
    const r = l.h - 1 - Math.floor(l.player.y + 0.35);
    const c = Math.floor(l.player.x);
    if (rows[r]?.[c] === ' ') rows[r][c] = 'o';
  });
  return rows.map((r) => r.join('')).join('\n');
}

// Replays a solution and reports how close the boss got (in tiles, minus its kill radius).
function replayStats(def, actions, K, start) {
  let minBossGap = Infinity;
  const l = replay(def, { actions, start }, K, (l) => {
    if (!l.boss || l.t <= def.boss.delay) return;
    minBossGap = Math.min(minBossGap, Math.hypot(l.player.x - l.boss.x, l.player.y + 0.4 - l.boss.y) - def.boss.r);
  });
  return { verified: l.won && !l.dead, minBossGap: l.boss ? +minBossGap.toFixed(2) : undefined };
}

export function solveAll(opts) {
  return LEVELS.map((def, i) => {
    const t0 = performance.now();
    const r = solve(i, opts);
    return {
      id: def.id,
      par: def.par,
      solved: !!r?.verified,
      time: r && +r.time.toFixed(2),
      minBossGap: r?.minBossGap,
      decisions: r?.actions.length,
      searchMs: Math.round(performance.now() - t0),
    };
  });
}
