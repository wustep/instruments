# Harp: a fifteenth instrument

A concert pedal harp, forty-seven strings C1–G7, plucked and left to ring; seven pedals; in 2D (both
styles), 3D and the Orchestra. General MIDI program 47 (byte 46).

## The engine (`packages/engine/src/core/harp.ts`)

* **Strings as their partials.** Each string is up to 64 exact two-pole resonators (40 for gut and nylon),
  set going by the pluck and left alone: a pluck at a place along the string (`aₙ ∝ sin(nπβ)/n^s`) through
  the finger's release (a low-pass), stiff (`fₙ = n·f₁·√((1 + B·n²)/(1 + B))`: the fundamental at pitch, the
  partials above it sharp). Every partial starts from nothing in sine phase: no click at the pluck.
* **Two planes.** A string swings across the soundboard (heard at once, soon spent) and along it (hardly
  moves the board, rings on), the two a fraction of a cent apart: each of the first eight partials is two
  resonators. This is the two-stage decay every recorded string shows (E5 falls 14 dB in its first half
  second and 10 dB in the next second and a half); before it the model's notes fell at one rate and its
  20 dB times were half an octave too long in the treble.
* **The tension's octave.** A string plucked at its middle has no even partials, yet the recordings' second
  lies 16–20 dB under the first: the string's own tension swings twice a cycle (Legge & Fletcher 1984). Added
  on the second partial, growing with the pluck.
* **The other strings answer.** A partial of another string within 12 ¢ of one of the plucked string's first
  twelve takes a share of it and rings on in its slow plane (Le Carrou et al. 2009): the harp's halo. With a
  string stopped by the hand 0.3 s after its pluck, what is left is 19 dB under the string left to ring.
* **Pedals.** Seven, by letter (D C B | E F G A), three notches. A note asked for by pitch finds its string;
  if none is tuned to it, the pedal that reaches it moves: the one that retunes no plucked string still
  ringing (a string that only answers another does not count), keeps the notes a file says are coming
  (`foresee`, 4 s ahead), travels least, and of two spellings the one first among the key signatures (B♭
  before A♯, F♯ before G♭). A ringing string under a moving disc is retuned over 12 ms and loses a fifth of
  its motion.
* **Glissando.** `noteOn(midi, velocity, time, gliss)`: a white key reached by a finger drawn across the keys
  is its string at whatever pitch its pedal gives; a black key is no string. So a glissando is the pedals'
  scale or chord.
* **Nothing damps it.** `damp` 0 (the default) is laissez vibrer: a key let go changes nothing. `damp` up to 1
  is the hand on the string as the key is let go.
* **The board.** A low cut (24 dB an octave near 100 Hz: the bass strings are heard by their upper partials),
  two resonances, a shelf, and four of the board's modes knocked by each pluck. Filters fitted to the
  recordings, not a model of the board.
* Cost: 3.7 on the stage's scale where a double bass is 2.9 (a piece left to ring keeps most of the strings
  sounding). It is counted at that, and the stage's budget stays the one it was sized for (two pianos and
  double basses): `heaviestCost` no longer follows whichever instrument is heaviest.

## Fitted to recordings, and judged honestly

Reference: the VSCO 2 Community Edition harp (Versilian Studios, CC0): twenty-three strings of one concert
harp, E1–F7, **one pluck each**, in `.cache/vsco-harp` (analysis only, never committed). Iowa MIS has no harp.
The analysis (`packages/engine/src/analysis/ring.ts`, the recording and the model alike): partials' levels and
frequencies, each partial's decay, the time to fall 20 dB, brightness at the start and a second later, the
attack, the level across the compass (the library's gain is its session's: the median difference is taken
out), the third-octave spectrum.

* Fit (`scripts/fit-harp.ts`: a (1+1) search from three seeds on every second string, then a coordinate
  polish): the fit half **1.63 → 0.91** in the judge's units (mean |error| in spreads).
* **Judge: NO CLEAR CHANGE.** `npx tsx scripts/judge.ts --instrument harp --before <the voicing first set by
  hand>`: held-out strings 1.59 → 1.32 (n = 11, Δ 0.27 ± 0.15). In two folds (`--folds`: each string judged by
  the voicing fitted without it, so all twenty-three are held out): 1.61 → 1.41 (n = 23, Δ 0.20 ± 0.15). The
  fit is better on the held-out strings by 1.3 to 1.8 standard errors, not the 2 the judge asks. Three rounds
  of fitting (before and after the two-planes decay was added) gave the same answer. One pluck a string, each
  with its own place under the finger (A2's octave is 2 dB under its fundamental, E3's 20 dB), is
  too little for eleven strings to tell a fit from a careful hand. **The fitted voicing ships as measured, not
  as proven better**: this is an exception to the rule that a fit is kept only with BETTER, and it is said
  wherever the numbers are given (the Notes page, the README, here).
* What moved on the held-out strings: the level across the compass 5.9 → 2.9 dB, the time to fall 20 dB
  1.09 → 0.54 octaves, the upper partials' decay 0.74 → 0.50 octaves, the attack 4.7 → 3.5 dB, the
  fundamental's decay 0.99 → 0.88 octaves. What did not: the partials' levels (9.8 → 10.3 dB), the spectrum
  (11.8 → 12.0 dB), the stretch (6.6 → 6.5 ¢), brightness a second later (0.24 → 0.36 octaves, just inside
  its guard).
* All twenty-three strings now (`apps/web/public/data/harp.json`, the Measurements page): brightness ×1.00
  and the time to fall 20 dB ×0.99 in the median, partials' levels 8.9 dB RMS, third-octave spectrum 11.0 dB,
  stretch 7.3 ¢.
* Level: a mezzo-forte middle C is −40 dBFS over its first half second, 3 dB under the piano's.

## Known weaknesses

* The verdict above. The recordings cannot say more.
* The bass (wire) strings: the recordings' own fundamentals are 13–54 dB under their upper partials and
  their partials' frequencies scatter (the stretch error is 14–19 ¢ there); the model's wire strings are
  smoother than a real harp's and have no buzz against the disc.
* The pluck is at one place for every note of a dynamic (near the middle; the `pluck` knob moves it). No
  harmonics, no près de la table but by the knob, no pedal slides or pedal buzz, no nail.
* The soundboard is filters. The knock at the pluck is four modes.
* One pedal moves at a time and at once (a harpist plans changes bars ahead; the engine sees 4 s of a file).
  Chromatic music faster than the strings stop ringing retunes sounding strings, as it would on a harp.

## The drawings

One plan in metres (`apps/web/src/ui/harp-plan.ts`) for the drawn 2D style, the vector style and the 3D
model: 1.885 m to the crown, the 47 strings plumb between the neck and the rising soundboard at the engine's
own lengths (so their tops draw the neck's harmonic curve), every C red and every F dark, seven pedals at
the base in the order at the feet. What moves is the engine's: each string swings as wide as the engine says
(the loudest few in their own shapes), each pedal stands in its notch and travels when a note moves it, and
each string is drawn from the disc that stops it. The pedal knobs follow the engine's own pedals. See
`docs/3d-reference.md`.

In the Orchestra the harp stands on the woodwinds' riser at their left, behind the first violins, its
profile to the hall (`orchestra/seats.ts`, `gl/harp3d.ts` `HARP_SEAT`). Its lines are matched by name (Harp,
Harfe, Arpa, Harpe, Hp., Hrp.) or program 47; both hands, often two tracks, are one harp; its chords are its
own (not a piano's). Files without a harp route as before but for a line named or programmed for the harp,
which used to go to the piano.

## Also in this PR

* The knobs of an instrument opened by its address showed their middles instead of the engine's values (every
  instrument but the piano): they are set once the engine is ready.
* The picker: the harp is with the keys (the sheet's first row is now piano, harp, timpani).

## Pictures

`harp-2d.jpg`, `harp-vector.jpg`, `harp-3d.jpg` (C3 ringing), `harp-phone-2d.jpg`, `harp-phone-3d.jpg`,
`orchestra-2d.jpg`, `orchestra-3d.jpg` (fifteen seats). No audio is committed.

## Tests and tools

* `packages/engine/test/harp.test.ts` (10), `blocksize.test.ts` and `golden.test.ts` with the harp.
* `apps/web/test/harp2d.test.ts`, `harp3d.test.ts`, `harp-routing.test.ts`.
* `e2e/harp.spec.ts` (8 cases: address, worklet at four rates, both 2D styles, glissando, 3D, its piece,
  Orchestra).
* `scripts/harp-refs.ts`, `calibrate-harp.ts` (`--table`, `--write`), `fit-harp.ts` (`--polish`, `--swap`),
  `judge.ts --instrument harp` (`--folds`), `set-voice.py`.
