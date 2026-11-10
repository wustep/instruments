# Orchestra: choosing what the keys play

Brief: `.autopilot/briefs/ORCH-KEYS.md`. Stephen: "in Orchestra mode, playing the piano keyboard at
the bottom picks instruments in a strange way."

## What it did before

The keys (on the screen, the computer's keys, a plug-in MIDI keyboard) dealt every note out by
register. Each melodic instrument took one note: the free one nearest the key's register, then a
piano, then whichever instrument was nearest, which let go of its old note. You could not choose.
Nothing on the stage said where a key would go, and the same key went to a different instrument
depending on what else was held. Two examples, measured with the C major chord C3 C4 E4 G4 (`held`
is each part's notes, from `scripts/shots-orch-keys.mjs`):

| lineup | before | after (default) |
|---|---|---|
| quartet | vn1 E4, vn2 G4, va C4, vc C3 | vn1 C4 E4 G4 (C3 moved up into its range) |
| Brandenburg No. 5 (flute, 2 vn, va, vc, **grand**) | vn1 E4, vn2 G4, va C4, vc C3; the grand and the flute nothing | grand C3 C4 E4 G4 |

## What it does now

**The keys play the instruments lit on the fallboard**, in the place where a single instrument has
its knobs (the knobs are already hidden in an ensemble). The row is a small keys sign, then one
glyph per instrument on the stage, then *split*.

- **Several at once.** A tap lights an instrument or puts it out. A key pressed sounds on every lit
  instrument, each moving the note by whole octaves into its own range (`placeNote`, as a file's
  lines already did). Two keys that land on the same note of one instrument hold it until the last
  is let go. The last lit instrument stays lit, so the keys always play something.
- **Default: the piano if there is one, else the highest melodic instrument** (by the middle of its
  register; the first seat when two are alike). So the quartet's keys play the first violin, flute
  over strings the flute, any lineup with a grand or upright the piano. I chose this over "all" or
  the old dealing as the default because it is the clearest: a key does one predictable thing, on
  the instrument a keyboard most likely means, and the fallboard shows which.
- **Split** (the fork after the instruments) is the old way, kept as a choice of its own: a chord
  dealt out by register, one note to each melodic instrument. It remembers the lit instruments for
  when it goes off. A tap on an instrument while split is on plays that one alone.
- **The plug-in keyboard's pedals, bend and mod wheel go with the keys** (before: to every part,
  including parts playing a file). The sustain, soft and middle pedals reach the lit instruments.
  When the keys move off an instrument, a pedal or bend the hand is holding is let go there. When
  they move onto one, it is taken up. A controller (CC1/2/11) stays where the hand left it on an
  instrument the keys leave, because each engine has its own resting value for it.
- **The keys' span follows**: the dimmed keys outside the lit instruments' ranges (union), and the
  computer keys' octave kept inside it. The soft and middle pedals show while a piano is lit.
- **The choice follows the lineup.** An instrument kept stays lit wherever it now sits (a flute
  added in front of the strings shifts every seat). A seat whose instrument is changed for another
  stays lit: the grid's change of instrument, or the preset buttons turning the grand into an
  upright. If every lit instrument leaves, the keys go back to the default. Until a choice is made,
  the default follows the lineup, so adding a piano gives it the keys. A piece, a dropped file, or
  turning the ensemble on starts from the default.
- **Phone** (≤ 760 px, or a phone held sideways): the row waits behind one button at the right of
  the fallboard, the same way the knobs wait behind ◐. The button shows the keys sign, the first lit
  instrument's glyph and "+n" for more. A tap opens the row over the fallboard. A tap elsewhere or
  Escape closes it.
- **No new words on the stage.** Every control has a `data-tip` and an `aria-label`: "violin 1",
  "split · one note each, by register", "the keys play", and for the phone button "keys · flute,
  cello". Seat numbers ("1", "2") appear only when a voice is on the stage twice, as in the routing
  grid. Fonts are the existing mono. Both 2D styles are styled (the vector style frames the lit
  instruments in blue).

## What did not change

- **File playback and many-to-many routing**: `Plan`, `schedule`, the routing grid, the line chips,
  duplicates (two cellos, two grands) and players are untouched. The routing e2e tests ("a tune on
  two instruments, the whole file on a second cello, two grands of their own", "a file on the one
  instrument shown goes onto several") pass unchanged on desktop and phone.
- **Audio**: no engine code changed. The same engines get the same calls. Only which parts get a
  hand-played note differs. No MP3s, because there is no engine change to hear. The golden and
  block-size tests are untouched.
- A single instrument (no ensemble) has no picker and plays exactly as before.

## Code

- `apps/web/src/orchestra/keys.ts` (pure): `KeysChoice`, `defaultKeys`, `toggleKey`, `setSplit`,
  `carryKeys` (the choice over a change of lineup), `keyParts`, `keysRange`, `keyTargets` (where a
  key sounds, split included: the old dealing moved here unchanged).
- `apps/web/src/orchestra/ensemble.ts`: `keys`, `keysChanged`, `toggleKey`, `splitKeys`,
  `keyParts`. `noteOn`/`noteOff` route through `keyTargets`. Pedals, controllers and bend go to the
  lit parts (`handOver` carries what the hand holds). `sync` carries the choice.
- `apps/web/src/ui/keys-for.ts`: the fallboard row and the phone button. `main.ts` puts them on the
  fallboard and keeps the keys' span and pedals in step. CSS at the end of `styles.css` and
  `vector.css`.
- README and the in-app notes describe the new behaviour.

## Tests

- Unit: `apps/web/test/keys.test.ts`, 6 tests: default, several at once (octave moves), split
  (the old dealing, takeover), toggle rules, span, the choice carried over lineup changes.
- e2e (`e2e/app.spec.ts`), desktop and Pixel 7:
  - "orchestra by hand: … the keys play the instruments chosen on the fallboard, several at once,
    or split by register". Lineup by taps, default flute, span C4–C7. The engines' own `sounding`
    reports confirm the flute alone, then flute + cello on a note from a fake plug-in MIDI keyboard.
    CC64 reaches only the lit parts and leaves the flute when it is put out. The last instrument
    stays lit. Split deals the chord out as before. On the phone, the row opens on the screen with
    no sideways scroll and closes on a tap elsewhere.
  - "orchestra keys: a piano on the stage takes the keys, and keeps them through its preset; a
    piece starts from its default".

## Pictures

Same states shot on main (`0382147`, before) and this branch (after), Chrome, desktop 1440×900,
phone 390×844 and 844×390 at 2×. The chord C3 C4 E4 G4 is held by hand in the desktop shots.

| | before | after |
|---|---|---|
| quartet, chord | `desktop-quartet-chord-before.jpg` | `desktop-quartet-chord-after.jpg` |
| fallboard | `desktop-quartet-fallboard-before.jpg` | `desktop-quartet-fallboard-after.jpg` |
| flute + cello lit (MIDI) | `desktop-flute-cello-chord-before.jpg` | `desktop-flute-cello-chord-after.jpg` |
| Brandenburg lineup, 3D | `desktop-3d-bach-chord-before.jpg` | `desktop-3d-bach-chord-after.jpg` |
| vector style, vn1 + vc | `desktop-vector-chord-before.jpg` | `desktop-vector-chord-after.jpg` |
| split (after only) | n/a | `desktop-split-chord-after.jpg` |
| phone | `phone-quartet-before.jpg` | `phone-quartet-after.jpg`, `phone-quartet-open-after.jpg` |
| phone sideways | `phone-landscape-quartet-before.jpg` | `phone-landscape-quartet-after.jpg`, `phone-landscape-open-after.jpg` |

Rebuild them with `BASE=<server> TAG=before|after OUT=<dir> node scripts/shots-orch-keys.mjs`.

## Left

- The stage itself does not mark which instruments the keys play. Only the fallboard does, and
  the instruments move when played.
- The routing grid has no "keys" row; the keys are chosen on the fallboard only.
- A flute or trumpet lit with a chord sounds one note (each is monophonic), though every pressed
  key lights.
- The choice is not remembered across reloads or across turning the ensemble off and on.
- Not tried on a real phone or a real MIDI keyboard. The MIDI path is the page's own Web MIDI
  handler, driven by a fake device, as in the existing Web MIDI test.
