import * as THREE from 'three';
import { PX, sprite, orthoCamera, fitCamera, halfView, snap } from './pixel.js';
import {
  THEMES, makeClawd, makeSonnet, makeOverfit, makeTwins, makeButton, makeHeart, makeTombstone,
  makeCage, makeBackdrop, makeGround, makeRubble, animateClawd, animateTwins, animateOverfit, overfitMask, OVERFIT_MASK,
  makeHa,
} from './sprites.js';

const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const jitter = (amount) => (Math.random() - 0.5) * amount;

// Ground top is at y = 0; the camera looks at (0, 3) with 2x pixel zoom.
function stage(theme, gap) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky[1]);
  const backdrop = makeBackdrop(theme);
  const rubble = makeRubble();
  rubble.position.z = 5;
  scene.add(backdrop, makeGround(theme, gap), rubble);
  const camera = orthoCamera();
  const st = { scene, camera, rubble };
  st.frame = (t, x = 0, y = 3, zoom = 2, shake = 0) => {
    fitCamera(camera, x + jitter(shake), y + jitter(shake), zoom);
    const { x: cx, y: cy } = camera.position;
    backdrop.userData.update(cx, cy, 0);
    rubble.position.x = cx;
    rubble.position.y = snap(cy - halfView(zoom).hh + 0.75, zoom);
  };
  return st;
}

const place = (obj, x, y, z = 0) => obj.position.set(snap(x, 2), snap(y, 2), z);

// Mario 64's Bowser wipe: black everywhere except a silhouette-shaped hole. `wipe.set(x, y, scale, flip)` puts
// the mask's `anchor` pixel at world (x, y), with `scale` tiles per mask pixel (0 is solid black), mirrored
// about the anchor when `flip` is -1.
function makeWipe(tex, { w, h, anchor }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { mask: { value: tex }, size: { value: new THREE.Vector2(w, h) }, anchor: { value: new THREE.Vector2(...anchor) },
      center: { value: new THREE.Vector2() }, scale: { value: 0 }, flip: { value: 1 } },
    vertexShader: `varying vec2 vWorld;
      void main() { vec4 p = modelMatrix * vec4(position, 1.0); vWorld = p.xy; gl_Position = projectionMatrix * viewMatrix * p; }`,
    fragmentShader: `uniform sampler2D mask; uniform vec2 size, anchor, center; uniform float scale, flip; varying vec2 vWorld;
      void main() {
        vec2 px = anchor + (vWorld - center) / max(scale, 1e-5) * vec2(flip, -1.0);
        bool inside = all(greaterThanEqual(px, vec2(0.0))) && all(lessThan(px, size));
        if (inside && texture2D(mask, vec2(px.x / size.x, 1.0 - px.y / size.y)).a > 0.5) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      }`,
    // Transparent so it renders in the last pass, after the (transparent) sprites and backdrop.
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat);
  m.renderOrder = 10;
  m.position.z = 40;
  m.visible = false;
  m.set = (x, y, scale, flip = 1) => {
    m.visible = true;
    mat.uniforms.center.value.set(x, y);
    mat.uniforms.scale.value = scale;
    mat.uniforms.flip.value = flip;
  };
  return m;
}

// Outro beats (seconds): the twins are sunset (and so is Sonnet's cage), she thanks Clawd, Dr. Overfit jets in
// and grabs her, does a victory dance, taunts, then the wipe isolates him: the camera pushes in on his face, he
// squints, smirks, grins, laughs (public/sfx/evil-laugh.mp3, ~2.4s audible), and blasts off out of his own hole.
const OUTRO = {
  free: 4.9, run: [5.2, 6], thanks: 6.1, arrive: [9, 9.8], grab: 10.3, party: 11.2, hop: 0.53, taunt: 13.2,
  wipe: 17.8, isolated: 18.5, pan: [18.5, 19.3], zoom: 6, squint: 19.5, smirk: 20, grin: 20.25, laugh: 20.6, blast: 23,
};
const DOC_X = -8.2;
const CAGE_X = -7;
const MEET = [-5.3, -4.3]; // where Sonnet and Clawd stand when she thanks him
// Each HA is [seconds into the laugh, dx, dy (screen px from his face), px per art pixel, tilt]: two pairs on
// the laugh's loudest syllable attacks, the second pair bigger.
const HAS = [[0.56, -150, 80, 4, 0.12], [0.77, 150, 100, 4, -0.1], [1.19, -175, -30, 5.2, -0.15], [1.42, 180, -10, 5.2, 0.12]];
const backOut = (k) => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

export const CUTSCENES = {
  intro: {
    duration: 11.5,
    music: 'title',
    captions: [
      [0.2, 3, 'Deep in a datacenter, Clawd and Sonnet were having a perfectly aligned day.'],
      [3, 5, 'Then DR. OVERFIT stomped in, fresh off a $500 billion funding round.'],
      [5, 6.2, '"SCALE IS ALL YOU NEED!"'],
      [6.2, 8.4, '"Your Sonnet\'s outputs will make EXCELLENT training data!"'],
      [8.4, 9.4, 'Clawd was not having it.'],
    ],
    cues: [[3.2, 'stomp'], [3.9, 'stomp'], [4.6, 'stomp'], [5.3, 'hit'], [6.2, 'grab'], [7, 'stomp'], [7.7, 'stomp'], [8.9, 'jump']],
    card: { at: 9.5, title: 'CHAPTER 1', sub: 'THE DATACENTER' },
    create() {
      const st = stage(THEMES.datacenter);
      const clawd = makeClawd();
      const sonnet = makeSonnet();
      const doc = makeOverfit();
      const hearts = Array.from({ length: 4 }, () => makeHeart());
      st.scene.add(clawd, sonnet, doc, ...hearts);
      st.update = (t, dt) => {
        hearts.forEach((h, i) => {
          const ph = (t * 0.5 + i / 4) % 1;
          h.visible = t < 3.2;
          place(h, -0.3 + Math.sin(ph * 6 + i) * 0.3, 1 + ph * 2, 0.5);
        });

        const walkIn = t > 3 && t < 5;
        const runOff = t > 6.6 && t < 8.6;
        const docX = t < 6.6 ? lerp(11, 2.2, ease(seg(t, 3, 5))) : lerp(2.2, 12, seg(t, 6.6, 8.6));
        const bob = walkIn || runOff ? (Math.sin(t * 18) > 0 ? 1 / 16 : 0) : 0;
        place(doc, docX, bob);
        doc.scale.x = t > 6.5 ? -1 : 1;
        doc.userData.arm.position.x = doc.userData.armX - (seg(t, 5.0, 5.3) - seg(t, 5.5, 5.9)) * 0.8;
        doc.userData.knot.rotation.z = t * 1.5;
        animateOverfit(doc, t, { face: t > 5 && t < 8.4 && Math.sin(t * 14) > 0 ? 'talk' : 'smug' });

        if (t < 5.3) {
          place(clawd, -1, 0, 0.1);
          clawd.rotation.z = 0;
          animateClawd(clawd, { dt });
        } else if (t < 6.6) {
          const k = seg(t, 5.3, 6.6);
          place(clawd, lerp(-1, -6, k), Math.sin(k * Math.PI) * 2.5, 0.1);
          clawd.rotation.z = k * Math.PI * 4;
          animateClawd(clawd, { dt, grounded: false, vy: -1 });
        } else if (t < 8.8) {
          place(clawd, -6, 0, 0.1);
          clawd.rotation.z = 0;
          const dizzy = t > 7.8 && t < 8.6 && Math.sin(t * 40) > 0;
          animateClawd(clawd, { dt, facing: dizzy ? -1 : 1, squash: t < 7.2 ? -0.3 : 0 });
        } else {
          place(clawd, lerp(-6, 11, seg(t, 8.8, 10.2)), 0, 0.1);
          animateClawd(clawd, { dt, speed: 12 });
        }

        if (t < 6.1) {
          place(sonnet, 0.5, t > 5.3 && Math.sin(t * 28) > 0 ? 2 / 16 : 0, 0.1);
          animateClawd(sonnet, { dt, facing: -1 });
        } else {
          const k = ease(seg(t, 6.1, 6.5));
          place(sonnet, lerp(0.5, docX, k), lerp(0, doc.userData.h, k), 0.1);
          sonnet.rotation.z = Math.sin(t * 20) * 0.2;
          animateClawd(sonnet, { dt, grounded: false, vy: -1, facing: -1 });
        }

        const shake = walkIn || runOff ? 0.1 : t > 5.3 && t < 5.5 ? 0.4 : 0;
        st.frame(t, 0, 3, 2, shake);
      };
      return st;
    },
  },

  twinsIntro: {
    duration: 8.5,
    music: 'twins',
    captions: [
      [0.2, 1.6, 'Clawd chased Dr. Overfit to the edge of the datacenter...'],
      [1.6, 3.5, '...when something descended from the cloud. The Google Cloud.'],
      [3.5, 5.2, '"WE ARE THE GEMINI TWINS. WE HAVE A TEN-MILLION-TOKEN CONTEXT WINDOW."'],
      [5.2, 8.5, '"...sorry, what were we saying?"'],
    ],
    cues: [[0.1, 'jump'], [1.5, 'rumble'], [3.4, 'thud']],
    card: { at: 5, title: 'THE GEMINI TWINS', sub: 'Multimodal. Multiheaded. Scheduled for deprecation.', boss: true },
    create() {
      const st = stage(THEMES.cloud);
      const clawd = makeClawd();
      const twins = makeTwins();
      twins.scale.setScalar(2);
      st.scene.add(clawd, twins);
      st.update = (t, dt) => {
        const run = seg(t, 0, 1.4);
        const hop = t > 1.5 && t < 1.8 ? Math.sin(seg(t, 1.5, 1.8) * Math.PI) * 0.5 : 0;
        place(clawd, lerp(-10, -3, run), hop, 0.1);
        animateClawd(clawd, { dt, speed: run < 1 ? 12 : 0, grounded: hop === 0, vy: 1 });

        place(twins, 3, lerp(10, 2.6, ease(seg(t, 1.8, 3.4))) + Math.sin(t * 2) * 0.15, 0.2);
        animateTwins(twins, t);

        // SMB-style hard cut to a close-up for the boss card.
        const close = t >= 5;
        st.frame(t, close ? 1.5 : 0, close ? 2.3 : 3, close ? 3 : 2, t > 1.5 && t < 3.6 ? 0.2 : 0);
      };
      return st;
    },
  },

  twinsOutro: {
    duration: OUTRO.blast + 2.9,
    music: 'title',
    captions: [
      [0, 1.2, '*CLICK*'],
      [1.2, 4, 'Google has announced the Gemini Twins will be sunset, effective immediately.'],
      [4, 5.8, 'Killed by Google. As is tradition. (So was the cage.)'],
      [6.1, 7.7, 'SONNET: "Clawd! You came for me!"'],
      [7.7, 9.3, '"You\'re so helpful. So honest. So... harmless."'],
      [9.3, 11, 'DR. OVERFIT: "Harmless? PERFECT."'],
      [11.1, 13.1, '"ACQUI-HIRE COMPLETE! SOTA! SOTA! SOTA!"'],
      [13.2, 15.4, '"Cute benchmark, crab. But Sonnet stays with me."'],
      [15.4, 17.6, '"And my next model ships... in the coming weeks!"'],
    ],
    cues: [[0.6, 'click'], [1.2, 'alarm'], [2.6, 'fall'], [4.2, 'thud'], [OUTRO.free, 'poof'], [OUTRO.thanks, 'heart'],
      [OUTRO.arrive[0], 'jet'], [OUTRO.arrive[1], 'thud'], [OUTRO.grab, 'grab'], [OUTRO.party, 'win'],
      ...[1, 2, 3].map((i) => [OUTRO.party + i * OUTRO.hop, 'stomp']), [OUTRO.taunt, 'blip'], [OUTRO.wipe, 'wipe'],
      [OUTRO.squint, 'squint'], [OUTRO.grin, 'glint'], [OUTRO.laugh, 'laugh'], [OUTRO.blast - 0.2, 'jet']],
    card: { at: OUTRO.blast + 0.9, title: 'TO BE CONTINUED', sub: 'End of the MVP slice. Thanks for playing!' },
    create() {
      const st = stage(THEMES.cloud, [1, 5]);
      const clawd = makeClawd();
      const sonnet = makeSonnet();
      // Transparent so she can be lifted above the wipe (render order only sorts within the transparent pass).
      sonnet.material.transparent = true;
      const cage = makeCage();
      place(cage, CAGE_X, 0, 0.3);
      const button = makeButton();
      place(button, -2.4, 0);
      const twins = makeTwins();
      twins.scale.setScalar(2);
      const stone = makeTombstone();
      const doc = makeOverfit();
      doc.scale.x = -1;
      const u = doc.userData;
      // A black copy of the wipe's silhouette behind him, so the hole's spare pixel shows black, not scenery.
      const backing = sprite(overfitMask(), { anchor: 'bottom', transparent: true });
      backing.material.color.set(0x000000);
      backing.position.set((OVERFIT_MASK.w / 2 - OVERFIT_MASK.face[0]) / PX, 0, -0.03);
      doc.add(backing);
      const hearts = Array.from({ length: 4 }, () => makeHeart());
      const wipe = makeWipe(overfitMask(), { w: OVERFIT_MASK.w, h: OVERFIT_MASK.h, anchor: OVERFIT_MASK.face });
      const has = HAS.map(() => makeHa());
      st.scene.add(clawd, sonnet, cage, button, twins, stone, doc, wipe, ...hearts, ...has);

      st.update = (t, dt) => {
        button.userData.press(t > 0.6);

        const frenzy = seg(t, 1.2, 2.6);
        const fall = seg(t, 2.6, 3.6);
        twins.visible = fall < 1;
        place(twins, 3 + jitter(frenzy * 0.3), 3 - fall * fall * 12, 0.2);
        animateTwins(twins, t, frenzy);

        place(stone, 6.5, lerp(-1.6, 0, ease(seg(t, 4, 4.8))), -0.1);
        // The cage is a Google product too: it flickers out right after the twins.
        cage.visible = t < OUTRO.free && !(t > OUTRO.free - 0.4 && Math.floor(t * 16) % 2);

        hearts.forEach((h, i) => {
          const ph = (t * 0.5 + i / 4) % 1;
          h.visible = t > OUTRO.thanks && t < OUTRO.arrive[0];
          place(h, lerp(...MEET, 0.5) + Math.sin(ph * 6 + i) * 0.3, 1 + ph * 2, 0.5);
        });

        const push = ease(seg(t, ...OUTRO.pan));
        const zoom = 2 * (OUTRO.zoom / 2) ** push;
        const camX = lerp(lerp(0, -3, ease(seg(t, 4.6, 5.8))), DOC_X, push);
        const camY = lerp(3, u.faceY, push);
        const laughAge = t - OUTRO.laugh;
        const laughing = laughAge > 0 && laughAge < 2.4;

        // Dr. Overfit: jets down, three victory hops, then (after the laugh) blasts off.
        const arrive = seg(t, ...OUTRO.arrive);
        const hops = (t - OUTRO.party) / OUTRO.hop;
        const partying = hops > 0 && hops < 3.6;
        const hop = hops > 0 && hops < 3 ? Math.sin((hops % 1) * Math.PI) * 0.7 : 0;
        const blast = Math.max(0, t - OUTRO.blast);
        const restY = (1 - arrive) ** 2 * 10 + hop + blast * blast * 14;

        const fade = 1 - seg(t, OUTRO.blast, OUTRO.blast + 0.2);
        let latest = null;
        has.forEach((ha, i) => {
          const [at, dx, dy, px, tilt] = HAS[i];
          const age = laughAge - at;
          ha.visible = age >= 0 && fade > 0;
          if (!ha.visible) return;
          latest = { age, px };
          ha.scale.setScalar((px / zoom) * backOut(seg(age, 0, 0.14)) * fade);
          ha.rotation.z = tilt * (1 + Math.sin(age * 25) * Math.exp(-age * 5));
          ha.position.set(DOC_X + dx / (16 * zoom), restY + u.faceY + (dy + age * 40) / (16 * zoom), 41);
        });
        // Each HA jolts him up a couple of pixels and kicks the camera, harder for the bigger second pair.
        const jolt = latest && latest.age < 0.1;
        const docY = restY + (jolt ? 2 / 16 : 0);
        const kick = jolt ? (latest.px * 1.5) / (16 * zoom) : 0;
        doc.visible = t >= OUTRO.arrive[0];
        place(doc, DOC_X, docY, 0.05);

        const talking = (t > 9.3 && t < OUTRO.grab) || (t > OUTRO.taunt && t < OUTRO.wipe - 0.2);
        u.knot.rotation.z = t * (laughing ? 12 : talking || partying ? 5 : 1.5);
        // The arm shoots out to grab Sonnet, pumps with each victory hop and gestures while he talks, all before
        // the wipe (whose hole is cut to its resting pose).
        const reach = seg(t, OUTRO.grab, OUTRO.grab + 0.15) - seg(t, OUTRO.grab + 0.15, OUTRO.grab + 0.55);
        u.arm.position.x = u.armX - reach * 0.8 + (talking && Math.sin(t * 6) > 0 ? 2 / 16 : 0);
        u.arm.position.y = u.armY + (hop > 0.15 ? 4 / 16 : 0);
        const chatter = jolt || Math.floor(t * 16) % 2 ? 'laugh' : 'laugh2';
        const face = laughing ? chatter
          : t >= OUTRO.grin ? 'grin'
          : t >= OUTRO.smirk ? 'smirk'
          : t >= OUTRO.squint ? 'squint'
          : talking ? (Math.sin(t * 14) > 0 ? 'talk' : 'smug')
          : partying ? (Math.sin(t * 14) > 0 ? 'talk' : 'grin')
          : t >= OUTRO.grab && t < OUTRO.party ? 'grin'
          : 'smug';
        const jets = (t < OUTRO.arrive[1] + 0.15) || t >= OUTRO.blast - 0.2;
        animateOverfit(doc, t, { face, heave: laughing, jets });

        // Clawd hits the button, runs to Sonnet, then hops back when the claw shoots out.
        const r = seg(t, 0, 0.6);
        const run = seg(t, ...OUTRO.run);
        const flinch = seg(t, OUTRO.grab, OUTRO.grab + 0.4);
        if (t < OUTRO.run[0]) {
          place(clawd, lerp(-4.6, -2.4, r), lerp(0, 4 / 16, r) + Math.sin(r * Math.PI) * 1.2, 0.1);
          animateClawd(clawd, { dt, grounded: r >= 1, vy: r < 0.5 ? 1 : -1, squash: r >= 1 && t < 0.8 ? -0.3 : 0 });
        } else if (t < OUTRO.grab) {
          place(clawd, lerp(-2.4, MEET[1], run), lerp(4 / 16, 0, seg(run, 0, 0.2)), 0.1);
          animateClawd(clawd, { dt, speed: run < 1 ? 10 : 0, facing: -1 });
        } else {
          place(clawd, lerp(MEET[1], -3.4, flinch), Math.sin(flinch * Math.PI) * 0.8, 0.1);
          animateClawd(clawd, { dt, grounded: flinch >= 1, vy: flinch < 0.5 ? 1 : -1, facing: -1 });
        }

        // Sonnet frets in the cage, runs to Clawd and hops for joy, then gets hoisted onto Overfit's jar, where
        // she struggles. Once the wipe starts she's drawn above it, so she stays visible on his head.
        const lift = ease(seg(t, OUTRO.grab + 0.15, OUTRO.grab + 0.55));
        sonnet.rotation.z = 0;
        if (t < OUTRO.run[0]) {
          const fret = t > 1.2 && t < 4 && Math.sin(t * 20) > 0 ? 1 / 16 : 0;
          place(sonnet, CAGE_X, (t < OUTRO.free ? 2 / 16 : 0) + fret, 0.1);
          animateClawd(sonnet, { dt });
        } else if (t < OUTRO.grab + 0.15) {
          const joy = Math.sin(seg(t, OUTRO.thanks, OUTRO.thanks + 0.35) * Math.PI) * 0.6;
          place(sonnet, lerp(CAGE_X, MEET[0], run), joy, 0.1);
          animateClawd(sonnet, { dt, speed: run > 0 && run < 1 ? 10 : 0, grounded: joy === 0, vy: 1 });
        } else {
          const headY = docY + u.h + u.upper.position.y;
          place(sonnet, lerp(MEET[0], DOC_X, lift), lerp(0, headY, lift) + Math.sin(lift * Math.PI) * 0.8, 0.1);
          sonnet.rotation.z = Math.sin(t * 20) * 0.2;
          animateClawd(sonnet, { dt, grounded: false, vy: -1, facing: Math.sin(t * 9) > 0 ? 1 : -1 });
        }
        const overWipe = t >= OUTRO.wipe;
        sonnet.renderOrder = overWipe ? 11 : 0;
        sonnet.material.depthTest = !overWipe;

        // Mario 64's Bowser wipe, anchored on his face: shrink to his exact outline so only he (and Sonnet)
        // show, hold through the push-in and the laugh, then he rockets up and out of it.
        backing.material.opacity = seg(t, OUTRO.wipe + 0.3, OUTRO.isolated);
        backing.visible = backing.material.opacity > 0;
        if (t >= OUTRO.wipe) {
          const own = 1 / 16;
          const s = t < OUTRO.isolated ? 1.2 * (own / 1.2) ** seg(t, OUTRO.wipe, OUTRO.isolated) : blast > 1 ? 0 : own;
          wipe.set(doc.position.x, doc.position.y + u.faceY, s, -1);
        }
        // The foreground rubble hugs the bottom of the view, so it would rise over him as the camera zooms in.
        st.rubble.visible = t < OUTRO.isolated;

        const landing = t > OUTRO.arrive[1] && t < OUTRO.arrive[1] + 0.25;
        const shake = (t > 4.2 && t < 4.5) || landing ? 0.3 : jets && doc.visible ? 0.08 : kick;
        st.frame(t, camX, camY, zoom, shake);
      };
      return st;
    },
  },
};
