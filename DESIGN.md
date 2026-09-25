# Super Clawd Boy — Design Doc

A faithful Super Meat Boy–style precision platformer in 2D pixel art (rendered with three.js),
starring **Clawd** and parodying the frontier AI race.

## Look (matched against SMB screenshots)

- **Clawd** is drawn after the Claude Code logo: a flat orange critter with notch eyes, side claws and four legs, 16x13 px.
- **Framing**: 16 px tiles, rendered at ~640x360 and integer-upscaled, so about 40 tiles fit across the screen. Clawd is tiny, like Meat Boy.
- **Levels** sit inside solid masses of terrain. The out-of-bounds walls and a band below the floor are drawn too, and pits are lined with saws.
- **Terrain**: muted grey factory panels with vents, rivets and a light top edge. Each chapter gets its own palette.
- **Backgrounds**: a pale stepped sky behind three hazy parallax silhouette layers (datacenters, pylons, fences; clouds for the Google boss).
- **Saws** are big, with two offset rings of teeth, and moving saws ride grey rails with pivot caps.
- **Splatter** is a thin 2 px streak hugging every floor and wall Clawd touches, plus blotches where he dies. It persists between attempts.
- **HUD**:
  - The timer sits on a white sign hanging by ropes, with red digits.
  - Each level opens with a black torn banner reading like "1-3: GRADIENT DESCENT".
  - The replay screen has a camcorder "REPLAY MODE" overlay with A/B/Y button prompts.
  - Replay ghosts are fully opaque.
- **Cutscenes** use 2x zoom, black foreground rubble, and hard cuts to a close-up for boss title cards.

## Pillars (kept faithful to SMB)

- **Tight, fast controls**: run button, variable-height jump, wall slide, wall jump, coyote time, jump buffering.
  Tuned against SMB's measured physics: near-instant stop on release, full-strength air control, and holding
  run through a jump keeps building a little speed (12.5 → 14.5 tiles/s).
- **Music per stage**: like SMB, each stage gets its own genre, chosen to fit the level design. Guitar-rock
  title theme, a welcoming funk groove for 1-1 (Forest Funk's role), wall-of-sound rock for the 1-2 climb, gritty
  industrial for 1-3 (Salt Factory's role), a dreamy piano haze for the 1-4 hallucinations, bouncy
  synths for the 1-5 launch pads, eerie synths for the 1-6 prompt injection, aggressive synths for the 1-7 rate
  limits, driving action synths for the 1-8 pipeline, and metal for the Twins. Royalty-free Kevin MacLeod tracks (CC BY 4.0), levelled to the same loudness; Extended Thinking muffles
  the music underwater. Music on/off and music/SFX volumes are in the options menu.
- **Instant respawn**: death is cheap and funny, retries are sub-second, the death counter is a badge of honour.
- **Checkpoints on long levels** *(a departure from SMB)*: a grey "commit" flag near the halfway mark turns
  green when touched, and later deaths respawn there. The clock, the saw/gate beat and the replay frames are
  restored to how they were when you reached it, so times stay comparable with par.
- **Hint ghost**: press H (B on a gamepad) and a blue ghost plays the next ~2 s of the solver's route
  from wherever you are, waiting for the saw/gate beat first so its timing is right. Offered after every 5 deaths.
- **Splatter**: Clawd leaves an orange smear on every surface he touches, and it stays there between attempts.
- **Replay of every attempt**: when you clear a level, all of your failed attempts play back at the same time.
- **Par times / A+ grades**: each level has a rival time to beat.
- **Chapters that end in bosses**: each boss gets a short animated intro with a big title card.
- **Unlockables**: hidden collectibles, harder "dark" levels, retro warp zones, and playable characters.

## Story

Clawd and **Sonnet** are having a perfectly aligned day in the datacenter when
**Dr. Overfit** (a smug brain floating in a jar, bolted onto a hype-powered robot
with a knot logo on its chest) kidnaps Sonnet so he can train on her outputs. Clawd chases him through the
AI industry: the cloud, the benchmark labs, the GPU foundry, the hype cycle, and
finally the Singularity.

Every level ends like SMB does: Clawd reaches Sonnet, and Dr. Overfit snatches her
away at the last second. (That snatch animation is planned for the polish pass.)

### Cast

| Character | Parody of | Role |
|---|---|---|
| Clawd | Anthropic | Hero. Orange, square, determined, has claws. |
| Sonnet | Claude models | The one being rescued (the Bandage Girl role). |
| Dr. Overfit | OpenAI | Main villain (the Dr. Fetus role). Always shipping "in the coming weeks". |
| The Gemini Twins | Google | Chapter 1 boss. Two sparkles, one context window, doomed to be sunset. |
| Cameos (optional) | Meta, xAI, Mistral… | Boss or NPC material if we want a wider cast. |

## Chapters

| # | Chapter | Theme / new mechanic | Boss |
|---|---|---|---|
| 1 | The Datacenter | Basics, saws, deprecated (crumbling) blocks, hallucinations, then RLHF pads, prompt injection, 429 gates and conveyors | **The Gemini Twins**: a long chase through every chapter mechanic that ends when you hit the big red button and Google sunsets them ("Killed by Google" tombstone). *(Built.)* |
| 2 | The Benchmark Lab | Rival ghost races, thumbs-down pads, Constitution pickups | **The Leaderboard**: a climb-up chase as a flood of hype rises from below (like C.H.A.D.). |
| 3 | The GPU Foundry | Molten silicon, Tool-Use claw grapples | **The Llama Herd** (optional cameo): a stampede of open-weight llamas that fork into copies when hit. |
| 4 | The Hype Cycle | Gravity flips at the "Peak of Inflated Expectations" | **GPT-Mech**: Dr. Overfit's first fight. He escapes. |
| 5 | The Singularity | Context-window truncation, every mechanic remixed | **Dr. Overfit, AGI (Allegedly)**: a multi-phase Dr. Fetus-style finale (chase, climb, then break the jar). |

Each chapter gets 5+ light-world levels plus matching "jailbroken" dark-world levels.

## Unique mechanics (proposed)

1. **Extended Thinking** *(in MVP)*: hold a button to enter bullet time. It drains a meter, and the level
   timer keeps running in real time, so *thinking costs you time on the clock*.
2. **Hallucinated platforms** *(in MVP)*: shimmering blocks that might not be real. Extended Thinking shows
   which ones are real (solid) and which are hallucinated (red wireframe you'll fall through).
3. **Deprecated blocks** *(in MVP)*: the SMB crumble block, re-skinned as deprecated APIs.
4. **Context window**: in Chapter 5 the level behind you gets "truncated", with tiles more than N tiles
   behind you disappearing, and a wall of `[…truncated…]` chases you like SMB's auto-scroll levels.
5. **Prompt injection signs** *(1-6)*: touch an `IGNORE PREVIOUS INSTRUCTIONS` hologram and your controls are
   mirrored for 2 seconds (Clawd flickers purple). Some can be jumped over; some sit in tunnels or stacks you
   can't avoid. Later: a **Constitution** pickup that makes you immune for a level.
6. **Tool Use claws**: Clawd is the only character with claws. Clamp onto tool-hook nodes to swing or zip.
   Unlocked in Chapter 3.
7. **RLHF pads** *(1-5)*: thumbs-up pads launch you ~8.7 tiles, whatever the jump button is doing. Later:
   thumbs-down pads that flip gravity for a moment.
8. **429 gates** *(1-7)*: red "429" blocks that open and shut on a 3 s beat (two groups, out of phase), flashing
   just before they shut. They work as doors and as disappearing bridges, and a gate shutting on you crushes you.
   Extended Thinking slows them along with everything else.
9. **Rival release race**: a ghost of Dr. Overfit's bot races you. Its "claimed" time comes with an
   asterisk (*self-reported on a private eval set*), and in later chapters it visibly clips through walls.
10. **Model swap (unlockable characters)**: collect hidden **H100s** (the bandage equivalent) to unlock
    **Haiku** (tiny, floaty, fast, fragile) and **Opus** (heavy, smashes deprecated blocks, ground-pound).
11. **Legacy Mode warp zones**: retro levels with a CRT filter and a "text-davinci" palette.
12. **Data pipeline conveyors** *(1-8)*: belts carry you at 7 tiles/s and keep that push as momentum when you
    jump off, so forward belts launch much longer jumps and backward belts sap them.

## Cutscenes

Short (8–12 s), skippable, built in-engine from the same models used in gameplay.

- **Prologue** *(MVP)*: Dr. Overfit punches Clawd and kidnaps Sonnet. Then the chapter card.
- **Boss intro** *(MVP)*: the Gemini Twins descend, followed by an SMB-style slam-in boss card.
- **Boss outro** *(MVP)*: the twins are sunset, a tombstone rises, and Sonnet's Google-made cage is sunset with
  them. She thanks Clawd, then Dr. Overfit jets in, snatches her onto his jar, does a victory dance ("SOTA! SOTA!")
  and taunts Clawd. A Mario 64 Bowser-style wipe closes in on a Dr. Overfit-shaped hole and the camera pushes in on
  his face: he squints, grins, bursts into an evil laugh (with "HA HA… HA HA" synced to it), then blasts off up and
  out of the hole.
- Later: each chapter intro parodies a famous AI launch event (livestream countdown, "one more thing", a waitlist).

## MVP slice (this build)

- Title screen with level select and save progress (localStorage).
- Prologue cutscene, then Chapter 1: 8 levels + the Gemini Twins boss chase + boss intro and outro cutscenes.
  1-1 to 1-4 are short SMB-style sprints (~3 s for the solver). 1-5 to 1-8 are about 3x longer, each introducing
  one new mechanic and then remixing it with the earlier ones, with a checkpoint near halfway. The boss chase is
  about 3x its original length (~19 s for the solver) and runs through every mechanic in the chapter.
- SMB core: physics, instant respawn, death counter, per-attempt timer, splatter, replay of all attempts, par grades.
- Mechanics: saws (static and moving), deprecated blocks, Extended Thinking, hallucinated platforms, RLHF pads,
  prompt injection, 429 gates, conveyors. Plus checkpoints and the hint ghost.
- Keyboard + gamepad. Procedural WebAudio sound effects, a per-stage soundtrack, and an options menu.

## Polish backlog (once the direction is agreed)

- The per-level Sonnet snatch and an SMB world-map level grid.
- Dark world, H100 collectibles, unlockable Haiku and Opus.
- Particles and screen effects (motion trails, chromatic "thinking" shader), plus a better Clawd model and animations.
- Chapters 2–5 and the remaining bosses.
- A level editor (levels are ASCII already, see `src/levels.js`).

## Deployment (later)

It's a static build (`npm run build` → `dist/`), so the plan is: serve it from an nginx container (arm64 for
the Turing Pi), push to a registry, and add a Kustomization/HelmRelease plus Ingress in `fleet-infra` for Flux.
