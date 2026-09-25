import '@fontsource/press-start-2p';
import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { Level } from './level.js';
import { CUTSCENES } from './cutscenes.js';
import { input, pollInput } from './input.js';
import { demoRoute } from './route.js';
import { sfx, setSfxVolume } from './audio.js';
import { playMusic, setMusicMuffled, setMusicOff, setMusicVolume } from './music.js';
import { PX, VIEW, fitView, orthoCamera, fitCamera, snap, sprite, texture, disposeScene } from './pixel.js';
import { THEMES, makeClawd, makeBackdrop, drawTilemap, sawTexture, animateClawd } from './sprites.js';

const FLOW = [
  { cutscene: 'intro', label: 'Prologue' },
  { level: 0 },
  { level: 1 },
  { level: 2 },
  { level: 3 },
  { level: 4 },
  { level: 5 },
  { level: 6 },
  { level: 7 },
  { cutscene: 'twinsIntro', label: 'Boss: Intro' },
  { level: 8 },
  { cutscene: 'twinsOutro', label: 'Epilogue' },
];
const labelOf = (e) => e.label ?? `${LEVELS[e.level].id} ${LEVELS[e.level].name}`;

const SAVE_KEY = 'super-clawd-boy';
const save = { unlocked: 0, best: {}, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
const persist = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save));
// v2 inserted 1-5..1-8 before the boss (`unlocked` is a FLOW index, so later entries shift by four)
// and tripled the boss level, so its old best time no longer compares.
if (!save.v) {
  if (save.unlocked >= 5) save.unlocked += 4;
  delete save.best['1-B'];
  save.v = 2;
  persist();
}

// Audio settings are shared by the options menu, the corner music button and the M key.
save.musicVolume ??= 0.4;
save.sfxVolume ??= 0.8;
function applyAudio() {
  setMusicOff(!!save.musicOff);
  setMusicVolume(save.musicVolume);
  setSfxVolume(save.sfxVolume);
  $('#music-toggle').classList.toggle('off', !!save.musicOff);
  $('#music-toggle').setAttribute('aria-pressed', String(!save.musicOff));
  $('#opt-music').textContent = `MUSIC: ${save.musicOff ? 'OFF' : 'ON'}`;
  for (const k of ['music', 'sfx']) {
    const v = Math.round(save[`${k}Volume`] * 100);
    $(`#opt-${k}-vol`).value = v;
    $(`#opt-${k}-vol-val`).textContent = `${v}%`;
  }
}
function setAudio(changes) {
  Object.assign(save, changes);
  persist();
  applyAudio();
}
const toggleMusic = () => setAudio({ musicOff: !save.musicOff });

const $ = (s) => document.querySelector(s);
const show = (s, on) => $(s).classList.toggle('hidden', !on);

// Torn-paper bottom edge for the black banners.
function jagged() {
  const pts = ['0 0', '100% 0'];
  for (let i = 40; i >= 0; i--) pts.push(`${(i / 40) * 100}% ${i % 2 ? 100 : 78 + Math.random() * 12}%`);
  return `polygon(${pts.join(',')})`;
}
$('#banner').style.clipPath = jagged();

// Keep focus off clickable UI so Enter/Space keep going to the game.
for (const b of ['#music-toggle', '#opt-music', '#opt-back', '#title .item']) {
  document.querySelectorAll(b).forEach((el) => (el.onmousedown = (ev) => ev.preventDefault()));
}
$('#music-toggle').onclick = () => {
  toggleMusic();
  $('#music-toggle').blur();
};
$('#opt-music').onclick = toggleMusic;
$('#opt-back').onclick = () => openOptions(false);
for (const k of ['music', 'sfx']) {
  const el = $(`#opt-${k}-vol`);
  el.oninput = () => setAudio({ [`${k}Volume`]: el.value / 100 });
  el.onchange = () => {
    el.blur();
    if (k === 'sfx') sfx('blip');
  };
}
applyAudio();

// Options menu: rows are picked with up/down (or hover), sliders nudged with left/right.
const optRows = [...document.querySelectorAll('#options .row')];
let optRow = 0;
const optionsOpen = () => !$('#options').classList.contains('hidden');
const highlight = () => optRows.forEach((r, i) => r.classList.toggle('sel', i === optRow));
optRows.forEach((r, i) => (r.onmouseenter = () => ((optRow = i), highlight())));
function openOptions(on) {
  show('#options', on);
  optRow = 0;
  highlight();
}
function updateOptions() {
  const { up, down, left, right } = input.nav;
  if (up || down) {
    optRow = (optRow + (down ? 1 : -1) + optRows.length) % optRows.length;
    highlight();
    sfx('click');
  }
  const key = [null, 'musicVolume', 'sfxVolume'][optRow];
  if (key && (left || right)) {
    setAudio({ [key]: Math.min(1, Math.max(0, Math.round((save[key] + (right ? 0.05 : -0.05)) * 20) / 20)) });
    if (key === 'sfxVolume') sfx('blip');
  }
  if (input.confirm) {
    if (optRow === 0) toggleMusic();
    else if (optRow === optRows.length - 1) openOptions(false);
  }
  if (input.back || input.padB || input.options) openOptions(false);
}

// Title menu: PLAY (selected by default, so Enter just starts), LEVEL SELECT, OPTIONS and CREDITS.
// Continue where you left off; once the epilogue is reached, start a fresh run from the prologue.
const startIdx = () => (save.unlocked >= FLOW.length - 1 ? 0 : save.unlocked);
const titleItems = [...document.querySelectorAll('#title .item')];
const titleActions = [() => goTo(startIdx()), () => openLevels(true), () => openOptions(true), () => show('#credits', true)];
const creditsOpen = () => !$('#credits').classList.contains('hidden');
$('#credits-back').onmousedown = (ev) => ev.preventDefault();
$('#credits-back').onclick = () => show('#credits', false);
let titleSel = 0;
const highlightTitle = () => titleItems.forEach((b, i) => b.classList.toggle('sel', i === titleSel));
titleItems.forEach((b, i) => {
  b.onmouseenter = () => ((titleSel = i), highlightTitle());
  b.onclick = titleActions[i];
});
function updateTitleMenu() {
  const { up, down } = input.nav;
  if (up || down) {
    titleSel = (titleSel + (down ? 1 : -1) + titleItems.length) % titleItems.length;
    highlightTitle();
    sfx('click');
  }
  if (input.options) openOptions(true);
  else if (input.levels) openLevels(true);
  else if (input.confirm) titleActions[titleSel]();
}

// Level select: a two-column grid of every FLOW entry, locked ones greyed out.
let levelSel = 0;
const levelsOpen = () => !$('#levels').classList.contains('hidden');
const levelButtons = () => [...document.querySelectorAll('#level-list button')];
function highlightLevels() {
  levelButtons().forEach((b, i) => b.classList.toggle('sel', i === levelSel));
  levelButtons()[levelSel]?.scrollIntoView({ block: 'nearest' });
}
function buildLevels() {
  const list = $('#level-list');
  list.innerHTML = '';
  FLOW.forEach((e, i) => {
    const b = document.createElement('button');
    b.className = 'panel';
    const locked = i > save.unlocked;
    b.classList.toggle('locked', locked);
    const best = e.level !== undefined && save.best[LEVELS[e.level].id];
    b.innerHTML = locked ? '<span>??? LOCKED</span>' : `<span>${labelOf(e)}</span>${best ? `<b>${best.time.toFixed(2)}</b>` : ''}`;
    b.onmousedown = (ev) => ev.preventDefault();
    b.onmouseenter = () => ((levelSel = i), highlightLevels());
    b.onclick = () => !locked && goTo(i);
    list.append(b);
  });
}
function openLevels(on) {
  show('#levels', on);
  if (!on) return;
  buildLevels();
  levelSel = Math.min(save.unlocked, FLOW.length - 1);
  highlightLevels();
}
function updateLevels() {
  const { up, down, left, right } = input.nav;
  const step = left ? -1 : right ? 1 : up ? -2 : down ? 2 : 0;
  if (step && levelSel + step >= 0 && levelSel + step < FLOW.length) {
    levelSel += step;
    highlightLevels();
    sfx('click');
  }
  if (input.confirm && levelSel <= save.unlocked) goTo(levelSel);
  else if (input.back || input.padB || input.levels) openLevels(false);
}
$('#card').style.clipPath = `polygon(0 6%, 100% 0, 100% 94%, 0 100%)`;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
$('#app').appendChild(renderer.domElement);
const resize = () => fitView(renderer);
addEventListener('resize', resize);
resize();

const title = makeTitleScene();
let active = title;
let mode = 'title';
let flowIdx = 0;
let level = null;
let cs = null;
let csT = 0;
let cueIdx = 0;
let completeT = 0;
let hintTimer = 0;
let caption = null;
// Set by the dev console hook so test warps never touch the player's save.
let devRun = false;

function clear() {
  level?.dispose();
  level = null;
  if (cs) disposeScene(cs.scene);
  cs = null;
  for (const s of ['#hud', '#banner', '#think', '#hint', '#caption', '#card', '#skip', '#replay', '#title', '#options', '#levels', '#credits']) show(s, false);
  document.body.classList.remove('thinking');
  setMusicMuffled(false);
  caption = null;
}

function toTitle() {
  clear();
  devRun = false;
  mode = 'title';
  active = title;
  playMusic('title');
  const i = startIdx();
  $('#play-sub').textContent = i ? `CONTINUE: ${labelOf(FLOW[i]).toUpperCase()}` : 'START A NEW RUN';
  titleSel = 0;
  highlightTitle();
  show('#title', true);
}

function goTo(i) {
  clear();
  if (i >= FLOW.length) return toTitle();
  flowIdx = i;
  if (!devRun) {
    save.unlocked = Math.max(save.unlocked, i);
    persist();
  }
  const e = FLOW[i];
  if (e.cutscene) {
    const def = CUTSCENES[e.cutscene];
    playMusic(def.music);
    cs = { def, ...def.create() };
    csT = 0;
    cueIdx = 0;
    active = cs;
    mode = 'cutscene';
    show('#skip', true);
  } else {
    const def = LEVELS[e.level];
    playMusic(def.music);
    level = new Level(def);
    level.demo = demoRoute(def);
    active = level;
    mode = 'play';
    $('#level-name').textContent = `${def.id}: ${def.name.toUpperCase()}`;
    show('#hud', true);
    // Restart the slide-in animation.
    const banner = $('#banner');
    banner.style.animation = 'none';
    show('#banner', true);
    void banner.offsetWidth;
    banner.style.animation = '';
    show('#think', !!def.think);
    showHint(def.hint);
  }
}

function showHint(text, ms = 8000) {
  $('#hint').textContent = text;
  show('#hint', true);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => show('#hint', false), ms);
}

function setCaption(text) {
  if (text === caption) return;
  caption = text;
  $('#caption').textContent = text ?? '';
  show('#caption', !!text);
}

function updateCutscene(dt) {
  csT += dt;
  cs.update(csT, dt);
  const d = cs.def;
  while (cueIdx < d.cues.length && csT >= d.cues[cueIdx][0]) sfx(d.cues[cueIdx++][1]);
  setCaption(d.captions.find(([a, b]) => csT >= a && csT < b)?.[2]);
  const card = $('#card');
  if (d.card && csT >= d.card.at && card.classList.contains('hidden')) {
    $('#card-title').textContent = d.card.title;
    $('#card-sub').textContent = d.card.sub;
    card.className = d.card.boss ? 'boss' : '';
    sfx('card');
  }
  if (csT >= d.duration || input.skip) goTo(flowIdx + 1);
}

function updatePlay(dt) {
  if (input.back) return toTitle();
  if (input.hint && level.demo) {
    level.hintOn = !level.hintOn;
    sfx('blip');
    showHint(level.hintOn ? 'HINT ON: follow the blue ghost. Press H again to hide it.' : 'Hint off.', 3000);
  }
  const deaths = level.deaths;
  const hadCheckpoint = !!level.saved;
  const ev = level.update(dt, input);
  if (level.saved && !hadCheckpoint) showHint('CHECKPOINT: you will respawn here.', 2500);
  if (level.demo && !level.hintOn && level.deaths > deaths && level.deaths % 5 === 0) {
    showHint('Stuck? Press H (or B on a gamepad) to watch a hint ghost.', 5000);
  }
  $('#timer').textContent = level.timer.toFixed(2);
  $('#think-fill').style.width = `${level.thinkMeter * 100}%`;
  document.body.classList.toggle('thinking', level.thinking);
  setMusicMuffled(level.thinking);
  if (ev === 'win') onWin();
}

function onWin() {
  mode = 'complete';
  completeT = 0;
  document.body.classList.remove('thinking');
  setMusicMuffled(false);
  const def = level.def;
  const time = level.timer;
  const prev = save.best[def.id];
  const isBest = !prev || time < prev.time;
  if (!devRun) {
    if (isBest) save.best[def.id] = { time, deaths: level.deaths };
    save.unlocked = Math.max(save.unlocked, flowIdx + 1);
    persist();
  }
  const aPlus = time <= def.par;
  $('#results').innerHTML = `
    <h2>${def.boss ? 'BOSS DEFEATED' : `${def.id} COMPLETE`}</h2>
    <div class="grade ${aPlus ? 'aplus' : ''}">${aPlus ? 'A+' : 'B'}</div>
    <div class="row"><span>TIME</span><b>${time.toFixed(2)}</b>${isBest ? '<i>BEST</i>' : ''}</div>
    <div class="row"><span>DEATHS</span><b>${level.deaths}</b></div>
    <div class="row rival"><span>DR. OVERFIT*</span><b>${def.par.toFixed(2)}</b></div>
    <p class="fine">*self-reported, on a private eval set</p>`;
  show('#hud', false);
  show('#hint', false);
  show('#think', false);
  show('#replay', true);
  level.startReplay();
}

function updateComplete(dt) {
  completeT += dt;
  level.update(dt, input);
  if (completeT < 0.6) return;
  if (input.confirm) goTo(flowIdx + 1);
  else if (input.restart || input.padY) goTo(flowIdx);
  else if (input.back || input.padB) toTitle();
}

// Clawd running along an endless datacenter roof, hopping the saws.
function makeTitleScene() {
  const theme = THEMES.datacenter;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky[1]);
  const camera = orthoCamera();
  const backdrop = makeBackdrop(theme);
  scene.add(backdrop);
  // Tile details repeat every 63 columns, so the ground can jump back by that much invisibly.
  const WRAP = 63;
  const ground = sprite(texture(drawTilemap(-30, -8, 130, 8, (x, y) => y < 0, theme)));
  scene.add(ground);
  const SAW_GAP = 21;
  const saws = [0, 1, 2].map(() => {
    const s = sprite(sawTexture(1.375));
    s.position.z = -0.5;
    scene.add(s);
    return s;
  });
  const clawd = makeClawd();
  clawd.position.z = 1;
  scene.add(clawd);
  const SPEED = 9;
  const ZOOM = 2;
  let last = 0;
  return {
    scene,
    camera,
    update(t) {
      const dt = Math.min(0.05, t - last);
      last = t;
      const x = t * SPEED;
      ground.position.set(Math.floor(x / WRAP) * WRAP + 35, -4, 0);
      const base = Math.round(x / SAW_GAP) * SAW_GAP;
      saws.forEach((s, i) => {
        s.position.x = base + (i - 1) * SAW_GAP;
        s.rotation.z = -t * 7;
      });
      // Jump arc centred on the nearest saw.
      const d = base - x;
      const u = Math.abs(d) < 3.2 ? 1 - (d + 3.2) / 6.4 : -1;
      const air = u >= 0;
      clawd.position.set(snap(x, ZOOM), snap(air ? 4 * 3 * u * (1 - u) : 0, ZOOM), 1);
      animateClawd(clawd, { dt, speed: air ? 0 : SPEED, grounded: !air, vy: u < 0.5 ? 1 : -1 });
      const { h } = VIEW;
      // Put the ground in the lower third of the screen whatever the aspect ratio.
      const camY = h / (2 * PX * ZOOM) - h / (3 * PX * ZOOM) + 0.5;
      fitCamera(camera, x + 4, camY, ZOOM);
      backdrop.userData.update(camera.position.x, camera.position.y, 0);
    },
  };
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  pollInput();
  if (input.music) toggleMusic();
  if (mode === 'title') {
    title.update(now / 1000);
    if (optionsOpen()) updateOptions();
    else if (levelsOpen()) updateLevels();
    else if (creditsOpen()) {
      if (input.confirm || input.back || input.padB) show('#credits', false);
    } else updateTitleMenu();
  } else if (mode === 'cutscene') updateCutscene(dt);
  else if (mode === 'play') updatePlay(dt);
  else if (mode === 'complete') updateComplete(dt);
  renderer.render(active.scene, active.camera);
}

if (import.meta.env.DEV) {
  window.game = {
    goTo(i) {
      devRun = true;
      goTo(i);
    },
    get level() { return level; },
    seek(t) {
      csT = t;
      cueIdx = cs.def.cues.filter(([at]) => at < t).length;
    },
  };
}

toTitle();
requestAnimationFrame(frame);
