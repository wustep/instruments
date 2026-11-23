---
name: "Instruments: Night Gallery"
description: "A museum room after closing: the instrument is the one lit object, and the page is its wall, rail, label and plinth."
colors:
  wall: "#111315"
  wall-0: "#090a0c"
  wall-2: "#1a1c1f"
  wall-3: "#232529"
  rule: "#282a2d"
  rule-2: "#3d4043"
  ink: "#e6e8ea"
  ink-2: "#bbbec1"
  muted: "#919497"
  light: "#f5f7f9"
  tungsten: "#edd09c"
  steel: "#8ba8c6"
  signal: "#f66e5c"
  key: "#a9abae"
  key-lip: "#7e8084"
  key-out: "#2c2e31"
  key-ink: "#202225"
  sheet-paper: "#e1e0db"
  sheet-ink: "#202225"
  sheet-on: "#1f53b8"
  vector-ground: "#08090b"
  vector-blue: "#86bdea"
  vector-blue-mid: "#5a8fbf"
  vector-blue-dim: "#3a6289"
  vector-frame: "#1d3147"
  vector-amber: "#ffc56e"
  vector-text: "#e3f0fa"
  vector-slot-1: "#7fdca0"
  vector-slot-2: "#ff7c5e"
  vector-slot-3: "#f08fd2"
  vector-slot-4: "#eef3f8"
typography:
  display:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "clamp(64px, 17vw, 96px)"
    fontWeight: 200
    lineHeight: 1
    letterSpacing: "-0.04em"
  readout:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 300
    lineHeight: "38px"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.62
  small:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  control:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1
  label:
    fontFamily: "'Franklin Figures', 'Libre Franklin Variable', 'Franklin Gothic Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "'tnum'"
  code:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
  vector:
    fontFamily: "'Hershey', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  none: "0px"
  hair: "1px"
  sm: "2px"
  round: "50%"
spacing:
  gutter: "clamp(14px, 3vw, 28px)"
  rail: "60px"
  rail-phone: "44px"
  rail-pages: "38px"
  label-band: "58px"
  plinth: "62px"
  plinth-phone: "54px"
  keys: "clamp(118px, 17vh, 168px)"
  keys-phone: "150px"
  measure: "33rem"
  measure-small: "29rem"
components:
  rail-pick:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 3px 3px"
    width: "40px"
  rail-pick-hover:
    textColor: "{colors.ink}"
  rail-pick-lit:
    textColor: "{colors.light}"
  view-word:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "0 7px"
  view-word-lit:
    textColor: "{colors.light}"
  picker-sheet:
    backgroundColor: "{colors.wall-2}"
    rounded: "{rounded.sm}"
    padding: "8px"
    width: "min(372px, calc(100vw - 2 * gutter))"
  readout:
    textColor: "{colors.light}"
    typography: "{typography.readout}"
    width: "250px"
    height: "58px"
  fallboard:
    backgroundColor: "{colors.wall-0}"
    typography: "{typography.label}"
    height: "{spacing.plinth}"
    padding: "0 clamp(14px, 3vw, 28px)"
  key-white:
    backgroundColor: "{colors.key}"
    textColor: "{colors.key-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
  key-white-sounding:
    backgroundColor: "{colors.light}"
    textColor: "{colors.key-ink}"
  key-out:
    backgroundColor: "{colors.key-out}"
  dial:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    width: "54px"
    size: "38px"
  stage-knob:
    backgroundColor: "{colors.wall-0}"
    rounded: "{rounded.round}"
    size: "36px"
  pedal:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    width: "46px"
  pedal-held:
    textColor: "{colors.light}"
  player-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "5px"
    size: "28px"
  player-button-hover:
    textColor: "{colors.light}"
  menu:
    backgroundColor: "{colors.wall-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "4px"
  tooltip:
    backgroundColor: "{colors.wall-2}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  sheet-paper:
    backgroundColor: "{colors.sheet-paper}"
    textColor: "{colors.sheet-ink}"
    rounded: "{rounded.hair}"
    width: "980px"
---

# Design System: Night Gallery

The look of *Instruments* (`apps/web`). Recorded from the shipped build: `styles.css`, `panel.css`, `vector.css`,
`not-found.css`, `ui/stage-draw.ts` (`INK`), `ui/vector/kit.ts` (`V`, `GROUND`, `SLOTS`), `ui/gl/three3d.ts`
(`gallery`, `ROOM`, `FINAL_FS`). Where a value below and the source disagree, the source is the build and this file
is stale.

## Overview

**Creative North Star: "Night Gallery"**

The instrument is the one lit object in a museum room after closing, and the page is that room: its wall, its picture
rail, its label, its plinth. A cool charcoal wall runs edge to edge; the floor is one step darker. At the top a rail
carries sixteen line-drawn glyphs in their families; under it a wall label names what is sounding; below stands the
work itself, the only colour on the page; at the foot a matt plinth with a lit front edge, and the keys in half-light.

Light is the only signal. What is chosen, pressed or sounding is lit, never coloured and never boxed. There are three
lights and no paint: silver (the light from behind; every "on"), tungsten (the dim key; what a body does: a board, a
string that answers, a hammer's speed), steel (reference: the recording a model is held against). All other colour
belongs to the instruments: their wood, brass, felt, copper and steel.

It is quiet, spare and exact: one grotesque family, tight tracking, low-contrast labels that still pass AA, square
corners, no ornament. It replaced a dark product studio under softboxes with an italic display serif over small
monospace labels and one orange accent; none of that is current, and none of it returns.

**Key Characteristics:**
- One wall tone for page, 2D stage and 3D room; they meet without a seam (`--ground` is read by the 3D stage).
- Three lights, no paint. One alarm colour, for a failure and nothing else.
- One way to say "this one": a fixture on the rail's upper edge and its light falling on the thing.
- One family, Libre Franklin, with tabular figures from its fork Public Sans; text floor 11 px.
- Hairlines only where something stands: the rail's lower line, the plinth's front edge, the floor line.
- Light rises in 90 ms and falls in 320 ms. Nothing changes place but what the hand moves.
- The stage is nearly wordless: icon-only controls carry a tooltip and an accessible name.

## Colors

A cool, nearly neutral charcoal room, bone ink, and three lights; every hue with any saturation outside this list is
an instrument's own material.

### Primary
- **Silver Light** (`light`): whatever is on, chosen or sounding. The lit glyph and word on the rail, the readout's
  note, a sounding key, a dial's value arc and index, the played part of the file's hairline, a held pedal, the lamp
  when sound runs, the focus ring, the model's line in a chart (`--accent`).

### Secondary
- **Tungsten** (`tungsten`): what a body does. In the 2D drawings the soundboard's modes, a string that answers, a
  key under a finger; in the chrome only the action close-up's hammer speed and the warm strokes of a Notes diagram.
  It is never a selection colour.

### Tertiary
- **Steel** (`steel`): reference. The recording a model is held against in a chart (`--ref`), the ideal partials on
  the spectrum, a prepared key's dot, the text selection (42 % of it under silver text).
- **Signal** (`signal`): a failure of the sound, and nothing else: the lamp and its words when audio is in error or
  stalled.

### Neutral
- **Wall** (`wall`, `--ground`): the page, the 2D stage's ground, the 3D room's far wall, the browser's
  `theme-color`. Over it lies a plaster grain (an SVG turbulence, three levels either side of the tone) that keeps
  the dark gradients from banding.
- **Floor** (`wall-0`): one step lower: the plinth (fallboard and key bed), the bottom of the stage's fall-off,
  discs behind stage knobs (78 %), the scrim behind the action close-up (70 %).
- **Raised wall** (`wall-2`, `wall-3`): floating surfaces only: the phone's picker sheet, menus, tooltips, the
  phone's knob and keys-play trays.
- **Rule** (`rule`) and **Rule, strong** (`rule-2`): table and section hairlines; the frame of a floating surface,
  chart axes, scrollbars.
- **Bone ink** (`ink`), **Second ink** (`ink-2`), **Muted** (`muted`): body and hover text; secondary text, icon
  buttons at rest, prose; labels, unlit words and glyphs.
- **Keys** (`key`, `key-lip`, `key-out`, `key-ink`): ivory in half-light, its front lip, a key outside the
  instrument's compass, and the ink of key names.
- **Sheet** (`sheet-paper`, `sheet-ink`, `sheet-on`): the sheet music's grey-white board, graphite ink, and the
  conductor's blue pencil for the notes sounding.

### The 2D drawings' inks (`stage-draw.ts` `INK`)
The same three lights as RGB triplets (bone 230,232,234; light 245,247,249; tungsten 237,208,156; steel
139,168,198), drawn at an alpha, plus the instruments' own materials: copper 196,128,82, felt 205,181,146, wood
58,42,28, ebony 18,20,24. New drawing code takes its ink from `INK`, never a literal.

### The vector lines (`vector.css`, `vector/kit.ts` `V`)
The same wall turned down (`vector-ground`, bare: no wash, no grain) and the three lights turned to a display's
phosphors: argon blue for the instrument and the furniture (`vector-blue`, `-mid`, `-dim`, `vector-frame`), tungsten
amber for sound (`vector-amber`), pale blue-white for the lit word (`vector-text`). Solid parts are masked with
`GROUND` so lines behind them are hidden. Beams are added (`lighter`), so crossings brighten.

### Named Rules
**The Three Lights Rule.** Silver, tungsten, steel, and no paint. A new state gets one of the three by its meaning
(on, a body's doing, reference), never a new hue.

**The Instruments' Colour Rule.** Any saturated colour on the page belongs to an instrument's material. Chrome never
borrows it.

**The Signal Rule.** `signal` appears only when the sound has failed.

**The Slot Exception.** In vector lines only, the first four knobs of an instrument take a slot colour (green
`vector-slot-1`, red `-2`, pink `-3`, white `-4`; blue past the fourth) and whatever each knob moves in the drawing
is drawn in that colour. It ties a control to its effect; it is not decoration and does not exist in the other two
looks.

**The Blue Pencil Exception.** On the sheet music's paper light cannot be the mark, so the notes sounding and the
place line are `sheet-on`. In vector lines the same role is amber.

## Typography

**Family:** Libre Franklin Variable (with Franklin Gothic Medium, Helvetica Neue, Helvetica, Arial)
**Figures:** "Franklin Figures", first in the stack: Public Sans restricted to U+0030–0039
**Code:** the system monospace (`--code`), for equations on Notes and the `?debug` log only
**Vector lines:** AVHershey Simplex (Light 300, Medium 500), single-stroke capitals

**Character:** The grotesque of an American museum's wall label: plain, slightly condensed, set tight and small, light
at display sizes. Libre Franklin has no tabular figures (its 1 is two thirds of its 0), so a frequency, a table
column or a knob's reading would shift as it changes; Public Sans is its own fork and has them, so one face of it
carrying the ten digits and nothing else stands first in the family. Every figure on the page is its, and
`font-variant-numeric: tabular-nums` holds wherever it is asked.

### Hierarchy
- **Display** (200, clamp(64px, 17vw, 96px), 1, −0.04em): the 404's one word, *Tacet*.
- **Readout** (300, 34px/38px, −0.025em, silver): the note sounding. Steps down as it has more to say: 29, 23, then
  18px at weight 400; on a phone 26, 23, 19, 15.5px; sideways 21 and 16.5px. Always one 38px line box.
- **Headline** (300, 30px/1.15, −0.02em; 25px on a phone): page and section heads on Measurements and Notes; the
  action close-up's key name is 26px of the same; a measurement tile's figure 32px.
- **Title** (500, 17px/1.3, −0.01em): a figure's heading. Notes' sub-heads are 600 13px/1.4, tracking 0.
- **Body** (400, 16.5px/1.62, `ink-2`, max 33rem): prose. Captions 14.5px/1.55; Notes' captions and credit line
  italic 14px/1.5.
- **Small** (400, 13px/1.6, `muted`, max 29rem): sources, hints, table notes, chart sub-lines, the 404's links.
  Tables 12.5–13px tabular.
- **Control** (500, 11.5px/1; 12.5px on a phone): the rail's words (view, piano kind, pages), tooltips. Menu titles
  13.5px 500 over 12px 400.
- **Label** (500, 11px/1, tabular): the floor. Instrument names under glyphs, pedal and dial names, key names,
  counts, the octave (12px), the line under the readout (11.5px 400).

Sentence case by `::first-letter`; only "2D" and "3D" are upper-cased. Tracking is negative and scales with size
(−0.04em at display to −0.005em at 14px; none at 13px and under). Weights in use: 200, 300, 400, 500, 600.

### Named Rules
**The One Family Rule.** Libre Franklin for everything that is read. No second display face, no monospace labels.

**The 11 px Floor Rule.** No text under 11px.

**The Figures Rule.** Anything that changes while it is read (a frequency, a reading, a count, a table) is tabular.

**The Hershey Exception.** In vector lines `--face` becomes Hershey Simplex, upper-cased with 0.03–0.04em tracking,
weight 500 (300 for the readout). It is a second drawing of the same room, not a second voice in the first.

## Layout

A fixed stack with no page scroll on the stage: the rail (60px; 44px on a phone; 30px sideways; 38px on the two
reading pages), the label band (58px box), the stage (all the height that is left, 300px at least), the plinth
(fallboard 62px, 54px on a phone, 40px sideways), a position strip where the keys do not all fit (24px), the keys
(clamp(118px, 17vh, 168px); 150px on a phone; 96px sideways). Side gutter clamp(14px, 3vw, 28px) everywhere.

- **The rail.** Left: sixteen picks in five families, 1px apart inside a family and 13px between families (the gap
  says it; no divider), then the Orchestra. Right: the piano's kind, the view (2D, Vector, 3D), the lamp, two page
  links.
- **The label band.** Left the readout in a fixed 250×58px box (nothing under it moves when a note sounds); centre
  the spectrum (up to 640px wide, 58px tall); right the scope (250px) or, for an ensemble, its parts.
- **Breakpoints.** At 1340px and under (or sideways under 500px tall) the sixteen fold into one button that opens a
  sheet, four to a row, each row a kind. At 760px and under: the phone layout (view switch moves into the band, the
  spectrum under the readout, scope hidden, knobs behind one button). At 360px: the picker button is its glyph
  alone. Under 500px tall in landscape: one slim band.
- **Reading pages.** A 1120px column; prose at 33rem, small text at 29rem; Notes at 44rem. Measurements' figures two
  to a row with 44px/40px gaps, one to a row on a phone; a chart made to be wide keeps 700px and scrolls inside its
  own box.
- **No sideways scroll.** A long lineup's strip and row give way (a part to 34px, a chip to 22px) rather than widen
  the page.

## Elevation & Depth

Depth is light, not lift. The chrome is flat: the rail, the label and the plinth have no shadow and no frame. What
separates planes is tone (wall, floor one step lower) and a lit edge.

### Lit edges
- **The fixture** (`--fixture`: `inset 0 1px 0` of silver): a 1px line of light on the upper edge of the chosen thing.
- **The spot** (`--spot`: `radial-gradient(50% 72% at 50% 0%, silver 26 %, silver 8 % at 55 %, transparent)`): the
  fixture's light falling on it.
- **The rail's lower line**: 1px, silver 20 % at the left falling to 8 % at 36 % and 3 % at the right.
- **The plinth's front edge**: 1px, silver 72 % at the left to 30 % at 34 % and 10 % at the right, over a 9px wash
  of 5.5 %. Brightest at the side the light comes from. With no keys on screen the wall has its own floor line 26px
  over the window's foot.

### Shadow Vocabulary
Only what floats over the stage casts one, soft and black, and always with a 1px `rule-2` frame on `wall-2`:
- **Tooltip** (`0 6px 16px rgb(0 0 0 / 0.4)`).
- **Chart tooltip** (`0 8px 22px rgb(0 0 0 / 0.45)`).
- **Menu** (`0 12px 30px rgb(0 0 0 / 0.5)`): a line's instruments, the routing grid, the sheet's parts.
- **Pieces menu** (`0 14px 36px rgb(0 0 0 / 0.55)`), **sheet paper** (`0 16px 44px rgb(0 0 0 / 0.55)`).
- **Picker sheet** (`0 18px 44px rgb(0 0 0 / 0.6)`), **action close-up** (`0 18px 60px rgb(0 0 0 / 0.6)`).
No blur and no backdrop filter anywhere in the chrome. In vector lines every one of these shadows is removed and
the frame alone remains.

### The 2D wall (drawn style)
The stage is transparent to the page's wall and falls to `wall-0` at 60 % towards the floor from 52 % down. Over the
drawing lies a rail of wall-washers: a scallop of light (`#c2c8cf` at 13 % under its upper edge, 7.5 % at 28 %, 2.2 %
at 70 %, blurred 17), one tile 680px wide repeated across, the middle one over the work, plus a second fall-off to
40 %. The light lies over the drawing too: the work is the lit object. The floor line is the plinth's lit edge.

### The 2D wall (vector lines)
`vector-ground`, bare. No wash and no grain; one hairline for the floor 14px over the stage's foot (blue-dim to frame
to 40 % frame). One glow pass per frame adds the canvas back blurred.

### The 3D room (`three3d.ts`)
- **Lights (`ROOM`), directions towards the light, +z behind the instrument.** Silver from behind and above, the one
  that casts the shadow forward: direction (−0.62, 0.5, 0.72), intensity 3.3, colour (0.84, 0.9, 1). A second silver
  from behind, low, on the other side, no shadow: (0.74, 0.34, 0.58), 1.3, same colour. A dim tungsten key across the
  front: (−0.72, 0.52, −0.46), 1.1, colour (1, 0.86, 0.68). No fill from the front. The generated room's share of
  the light 0.8. The directions are written for a first view at a yaw of 0.62 (`bearing`); the lights and the
  room are turned about each instrument to where it is first seen from, so every one is lit the same way from its
  own first view and keeps that light as it is walked round.
- **The generated environment (`gallery()`).** A 30×14×30 room at (0.011, 0.013, 0.017), floor (0.026, 0.029,
  0.034). Lit panels, feathered: two silver slots behind (1.5×10 at ×14, 1.0×9 at ×8.5; they are the long bright
  lines down a case's edge and a bell's rim), their spill on the back wall (16×2.6 at ×0.5), one small tungsten lamp
  front left (2.4×2.4 at ×7.5; a round highlight, not a softbox's window), the wall behind the camera washed at
  ×0.36, the ceiling at ×0.26, the floor in front at ×0.2.
- **The floor.** Honed, dark: colour (0.044, 0.046, 0.05), roughness 0.72, specular 0.18, environment 0.4. It takes
  the shadow and the room's pool of light; past the pool's rim it keeps 0.3 of the pool's light (`dusk`). The pool
  lifts with the sound, and its rim brightens by 0.3 while the room's knob is under the pointer, turned or focused.
- **The far wall (`FINAL_FS`).** The page's own wall colour, exactly, at the canvas's upper edge. One scallop of cool
  light (0.112, 0.124, 0.142) over the instrument, sized to its box; the wall dims to 0.82 at the floor line; the
  floor under it 0.5–0.72 of the wall, returning 28 % of the scallop; a hairline (0.020, 0.024, 0.030) where they
  meet, which moves back as the room's knob is turned.
- **Pipeline.** HDR target, 4× multisampled (2× on phones); GTAO; Khronos neutral tone mapping; bloom at 0.35 from
  specular hot spots only (off on phones); a dither against banding; shadow map 2048 (1024 on phones), radius 5 (3).
  Camera 24° field of view. A piano key's close-up has its own warmer, brighter set (`CLOSE`, exposure 0.74).

### Named Rules
**The Light From Behind Rule.** The instrument is cut out by silver light from behind and read by a dim tungsten
key. Never fill from the front; never a softbox.

**The Flat Chrome Rule.** Rail, label and plinth carry no shadow. A shadow means "this floats over the stage".

**The One Wall Rule.** Page, 2D ground and 3D far wall are the same tone and meet without a seam.

## Shapes

Square. Everything on the rail and the plinth has a radius of 0. Floating surfaces and the small buttons inside them
ease their corners by 2px (`--radius`), a key's foot by 2px, the sheet paper by 1px; in vector lines `--radius` is
0. The only round things are things that are round: the lamp (9px ring, 1.5px stroke), dials, stage knobs, the MIDI
socket, a routing cell, a line number, the way back from a close-up.

Lines are thin and of one weight per kind: glyphs 1.1 (details 0.35–0.9) on a 36px square; chrome icons one drawn
line, 1.4, round caps, on a 16px square (`ui/icons.ts`); dial track 1.2, value arc 1.6, index 1.5, ticks 0.7.
Borders exist only as the frame of a floating surface (1px `rule-2`) and as table and section rules (1px `rule`).

**The Standing Line Rule.** A hairline is drawn only where something stands on it: the index on the rail, the work
on the floor, the plinth's edge. Never a divider between siblings; a gap says that.

## Components

### The rail and the picker
- **A pick:** a 32px glyph over its name (11px), 40px wide at least, muted; no box, no radius. Hover: `ink`, in
  90 ms. A glyph is a line drawing in the label's ink with a 7 % wash where the body is.
- **The one on the stage:** silver, under the fixture and its spot. An Orchestra lights every instrument it has
  (the fixture is then the Orchestra's own) and shows a count (500 11px, silver) over the shoulder of a doubled one.
- **Focus:** a 1px silver outline drawn inside the box (−1.5px), since the rail sits against the window's edge.

### The phone's sheet
One button names what is on the stage (26px glyph, name 500 12.5px, a small chevron), lit from its fixture as the
row's pick is. It opens a sheet (`wall-2`, 1px `rule-2`, 2px corners, 8px padding, 372px at most): four to a row,
every row a kind (struck or plucked; strings; woodwinds; brass), 34px glyphs, names 12px. In the sheet a fixture
has no rail to hang from, so the one on the stage is silver on a 10 % wash of light. The piano's kind sits at the
sheet's foot over a `rule` hairline.

### View switch and piano kind
Words, one of them lit: 500 11.5px, muted, 7px either side, no box; the chosen one silver under fixture and spot. On
a phone the view hangs from the rail's lower line in the band (12.5px, 40px wide at least, 44px row). The 3D
"case off" toggle is a 30px icon of the same grammar.

### The lamp
A 9px ring in `ink-2`, breathing (opacity to 0.35 over 1.6 s; 0.5 s while starting) until sound runs, then filled
silver. Error or stalled: `signal`, still. Its hint ("tap a key") is one line, two, or the lamp alone, never cut
short.

### The label: readout, spectrum, scope, parts
- **Readout:** the note in Franklin Light 34px silver over one 11.5px muted line (frequency, chord, span). Its box
  never changes; let go, it shows what was last heard at 40 % opacity.
- **Spectrum** (canvas): a bone hairline (30 % at rest, 55 % sounding), whole; its scale's three figures (100, 1k,
  10k, 11px Franklin) hang under it, each from a tick at its frequency. Measured partials in silver, the ideal
  series in steel.
- **Scope** (canvas, 42px): the excitation in silver over bone, its caption 11px tabular muted.
- **Parts** (an ensemble): each instrument's 28px glyph, in the room's dark (`#6f7275`) when silent, silver while it
  sounds, its notes (11px) under it only while it sounds.

### File player and menus
- **Player:** top centre of the stage, a strip in the wall's own tone at 84 % (no frame, nothing blurred): icon
  buttons 28px (36px on touch), `ink-2`, silver on hover. Idle it is two icons, play and open.
- **Position:** a 1px hairline (ink 24 %), the part played in silver; 25px of it to take hold of.
- **Lines:** a 30px chip per line showing its instrument; silver while it sounds; one row on a phone, each chip
  its share (28px down to 22px).
- **Menus** (a line's instruments, a section's seats, the routing grid, the pieces): `wall-2`, 1px `rule-2`, 2px
  corners, a soft shadow. A chosen entry is silver on a 12 % wash; a routing cell is an 8px ring, filled silver
  when on; a line number a 24px ring, filled silver with floor-dark ink when on. The pieces menu's rows: title 500
  13.5px `ink`, then composer 12px muted and the lineup as 15–20px glyphs.
- **Toggles in the player** (expression's hairpin, the sheet, routing): silver when on, muted or `ink-2` when off.

### Keys
- **White:** ivory in half-light (`#74777b` under the fallboard's shadow to `key`, `#b3b5b8` at 76 %), a 4px front
  lip (`key-lip`), partings that are the dark between keys (0.5px transparent borders), 2px feet.
- **Black:** near-black with a faint sheen at 91 %, 62 % of the height, a 5px black lip and a short cast shadow.
- **Pressed:** down 2px in 40 ms, a step brighter. **Sounding** (the engine's own allocation): lit, silver to white;
  a black key greys up with a 1px silver inner line. **Out of compass:** `key-out`.
- **Names:** 500 11px tabular in `key-ink` (computer-key letters, and each C's name above them); on touch the
  letters are hidden and the C names take their line.
- **Position strip:** all 88 in miniature, sounding ones silver, a 1px `ink-2` window on those in view (silver
  while dragged), the rest under a 66 % shade.
- **Vector lines:** outlines only, black keys hatched at 135°; pressed, the outline brightens; sounding, amber.

### Fallboard (the plinth)
A matt slab, `#0d0e11` to `wall-0`, 62px, with the lit front edge. On it, left to right: pedals, the octave (two
drawn arrows round a 500 12px tabular label), then the dials at the right (or an ensemble's "what the keys play"
chips: 30px glyphs, the chosen ones under fixture and spot, a half-chosen section with its fixture at 45 %).

### Dials
A thin ring with an index; no cap, no bevel: 38px face in a 54px column, eleven ticks (ink 24 %), a 270° track (ink
16 %, 1.2), the value's arc in silver (1.6, round), an index line in silver, a barely-there centre (ink 3 %; 10 %
with an `ink-2` ring on hover, turn or focus, silver ring on focus). Under it the name (11px muted), replaced by the
reading (silver, tabular) on hover, turn or focus. Each is a real slider. A drawn arc-and-arrow resets them. On a
phone they sit behind one dial icon (44px) in a tray over the plinth. In vector lines a dial is an encoder in its
slot colour: ring, index, name and reading.

### Pedals
An outline of the pedal's foot (30×28px, `ink-2` stroke, a faint sheen line) over its name (11px). Held, the foot
fills with silver (4 % to 90 % with depression), sinks 3px and shortens by a tenth; outline and name go silver.

### Stage knobs (lid, room)
The dial on a 36px disc of the floor's tone at 78 % (44px on touch), so it reads over the instrument. No word and no
pointer: the arc is the value, and the middle holds what the knob moves, drawn in one 1.3 line: a lid on its hinge
(a base line and a raised line from one end), a room (a square with a small circle in it). A notched knob (the 3D
lid) has one longer tick per notch. Hover, drag or focus: disc edge and glyph go silver. A slider with a tooltip
and a name.

### Tooltips
`wall-2`, 1px `rule-2`, 2px corners, 4px 8px, 500 11.5px tabular `ink`, one line, lower case, one grammar
("reverb · 1.1 s"). Vector lines: Hershey capitals on the ground, frame only.

### Sheet music
In the instrument's place: a page of grey-white board (`sheet-paper`, a soft light from over its head, 1px corners,
980px at most) on the wall, falling off towards the floor. Graphite ink, staff lines at 55 %. The part's name 500
14px with a small caret (a menu of parts); the piece's title italic 13px at the right. Notes sounding and the place
line (1.5px, 75 %) in blue pencil. Vector lines: the score in blue lines on the ground inside a hairline frame, what
sounds in amber.

### Action close-up (piano)
A panel of the wall (`wall`, 1px `rule-2`, 820×460px at most) over a 70 % floor-dark scrim; the key's name 300 26px,
the hammer's speed 500 11px tabular in tungsten, a 36px drawn close. On a phone it is a bottom tray, full width,
square, with only a top line.

### Charts (Measurements)
The model in silver, the recording it is held against in steel: a 1.75 line against dots ringed in the wall's tone.
Axes `rule-2`, grid `rule`, labels 11px muted tabular, panel titles 500 14px `ink-2`. Legend 12px muted with a 14×2px
swatch. A/B buttons: 1px `rule-2` outline, 12px; playing, filled silver with floor-dark ink. Tiles: a 300 32px
tabular silver figure over 13px muted.

### The pages (Measurements, Notes)
The catalogue: wall for ground, one family, a real measure. Headline 30px light; prose 16.5px `ink-2` at 33rem;
sources and notes 13px muted at 29rem; tables with `rule` hairlines under rows and 500 muted heads; equations in
the system monospace in a faint framed block (ink 3 %, 1px `rule`). Links are underlined in `rule-2`, the underline
silver on hover. Notes' contents are underlined words (44px rows on touch). A way-back arrow replaces the picker.

### The 404
The wall with no work on it: one scallop of light falling on nothing. *Tacet* in Franklin ExtraLight
(clamp(64px, 17vw, 96px), silver), one 13px muted line under it beside an unlit lamp, then every place that exists,
by family, as 13px words that light under the pointer exactly as the rail's pick does (silver, fixture, spot), and
the two pages after a `rule` hairline. Its own small sheet; Libre Franklin without the figures face.

## Do's and Don'ts

### Do:
- **Do** say a state with light: silver ink, and where there is a rail above it, `--fixture` and `--spot`.
- **Do** take every chrome colour from the tokens, and every 2D drawing ink from `INK`; in vector lines from `V`,
  masking solids with `GROUND`.
- **Do** keep text at 11px or more, tabular wherever it changes while read, in Libre Franklin.
- **Do** keep the page, the 2D ground and the 3D far wall one tone, and let the 3D stage read `--ground`.
- **Do** light the 3D instrument from behind in silver with a dim tungsten key, and let its shadow fall forward.
- **Do** time light at 90 ms up and 320 ms down on `cubic-bezier(0.16, 1, 0.3, 1)`; transition colour and opacity,
  not place.
- **Do** give an icon-only control a `data-tip` and an `aria-label`, and a dial a real slider.
- **Do** give a touch target 44px where the layout has room (stage knobs, the knob toggle, the octave's arrows at
  40×44, Notes' contents), and never widen the page to fit a long lineup.
- **Do** honour reduced motion: the lamp stops breathing and every transition is instant.

### Don't:
- **Don't** mark "this one" with a colour, a filled chip, a boxed segment, an underline or a side stripe.
- **Don't** bring back the look this replaced: a warm near-black ground, an italic display serif over small
  monospace labels, a vermilion or amber accent, softboxes and a warm key in a product studio, a spot in a void.
- **Don't** add a second family, or set labels in monospace. Never Inter, Instrument Serif, Fraunces, Bricolage
  Grotesque, Space Grotesk, Sora, Young Serif, Bodoni, Geist or Syne.
- **Don't** use tungsten or steel to mean "selected", or `signal` for anything but a failure.
- **Don't** use the vector slot colours, the blue pencil or the Hershey face outside the look or surface they
  belong to.
- **Don't** put a shadow, a frame or a blur on the rail, the label or the plinth; don't blur behind anything.
- **Don't** draw a divider between siblings; don't round a corner past 2px unless the thing is round.
- **Don't** add permanent words to the stage, or a theme picker.
- **Don't** fill the 3D scene from the front or raise the environment to read a dark body; give it an edge to catch.

## Accessibility as built

- **Contrast on the wall** (`#111315`): ink 15.2:1, second ink 10.0:1, muted labels 6.1:1 (6.5:1 on the plinth,
  5.6:1 on a menu), silver 17.3:1, signal 6.5:1. Key names 6.9:1 on a key at rest and 14.9:1 on a lit one; on a
  black key 8.1:1. Sheet ink 12.1:1 on its paper, the blue pencil 5.3:1. Vector lines: blue 9.9:1, mid blue 5.8:1,
  amber 12.8:1 on their ground.
- **State is never colour alone**: a lit thing is also brighter by a large step, and pressed controls carry
  `aria-pressed`, `aria-checked` or `aria-expanded`.
- **Focus**: a 1px silver outline, 2px off (drawn inside where a control meets the window's edge); amber in vector
  lines.
- **Touch**: 44px rail on a phone; stage knobs 44px; the knob toggle 44px; octave arrows 40×44px; player buttons
  36px; sheet-music parts 40px rows; the sheet's picks at least 44px tall; the position hairline 25px to hold.
- **Motion**: `prefers-reduced-motion` stops the lamp and sets every transition to 0 s. The stage's own motion is
  the simulation's state and is not chrome.
