# Credits

Every third-party file in `assets/` is listed here with its source and licence. `npm run build` refuses
to run while any file is missing from this list (`tools/credits-check.mjs`). First-party voice
recordings in `audio/voices/` are exempt.

Everything not listed here is generated in code by `src/procedural/` and `src/audio.ts`: buildings,
props, trees, landmarks, kites, prints, the crowd's bodies and clothing, textures, grading tables,
noise, and all synthesized sound.

## Fonts

| File | Source | Licence |
|---|---|---|
| fonts/tiro-bangla-bengali-400-normal.woff2 | Tiro Bangla by Tiro Typeworks (Indigo project), via Fontsource 5.3.0 | SIL Open Font License 1.1, see fonts/OFL-TiroBangla.txt |
| fonts/tiro-bangla-latin-400-normal.woff2 | Tiro Bangla, as above | SIL OFL 1.1 |
| fonts/tiro-bangla-latin-400-italic.woff2 | Tiro Bangla Italic, as above | SIL OFL 1.1 |
| fonts/hind-siliguri-bengali-400-normal.woff2 | Hind Siliguri by Indian Type Foundry, via Fontsource 5.3.0 | SIL Open Font License 1.1, see fonts/OFL-HindSiliguri.txt |
| fonts/hind-siliguri-bengali-600-normal.woff2 | Hind Siliguri SemiBold, as above | SIL OFL 1.1 |
| fonts/hind-siliguri-latin-400-normal.woff2 | Hind Siliguri, as above | SIL OFL 1.1 |
| fonts/hind-siliguri-latin-600-normal.woff2 | Hind Siliguri SemiBold, as above | SIL OFL 1.1 |

## Models, textures and sound libraries

None yet. CC0 models go through `npm run models` into `models/`; CC0 textures into `tex/`; CC0 crowd,
firework, flame, pigeon and paper sounds into `audio/` with a file name that starts with their kind
(`crowd-`, `firework-`, `flame-`, `pigeon-`, `paper-`). Add a row here for each, with its source URL
and licence, in the same commit.
