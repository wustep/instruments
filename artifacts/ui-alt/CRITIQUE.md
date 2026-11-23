# Critique of the current UI (main at 977d621, production)

Method: dual-agent (A: an isolated design-review sub-agent · B: an isolated detector sub-agent), Impeccable
4.10.0 (`.claude/skills/impeccable`, engine 0.1.27), run 2026-11-22/23.

Evidence: seventeen rendered captures of production at 1440×900 and 390×844 (`artifacts/ui-alt/shots/before-*.png`:
the piano in 2D, vector lines and 3D on both devices; violin 2D; cello and horn 3D; the Orchestra in 2D and 3D,
desktop and phone; the phone's picker sheet; the pieces menu; the sheet music; Notes; Measurements; the page
before any sound), the source, and the detector on the sources and on five live pages at both viewports.

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Lamp, readout, lit keys and greyed out-of-range keys are excellent; nothing names the piece playing or its time |
| 2 | Match system / real world | 3 | Fallboard, pedals and the sheet are right; "0.38 m/s · 2.8 N", "board", "change" go unexplained; the phone's knob toggle is ◐, the sign for a theme switch |
| 3 | User control and freedom | 3 | Esc, stop, reset and the address's history are good; in the Orchestra a tap past the maximum removes every seat of a kind, with no way back |
| 4 | Consistency and standards | 2 | One row of glyphs means four things in the Orchestra; the picker turns from a choice into a counter; two tooltip systems (`title` and `data-tip`) |
| 5 | Error prevention | 3 | Out-of-range keys, a full stage, the 2D fallback |
| 6 | Recognition rather than recall | 2 | An icon-only player and unlabelled dials; tooltips never show on touch except on sliders |
| 7 | Flexibility and efficiency | 3 | Computer keys, MIDI, drag and drop, deep links; no play/pause key |
| 8 | Aesthetic and minimalist design | 3 | The solo stage is restrained; the Orchestra's periphery is noisy; 24 choices in the bar |
| 9 | Error recovery | 2 | An audio failure is handled in an exemplary way; a bad MIDI file, a non-MIDI drop and a failed piece fail silently |
| 10 | Help and documentation | 2 | Notes explains the physics, not the controls; no list of keys |
| **Total** | | **26/40** | **Acceptable** |

## Design specificity verdict

**LLM assessment.** The structure belongs to this product and to no other: the page is stacked like the front
of an instrument (what is sounding, the instrument, a lacquer fallboard with brass pedals and knobs, the keys),
every string of the 2D piano stands over its own key, the scope's captions say "A string · down-bow · 16 % from
the frog", the 404 page says "Tacet". The surface language is the interchangeable part. Warm near-black, cream
ink, an orange accent, an italic display serif and 10 px lowercase monospace for every label is the house
style of the "crafted technical tool": a synth plug-in could wear this chrome unchanged. The 3D world is a
product-shot void (`ui/gl/three3d.ts` `studio()`: softboxes, strip lights, dark walls); the 2D stage sits on a
flat ground whose floor gradient cannot be seen and whose room is a dashed box that reads as a crop marquee.
The vector display is the most committed look of the three, let down by text too dim to read.

**Deterministic scan.** 399 findings over eleven scans, ten rules of sixty-two. It agrees with the review where
it can see (the DOM; canvas and WebGL are invisible to it, so 2D and 3D scanned identically):

- `undersized-ui-text` ×97: 10 px picker names (`panel.css:222`), 10.5 px view and piano-kind buttons
  (`panel.css:275`), 10 px pedal and knob names (`styles.css:329`, `:399`).
- `low-contrast` ×19: the keys' legends at 2.0:1, 2.5:1 and 2.7:1 (`styles.css:495–519`).
- `tiny-text` ×101: Notes' 35 references and thanks line at 11 px mono; chart titles.
- `line-length` ×108 on Notes at 1440 px: a median of 91 characters a line (`--measure: 40rem` at 17 px).
- `wide-tracking` ×12, `straggler` ×48 and `unbalanced-heading` ×2 (advisory).
- Source only: `gradient-text` on `.inlay` (`styles.css:285`), dead CSS that nothing renders; `dark-glow` on the
  404's lamp.

False positives: all nine `side-tab` (an ebony key's bevel and two hairline dividers); the key letters'
contrast at 390 px (they are `display: none` on a real touch screen; the detector's phone pass has no touch).
No font rule fired: Newsreader and IBM Plex are on neither ban list, only on Impeccable's list of reflex faces.

**Visual overlays.** None. The live-server overlay was skipped: this session has no browser tab a person is
looking at, and the machine was under load from other headless browsers.

## Overall impression

The instrument is right and the room is missing. What the page is for (play a note, believe it) works within
seconds and the first note is a real peak. Around it, the look says "night-mode bench tool" in a product that
models a room, seats and a lid: nothing on the screen is a place. The single biggest opportunity is to put the
instrument somewhere, and let the chrome speak in the voice of that place instead of in 10 px monospace.

## What's working

1. **The instrument is the layout.** Strings over their keys and a diegetic fallboard teach the mapping
   without a word.
2. **The readout.** One line always says everything sounding, in a box that never moves, with real physical
   numbers beside it. A status display that doubles as the product's character.
3. **Rethought, not shrunk.** The phone's four-by-four sheet by family, the keys' position strip and the sheet
   music are each designed for where they are; "Tacet" and "no sound: … · tap to retry" show care at the edges.

## Priority issues

**[P1] The Orchestra shows its lineup four times with four meanings.** The picker (lit, ×2), the band's
parts, the player's line chips and the fallboard's key targets are the same thirteen glyphs at 20–28 px; flute,
oboe and clarinet are three identical sticks; the picker becomes a counter that wraps to zero. The showpiece
carries the heaviest load in the app. *Fix:* one strip for what sounds; make the other three quieter and
different in form; in time, make the seated instrument itself the control. *Command:* `/impeccable distill`.

**[P1] The headline act is hidden, and the invitation is in the alarm colour.** Play and pieces are 28 px
icons on a 55 % pill lying over the drawing; nothing names the piece or its time. The only invitation on
arrival is 11 px "tap a key" in the far corner, in vermilion, beside a pulsing red dot: the colour of failure
used for "welcome". *Fix:* a play control that reads as the way in at rest; the idle lamp as a quiet light, red
kept for failure alone; a moment that marks the first sound. *Command:* `/impeccable onboard`.

**[P2] Small, faint type is the default voice.** Labels are 8–11 px monospace throughout; the computer-key
legend, which is the desktop's "how to play", is the faintest text on the page (1.97:1 and 2.74:1); silent
parts are 1.9:1; the phone's view switch is about 25 px tall. The detector counts 97 undersized labels and 19
contrast failures. *Fix:* an 11–12 px floor, legends at 4.5:1, 44 px targets on touch, monospace kept for
readings and not for names. *Command:* `/impeccable typeset`.

**[P2] 3D is a void and 2D sits on nothing.** The backdrop is an 8 % glow over a matte brown floor. Brass is
flattered and varnish is good, but black lacquer on black loses the lid and the far case, the horn floats with
no contact, the pool of light is cut off by the fallboard, and white timpani heads outshine an orchestra whose
woodwinds vanish. In 2D the room is a dashed rectangle. The engine models a room; the picture shows a
configurator. *Fix:* a floor with boards and a little gloss for contact and reflection, a back wall with
something on it, one light with a direction, a ground for 2D. *Command:* `/impeccable shape` (a new world).

**[P2] Silent file failures; touch cannot learn the icons.** A bad MIDI file or a non-MIDI drop says nothing;
tooltips never appear on touch; ◐ and ‹ › are characters standing in for icons. *Fix:* one line in the lamp's
place; drawn icons; tips on a long press. *Command:* `/impeccable harden`.

## Persona red flags

- **Jordan (first-timer, desktop):** finds the keys in five seconds, then stalls: unlabelled ▶ / queue / folder,
  two orange dials floating in the scene, "partial 4", no cue that the Orchestra changes what the picker does.
- **Casey (phone, one hand):** keys in the thumb zone and the address keeps state, but everything else is at
  the top: a 25 px view switch, 36 px player icons with no names, ◐ read as dark mode.
- **Sam (keyboard, screen reader):** labels, roles and the focus ring are thorough; the contrast failures
  above; `aria-live` on the readout announces every chord; Space is claimed for the sustain pedal.
- **Mira (a cellist on a shared `/cello` link, on an iPhone):** expects the 3D of the link preview and gets a
  plan drawing in a dashed box; nothing says the bow can be dragged; nothing says what this is or who made it.

## Minor observations

- Vermilion means "vibrating", "idle" and "error"; amber carries seven roles.
- `theme-color` is cream for light-scheme phones on a dark-only app.
- Notes' measure runs to a median of 91 characters; its references are 11 px.
- A wordless pulsing red dot sits on the reading pages.
- Hovering a knob swaps its name for its value.
- IBM Plex Sans serves one page.
- The Chladni lines on the violin read as cracks; the pedals read as cups.

## Questions to consider

1. The engine has a room, seats and a lid. Why does the picture have none?
2. Is "lab bench" the right voice for the chrome, or should it be the hall's: a programme's type in place of
   10 px monospace?
3. Should the first sound change the picture, as the first note in a hall does?
4. Does the bar need sixteen instruments on show in the Orchestra, where they are already on the stage?

## Run notes

- Assessment B (detector) returned before Assessment A; A ran in its own context and never saw detector output.
  The synthesis was written after both.
- The detector saw each page only as loaded and idle, in the default look; menus, the picker sheet, a file
  playing and the vector display were judged from captures and source alone.
- The 404 page was scanned statically only.

## What this redesign takes on

Questions skipped: answered in advance by `artifacts/ui-alt/BRIEF.md` (direction: Evening Hall; scope: the
whole look; constraints: AGENTS.md's rules, no engine changes, no new permanent copy).

In scope for the Evening Hall branch: the fourth issue whole (a place for the instrument in 2D, vector lines
and 3D), the third (a type floor, contrast, drawn icons, monospace only for readings), the second's look (the
idle lamp, the play control at rest, the first sound marked by the light), and a quieter Orchestra periphery.
Left as they are, because they are behaviour and not look: the picker's counting in the Orchestra, file
failures' messages, tooltips on touch.
