// Stage soundtracks: royalty-free MP3s by Kevin MacLeod (incompetech.com, CC BY 4.0), streamed through WebAudio
// so tracks crossfade, share one volume control, and can be muffled during Extended Thinking.
import { ac } from './audio.js';

// `lufs` is each file's measured integrated loudness (ffmpeg -af ebur128). The masters range from -8.5 to
// -17.3 LUFS, so each track is gained down to TARGET_LUFS to sit level with the others and under the SFX.
const TARGET_LUFS = -18;
export const TRACKS = {
  title: { file: 'exhilarate.mp3', title: 'Exhilarate', lufs: -8.5 },
  hello: { file: 'rocket-power.mp3', title: 'Rocket Power', lufs: -10.4 },
  wall: { file: 'ready-aim-fire.mp3', title: 'Ready Aim Fire', lufs: -10.1 },
  descent: { file: 'in-a-heartbeat.mp3', title: 'In a Heartbeat', lufs: -15.3 },
  halluc: { file: 'dream-culture.mp3', title: 'Dream Culture', lufs: -17.3 },
  feedback: { file: 'pinball-spring.mp3', title: 'Pinball Spring 160', lufs: -11.2 },
  inject: { file: 'overworld.mp3', title: 'Overworld', lufs: -15.5 },
  ratelimit: { file: 'blown-away.mp3', title: 'Blown Away', lufs: -10.7 },
  pipeline: { file: 'cyborg-ninja.mp3', title: 'Cyborg Ninja', lufs: -9.1 },
  twins: { file: 'summon-the-rawk.mp3', title: 'Summon the Rawk', lufs: -8.6 },
};
const FADE = 0.6;

let c = null;
let master, muffle;
let cur = null;
let volume = 0.4;
let off = false;
let muffled = false;

function init() {
  if (c) return;
  c = ac();
  master = c.createGain();
  muffle = c.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  master.connect(muffle).connect(c.destination);
  applyVolume();
  // Browsers block autoplay until a gesture, so (re)start the current track on the first one.
  for (const ev of ['keydown', 'pointerdown']) {
    addEventListener(ev, () => {
      if (c.state === 'suspended') c.resume();
      if (cur?.el.paused) cur.el.play().catch(() => {});
    });
  }
}

function applyVolume() {
  // Squared so the slider feels even to the ear.
  if (c) master.gain.setTargetAtTime(off ? 0 : volume * volume, c.currentTime, 0.05);
}

function fadeOut({ el, gain }) {
  const g = gain.gain;
  g.cancelScheduledValues(c.currentTime);
  g.setValueAtTime(g.value, c.currentTime);
  g.linearRampToValueAtTime(0, c.currentTime + FADE);
  setTimeout(() => {
    el.pause();
    el.removeAttribute('src');
    el.load();
    gain.disconnect();
  }, FADE * 1000 + 100);
}

// Switching to the track that's already playing is a no-op, so restarts and deaths don't reset it.
export function playMusic(name) {
  if (cur?.name === name) return;
  init();
  if (cur) fadeOut(cur);
  const t = TRACKS[name];
  if (!t) {
    cur = null;
    return;
  }
  const el = new Audio(`${import.meta.env.BASE_URL}music/${t.file}`);
  el.loop = true;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(10 ** ((TARGET_LUFS - t.lufs) / 20), c.currentTime + FADE);
  c.createMediaElementSource(el).connect(gain).connect(master);
  el.play().catch(() => {});
  cur = { name, el, gain };
}

// Extended Thinking: the world goes underwater.
export function setMusicMuffled(on) {
  if (!c || on === muffled) return;
  muffled = on;
  muffle.frequency.setTargetAtTime(on ? 650 : 20000, c.currentTime, 0.08);
}

export function setMusicOff(on) {
  off = on;
  applyVolume();
}

// 0..1
export function setMusicVolume(v) {
  volume = v;
  applyVolume();
}
