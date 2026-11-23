# Shape: Day Studio

`/impeccable shape`, 2026-11-23. No interview was held: the owner's brief (`BRIEF.md`) was declared the
whole assignment. What the brief states is plain text below; what was inferred from the repository or
decided here is marked *(assumed)*.

## 1. Job and audience

Someone sent a link, a musician, or an audio person arrives on a phone or a computer, untrained, for a few
minutes. They are inside the instrument: the mode is **Experience** (the work leads, the interface recedes),
with a handful of **Operate** controls round it and two **Read** pages.

## 2. Outcome and proof

A sound within one gesture, then the instrument seen whole and working: what vibrates is marked, and what
is marked is read from the simulation. Proof is the instrument itself, in good light. Nothing may be
claimed that the page cannot show.

## 3. Selected direction

**Day Studio** (pinned by the brief): "a bright, minimal daylight studio. High-key, pale ground, soft north
light, the feeling of a quiet photography studio or a modern practice room at midday. Air, space, and
clarity. The opposite of the current night bench."

- 2D: "a light ground (paper, plaster, or pale cyc), soft even illumination, very little vignette,
  instruments read as objects on a bright field"; the vector style goes light too.
- 3D: "a bright cyc / daylight environment: a large soft skylight or north-window key, gentle warm-white
  fill, almost no dramatic rim, soft shadows, higher exposure."
- Chrome: "calm, minimal, easy to scan, almost no decoration. Pale surfaces, a small number of weights, one
  precise accent."

Structural thesis *(assumed)*: the night bench says every state with light (a glow round the thing). Day
has no glows, so the page says two things, each one way: **ink is what is chosen, blue is what sounds.**
Everything else is the object and its shadow.

## 4. Scope and boundaries

- A complete, working replacement on this branch: bar, picker, view switch, orchestra, file player, readout
  band, fallboard, pedals, knobs, keys, position strip, menus, sheet music, action close-up, both pages, the
  404; the 2D grounds and drawers; the vector style; the 3D environment, lights, floor and tone.
- Untouched: the audio engine, the orchestra's seating, routing and behaviour, every address, the readout's
  rules, what each control does.
- Anti-goals: a SaaS light theme; a recolour of the night bench; a theme picker; new permanent copy on the
  stage; glow, glass or gradient as decoration.

## 5. States and ranges

- Sounding: one note; two to four with their chord; many; an ensemble's parts (up to eighteen seats).
- Idle before any sound; warming up; a failed start; a file loaded, playing, paused.
- Sixteen instruments alone, each in three looks; the Orchestra from two seats to eighteen; the piano's two
  kinds, its lid, its action close-up; the sheet music as a part or a score.
- Windows: 320 to 1440 px wide and wider, a phone on its side, a short laptop; touch, mouse, keys.

## 6. Interaction and layout

- The topology stays: the picker by family along the top, the stage, the keys under it. It is what the
  product's own rules and tests describe, and a side rail would make a studio into a dashboard *(assumed)*.
- Families are parted by space, not by rules. The Orchestra is a mode, drawn as one, not a seventeenth
  instrument.
- The band under the bar is captions on the studio's wall: the readout in the display weight, the spectrum
  and the scope as drawings in ink, with no panel behind them.
- The file player is a small pale object on the stage with one solid button: play.
- The fallboard and the keys are pale, material and quiet: knobs keep their names in view, pedals are
  drawn, the keys take a blue wash where they sound.
- Labels have a floor of 12.5 px; a finger's targets are 44 px.
- Motion: state changes ease out in 120–200 ms; nothing bounces; `prefers-reduced-motion` stills it.

## 7. Constraints and open decisions

- Fonts never used: Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young
  Serif, Bodoni, Geist, Syne; and not the incumbent Newsreader and IBM Plex.
- The 3D stage keeps its lighter path on phones and compiles no shader where it would freeze.
- Every rule in `AGENTS.md` that is not a description of the old look still holds; a test that measures the
  old look (a dark ground, "brighter than the ground") is rewritten to measure the same thing on the new
  one, never loosened.
- Open, for the owner: the link preview image (`og/instruments-grand.jpg`) still shows the night bench until
  it is taken again; behaviour the critique raised (an undo for lineup edits, names on touch, messages for a
  bad file) is outside a visual redesign.
