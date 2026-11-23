---
name: Instruments
description: Sixteen physically modelled instruments in a north-lit white studio at midday.
colors:
  ground: "#eceff1"
  ground-2: "#e2e6e9"
  paper: "#f9fafb"
  paper-2: "#f1f3f5"
  ink: "#1c222a"
  ink-2: "#424850"
  muted: "#666d74"
  faint: "#7f858b"
  rule: "#d6dadd"
  rule-2: "#b9bec2"
  accent: "#1d48d1"
  accent-wash: "#dbe6ff"
  ref: "#5d6b7c"
  alarm: "#b3401a"
  ivory: "#f8f7f1"
  ebony: "#24272a"
  film: "#f3f5f8"
  film-ink: "#2b3644"
  film-frame: "#c3cad2"
  lead-green: "#14804a"
  lead-red: "#d03b22"
  lead-pink: "#b8308a"
  lead-deep: "#0e141b"
typography:
  display:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 300
    lineHeight: "40px"
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "clamp(27px, 3vw, 34px)"
    fontWeight: 300
    lineHeight: 1.12
    letterSpacing: "-0.005em"
  title:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 550
    lineHeight: 1.25
    letterSpacing: "0"
  prose:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "17.5px"
    fontWeight: 450
    lineHeight: 1.6
  body:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 450
    lineHeight: 1.5
  label:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.25
  label-strong:
    fontFamily: "'Ysabeau Office Variable', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 550
    lineHeight: 1.15
  mono:
    fontFamily: "'Sometype Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.65
  plotted:
    fontFamily: "'Hershey', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "0.1em"
rounded:
  key: "5px"
  reading: "6px"
  tip: "7px"
  row: "9px"
  menu: "14px"
  sheet: "18px"
  player: "20px"
  pill: "999px"
  disc: "50%"
spacing:
  hair: "2px"
  tight: "6px"
  base: "8px"
  bar: "14px"
  fallboard: "18px"
  band: "24px"
  gutter: "clamp(14px, 3vw, 28px)"
  measure: "33rem"
components:
  play-disc:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.disc}"
    size: "30px"
    padding: "7px"
  play-disc-hover:
    backgroundColor: "#000000"
    textColor: "#ffffff"
  player-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.player}"
    padding: "3px 5px"
  view-switch:
    backgroundColor: "{colors.ground-2}"
    rounded: "{rounded.pill}"
    padding: "2px"
  view-switch-option:
    textColor: "{colors.ink-2}"
    typography: "{typography.label-strong}"
    rounded: "{rounded.pill}"
    padding: "5px 11px 6px"
  view-switch-option-chosen:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  pick:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.row}"
    padding: "3px 3px 6px"
  pick-hover:
    backgroundColor: "{colors.ground-2}"
    textColor: "{colors.ink}"
  pick-chosen:
    textColor: "{colors.ink}"
  orchestra-pill:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "34px"
    padding: "0 13px 0 9px"
  orchestra-pill-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  knob:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    width: "58px"
  knob-reading:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.reading}"
    padding: "2px 7px"
  key-white:
    backgroundColor: "{colors.ivory}"
    textColor: "{colors.muted}"
    rounded: "{rounded.key}"
  key-white-sounding:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent}"
  key-black:
    backgroundColor: "{colors.ebony}"
    textColor: "#c3c8cd"
  key-black-sounding:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
  readout:
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    width: "260px"
    height: "60px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.tip}"
    padding: "3px 8px 4px"
  stage-knob:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    rounded: "{rounded.disc}"
    size: "38px"
  pedal:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    width: "48px"
  pedal-held:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ink}"
  menu:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.menu}"
    padding: "5px"
---

# Design System: Instruments

## Overview

**Creative North Star: "Day Studio"**

A north-lit white studio at midday. The instrument stands in it, and the page is the same plaster as the wall. The brief that pins it: a bright, minimal daylight studio; high-key, pale ground, soft north light; the feeling of a quiet photography studio or a modern practice room at midday. Air, space and clarity.

The mood is quiet, bright, exact and unhurried. The instrument is the largest thing on the screen by far. Everything round it is small, pale, round and drawn: discs, pills and hairlines set straight on the wall, with no panel behind them. Daylight has no glows, so state has only two forms. Ink is what is chosen or held. Blue is what sounds.

It rejects two looks. One is the incumbent night bench: a near-black ground, amber glows, a serif readout. The other is the generic SaaS light theme: cards, borders round regions, a tinted accent on every control.

The same room is shown three ways and they keep one grammar. The drawn 2D stage is an opaque object in its daylight materials on the bright field. The vector style is a drawing in graphite on a sheet of drafting film. The 3D stage is a generated daylight room.

**Key Characteristics:**
- One plaster white for wall, floor and page; paper white for what is laid on it.
- Light from the upper left; every shadow falls down and a little right, and is soft.
- Two forms of state: ink for chosen or held, one ultramarine for what sounds.
- Nothing glows, anywhere.
- One sans, light and large for the readout, medium and small for labels.
- Signs are drawn, never typed.
- The stage is nearly wordless; icon-only controls carry a tooltip.

## Colors

A cool, near-neutral palette that leans a breath towards the north light's blue, with one saturated colour kept for sound.

### Primary
- **Ultramarine** (`accent`): what sounds, and only that. A string's shape, a key sounding, a part playing, the place in a piece, a wavefront, a plate's motion, the lamp once the sound runs. On a canvas it is `INK.sound` (the same value as an rgb triplet), used firmly: a 1.5 px line at 0.9, or a wash at 0.10 to 0.18.
- **Ultramarine wash** (`accent-wash`): the face of a white key while its note sounds.

### Secondary
- **Alarm** (`alarm`): a fault, and nothing else. The lamp and its words when the sound fails or stalls. It is the only warm colour in the chrome.
- **Reference slate** (`ref`): the measured thing a model is held against, in charts, and the small prepared-key dot.

### Neutral
- **Plaster** (`ground`): the wall, the floor and the page. `ground-2` is its shade: a hover behind a control, the track of the view switch, the key bed.
- **Paper** (`paper`): what is laid on the plaster: the player, a menu, the phone sheet, a stage knob's disc, the fallboard (with `paper-2` at its foot).
- **Graphite ink** (`ink`): text, and what is chosen or held. `ink-2` is a control at rest and secondary text; `muted` is a label at rest; `faint` is a sign at rest only, never words (3.2:1 on the ground).
- **Rules** (`rule`, `rule-2`): hairlines. The edge of a paper object, a knob's track and ticks, the hairline of the player.
- **Ivory and Ebony** (`ivory`, `ebony`): the keys. Each is the middle of a short gradient that gives the key its bevel; the window is at the left, so a black key's left edge takes the light.

### The vector style's own inks
Scoped to the vector 2D style (`:root[data-style='vector']`), which remaps the neutrals to a sheet of drafting film.
- **Film** (`film`), **Film ink** (`film-ink`), **Film frame** (`film-frame`): the sheet, its graphite, its hairline border.
- **The four leads** (`lead-green`, `lead-red`, `lead-pink`, `lead-deep`): the control slots (`SLOTS` in `ui/vector/kit.ts`). A knob takes a lead, in knob order, and whatever that knob moves on the drawing is drawn in the same lead.

### Canvas materials
Drawn objects keep their own daylight materials, defined beside the drawers (`ui/stage-draw.ts`): `INK` (graphite line, light, sound, bronze, copper, slate, felt, wood, ebony), `BRASS` and `SILVER` (lit, body, shade, deep, edge). They are materials of the object, not chrome colours.

### Named Rules
**The One Plaster Rule.** One white (`ground`) is the wall, the floor and the page. No panel stands behind the bar or the band. What is laid on the ground is paper white and casts a soft shadow down and to the right (the window is up and to the left).

**The Two Forms of State Rule.** Ink is what is chosen or held: the instrument on the stage, the view, a knob's setting, a key pressed, a valve down. Blue is what sounds: a string's shape, a key sounding, a part playing, the place in a piece, a wavefront, a plate's motion. Nothing else is blue.

**The Leads Are a Key Rule.** The vector style's green, red, pink and deep leads tie a knob to the part of the drawing it moves. They are a key, not an accent: never on chrome outside the vector style.

## Typography

**Display and Body Font:** Ysabeau Office Variable (with Avenir Next, Segoe UI, system-ui)
**Mono Font:** Sometype Mono Variable (with ui-monospace, SF Mono, Menlo)
**Plotted Font:** Hershey Simplex, light and medium (the vector style only)

**Character:** One Garamond-boned sans does nearly everything: light and large where the page speaks (the readout, a page's headings), medium and small where it labels. Numerals are lining, and tabular wherever a figure changes in place.

### Hierarchy
- **Display** (300, 40px, 40px line): the readout of what is sounding. It steps down as it has more to say: 34px, then 27px at 350, then 21px at 400, always on the same 40px line box.
- **Headline** (300, clamp(27px, 3vw, 34px), 1.12): a page's section heading on Measurements and Notes.
- **Title** (550, 19px, 1.25): a sub-heading on the two pages.
- **Prose** (450, 17.5px, 1.6): the long read on Notes, in `ink-2`, held to the measure (33rem, about seventy characters of this narrow face).
- **Body** (450, 15px, 1.5): the default.
- **Label** (500, 12px, 1.25): a control's name: an instrument in the picker, a knob, a pedal. `label-strong` (550, 12.5px) is the words inside a switch.
- **Mono** (400, 13.5px, 1.65): code and equations on the Notes page; inline code at 0.82em.
- **Plotted** (500, 11px, uppercase, 0.1em): the vector style's lettering, single-stroke capitals as on a plotted drawing.

### Named Rules
**The One Face Rule.** Ysabeau Office sets the page. Sometype Mono is for code and equations only. Hershey Simplex is the vector style's lettering, a third face used only there and on purpose. A canvas letters in `CANVAS_FONT` (`ui/stage-draw.ts`), never in a face named in a string.

**The Twelve Pixel Rule.** A control's name is never under 12px. Smaller figures exist only as counts and legends beside a sign (a seat count, a key's computer-key letter), never as the name of a control.

## Layout

The window is a column with no scroll on the stage route: the bar, the band, the stage, the fallboard, the keys. Each takes a fixed height (bar 60px on the stage, 40px on the pages; fallboard 62px; keys clamp(118px, 17vh, 168px)) and the stage has the rest. Side gutters are clamp(14px, 3vw, 28px).

The bar is one row: the sixteen instruments by family, families parted by space (8px either side) and not by rules; the Orchestra pill at their end; at the right the piano's kind, the view switch, the lamp and the two pages. The band under it holds what is sounding: the readout in a fixed 260 by 60px box at the left, the spectrum and the scope (or an ensemble's parts) to the right. Neither row has a background. The file player is a small paper pill at the top middle of the stage.

Spacing is small and even: 2px between icons, 6 and 8px inside a control, 14px between the bar's groups, 18px on the fallboard, 24px in the band.

Responsive behaviour is by need, not by a grid:
- **1340px and under** (or a landscape window 500px tall or less): the picker folds to one paper pill that names what is on the stage and opens a sheet, four instruments to a row, every row a family, each cell at least 44px to touch.
- **760px and under**: the phone. The bar is 48px; the keys no longer all fit, and a position strip over them slides the keyboard.
- **A phone held sideways** (500px tall or less, landscape): one slim band.
- **Coarse pointers**: targets grow (the player's buttons to 36px, a stage knob to 44px).

The two pages are a single column to 1120px, prose held to the measure.

## Elevation & Depth

The ground is flat. Depth is paper laid on plaster: an object stands off the wall by one soft directional shadow, never by a border round a region or a darker panel. The light is up and to the left, so every shadow, in CSS, on a canvas and in 3D, falls down and a little right.

### Shadow Vocabulary
- **Resting** (`--shadow-1`: `0.5px 1px 2px rgba(28, 34, 42, 0.14)`): a small paper control on the wall (the octave buttons, the picker's pill).
- **Laid** (`--shadow-2`: `1px 2px 4px rgba(28, 34, 42, 0.06), 3px 10px 24px -10px rgba(28, 34, 42, 0.26)`): the file player.
- **Lifted** (`--shadow-3`: `2px 4px 8px rgba(28, 34, 42, 0.06), 6px 24px 48px -20px rgba(28, 34, 42, 0.34)`): a menu or the phone sheet, open over the stage.
- **Drawn parts** (`drop-shadow(1px 2px 3px rgba(28, 34, 42, 0.26))` and smaller): a stage knob's disc, a knob's cap, a pedal.

### The three stages
- **2D.** One instrument stands in a patch of light the size of the room (`.stage[data-room]::before`: white at 0.66, blurred 26px, placed by the room's knob); no wall is drawn. Every drawn object casts one soft shadow (`floorShadow`: graphite at about 0.32, blur 20 to 26px and offset about 7, 12 for a body the size of a cello), painted once into a cached layer and never blurred per frame.
- **Vector.** No shadows at all (`--shadow-1/2/3: none`). Lines are laid ink over ink (`multiply`), so crossings deepen. A hairline frame runs round the sheet.
- **3D.** The room is generated (`studio()` in `ui/gl/three3d.ts`): white plaster, a skylight, a north window of three bays of four panes, and two black cards low at the room's edge so polished metal has a form. Exposure is a little over one (`DAY.exposure` 1.06); the key's shadow is about 0.6 deep (`DAY.shade` 0.62). The floor comes out the page's own ground at the picture's edges, so the 3D picture meets the page with no step.

### Named Rules
**The Nothing Glows Rule.** No additive compositing, no coloured halo, in CSS, on a canvas or in 3D. Where a glow once said "this is active", ink or blue says it. A struck bar or drumhead in 3D takes a faint cast of the blue while it rings (`ui/gl/ring-glow.ts`): a cast on the material, not a lamp.

**The One Window Rule.** Light comes from the upper left. A shadow that falls any other way, or straight down, is wrong.

## Shapes

Round and soft, with no square chrome outside the vector style. Controls are discs (50%) and pills (999px). Paper objects have generous corners that grow with their size: a reading 6px, a tooltip 7px, a menu row 9px, a menu 14px, the phone sheet 18px, the player 20px. Keys are square at the top and eased at the foot (5px white, 3px black).

Borders are hairlines (1px `rule` or `rule-2`) on a paper object's own edge only. Nothing borders a region of the page. A chosen thing is marked by ink, either as a filled pill or as a short 1.5px rule under its name.

The vector style reverses this on purpose: corners are square (radius 0), nothing is filled, a chip is a hairline frame, and what is chosen is framed in ink (an inset 1.5px line).

### Named Rules
**The Drawn Signs Rule.** Icons and control marks are drawn SVG or CSS shapes (`ui/icons.ts`, `ui/controls.ts`, `ui/stage-knob.ts`), never a character of a font. Lines are 1.1 to 1.5px in the current colour with round caps and joins; an instrument's glyph has its body filled paper.

## Components

Controls are pale, round and drawn. At rest they are quiet (`ink-2` or `muted` on the wall); hover brings them to ink; chosen is ink, filled or ruled. State transitions are 120 to 200ms on `--ease` (`cubic-bezier(0.2, 0.7, 0.2, 1)`); a key and a pedal travel in 40 to 60ms. Under reduced motion every state still changes, at once. Focus is a 2px ink outline, offset 2px.

### The play disc and the player pill
- **Shape:** the player is a paper pill (20px radius, 1px `rule` edge, the Laid shadow) holding 30px round icon buttons and a 2px hairline for the place in the piece.
- **Play:** the one solid thing on the stage: an ink disc with a paper sign. Hover goes to black; pressed, it scales to 0.94.
- **Other buttons:** `ink-2` signs with no ground; hover is ink on a `ground-2` disc.
- **The place:** the hairline is `rule-2`, filled from the left in blue, because the place in a piece is sound.

### The view switch
- **Style:** a `ground-2` pill track with 2px padding; options are words at 12.5px / 550 in `ink-2`.
- **Chosen:** an ink pill with paper text. One of them is always in ink. The piano's kind (grand, upright) is the same control.

### The instrument pick
- **Style:** a drawn glyph (30px, line in the current colour, body filled paper) over its name at 12px / 500, `muted` at rest, 9px radius.
- **Hover:** ink on `ground-2`.
- **Chosen:** ink, with a 1.5px ink rule under the name. In an orchestra every instrument seated is inked and the rule is dropped; a count sits at the glyph's corner.
- **Folded:** on the phone sheet a cell is 12px radius and the chosen one sits on `ground-2`.

### The orchestra pill
- **Style:** 34px tall, a 1px `rule-2` outline, its drawn sign and its word in `ink-2`. It is a mode, not a seventeenth instrument, so it is shaped differently from a pick.
- **On:** filled ink with paper text.

### The rotary knob
- **Style:** a 38px pale dial: a white cap with a hairline edge and a small drop shadow, a `rule` track, ticks in `rule-2`.
- **Setting:** an arc of ink and an ink pointer on the cap. Its name sits under it at 12px / 500, `muted`.
- **Hover, turning, focus:** the cap's edge and the name go to ink, and the reading stands over the dial as a small ink label (6px radius, paper text, tabular figures).

### The stage knob
- **Style:** the same dial on a paper disc (38px, 44px to touch) that stands off the instrument by its shadow. No word: a drawn sign on the cap says which it is (a lid ajar; a wave from a wall).
- **Hover, dragging, focus:** the disc's edge and the sign go to ink.

### The piano key
- **White:** ivory in a short vertical gradient, a darker left edge and a white right edge, a 5px lip at the foot and a small shadow.
- **Black:** ebony, its left edge lit and its right edge in its own shade.
- **Pressed:** it goes down 2px and loses its lip and shadow. This is the key held, and it stays its own colour.
- **Sounding:** a white key takes the blue wash; a black key becomes the blue. Its legend goes blue (white on a black key).
- **Out of compass:** flat and grey, plainly not to be played.

### The pedal
- **Style:** a drawn foot, paper with an `ink-2` outline, its name under it at 12px / 500.
- **Held:** the foot fills with ink, moves down by up to 3px and its name goes to ink.

### The readout
- **Style:** 40px / 300 in ink, with a 12.5px / 500 line under it in `ink-2` (tabular). It keeps its 260 by 60px box whatever it says, so nothing under it moves.
- **Idle:** what was last heard, dimmed to 0.36 over 300ms.
- **Vector style:** the notes are the sound, so the readout is set in the blue.

### The tooltip
- **Style:** a name in ink, as small as it can be read: paper text at 12.5px / 500 on an ink label, 7px radius. Every icon-only control has one.

### Menus and the sheet
- **Style:** paper, a 1px `rule` edge, 14px radius (the phone sheet 18px), the Lifted shadow. Rows are 9px radius; hover is `ground-2`; the chosen row is ink.

### The lamp
- **Style:** a 9px ring in `ink-2` while there is no sound; filled blue once it runs; filled Alarm on a fault. It pulses only while the sound is starting.

## Do's and Don'ts

### Do:
- **Do** keep one plaster white (`ground`) as wall, floor and page, and set the bar and the band straight on it.
- **Do** lay anything that floats (the player, a menu, a sheet, a stage knob) on paper white with one of the three shadows, falling down and to the right.
- **Do** mark what is chosen or held in ink: a filled ink pill, a 1.5px ink rule, an ink arc, an ink outline.
- **Do** keep the blue for what sounds, and use it firmly where it is used.
- **Do** draw every sign as SVG or a CSS shape (`ui/icons.ts`, `ui/controls.ts`, `ui/stage-knob.ts`) and give an icon-only control a tooltip and an `aria-label`.
- **Do** set control names at 12px or more, weight 500, and figures that change in tabular numerals.
- **Do** paint a drawn object's floor shadow once, into its cached layer.
- **Do** give pale materials (silver, ivory, a drumhead, bow hair) a graphite hairline or a shade side so they stand off the pale ground.
- **Do** letter a canvas in `CANVAS_FONT`.

### Don't:
- **Don't** bring back the night bench: a near-black ground, amber glows, a serif readout.
- **Don't** build a generic SaaS light theme: cards, borders round regions, a tinted accent on every control.
- **Don't** put a panel, a fill or a rule behind the bar or the band.
- **Don't** use blue for a mechanical state (a key held, a valve down, a view chosen), for decoration, or for a link.
- **Don't** make anything glow: no additive compositing (`'lighter'`, `'screen'`), no coloured `shadowBlur` halo, no bloom, in CSS, on a canvas or in 3D.
- **Don't** use a character of a font as an icon or a control mark.
- **Don't** use the vector style's leads (green, red, pink, deep) on chrome outside the vector style.
- **Don't** use the Alarm colour for anything but a fault.
- **Don't** use Sometype Mono outside code and equations, or Hershey outside the vector style.
- **Don't** add permanent explanatory words to the stage.
