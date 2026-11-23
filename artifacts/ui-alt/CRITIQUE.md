# Critique of the incumbent UI ("night bench")

`/impeccable critique` (project-local Impeccable 4.10.0), run 2026-11-23 on this checkout at `977d621`
(= production, https://instruments-wustep.vercel.app), before any redesign work.

Method: dual-agent (A: an isolated design-review sub-agent · B: an isolated detector sub-agent)

Evidence: seventeen stills of production in `artifacts/ui-alt/shots/before-*.png` (2D, vector and 3D; a
computer at 1440×900 and a phone at 390×844; the Orchestra, the picker, the sheet music, both pages, the
404), the source, one tab of Assessment A's own for the states the stills lack, and the detector's scans
of the sources and of five pages at two viewports.

## Design health score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Lamp, readout, spectrum, lit keys and parts are excellent. A piece's progress is a 2 px hairline with no time; nothing says the picker has changed meaning in the Orchestra. |
| 2 | Match system / real world | 3 | Fallboard, pedals, lid and score order are fluent. Knob names (`contact`, `change`, `board`, `spot`) and the scope's caption are unlabelled jargon. |
| 3 | User control and freedom | 3 | Esc, reset, stop, back and URL state all work. No undo for a lineup or routing edit. |
| 4 | Consistency and standards | 2 | A picker button selects alone but adds or removes in the Orchestra. Four look-alike rows of glyphs mean four things. Two tooltip systems, five different "on" styles. |
| 5 | Error prevention | 3 | Keys out of compass are dimmed, a full stage is disabled, the lid is notched. A tap on an instrument at its most removes every seat of that kind. |
| 6 | Recognition rather than recall | 2 | Everything is icon-only; names live in hover tooltips and never on touch. Two identical unlabelled knobs on the stage. |
| 7 | Flexibility and efficiency | 3 | Computer keys, octave keys, pedals' keys, MIDI in, file drop and deep links. No key for play, instrument or view. |
| 8 | Aesthetic and minimalist design | 3 | The solo stage is disciplined. The idle band is an empty stripe, the Orchestra is crowded, the smudged overlays and a dotted box are noise. |
| 9 | Error recovery | 2 | A failed start is handled well ("no sound: reason · tap to retry"). A bad MIDI file or a failed piece fetch only logs to the console. |
| 10 | Help and documentation | 2 | Notes explains the physics; how to use the Orchestra, routing and the shortcuts is buried in its paragraphs; contextual help is hover-only. |
| **Total** | | **26/40** | **Acceptable** (20–27: significant improvements needed before users are happy) |

## Design specificity verdict

**Design review.** Highly specific; no unrelated product could wear it. The chrome is made of the
instrument (a lacquered fallboard with brass pedals and knobs, a lid knob that clicks onto the real
prop-stick rests, reverb drawn as a pool of light, keys greyed outside each compass, a hairpin for
expression, pickers in score order, "Tacet" for the 404), one colour means one thing (vermilion: something
is vibrating), and the type has roles. It turns generic in three places: the Measurements head (four
big-number tiles over a two-column grid of charts), the transport's stock icons beside the hand-drawn
instruments, and the 2D Orchestra, where the players float on black with nothing under them while the 3D
one has risers and light.

What makes it specific is also what binds it to the dark: the whole state language is **glow**. Selected,
sounding, focused and hot are all a coloured light around a thing, and that only works on near-black.

**Deterministic scan.** Sources (`apps/web/index.html`, `404.html`, `src/`: 110 files): 7 findings.
Rendered pages: 34 on the stage at 1440×900 and 10 at 390×844 (2D and 3D identical: the detector reads the
DOM chrome, not canvas or WebGL), 172 / 77 on Notes, 15 / 6 on Measurements, 2 on the 404 page.

- `undersized-ui-text` (30 on the desktop stage): every label is 10 or 10.5 px mono (sixteen instrument
  names, "orchestra", pedal names, knob names, grand / upright, 2d / vector / 3d). Real, and an undercount:
  21 font declarations in `styles.css` and `panel.css` are 8–10.5 px.
- `low-contrast` (3 rules, 24 elements): the engraving on the keys is 2.0:1 (C names), 2.5:1 (letters on
  white keys) and 2.7:1 (letters on black keys) against 4.5:1. Real. (The letters are hidden on touch, so on
  a phone only the C names apply.)
- `tiny-text`: Notes' reference list and credits at 11 px mono (36 elements), the 404 page's lines at 11 px,
  and the Measurements charts' titles and axis labels, which are declared 12 px but scale with the chart:
  measured 10.8 px and 9.9 px on a computer, about 7.6 px and 7 px inside the phone's sideways scroller.
- `line-length` (108 on Notes at 1440): prose runs about 91 characters a line (44 rem at 17 px).
- `dark-glow`: flagged once (the 404 page's lamp) and undercounted: by grep the same zero-offset coloured
  glow is the lamp, the position strip's window, the MIDI socket, pressed and sounding keys, and eleven
  `drop-shadow(0 0 …)` glows on lit glyphs.
- `gradient-text`: the gilt maker's name on the fallboard (`.inlay`), which nothing renders any more.
- `italic-serif-display`: the 404 page's one word.
- False positives: all four `side-tab` hits (a black key's bevel, two 1 px dividers), `wide-tracking` on
  short mono sub-headings, the diagram labels counted as body text.

**Visual overlays.** None. The injected script never loaded (Chrome's local-network-access prompt, which
only a person can answer), so no overlay exists in any browser tab; the URL scans above are the fallback
signal.

## Overall impression

A first note is one of the best ten seconds on the web: a string lights and bows into its mode shape, the
readout sets the chord in large italic, the partials rise. Before it, the page is handsome and mute, and
after it the product's best things (a piece that plays itself, an orchestra) sit behind a 14 px triangle
and a seventeenth button. The look is a night bench: an instrument lit in a dark room, read through its
reflections and its glows. That look is coherent and it is at its limit: the labels cannot get bigger
without the bar breaking, the glows cannot say more than "on", and the instruments, which are warm wood and
metal, are shown in the one light that hides most of them.

The single biggest opportunity: let the instrument be seen whole, in good light, and let the chrome be
readable at a glance instead of decoded.

## What is working

1. **Cause and effect is legible.** One colour means vibration. The readout names everything sounding,
   with the chord spelled right, and keeps its box so nothing under it moves.
2. **The controls are the instrument, and they are constraints.** The notched lid, the room as light on the
   floor, the keys dimmed outside the compass, the 88-key strip with its window on a phone: each is crafted
   and each prevents an error.
3. **Progressive disclosure.** The player is three icons at rest and grows only when a file loads; the
   knobs fold behind one toggle on a phone; the phone's picker is a clean four-by-four of families; state
   lives in the address.

## Priority issues

**[P1] Icon-only controls have no names on touch, and some cannot be told apart with a mouse either.**
The tooltip is the whole labelling system and touch never shows one (`ui/tip.ts`); under 1340 px the
Orchestra's button loses its word and is five dots; the room's knob and the lid's are the same drawing.
*Why it matters:* the stage is wordless by design, so a phone visitor gets no words at all. *Fix:* make each
control's drawing say what it is (a lid's wedge and a room's arcs in the knob caps; an orchestra's sign that
reads as players), keep words where there is room for them, and give labels a size a phone can read.
*Command:* `/impeccable clarify`, `/impeccable adapt`.

**[P1] The Orchestra: four look-alike rows of glyphs, a picker that silently changes meaning, a
destructive wrap.** The same instrument glyphs appear in the picker (add or remove), the band (who
sounds), the player (reroute a line) and the fallboard (what the keys play). *Why it matters:* the most
ambitious mode is the least self-explanatory. *Fix:* give each row its own form (a count on the picker, a
level on the band, a line on the player, a keycap on the fallboard) so the rows differ by more than
position. The behaviour changes (undo, no wipe at the most) are product decisions outside a visual
redesign. *Command:* `/impeccable distill`, `/impeccable layout`.

**[P2] The first impression hides the best thing.** The idle band is empty but for orphan axis labels and
a hairline; the only instruction is "tap a key" in 11 px vermilion beside a pulsing red dot, which reads as
recording or as an error; play is a 14 px triangle. *Fix:* an idle state that is composed, not blank; a
calm "ready" sign that is not the alarm colour; a transport with presence. *Command:* `/impeccable onboard`.

**[P2] Small, faint type and small targets.** 10 px mono throughout (detector: 30 hits on one screen);
the keys' engraving at 2.0–2.7:1; on a phone the view switch is 25 px tall, the octave arrows 26×30, the
player's buttons 28–36, the page links 31. Only the pedals and the stage's knobs meet the project's own
44 px rule. *Fix:* a 12 px floor for labels in a face that reads at that size, engraving at 4.5:1 or
better, 40–44 px hit areas by padding. *Command:* `/impeccable typeset`, `/impeccable adapt`.

**[P2] State is said five ways, all of them light.** An amber underline (picker), an ivory filled chip
(view), an amber glow on a glyph (parts, lines), an amber border (open menus), a vermilion glow (keys,
strings). *Why it matters:* consistency (heuristic 4 at 2), and none of it survives outside the dark.
*Fix:* two states with one form each: chosen, and sounding. *Command:* `/impeccable colorize`,
`/impeccable polish`.

**[P3] The reading pages.** Notes runs 91 characters a line with its references at 11 px; Measurements'
tiles do not say they are the model's error against a recording, and its charts' labels shrink to 7–10 px.
*Command:* `/impeccable typeset`.

## Persona red flags

- **Jordan, sent the link, on a computer.** Gets a sound and changes instrument. Misses "play a piece"
  (an unlabelled triangle). In the Orchestra, taps "piano" to leave and adds a piano. Cannot tell the two
  knobs on the stage apart. Nothing says what this is.
- **Casey, one hand on a phone.** The keys are in the thumb's reach. No tooltips at all; the Orchestra is
  five dots, the knobs' toggle a half moon; the view switch is 25 px tall at the top of the screen.
- **Sam, keyboard and screen reader.** Twenty-four tab stops before the stage, no skip link, no `h1`; the
  stage's knobs set `outline: none` and show focus as a faint change of ring; picker, pedal and knob help is
  a native `title`. Good: names throughout, `aria-valuetext` on sliders, a visible focus ring elsewhere,
  reduced motion honoured.
- **A pianist on a phone.** Sustain must be held with a second thumb; how hard a key is struck depends on
  where it is touched, which nothing shows; the default view is an abstract crop of strings, and the 3D
  grand she would share is behind a 25 px chip.
- **An audio engineer on Measurements.** "15 % inharmonicity B" without saying it is the model's error or
  that lower is better; nine sections and no contents; "listen side by side" at the bottom.

## Minor observations

- `.tip` is defined twice (`styles.css:1061` and `:1969`): icon tooltips inherit the chart tooltip's
  `min-width: 140px` and shadow, so a short tip sits left in a box too wide for it.
- The blurred mode-shape overlays read as smudges over crisp linework, and a faint dotted rectangle (the
  room's walls) is unexplained.
- The player floats over the instrument's silhouette; in 3D the cello's scroll touches it. The 3D cello
  fills about 15 % of a desktop stage.
- In 3D the black lid loses its top edge against the dark backdrop.
- In the 2D Orchestra the woodwinds are sticks about 8 px wide, and nothing grounds the group.
- The vector style gives each knob its own hue with no legend.
- The octave buttons are bevelled while every other chip is flat; the readout steps through four sizes.
- Dead CSS: `.inlay` (the gilt wordmark) and long runs of blank lines where rules were removed.

## Questions to consider

1. If the stage must be wordless, why does the bar get twenty-four words in a size nobody can read?
2. Is the glow the identity, or only the dark's way of saying "on"? What says "this is sounding" in daylight?
3. The 3D grand is what gets shared. What would the 2D drawing have to be for it to deserve being the default?
4. What should the page look like in the ten seconds before the first note?

## Run notes

- Assessment A ran isolated and never saw the detector's output. Assessment B's report reached the
  parent context about a minute before A's did (the harness delivers reports as they finish); the synthesis
  above was written only after both were in.
- The overlay flow was attempted once and stalled at the browser's permission prompt; the live server was
  stopped with `--keep-inject` and left nothing in the repo.
- `/no-such-page` cannot be scanned (the detector refuses a page served with status 404); the same file
  was scanned as `/404.html`.
- Not verified: real touch devices, iOS audio, screen-reader output, widths between 761 and 1340 px, a
  phone on its side, Seeds, the upright, the sheet on a phone.

## What this means for the redesign

The brief answers the questions a critique would end on: the priority is everything above at once (a
replacement, not a polish), the intent is **Day Studio**, the scope is the whole UI, and the audio engine
and the seating are off-limits. So, carried into the new world as product truth: one colour that means
sound; the readout's fixed box and its rules; controls that are the instrument's own; the picker in score
order; disclosure as it is. Left behind as the old look: glow as the state language, italic serif over
mono labels, lacquer-and-brass chrome, dark walls and a pool of light, 10 px type.
