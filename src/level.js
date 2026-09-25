import * as THREE from 'three';
import { PX, texture, sprite, snap, orthoCamera, fitCamera, halfView, disposeScene } from './pixel.js';
import {
  THEMES, CLAWD, SMEAR, clawdFrames, makeClawd, makeHintGhost, makeSonnet, makeTwins, makeButton, makeBackdrop, makeRail,
  sawTexture, blockTextures, drawTilemap, animateClawd, animateTwins,
} from './sprites.js';
import { sfx, setSlide } from './audio.js';

export const STEP = 1 / 120;

// Units are tiles and seconds. Tune feel here. Reference: measured SMB values (DiGRA 2016, "You Say Jump,
// I Say How High?") scaled by Meat Boy's height = 0.7 tiles: top speed ~12.6, near-instant stop on release,
// air acceleration and air turning equal to the ground's.
const P = {
  W: 0.75, H: 0.7,
  walk: 8, run: 12.5,
  accel: 95, airAccel: 85, decel: 320, airDecel: 18, turnBoost: 1.6,
  // Holding run through a jump keeps building a little speed past the ground max.
  airRunMax: 14.5, airRunAccel: 5,
  jumpV: 18, gravUp: 42, gravDown: 68, jumpCut: 0.45, maxFall: 24,
  slideMax: 4.5, wallJumpVX: 10.5, wallJumpVY: 16.5, wallLock: 0.08, wallLockControl: 0.5,
  coyote: 0.09, buffer: 0.12,
  // RLHF pad launch: a fixed ~8.7 tile bounce, independent of the jump button.
  padV: 27,
};
const THINK = { scale: 0.3, drain: 2.5, recharge: 4 };
const SAW_MOVE = { amp: 2.5, period: 3 };
const CRUMBLE = { delay: 0.4, back: 2.5 };
// 429 gates: 'R' gates are shut for the first half of each period, 'r' gates for the second half.
const GATE = { period: 3, warn: 0.4 };
const INJECT = 2;
const BELT = 7;
const HINT = { len: 2, pause: 0.4 };
const MAX_PARTS = 240;
const BORDER = { side: 24, below: 4 };
// How much of the framing terrain the camera may show past the level edges.
const CAM_MARGIN = 2;

// Draw order (orthographic camera looks down -z). The backdrop sits at -9..-6.
const Z = { track: -0.6, saw: -0.5, tiles: 0, block: 0.1, goal: 0.2, ghost: 0.9, player: 1, boss: 1.2, parts: 1.3 };

const T_EMPTY = 0, T_SOLID = 1, T_CRUMBLE = 2, T_REAL = 3, T_FAKE = 4, T_PAD = 5, T_GATE = 6, T_BELT = 7;
const E = 1e-4;
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const gatePhaseAt = (t) => (t % GATE.period < GATE.period / 2 ? 0 : 1);
const dummy = new THREE.Object3D();

export class Level {
  // `headless` skips all graphics: physics only, for the solver and for simulating hint routes.
  constructor(def, { headless = false } = {}) {
    this.def = def;
    this.theme = THEMES[def.theme ?? 'datacenter'];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.sky[1]);
    this.camera = orthoCamera();

    this.parse(def.map);
    // Saws and gates share one 3s beat.
    this.timed = this.saws.some((s) => s.axis) || this.gates.size > 0;
    this.boss = def.boss ? { x: 0, y: 0, t0: 0 } : null;
    this.saved = null;
    this.demo = null;
    this.hintOn = false;
    if (!headless) this.build();

    this.deaths = 0;
    this.attempts = [];
    this.parts = [];
    this.thinkMeter = 1;
    this.thinking = false;
    this.shake = 0;
    this.won = false;
    this.replaying = false;
    this.respawn();
  }

  parse(rows) {
    const h = (this.h = rows.length);
    const w = (this.w = Math.max(...rows.map((r) => r.length)));
    this.grid = new Uint8Array(w * h);
    this.saws = [];
    this.crumbles = new Map();
    this.shimmers = [];
    this.pads = [];
    this.gates = new Map();
    this.belts = new Map();
    this.signs = [];
    this.flags = [];
    this.gatePhase = 0;
    rows.forEach((row, r) => {
      const y = h - 1 - r;
      for (let x = 0; x < w; x++) {
        const c = row[x] ?? ' ';
        const i = y * w + x;
        if (c === '#') this.grid[i] = T_SOLID;
        else if (c === 'X') {
          this.grid[i] = T_CRUMBLE;
          this.crumbles.set(i, { x, y, t: -1, gone: false, back: 0 });
        } else if (c === '=' || c === '?') {
          this.grid[i] = c === '=' ? T_REAL : T_FAKE;
          this.shimmers.push({ x, y, real: c === '=', seen: false });
        } else if (c === 'U') {
          this.grid[i] = T_PAD;
          this.pads.push({ x, y });
        } else if (c === 'R' || c === 'r') {
          this.grid[i] = T_GATE;
          this.gates.set(i, { x, y, phase: c === 'R' ? 0 : 1 });
        } else if (c === '<' || c === '>') {
          this.grid[i] = T_BELT;
          this.belts.set(i, { x, y, dir: c === '>' ? 1 : -1 });
        } else if (c === 'I') this.signs.push({ x, y });
        else if (c === 'C') this.flags.push({ x, y });
        else if (c === 'P') this.start = { x: x + 0.5, y };
        else if (c === 'G') this.goal = { x: x + 0.5, y };
        else if ('sSHV'.includes(c)) {
          this.saws.push({
            bx: x + 0.5, by: y + 0.5, x: x + 0.5, y: y + 0.5,
            r: c === 's' ? 0.5 : 1.375,
            axis: c === 'H' ? 'x' : c === 'V' ? 'y' : null,
          });
        }
      }
    });
  }

  build() {
    const { w, h, theme, scene } = this;

    // The out-of-bounds side walls (solid for physics) and a band below the floor are drawn as terrain,
    // so each level sits inside a solid mass like SMB's.
    const m = (this.map = { x0: -BORDER.side, y0: -BORDER.below, w: w + BORDER.side * 2, h: h + BORDER.below });
    this.visSolid = (x, y) => (x < 0 || x >= w ? y < h : this.isPlainSolid(x, Math.max(0, y)));
    this.tileCanvas = drawTilemap(m.x0, m.y0, m.w, m.h, this.visSolid, theme);
    this.tileCtx = this.tileCanvas.getContext('2d');
    this.tileTex = texture(this.tileCanvas);
    const tiles = sprite(this.tileTex);
    tiles.position.set(m.x0 + m.w / 2, m.y0 + m.h / 2, Z.tiles);
    scene.add(tiles);

    this.backdrop = makeBackdrop(theme);
    scene.add(this.backdrop);

    const blocks = (this.blocks = blockTextures());
    for (const c of this.crumbles.values()) {
      c.mesh = sprite(blocks.crumble);
      scene.add(c.mesh);
    }
    this.shimmerMat = new THREE.MeshBasicMaterial({ map: blocks.shimmer, transparent: true, opacity: 0.7, depthWrite: false });
    this.realMat = new THREE.MeshBasicMaterial({ map: blocks.real, alphaTest: 0.5 });
    this.fakeMat = new THREE.MeshBasicMaterial({ map: blocks.fake, alphaTest: 0.5 });
    for (const s of this.shimmers) {
      s.mesh = sprite(blocks.shimmer);
      s.mesh.position.set(s.x + 0.5, s.y + 0.5, Z.block);
      scene.add(s.mesh);
    }
    const place = (tex, x, y, flip = 1) => {
      const m = sprite(tex);
      m.position.set(x + 0.5, y + 0.5, Z.block);
      m.scale.x = flip;
      scene.add(m);
      return m;
    };
    for (const p of this.pads) place(blocks.pad, p.x, p.y);
    for (const s of this.signs) place(blocks.sign, s.x, s.y);
    for (const b of this.belts.values()) place(blocks.belt, b.x, b.y, b.dir);
    this.gateShutMat = new THREE.MeshBasicMaterial({ map: blocks.gateShut, alphaTest: 0.5 });
    this.gateOpenMat = new THREE.MeshBasicMaterial({ map: blocks.gateOpen, alphaTest: 0.5 });
    for (const g of this.gates.values()) g.mesh = place(blocks.gateShut, g.x, g.y);
    this.beltTex = blocks.belt;

    for (const s of this.saws) {
      s.mesh = sprite(sawTexture(s.r));
      scene.add(s.mesh);
      if (!s.axis) continue;
      const a = SAW_MOVE.amp;
      const rail = s.axis === 'x' ? makeRail(s.bx - a, s.by, s.bx + a, s.by) : makeRail(s.bx, s.by - a, s.bx, s.by + a);
      rail.position.z = Z.track;
      scene.add(rail);
    }

    this.goalMesh = this.def.boss ? makeButton() : makeSonnet();
    this.goalMesh.position.set(this.goal.x, this.goal.y, Z.goal);
    scene.add(this.goalMesh);

    if (this.boss) {
      this.boss.mesh = makeTwins();
      this.boss.mesh.scale.setScalar(2);
      scene.add(this.boss.mesh);
    }

    for (const f of this.flags) {
      f.mesh = sprite(blocks.flag, { anchor: 'bottom' });
      f.mesh.position.set(f.x + 0.5, f.y, Z.block);
      scene.add(f.mesh);
    }

    this.model = makeClawd();
    scene.add(this.model);
    this.ghost = makeHintGhost();
    Object.assign(this.ghost.material, { transparent: true, opacity: 0.75, alphaTest: 0.01, depthWrite: false });
    this.ghost.position.z = Z.ghost;
    this.ghost.visible = false;
    scene.add(this.ghost);

    this.partMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2 / PX, 2 / PX), new THREE.MeshBasicMaterial({ color: CLAWD }), MAX_PARTS,
    );
    this.partMesh.frustumCulled = false;
    scene.add(this.partMesh);
  }

  // --- world queries ---------------------------------------------------------

  solid(tx, ty) {
    if (tx < 0 || tx >= this.w) return true;
    if (ty < 0 || ty >= this.h) return false;
    const i = ty * this.w + tx;
    const t = this.grid[i];
    return t === T_SOLID || t === T_REAL || t === T_PAD || t === T_BELT ||
      (t === T_CRUMBLE && !this.crumbles.get(i).gone) || (t === T_GATE && this.gates.get(i).phase === this.gatePhase);
  }

  tile(tx, ty) {
    return tx >= 0 && tx < this.w && ty >= 0 && ty < this.h ? this.grid[ty * this.w + tx] : T_EMPTY;
  }

  isPlainSolid(tx, ty) {
    return tx >= 0 && tx < this.w && ty >= 0 && ty < this.h && this.grid[ty * this.w + tx] === T_SOLID;
  }

  touch(tx, ty) {
    if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return;
    const c = this.crumbles.get(ty * this.w + tx);
    if (c && c.t < 0 && !c.gone) c.t = 0;
  }

  overlapsTile(tx, ty) {
    const p = this.player;
    return p.x + P.W / 2 > tx && p.x - P.W / 2 < tx + 1 && p.y + P.H > ty && p.y < ty + 1;
  }

  wallDir(p) {
    const y0 = Math.floor(p.y + 0.1);
    const y1 = Math.floor(p.y + P.H - 0.1);
    const probe = (x) => {
      for (let ty = y0; ty <= y1; ty++) if (this.solid(Math.floor(x), ty)) return true;
      return false;
    };
    if (probe(p.x - P.W / 2 - 0.06)) return -1;
    if (probe(p.x + P.W / 2 + 0.06)) return 1;
    return 0;
  }

  // --- lifecycle -------------------------------------------------------------

  // After a checkpoint, attempts resume from it with the clock, the world's beat (saws, gates) and the
  // replay frames as they were when it was reached, so times, hints and replays all stay consistent.
  respawn() {
    const cp = this.saved;
    const at = cp ?? this.start;
    this.player = {
      x: at.x, y: at.y, vx: 0, vy: 0, facing: 1,
      onGround: false, coyote: 0, jumpBuf: 0, wallCoyote: 0, lastWall: 0, lockT: 0,
      jumping: false, sliding: false, wall: 0, squash: 0, trail: 0, inject: 0,
    };
    this.dead = false;
    this.t = cp ? cp.t : 0;
    this.gatePhase = gatePhaseAt(this.t);
    this.timer = cp ? cp.timer : 0;
    this.acc = 0;
    for (const c of this.crumbles.values()) Object.assign(c, { t: -1, gone: false, back: 0 });
    for (const s of this.shimmers) s.seen = false;
    if (this.boss) {
      const b = this.def.boss;
      Object.assign(this.boss, { x: at.x + b.x - this.start.x, y: at.y + b.y - this.start.y, t0: this.t });
    }
    this.attempt = { frames: cp ? cp.frames.slice() : [], boss: cp ? cp.boss.slice() : [], died: false };
    this.attempts.push(this.attempt);
    this.hint = null;
    this.snapCamera = true;
  }

  die() {
    if (this.dead || this.won) return;
    this.dead = true;
    this.deadT = 0.45;
    this.deaths++;
    this.attempt.died = true;
    this.shake = 0.35;
    sfx('die');
    this.burst(this.player.x, this.player.y + 0.35, 40, this.player.vx);
  }

  win() {
    this.won = true;
    this.attempt.died = false;
    sfx('win');
  }

  burst(x, y, n, vx = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(3, 11);
      this.parts.push({ x, y, vx: Math.cos(a) * s + vx * 0.3, vy: Math.sin(a) * s + 3, life: 2, size: 1 + (Math.random() * 3 | 0) * 0.5 });
    }
    if (this.parts.length > MAX_PARTS) this.parts.splice(0, this.parts.length - MAX_PARTS);
  }

  dispose() {
    setSlide(false);
    this.tileTex.dispose();
    this.backdrop.traverse((o) => o.material?.map?.dispose());
    disposeScene(this.scene);
  }

  // --- per-frame -------------------------------------------------------------

  update(dt, inp) {
    if (this.replaying) return this.updateReplay(dt);
    if (this.won) {
      this.render(dt);
      return null;
    }

    const thinking = !!this.def.think && inp.think && this.thinkMeter > 0 && !this.dead;
    this.thinkMeter = thinking
      ? Math.max(0, this.thinkMeter - dt / THINK.drain)
      : Math.min(1, this.thinkMeter + dt / THINK.recharge);
    if (thinking && !this.thinking) sfx('think');
    this.thinking = thinking;

    if (inp.restart && !this.dead) this.die();
    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) this.respawn();
    } else {
      // Real time on purpose: Extended Thinking slows the world but not the clock.
      this.timer += dt;
      if (inp.jumpPressed) this.player.jumpBuf = P.buffer;
    }

    this.acc += dt * (thinking ? THINK.scale : 1);
    let ev = null;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(inp);
      if (this.won) {
        ev = 'win';
        break;
      }
    }
    this.render(dt);
    return ev;
  }

  step(inp) {
    this.t += STEP;
    this.updateSaws();
    this.updateCrumbles();
    this.updateGates();
    this.updateParts();
    if (this.dead) return;
    if (this.gates.size && this.inShutGate()) return this.die();

    this.playerStep(inp);
    const p = this.player;
    for (const s of this.signs) {
      if (!this.overlapsTile(s.x, s.y)) continue;
      if (p.inject <= 0) sfx('inject');
      p.inject = INJECT;
    }
    for (const f of this.flags) {
      if (f.on || !this.overlapsTile(f.x, f.y)) continue;
      f.on = true;
      const { frames, boss } = this.attempt;
      this.saved = { x: f.x + 0.5, y: f.y, t: this.t, timer: this.timer, frames: frames.slice(), boss: boss.slice() };
      sfx('checkpoint');
    }
    this.attempt.frames.push(p.x, p.y, p.facing);
    if (this.boss) {
      this.bossStep();
      this.attempt.boss.push(this.boss.x, this.boss.y);
    }
    if (this.dead) return;
    if (p.y < -2 || this.hitSaw()) return this.die();

    const g = this.goal;
    if (Math.abs(p.x - g.x) < 0.5 + P.W / 2 && p.y < g.y + 1 && p.y + P.H > g.y) this.win();
  }

  playerStep(inp) {
    const p = this.player;
    const dt = STEP;
    let dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (p.inject > 0) {
      p.inject -= dt;
      dir = -dir;
    }
    const max = inp.run ? P.run : P.walk;
    const belt = p.onGround ? this.beltUnder(p) : 0;

    let accel = p.onGround ? P.accel : P.airAccel;
    if (p.lockT > 0) {
      p.lockT -= dt;
      accel *= P.wallLockControl;
    }
    if (dir) {
      const same = Math.sign(p.vx) === dir;
      const speed = Math.abs(p.vx);
      if (!p.onGround && inp.run && same && speed >= P.run - E) p.vx = approach(p.vx, dir * P.airRunMax, P.airRunAccel * dt);
      // Over the cap (e.g. landing from a boosted jump): bleed speed off gently rather than snapping.
      else if (same && speed > max) p.vx = approach(p.vx, dir * max, P.airDecel * dt);
      else p.vx = approach(p.vx, dir * max, accel * dt * (Math.sign(p.vx) === -dir ? P.turnBoost : 1));
      p.facing = dir;
    } else {
      p.vx = approach(p.vx, 0, (p.onGround ? P.decel : P.airDecel) * dt);
    }

    p.coyote = p.onGround ? P.coyote : p.coyote - dt;
    p.jumpBuf -= dt;
    const wall = (p.wall = this.wallDir(p));
    if (wall && !p.onGround) {
      p.wallCoyote = P.coyote;
      p.lastWall = wall;
    } else {
      p.wallCoyote -= dt;
    }

    if (p.jumpBuf > 0) {
      if (p.coyote > 0) {
        p.vy = P.jumpV;
        p.coyote = 0;
        p.jumpBuf = 0;
        p.jumping = true;
        p.squash = 0.2;
        sfx('jump');
      } else if (p.wallCoyote > 0) {
        p.vy = P.wallJumpVY;
        p.vx = -p.lastWall * P.wallJumpVX;
        p.facing = -p.lastWall;
        p.lockT = P.wallLock;
        p.wallCoyote = 0;
        p.jumpBuf = 0;
        p.jumping = true;
        p.squash = 0.2;
        sfx('wall');
      }
    }
    if (p.jumping && !inp.jump && p.vy > 0) {
      p.vy *= P.jumpCut;
      p.jumping = false;
    }
    if (p.vy <= 0) p.jumping = false;

    p.vy = Math.max(p.vy - (p.vy > 0 ? P.gravUp : P.gravDown) * dt, -P.maxFall);
    p.sliding = !p.onGround && wall !== 0 && dir === wall && p.vy < 0;
    if (p.sliding) p.vy = Math.max(p.vy, -P.slideMax);

    const wasGround = p.onGround;
    const vyBefore = p.vy;
    this.moveX(p, (p.vx + belt) * dt);
    p.onGround = false;
    this.moveY(p, p.vy * dt);
    // Leaving a conveyor keeps its push as momentum, so belts launch longer jumps.
    if (belt && !p.onGround) p.vx += belt;
    if (p.onGround && !wasGround) {
      p.squash = -0.25;
      if (vyBefore < -3) sfx('land');
      if (vyBefore < -10) this.paint(p.x, p.y, 16, 4);
    }

    for (const s of this.shimmers) if (!s.real && !s.seen && this.overlapsTile(s.x, s.y)) s.seen = true;

    if (p.onGround && Math.abs(p.vx) > 2) {
      p.trail += Math.abs(p.vx) * dt;
      if (p.trail > 0.2) {
        p.trail = 0;
        this.paint(p.x - p.facing * 0.1, p.y, 7, 4);
      }
    } else if (p.sliding) {
      p.trail += Math.abs(p.vy) * dt;
      if (p.trail > 0.2) {
        p.trail = 0;
        const face = wall > 0 ? Math.floor(p.x + P.W / 2 + 0.06) : Math.floor(p.x - P.W / 2 - 0.06) + 1;
        this.paint(face, p.y + 0.35, 4, 8);
      }
    }
  }

  moveX(p, dx) {
    p.x += dx;
    const y0 = Math.floor(p.y + E);
    const y1 = Math.floor(p.y + P.H - E);
    if (dx > 0) {
      const tx = Math.floor(p.x + P.W / 2);
      for (let ty = y0; ty <= y1; ty++) {
        if (!this.solid(tx, ty)) continue;
        this.touch(tx, ty);
        p.x = tx - P.W / 2 - E;
        p.vx = 0;
        break;
      }
    } else if (dx < 0) {
      const tx = Math.floor(p.x - P.W / 2);
      for (let ty = y0; ty <= y1; ty++) {
        if (!this.solid(tx, ty)) continue;
        this.touch(tx, ty);
        p.x = tx + 1 + P.W / 2 + E;
        p.vx = 0;
        break;
      }
    }
  }

  moveY(p, dy) {
    p.y += dy;
    const x0 = Math.floor(p.x - P.W / 2 + E);
    const x1 = Math.floor(p.x + P.W / 2 - E);
    if (dy < 0) {
      const ty = Math.floor(p.y);
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.solid(tx, ty)) continue;
        this.touch(tx, ty);
        p.y = ty + 1;
        if (this.tile(x0, ty) === T_PAD || this.tile(x1, ty) === T_PAD) {
          p.vy = P.padV;
          p.jumping = false;
          p.squash = 0.3;
          sfx('spring');
        } else {
          p.vy = 0;
          p.onGround = true;
        }
        break;
      }
    } else if (dy > 0) {
      const ty = Math.floor(p.y + P.H);
      for (let tx = x0; tx <= x1; tx++) {
        if (!this.solid(tx, ty)) continue;
        this.touch(tx, ty);
        p.y = ty - P.H - E;
        p.vy = 0;
        break;
      }
    }
  }

  updateSaws() {
    const lag = this.def.sawLag ?? 0;
    for (const s of this.saws) {
      const o = Math.sin(((this.t - s.bx * lag) * Math.PI * 2) / SAW_MOVE.period) * SAW_MOVE.amp;
      s.x = s.bx + (s.axis === 'x' ? o : 0);
      s.y = s.by + (s.axis === 'y' ? o : 0);
    }
  }

  hitSaw() {
    const p = this.player;
    const x0 = p.x - P.W / 2 + 0.08, x1 = p.x + P.W / 2 - 0.08;
    const y0 = p.y + 0.06, y1 = p.y + P.H - 0.08;
    return this.saws.some((s) => {
      const cx = clamp(s.x, x0, x1);
      const cy = clamp(s.y, y0, y1);
      return (s.x - cx) ** 2 + (s.y - cy) ** 2 < s.r * s.r;
    });
  }

  updateCrumbles() {
    for (const c of this.crumbles.values()) {
      if (c.gone) {
        c.back -= STEP;
        if (c.back <= 0 && !this.overlapsTile(c.x, c.y)) Object.assign(c, { gone: false, t: -1 });
      } else if (c.t >= 0) {
        c.t += STEP;
        if (c.t > CRUMBLE.delay) {
          c.gone = true;
          c.back = CRUMBLE.back;
          sfx('crumble');
        }
      }
    }
  }

  updateGates() {
    const phase = gatePhaseAt(this.t);
    if (phase !== this.gatePhase && !this.dead) {
      const p = this.player;
      for (const g of this.gates.values()) {
        if (g.phase !== phase || Math.abs(g.x - p.x) > 22 || Math.abs(g.y - p.y) > 13) continue;
        sfx('gate');
        break;
      }
    }
    this.gatePhase = phase;
  }

  // A gate slamming shut on Clawd crushes him.
  inShutGate() {
    const p = this.player;
    for (let ty = Math.floor(p.y + E); ty <= Math.floor(p.y + P.H - E); ty++) {
      for (let tx = Math.floor(p.x - P.W / 2 + E); tx <= Math.floor(p.x + P.W / 2 - E); tx++) {
        if (this.tile(tx, ty) === T_GATE && this.solid(tx, ty)) return true;
      }
    }
    return false;
  }

  beltUnder(p) {
    const ty = Math.floor(p.y - 0.05);
    for (const tx of [Math.floor(p.x - P.W / 2 + E), Math.floor(p.x + P.W / 2 - E)]) {
      if (this.tile(tx, ty) === T_BELT) return this.belts.get(ty * this.w + tx).dir * BELT;
    }
    return 0;
  }

  bossStep() {
    const b = this.boss;
    const cfg = this.def.boss;
    const p = this.player;
    if (this.t - b.t0 < cfg.delay) return;
    const dx = p.x - b.x;
    const dy = p.y + 0.4 - b.y;
    const d = Math.hypot(dx, dy) || 1;
    // Rubber-banded: slow when close, fast when you've pulled ahead, so you always have to keep moving.
    const sp = cfg.speed + clamp((d - cfg.near) * 0.45, 0, cfg.catchup);
    b.x += (dx / d) * sp * STEP;
    b.y += (dy / d) * sp * STEP;
    if (d < cfg.r) this.die();
  }

  // --- splatter: painted straight onto the tile pixels, only where tiles exist ---
  // A rect straddling a surface edge only lands on the tile half, so h=4 on a floor leaves a 2px streak.

  paint(x, y, w, h) {
    const g = this.tileCtx;
    if (!g) return;
    const m = this.map;
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = SMEAR[(Math.random() * SMEAR.length) | 0];
    g.fillRect(Math.round((x - m.x0) * PX - w / 2), Math.round((m.y0 + m.h - y) * PX - h / 2), w, h);
    this.tilesDirty = true;
  }

  updateParts() {
    for (const q of this.parts) {
      if (q.life <= 0) continue;
      q.life -= STEP;
      q.vy -= 30 * STEP;
      const nx = q.x + q.vx * STEP;
      const ny = q.y + q.vy * STEP;
      if (this.visSolid(Math.floor(nx), Math.floor(ny))) {
        this.paint(nx, ny, rand(2, 4) | 0, rand(2, 4) | 0);
        q.life = 0;
        continue;
      }
      q.x = nx;
      q.y = ny;
      if (q.y < -6) q.life = 0;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
  }

  // --- replay ----------------------------------------------------------------

  startReplay() {
    this.replaying = true;
    this.replayT = 0;
    this.replayAcc = 0;
    this.replayHold = 0;
    this.thinking = false;
    this.ghostList = this.attempts.filter((a) => a !== this.attempt && a.frames.length).slice(-150);
    this.ghosts = new THREE.InstancedMesh(
      this.model.geometry,
      new THREE.MeshBasicMaterial({ map: clawdFrames().run0, alphaTest: 0.5, side: THREE.DoubleSide }),
      Math.max(1, this.ghostList.length),
    );
    this.ghosts.count = this.ghostList.length;
    this.ghosts.frustumCulled = false;
    this.ghosts.position.z = Z.ghost;
    this.scene.add(this.ghosts);
    this.splatted = new Set();
    this.replayLen = Math.max(...this.attempts.map((a) => a.frames.length / 3));
  }

  updateReplay(dt) {
    this.replayT += dt;
    this.replayAcc += dt;
    while (this.replayAcc >= STEP) {
      this.replayAcc -= STEP;
      this.updateParts();
    }
    const f = Math.floor(this.replayT / STEP);
    this.t = f * STEP;
    this.updateSaws();
    this.gatePhase = gatePhaseAt(this.t);

    this.ghostList.forEach((a, i) => {
      const n = a.frames.length / 3;
      if (f < n) {
        dummy.position.set(snap(a.frames[f * 3]), snap(a.frames[f * 3 + 1]), 0);
        dummy.scale.set(a.frames[f * 3 + 2], 1, 1);
      } else {
        dummy.scale.set(0, 0, 0);
        if (a.died && !this.splatted.has(i)) {
          this.splatted.add(i);
          this.burst(a.frames[(n - 1) * 3], a.frames[(n - 1) * 3 + 1] + 0.35, 10);
        }
      }
      dummy.updateMatrix();
      this.ghosts.setMatrixAt(i, dummy.matrix);
    });
    this.ghosts.instanceMatrix.needsUpdate = true;

    const w = this.attempt.frames;
    const n = w.length / 3;
    const k = Math.min(f, n - 1);
    const kp = Math.max(0, k - 1);
    const p = this.player;
    p.x = w[k * 3];
    p.y = w[k * 3 + 1];
    p.facing = w[k * 3 + 2];
    p.vx = (w[k * 3] - w[kp * 3]) / STEP;
    p.vy = (w[k * 3 + 1] - w[kp * 3 + 1]) / STEP;
    p.onGround = Math.abs(p.vy) < 1e-3;
    p.sliding = false;
    if (this.boss && this.attempt.boss.length) {
      const bk = Math.min(k, this.attempt.boss.length / 2 - 1);
      this.boss.x = this.attempt.boss[bk * 2];
      this.boss.y = this.attempt.boss[bk * 2 + 1];
    }

    if (f >= this.replayLen) {
      this.replayHold += dt;
      if (this.replayHold > 1.5) {
        this.replayT = 0;
        this.replayHold = 0;
        this.splatted.clear();
      }
    }
    this.render(dt);
    return null;
  }

  // --- visuals ---------------------------------------------------------------

  render(dt) {
    const p = this.player;
    const wdt = dt * (this.thinking ? THINK.scale : 1);
    const now = performance.now() / 1000;

    // Face away from the wall while sliding, with the claw touching it (like Meat Boy).
    const slideWall = p.sliding ? p.wall : 0;
    const m = this.model;
    m.visible = !this.dead;
    m.position.set(snap(p.x - slideWall * (2 / PX)), snap(p.y), Z.player);
    p.squash = approach(p.squash, 0, wdt * 2.5);
    const footfall = animateClawd(m, {
      speed: p.onGround ? Math.abs(p.vx) : 0, grounded: p.onGround, vy: p.vy, sliding: p.sliding,
      facing: slideWall ? -slideWall : p.facing, squash: p.squash, dt: wdt,
    });
    const live = !this.dead && !this.won && !this.replaying;
    if (footfall && live) sfx('step');
    setSlide(live && p.sliding);
    // Injected: flicker faster as the mirrored controls are about to wear off.
    const injected = live && p.inject > 0 && (p.inject > 0.6 || Math.floor(now * 14) % 2 === 0);
    m.material.color.set(injected ? '#c77dff' : '#ffffff');

    const u = this.t % GATE.period;
    for (const g of this.gates.values()) {
      const shut = g.phase === this.gatePhase;
      const untilShut = (((g.phase * GATE.period) / 2 - u) % GATE.period + GATE.period) % GATE.period;
      const warn = !shut && untilShut < GATE.warn && Math.floor(now * 16) % 2 === 0;
      g.mesh.material = shut || warn ? this.gateShutMat : this.gateOpenMat;
    }
    if (this.belts.size) this.beltTex.offset.x = -Math.floor((this.t * BELT * PX) % PX) / PX;
    for (const f of this.flags) f.mesh.material.map = f.on ? this.blocks.flagOn : this.blocks.flag;
    this.updateHint(wdt);

    for (const s of this.saws) {
      s.mesh.position.set(snap(s.x), snap(s.y), Z.saw);
      s.mesh.rotation.z -= wdt * (s.r > 0.6 ? 7 : 12);
    }

    for (const c of this.crumbles.values()) {
      c.mesh.visible = !c.gone;
      const j = c.t >= 0 && !c.gone ? 1 / PX : 0;
      c.mesh.position.set(c.x + 0.5 + Math.round(rand(-1, 1)) * j, c.y + 0.5, Z.block);
    }

    this.shimmerMat.opacity = 0.55 + Math.sin(now * 8) * 0.2;
    for (const s of this.shimmers) {
      s.mesh.material = this.thinking ? (s.real ? this.realMat : this.fakeMat) : s.seen ? this.fakeMat : this.shimmerMat;
    }

    if (this.def.boss) this.goalMesh.userData.press(this.won);
    else {
      animateClawd(this.goalMesh, { dt, facing: -1 });
      this.goalMesh.position.y = snap(this.goal.y + (this.won ? Math.abs(Math.sin(now * 12)) * 0.3 : 0));
    }

    if (this.boss) {
      this.boss.mesh.visible = !this.won || this.replaying;
      this.boss.mesh.position.set(snap(this.boss.x), snap(this.boss.y), Z.boss);
      animateTwins(this.boss.mesh, now);
    }

    this.parts.forEach((q, i) => {
      dummy.position.set(snap(q.x), snap(q.y), Z.parts);
      dummy.scale.set(q.size, q.size, 1);
      dummy.updateMatrix();
      this.partMesh.setMatrixAt(i, dummy.matrix);
    });
    this.partMesh.count = this.parts.length;
    this.partMesh.instanceMatrix.needsUpdate = true;

    if (this.tilesDirty) {
      this.tileTex.needsUpdate = true;
      this.tilesDirty = false;
    }
    this.updateCamera(dt);
  }

  // Hint ghost: plays the next stretch of the solver's route (`this.demo`, x/y/facing per step) from the point
  // nearest Clawd. On levels with moving saws or gates it first waits until the world's beat matches the
  // route's, so it clears them on time.
  updateHint(wdt) {
    const d = this.demo;
    const g = this.ghost;
    g.visible = false;
    if (!this.hintOn || !d || this.dead || this.won || this.replaying) {
      this.hint = null;
      return;
    }
    const n = d.length / 3;
    if (!this.hint || this.hint.f >= Math.min(n - 1, this.hint.i0 + HINT.len / STEP)) {
      const p = this.player;
      let i0 = 0;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const dd = (d[i * 3] - p.x) ** 2 + (d[i * 3 + 1] - p.y) ** 2;
        if (dd < best) [best, i0] = [dd, i];
      }
      const beat = ((((i0 + 1) * STEP - this.t) % SAW_MOVE.period) + SAW_MOVE.period) % SAW_MOVE.period;
      this.hint = { i0, f: i0, wait: this.timed ? beat : HINT.pause };
    }
    const h = this.hint;
    if (h.wait > 0) h.wait -= wdt;
    else h.f += wdt / STEP;
    const k = Math.min(Math.floor(h.f), n - 1);
    const kp = Math.max(0, k - 1);
    const vx = (d[k * 3] - d[kp * 3]) / STEP;
    const vy = (d[k * 3 + 1] - d[kp * 3 + 1]) / STEP;
    const grounded = Math.abs(vy) < 1e-3;
    g.visible = true;
    g.position.set(snap(d[k * 3]), snap(d[k * 3 + 1]), Z.ghost);
    animateClawd(g, { speed: grounded ? Math.abs(vx) : 0, grounded, vy, facing: d[k * 3 + 2], dt: wdt });
  }

  updateCamera(dt) {
    const p = this.player;
    const { hw, hh } = halfView();
    const bottom = -BORDER.below;
    // Look ahead by velocity rather than facing, so turning doesn't swing the camera.
    let tx = p.x + clamp(p.vx * 0.12, -1.8, 1.8);
    let ty = p.y + 1;
    tx = this.w + CAM_MARGIN * 2 > hw * 2 ? clamp(tx, hw - CAM_MARGIN, this.w - hw + CAM_MARGIN) : this.w / 2;
    // Short levels sit on the bottom of the screen with open sky above, like SMB's.
    ty = this.h - bottom + CAM_MARGIN > hh * 2 ? clamp(ty, bottom + hh, this.h - hh + CAM_MARGIN) : bottom + hh;
    if (this.snapCamera || this.camX === undefined) {
      this.camX = tx;
      this.camY = ty;
      this.snapCamera = false;
    }
    const k = 1 - Math.exp(-dt * 9);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    this.shake = Math.max(0, this.shake - dt);
    const sx = rand(-1, 1) * this.shake * 0.6;
    const sy = rand(-1, 1) * this.shake * 0.6;
    fitCamera(this.camera, this.camX + sx, this.camY + sy);
    this.backdrop.userData.update(this.camera.position.x, this.camera.position.y, 1);
  }
}
