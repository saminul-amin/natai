# নাটাই · Natai

**Kites over Old Dhaka.** A kite-fighting game set on the rooftops of Puran Dhaka during Shakrain, played in the browser from a single link. Design and technical document, v0.3 (22 October 2026).

This document contains decisions, not proposals. Its author is also the sole implementer, so every choice below is the one that will be built; nothing is left for a reader to pick. Section 12 records the reasoning behind each choice that was once open.

---

## 1. Vision

Natai is the spool in a kite flyer's hands. The game is about the feeling of holding it: a living pull on the string, a sky full of rivals, and the moment a line is cut and the whole rooftop shouts *bhokatta!*.

It starts as a hazy golden January afternoon and ends as a night of fireworks, sky lanterns and fire-breathers. The whole day plays out in one sitting.

**Design pillars**

1. **The sky is the hero.** Every system exists to make the sky and the light more beautiful. If a feature does not make the screen prettier or the kite feel better, it waits.
2. **One thumb, deep skill.** Anyone can fly in ten seconds. Winning a *pench* (string duel) against the rooftop champion takes a hundred games.
3. **Living Puran Dhaka.** Real streets, real kite names, real sounds. Nothing generic.
4. **Runs from a link.** No install, no store, works on a phone, offline after the first visit.

**The bar to beat:** the reference project, Sholo Guti, uses a painted panorama sky, no post-processing, no water, no characters and three fixed times of day. Natai must visibly exceed it on sky, light, post-processing and time of day in the first milestone (M0), and on water and characters once the city arrives (M3), or the plan changes.

---

## 2. Name and identity

| | |
|---|---|
| Title (Bengali) | নাটাই |
| Title (Latin) | Natai |
| Subtitle | Kites over Old Dhaka |
| Pronunciation | NAH-tai |
| Meaning | the kite spool, the one object the player holds throughout |

Title treatment follows the reference's convention: large Bengali serif (Tiro Bangla) for নাটাই, italic Latin below, a small uppercase setting line ("Puran Dhaka · Shakrain").

Palette comes from kite paper and the Shakrain night: magenta, saffron, teal and leaf green on deep indigo, with warm lantern gold as the accent.

---

## 3. Setting

**When.** Shakrain, the last day of the Bengali month Poush (14 January), celebrated in the oldest part of Dhaka. Winter: clear, hazy, a soft low sun, cool wind off the Buriganga, early-evening fog in the lanes.

**Where.** The rooftops of Puran Dhaka: Shankhari Bazar, Tanti Bazar, Laxmi Bazar, Sutrapur, Gendaria. Dense four-to-six-storey buildings shoulder to shoulder, tin and concrete roofs, water tanks, satellite dishes, washing lines, parapets, stair-head rooms (*chilekotha*). The Buriganga and the pink Ahsan Manzil on the horizon; minarets; the Sadarghat launch terminal; rain trees and coconut palms between the blocks.

**The day.**

| Phase | Clock | What the player sees |
|---|---|---|
| Afternoon | 14:00 to 16:30 | Thousands of kites against a pale blue haze. Families on every roof. Loudspeakers warming up. |
| Golden hour | 16:30 to 17:30 | Low orange sun, long shadows across the roofs, kites backlit like stained glass. |
| Dusk | 17:30 to 18:15 | Sky from orange to violet, string lights and lanterns coming on, most kites coming down. The last duels are fought in this light, with the first rockets going up behind them. |
| Night | 18:15 to 19:30 | Fireworks from every roof, *fanush* (sky lanterns) drifting up, fire-breathers, DJ stages, the city glittering below. No kites in the air except in Free sky. |

The game clock runs from 14:00 to 19:30, five and a half game hours in about 15 real minutes, so one campaign session sees all of it. The clock is a pure function of simulation ticks (8.5), so a given tick is always the same minute.

---

## 4. Gameplay

### 4.1 Core loop

1. **Fly.** Launch from your rooftop, climb, find the wind.
2. **Hunt.** Pick a rival kite. Position above or below it, upwind or downwind.
3. **Pench.** Cross strings. A tug of line against line begins.
4. **Cut or be cut.** Pull or release to saw through the rival's string before they saw through yours.
5. **Bhokatta!** The cut kite tumbles away. The crowd shouts. Chase it to catch it for a bonus, or go for the next rival.
6. **Repeat** until your string is cut or the day ends.

### 4.2 Flying model

The kite is driven by a simple aerodynamic model, not true cloth simulation:

- **Wind field.** A base wind vector (direction, speed) that varies slowly over time, plus gusts, plus local turbulence near buildings. Wind weakens near the roofs and strengthens with height. A visible wind indicator (fluttering flags, washing, smoke) tells the player what the air is doing.
- **Line.** A rope with length, tension and sag, modelled as a chain of verlet points between the natai and the kite. Tension comes from the kite pulling against the wind.
- **Kite.** Lift and drag depend on the kite's angle to the wind. A fighter kite is unstable by design: with slack line it loops and wanders, with tight line it tracks straight. This is the whole skill.

The whole model advances in fixed 120 Hz steps independent of the frame rate (8.5), so the kite behaves identically at 30 and 60 frames per second and the string never destabilises on a slow frame.

Two actions, as in real fighting:

| Action | Input | Effect |
|---|---|---|
| **Tan** (pull) | hold (touch, mouse button or Space) | Pulls the line hard by hand. Tension rises; the kite accelerates, tracks straight in the direction its nose points, and climbs. |
| **Dheel** (release) | let go | Gives the line slack. Tension drops; the kite slows, starts to loop and turn, and drifts downwind. |

Tan and dheel change tension, not how much line is out: line given during a dheel is taken back during the next tan, so over a rhythm the length stays roughly the same. Both actions move line through the air, which is what saws a rival's string in a pench (4.3).

Steering is by timing alone: give dheel until the nose swings to where you want, then tan. There is no separate aim control. The pull-release rhythm is the whole skill, and it needs only one thumb.

Line length (altitude) is a separate, slow, secondary control on the natai: the mouse wheel on desktop, or on touch a natai dial at the screen edge that you drag to wind or unwind (a hold anywhere else is tan). The camera follows the kite on its own; free look is a right-mouse drag on desktop and a two-finger drag on touch.

### 4.3 Pench, the string duel

When two strings cross, a *pench* starts. Each string is a chain of segments (the verlet points of 4.2), and every segment has its own **health**. While the strings touch, the segment of each string that sits at the crossing loses health every second:

```
damage_to_B = slide_speed × manja_sharpness_of_A × angle_factor × position_factor_of_A
```

- **slide_speed**: how fast the two lines slide across each other at the crossing. It is a relative speed, the same for both strings. Pulling fast (*tan*) and releasing fast (*dheel*) both move line and saw. If neither line moves, nothing happens.
- **manja_sharpness_of_A**: the glass coating on the other string. Wears down over a day.
- **angle_factor**: strings crossing at a sharp angle cut faster than ones running almost parallel.
- **position_factor_of_A**: slightly above 1 when A's kite flies higher than B's, slightly below 1 when lower. The kite above has a small advantage, as in real fights.

Because damage lands on whichever segment is at the crossing, a line that keeps moving spreads its wear along its length while fresh manja keeps arriving, and a line held still takes all the wear on one segment. Both strings can lose health at the same rate, but the still one snaps first. Keeping line moving is the defence as well as the attack.

The player's string and the rival's follow the same rules. A string snaps at the first segment whose health reaches zero.

A pench is readable on screen: the crossing point sparks and glints, both strings bow, the camera leans in, the crowd quiets. The winner's roof erupts.

### 4.4 The cut

- The loser's kite tumbles realistically (loses tension, spins, drifts downwind) with its tail of cut string.
- A half-second slow-motion with depth-of-field rack onto the tumbling kite.
- The shout **ভোকাট্টা!** rises from the roofs, loud and ragged, never the same twice: twelve recorded variants, each played at a random pitch and timing offset and layered two or three deep over the crowd bed. Until the recordings exist (8.3), the crowd roar plays alone and the word appears on the HUD.
- Any player can **catch** a falling kite by flying under its drifting string. Caught kites are a bonus and give a temporary manja boost.

### 4.5 Modes

| Mode | Description |
|---|---|
| **Shakrain** (campaign) | One full day. Waves of rivals of rising skill, each with a name and a rooftop. Survive to dusk and win the final duel with the champion as the first rockets go up; the night is the celebration, played through to the results. |
| **Pench** (quick duel) | One rival, best of three cuts. Each round ends at the first cut. For a game of a few minutes. |
| **Free sky** | No rivals. Fly, watch the day pass, photo mode. The screenshot generator. |
| **Two natai** (v1.1) | Local two-player, both natai on one device. Not in v1; online play is not planned (see 12). |

### 4.6 Progression

Nothing is paywalled. Each of the fourteen rivals beaten in the campaign unlocks one item, and there are exactly fourteen: four fighter kites beyond the starter, the three shaped kites, two natai beyond the starter, two manja grades beyond the starter and three rooftops beyond the starter. One completed campaign therefore unlocks everything, and progress is remembered locally. Beating the champion is the hard part and is meant to take many attempts.

- **Kites.** Names held in one data file and checked against sources during M3 (see 12).
  - Fighter kites, all the same diamond shape, differing in print, stability and speed: *Chokhdar*, *Goyadar*, *Pandar*, *Lejdar*, *Chapalish*.
  - Shaped kites for Free sky and the distant sky, not used in a pench: *Prajapati* (butterfly), *Rocket*, *Baksh* (box).
- **Manja.** Three grades of glass-coated string, from softer and more forgiving to sharper and more brittle.
- **Natai.** Three spools of different reel speed and line capacity.
- **Rooftops.** Four rooftops; each is a different viewpoint over the city, with its own crowd.

### 4.7 Rivals

Fourteen named rivals, each with a rooftop, drawn from four personalities rather than difficulty numbers: five kids, four boro bhais, four uncles, then the champion. The order of the waves and the personality set the difficulty.

- **The kid next door** – reckless, loops constantly, easy to cut, hard to predict.
- **Boro bhai** – patient, stays high, waits for you to come to him.
- **The uncle with the loudspeaker** – aggressive, pulls hard, burns through his manja.
- **The champion of Shankhari Bazar** – the dusk duel, in the last light with the first fireworks behind. Reads your rhythm.

Rival AI works on the same flying model as the player, with a steering target and a pench policy (when to pull, when to release). No cheating physics.

---

## 5. Visual design: where the shine comes from

This section is the reason the project exists. Every item names what it adds over the reference.

### 5.1 Camera

First-person from the player's rooftop, looking out and up. The player's kite sits in the upper half of the frame, the city and the river fill the lower third, the parapet and the player's own hands with the natai anchor the foreground. The camera gently follows the kite; free look by right-mouse or two-finger drag (4.2). Photo mode unlocks the camera entirely.

### 5.2 Sky and sun (replaces the painted panorama)

- **Procedural atmosphere.** A physically based sky computed from precomputed scattering look-up tables, the Hillaire 2020 approach: the transmittance and multiple-scattering tables depend only on the atmosphere and are built once at load, and a small sky-view table is rebuilt every frame as the sun moves, which is cheap. All of it is written in TSL so it runs on both renderers. Sun elevation and azimuth follow the game clock continuously. Colour at the horizon, haze and the sun disc all come from the model, so dusk is a real gradient, not a cross-fade between two photographs. In the first session of M0 the sky addon that ships with Three.js stands in, so there is something on screen while the real model is written.
- **Clouds.** A ray-marched cloud layer at one altitude, with noise-driven coverage and a soft lit edge toward the sun. Thin winter cirrus by day, nearly clear by night so the fireworks read.
- **Light shafts.** Screen-space god rays from the sun through clouds and kites, strongest at golden hour.
- **Haze and fog.** Height fog that pools in the lanes between buildings, thicker at dusk; distance haze tinted by the sky.
- **Stars and moon** after dark, with the city glow washing out the horizon.

### 5.3 Lighting

- One directional sun with **cascaded shadow maps** (three cascades on the high tier, two on the phone tier, see 8.4), so the near parapet and the far rooftops both get crisp shadows.
- **Image-based lighting regenerated from the live sky** every few seconds, so reflections and ambient colour always match the current minute of the day.
- **Exposure curve** across the day plus a gentle auto-exposure, so the night is dark but readable.
- Night adds many small lights: string lights along parapets, lantern glow, the fire-breather's flame, the fireworks themselves. Most are emissive materials feeding bloom; only a few are true point lights.

### 5.4 Post-processing (the reference has none)

Rendered in this order. Each one is switchable per quality tier except tone mapping, which is always on:

1. Ambient occlusion (ground-truth style, cheap radius), applied to the lit scene
2. Screen-space reflections on tin roofs, water tanks and the river
3. God rays
4. Temporal anti-aliasing
5. Depth of field, focus tracking the player's kite or the pench crossing
6. Bloom, thresholded so only emissives and the sun bloom
7. Tone mapping from HDR to display with the AgX operator. It avoids the hue shifts and hard highlight clipping of ACES, which the reference uses, rolling bright saturated colours smoothly toward white instead. Its base look is deliberately low in contrast and saturation, so the per-phase grading tables in the next step add both back
8. Colour grading by a look-up table per phase of the day, on the tone-mapped image
9. Vignette and fine film grain, after anti-aliasing so the grain is not smeared

### 5.5 Kites

- **Paper translucency.** When the sun is behind a kite, light shines through it: a thin-surface transmission approximation in the kite material, with the kite's printed design visible from the back. This is the single most beautiful thing in the game and the first thing to build.
- **Flutter.** Vertex-shader animation driven by wind speed and line tension: a tight line snaps the kite flat, a slack line lets the edges ripple.
- **Tails and streamers** as short rope chains.
- **Distant kites.** Hundreds of instanced billboards with the same flutter shader, in real kite colours, scattered in the sky at the right density for Shakrain. Each one has a faint string drawn to a rooftop. Beyond them, a far-sky layer of hundreds more tiny kites is drawn as one textured shell with a scrolling flutter, so the "thousands" of section 3 cost a single draw call on top of the 8.4 budget.

### 5.6 String

- Drawn as a thin screen-space line with width in pixels so it never vanishes on phones.
- **Manja glint.** A sparkle pass along the string: the glass coating catches whatever is bright, the sun by day and the string lights and fireworks at dusk, as tiny moving highlights, so the string stays readable through the champion duel.
- At a pench crossing, sparks and a glow at the contact point.

### 5.7 The city

- **Modular buildings.** Twelve façade modules and six roof modules, with four parapet styles and three stair-head rooms, instanced and recombined with random heights, colours, parapets and props to make hundreds of distinct buildings.
- **Roof props.** Water tanks, dishes, antennas, washing lines, stair-head rooms, banners, flags on bamboo poles (the wind indicator of 4.2), plastic chairs, flower pots, string lights.
- **Landmarks** as silhouettes and low-detail models: Ahsan Manzil, the Buriganga with launches and its road bridge, minarets, the Sadarghat terminal.
- **Trees.** Rain trees, coconut palms and banana plants with wind animation.
- **Distance.** Far blocks use impostors (pre-rendered cards) so the horizon stays dense without draw calls.
- **The river** is a reflective water plane at the horizon catching the sunset and later the fireworks.

### 5.8 People

- Low-poly rooftop crowds with five animations (idle, fly with natai, point, cheer, flinch), all five baked into one vertex animation texture per body type by a script in `tools/` and drawn as instanced meshes, so the whole crowd costs one draw call per body type, four in all, on either renderer. Bodies come from a CC0 rigged pack, retextured with generated lungi, sari and panjabi patterns and South Asian skin tones (8.3).
- The player's own hands and natai in the foreground, animated with the pull and release.
- The fire-breather at night: a character, a torch, a cone of flame particles and a flickering light.

### 5.9 Night spectacle

- **Fireworks.** GPU particle bursts with trails, several styles, launched from random roofs, each one lit and bloomed. Their light briefly colours the smoke and the nearby roofs. The particles are stepped in a TSL compute node on WebGPU; on the WebGL 2 path the same node runs through transform feedback with the count capped at the phone budget, and M0 checks that this path works before anything depends on it.
- **Fanush.** Sky lanterns released in clusters, warm emissive, drifting with the wind, hundreds visible at once.
- **Fire-breathers** on three or four roofs, each with flame, sparks and a point light.
- **City lights** below: windows, street lamps, headlights on the far bridge, all emissive.

### 5.10 Ambient life

Dust in the golden light, paper confetti from cut kites, smoke from fireworks, pigeons that scatter when a kite falls, washing that moves with the same wind the kites feel.

---

## 6. Audio

- **Wind** layered by altitude and speed.
- **String hum** whose pitch rises with tension. The most important sound in the game: it tells the player what the kite is doing without looking.
- **Natai** ratchet when reeling, whir when releasing.
- **Crowd** beds per phase of day, with reactive shouts: *bhokatta*, laughter, groans.
- **Loudspeakers** on distant roofs playing muffled music that gets louder toward night.
- **Fireworks**, **fanush** flame, **fire-breather** whoosh.
- **Music**: a light dhol and flute motif for menus, silent during play except the city's own sound.

Mixed with the Web Audio API and ducked when the tab is hidden. Wind, string hum, natai sounds, the loudspeaker loops and the menu motif are synthesized in code; crowd beds, fireworks, flame, pigeons and paper come from CC0 libraries; the Bengali voices are recorded (8.3).

---

## 7. Interface

HTML and CSS over the canvas, as in the reference. Nothing in the 3D scene is interface.

- **HUD**: natai icon that spins as line goes out, line-length meter, manja wear bar, wind compass, score (kites cut, kites caught), day clock as a small sun arc.
- **Rival tag**: name and rooftop above the rival you are engaged with.
- **Menu**: same layered panel as the reference, with mode, kite, manja, quality, sound, language (Bengali and English), and a fire-and-fireworks toggle that hides the fire-breathers and fireworks and silences them, leaving lanterns and string lights.
- **Results**: day summary with best cut, longest pench, kites caught.
- **Photo mode**: hide UI, free camera, time-of-day slider, save a frame.

---

## 8. Technical design

### 8.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript**, `strict` on, no `any`; loaded glTF enters as `unknown` and is narrowed at once | Type definitions come from `@types/three`, pinned to the same release as Three.js; the TSL node chains and the vector-heavy simulation are exactly the code where a type checker pays for itself; refactoring across twenty modules through six milestones is safe only with types |
| Rendering | Three.js with `@types/three`, both pinned at the current release when M0 starts and upgraded together only at milestone boundaries, **WebGPU renderer** with the node material system (TSL) | Post-processing, compute particles and custom materials are first-class; TSL compiles to WebGL 2 automatically for browsers without WebGPU |
| Fallback | WebGL 2 through the same code path | Same scene and the same post-processing chain, since every pass is a fragment pass WebGL 2 runs; only the compute-driven particle count differs. The renderer backend and the quality tier (8.4) are independent: a WebGL 2 desktop runs the high tier |
| Build | Vite | TypeScript with zero configuration, hot reload, static build for GitHub Pages |
| Tests | Vitest for the simulation and rules; Playwright for a smoke run and the milestone screenshots | Wind, string, pench and day clock are pure functions and must be proven, not eyeballed |
| Lint and format | ESLint with typescript-eslint, Prettier | One style, enforced by the tools, never by hand |
| Physics | Custom: verlet string, analytic kite model | Full physics engines are overkill and heavy |
| AI | Inside the simulation step, on the main thread | A rival's policy is a few dozen operations per tick, not the game-tree search the reference needed a worker for; running it in the fixed step keeps the seeded determinism of 8.5, which asynchronous worker messages would break |
| Audio | Web Audio API | No library needed |
| Offline | Service worker, PWA manifest | Install to phone, play without network |
| Hosting | GitHub Pages, deployed by GitHub Actions on every push to `main` | Static files only, every asset self-contained, every milestone public |

### 8.2 Modules

```
index.html         entry page (Vite serves and builds it from the project root)
src/
  main.ts          boot, loading, fixed-step loop, quality tiers, URL parameters
  types.ts         shared types: Kite, Line, Wind, Pench, DayPhase, Rival
  input.ts         tan/dheel hold, natai dial, free look; touch, mouse and keyboard
  sim/             pure simulation: no renderer, no DOM
    rng.ts         the one seeded random generator
    wind.ts        wind field, gusts, turbulence sampling
    kite.ts        kite aerodynamics
    line.ts        verlet line, tension, segment health
    pench.ts       crossing detection, damage, cut
    rivals.ts      AI personalities, steering and pench policy
    day.ts         game clock and phase transitions
    names.ts       kite, manja and natai names and stats, the one data file
  view/            everything that draws; reads simulation state, never writes it
    sky.ts         atmosphere tables, sun, clouds, stars, IBL refresh
    city.ts        building placement, props, landmarks, impostors
    kiteView.ts    kite mesh, flutter uniforms, translucent material
    lineView.ts    line rendering, glint, pench sparks
    crowd.ts       vertex-animated instanced people and reactions
    night.ts       fireworks, fanush, fire-breathers, string lights
    post.ts        post-processing chain and grading tables
    camera.ts      follow, free look, cinematic moments, photo mode
  procedural/      geometry and texture generators: buildings, kites, prints, noise, grading tables, clothing
  audio.ts         synth and loops, mix by phase
  ui.ts            HUD, menus, results
  save.ts          local progress
tests/             Vitest specs for everything in sim/ and procedural/
e2e/               Playwright smoke test and milestone screenshot script
tools/             asset scripts: glTF-Transform pipeline, texture resize, animation baking, credits check
assets/
  models/          glb (quantized, meshopt, WebP or KTX2 textures)
  tex/             tiling surface textures from CC0 libraries
  audio/           loops, effects and recorded voices
  fonts/           self-hosted Tiro Bangla and Hind Siliguri
  CREDITS.md       source and licence of every third-party asset, fonts and audio included
public/            copied as-is into the build
  manifest, service worker, icons, og-image
docs/
  recording.md     the voice recording guide (8.3)
  shots/           one set of screenshots per milestone, the comparison record
DESIGN.md          this file
README.md          how to run, build and test
.github/workflows/ ci (typecheck, lint, tests, WebGL 2 smoke test) and deploy to Pages
```

The `sim/` modules depend only on `types.ts`, `rng.ts` and the Three.js math classes. They never import the renderer or the DOM, so they run in tests unchanged. Every `view/` module reads simulation state and never writes it.

### 8.3 Asset sourcing and pipeline

There is no artist on this project, so the asset plan does not depend on one. Three sources for visual assets, in order of preference, then audio and fonts:

1. **Procedural, in code.** Buildings, parapets, stair-head rooms, water tanks, kites, natai, fanush lanterns, string lights, the river, the clouds, all kite prints, all noise textures, the crowd's clothing patterns and all colour-grading tables are generated by TypeScript in `src/procedural/`. Generated geometry is cheap to vary (hundreds of distinct buildings from one generator), has no licence, and ships as code rather than megabytes.
2. **CC0 libraries, processed by script.** Tiling surface textures (plaster, brick, tin, concrete) come from CC0 texture libraries such as Poly Haven and ambientCG. Rooftop people come from CC0 low-poly rigged character packs (Quaternius or similar). Those packs are generic by nature, so they are not used as shipped: the bodies are retextured with generated lungi, sari and panjabi patterns and South Asian skin tones, and the five crowd animations (idle, fly with natai, point, cheer, flinch) are authored on the pack's rig and baked to vertex animation textures by `tools/`. Trees and a few complex props (satellite dish, loudspeaker, plastic chair) come from CC0 model packs where a procedural version would look worse.
3. **Hand-made hero pieces, later and optional.** Ahsan Manzil, the fire-breather's torch and the champion would benefit from modelled assets. They start as procedural or retextured CC0 stand-ins and can be replaced in a later version without touching code.
4. **Audio.** Wind, string hum, natai sounds, the loudspeaker loops and the menu motif are synthesized in code. Crowd beds, fireworks, flame, pigeons and paper come from CC0 sound libraries. The Bengali voices (the *bhokatta* shouts, laughter and groans) cannot be synthesized convincingly or found in a library. They are recorded by the project owner and friends with a phone, following `docs/recording.md`, and dropped into `assets/audio/voices/`; the mixer uses whatever is there. Until then the crowd roar plays alone and the HUD shows the word, so the game is complete without them and better with them. This is the one asset the implementer cannot make.
5. **Fonts.** Tiro Bangla and Hind Siliguri, self-hosted from `assets/fonts/` under the Open Font License, so the installed app works offline.

Every third-party file is listed in `assets/CREDITS.md` with its source and licence, and a script in `tools/` refuses a build when a file in `assets/` is missing from that list, except under `assets/audio/voices/`, which holds first-party recordings.

Pipeline for any model file: source glTF → glTF-Transform (quantize, meshopt compression, texture resize to the budget, WebP or KTX2) → `assets/models/`, run by `tools/`, never by hand. Texture budget per prop is set before the asset is chosen, not after. The reference's base64-in-JSON wrapper is unnecessary with Vite; plain `.glb` files are served directly.

### 8.4 Budgets

| Target | High tier (desktop) | Balanced (phone) |
|---|---|---|
| Frame rate | 60 fps | 30 fps |
| Draw calls | under 300 | under 150 |
| Triangles on screen | under 1.5 M | under 500 k |
| Initial download | under 25 MB | under 12 MB (lower-res textures) |
| Shadow maps | 3 × 2048 | 2 × 1024 |
| Post stack | full | bloom, tone mapping, grading, vignette only |
| Distant kites | 600 | 200 |
| Fireworks particles | 200 k | 50 k |

Quality is chosen automatically from device capability and can be changed in settings. A development overlay shows frame time, draw calls, triangles and the current tier at all times, so a budget is noticed the frame it is broken, not at the end of a milestone.

### 8.5 Quality bar

These rules apply to every commit, from the first.

- **Types.** `strict` TypeScript and no `any`. A loaded glTF scene enters the program as `unknown` and is narrowed to the expected node types within the same function. DOM elements are already typed and need nothing.
- **Tests.** Every `sim/` module has Vitest specs before it is wired to a view. Pench damage, string snapping, wind sampling, the day clock and each rival policy are tested against fixed seeds, so a tuning change that alters behaviour fails a test rather than a play session.
- **Fixed step.** The simulation advances in fixed 120 Hz ticks from an accumulator, and the views interpolate between the last two ticks. Frame rate never changes behaviour: the string stays stable, a phone at 30 frames per second flies exactly like a desktop at 60, and a seed reproduces the same flight.
- **Determinism.** All randomness goes through one seeded generator in `sim/rng.ts`, and rivals decide inside the tick, never asynchronously. A given seed produces the same city, the same wind and the same rival behaviour, which makes bugs reproducible and screenshots comparable. Seed, game time, camera pose and quality tier can be set from URL parameters (`?seed=&t=&cam=&tier=`), which is how screenshots, bug reports and tests reach the same frame.
- **Continuous integration.** Typecheck, lint, tests and a production build run on every push. A failing check blocks deployment. The Playwright smoke test runs there on the WebGL 2 path in headless Chrome with software rendering, because the hosted runners have no GPU.
- **Screenshots.** The Playwright script captures the same four views (one fixed seed, four game times, one camera pose, high tier, all through the URL parameters above) on a machine with a GPU, on the WebGPU path, at the end of every milestone into `docs/shots/`. The M0 and M3 gates are judged on these, side by side with the reference.
- **Commits.** Small, one change each, with a message that states what changed and why. The history is the project log.
- **No dead paths.** The reference ships a disabled second environment. Natai does not keep unreachable code; a feature is in, or it is in a branch.

---

## 9. Asset list (v1)

**Models**

Generated in code (`src/procedural/`):

- Buildings: 12 façade modules, 6 roof modules, 4 parapet styles, 3 stair-head rooms
- Roof props: water tank (2), antenna, washing line with clothes, flag on bamboo pole, flower pots (3), banner, string-light run
- Landmarks: Ahsan Manzil (low detail), minaret (2), Sadarghat terminal (silhouette), Buriganga bridge (silhouette), Buriganga launches (2, far)
- Kites: 5 fighter designs on one shared diamond mesh with different prints; 3 shaped kites (butterfly, rocket, box) with their own meshes
- Natai: 3
- Fanush lantern (1 mesh); fireworks are particles and have no mesh

CC0 glb, retextured where needed and processed by `tools/`:

- Roof props: satellite dish, plastic chair, loudspeaker stack, DJ table
- Trees: rain tree, coconut palm, banana
- Characters: 4 body types, 5 animations each (idle, fly with natai, point, cheer, flinch) baked to one vertex animation texture per body; player hands; fire-breather with torch
- Animals: pigeon (1 mesh, flap baked to a vertex animation texture)

**Textures**

- Tiling, from CC0 libraries: plaster (3 colours), brick, tin (clean and rusted), concrete roof, tarpaulin
- Generated in code at load: 8 kite prints, 4 grading tables (afternoon, golden, dusk, night), noise for clouds, flutter and wind, clothing patterns and skin tones for the crowd

**Audio**

- Synthesized: wind (3 layers), string hum, natai ratchet and whir, loudspeaker music loops (2), menu motif (dhol and flute)
- CC0 libraries: crowd beds (4), fireworks (4), flame (2), pigeon flutter, paper rustle
- Recorded voices: *bhokatta* shouts (12), laughter (6), groans (6)

**Fonts**

- Tiro Bangla and Hind Siliguri, self-hosted, Open Font License

---

## 10. Milestones

Milestones are ordered by risk: the thing most likely to sink the project is proven first. Each one is done only when every item in its definition of done holds, and each ends with a public build on GitHub Pages and the four screenshots in `docs/shots/`. There are no calendar estimates; a milestone takes as many working sessions as its definition of done needs.

### M0 · Proof of shine

Project skeleton (TypeScript, Vite, ESLint, Prettier, Vitest, Playwright, CI, Pages deploy), the fixed-step loop, the game clock in `sim/day.ts` (the sun needs it), the URL parameters, and the visual core: the atmosphere model with a moving sun, cloud layer, one translucent fluttering kite on a verlet string over a flat placeholder city, cascaded shadows, live image-based lighting, the full post-processing chain with AgX and per-phase grading, and a particle compute check, all on both the WebGPU and WebGL 2 paths. No gameplay.

**Done when:** CI is green; the line and day specs pass; both renderer paths run at the high-tier budget on a desktop; the WebGL 2 particle path is confirmed or a replacement decided; the four screenshots exist.

**Gate:** the M0 golden-hour screenshot next to the reference's sunset screenshot. If it is not clearly more beautiful, the visual plan is revised before any gameplay is written.

### M1 · Flight feel

Wind field, string tension and hum, tan and dheel input on touch, mouse and keyboard, kite aerodynamics, the natai dial, follow camera and free look.

**Done when:** wind, line and kite specs pass; flying alone with no rival is fun for five minutes; a session on a phone feels the same as on a desktop.

### M2 · Pench

Crossing detection, segment health and damage, the cut sequence with slow motion, depth-of-field rack and shout, one rival deciding inside the simulation step, catching fallen kites, the Pench quick-duel mode.

**Done when:** pench and rival specs pass; a best-of-three against the kid next door is winnable and losable; the cut is legible at phone size.

### M3 · The city

Procedural building generator, roof props, landmarks, trees, river, distant kites, crowds with reactions, impostors, afternoon and golden hour fully dressed, CREDITS.md complete.

**Done when:** the generator specs pass; the city renders within both tier budgets; the kite names and Shakrain details have been checked against written and photographic sources (see 12).

**Gate:** the river and the rooftop crowds now visibly exceed the reference too, completing the bar set in section 1.

### M4 · Night

Phase transitions and everything they switch on (the clock itself exists from M0), dusk lighting, string lights, fireworks, fanush, fire-breathers, night audio, the full roster of rivals, the champion duel at dusk, the night celebration, the Shakrain campaign and Free sky modes.

**Done when:** phase transition specs pass; a full campaign runs from afternoon through the champion duel to the end of the night without a break; the string is readable during the dusk duel at phone size; night holds the budget on both tiers.

### M5 · Ship

Quality tier auto-selection, phone layout and touch tuning, PWA and offline, menus and results, photo mode, Bengali and English, Open Graph image, performance pass, accessibility (reduced motion, captions for shouts), the fire-and-fireworks toggle.

**Done when:** the Playwright smoke test passes on the production build; the build installs and runs offline on a phone; every budget in 8.4 holds; the README describes how to run and build.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| WebGPU unavailable on some phones | Same scene and post chain through the WebGL 2 path, with only the particle count reduced; both paths tested from M0 |
| Kite physics feels wrong | M1 is dedicated to feel; nothing else is built until pull and release are fun |
| Strings invisible on small screens | Screen-space line width in pixels, never world units |
| Cloud ray-marching too slow on phones | Phone tier uses a textured dome with animated noise instead |
| Cultural inaccuracy | Check kite names, manja terms, rooftop details and the Shakrain timeline against written and photographic sources during M3, and keep the names in one data file so a correction is a one-line change |
| Bengali voice recordings depend on the project owner | The game is complete without them (8.3): the crowd roar and the HUD word cover their absence, and the mixer picks them up the moment they are added |
| Scope creep in the city | The building generator is modular on purpose; twelve façade and six roof modules, no hand-modelled streets |
| Three.js WebGPU and TSL APIs still move between releases | Version pinned at M0; upgrades only at milestone boundaries, each one a single commit that CI must pass |
| No artist | Everything is procedural or CC0 by design (8.3); the plan never waits on a model that does not exist |
| The sole implementer's judgement of "beautiful" is the only one | The milestone screenshots are the record; the project owner reviews each gate and can send the plan back |

---

## 12. Decisions log

Choices that were once open, with what was decided and why. A future change to any of them is recorded here.

| Decision | Choice | Reason |
|---|---|---|
| Language | TypeScript, strict | See 8.1. Decided before any code exists so no file is ever migrated |
| Tone mapping | AgX, with saturation and contrast restored by the per-phase grading tables | Avoids the hue shifts and hard highlight clipping of ACES and rolls bright colours smoothly to white; its flat base look is deliberate and the grading step is where the look is set |
| Sky model | Precomputed scattering tables (Hillaire 2020) in TSL; static tables once, sky-view table per frame | A real dusk gradient and correct sun colour at every elevation; the Three.js addon sky is only a first-session stand-in |
| Kite names | *Chokhdar*, *Goyadar*, *Pandar*, *Lejdar*, *Chapalish*, *Prajapati*, *Rocket*, *Baksh*, held in one data file | Taken from Shakrain reporting; verified against written and photographic sources during M3, corrected in place if wrong |
| Fire and fireworks | Always on by default, with one settings toggle that hides the fire-breathers and fireworks and silences them, leaving lanterns and string lights | Shakrain without fire is not Shakrain; the toggle costs nothing and covers younger players |
| Two-player | Local two-natai on one screen in v1.1; online not planned | Local needs no server and reuses the rival code path; online would double the scope for a game played from a link |
| Player's hands | In frame, with the natai | They anchor the first-person view and animate tan and dheel, which makes the input feel physical |
| Loudspeaker music | Original synthesized loops only | No licensing work, no takedown risk, and muffled distant music needs no recognisable song |
| Asset sourcing | Procedural first, CC0 second, hand-made hero pieces optional and later | There is no artist; see 8.3 |
| Schedule | Definitions of done, no calendar | The implementer works in sessions, not weeks; a gate is passed when its conditions hold |
| Simulation timing | Fixed 120 Hz step with interpolated rendering | Stable verlet strings, identical feel at 30 and 60 frames per second, and determinism from a seed; none of these hold with a variable step |
| Rival AI thread | Main thread, inside the simulation step; no worker | The policy is cheap, and asynchronous worker replies would break seeded determinism |
| Crowd animation | All animations packed into one vertex animation texture per body type, baked by `tools/`, instanced | One draw call per body type on both renderers without depending on any renderer's skinning support |
| Crowd characters | Retextured CC0 rigged bodies with generated clothing patterns and skin tones; named rivals are optional hero assets later | The only way to get Shakrain rooftops without an artist; "nothing generic" is met by the textures, not the base mesh |
| Bengali voices | Recorded by the project owner and friends to a guide; the game ships complete without them | They cannot be synthesized or sourced; this is the one asset the implementer cannot make |
| Champion duel timing | At dusk, 17:30 to 18:15, with the first fireworks behind it; night is the celebration | Kites come down at dark in real Shakrain, and the string needs light to read; dusk gives sky, string lights and rockets to glint from |
| Night end | 19:30 game time; the campaign ends with the results after the celebration | The 15-minute clock and the campaign both need a last minute |
| Progression | One item per rival beaten; one completed campaign unlocks everything | Unlocks reward play, never time or money, and the champion remains the long challenge |

---

## 13. Reference

- Sholo Guti by sumnoon (the project this one must beat visually): panorama sky as both backdrop and environment map, shader-built mud ground with the board as a height map, one soft-shadowed sun, ACES tone mapping, glTF-Transform optimised props, HTML overlay for interface. Natai keeps the overlay interface and the asset pipeline, and replaces everything else.
