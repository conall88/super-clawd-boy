# Super Clawd Boy

A Super Meat Boy–style browser platformer starring Clawd, parodying the AI race.
Built with three.js and Vite. See [DESIGN.md](DESIGN.md) for the story, mechanics, and roadmap.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (add `-- --host` to reach it from Windows when running in WSL)
npm run build    # static site in dist/
```

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | Arrows / WASD | Left stick / D-pad |
| Jump (hold for height) | Space / Z / J / Up | A |
| Run | Shift / X / K | X / RB / RT |
| Extended Thinking | C / L | Y / LB / LT |
| Restart (from the checkpoint, once reached) | R | Select (Y on the replay screen) |
| Hint ghost on/off | H | B |
| Menu | Esc | B on the replay screen |
| Music on/off | M, or click the note in the bottom-left corner | |
| Options (music, volumes) | O on the title screen | |

## Code map

- `src/level.js`: physics, hazards, splatter, checkpoints, replay, the hint ghost (feel constants live in `P` at the top)
- `src/levels.js`: ASCII level maps (legend at the top); long levels are chains of screen-sized chunks
- `src/route.js` / `src/routes.js`: replays the solver's winning route for each level to drive the hint ghost;
  `routes.js` is generated
- `src/cutscenes.js`: scripted in-engine cutscenes
- `src/pixel.js`: pixel pipeline (low-res integer-scaled render, orthographic camera, sprite helpers)
- `src/sprites.js`: all pixel art, generated in code (Clawd frames, tiles, saws, backdrops, bosses, props)
- `src/audio.js`: procedural WebAudio sound effects (and the shared AudioContext / SFX volume)
- `src/music.js`: stage soundtrack player: streamed MP3s with crossfades, loudness levelling and the thinking muffle
- `public/music/`: the soundtrack MP3s (256 kbps)
- `src/main.js`: game flow, HUD, title screen
- `tools/solver.js`: dev-only solver that beam-searches the real physics to prove levels are beatable, set par
  times and boss speed, and record the hint routes; `tools/solve.mjs` runs it from the command line

## Checking levels

```bash
node tools/solve.mjs                  # every level: solved?, solver time vs par (and a suggested par), boss gap
node tools/solve.mjs 1-5 --trace      # one level, with its route drawn on the ASCII map
node tools/solve.mjs --write-routes   # re-record the hint routes into src/routes.js
node tools/solve.mjs 1-B --mods '{"boss":{"speed":12.1,"catchup":7.1,"delay":0.56}}'  # boss stress test
```

**After editing a level, run `--write-routes`** (for that level id, or all of them). The game checks each
route on load and turns the hint off for that level if the map has changed since it was recorded.
The boss takes about two minutes to solve (it searches a wider beam); the other levels take seconds each.

## Music credits

All music by Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under
[Creative Commons: By Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The credit (with the track
list below) is also shown on the in-game Credits screen.

| Stage | Track |
|---|---|
| Title, prologue, epilogue | Exhilarate |
| 1-1 Hello, World | Rocket Power |
| 1-2 Wall of Text | Ready Aim Fire |
| 1-3 Gradient Descent | In a Heartbeat |
| 1-4 Hallucination | Dream Culture |
| 1-5 Human Feedback | Pinball Spring 160 |
| 1-6 Prompt Injection | Overworld |
| 1-7 Rate Limited | Blown Away |
| 1-8 Data Pipeline | Cyborg Ninja |
| Boss intro, 1-B The Gemini Twins | Summon the Rawk |

Dr. Overfit's laugh at the end of the epilogue is [Evil Cyber Laugh](https://opengameart.org/content/evil-cyber-laugh)
by AppPro (CC0), in `public/sfx/`.

To add or swap a track: drop the MP3 (128–256 kbps) in `public/music/`, measure its loudness with
`ffmpeg -i track.mp3 -af ebur128 -f null -` (the final `I:` value, in LUFS) and add it to `TRACKS` in
`src/music.js` so it's levelled against the others.
