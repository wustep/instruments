---
name: Instruments
description: Evening Hall. Sixteen modelled instruments on a lit stage in a dark, warm concert hall; the chrome is the hall's printed matter.
colors:
  hall-ground: "#140a0b"
  hall-raised: "#1e1112"
  hall-raised-2: "#2b191a"
  hall-rule: "#301c1b"
  hall-rule-2: "#4a322b"
  hall-ink: "#f1e7d3"
  hall-ink-2: "#d3c5ab"
  hall-muted: "#a8977f"
  velvet: "#3b0f19"
  velvet-hi: "#4f1522"
  velvet-lo: "#27090f"
  lacquer: "#0c0707"
  felt: "#6b1826"
  ivory: "#f3ecdc"
  light: "#ecbb62"
  light-ink: "#1c1009"
  gilt: "#c9a253"
  gilt-hi: "#f4dfa6"
  gilt-lo: "#8a6a2c"
  verdigris: "#8fbfae"
  alarm: "#ee6a5f"
  paper: "#f2e9d6"
  paper-2: "#e9dec7"
  paper-3: "#ddd0b4"
  paper-hi: "#fbf6e8"
  paper-rule: "#dccfb3"
  paper-rule-2: "#bcab8b"
  paper-ink: "#2a1a14"
  paper-ink-2: "#4b382c"
  paper-muted: "#6c594a"
  claret: "#8c1c2b"
  claret-lit: "#b3202f"
  paper-verdigris: "#2a6a5e"
  plate-ground: "#0b0405"
  plate-line: "#e8dec8"
  plate-line-mid: "#b3a68c"
  plate-frame: "#5c4a2a"
  plate-sound: "#ffbe55"
  shadow: "#000000"
  pool-light: "#ffd696"
  hall-muted-lit: "#bdad94"
  alarm-ink: "#ffb3a8"
  lamp-hi: "#fff6dc"
  lamp-lo: "#7a5417"
  lacquer-sheen: "#ffe8be"
  pedal-brass: "#b08a3e"
  brass-shine: "#fff6d6"
  knob: "#24130f"
  knob-hi: "#3a2018"
  key-pressed: "#c9bb9f"
  key-lit: "#fbe6b4"
  key-lit-2: "#fdf0cf"
  ebony-lit: "#4b3312"
  ebony-lit-2: "#6a4a1b"
  key-wings-edge: "#2f2721"
  key-wings-legend: "#8f8170"
  strip-on: "#e0871a"
  paper-sheen: "#fffcf0"
  ochre: "#b0761c"
  plate-wash: "#781a2c"
typography:
  display:
    fontFamily: "'Libre Caslon Display', 'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "37px"
    fontWeight: 400
    lineHeight: "38px"
    letterSpacing: "0"
  headline:
    fontFamily: "'Libre Caslon Display', 'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "clamp(27px, 3.2vw, 36px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "0"
  title:
    fontFamily: "'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.28
  body:
    fontFamily: "'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.62
  direction:
    fontFamily: "'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0"
  label:
    fontFamily: "'Cabin Variable', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.07em"
  figures:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
  plate:
    fontFamily: "'Hershey', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.12em"
  accidental:
    fontFamily: "'Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'DejaVu Sans', sans-serif"
    fontSize: "0.7em"
    fontWeight: 400
    lineHeight: 1
  ui:
    fontFamily: "'Cabin Variable', 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  readout-2:
    fontFamily: "'Libre Caslon Display', 'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "31px"
    fontWeight: 400
    lineHeight: 1.23
  readout-3:
    fontFamily: "'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "23px"
    fontWeight: 400
    lineHeight: 1.65
  readout-phone-2:
    fontFamily: "'Libre Caslon Display', 'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.17
  readout-landscape:
    fontFamily: "'Libre Caslon Display', 'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.24
  readout-landscape-3:
    fontFamily: "'Libre Caslon Text', 'Big Caslon', 'Book Antiqua', Palatino, Georgia, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  plate: "0px"
  paper: "2px"
  control: "3px"
  button: "4px"
  player: "5px"
spacing:
  gutter: "clamp(14px, 3vw, 28px)"
  rail-gap: "8px"
  fallboard-gap: "18px"
  band-gap: "24px"
  measure: "34rem"
components:
  rail:
    backgroundColor: "{colors.velvet}"
    textColor: "{colors.hall-ink}"
    typography: "{typography.label}"
    height: "60px"
    padding: "0 clamp(14px, 3vw, 28px)"
  pick:
    textColor: "{colors.hall-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "3px 2px 5px"
  pick-chosen:
    textColor: "{colors.hall-ink}"
  view-option:
    textColor: "{colors.hall-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.paper}"
    padding: "8px 6px 9px"
  view-option-chosen:
    textColor: "{colors.gilt-hi}"
  page-link:
    textColor: "{colors.hall-ink}"
    typography: "{typography.direction}"
    rounded: "{rounded.control}"
    padding: "8px 5px"
  readout:
    textColor: "{colors.hall-ink}"
    typography: "{typography.display}"
    width: "250px"
    height: "58px"
  fallboard:
    backgroundColor: "{colors.lacquer}"
    textColor: "{colors.hall-muted}"
    typography: "{typography.label}"
    height: "62px"
  paper-menu:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.paper}"
    padding: "8px"
  paper-menu-chosen:
    textColor: "{colors.claret}"
  tooltip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.direction}"
    rounded: "{rounded.paper}"
    padding: "4px 9px 5px"
  reading-page:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.paper}"
---

# Design System: Instruments

## Overview

**Creative North Star: "Evening Hall"**

A warm concert hall at night. The instrument stands on a stage under one spot; the house beyond is dark and warm (wood, velvet, gold, a soft falloff into the hall). Everything on the page is one of three materials, and each has one job. The hall is what stays: a claret-black ground, a garnet velvet rail across the top, black lacquer and a strip of red felt over ivory keys. The light is what is chosen or sounding: one warm gold. Paper is what opens: ivory programme stock with sepia ink and a printer's claret, for menus, tooltips, the sheet music and the two reading pages. The chrome reads as a hall programme or a well-printed ticket: Caslon speaks, Cabin capitals label, italics are stage directions.

The system is built as one token set at the top of `src/styles.css`. Paper is a scope that re-points the same variables in ink, so a menu needs no second set of rules; the vector display (the 2D stage's engraved style) re-points them again as an engraver's plate. The stage itself stays nearly wordless: icon-only controls carry a tooltip and an `aria-label`, never a visible caption.

Before the first sound the stage waits in a low light, and the light comes up with the sound while a shade comes down over the rail. Light fades; nothing slides. The instruments' own drawings and 3D models (wood, brass, silver, varnish) are product content and are not part of this system.

**Key Characteristics:**
- Three materials, one job each: the hall stays, the light marks, paper opens.
- One accent per ground: gold on the hall, claret on paper. Verdigris is the one cool colour and means "ideal / reference".
- Chosen things are lit (gold ink, a 1.5 px rule), not filled.
- Serif for what is said, tracked Cabin capitals for what is labelled, italic for what is a direction.
- Depth is light and material: gradients on velvet and lacquer, soft dark shadows under paper, a vignette for the house.
- One signature motion: the light comes up with the first sound (1.4 s), and is absent under reduced motion.

## Colors

A dark, warm hall (claret-black, garnet, brass) with one gold light, and an ivory paper world for whatever opens.

### Primary
- **Stage Light** (`light`, CSS `--on`): the chosen instrument's rule, the chosen view's rule, the focus outline, the lit lamp, the play button's ring at rest, a pressed pedal's name, counts on the picker. It is the only saturated colour on the hall.
- **Gilt** (`gilt`, `gilt-hi`, `gilt-lo`): brass as a material. The rail's double rule, the unlit lamp's ring, hairline frames at 30–45 % alpha, a chosen glyph's stroke and the chosen view's ink (`gilt-hi`), the lamp's italic hint (`gilt-hi`).

### Secondary
- **Claret** (`claret`): on paper only, the printer's second colour. It takes over `--on` inside the paper scope: the chosen instrument in the programme sheet, a line's chosen instrument, section labels on Notes, the focus outline on paper, hot strokes in diagrams. What *sounds* on paper is the same claret in the light (`claret-lit`, the paper scope's `--sound-rgb`): the notes sounding in the sheet music and its hairline. One claret, lit or not; the sheet has no colours of its own.
- **A slip of paper** (`paper-hi`, `--paper-hi`): a lighter leaf lying on a leaf, for the chart's tooltip and the sheet's list of parts. It floats on a shadow, with no border, as all paper does.
- **Materials that are their own colour**: the things on the page that are objects keep a few colours of their own, each used in one place. The lamp's glass when lit (`lamp-hi` to `lamp-lo`); the fallboard's sheen (`lacquer-sheen` at 7 %); the pedals' brass and its shine (`pedal-brass`, `brass-shine`); a knob's cap of dark wood (`knob`, `knob-hi` under the hand); the keys (a pressed key's top `key-pressed`, a sounding key in the light `key-lit` / `key-lit-2`, a sounding black key `ebony-lit` / `ebony-lit-2`, a key past the compass `key-wings-edge` with its legend `key-wings-legend`, a sounding key in the position strip `strip-on`); paper's sheen (`paper-sheen`); the ochre of a warm stroke in a diagram (`ochre`); the claret wash through the vector plate (`plate-wash`). On the 404, where muted words lie over lit boards, they are a step lighter (`hall-muted-lit`); a failure's words on the velvet are `alarm-ink`. Shadows are black (`shadow`) and the pool's light is `pool-light`, both only ever at an alpha.

### Tertiary
- **Verdigris** (`verdigris` on the hall, `paper-verdigris` on paper): "ideal / reference" in charts and in the 2D drawers' cool half of a wave. Nothing else is cool.

### Neutral
- **Claret-Black** (`hall-ground`): the page, the house, the stage's dark. Also the `theme-color`'s neighbour: the browser bar takes `velvet`.
- **Raised hall tones** (`hall-raised`, `hall-raised-2`, `hall-rule`, `hall-rule-2`): rare panels and hairlines on the dark.
- **Garnet Velvet** (`velvet-hi` → `velvet` → `velvet-lo`): the rail, as a vertical gradient.
- **Lacquer, Felt, Ivory** (`lacquer`, `felt`, `ivory`): the fallboard, the 3 px strip under it, the white keys. The keys' own gradients are literal material colours, not tokens.
- **Hall inks** (`hall-ink`, `hall-ink-2`, `hall-muted`): warm ivory text on the dark; names on the velvet sit at 68–80 % of `hall-ink` until hovered or chosen.
- **Programme Paper** (`paper`, `paper-2`, `paper-3`, `paper-rule`, `paper-rule-2`): everything that opens, and the reading pages.
- **Sepia inks** (`paper-ink`, `paper-ink-2`, `paper-muted`): text on paper.
- **Alarm** (`alarm`): the lamp when sound has failed or stalled. Nothing else.
- **The plate** (`plate-ground`, `plate-line`, `plate-line-mid`, `plate-frame`, `plate-sound`): the vector display's own scope: fine ivory lines on a darker claret-black, dark-gilt hairline frames, gold for what sounds.

### Named Rules
**The Three Materials Rule.** Hall, light, paper. A new surface is one of them: if it stays it is hall, if it marks a choice or a sound it is light, if it opens it is paper. There is no fourth.

**The Paper Scope Rule.** Paper is not a second stylesheet. It re-points `--paper`, `--ink`, `--muted`, `--rule`, `--on`, `--ref` on the surface that opens (`.score-menu`, `.pl-menu`, `.pl-grid`, `.sheet-menu`, `.tip`, the non-stage `.view`, and `.picker-pop` in the compact layout). A component written against the variables works on both grounds.

**The Failure Red Rule.** On the dark hall, red means the sound failed (`alarm`, on the lamp). The velvet and felt are dark garnet materials, not signals. On paper, claret is ink.

**The One Cool Colour Rule.** Verdigris means "ideal / reference" and is used for nothing else.

## Typography

**Display Font:** Libre Caslon Display (with Libre Caslon Text, Big Caslon, Book Antiqua, Palatino, Georgia)
**Body Font:** Libre Caslon Text, roman and italic (same fallbacks)
**Label Font:** Cabin Variable, with its width axis (with Gill Sans, Calibri, Trebuchet MS)
**Figures:** the system monospace (`--mono`), only where digits must line up
**Plate Font:** Hershey Simplex (AVHershey, light and medium), only in the vector display

**Accidentals:** the readout's ♭ and ♯ are signs beside their letters, not letters: Caslon has neither, so they are set at 0.7em in the system's symbol face ('Apple Symbols', 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'DejaVu Sans'). Nothing else on the page uses those faces.

**Character:** A printed programme. A high-contrast Caslon display for the one large thing on the page, a sturdy text Caslon for prose, and a humanist sans condensed and tracked into small capitals for every label.

### Hierarchy
- **Display** (400, 37px / 38px): the readout's note name. It steps down as it has more to say (31px in the display face, then 23px and 17.5px in the text face, where the display's hairlines are too fine); the line box stays 38px so nothing under it moves. Also the 404's word (`clamp(72px, 19vw, 128px)`, upright).
- **Headline** (400, `clamp(27px, 3.2vw, 36px)` / 1.12, balanced): page titles on paper; Notes' section heads are 33px / 1.15.
- **Title** (Caslon Text 400, 19px / 1.28): sub-heads in prose; a piece's or a part's name (17px, or italic 15px).
- **Body** (Caslon Text 400, 17px / 1.62, measure 34rem, `text-wrap: pretty`): Notes and Measurements prose, in `paper-ink-2`.
- **Direction** (Caslon Text italic 400, 13–15px / 1.2–1.5): the lamp's hint, tooltips, the pages' links on the rail, a part's name over its sheet, figure captions.
- **Label** (Cabin 500–600, 11–12px, uppercase, tracking 0.05–0.11em, `font-stretch` 75–88 %): instrument names (11px, 76 %, 0.04em), the view switch (11px, 0.07em), pedal and knob names (11px, 86 %, 0.07em), section labels on paper (600, 12px, 0.11em, claret). Never under 11px.
- **Figures** (monospace, 12px): table cells of numbers on Measurements; also `code` and the equations on Notes.

### Named Rules
**The Stage Direction Rule.** Italic is for words that tell the visitor what to do or what a thing is: the lamp's "tap a key", a tooltip, the links to the two pages, a caption. It is never emphasis inside a label.

**The Capitals Floor Rule.** Cabin labels are uppercase, tracked, and 11px or larger. Narrow places are solved with the width axis (down to 75 %), not with a smaller size.

**The Columns Rule.** Cabin has no tabular figures. A column of numbers is set in `--mono`; body text and labels never are.

**The Plate Letter Rule.** Hershey appears only inside `:root[data-style='vector']`, where it replaces every family at once.

## Layout

The stage route is a full-window column with no page scroll: the rail, the band, the stage, the fallboard, the keys.

- **The rail** (`--top-h`): 60px on the stage, 38px on Notes and Measurements, 44px at 760px and under, 30px in a short landscape window. The sixteen instruments sit on it by family; at the far end the piano's kind, the view (2D, vector, 3D) and the two pages.
- **The band** under it: the readout in a fixed 250 × 58px box (it dims to 0.45 when nothing sounds and never changes size), then the spectrum and the scope or an ensemble's parts, 24px apart.
- **The stage** takes what is left. The file player floats at its top middle, as wide as its contents.
- **The dock**: the fallboard (`--fall-h` 62px; 54px on a phone; 40px short landscape) over the keys (`--kbd-h` `clamp(118px, 17vh, 168px)`; 150px on a phone; 96px short landscape).
- **Gutter**: `clamp(14px, 3vw, 28px)` at both ends of the rail, the band and the fallboard.
- **Reading pages**: one sheet of paper, max 1120px, padded `clamp(24px, 5vw, 64px)` by `clamp(18px, 5.5vw, 76px)`, prose at a 34rem measure, on the dark ground.

Responsive behaviour is structural, not fluid. Under 1500px the rail tightens; at 1340px and under (and in a short landscape window) the instruments fold into one button that opens the programme sheet: paper, 372px wide at most, four to a row and every row a family. At 760px and under the view switch and the piano's toggle leave the rail for a hairline track over the stage. Nothing over or under the stage may widen the page; there is no sideways scroll from 320px up.

## Elevation & Depth

Depth is light and material, not a shadow scale. The hall is layered by darkness: the house falls away to claret-black in a vignette over the 2D stage, the rail casts 16px of shadow onto the stage, the fallboard throws one upward. Material surfaces carry their own gradients (velvet top to bottom, a faint warm sheen on lacquer, the keys' ivory). Paper is the only thing that floats, and it floats with a soft, deep, neutral-dark shadow and a 1px light edge at its top, never with a border.

### Shadow Vocabulary
- **Rail rule** (two 1px lines drawn at the foot of the velvet, `rgba(201,162,83,.85)` at the bottom and `rgba(201,162,83,.3)` 3px above it, as background layers): the programme's rule in gilt. Not a shadow and not a border.
- **Paper, opened** (`inset 0 1px 0 rgba(255,255,255,.6), 0 2px 5px rgba(0,0,0,.45), 0 20px 44px -12px rgba(0,0,0,.8)`): menus and the programme sheet. The reading page uses the same shape, larger (`0 28px 60px -20px`).
- **Paper slip** (`0 1px 2px rgba(0,0,0,.5), 0 8px 18px -5px rgba(0,0,0,.75)`): the tooltip.
- **Smoked glass** (`inset 0 0 0 1px rgba(201,162,83,.3), 0 8px 20px -8px rgba(0,0,0,.8)` on `rgba(12,6,6,.74)` with a 6px blur): the file player once a file is loaded. A hairline of gilt, not a border.
- **Lamp glow** (`0 0 9px 1px rgba(236,187,98,.55)`): the lit lamp. Glow belongs to things that are lit: a chosen glyph takes `drop-shadow(0 0 5px rgba(236,187,98,.5))`.
- **Key seat** (`inset 0 -5px 0 #cdbfa6, 0 2px 0 #000`): a white key's front edge; a sounding key swaps it for an inner amber glow.

### Named Rules
**The Light Comes Up Rule.** Before the first sound the stage waits low: in 2D the pool and boards at 0.42 opacity and the drawing at `brightness(0.7) saturate(0.88)`; in 3D the spot, pool, beam and curtain at 0.5. With the sound they rise (1.4s on `cubic-bezier(0.16, 1, 0.3, 1)` in CSS; a 0.45s time constant in 3D) and a shade (`rgba(8,2,4,.34)`) comes down over the velvet. Only opacity, filter and light intensity change. Under reduced motion the change is immediate and the lamp does not breathe.

**The One Spot Rule.** The 3D stage has one warm key light from above and in front (4.1), a thin gold back light (0.9), and the boards' own bounce from below (0.34). No other fill. Its reflections come from a dark hall with one lantern; boards are drawn in the floor shader, the velvet curtain and the spot's beam in the final pass, under Khronos neutral tone mapping.

**The Light Fades Rule.** Controls change colour in 120–150ms; the hall's light takes 1.4s. Nothing translates, slides or scales into place. The exceptions are physical: a key or a pedal travels 2–4px under the finger in 40–60ms.

## Shapes

Printed and square. Paper is cut at 2px; controls on the hall are 2–3px (`--radius` is 3px); framed buttons in the compact layout and the close-up's panel are 4px; the player's smoked box is 5px; keys are square at the top and 3–4px at their feet. Circles are for things that are round in the hall: the lamp, the play button's ring, the back button, the routing grid's cells. The vector display sets every radius to 0.

Lines are hairlines: 1px gilt at 30–45 % for frames on the dark, 1px `paper-rule` on paper, and one weight of emphasis, the 1.5px rule (the chosen mark, the focus outline, the icon pen). The boards of the 2D stage are a drawn tile of planks, 38px wide, each its own length and tone, shown only where the spot's pool falls.

Icons are drawn, never characters. The chrome's set is one pen: 1.5px at a 16px box, round caps and joins, `currentColor` (`ui/dom.ts` `icon`). Instrument glyphs are line drawings too, at a finer 1.1px pen in a 32–36px box. The file player's transport icons (play, pause, stop, the folder) are solid shapes on a 24px box.

## Components

### The rail
- **Character:** the hall's velvet rail, with the programme's gilt rule under it.
- **Style:** a vertical gradient `velvet-hi` → `velvet` (42 %) → `velvet-lo`, the rail rule beneath, 16px of shadow onto the stage. Cabin 12px, tracking 0.04em, text at 68 % of `hall-ink`.
- **State:** once sound runs on the stage route, a shade fades in over the velvet (1.4s); what stands on the rail keeps its brightness.

### Instrument pick
- **Shape:** a glyph (32px) over its name, 3px radius, at least 36px wide.
- **Default / Hover:** 68 % ivory; hover takes full `hall-ink` and a 6 % ivory wash (150ms).
- **Chosen:** full ivory name, the glyph stroked `gilt-hi` with a soft gold glow, a small pool of warm light behind it, and a 1.5px `light` rule under the name. No fill, no frame. An orchestra lights each instrument it has, with a gold count for two or more.
- **Focus:** a 1.5px `light` outline, drawn inside the box (offset −1.5px) because the picker sits against the rail's edges.

### View switch and piano kind
- **Style:** words in Cabin capitals (500, 11px, 0.07em), 72 % ivory, no track on the rail. Where the piano's kinds stand beside the view, a gilt hairline after them keeps the two choices apart.
- **Chosen:** `gilt-hi` ink and a 1.5px `light` rule under the word.
- **Phone:** over the stage instead of on the rail, on a hairline track (`rgba(12,6,6,.7)`, 1px gilt at 30 %, 3px radius).

### Page links and the lamp
- **Links:** two words in Caslon italic 13.5px at 80 % ivory; the current page is underlined with a 1.5px inset `light` rule.
- **Lamp:** a 9px circle. Unlit: a gilt ring breathing (2.4s; 0.6s while starting). Lit: a small gold sphere with a glow. Failed: `alarm`, still. Its hint is Caslon italic 13.5px in `gilt-hi`, on one line, two, or absent, never cut short.

### Readout
- A fixed 250 × 58px box: the note in the display face (37px) over a Cabin line (12px, `hall-muted`) for its frequency or chord. It dims to 0.45 when let go and keeps what was last heard.

### Fallboard, pedals, knobs, keys
- **Fallboard:** `lacquer` with a faint warm sheen at the top, a 1px gilt line at 42 % where it is hinged, a 3px `felt` strip at its foot.
- **Pedals:** small brass feet that travel 4px when pressed; names in Cabin capitals, `hall-muted`, `light` when down.
- **Keys:** ivory and ebony gradients. Pressed: 2px down. Sounding: in the light (a warm gold face on white, an amber inner glow on black). Out of the instrument's compass: in the wings, dark and flat.

### Player
- **At rest:** no box. Solid icons over the stage (28px buttons, `hall-ink-2`, `light` on hover); the play button is `light` and wears a 1.2px ring of it.
- **Loaded:** the smoked-glass box (5px radius, gilt hairline, 6px blur) with the same icon buttons and a hairline for the place.

### Paper: menus, the programme sheet, the tooltip
- **Corner Style:** 2px. **Background:** `paper`, with the opened-paper shadow and no border.
- **Rows:** `paper-ink-2` text; hover is an 8 % ink wash and full `paper-ink`. A piece's row is a label in capitals (600, 12px, 0.11em) over an italic line.
- **Chosen:** claret ink and stroke, and where there is a word, the 1.5px claret rule.
- **Tooltip:** a slip of the same paper, Caslon italic 13px, 4px 9px 5px.

### Reading page and sheet music
- **Reading page:** one sheet (2px corners, a pale sheen fading over its top 260px) on the dark ground. Notes opens with a short thick-and-thin rule in ink; section heads in the display face; sub-heads as claret capitals; captions in italic.
- **Sheet music:** ivory paper and warm ink, the notes sounding and the place heard lit in a second ink; in the vector display it becomes plate lines with gold.

### The vector display
- The same chrome as an engraver's plate: `plate-ground`, hairline frames in `plate-frame`, Hershey capitals at 0.1–0.12em, radius 0, the chosen one bright with its rule, the readout in `plate-sound`. Knobs take one of four slot colours set by the drawing (`ui/vector/kit.ts` `SLOTS`). The velvet rail stays over it.

## Do's and Don'ts

### Do:
- **Do** decide the material first: hall for what stays, light for what is chosen or sounding, paper for what opens.
- **Do** mark a chosen thing by lighting it: gold ink (`gilt-hi`) and a 1.5px `light` rule on the hall; claret ink and rule on paper.
- **Do** write new surfaces against the variables (`--paper`, `--ink`, `--muted`, `--rule`, `--on`) so the paper scope and the vector scope re-point them.
- **Do** set labels in Cabin capitals at 11px or more, tracked 0.05–0.11em, and narrow them with `font-stretch` (75–88 %) when space is short.
- **Do** set words that instruct or name (hints, tooltips, captions, the two page links) in Libre Caslon Text italic.
- **Do** set columns of numbers in `--mono`.
- **Do** give every icon-only control a `data-tip` and an `aria-label`, and draw its icon (the chrome's 1.5px pen at 16px).
- **Do** float paper with the soft dark shadow and its 1px light top edge, at a 2px corner.
- **Do** keep transitions to colour, opacity, filter and light: 120–150ms for controls, 1.4s on `--ease-light` for the hall, and none of it under `prefers-reduced-motion`.
- **Do** keep the readout's box, the rail's height and the dock's heights fixed while sound changes what they say.

### Don't:
- **Don't** add a fourth material, a second accent on either ground, or a second cool colour.
- **Don't** fill a chosen control on the rail with a pill, a chip or a tinted box.
- **Don't** use red on the dark hall for anything but a failure of the sound.
- **Don't** use monospace for labels or prose, or Hershey outside the vector display.
- **Don't** use Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young Serif, Bodoni, Geist or Syne (the repo's own ban, checked by grep).
- **Don't** use a character as an icon.
- **Don't** add permanent explanatory text to the stage.
- **Don't** slide, scale or bounce anything into place; the hall's light fades.
- **Don't** light the stage in 3D with a second fill, or put a border round paper.
- **Don't** treat the instruments' own colours (wood, brass, silver, varnish) as chrome tokens; they are the product's drawings.
