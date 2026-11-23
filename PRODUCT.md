# Product

<!-- impeccable:product-schema 1 -->

Written by `/impeccable init` on 2026-11-23 from the repository (`README.md`, `AGENTS.md`, the app) and the owner's
brief for this branch (`artifacts/ui-alt/BRIEF.md`). No interview was held: the brief was given as the whole
assignment. A line marked *(inferred)* is read from the code or the brief and was not confirmed in conversation.

## Platform

web

## Users

- People who play, or are curious about, acoustic instruments: they arrive by a shared link, on a phone as often as on
  a computer, and want to make a sound within seconds. *(inferred)*
- People who build or study physical models of instruments: they come for how it is made, and read Measurements and
  Notes. *(inferred)*
- The owner, Stephen, who films and shares it (`ui=0`, `keys=0` exist for that).

## Product Purpose

Sixteen acoustic instruments, each computed as physics in real time in the browser (an AudioWorklet in TypeScript); no
recorded sound is ever played as the instrument. One instrument is played from the keys, or an orchestra of them plays
a piece. What moves on the stage is read from the simulation itself. Success is a stranger playing a note and
believing it, then finding the other fifteen.

## Positioning

Every note comes from a model of hammers, bows, fingers, air jets, reeds, lips or mallets driving strings, tubes,
membranes and bars, fitted to recordings and judged on held-out notes. Nothing is sampled, and nothing drawn is
decorative motion: each moving line is the engine's own state.

## Operating Context

- One page, three looks of the same stage: a 2D drawing, the same in vector lines, and 3D.
- The keys on the screen, a computer's keyboard, a MIDI keyboard, a dropped MIDI file, or a bundled public-domain piece.
- The Orchestra: up to eighteen seats, lines routed to instruments, a piece's own address (`/symphony`, `/everything`,
  `/passiton`, `/tango`, `/seeds`).
- Sheet music in the instrument's place while a file plays.
- Two reading pages: Measurements (the model against recordings) and Notes (how it works).
- Every state is in the address; a link reopens it.

## Capabilities and Constraints

- The stage stays nearly wordless: icon-only controls carry a `data-tip` and an `aria-label`, no visible explanation.
- No theme picker. One look per branch.
- Phone at 390×844 with no horizontal scroll; the 3D instrument framed whole, clear of the file player.
- Sound never starts before a gesture. One AudioContext per page.
- The 3D stage keeps its performance knobs (`lite`, no ambient occlusion or bloom on phones) and compiles no shader
  where it would freeze a frame.
- Banned typefaces (owner): Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young Serif,
  Bodoni, Geist, Syne.
- `AGENTS.md` is the list of rules, each with the check that enforces it.

## Brand Commitments

- The name is *Instruments*. It appears in the browser tab and nowhere on the stage.
- Voice: plain, short, lower-case tooltips in one grammar ("reverb · 1.1 s"); the 404 says *Tacet*.
- The owner's taste: simple, easy to navigate, low on text, crafted.
- The sixteen line-drawn glyphs are the product's own iconography, reused wherever an instrument is named.

## Evidence on Hand

- The engine, its fits and judges (`packages/engine`, `scripts/judge*.ts`, `docs/CALIBRATION.md`).
- Measurements against the University of Iowa MIS recordings (analysis only; never bundled).
- Public-domain pieces with sources and hashes (`apps/web/src/orchestra/pieces.ts`); five originals given to the
  public domain.
- No testimonials, customers or pricing exist; none may be invented.

## Product Principles

1. The instrument leads. Chrome serves it and recedes.
2. What is drawn is what is computed.
3. Controls say what they are by their form before they say it in words.
4. Every state has an address.
5. A change is measured before it is kept.

## Accessibility & Inclusion

- Controls have accessible names; knobs are real sliders; menus close on Esc.
- `prefers-reduced-motion` stills the chrome's own motion.
- Targets a finger finds on touch (44 px where the layout has room); text contrast at WCAG AA. *(inferred as the
  standard; the critique of 2026-11-23 lists where the previous look fell short)*
