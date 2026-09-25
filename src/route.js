// Solver routes: a level's winning input as one action per K physics steps. The solver finds them
// (tools/solver.js); the game replays them headlessly to drive the hint ghost.
import { Level } from './level.js';
import { setMuted } from './audio.js';
import { ROUTES } from './routes.js';

export const ACTIONS = [-1, 0, 1].flatMap((dir) => [0, 1].map((jump) => ({ dir, jump })));
export const K = 6;
const JUMP_BUFFER = 0.12;

// Steps `l` through `actions` (indices into ACTIONS), calling onStep after every physics step.
export function playRoute(l, actions, onStep, k = K) {
  const inp = { left: false, right: false, jump: false, run: true, think: false };
  let prevJump = 0;
  for (const a of actions) {
    const { dir, jump } = ACTIONS[a];
    Object.assign(inp, { left: dir < 0, right: dir > 0, jump: !!jump });
    for (let f = 0; f < k && !l.won && !l.dead; f++) {
      if (f === 0 && jump && !prevJump) l.player.jumpBuf = JUMP_BUFFER;
      l.step(inp);
      onStep?.(l);
    }
    prevJump = jump;
  }
}

// The level's stored route as x/y/facing per physics step, or null if there is none or it no longer
// wins (the map changed since `node tools/solve.mjs --write-routes` last ran).
export function demoRoute(def) {
  const route = ROUTES[def.id];
  if (!route) return null;
  const l = new Level(def, { headless: true });
  const frames = [];
  setMuted(true);
  playRoute(l, [...route].map(Number), ({ player: p }) => frames.push(p.x, p.y, p.facing));
  setMuted(false);
  if (l.won && !l.dead) return frames;
  console.warn(`Hint route for ${def.id} is stale; run: node tools/solve.mjs --write-routes`);
  return null;
}
