# Product

<!-- impeccable:product-schema 1 -->

> Written from the repository (`AGENTS.md`, `README.md`, the code and its tests) and from the owner's
> brief for the UI alternates (`artifacts/ui-alt/BRIEF.md`, 2026-11-22). The owner declared that brief the
> whole assignment, so nothing here was interviewed: every line is either stated in those sources or marked
> *inferred*.

## Platform

web

## Users

- **Someone sent a link** (*inferred*: the app is shared as addresses, each instrument and each piece has
  its own, and the link preview is a still of the stage). They arrive on a phone or a laptop with no
  instructions, play a few notes, switch instruments, perhaps press play on a piece.
- **Musicians** who know the instruments and want to hear and see how one works: what the bow, the reed,
  the hammer and the board are doing while it sounds.
- **Audio and DSP people** (*inferred* from the Measurements and Notes pages): they read how each model is
  built and how it measures against recordings.

All of them use it for minutes at a time, in whatever light they are in; none of them is trained on it.

## Product Purpose

Instruments is sixteen acoustic instruments in the browser (piano, violin, viola, cello, double bass, harp,
flute, oboe, clarinet, bassoon, horn, trumpet, trombone, tuba, timpani, glockenspiel), each computed as
physics in real time, never as samples. A visitor plays one from the on-screen keys, a computer keyboard or
a MIDI device, sees it in 2D, in vector lines or in 3D moving with the simulation's own state, seats several
as an orchestra, and plays a file or a bundled piece on them. Success: a sound within one gesture of
arriving, and the instrument, not the interface, holding the attention.

## Positioning

Nothing recorded is ever played as the instrument, and what moves on the stage is read from the same
simulation that makes the sound (string shapes, bow, reed, valves, wavefronts, the engine's own level).
The picture is evidence of the model, not decoration.

## Operating Context

- One page, the stage: an instrument (or an orchestra) with the keys under it. Two more pages, Measurements
  and Notes, for reading. A 404 page of the app's own.
- Three looks of every instrument, one choice of three: the filled 2D drawing, 2D in vector lines, and a
  WebGL2 3D stage. The device remembers the choice; an address can set it.
- The Orchestra: up to an orchestra's worth of seats, a file's lines routed to them, five bundled pieces
  with addresses of their own (`/symphony`, `/everything`, `/passiton`, `/tango`, `/seeds`).
- A small file player (play, stop, position, sheet music, expression, routing, pieces, open a file), and
  the sheet music in the instrument's place while a file plays.
- Phone (390×844 and smaller), tablet, laptop and desktop. Touch, mouse, computer keys, Web MIDI.
- An address may ask for the stage alone (`ui=0`, `keys=0`) for looking, listening and filming.

## Capabilities and Constraints

- The stage stays nearly wordless. Icon-only controls carry a `data-tip` and an `aria-label`, never a
  visible label; no new permanent explanatory text; no position-line tooltip.
- The readout says everything that is sounding (one note and its frequency; a few notes by name with their
  chord; more, a chord or a count; an ensemble, how many parts), keeps its box and dims when nothing sounds.
- The picker shows the sixteen by family; on a wide window all on one row, elsewhere one button that opens
  them as a sheet, four to a row, each at least 44 px to touch.
- The phone layout works at 390×844 with no horizontal scroll; on touch the keys slide only from the
  position strip over them.
- The lid and the room are set by two rotary knobs on the stage; in 3D the room shows as the light on the
  floor and its knob stands where that light ends.
- No sound is asked for before a gesture. Start-up keeps one AudioContext and never waits on a worklet
  round trip.
- The audio engine and its calibration are outside any visual work.
- Performance: the 3D stage keeps its lighter path on phones (`lite`: no bloom, no ambient occlusion,
  smaller shadow map) and never compiles a shader where it would freeze the page.
- The repo's `AGENTS.md` lists every such rule with the test that enforces it; it outranks this file.

## Brand Commitments

- The name is **Instruments**. Nothing on the page names it; the browser tab does.
- Voice: plain, exact, lower-case labels, one word where one will do.
- The owner's taste, in his words: "simple, easy to navigate, low on text, and it should feel crafted."
- Fonts never to be used: Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora,
  Young Serif, Bodoni, Geist, Syne.
- No theme picker.

## Evidence on Hand

- The instruments themselves, live: the 2D drawers (`apps/web/src/ui/*-draw.ts`), the vector drawings
  (`apps/web/src/ui/vector/`), the 3D models (`apps/web/src/ui/gl/`).
- Measurements against the University of Iowa MIS recordings (the Measurements page; analysis only, the
  recordings are never played or committed).
- The Notes page: how each model works, its sources, its known limits, and credits.
- Eleven bundled pieces (public domain, and four of the project's own under CC0), listed in
  `apps/web/src/orchestra/pieces.ts`.
- No testimonials, customers, pricing or benchmarks against other products exist; none may be invented.

## Product Principles

1. The instrument is the page. Chrome is marginal, quiet, and never between the visitor and a sound.
2. What is drawn is true: every moving line comes from the simulation.
3. One gesture to a sound, on any device.
4. Say it without words where a drawing, a position or a state can say it.
5. Measured, not tuned by eye or ear: a claim on a page is a number someone can check.

## Accessibility & Inclusion

Keyboard focus is visible on every control; knobs are real range inputs underneath; icon-only controls
have accessible names; touch targets are at least 44 px where a finger must find them; motion that is not
the instrument's own respects `prefers-reduced-motion`. No formal standard has been set by the owner
(*undecided*); the working target is WCAG 2.2 AA contrast for text and controls.
