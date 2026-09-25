const down = new Set();
const pressed = new Set();
const BLOCK_DEFAULT = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

addEventListener('keydown', (e) => {
  if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  down.add(e.code);
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'KeyZ', 'KeyJ', 'ArrowUp', 'KeyW'],
  run: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyK'],
  think: ['KeyC', 'KeyL'],
  confirm: ['Enter', 'Space'],
  restart: ['KeyR'],
  back: ['Escape'],
};
const any = (set, codes) => codes.some((c) => set.has(c));

export const input = {};
let prevPad = [];

// Standard gamepad mapping: A=0 jump, X=2/RB=5/RT=7 run, Y=3/LB=4/LT=6 think, Select=8 restart, Start=9 confirm.
export function pollInput() {
  const pad = navigator.getGamepads?.().find(Boolean);
  const btn = (i) => !!pad?.buttons[i]?.pressed;
  const tap = (i) => btn(i) && !prevPad[i];
  const ax = pad?.axes[0] ?? 0;

  input.left = any(down, KEYS.left) || ax < -0.35 || btn(14);
  input.right = any(down, KEYS.right) || ax > 0.35 || btn(15);
  input.jump = any(down, KEYS.jump) || btn(0);
  input.run = any(down, KEYS.run) || btn(2) || btn(5) || btn(7);
  input.think = any(down, KEYS.think) || btn(3) || btn(4) || btn(6);
  input.jumpPressed = any(pressed, KEYS.jump) || tap(0);
  input.confirm = any(pressed, KEYS.confirm) || tap(0) || tap(9);
  // Cutscenes skip on Enter/Start only, so mashing jump doesn't skip the story.
  input.skip = pressed.has('Enter') || tap(9);
  input.restart = any(pressed, KEYS.restart) || tap(8);
  input.back = any(pressed, KEYS.back);
  input.music = pressed.has('KeyM');
  input.options = pressed.has('KeyO');
  // Level select on the title screen (L is also THINK, but only in play).
  input.levels = pressed.has('KeyL');
  // Menu navigation (edge-triggered).
  input.nav = {
    up: any(pressed, ['ArrowUp', 'KeyW']) || tap(12),
    down: any(pressed, ['ArrowDown', 'KeyS']) || tap(13),
    left: any(pressed, KEYS.left) || tap(14),
    right: any(pressed, KEYS.right) || tap(15),
  };
  // On the replay screen B = back to map and Y = replay level (SMB's); in play B toggles hints and Y thinks.
  input.padB = tap(1);
  input.padY = tap(3);
  input.hint = pressed.has('KeyH') || input.padB;

  pressed.clear();
  prevPad = pad ? pad.buttons.map((b) => b.pressed) : [];
}
