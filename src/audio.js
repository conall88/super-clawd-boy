let ctx;
let out;
let sfxVolume = 0.8;

// Recorded effects, in public/sfx/. Loaded when audio first starts; until then they play silently.
const SAMPLES = { laugh: 'sfx/evil-laugh.mp3' };
const buffers = {};

export function ac() {
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = sfxVolume * sfxVolume;
    out.connect(ctx.destination);
    for (const [name, file] of Object.entries(SAMPLES)) {
      fetch(`${import.meta.env.BASE_URL}${file}`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => (buffers[name] = buf))
        .catch(() => {});
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 0..1, squared so the slider feels even to the ear.
export function setSfxVolume(v) {
  sfxVolume = v;
  if (out) out.gain.setTargetAtTime(v * v, ctx.currentTime, 0.05);
}

function tone(type, f0, f1, dur, vol = 0.1, delay = 0) {
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur);
}

function noiseBuffer(c, dur, decay) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (decay ? 1 - i / d.length : 1);
  return buf;
}

function noise(dur, vol = 0.2, { freq = 0, type = 'lowpass', q = 1 } = {}) {
  const c = ac();
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = noiseBuffer(c, dur, true);
  g.gain.value = vol;
  let node = src;
  if (freq) {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    node = node.connect(f);
  }
  node.connect(g).connect(out);
  src.start();
}

function sample(name, vol) {
  const c = ac();
  if (!buffers[name]) return;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buffers[name];
  g.gain.value = vol;
  src.connect(g).connect(out);
  src.start();
}

// Wet, squishy footfall with a little pitch variation so runs don't sound robotic.
const squish = (vol, freq) => noise(0.06, vol, { freq: freq * (0.8 + Math.random() * 0.4), type: 'bandpass', q: 2 });

let slideGain = null;
let sliding = false;

export function setSlide(on) {
  if (on === sliding || (!on && !ctx)) return;
  sliding = on;
  const c = ac();
  if (!slideGain) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 1, false);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 1.2;
    slideGain = c.createGain();
    slideGain.gain.value = 0;
    src.connect(f).connect(slideGain).connect(out);
    src.start();
  }
  slideGain.gain.setTargetAtTime(on ? 0.09 : 0, c.currentTime, 0.03);
}

const SFX = {
  step: () => squish(0.22, 1100),
  jump: () => (squish(0.2, 900), tone('square', 380, 760, 0.09, 0.05)),
  wall: () => (squish(0.25, 1400), tone('square', 300, 900, 0.11, 0.05)),
  land: () => (noise(0.12, 0.35, { freq: 700 }), tone('triangle', 180, 60, 0.07, 0.12)),
  die: () => (noise(0.3, 0.25), tone('sawtooth', 420, 40, 0.35, 0.1)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.2, 0.1, i * 0.09)),
  crumble: () => noise(0.12, 0.12),
  think: () => tone('sine', 900, 300, 0.25, 0.08),
  stomp: () => (noise(0.15, 0.2), tone('sine', 90, 40, 0.2, 0.25)),
  hit: () => (noise(0.2, 0.35), tone('square', 200, 50, 0.2, 0.12)),
  grab: () => tone('sawtooth', 600, 200, 0.3, 0.06),
  card: () => (noise(0.25, 0.25), tone('sawtooth', 110, 55, 0.5, 0.15)),
  rumble: () => tone('sine', 50, 35, 1.4, 0.3),
  click: () => tone('square', 1200, 800, 0.05, 0.08),
  alarm: () => [0, 0.25, 0.5].forEach((d) => tone('square', 880, 440, 0.2, 0.06, d)),
  fall: () => tone('triangle', 800, 60, 1.0, 0.12),
  thud: () => (noise(0.3, 0.3), tone('sine', 70, 30, 0.4, 0.3)),
  blip: () => tone('sine', 660, 990, 0.12, 0.08),
  laugh: () => sample('laugh', 0.6),
  squint: () => (tone('sawtooth', 110, 82, 0.5, 0.07), tone('sine', 55, 41, 0.5, 0.2)),
  glint: () => [0, 0.06].forEach((d) => tone('sine', 2400, 3200, 0.08, 0.05, d)),
  wipe: () => (noise(0.8, 0.12, { freq: 1500 }), tone('sawtooth', 600, 70, 0.8, 0.06)),
  jet: () => (noise(1.1, 0.25, { freq: 600 }), tone('sawtooth', 60, 130, 1.0, 0.07)),
  poof: () => (noise(0.3, 0.2, { freq: 2500 }), tone('sine', 900, 1600, 0.15, 0.06)),
  heart: () => [880, 1175].forEach((f, i) => tone('sine', f, f, 0.2, 0.07, i * 0.12)),
  spring: () => (squish(0.2, 700), tone('square', 220, 1100, 0.2, 0.06)),
  inject: () => [0, 0.05, 0.1].forEach((d, i) => tone('sawtooth', 1400 - i * 400, 200 + i * 300, 0.06, 0.05, d)),
  gate: () => (noise(0.08, 0.2, { freq: 400 }), tone('square', 160, 80, 0.1, 0.08)),
  checkpoint: () => [784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.12, 0.05, i * 0.07)),
};

let muted = false;
export const setMuted = (on) => (muted = on);

export function sfx(name) {
  if (muted) return;
  try {
    SFX[name]?.();
  } catch {
    // Audio is best-effort; browsers may block it before a user gesture.
  }
}
