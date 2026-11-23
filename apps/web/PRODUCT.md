# Product

<!-- impeccable:product-schema 1 -->

Written from the repository's own record (README.md, AGENTS.md, `apps/web/src/views/notes.ts`) and the
UI-alternate brief (`artifacts/ui-alt/BRIEF.md`). No interview was held: lines marked *(inferred)* are read
from that evidence and not confirmed by Stephen in so many words.

## Platform

web

## Users

- Someone who follows a link and wants to hear and see an instrument work: a musician, a student, a
  curious engineer. On a computer with its keyboard or a MIDI keyboard, or on a phone held upright, often
  with no sound until the first touch. *(inferred from the README, the start-up rules and the phone rules)*
- The same person leaving a piece playing: an orchestra seated, a bundled score, the sheet music read as
  it plays, or Seeds running without end.
- Stephen and other instrument-minded readers who want the evidence: the Measurements page (model against
  recordings) and the Notes page (how each instrument is computed, its sources).
- People filming or embedding the stage (`ui=0`, `keys=0`).

## Product Purpose

Sixteen acoustic instruments played in the browser, each computed as physics in real time, never as
samples, and shown moving as the simulation computes them. Success is that a visitor plays a note within
seconds, believes the instrument, and can go deeper (another instrument, the Orchestra, a piece, the
measurements) without being told how.

## Positioning

Nothing recorded is ever played as the instrument. Every note comes from a model of hammers, bows, fingers,
air jets, reeds, lips or mallets driving strings, tubes, membranes and bars, fitted against recordings with
a held-out judge; what moves on the stage is read from the audio thread, not animated for show.

## Operating Context

- One instrument at a time (`/piano` … `/glockenspiel`), or the Orchestra (`/orchestra`, and five pieces'
  own addresses: `/symphony`, `/everything`, `/passiton`, `/tango`, `/seeds`).
- Three looks of the same stage: 2D (a filled drawing), vector lines, and 3D. A file player (play, pieces,
  open a MIDI file, routing, automatic expression, sheet music). A fallboard (pedals, octave, the
  instrument's physical knobs) over 88 keys; on a phone a position strip slides the keys.
- Two text pages: Measurements and Notes. A 404 page that links every address.
- Sound starts only on a gesture; the lamp in the bar says so ("tap a key").
- Static build on Vercel; `main` deploys to https://instruments-wustep.vercel.app.

## Capabilities and Constraints

- The whole address grammar, URL state and every rule in AGENTS.md's table stand: the picker's one row of
  sixteen on a wide window and its four-to-a-row sheet elsewhere, the readout's fixed box, the knobs on
  the stage, the phone layout at 390×844 with no sideways scroll, the file player lying over nothing.
- The stage stays nearly wordless. Icon-only controls carry a `data-tip` and an `aria-label`, never a
  visible label. No new permanent explanatory copy.
- Banned typefaces: Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young
  Serif, Bodoni, Geist, Syne.
- No theme picker. No change to the engine's sound for the sake of the look.
- 3D keeps its performance knobs (`lite`, a phone's occlusion and shadows) and draws without one WebGL
  warning.
- Reference recordings are for analysis only and never shipped.

## Brand Commitments

- The name is "Instruments". Nothing on the page itself names it: the instrument speaks.
- Stephen's taste, in his words: "simple, easy to navigate, low on text, and it should feel crafted."
- Copy is plain and literal, in the project's own voice (see AGENTS.md and the Notes page).

## Evidence on Hand

- The instruments themselves, live: 2D drawers, vector drawers and 3D models for all sixteen.
- Bundled public-domain and CC0 pieces with their sources (`apps/web/src/orchestra/pieces.ts`).
- The Measurements page's charts (model against the University of Iowa MIS and other licensable
  recordings) and the Notes page's sources and credits.
- No testimonials, customers, prices or press exist; none may be invented.

## Product Principles

1. The instrument is the page. Chrome recedes; what sounds is what is shown.
2. Everything shown is true: drawn from the simulation, measured, or cited.
3. One gesture to the first note; nothing between a visitor and playing.
4. Few words. A control explains itself by what it moves, a tooltip, and a name for assistive technology.
5. The same care on a phone as on a computer.

## Accessibility & Inclusion

- Icon-only controls have `aria-label`s; knobs are sliders with names and arrow-key steps; focus is visible.
- Motion follows `prefers-reduced-motion`.
- Touch targets are at least 44 px where a finger must find them.
- No formal standard has been set beyond these. *(inferred)*
