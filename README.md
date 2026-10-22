# নাটাই · Natai

Kites over Old Dhaka. A browser kite-fighting game set on the rooftops of Puran Dhaka during Shakrain.

Status: M0 to M5 implemented; the Bengali voice recordings (`docs/recording.md`) and the M3 check of kite names against sources are still to do.

- [DESIGN.md](DESIGN.md) — the full game and technical design. Every choice in it is decided; section 12 logs why.

## Stack

TypeScript (strict), Three.js WebGPU renderer with TSL and a WebGL 2 fallback, Vite, Vitest, Playwright, ESLint and Prettier, GitHub Actions deploying to GitHub Pages. Custom string and kite physics in a fixed 120 Hz step, deterministic from a seed, rival AI inside that step, Web Audio, PWA with offline support.

## Running

Needs Node 24 (the version CI uses).

```bash
npm install
```

```bash
npm run dev
```

Opens on http://localhost:5173. The development overlay (frame time, draw calls, triangles, tier) is on in dev and with `?dev=1` in a build.

```bash
npm test
```

```bash
npm run build
```

The build checks `assets/CREDITS.md`, typechecks, and writes the static site to `dist/` with the service worker's precache list. `npm run preview` serves it.

Other scripts: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run e2e` (Playwright smoke test on the WebGL 2 path; run `npx playwright install chromium` once), `npm run shots` (the four milestone screenshots into `docs/shots/`, on a machine with a GPU), `npm run icons` (PWA icons and Open Graph image), `npm run models` (glTF-Transform pipeline for `assets/source/`).

## Controls

| | Desktop | Touch |
|---|---|---|
| Tan (pull) | hold mouse button or Space | hold anywhere |
| Dheel (release) | let go | let go |
| Line out / in | mouse wheel, or W / S | drag the natai dial at the screen edge |
| Free look | right-mouse drag | two-finger drag |
| Photo mode camera | drag to look; W A S D, Q / E to move | drag to look |

## URL parameters

| Parameter | Example | Effect |
|---|---|---|
| `seed` | `?seed=7` | city, wind and rivals |
| `t` | `?t=17:05` | game clock (HH:MM, or minutes since midnight) |
| `cam` | `?cam=4,22,58` | fixed camera: yaw, pitch, field of view in degrees |
| `tier` | `?tier=balanced` | `high` or `balanced`; automatic otherwise |
| `backend` | `?backend=webgl` | force the WebGL 2 path |
| `mode` | `?mode=pench` | start straight into `shakrain`, `pench` or `freesky` |
| `hud` | `?hud=0` | hide the interface |
| `dev` | `?dev=1` | development overlay |
| `post` | `?post=noao,nobloom` | switch off passes: `noao`, `nossr`, `norays`, `noaa`, `smaa`, `nodof`, `softdof`, `nobloom`, `raw` |

## Milestones

| | Milestone | Proves |
|---|---|---|
| M0 | Proof of shine | the sky, light and post-processing beat the reference |
| M1 | Flight feel | tan and dheel are fun on their own |
| M2 | Pench | the string duel works end to end |
| M3 | The city | Puran Dhaka in the afternoon and golden hour |
| M4 | Night | the full Shakrain day and the campaign |
| M5 | Ship | phones, offline, polish |

Screenshots for each milestone land in `docs/shots/`.
