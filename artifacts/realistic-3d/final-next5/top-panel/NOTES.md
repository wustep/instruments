# The top panel, rethought

Everything over the stage that is not the instrument: the instrument buttons, the note readout, the
2D/3D and style toggles, the Measurements and Notes links. Redesigned from what each thing is for, not
restyled.

## What was wrong

**The readout was monophonic.** It was written by the last note-on: `noteEl.textContent = midiName(n.midi)`.
Hold C–E–G–B on the piano and it said **B4 · 494.1 Hz**, as if that were what was sounding. In the
Orchestra it flipped to whichever of eighteen parts had begun a note last (**F5 · 699.0 Hz** over a
G7 tutti). It never went quiet either: the last note stayed at full strength after everything had stopped,
and a cello that had not played yet said **C2** (its open string's "focus").

**The other readouts followed the same one note.**
- The spectrum's red ticks were the predicted partials of the last note, drawn over a chord's spectrum.
- In the Orchestra the scope and its caption followed the "lead part" (the last to start a note):
  "A string · up-bow · 59 % from the frog" over a full symphony, changing owner several times a second.

**The controls were hard to scan.**
- Thirteen picks at 50 px with 10 px names: "clarinet bassoon" and "trumpet trombone timpani" ran together.
- On a phone the thirteen were 19 px wide with 7.5 px names abbreviated to fit ("vln.", "clar.", "tbn.").
  Too small to read or to touch.
- 3D, the ensemble and the vector style were three unlabelled boxes in a second row ("3d", four dots, a
  crosshair). 3D and vector were two independent toggles for what is one choice (vector only shows in 2D).
- The header above was a 38 px strip holding a lamp and two 11 px text links with no padding and no sign of
  which page was open.

## What it is now

Two bands, each with one job.

**The bar: what is on the stage and how it is seen.**
- The instruments in five families (keys · strings · woodwinds · brass · percussion), a hairline between
  families, every name whole and clear of its neighbour's. The one on the stage is lit with a short rule
  under its name.
- **orchestra**, named, at the end of the instruments (it was the four-dot box).
- At the far end: the piano's kind (grand · upright), the view as **one choice of three (2d · vector · 3d)**
  in one frame, and the two pages. The open page is underlined; each link is a 28 px target.
- Where thirteen do not fit at a readable size (a phone either way up, a window of 1320 px or less), **one
  button names the instrument and opens a sheet**: all thirteen, four to a row, a family to a row, each at
  least 44 px with its whole name; the piano's kind beside the piano. Choosing one shuts it. In an
  orchestra the button counts the players ("18 players") and the sheet stays open while instruments are
  tapped in.

**The band under it: what is sounding.** Readout, spectrum, then the scope (one instrument) or the parts
(an ensemble).

### The readout (the choice, and why)

It says everything that is sounding, taken each frame from the engine's own word on what sounds
(`audio.sounding`, an ensemble's `parts[].down`), not from the last key pressed:

| sounding | large line | small line |
|---|---|---|
| nothing | what was last heard, dimmed | |
| one note | `E4` | `329.6 Hz` (the instrument's own tuning) |
| two notes | `C4 E4` | `major third` |
| three or four | `C4 E4 G4 B4` | `Cmaj7` (or `3 notes` where they make no chord) |
| five or more | `C` (the chord), else its pitch classes, else `6 notes` | `8 notes · C2–C5` |
| an ensemble | the same, over all its parts | `G · 4 parts`, `12 parts · C3–E♭5` |

Considered and not chosen: a row of small voice chips (it grows without bound and moves the band), and a
bare "many" (it throws away what a player most wants to know, the harmony). Notes by name up to four is
what fits the box at a readable size; past that the chord's name carries more than a list would.

- A chord's notes are spelled as the chord spells them (B♭ minor's third is D♭, not C♯).
- The chord is named with the root in the bass first (C6 over C, Am7 over A), inversions over their bass (`C/E`).
- The box never changes size: a longer line is set smaller (four sizes), so the band and the stage under
  it do not move when notes sound.
- A one-voice instrument says the one note it sounds whatever keys are held; a cello's double stop says both.
- A new instrument starts empty: nothing is claimed that has not sounded.

### The other readouts

- **Spectrum:** with one note sounding, its predicted partials as before; with several, one mark at each
  sounding note's fundamental.
- **Scope, one instrument:** unchanged (one hammer, one bow: it is one thing, and its caption names its note).
- **Orchestra:** the scope steps aside for the **parts**: each instrument the orchestra has (desks together,
  `×2`), lit while it sounds, its own notes under it. On a phone the player's own row of instruments already
  lights; the readout says how many parts.

## Kept

Picking an instrument, the piano's kind, 2D / vector / 3D (each of the last two still turns off where it is
pressed again), the case toggle and the I key, Measurements and Notes and the way back, the lamp and the
MIDI socket, the plug-in keyboard, the file player under the band, the fallboard keys picker, the hairpin.
No new text on the instrument itself; no position-line tooltip; no banned font (Newsreader and IBM Plex as
before).

## Numbers

| | before | after |
|---|---|---|
| chrome height, computer (bar + band) | 38 + 94 = 132 px | 60 + 68 = 128 px |
| chrome height, phone 390×844 | 34 + 119 = 153 px | 44 + 88 = 132 px |
| pick on a phone | 19 × 37 px, 7.5 px abbreviated name | ≥ 84 × 59 px in the sheet, 10.5 px whole name |
| page link target | 11 px text, no padding | 28 px tall |
| readout with C–E–G–B held | `B4 · 494.1 Hz` | `C4 E4 G4 B4 · Cmaj7` |
| readout, Beethoven 5 tutti | `F5 · 699.0 Hz` | `B3 G4 F5 · G7/B · 5 parts` |

## Files

- `apps/web/src/ui/readout.ts`: `summarize`, `chordName`, `intervalName` (pure; `apps/web/test/readout.test.ts`).
- `apps/web/src/panel.css`: the whole panel, both bands, every size, the vector style's version.
- `apps/web/src/views/stage.ts`: the picker by family and its sheet, the view switch, what is gathered each frame.
- `apps/web/src/main.ts`: the bar's two places for the stage's controls.
- `e2e/top-panel.spec.ts`, `e2e/picker.ts` (the sheet opened before a pick where the picker is folded).
- `scripts/shots-top-panel.mjs`: these pictures, on any build.

## Pictures

`before-after-*.jpg`: the same state on `main` (left or top) and on this branch.
