# Recording the Bengali voices

Natai's crowd shouts _ভোকাট্টা!_ when a kite is cut, laughs when a rival's falls, and groans when the
player's own string goes. Those voices cannot be synthesized or found in a sound library, so they
are recorded by the project owner and friends with a phone (DESIGN.md 8.3). The game is complete
without them: until they exist, the crowd roar plays alone and the HUD shows the word. Drop the files
in and the next build uses them; nothing else needs to change.

## What to record

| Kind     | Files | What it is                                                                                                                                                                                                |
| -------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bhokatta | 12    | The shout when a kite is cut: _bho-KAT-ta!_, loud, from the chest, as if across two rooftops. Vary it: one voice, two voices, a kid, an uncle, short, drawn out, with a whistle, with a laugh at the end. |
| laugh    | 6     | Short laughs from a roof when a rival's kite tumbles: teasing, delighted, a kid's giggle.                                                                                                                 |
| groan    | 6     | The rooftop's disappointment when their own kite is cut: _aaah_, _uff_, _hai hai_, a tongue click.                                                                                                        |

Twelve shouts sound like a crowd because the game plays two or three at once, each at a random pitch
and with a small delay. Different people and different distances help more than more takes.

## How to record

- Any phone voice-recorder app. Record outdoors or in a large room; a little echo is good, a fan or
  traffic hum is not.
- Hold the phone about an arm's length away and shout past it, not into it. Peaks should not clip:
  if the meter hits the top, step back.
- One sound per file. Trim the silence before and after to about a tenth of a second.
- Save or export as `.m4a`, `.mp3`, `.ogg` or `.wav`. Mono is fine.

## File names and place

Put the files in `assets/audio/voices/`, named by kind and number:

```
assets/audio/voices/bhokatta-01.m4a … bhokatta-12.m4a
assets/audio/voices/laugh-01.m4a   … laugh-06.m4a
assets/audio/voices/groan-01.m4a   … groan-06.m4a
```

The game finds every file whose name starts with `bhokatta`, `laugh` or `groan` at build time. These
are first-party recordings, so they do not go in `assets/CREDITS.md`.

## Checking

Run `npm run dev`, start a quick duel, and cut or be cut. The shout should come from the roofs with a
different voice each time; with captions on, the caption line names it.
