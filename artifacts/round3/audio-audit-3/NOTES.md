# Audio audit 3: the seven leftovers

Seven instrument faults were left open by the earlier rounds (`../audio-audit/`, `../audio-audit-2/`,
`../../realistic-3d/final-symphony/winds-midi/`). Each was measured again on `main` (a561109), its cause
looked for in the model, and fixed where a fix measured better and made nothing worse. Each has a folder
here with its own `NOTES.md` (how to reproduce, the cause, the numbers), its before/after clips (MP3,
128 kb/s) and stacked spectrograms (the old engine on top).

| Leftover | Outcome | Numbers | Folder |
|---|---|---|---|
| Flute cracks stepping up across a register break | **Fixed** | rises across a break not on their note: 526 → 28 of 1008 (48 kHz; 533 → 28 at 44.1 kHz); the upper note speaks in 145 → 15 ms (median); crack 10 → 0 ms (median), 135 → 0 ms (p90) | `flute/` |
| Viola A♯4 about 8 dB hot | **Fixed** (it was its neighbours that were weak) | A♯4 over A4 and B4: 9.8 → 5.3 dB (the recording: 3.3 dB); model − recording, held-out notes: 6.14 → 4.45 dB RMS at mf, 4.90 → 3.59 at ff; tail after a note that rings an open string: 1.73 → 0.32 s (the recording: 0.35 s) | `strings/` |
| Violin quarter notes an octave low (loud D5, C5 after a rest) | **Not fixed**: measured, cause found | the bowed string is never an octave low (0 of 1404 test notes, 0 of 3536 notes of the pieces); what reads low is the note before, still ringing on an open string (55 readings of 3536, all ringing before the note began) | `strings/` |
| Oboe and bassoon octave flips (bassoon C♯3, D3) | **Not fixed**: measured, cause narrowed | wrong regime, all contexts and dynamics, by Monte Carlo: oboe 519 of 23 328 (2.22 %), bassoon 277 of 27 864 (0.99 %) | `reeds/` |
| Bassoon about 2 % on a wrong overtone | **Not fixed**: the same fault | in the bundled pieces 0.4–0.6 % (Beethoven 5 I bassoon: 1.9 notes a performance of 523); 3.3 % on the eleven worst pitches | `reeds/` |
| Trumpet low notes slow to come back after a tongue stroke (55–65 ms) | **Fixed** (it was a note joined on another partial of the bore, not a repeated one) | joined a fourth below, E3–C4: speaks in 72.5 → 30 ms (median; the latest 92.5 → 60); cells with a median of 45 ms or more: 234 → 14 of 976; notes lost: 22 → 0 of 3456; Beethoven 5 I trumpet II: 65 → 20 ms | `brass/` |
| Fast trombone slurs losing notes | **Fixed in part** | tenor slurs told ahead, notes lost: 118 → 70 of 364 (at 139 ms a note 21 → 6 of 52, at 170 ms 9 → 2); the slide short of its place on the beat: 18.4 → 0 cm (a scale at 200 ms a note); alto 62 → 43, bass 106 → 62 | `brass/` |

## What was fixed

### Flute: a rise across a register break (`flute/`)

`packages/engine/src/core/flute.ts`. Three causes, measured with a tracker of the tube's own modes
(`scripts/flute-rise.ts`; a note an octave low still reads "in tune" to a pitch measure, which is why the
earlier rounds saw a tenth of this):

1. The tube was stretched to the new note instead of re-fingered, which carries the standing wave along
   with its mode number: C♯5 → D5 bent 554 Hz down to the D4 tube's first mode, and the jet then needed
   150–250 ms to overblow it. That was the crack. A fingering going up a register on another tube now
   replaces the tube (two reflections crossfaded over 10 ms).
2. No vent: the tube's second and fourth modes were as ready to sound as its third. A leak at the wanted
   mode's pressure node for D5, E♭5 and D6–C7, on a note joined to another only.
3. A slur gave the jet no sharper aim, so the new mode took 130–300 ms to grow.

A note alone from silence is bit-identical (the judge: NO CLEAR CHANGE, held-out 3.30 → 3.30). The golden
was blessed for the flute alone: its passage's E5 used to spend about 140 ms on the octave below. In the
bundled pieces' flute parts (four seeds, 3872 notes): lost notes 70 → 1, impure 29 → 2.

Clips: `flute/steps-before.mp3` / `-after.mp3` (steps across both breaks), `leaps-*`, `scale-*`,
`own-piece-*` (Bach, Bourrée anglaise), `beethoven5-ii-*`; tables `flute/flute-rise-before.txt` / `-after.txt`.

### Viola: the notes beside A♯4 (`strings/`)

`packages/engine/src/core/bowed.ts` (`idleCoupling: 0.2` on the viola: the mechanism the cello and the bass
already have) and `bowed-fit.json` (the viola's bands refitted). A♯4 was level with the Iowa viola's; its
neighbours were 9–11 dB under. The viola's idle open strings were fully coupled to the bridge: one in tune
with the note bowed beside it pinned the bridge at that partial, so G4, C5, D5 (and C4, G5, A5) sat 6–13 dB
under their neighbours and rang on for seconds after the bow had left, and the bands, fitted around those
holes, left A4 and B4 as weak. The coupling ratio is the one whose release tails are the recording's. The
judge: NO CLEAR CHANGE (held-out 4.42 → 4.29; harmonics 10.06 → 9.59 dB, attack 1.02 → 0.69 oct). Violin,
cello and bass renders are identical.

To know: the viola is 2–3 dB more present in a piece (the Haydn viola line −23.3 → −20.4 LUFS: its G's, C's
and D's are no longer notched), and a held ff note is 1.4 dB softer.

Clips: `strings/viola-scale-before.mp3` / `-after.mp3` (the scale through A♯4), `viola-haydn-*`.

### Trumpet: a note joined on another partial (`brass/`)

`packages/engine/src/core/brass.ts`. The 55–65 ms was not a repeated note (a pitch struck again is back at
level one round trip of the bore after the beat, about 10 ms, and is bit-identical now) but a note joined
to the last on another partial: C4 after G3 in Beethoven's Fifth took 65–82 ms. A tongue stroke made ahead
of its note was let go where the lips' kick is never given (so a file's notes got none, the hand's did), and
the valves and lips were set on the beat, under the new note, not under the stroke. Now the lips are kicked
with the next sample when the partial changes (and after a rest of 40 ms or more held by the tongue), and
the valves and lips move once the tongue is down. The judge: NO CLEAR CHANGE (3.23 → 3.23, long tones
identical). In the bundled parts no note is lost and none is later.

It costs something: of 92 rising steps onto a neighbouring partial from C♯5 up, 11 leave a hole of 20–47 ms
where it was under 15 (7 go the other way); 31 of 976 cells speak 15 ms or more later, mostly notes the
measure had read as instant; C♯6 after B5 speaks in 42.5 → 70 ms. A full first-attack kick cured the holes
but accented low notes (cells over +3 dB: 15 → 41 of 356), so it is at half.

Clips: `brass/trumpet-low-repeated-joined-before.mp3` / `-after.mp3`, `trumpet-beethoven5-i-*`,
`trumpet-rejouissance-*`.

### Trombone: fast slurs (`brass/`)

`packages/engine/src/core/trombone.ts` (and one read-only method in `mono.ts`, `upcoming`, which only the
trombone calls). The slide set off on the beat, so a note a third or more away spent its first 65–90 ms
under the soft tongue; a valve's loop moved at the slide's speed (the F attachment: 115 ms or more); and
detached notes after a rest held by the tongue were never kicked. Now, for a slur known to come, the slide
leaves ahead by its travel time and is in place on the beat (as long as the note sounding keeps 35 ms of its
own); a valve turns in its own time (12 ms after the soft tongue); notes of 0.3 s or less are kicked after a
held rest. The judge: NO CLEAR CHANGE (3.97 → 3.97, long tones identical). In the bundled parts none is
worse ("Toward Morning": nine in ten joined notes within 82.5 → 55 ms; the Air is tongued and unchanged).

It costs something: three of 126 cells lose one more note (runs where every note is 26–36 cm of slide from
the last: the note now speaks on its beat, in 30 ms where it took 105, but its tail lies under the next
move's soft tongue, where the measure reads), and the joined scale on the valve notes at the bottom speaks
in 22.5 → 30 ms.

Clips: `brass/trombone-fast-slur-before.mp3` / `-after.mp3`, `trombone-toward-morning-*`, `trombone-air-*`.

## What remains, and why

### Trumpet and trombone (`brass/`)

Repeated low trumpet notes are as they were (a dip of 9–11 dB for 15–20 ms). A joined trumpet note on a new
partial still takes about 30 ms, not a first attack's 15–20: the model's lips are a passive resonator the
bore has to lock. On the trombone, notes shorter than the slide's travel plus 35 ms are still lost (at
4 m/s, 26 cm takes 89 ms: a player would use an alternate position); lip slurs at speed land on another
partial as before; tongued joined notes keep the slide on the beat (sending it ahead under the tongue lost
75 of 260 where 25 were lost). The horn has the same never-fired kick as the trumpet had and was not
touched: on the trumpet and the trombone the kick helped only under conditions, so it is not to be
switched on blindly.

### Violin "an octave low" (`strings/`)

The string never leaves its motion at pitch. An idle open string in tune with the bowed note carries a wave
only 12 dB under the bowed string's and rings on (1.13 s to fall from 10 to 30 dB under the held level; the
Iowa violin takes 0.41 s), and C5–E♭5 are 5–10 dB under the recording at ff: a C5 after G5 is heard with G5
still sounding over it, the third and second harmonics of C4. Loosening the idle strings as on the viola
was tried with the bands refitted: fewer low readings on test notes (18 → 4 of 1404) but none fewer in the
pieces (55 → 49, one part worse), A5 3–4 dB further over the recording, and the judge could not tell the
variants apart (held-out Δ −0.22 to +0.02, ± 0.15). The violin's body was fitted around the open-string
notches: a fix is a joint refit of coupling, bands and the body's B1 modes, not one number. Left as it is.
Clips: `strings/violin-c5-d5-before.mp3`, `violin-haydn-before.mp3`.

### Oboe and bassoon regimes (`reeds/`)

Below A♭3 on the bassoon and C♯5 on the oboe the reed does not shut once a period (the motion the theory of
conical reeds expects): it shuts two to nine times, at a third of the depth one closure needs, and the note
is its octave or twelfth the moment two or three of those closures are alike. The train comes from the
attack (spaced at the quarter-wave of the cylinder that stands in for the cone's missing apex: 604 Hz on the
bassoon, 2.05 kHz on the oboe) and is sorted only over seconds, the loop losing 0.3 % a round trip. Eleven
changes were measured against the Monte Carlo baseline (the tongue's withdrawal, the ends' low-pass, the
apex's length, wall loss, reed damping, noise, a low-pass in the apex branch, mouth pressure by pitch): each
moved the flips to other notes or failed the judge (WORSE: 2.33–3.26 against 2.07). A fix is a new voicing
of both instruments (the apex as an inertance with the reed's volume, heavier losses, reed flow and mouth
pressure by pitch, then the tuning tables at four rates and the radiation refitted), not a patch. The test
for it is in place: `scripts/reeds-closures.ts` should print one closure a period across the low registers,
and `scripts/reeds-regimes-mc.ts --diff` should show the fall. Against the recordings, none of the notes
that read as the octave (bassoon A2, B2, E♭2, E2) is weak in odd harmonics on the real instrument: they are
faults, not colour. Clips: `reeds/bassoon-named-before.mp3`, `bassoon-passage-before.mp3`,
`oboe-named-before.mp3`.

## Reproduce

```sh
B=<a checkout of a561109>/packages/engine/src/core/index.ts
npx tsx scripts/flute-rise.ts --rows --also falls            # this engine; --engine $B for the old one
npx tsx scripts/strings-levels.ts viola                       # model − recording, note by note
npx tsx scripts/strings-octave.ts                             # the violin's string and its sound, every 5 ms
npx tsx scripts/strings-tails.ts viola                        # release tails against the recordings (violin too)
npx tsx scripts/reeds-regimes-mc.ts --jobs 4                  # the reeds' regimes by Monte Carlo (75 s)
npx tsx scripts/reeds-closures.ts                             # the reed's closures a period
npx tsx scripts/trumpet-retongue.ts                           # the trumpet's joined and repeated notes
npx tsx scripts/trombone-slurs.ts                             # the trombone's slurred runs, by size
npx tsx scripts/judge.ts --instrument viola --before $B       # and flute, trumpet, trombone, violin, cello, bass
```

Not part of this audit, noticed on the way: `git ls-files | grep -iE '\.(aiff?|wav|flac)$'` prints sixteen
files under `artifacts/audio/` (the app's own early demo renders, not reference recordings), though
AGENTS.md says it prints nothing.
