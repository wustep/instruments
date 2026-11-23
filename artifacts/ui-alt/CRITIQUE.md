# Critique of the current UI (main = production, 977d621)

`/impeccable critique` (Impeccable 4.10.0, project-local), 2026-11-22/23, before any redesign work on this branch.

Method: dual-agent. Assessment A (design review, against the skill's rubric, from the 18 production screenshots in
`shots/before-*.png`, the CSS and source, and one browser tab) and Assessment B (the bundled detector on the sources
and on seven rendered pages, plus the in-page overlay) ran as two isolated sub-agents. B's findings were read only
after A had finished.

## Synthesis

**Score: 27/40, Acceptable** (one point under Good; all ten heuristics apply).

The simulation is the interface and that part is excellent: every moving line is system status. The shell and the 3D
room are well-made defaults: warm near-black, cream ink, an italic display serif over tiny lowercase mono, one orange
accent; a dark product studio with warm key, cool rim and a spot pool. Remove the instruments and the frame could front
an unrelated product. The detector agrees with the review's "small, dim, dark on dark" in numbers: 57 functional labels
under the 11 px floor, key names at 2.0:1, 108 over-long lines in Notes. It cannot see the stage (a canvas, about 69 %
of the viewport), so nothing it says is about the instrument, the stage knobs or the 3D world.

Priority issues, in order:

1. **[P1] "Wordless" means "unlabelled" on a phone.** Tooltips ignore touch; the lid and the room are the same dial
   twice. Make each control say what it is by its form.
2. **[P1] Small, dim, dark on dark.** 10–11 px chrome, key names at 2.0:1, 25 px view switch and 26×30 octave buttons
   on a phone. An 11–12 px floor, 4.5:1 key names, 44 px touch targets.
3. **[P1] The Orchestra shows one lineup four times** (picker, band, player, fallboard: about 67 targets). Outside this
   branch's brief; left as a follow-up.
4. **[P2] The 3D world is a generic studio that fails its flagship.** The black grand merges with the backdrop; no
   horizon; the timpani heads dominate. Give the world a place: a wall plane, a floor line, something lighter for
   lacquer to sit against and reflect.
5. **[P2] Arrival and "what plays?"** A blank band at idle, a pulsing red dot that reads as an error, a pieces menu
   that leads with the composer over the title.

What this branch (Night Gallery) takes from it: a replacement world, type and palette (the shell's borrowed identity,
issue 4); a label floor of 11 px and key names that pass 4.5:1 (issue 2); stage knobs that say what they move, a lamp
that does not read as an error, a pieces menu led by its titles (issues 1 and 5). The Orchestra's four rows (issue 3)
and touch tooltips are listed in `STATUS.md` as left for a follow-up.

Questions skipped: the brief (`BRIEF.md`) already fixes priority, intent, scope and constraints.

---

# Assessment A: design review of `instruments` (incumbent UI)

**Method.** Read the rubric, all 18 production screenshots, the CSS (`styles.css`, `panel.css`, `vector.css`, `not-found.css`), and the relevant source (`three3d.ts` `studio()` and lights, `stage-draw.ts` `INK`, `vector/kit.ts`, `ui/tip.ts`, `ui/player.ts`, `views/stage.ts`, `main.ts`). Opened one browser tab on `http://127.0.0.1:5393` for a handful of states at 1440×900 and 390×844: idle piano, pieces menu (desktop and phone), room-knob tooltip, `/symphony` with the sheet on, horn 3D phone with the knob panel open, Measurements phone. No detector was run and nothing under `.impeccable/` was read.

Caveats: the browser tab was a desktop Chromium resized to 390 px, not a touch device, so coarse-pointer sizes come from the CSS and the production phone screenshots. Error states (a failed audio start, a bad MIDI file) were read from source, not triggered. My extra screenshots are in `the session scratchpad (not kept)`.

---

## 1. Design-specificity verdict

Split. What is on the stage could belong to nothing else: plan drawings whose every moving line is read from the audio thread, strings bowing out in vermilion, sand gathering on the soundboard's nodal lines, a readout that names the chord, sixteen line-drawn glyphs grouped by orchestral family, a lid that rests on its two sticks, a 404 that says *Tacet*.

The frame around it is the least specific thing in the product. Warm near-black, cream ink, one italic display serif for the hero figure, lowercase 10 px mono micro-labels, one orange accent plus amber, hairline chips with 4 px radii: take the instruments out and that shell fronts a watch brand, a coffee roaster or an audio plug-in unchanged. It is the current default of tasteful dark editorial, with Newsreader and IBM Plex standing in for the faces the repo itself bans.

The 3D look repeats the problem. A dark studio void with a warm key, a cool rim and a spot pool is how every configurator shows a thing for sale.

The product also has three identities, not one: a sepia bench with skeuomorphic lacquer and brass, a WarGames CRT that `vector/kit.ts` says is taken from another synth's UI, and a product shot. Each is well executed and none is the product's own. Content: specific. World: borrowed.

### Surface by surface

| Surface | Read |
|---|---|
| Top bar | 60 px, 25–26 clickable things on a solo piano, all 10–11 px mono in `#8a8172`. It recedes as intended, but nothing in it is primary. The right cluster moves: about 60–80 px when "tap a key" disappears on the first note, and 37 px when the 3D-only "inside" toggle appears. |
| Band (readout, spectrum, scope) | The readout is the best type in the app. At load the whole band is blank except the floating axis labels "100 1k 10k". The scope caption ("C3 · 0.38 m/s · 2.8 N · 4.6 ms") is honest data in 10 px. |
| Picker, desktop | Glyph plus name, families split by hairlines (2/4/4/4/2), amber underline and glow for the current one. Clear. "bass" and "glock" are abbreviated; the families have no names, visible or accessible. |
| Picker, phone sheet | The best phone surface: 4×4, one family per row, ~86×60 targets, piano kind at the foot. It drops from the top of the screen, so it is a thumb stretch. |
| View switch | "2d / vector / 3d" mixes dimension with style (vector is also 2D). Selected is a filled ivory chip; the picker's selected is an amber underline; the links' current is an amber underline. 21 px tall on desktop, 25 px on a phone. |
| Orchestra controls | The weak point. See P1-2. |
| File player and pieces menu | Three bare icons on a blurred pill, top centre, over the instrument: in 2D they sit on the piano's rim line. The pieces menu is 11 flat rows in 220–230 px. See P2-5. |
| Keyboard and fallboard | Skeuomorphic and good at it: ivory gradients, pressed keys travel 2 px, out-of-range keys greyed. The fallboard mixes bevelled brass octave buttons, pedal-shaped buttons and amber-arc knobs. A knob's name is replaced by its value on hover, so the label vanishes while you turn it. |
| Stage knobs (lid, room) | Two identical unlabelled dials. In 2D, one on the lid and one in the corner. In 3D, one glued to the piano's flank and one on the floor, which reads as a watch face stuck on a render. On the cello desktop the room knob is tucked into the stage's far bottom-right corner, nowhere near the pool it stands for. |
| 2D backdrop | `#0e0d0b` with a barely visible brown radial glow from below. The piano's plan is cropped by the stage on three sides, so it reads as wallpaper. On a phone it is about twenty strings and hitch pins, a diagram no one would call a piano. A dotted rectangle around the violin is unexplained. |
| Vector ground | Pure black, a 1 px `#133954` frame inset 6 px, dashed reticle brackets round the instrument, additive glow. Coherent and striking. It also re-skins every piece of chrome, including the typeface. |
| 3D environment | See P2-4. |
| Measurements | Handsome charts (vermilion model line against steel-blue recorded dots, differing in shape as well as colour). 82 charts and 23,713 px tall on a phone with no table of contents. Stat tiles give a number with no sense of good or bad. Axis text shrinks with the SVG to well under 10 px on a phone (about 6–7 px by eye). |
| Notes | The best page: 17 px Newsreader on a 40 rem measure, 10.7:1. It opens with a 22-link mono table of contents before the first sentence. |
| 404 | "Tacet" is the single best piece of copy in the product, and every destination is linked by family. |

---

## 2. Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Superb on what is sounding (readout, spectrum, lit keys, lit parts, sheet hairline). Gaps: the band is blank at load, the lamp and MIDI ring are two unlabelled dots, and nothing visible says what ▶ will play. |
| 2 | Match with the real world | 3 | Instruments drawn as themselves, pedals, lid sticks, note names. Jargon leaks: "vector", "sost.", "detune", "board", "contact", "change". The routing icon is not recognisable. |
| 3 | User control and freedom | 3 | Esc closes menus, Stop, knob reset, real paths so Back works. Picking a piece from a solo stage replaces the instrument with an orchestra unannounced; reorganising an orchestra has no undo. |
| 4 | Consistency and standards | 2 | Four button idioms. The same glyph row appears four times in the Orchestra with four behaviours. Three ways to show "selected". Amber means selected, value, pressed, focus, audio-on and current page. Picker buttons mean "switch to" solo and "add or remove" in the Orchestra. |
| 5 | Error prevention | 3 | Out-of-range keys greyed, "the stage is full" disabled with its reason, state in the URL. The picker's mode change is the main trap. |
| 6 | Recognition rather than recall | 2 | Icon-only controls whose names exist only as hover tooltips. `ui/tip.ts` ignores touch except while a slider is being turned, so on a phone nothing has a name. |
| 7 | Flexibility and efficiency | 3 | Computer keys play, Space/Shift/B for the pedals, MIDI in, drag-and-drop files, everything addressable. No shortcut for instrument or look; 17 tab stops before anything else. |
| 8 | Aesthetic and minimalist design | 3 | The solo stage is focused. The Orchestra is not: about 67 small glyph targets. Widgets float over the instrument. |
| 9 | Error recognition and recovery | 3 | The lamp carries the failure reason and "tap to retry"; the 404 names the address and offers every way out. Scored on a thin sample (see caveats). |
| 10 | Help and documentation | 2 | Notes explains how it works, superbly, not how to use it. Usage help is tooltips only, so none on touch. The page never says what it is. |
| **Total** | | **27/40** | **Acceptable**, one point under Good. All ten apply; none marked n/a. |

---

## 3. Cognitive load

Checklist: **3 of 8 fail, moderate.**

| Item | Result |
|---|---|
| Single focus | Pass. On a solo stage the instrument and the keys are the whole picture. |
| Chunking (≤4 per group) | **Fail.** The picker's families pass; the fallboard's 5–6 knobs, the Orchestra player's 8 controls plus 13 chips, the 11-row pieces menu and the 22-link Notes contents do not. |
| Grouping | Pass. Hairlines between families, framed chips, zones on the fallboard. |
| Visual hierarchy | Pass on solo (instrument, then readout, then keys). The Orchestra has none: the white timpani heads are the brightest, largest thing in the frame. |
| One thing at a time | Pass. |
| Minimal choices (≤4) | **Fail.** See the counts below. |
| Working memory | **Fail.** Which identical knob is the lid's, what each bare icon does once the tooltip is gone (or never came), which of four glyph rows does what. |
| Progressive disclosure | Pass, and well done: knobs behind a toggle on phones, the picker sheet, routing behind a button, the sheet icon only when a file is loaded. |

Decision points with more than four visible options:

| Where | Visible options |
|---|---|
| Desktop bar, solo piano | 17 (instruments and orchestra) + 2 + 3 + 2, plus the lamp and "inside": 25–26 |
| Fallboard, piano | 3 pedals + 2 octave + 5 knobs + reset: 11 |
| Orchestra player (`/symphony`) | play, stop, scrub, sheet, expression, routing, pieces, open (8) + 13 line chips: 21 |
| Orchestra fallboard | sustain + 2 + 13 parts + split: 17 |
| Orchestra screen in total | about 67 small targets: the same 13 instruments in four rows |
| Pieces menu | 11 flat rows |
| Notes contents | 22 links |
| 404 | 24 links, grouped by family, acceptable |

---

## 4. Emotional journey

- **Arrival: a small valley.** A dark, handsome diagram with no name and no sentence. A pulsing vermilion dot says "tap a key" in 11 px in the corner furthest from the keys. Red and pulsing reads as recording or error, not invitation. The readout box, the one beautiful piece of type, is empty.
- **First key: the peak.** Strings bow out in vermilion, sand moves on the soundboard, the readout names the chord, the spectrum appears. Immediate, physical, and unlike anything else. This is the product.
- **Changing instrument and look: a second peak, then whiplash.** The horn and cello in 3D are lovely. "Vector" delights and also swaps the whole identity, typeface included.
- **The Orchestra: the deep valley.** Four rows of the same glyphs, five unlabelled icons, instruments hovering at playing angles with no players. The reward comes only after ▶, and nothing on the screen points at ▶.
- **A piece playing: the third peak.** The stage lights part by part; the sheet on ivory paper with the sounding notes in vermilion is the most finished surface in the app.
- **The end: flat.** A piece stops and nothing happens. By the peak-end rule the last impression is silence and a toolbar. Notes, with its credit line, is the only designed ending, and few will reach it.
- **Reassurance.** Good where it exists: the lamp turns amber, the readout dims instead of vanishing, out-of-range keys are grey. Missing where most needed: before a piece replaces your instrument, and on any unlabelled control on a phone.

---

## 5. Strengths

1. **The simulation is the interface.** "Nothing here is decorative motion" (`stage-draw.ts`) is true and visible. Every animated line is system status, so feedback and delight are the same pixels. No other product can copy this, and any redesign should protect it first.
2. **The readout and the glyph system.** One fixed box that says everything sounding in a serif italic, never one note as if it were the chord, and never moves the layout. Sixteen drawn glyphs reused in the picker, parts, lines and menus make one iconography that is the product's own.
3. **The pages have a voice.** *Tacet* for a 404, a Notes essay that reads like a person wrote it, tooltips in one terse grammar ("reverb · 1.1 s", "inside · I"). Low on text without being mute.

---

## 6. Priority issues

### P1-1. "Wordless" means "unlabelled" on a phone

- **What.** Every icon-only control is named by a hover tooltip. `ui/tip.ts` ignores touch pointers except while a slider is turned. On a phone the orchestra dots, ▶, list, folder, ◐, the "inside" grid, the hairpin, the routing scatter, the page icon and the lamp have no name at all. The lid and room knobs are the same dial twice.
- **Why it matters.** Half the audience arrives by a shared link on a phone. The icons that most need a name (hairpin, routing, ◐) are the least conventional.
- **Fix.** Make each control say what it is by its form. Put the thing it moves in the knob's cap (a lid angle, a room's arcs) or drop the dials and let the lid and the pool's rim be dragged directly. Show the name on long-press or on first tap on touch. Swap ◐ for a knob glyph.

### P1-2. The Orchestra shows one lineup four times

- **What.** On `/symphony` at 1440 px the same 13 glyphs appear in the picker (lit: on the stage), in the band (dim: sounding), in the player (file line to instrument, opens a menu) and on the fallboard (what the keys play). Four rows, four behaviours, about 67 targets, plus five unlabelled player icons. In 2D the instruments are scattered on black with no floor, and the right third of the stage is empty. In 3D they hover without players.
- **Why it matters.** This is the product's biggest promise and its highest-effort screen. The picker also silently changes meaning here, from "switch to" to "add or remove".
- **Fix.** Let the stage be the lineup: tap an instrument on the stage for its menu, which already exists. Keep one strip for what is sounding. Move line routing wholly into its popover. Reduce "keys play" to one chip. Give the 2D rows a floor or risers so they read as an orchestra.

### P1-3. Small, dim and dark on dark

- **What.** Measured in the running page:

| Item | Measured |
|---|---|
| Chrome labels | 10–11 px mono, `#8a8172` on `#0e0d0b`, 5.05:1 (passes on ratio, not on size) |
| Smallest text | 8 px (`.sm-n`), 8.5 px (`.part-n`), 9 px (`.part-notes`) |
| Key octave names (C4, C5) | 10 px, 1.97:1 on ivory |
| Computer-key letters on keys | 10 px, 2.74:1 on ivory |
| Vector look, unselected instrument names | 10 px single-stroke Hershey, `#1f5f8c` on black, about 3.1:1 |
| Silent parts in the band | muted at 45 % opacity, about 1.9:1 |
| Phone view switch | 25 px tall |
| Phone octave buttons | 26×30 |
| Phone picker button / orchestra button | 34 px tall / 36×34 |
| Phone player buttons | 36×36 |
| Phone orchestra line chips | 22–28 px wide, 1 px apart |
| Keys' position strip | 24 px tall, directly over the keys |

- **Why it matters.** On a phone "C4" and "C5" are the only orientation on the keyboard, and they are the faintest text in the app. The targets fail 44 pt exactly where the primary actions live.
- **Fix.** A 12 px floor for labels. Key names at 4.5:1 or better. 44 px targets for the view switch, the octave buttons and the player on touch. Line chips become one "lines" control on a phone.

### P2-4. The 3D world is a generic studio that fails its flagship

- **What.** Nine softbox cards in a black box, a warm key, cool rim and cool fill, a Gaussian warm-grey smear behind the instrument, a spot pool on a dark-brown floor. It flatters brass and varnish. It swallows the black grand: lid and case merge with the backdrop and the form reads only through thin rim lines and the gold plate, and that grand is the link preview. The timpani heads read as flat near-white discs, the brightest things in any orchestra frame. The glockenspiel needed its own key light (`GLOCK_KEY`), which is the code admitting one recipe does not suit all. Grounding is inconsistent: the horn floats with no floor contact or shadow in the frame, the cello balances on its endpin beside a bow nobody holds. On a phone the backdrop is a flat muddy grey-brown with no horizon. The pool as the room's size is clever and nobody will decode it.
- **Why it matters.** "Where is this instrument?" has no answer but "for sale". A black-on-black hero vanishes on a phone outdoors.
- **Fix.** Give the world a place: a wall plane, a floor line, a horizon. Give black lacquer something lighter to sit against and reflect. Keep the white heads from dominating the frame. Ground or support every instrument the same way. Decide whether the dials belong in the scene at all.

### P2-5. Arrival and "what plays?"

- **What.** No name or sentence anywhere on the stage (`.inlay`, a gold serif wordmark for the fallboard, is styled in `styles.css` and never rendered). The band is blank at idle. ▶ plays the instrument's own piece, named only in a hover tooltip. The list icon beside it offers only ensemble pieces, and choosing one swaps your instrument for an orchestra. In the menu the composer is 17 px serif italic and the title, the thing you are choosing, is 11 px muted mono. "Fable 5.2" leads five of eleven rows. Lineup glyphs are 15 px and illegible. No grouping, no durations. On a phone the menu is 613 px tall and covers the keys.
- **Why it matters.** A stranger gets no orientation, and the one-tap route to the best moment (a piece playing) is the least explained control.
- **Fix.** Let the readout's idle state carry the instrument's name in the same box and type, which adds no permanent text. Show the piece's name in that box when ▶ is pressed. Lead menu rows with the title, group them (this instrument, chamber, orchestra) and drop the 15 px lineups for a count.

---

## 7. Persona red flags

Chosen with the rubric's table as a first-impression, mobile-heavy surface: Jordan, Casey, Sam.

**Jordan, first-timer, desktop**
- Lands on `/piano` with no heading, name or sentence. The only instruction is "tap a key", 11 px vermilion, top right, among 25 other bar items.
- "vector" on the view switch is rendering jargon; its tooltip says "vector lines".
- Two identical dials on the stage with no label; has to hover each to learn "piano lid" and "reverb".
- Presses ▶ and Chopin starts. The title was only ever in the hover tooltip.
- Clicks the list icon and picks "Haydn": the piano is replaced by a string quartet that starts playing (read from `player.ts`, `ensemble.enter`; I did not load one). No warning and no visible way back.
- Hovers a fallboard knob and its name is replaced by its value, so the label is gone at the moment of use.
- "sost.", "detune", "board", "0.38 m/s · 2.8 N · 4.6 ms" assume a pianist or a physicist.

**Casey, phone, one thumb**
- The view switch, ▶, the picker and the pages are all in the top fifth. The view switch is 25 px tall.
- No control has a visible name and none can show a tooltip. ◐ is a mystery; so are the dots, the hairpin and the scatter in the Orchestra.
- The position strip that slides the keys is 24 px tall and sits on the keys: a miss plays a note.
- Octave buttons are 26×30. Thirteen line chips of 22–28 px sit 1 px apart, and a miss opens a menu.
- The open knob panel covers the bottom of the instrument and the room knob.
- 2D piano on a phone: strings and pins only. Casey cannot tell it is a piano.
- Good: state is in the URL, the keys are finger-wide and in the thumb zone, the picker sheet is roomy, the sheet-music code loads only on demand.

**Sam, keyboard and screen reader**
- 40 tab stops on `/piano`, and the first 17 are picker toggles: no skip link, no arrow-key roving in the group.
- The 88 keys are plain elements with names but no role and no tab stop, so assistive tech cannot press one. Playing depends on knowing the computer-key map, which is printed on the keys at 2.74:1.
- No headings on the stage. The canvas is one `img` with a generic label. The polite live readout does announce notes, which is the saving grace.
- The picker uses `aria-pressed` toggles for a one-of-sixteen choice; its meaning changes in the Orchestra with no announcement.
- "On the stage" and "sounding" are carried by colour and opacity alone on the glyph rows.
- Good: the amber focus ring is consistent and visible, every knob has a real range input with a full name, the stage knobs are sliders, menus close on Esc.

---

## 8. Minor observations

- `.tip` is two components. The chart tooltip's rule (`min-width: 140px`, a box shadow) leaks into the icon tooltip, so "reverb · 1.1 s" sits in a box with dead space on its right.
- `theme-color` is `#f6f3ed` for light-mode systems while the app is dark-only: cream browser chrome over a black page.
- The lamp pulses on a 1.3 s loop until the first gesture, and on Measurements and Notes it pulses with no hint at all.
- The tab title is "Instruments" on every instrument's address.
- `three3d.ts`'s header says AgX tone mapping; the shader calls `NeutralToneMapping`.
- Label sizes of 10, 10.5 and 11 px coexist. Those are three accidents, not a scale.
- The vector look gives each knob its own colour (green, red, pink, white, blue); the default look makes them all amber. Colour means something different in each look.
- In the Orchestra the keyboard and fallboard keep 24 % of the height for a secondary function while the orchestra is squeezed. `keys=0` exists only as an address parameter.
- Orchestra 2D draws at one scale, so an oboe is a few pixels wide beside timpani about 300 px across.
- The 404's sample line reads "no no-such-page plays at this address". It is correct, and it stutters.
- Measurements has no contents list while Notes has 22 links.
- The player's pill and the 3D dials sit on top of the picture in every look. In 2D the piano's rim runs straight through the icons.

---

## 9. Provocative questions

1. If the stage is nearly wordless, why does the bar carry two dozen words at 10 px? What happens with glyphs only, or names only?
2. Does the product need three looks, or one look held with conviction? What is lost if vector is an Easter egg and not a third of the main switch?
3. Why are the lid and the room dials? A lid is lifted and a room grows. The 3D lid can already be dragged and the pool is already the room. Could both knobs go?
4. Where is this instrument? A studio void says "product". What place says "an instrument being played, computed as you watch"?
5. What if the stage were the Orchestra's only lineup?
6. What is the end of a piece, and of a visit?
7. What would the readout say at rest if it were never allowed to be empty?

---

## 10. The incumbent look's signature moves (what a replacement must not resemble)

**Palette, "an instrument bench at night" (`styles.css`, line 8)**
- Warm near-black ground `#0e0d0b`; panels `#16140f`, `#1f1c16`; lacquer `#120f0c`.
- Cream ink `#ece2ce`, second ink `#c9bfab`, warm grey-brown labels `#8a8172`, brown hairlines `#2a261f` and `#3d372d`.
- Vermilion `#ff5e38` for whatever vibrates and for the unlit lamp; amber `#f2a646` for selection, knob arcs, focus and the lit lamp; brass `#c9a35c`; steel blue `#96b6d2` for reference; ivory keys `#efe7d6`.
- A selected instrument is an amber glyph with a soft amber drop-shadow glow and a 1.5 px amber underline.

**Type**
- Newsreader Variable italic at display optical sizes for the readout, headings, composers, the 404 word and the sheet's part names.
- IBM Plex Mono, lowercase, 10–11 px, +0.02em, for all chrome.
- IBM Plex Sans for body, tiles and chart labels.
- The contrast of big italic serif against tiny lowercase mono is the look.

**Chrome idioms**
- Hairline-framed segmented chips with a filled ivory selected state; 3–6 px radii.
- A pulsing "pilot lamp" dot with a radial highlight.
- A skeuomorphic lacquer fallboard with gradient and inset shadow, pedal-shaped brass buttons, bevelled octave buttons.
- Rotary knobs with tick marks and an amber value arc.
- Ivory keys with gradients, bottom lips and a vermilion inner glow when sounding.
- Blurred translucent dark pills (`rgba(14,13,11,0.55)` with a 6 px backdrop blur) for the player and menus.

**2D ground**
- Flat `#0e0d0b` with `radial-gradient(120% 90% at 50% 100%, rgba(58,42,28,0.35), transparent 60%)`: a warm brown glow rising from the bottom edge, reused on the 404.
- Sepia and brown instrument fills (`wood 58,42,28`), ivory linework, vermilion strings, a Chladni "sand" swirl in pale ivory.

**Vector look**
- Pure black; cyan-blue lines `#4fb6f2`, `#3487c4`, `#1f5f8c`; frame `#133954`; amber `#ffb340` for sound; slot colours green `#5be381`, red `#ff5d40`, pink `#ff73cf`, white `#eef6f8`.
- Additive glow, a 1 px frame inset 6 px, dashed reticle brackets, zero radii, hatched black keys.
- Hershey Simplex single-stroke capitals, tracked 0.1–0.12em. After WarGames/NORAD and the OP-1, by way of Chimera.

**3D studio recipe (`three3d.ts`)**
- A generated environment through PMREM: a near-black box (`0.02`), a slightly lighter floor, nine feathered emissive softboxes. A big warm overhead; a hot warm key box front left (×6.5); a wide card behind the camera; two tall cool strips behind for rims (×7 and ×5.5); two strips beside the camera; a low cool card; a warm lit-floor card.
- Three directional lights: warm key `(1, 0.93, 0.84)` at 2.6 from front left above with a soft PCF shadow; cool rim `(0.8, 0.88, 1)` at 1.6 from behind; cool fill `(0.9, 0.92, 1)` at 0.55. Environment intensity 1.0.
- A dark-brown rough floor `(0.075, 0.062, 0.05)` that fades by alpha into the page, carrying a circular pool of light whose radius is the reverb's room.
- A warm-grey Gaussian glow `(0.085, 0.077, 0.068)` behind the instrument, falling to `#0e0d0b`.
- GTAO, bloom on specular hot spots only, Khronos Neutral tone mapping, dither, a 24° long-lens camera, a planar mirror under the grand's lid.
- In one line: warm key, cool rim, softbox reflections, a spot pool in a brown-black void.

---

---

# Assessment B: detector and browser evidence

Impeccable 4.10.0 (project-local launcher `./.claude/skills/impeccable/scripts/impeccable`), run from the project root
this worktree (branch `ui-alt-c`, HEAD `977d621`) against the dev server at
`http://127.0.0.1:5393`, 2026-11-22 23:58 to 2026-11-23 00:04 local. No `.impeccable/config.json`, no `DESIGN.md`:
the detector ran with its defaults and no ignores. Every URL scan ran alone, one after another.

Exit codes: 0 = no primary findings, 1 = a target could not be scanned, 2 = primary findings. Advisory findings are
listed but never change the exit code. All stderr files are empty.

## 1. Scans at a glance

| # | Scan | Target | Viewport | Exit | Findings | Warnings | Advisories | Raw JSON |
|---|---|---|---|---|---|---|---|---|
| 1 | CLI scan: `apps/web` | directory `apps/web` (static) | n/a | 2 | **7** | 7 | 0 | `cli-apps-web.json` |
| 2 | URL scan: `/piano` at 1440x900 | http://127.0.0.1:5393/piano | 1440x900 | 2 | **34** | 34 | 0 | `url-piano-1440x900.json` |
| 3 | URL scan: `/piano` at 390x844 | http://127.0.0.1:5393/piano | 390x844 | 2 | **10** | 10 | 0 | `url-piano-390x844.json` |
| 4 | URL scan: `/notes` at 1440x900 | http://127.0.0.1:5393/notes | 1440x900 | 2 | **172** | 155 | 17 | `url-notes-1440x900.json` |
| 5 | URL scan: `/measurements` at 1440x900 | http://127.0.0.1:5393/measurements | 1440x900 | 2 | **15** | 14 | 1 | `url-measurements-1440x900.json` |
| 6 | URL scan: `/symphony` at 1440x900 | http://127.0.0.1:5393/symphony | 1440x900 | 2 | **26** | 26 | 0 | `url-symphony-1440x900.json` |
| 7 | URL scan: `/no-such-page` at 1440x900 | http://127.0.0.1:5393/no-such-page | 1440x900 | 2 | **34** | 34 | 0 | `url-no-such-page-1440x900.json` |
| 8 | URL scan: `/notes` at 390x844 | http://127.0.0.1:5393/notes | 390x844 | 2 | **77** | 48 | 29 | `url-notes-390x844.json` |
| 9 | Extra URL scan: `/404.html` at 1440x900 | http://127.0.0.1:5393/404.html | 1440x900 | 2 | **2** | 2 | 0 | `url-404html-1440x900.json` |
| 10 | Extra URL scan: `/404.html` at 390x844 | http://127.0.0.1:5393/404.html | 390x844 | 2 | **2** | 2 | 0 | `url-404html-390x844.json` |

Scans 9 and 10 were not in the brief. They were added because the dev server answers `/no-such-page` with the app
shell (HTTP 200, `<title>Instruments</title>`): Vite serves `index.html` for every path, so scan 7 looked at the piano
stage, not at the 404 page. Its 34 findings are the same 34 as scan 2 (same rule, selector and message, compared
programmatically). The 404 page itself is served by the dev server at `/404.html`.

## 2. Count by rule

| Rule | Name | Severity | Category | CLI | piano 1440 | piano 390 | notes 1440 | meas. 1440 | symph. 1440 | no-such 1440 | notes 390 | 404 1440 | 404 390 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `line-length` | Line length too long | warning | quality |  |  |  | 107 |  |  |  |  |  |  | 107 |
| `tiny-text` | Tiny body text | warning | quality | 1 |  |  | 42 | 14 |  |  | 42 | 1 | 1 | 101 |
| `undersized-ui-text` | Undersized functional text | warning | quality |  | 30 | 6 |  |  | 21 | 30 |  |  |  | 87 |
| `straggler` | Straggler | advisory | quality |  |  |  | 16 | 1 |  |  | 28 |  |  | 45 |
| `low-contrast` | Low contrast text | warning | quality |  | 3 | 3 |  |  | 4 | 3 |  |  |  | 13 |
| `wide-tracking` | Wide letter spacing on body text | warning | quality |  |  |  | 6 |  |  |  | 6 |  |  | 12 |
| `side-tab` | Side-tab accent border | warning | slop | 3 | 1 | 1 |  |  | 1 | 1 |  |  |  | 7 |
| `dark-glow` | Glowing shadow accents | warning | slop | 2 |  |  |  |  |  |  |  |  |  | 2 |
| `italic-serif-display` | Italic serif display headline | warning | slop |  |  |  |  |  |  |  |  | 1 | 1 | 2 |
| `gradient-text` | Gradient text | warning | slop | 1 |  |  |  |  |  |  |  |  |  | 1 |
| `line-length` | Line length too long | advisory | quality |  |  |  | 1 |  |  |  |  |  |  | 1 |
| `unbalanced-heading` | Unbalanced heading | advisory | quality |  |  |  |  |  |  |  | 1 |  |  | 1 |
| **all** | | | | 7 | 34 | 10 | 172 | 15 | 26 | 34 | 77 | 2 | 2 | 379 |

`line-length` appears twice because the detector files one of its 108 hits on `/notes` at 1440x900 as an advisory.
The scan of `/no-such-page` repeats `/piano` (section 1), so the totals count those 34 twice.

Without that repeat: 341 findings in the seven other requested scans, plus 4 in the two extra scans (345).

## 3. Which findings look like false positives, and why

Each claim below was checked against the source or measured in a headless Chromium on the same dev server
(`measure.mjs`, results in `measure.json`). "Measured" numbers are computed styles and boxes, not the detector's.

### 3a. False positives (the pattern the rule names is not there)

| Finding | Where | Count | Why it is a false positive |
|---|---|---|---|
| `side-tab` ".key.black: inset box-shadow 1px stripe (left)" | `apps/web/src/styles.css:463`; rendered: page level (`body`) | 5 (CLI 1; `/piano` 1440, `/piano` 390, `/symphony`, `/no-such-page` 1 each) | It is the lit left edge of a piano's black key: `box-shadow: inset 0 -6px 0 #000, inset 1px 0 0 #3a332b, 0 3px 4px rgba(0,0,0,.7)` on a 17x95 px key (19x93 at 390). Not a card, callout or list row with an accent bar. |
| `side-tab` "border-left: 1px solid var(--rule-2)" | `apps/web/src/styles.css:1390` (`.pl-off`) | 1 (CLI) | A 1 px hairline in the neutral rule colour (`--rule-2: #3d372d`, `styles.css:19`) that separates the "off" segment from the rest of a menu row. The rule describes a coloured bar down one side of a rounded box. |
| `side-tab` "border-left: 1px solid var(--rule-2)" | `apps/web/src/styles.css:2486` (`.kf-split::before`) | 1 (CLI) | A 1 px separator drawn by a pseudo-element (`left:-4px; top:7px; bottom:7px`), with no box and no radius at all. |
| `gradient-text` "background-clip: text + gradient" | `apps/web/src/styles.css:285` (`.inlay`, declared at 272, again at 708) | 1 (CLI) | No element carries the class: outside `styles.css` the word `inlay` occurs in `apps/web/src`, `index.html` and `404.html` only in two comments about pearl inlays (`ui/gl/mats3.ts:185`, `ui/gl/winds3d.ts:31`), `.inlay` matches 0 elements on `/piano` (1440 and 390) and on `/symphony`, and no rendered scan reports it. The finding is on CSS that nothing uses. (The rule itself is a gold gradient clipped to text; it would be a true hit if anything used it.) |
| `low-contrast` on `span.lbl` (2.5:1 on white keys, 2.7:1 on black keys) | `/piano` at 390x844: `div.key.white:nth-of-type(40) > span.lbl`, `div.key.black:nth-of-type(41) > span.lbl` | 2 of the 3 `low-contrast` at 390x844 | `.lbl` is the computer-keyboard letter on a key. `styles.css:534-541` hides it under `@media (hover: none) and (pointer: coarse)`. Measured at 390x844: 88 `.lbl` rendered with a mouse (what `--viewport` emulates), 0 rendered with touch + mobile emulation. On a phone these two findings do not exist. (On a computer they do: section 3c.) |
| every finding of scan 7 | `/no-such-page` | 34 | The dev server serves the app shell there, so the scan repeats `/piano`. None of the 34 is about the 404 page. |
| `dark-glow` "Zero-offset box-shadow glow (#ff5e38)", second copy | `apps/web/404.html` (no line given) | 1 of 2 (CLI) | The page and its one stylesheet hold one such declaration: `.nf-lamp { box-shadow: 0 0 8px rgba(255,94,56,.55) }` at `apps/web/src/not-found.css:64`. It is reported twice with identical text. The rendered scans of the same page (9, 10) report it zero times. |

### 3b. Likely false positives or category mismatches (the measurement is real, the rule's subject is not)

| Finding | Where | Count | Facts |
|---|---|---|---|
| `dark-glow`, first copy | `apps/web/src/not-found.css:64` via `404.html` | 1 (CLI) | The glow is on `.nf-lamp`, a 9x9 px round pilot lamp before the 404 line (the same lamp declaration is in the app at `styles.css:111`). It is an indicator light, not a glowing card or button. Not reported by the rendered scans. |
| `wide-tracking` "letter-spacing: 0.06em on body text" | `/notes`: 6 of the page's 12 `h3` (`#n-piano > h3` 1 and 2, `h3:nth-of-type(4)`, `(5)`, `#n-ensemble > h3` 2, `#n-calibration > h3` 1), same six at both widths | 6 + 6 | The elements are section sub-headings, not body text: `.notes h3 { font: 500 12px/1.4 var(--mono); letter-spacing: 0.06em; text-transform: lowercase }` (`styles.css:2257-2263`), measured 12 px IBM Plex Mono, 0.72 px tracking. 0.06em is 0.01em over the rule's 0.05em line. The six flagged are the longer headings; the other six, same style, are not flagged. |
| `tiny-text` "12px body text" | `/measurements`: `svg > text.panel-title` in 14 charts | 14 | The text is a chart's panel title, not body copy: `.chart svg .panel-title { font-size: 12px }` (`styles.css:1056-1060`). The detector charges it because the SVG is drawn smaller than its viewBox: measured scale 0.898 in the ensemble grids at 1440, so 12 px is 10.8 px on screen. Only titles of 21 characters or more are flagged (14 of 78 panel titles; the other 64 have the same size and scale). The 10.8 px is real. |
| `tiny-text` "11px body text" on SVG text | `/notes`: `figure.diagram > svg > g.lbl > text` (1 in `#n-piano`, 4 in `#n-trumpet`, 1 unqualified `text`) | 6 + 6 | Labels inside three diagrams (`.notes figure.diagram .lbl`, `styles.css:2314`), 19 SVG text nodes in all, 11 px in viewBox units. At 1440 the SVGs are at scale 1.0 to 1.067 (11 to 11.7 px). At 390 the same SVGs are 362 px wide against viewBoxes of 600 to 640: scale 0.566 to 0.603, so the labels are 6.2 to 6.6 px on screen. Not body text, but at phone width the real size is far under what the detector prints. |
| `italic-serif-display` | `/404.html`: `h1.nf-word` "Tacet" | 1 + 1 (extra scans) | Mechanically true: `font: italic 400 clamp(72px, 19vw, 132px)/1 var(--serif)` (`not-found.css:42-47`), Newsreader Variable italic, 132 px at 1440 and 74 px at 390. The rule's own text says to judge by context; this is a 404 page's one word, not a landing-page hero. |

### 3c. Not false positives: the measurement is right and the element is what the rule says

| Finding | Where | Count | Facts |
|---|---|---|---|
| `undersized-ui-text` 10 px | instrument picker names `button.pick > span.pick-name` (16) and `button.ens-toggle > span.pick-name` (1) | 17 per desktop stage scan | `.pick-name { font-size: 10px }` (`panel.css:220-226`), IBM Plex Mono. Button box 40x53 px; each button has an `aria-label` ("Piano"). Not rendered at 390 until the picker sheet is opened (0 visible), so the phone scan does not see them; in the sheet the rule at `panel.css:596` sets 10.5 px. |
| `undersized-ui-text` 10.5 px | `div.presets > button` ("grand", "upright"), `button.view-2d`, `button.vec-toggle`, `button.dim-toggle` | 5 on `/piano` 1440; 3 on `/symphony` and on `/piano` 390 (no presets there) | `.presets button { font: 500 10.5px/1 var(--mono) }` (`panel.css:270-276`). Button boxes measured 27x21 ("2d", "3d"), 54x21 ("vector"), 48x21 ("grand") at 1440; 29x25 and 56x25 at 390. The three view buttons have `aria-label` and `data-tip`; the preset button measured ("grand") has neither (its text is its name). |
| `undersized-ui-text` 10 px | pedal names `button.pedal > span.p-name` ("sustain", "soft", "sost.") | 3 on `/piano` at both widths, 1 on `/symphony` | `.p-name { font-size: 10px }` (`styles.css:327-330`). Button 46x47 px, `aria-label` "Sustain pedal (hold; Space on a keyboard, CC64 on MIDI)". |
| `undersized-ui-text` 10 px | knob names `label.knob > span.k-name` ("hammer", "stiffness", "detune", "board", "decay") | 5 on `/piano` 1440 | `.k-name` (`styles.css:396`), label box 54x50 px. Not rendered at 390 or on `/symphony`. |
| `low-contrast` 2.0:1 | `div.key.white > span.cname` (the name on each C: "C1" to "C8") | 1 finding per stage scan, covering 8 keys at 1440 ("and 7 more"), 2 in view at 390 | `.key .cname { font-size: 10px; color: #b8ac95 }` (`styles.css:510-520`) on the ivory key (the detector reads the key's gradient there as `#f5efe1`). `pointer-events: none`; the key itself has `aria-label` ("A0"). Shown on touch too. |
| `low-contrast` 1.8:1 | `/symphony`: `div.key.white:nth-of-type(4) > span.cname` ("and 3 more") | 1 | The same C names on keys with class `out` (outside what the keys play in the Orchestra): `.key.out.white { background: linear-gradient(180deg, #6f6758, #8c8371) }` (`styles.css:488-491`). The label keeps `#b8ac95` on the darkened key. |
| `low-contrast` 2.5:1 and 2.7:1 | `span.lbl` on white keys ("and 8 more") and on black keys ("and 6 more") | 2 per desktop stage scan | `.key .lbl { font-size: 10px; color: #9c917b }`, `.key.black .lbl { color: #6d6457 }` (`styles.css:495-509`): the computer-key letters, 16 keys. True on a computer; hidden on touch (3a). |
| `line-length` ~86 to ~116 chars | `/notes` at 1440: 70 `p`, 32 `li`, 3 `div.hint`, 1 `figcaption`, 1 `p.thanks` (+1 `div.hint` as advisory) | 107 + 1 | `.prose { font-size: 17px; max-width: var(--measure) }` with `--measure: 40rem` (`styles.css:34`, `659-666`): measured column 640 px, Newsreader 17 px, median 91 characters a line against the rule's 80. None at 390 (column 362 px). |
| `tiny-text` 11 px | `/notes`: 35 `li` (16 as `ol.refs > li`, 19 as bare `li`) and `p.thanks`, same at both widths | 36 + 36 | The Sources list (`notes.ts:448-451`; no other `li` on the page is 11 px) and the credit line under it: `.notes .refs { font-family: var(--mono); font-size: 11px }` (`styles.css:1177-1181`), `.notes .thanks { font: 400 11px/1.7 var(--mono) }` (`styles.css:2332-2336`). Real 11 px; they are sources and credits, not the page's running text (17 px). |
| `tiny-text` 11 px | `/404.html`: `p.nf-line` ("404 · nothing plays at this address"); CLI: `apps/web/404.html` | 1 + 1 (extra scans), 1 (CLI) | `.nf-line { font: 400 11px/15px var(--mono) }` (`not-found.css:48-56`). It is the page's only sentence. The page's 24 links are 11 px too, which is on the functional-text floor and not flagged. |
| `straggler`, `unbalanced-heading` (advisory) | `/notes` (16 at 1440, 28 at 390; 1 heading at 390), `/measurements` (1) | 46 | One word alone on a paragraph's last line; `#n-calibration > h2.sec` wraps with a last line 34% as wide as the one above at 390. `text-wrap` is `wrap` on the prose. Real, advisory. |

### 3d. What the detector cannot see here (so its silence is not evidence)

* **The stage is a canvas.** At 1440x900 `canvas.stage-cv` is 1440x619 px (69% of the viewport), with `canvas.spec`
  640x58 and `canvas.scope-cv` 250x42; at 390x844 the stage canvas is 390x566 (67%). Nothing drawn in them (the
  instrument, the stage's knobs, any lettering in the drawing) is in the DOM, so no rule ran on it. Every finding on
  `/piano` and `/symphony` is about the DOM around the stage: the bar, the fallboard and the keys.
* **Icon-only controls raised nothing, and none is unnamed.** Measured visible buttons with no text: 3 of 31 on
  `/piano` at 1440, 32 of 57 on `/symphony`, 3 of 14 on `/piano` at 390. Every one has an accessible name (`aria-label`, `aria-labelledby`
  or `title`: 0 without) and a `data-tip` (0 without). No false positive came from them because no rule fired on them.
* **The static scan sees almost no markup.** `apps/web` holds 2 HTML files, 4 CSS files and 106 `.ts` files under
  `src` (the tool does not list what it visited). `index.html` is a shell and the DOM is built in TypeScript: the
  CLI found nothing in `index.html` or in any `.ts`, only in `404.html` (3) and `styles.css` (4).
* **`--viewport 390x844` is a narrow mouse window, not a phone**: no touch, so `(hover: none) and (pointer: coarse)`
  rules do not apply (3a).
* **Measured, not flagged**: `/measurements` holds 982 SVG text nodes: 740 at 10 px, 164 at 11 px, 78 at 12 px in
  viewBox units, the charts with panel titles drawn at 0.898 to 1.213 of their viewBox at 1440 (so 10 px is 9.0 px in the 0.898 grids).
  The detector flagged only the 14 long panel titles. No page measured scrolls sideways: `scrollWidth` equals the
  window on `/piano`, `/symphony`, `/notes` and `/measurements` at 1440, and on `/piano` and `/notes` at 390.

## 4. Browser overlay evidence

Done, with one change of means (section 5). One page in a private headless Chromium (the repo's own Playwright
1.65.0, 1440x900), driven by `overlay.mjs`; raw console in `overlay-console.json`.

* Preflight on `/piano`: `document.title` set and read back: yes; an appended `<script>` ran: yes.
* Live server: `impeccable live-server --background` printed `{"pid":27871,"port":8400,"token":"..."}` (exit 0);
  `http://localhost:8400/detect.js` answered 200 (3.25 MB, the rules as WASM).
* No console error, warning or page error on any of the three pages before the script was injected.

| Page | Script | Console line mentioning `impeccable` | Finding lines in its group | Overlay boxes in the DOM | Same as CLI URL scan? |
|---|---|---|---|---|---|
| `/piano` | loaded | "[impeccable] 34 anti-patterns found" | 34: `undersized-ui-text` 30, `low-contrast` 3, `side-tab` 1 | 34 `.impeccable-overlay`, 33 `.impeccable-label`, 1 `.impeccable-banner` | yes (34 findings by the CLI) |
| `/notes` | loaded | "[impeccable] 153 anti-patterns found" | 172: `line-length` 108, `tiny-text` 42, `straggler` 16, `wide-tracking` 6 | 153 `.impeccable-overlay`, 153 `.impeccable-label`, 0 `.impeccable-banner` | yes (172 findings by the CLI) |
| `/measurements` | loaded | "[impeccable] 15 anti-patterns found" | 15: `tiny-text` 14, `straggler` 1 | 15 `.impeccable-overlay`, 15 `.impeccable-label`, 0 `.impeccable-banner` | yes (15 findings by the CLI) |

The overlay counts elements ("153 anti-patterns found" on `/notes` is 153 elements carrying 172 findings: some
paragraphs are both too long and end on a straggler). Rule by rule the overlay and the CLI agree on all three pages.
On `/piano` the 33 labels and one banner fit 33 element findings and the one page-level `side-tab` (section 3a).

## 5. Skipped or failed steps, and changes of means

Nothing failed and nothing was skipped. Three things differ from the brief:

1. **Overlay step: a private headless browser, not a tab in the shared Playwright MCP browser.** The MCP tools were
   loaded and `browser_tabs list` was called once (read-only): it showed one tab on `/piano`, and the other
   assessment's screenshots (`a-*.png`) were appearing in `.playwright-mcp/` at that moment. That browser has one
   "current tab" for everyone: a new tab would have taken it, so the other assessment's next call would have landed on
   a page with the detector's overlay drawn on it. The same steps (preflight, inject `detect.js`, wait 3 s, read the
   console, three pages, close) were run in a separate Chromium instead. No MCP tab was opened, navigated or closed.
2. **`/no-such-page` is not the 404 page on the dev server** (section 1), so `/404.html` was scanned too, at both
   widths (scans 9, 10).
3. **The live server wrote into the project**: starting it created `apps/web/.impeccable/live/server.json`
   (untracked). `live-server stop --keep-inject` stopped it ("Stopped live server on port 8400", exit 0) and left
   four empty directories (`apps/web/.impeccable/live/{annotations,sessions}` and their two parents), which were removed with `rmdir`. No bare `stop` was run and no HTML was touched.

State at the end: nothing answers on port 8400 and pid 27871 is gone; `git status --short` prints only
`?? artifacts/ui-alt/`, which was there before the first command (no tracked file modified, `git diff --stat` empty).

The per-finding listing (every rule, selector and message of each scan) was kept as raw JSON during the run and is summarised by the tables above.
