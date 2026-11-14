# Calibration guide

How the sixteen instruments are compared with recordings, how a change to one is judged, what each is
compared with, where each stands, and what the method cannot tell. This is the one place for it: the
Measurements page shows the same numbers as charts, the Notes page tells the physics, and each pull request's
own notes (`artifacts/…/NOTES.md`) keep the detail of what it tried.

The seventeenth instrument, the zephyr, is not here: it is invented, there is no recording of one, and
nothing in it is fitted or judged. Its numbers are its physics and its maker's choices
(`npx tsx scripts/zephyr-tune.ts` prints them; `artifacts/round3/zephyr/NOTES.md`).

Contents: [the idea](#the-idea) · [running it](#running-it) · [how a comparison is made](#how-a-comparison-is-made) ·
[the judge](#the-judge) · [reference recordings](#reference-recordings) · [current scores](#current-scores) ·
[instrument by instrument](#instrument-by-instrument) · [players](#players) · [levels](#levels) ·
[known limits](#known-limits) · [history](#history)

## The idea

Every instrument here is a physical model: a string, a reed, a pair of lips, a membrane, computed sample by
sample. A model has constants nobody can look up exactly (how much a soundboard radiates at 2 kHz, how fast
a reed closes), so they are set by comparison with recordings of real instruments. Four rules keep that
honest.

1. **Recordings are measured, never played.** They are downloaded into `.cache/` (never committed), analysed,
   and that is all. No sample is ever the instrument's sound.
2. **Like with like.** The model plays the same note at the same dynamic, dry, as a note alone, and both
   sides go through the same analysis code. Where the recorded player used no vibrato, neither does the
   model. What is compared is the model alone (`human: 0`), not the player in the engine (see
   [Players](#players)).
3. **A change is kept on a verdict, not by ear.** `scripts/judge.ts` says BETTER, WORSE or NO CLEAR CHANGE,
   on notes the fit never saw.
4. **Realism over the number.** A fit will imitate whatever is in the recording, the room and the hiss
   included. A change that wins on a measure by a trick (a narrow EQ peak, noise added to match a noise
   floor, a decay stretched to stand in for a hall) is not kept, and a change that is plainly right but that
   the judge cannot see is kept and said to be so.

## Running it

```sh
pnpm refs:fetch            # the Steinway keys the fit uses (67 files, .cache/iowa)
pnpm refs:fetch --all      # every key (261 files, about 2.6 GB): the piano's held-out keys
pnpm calibrate             # the piano: measure, write the Measurements data   [--table] [--fit] [--decay-only] [--log "label"]
pnpm refs:ensemble         # strings, woodwinds, brass (172 files, about 1.4 GB, .cache/iowa-ens)
pnpm calibrate:ensemble    # those twelve: measure, write the Measurements data [--only horn,oboe] [--table] [--log "label"]
npx tsx scripts/calibrate-timpani.ts --write    # timpani      (each of these three fetches its own
npx tsx scripts/calibrate-harp.ts --write       # harp          recordings on its first run:
npx tsx scripts/calibrate-glock.ts --write      # glockenspiel  .cache/vsco-timpani, vcsl-harp, iowa-bells)

# a change, judged: this checkout's engine against an older one
npx tsx scripts/judge.ts --instrument horn --before <old checkout>/packages/engine/src/core/index.ts
npx tsx scripts/judge-all.ts --before <old checkout>/packages/engine/src/core/index.ts   # all sixteen, one row each
npx tsx scripts/judge-voice.ts --instrument horn --voice '{"shelfG":-10}'                 # a voicing tried before it is written in
```

An "old checkout" is any other copy of the repo: `git worktree add --detach /tmp/before <commit>`.
`ffmpeg` is needed (the recordings are AIFF). The first run analyses the recordings and caches the result
beside them; later runs take seconds (the piano's every-key judge, two minutes).

What the commands write:

| file | what it is |
|---|---|
| `apps/web/public/data/{calibration,ensemble,timpani,harp,glockenspiel}.json` | what the Measurements page draws |
| `docs/calibration-rounds.json`, `docs/ensemble-rounds.json` | one summary per logged round (`--log`) |
| `packages/engine/src/core/calibration-fit.json` | the piano's fitted constants (`pnpm calibrate --fit`) |
| `packages/engine/src/core/*-tuning.json` | each wind's pitch correction, per sample rate (`scripts/tune-*.ts`) |
| `packages/engine/src/core/bowed-fit.json`, the `*_VOICE` blocks in each core | the fitted voicings (`scripts/fit-*.ts`, written with `scripts/set-voice.py`) |

## How a comparison is made

**The render.** One note, from silence, held: dry (no room, no limiter), 44.1 kHz (the recordings' rate),
at the recorded pitch and dynamic. The dynamics pp, mf and ff are MIDI velocities 30, 70 and 112. The engine
is asked for the model alone (`human: 0`) and for no vibrato where the recorded note has none.

**The analysis** (`packages/engine/src/analysis`) is the same code for the recording and the render.

| family | analysis | what it reads |
|---|---|---|
| piano | `analyzeNote` (`note.ts`) | each partial's frequency (so the string's stiffness B and its tuning); each partial's decay, early (the first 10 dB: the "prompt" sound) and late (−15 to −35 dB: the "aftersound"); the partials' levels 60–160 ms after the attack; the third-octave spectrum of the first second and of the recording's own noise floor; level, attack time, brightness |
| bowed and blown (twelve instruments) | `analyzeSustained` (`sustained.ts`) | the steady middle of the note (25–85 %): harmonics 1–16, the balance of even and odd ones, harmonics over the noise between them (HNR), the third-octave spectrum and its centroid (brightness), the 10–90 % attack, pitch, vibrato rate and depth, level |
| timpani | `analyzeStruck` (`struck.ts`) | the modes' frequencies and levels, the two main modes' decay, ring time, brightness, attack, level, spectrum |
| harp, glockenspiel | `analyzeRing` (`ring.ts`) | the partials' frequencies (stretch, or their ratio to the pitch), levels and decays, the time to fall 20 dB, brightness at the start and later, the attack's knock, level, spectrum |

The Iowa files are chromatic runs, many notes to a file. `scripts/ensemble-refs.ts` cuts each run into notes,
names each by its pitch, and keeps the ones the model plays the same way (for a string instrument: on the
same string).

**The summary numbers** on the Measurements page and in the tables below:

* *harmonics*: for each note, the RMS difference of harmonics 1–12 (each relative to the note's strongest,
  down to 45 dB under it); the median over notes.
* *spectrum*: all of an instrument's notes pooled into one long-term third-octave spectrum, 100 Hz–10 kHz,
  model against recording, RMS over the bands within 45 dB of the recording's peak.
* *brightness*: the median ratio of spectral centroids, model over recording (×1.00 is a match).
* *noise*: the median difference in harmonics-over-noise, dB (positive: the model is cleaner).
* *attack*: the median ratio of 10–90 % attack times.
* *pp→ff*: the median level of the ff notes less that of the pp notes, beside the recording's.
* *pitch*: RMS of the model's pitch error in cents.
* the piano's own: *tuning* (RMS cents against the recorded piano's stretch, its overall +4.9 ¢ removed),
  *stiffness* (RMS of log₁₀ B), *decay by register* (the median model/recording ratio of T60 over partials
  1–3, early and late), *level error* per dynamic after one overall gain, *spectrum* (third-octave, only in
  bands 12 dB over the recording's noise floor), *brightness contrast* (how much more the upper partials
  gain from pp to ff than the lower, dB per partial).

## The judge

`scripts/judge.ts` answers one question: against the recordings, is engine B better than engine A?

* **Each error in units of the recording's own variation.** A real instrument's neighbouring notes differ:
  one is 2 dB louder, one a little brighter. For every measure the judge finds that spread in the recordings
  (the median difference between adjacent notes at one dynamic, ÷ √2) and divides the model's error by it. A
  score of 1 means the model is as far from a recorded note as that note's neighbour is; 2 means twice as
  far. A note's score is the mean over the measures.
* **Fit half and held-out half.** A fit only ever sees half the notes; the verdict comes from the other
  half. For most instruments the halves are the even and the odd MIDI notes. The timpani holds out two of its
  five drums, the harp and the glockenspiel every second string or bar, the piano the 65 keys between the 23
  the fit uses.
* **The verdict** compares the two engines note by note on the held-out half:
  * **BETTER**: the mean score fell by more than two standard errors, and by more than 0.05, and no guard broke;
  * **WORSE**: it rose as clearly;
  * **NO CLEAR CHANGE**: anything else.
* **Guards.** Every measure but level is a guard: if its held-out error grows by more than half a spread,
  the verdict cannot be BETTER, however much the others gained. This is what stops a fit from buying
  harmonics with brightness, or brightness with noise. (Level is scored but not guarded: a note's level in
  a recording is partly the player's.)
* **Two folds** (`--folds a.json,b.json`; harp, glockenspiel): with few strings, each half is judged by the
  voicing fitted on the other, so every string is held out once.

The measures: for the bowed and blown instruments *harmonics, centroid, noise, attack, pitch, level*; for
the piano *level, partials, centroid, prompt decay, late decay, tuning, stiffness*; for the timpani, harp and
glockenspiel their own (partials' frequencies and levels, spectrum, decays, ring time, centroid, attack,
level).

**Reading a verdict**

* A score is only comparable inside one run. The spreads and the notes paired come from that run's "before"
  engine, so the same engine can read 4.3 in one pull request and 4.6 in the next. Compare before with
  after, not one report with another, and never one instrument with another (the tuba's 5.0 carries a
  15 dB level offset: its recording session's gain against the level it is played at).
* The bowed strings are chaotic: a different random seed moves a string's score about as far as a small
  change does. The reeds can settle on two different regimes; whether a reed note is right is counted over
  many players and start times (`scripts/reeds-regimes-mc.ts`), not read from one render.
* The judge hears long notes alone. It cannot see short notes, joins between notes, releases, the delay
  before a note speaks, or a note's level against a neighbour that was never recorded. Those have their own
  tools (the rules table in `AGENTS.md` lists them) and their own tests.
* **Kept without BETTER.** The rule is BETTER or not kept, with one stated kind of exception: a change that
  fixes a fault the judge cannot see (a register 8 dB too loud, a string that rang a second too long, a
  short note that did not speak), measured some other way, with no guard broken and the verdict printed as
  it was. These are: the harp's voicing (the judge cannot tell the fitted one from the hand-set one), the
  glockenspiel's upper partials' levels, the cello's two polish rounds, the violin's and viola's low body
  mode, the viola's idle strings, the double bass's air mode, the trumpet's and trombone's tongued onsets.

**The piano's attack** has a judge of its own, `scripts/attack-judge.ts`: the burst at 6–12 kHz in the first
12 ms over the sustain, and how fast it dies, against the Steinway, on the notes whose recorded burst clears
the hiss by 10 dB, half of them held out.

## Reference recordings

All are used under terms that allow it, for analysis only.

| instrument | recording | what is used | cache | held out |
|---|---|---|---|---|
| piano | University of Iowa MIS: Steinway & Sons model B (211 cm), November 2001; two Neumann KM 84 8″ over the strings, 16-bit/44.1 kHz stereo, one gain for all dynamics | 23 keys (every fourth from A0, and C8) × pp, mf, ff = 67 notes for the fit; all 88 keys = 261 notes for the judge | `.cache/iowa` | the 65 keys between |
| violin, viola, cello, double bass | Iowa MIS, arco: violin (J. Jean-Francois), viola (C. Taylor, 1996), cello (J. Montes on a 1736 Stradivarius, 2001), double bass; anechoic chamber, one KM 84 at about 5 ft, mono | 79 / 78 / 67 / 112 notes, pp mf ff, the notes the model plays on the same string | `.cache/iowa-ens` | odd MIDI notes |
| flute | Iowa MIS (S. Feig, 2000), played without vibrato | 109 notes C4–C7 | `.cache/iowa-ens` | odd notes |
| oboe, B♭ clarinet, bassoon | Iowa MIS | 103 notes B♭3–A♭6 / 135 notes D3–B♭6 (concert pitch) / 116 notes B♭1–D5 | `.cache/iowa-ens` | odd notes |
| horn | Iowa MIS (J. Wiskus, 1997), a double horn, concert pitch | 87 notes B♭1–F5 | `.cache/iowa-ens` | odd notes |
| trumpet | Iowa MIS B♭ trumpet, without vibrato | 105 notes E3–E♭6 | `.cache/iowa-ens` | odd notes |
| trombone | Iowa MIS tenor and bass trombones (1997); the bass played with vibrato | 107 + 111 notes, E2–C5 and C1–B♭4 | `.cache/iowa-ens` | odd notes |
| tuba | Iowa MIS (1997) | 107 notes C1–C4 | `.cache/iowa-ens` | odd notes |
| timpani | VSCO 2 Community Edition (Versilian Studios, CC0): five pedal drums, three dynamics, two takes; close and room microphones summed | 24 strokes | `.cache/vsco-timpani` | drums 2 and 4 |
| harp | Versilian Community Sample Library (VCSL, CC0): a concert pedal harp, 23 strings E1–F7, each at two dynamics | 45 plucks | `.cache/vcsl-harp` | every second string |
| glockenspiel | Iowa MIS "Bells" (2001), anechoic, plastic mallets | 84 clean strokes on the bars G5–C8, pp mf ff | `.cache/iowa-bells` | odd bars |

The Iowa terms: "may be downloaded and used for any projects, without restrictions"
(https://theremin.music.uiowa.edu/MIS.html). Six five-second Steinway excerpts are shipped
(`apps/web/public/ref/`) for the Measurements page's side-by-side listening; nothing else is. Iowa has no
timpani and no harp. The flautist's vibrato runs (`.cache/iowa-vib`, fetched by hand) are used only to
measure a player's vibrato.

**What is odd about each set**, and matters when reading its numbers:

* *Every set*: its absolute level is its session's microphone gain. The Iowa viola was recorded 17 dB under
  the violin, the trombones 9 dB under the horn, the tuba 19 dB under it. Levels are compared inside an
  instrument, never across.
* *Piano*: one take a key, by hand, so a pianissimo note can stand 10 dB from its neighbour. Above about
  4 kHz the recording is mostly its own hiss. Neighbouring keys' early decay differs by a factor of ten
  (some partials sit on a soundboard resonance), so decays are compared by register, never note by note.
  A0's partials cannot be fitted. No note is released: there is no reference for the dampers.
* *Violin, viola*: no C4 or C♯4 in the sets, where their lowest body resonance lies. Vibrato on a fifth of
  the violin's notes and almost none of the viola's.
* *Cello*: vibrato on four notes in five (17 ¢ at 5.4 Hz).
* *Oboe, clarinet, bassoon*: the runs leave 50–100 ms between notes and need their own segmentation.
  Above 10 kHz (the clarinet's pianissimo: above 3 kHz) the recordings are room and microphone.
* *Horn*: the runs are uneven. Fortissimo covers the compass; mezzo-forte lacks C3–B3; pianissimo is only
  B♭1–B1 and C4–F5. The "pp→ff" figure (4 dB) compares different notes and says little.
* *Tuba*: its three lowest notes have no measurable fundamental, and its pianissimo is brighter than its
  mezzo-forte: session hiss, not tone.
* *Timpani*: a room, not an anechoic chamber, and the files end in a fade (only their first 60 % is read).
  The softest layer of drums 1 and 5 is in the noise and left out.
* *Harp*: each string plucked once at each dynamic, each pluck at its own place under the finger, so the
  recordings scatter more from string to string than any smooth voicing can follow.
* *Glockenspiel*: the recorded instrument is 10–30 ¢ sharp (the model is compared at the recorded bar's own
  pitch). A pianissimo stroke's upper partials are in the noise. The brass-mallet run is not usable.

## Current scores

As of 2026-11-14 (`npx tsx scripts/judge-all.ts`; the Measurements page's summaries beside them). The score
is the judge's on the held-out notes: 1 would be "as far from a recorded note as its neighbour". The other
columns are plain units, model against recording, over all notes ([what each is](#how-a-comparison-is-made)).

| instrument | notes (held out) | judge score, held-out | harmonics dB | spectrum dB | brightness × | noise dB | attack × | pp→ff dB (recorded) | pitch ¢ |
|---|---|---|---|---|---|---|---|---|---|
| violin | 79 (41) | 2.97 | 8.6 | 2.8 | 1.00 | −3.3 | 0.30 | 18.8 (19.1) | 2.0 |
| viola | 78 (37) | 4.30 | 8.6 | 3.4 | 0.97 | −2.5 | 0.85 | 16.2 (9.9) | 1.6 |
| cello | 67 (32) | 1.85 | 11.1 | 4.2 | 0.94 | +0.5 | 0.93 | 14.2 (12.5) | 2.5 |
| double bass | 112 (56) | 1.83 | 7.0 | 5.0 | 0.97 | +1.6 | 1.33 | 13.8 (11.0) | 2.0 |
| flute | 109 (53) | 3.30 | 7.1 | 4.7 | 0.97 | +5.4 | 1.06 | 10.2 (12.6) | 1.0 |
| oboe | 103 (50) | 2.34 | 8.0 | 10.5 | 0.92 | +2.0 | 1.31 | 14.2 (14.1) | 0.8 |
| clarinet | 135 (66) | 1.95 | 8.8 | 4.0 | 0.99 | −0.3 | 0.80 | 12.3 (13.8) | 1.2 |
| bassoon | 116 (55) | 2.07 | 8.6 | 8.7 | 1.05 | +1.6 | 0.87 | 11.9 (12.8) | 0.3 |
| horn | 87 (44) | 2.09 | 3.8 | 11.2 | 1.01 | +0.5 | 1.17 | 4.8 (4.4) | 0.2 |
| trumpet | 105 (51) | 3.49 | 4.2 | 3.3 | 0.93 | +1.0 | 0.64 | 9.2 (9.6) | 2.7 |
| trombone | 218 (109) | 3.97 | 6.7 | 5.5 | 1.05 | +0.3 | 0.79 | 22.0 (21.7) | 0.5 |
| tuba | 107 (52) | 5.00 | 5.7 | 14.4 | 0.97 | 0.0 | 1.17 | 21.7 (25.4) | 0.2 |

| instrument | strokes (held out) | judge score, held-out | what the Measurements page shows (mean error over all strokes) |
|---|---|---|---|
| piano | 261 notes (194) | 3.00 | tuning 3.7 ¢; stiffness within 15 %; level 8.6 / 5.0 / 5.7 dB at pp / mf / ff; third-octave spectrum 5.1 dB; held-out keys: level 4.2 dB, partials 8.6 dB, brightness 0.45 octave, early decay 1.0 octave, late decay 0.9 octave |
| timpani | 24 (12) | 3.50 | modes' frequencies 31 ¢, their levels 8.1 dB, spectrum 14.8 dB, decay 0.18 octave, brightness 0.24 octave, attack 2.1 dB |
| harp | 45 (22) | 1.28 | partials' levels 8.7 dB, spectrum 11.5 dB, decay 0.54 octave, time to fall 20 dB 0.51 octave, brightness 0.23 octave, stretch 6.1 ¢ |
| glockenspiel | 84 (42) | 1.28 | partials' ratios 21 ¢, their levels 7.6 dB, spectrum 5.5 dB, the pitch's decay 0.42 octave, brightness 0.12 octave |

The piano, by register (median ratio of the model's decay time to the recording's, partials 1–3, on the 23
fit keys):

| | A0–B1 | C2–B3 | C4–B5 | C6–C8 |
|---|---|---|---|---|
| early decay (prompt sound), model / recording | ×1.00 | ×1.04 | ×0.97 | ×0.78 |
| late decay (aftersound), model / recording | ×0.79 | ×1.22 | ×1.00 | ×1.11 |

Steps in level between neighbouring keys (median, dB; the Steinway's beside the model's, all 88 keys), at
mf: A0–B2 1.3 | 2.5, C3–B4 1.9 | 1.8, C5–F6 3.6 | 2.4, F♯6–C8 2.6 | 4.2. A real piano is not even from key
to key at a close microphone, and the model is about as uneven as the Steinway, except above F♯6, where it
is rougher.

Read with [the oddities](#reference-recordings) in mind: the horn's and tuba's large spectrum errors are
mostly bands 30–45 dB under the peak, where a recording has hiss and breath and a dry model has nothing;
the tuba's and the viola's level terms are session gain and one player's dynamics.

## Instrument by instrument

For each: how it is fitted, where the fitted values live, the verdicts that put it where it is, and what is
known to be off. The pull request notes named hold the tables and the audio.

### Piano

* **Fit.** `pnpm calibrate --fit` → `calibration-fit.json`. The stiffness curve B(key) is fitted directly
  (the two-asymptote model of Rigaud et al. 2013). Everything else moves by damped, bounded steps at a few
  breakpoints across the keyboard: string loss (late decay), bridge admittance per bridge segment (early
  decay), felt exponent (how much brighter loud is than soft), hammer velocity range (the pp and ff levels),
  register voicing (level at mf, ±6 dB), and an output EQ (third-octave, for the board's radiation and the
  microphones). `--decay-only` moves the decay levers alone.
* **Verdicts.** The decay, tuning and stiffness were fitted over thirteen logged rounds
  (`docs/calibration-rounds.json`) before the judge existed. Since 2026-11-14 the piano has a judge like the
  others (`scripts/piano-judge.ts`, `judge.ts --instrument piano`: all 88 recorded keys, the 65 the fit never
  sees held out). Its first verdicts:
  * The **output EQ** had been fitted band by band and stood at +12 dB at 4 kHz (its bound) beside −5 dB
    at 2.5 kHz, and +10.7 dB at 100 Hz between two bands at +2. On the held-out keys *no EQ at all* scored
    better than it (3.10 → 3.03). Each band averaged with its neighbours: **BETTER**, held-out 3.10 → 3.00
    (Δ 0.09 ± 0.02), fit keys 3.41 → 3.26; partials 8.82 → 8.60 dB, brightness 0.49 → 0.45 octave, no
    guard broken. Kept, and the fit now smooths its EQ by rule and prints every constant that ends on its
    bound.
  * A whole refit (`--fit`, one step, before the EQ was smoothed): NO CLEAR CHANGE (3.10 → 3.12). Not kept.
  * The share of the board's high-frequency path that is direct (0.6; the rest a 30 ms diffuse tail)
    raised to 0.8 or 0.9: NO CLEAR CHANGE (Δ 0.00). It does even the top keys (see "Level, note by note"
    below) but changes the character of every treble note, and the judge gives no reason: left as designed.
  * The attack (`attack-judge.ts`, whose sustain window was being cut short until this round: fixed): the
    6–12 kHz burst over the sustain is +1.5 dB against the Steinway on the fit half and +8.2 dB on the
    held-out half; its decay −0.8 and −1.9 dB. The two halves disagree, so the tick's level was left.
* **Known limits.**
  * *Bass aftersound*: about four-fifths as long as the Steinway's (×0.79 in A0–B1), with the string's own
    loss already at its limit; the board near the bass bridge sets it.
  * *Level, note by note*: 5 dB RMS from the recording at mf and ff, 7–8 at pp. Much of that is the
    recording (one take a key). Between neighbouring keys the model steps by 2–4 dB (median), about
    what the Steinway does, but above F♯6 by 4–5 dB where the Steinway steps by 2–3: a steady treble
    partial reads the diffuse part of the board's high-frequency path at one frequency, and that part is
    as large as the direct one.
  * *Brightness at the attack*: the first quarter-second is about a sixth of an octave brighter than the
    Steinway's in the median (it was a quarter before the EQ was smoothed), more at pianissimo.
  * *From pp to ff* the model brightens 0.4 dB per partial less than the Steinway. A felt whose stiffness
    depends on how fast it is struck (Stulov) is the missing piece.
  * *The soundboard* is about 150 plausible modes and a statistical path above them, not this board; the
    EQ stands in for its radiation and for the microphones.
  * *The upright* has no recording: it is the grand's model at an upright's measures.
* **Lessons.** Most "missing highs" were the recording's noise floor. A fit left unbounded runs away on any
  lever the measure does not feel. The treble's fast early decay was unison beating (a tuner sets unisons by
  beat rate, not by cents: the spread is capped at about 0.3 Hz). Render the model exactly as long as the
  recording that is analysed, or long decays read short.

### Violin, viola

* **Fit.** `scripts/fit-bodies.ts` (and `fit-half.ts` for single values), into `bowed-fit.json`: the body's
  radiation as fifteen half-octave bands fitted to every harmonic of the fit half's notes, with each note's
  level kept; a corner that rounds the bowed string's sawtooth more at soft dynamics; rosin noise; the bow's
  speed range.
* **Verdicts.** Bodies fitted note by note (#18): violin BETTER 3.86 → 3.03 (Δ 0.83 ± 0.22), viola BETTER
  5.20 → 4.34 (Δ 0.85 ± 0.20). Later level and ring fixes (the lowest body mode damped; the viola's idle
  strings coupled more loosely) were NO CLEAR CHANGE and kept as measured faults fixed.
* **Known limits.** Harmonic profiles are still 8–9 dB per note from the recordings (whose own neighbours
  differ by about 5.5). The violin's long tones start in a third of the recorded time (×0.30): the Iowa
  violinist eases into each note. The viola's dynamics are wider than the violist's (16 dB against 10). The
  violin's idle strings ring on about a second after a note (the recording: 0.4 s) and pull a short A5 flat.

### Cello

* **Fit.** `scripts/fit-cello.ts`, fit half, the judge's own score plus the long-term spectrum and the
  pp→ff spread; into `bowed-fit.json`. A bow of finite width, torsion, a bridge hill.
* **Verdicts.** BETTER 2.68 → 1.91 (Δ 0.77 ± 0.15) for the rebuilt chain; two polish rounds NO CLEAR CHANGE
  and kept for what they targeted (brightness at pp, the sample rate, noise). A body fit like the violin's
  was tried twice and judged WORSE (the centroid guard): not kept.
* **Known limits.** Pianissimo is too bright (×1.35) and fortissimo too dark (×0.76): the real cello's
  brightness doubles from pp to ff, the model's hardly moves. Soft attacks take about 0.3 s to settle.

### Double bass

* **Fit.** `scripts/fit-bodies.ts bass --levels`, into `bowed-fit.json`.
* **Verdicts.** BETTER against its unfitted start, 3.68 → 1.98 (Δ 1.70 ± 0.16). The air mode's radiation
  halved in #75 (B1–C♯2 stood 6–11 dB over the recording): NO CLEAR CHANGE, kept as a level fix.
* **Known limits.** Pianissimo is 5–10 dB short between 600 Hz and 4 kHz. D2 at mf is 9 dB under its
  recording. A few notes start on the wrong regime (about 4 %, most settling within a second).

### Flute

* **Fit.** `scripts/fit-flute.ts` (an evolution strategy on medians per register and dynamic; it predates
  the judge and holds nothing out) into `FLUTE_VOICE`; pitch by `scripts/tune-flute.ts` →
  `flute-tuning.json`.
* **Verdicts.** None for the voicing itself. Every change since (#59, #74, #77, #80) has been checked
  identical on the judge's notes (3.30 → 3.30).
* **Known limits.** In the low register at mf and ff the recording's second harmonic is about as strong as
  its first; the model's is about 10 dB short. The model is 5 dB cleaner than the recording (less breath
  between the harmonics). Dynamics 10 dB against the flautist's 12.5.

### Oboe, clarinet, bassoon

* **Fit.** `scripts/fit-oboe.ts`, `fit-clarinet.ts`, `fit-bassoon.ts`: a (1+1) evolution strategy over about
  thirty voicing constants on the fit half, scored with the judge's formula for harmonics, centroid, noise
  and attack, plus the steps between dynamics, the level across the compass, and a survey that every note
  of the compass stays on its own register at four sample rates. Into `OBOE_VOICE`, `CLARINET_VOICE`,
  `BASSOON_VOICE`; pitch by `scripts/tune-*.ts`. `--only a,b,c` refits a part of the voicing.
* **Verdicts.** Each BETTER against its start design: oboe 4.88 → 2.34 (Δ 2.54 ± 0.15), clarinet 4.77 →
  2.14 (Δ 2.62 ± 0.17), bassoon 3.68 → 2.07 (Δ 1.61 ± 0.12). This round a refit of the oboe's radiated colour alone gained only on the level term (the
  session's gain: 8.3 → 6.9 dB; harmonics 8.37 → 8.50 dB) and cut the low fundamental further: not kept.
* **Known limits.**
  * The *lowest notes' fundamental* is too weak on the oboe (B♭3–E♭4 at mf and ff: 20–30 dB under the
    strongest harmonic, the recordings 9–14) and on the bassoon (B♭1–F2). On the double reeds the reed
    shuts several times a period down there instead of once. A shelf to lift the fundamental was tried on
    the bassoon and judged WORSE. It needs a new reed model, not a filter.
  * *Regimes*: a double reed's held note sits near its octave. Counted over many players and start times,
    about 2 % of the oboe's and 1 % of the bassoon's notes land on the wrong one.
  * The *clarinet's* top third is about 17 dB short of even harmonics and its low register has about 9 dB
    too much of them; its pianissimo spectrum error (12 dB) is mostly the recording's noise above 3 kHz.
  * Soft low notes speak sooner than the players' (who swell in over up to a second).

### Horn, tuba

One engine (`lipcone.ts`: lips on a conical bore), two voicings.

* **Fit.** `scripts/fit-horn.ts` (`--instrument tuba` for the tuba; `--only` for a part of the voicing),
  as the reeds': fit half, the judge's score, dynamics, compass level, and every note on its own partial at
  four sample rates (`scripts/horn-regimes.ts`). Into `HORN_VOICE`, `TUBA_VOICE`; pitch by
  `scripts/tune-horn.ts`.
* **Verdicts.** Horn BETTER 7.77 → 2.26 (Δ 5.51 ± 0.23) against its start. Its radiated colour and steepening were refitted on 2026-11-14 (the fortissimo's harmonics above
  2 kHz stood 8–30 dB under the recordings'): BETTER 2.26 → 2.09 (Δ 0.17 ± 0.04); harmonics 4.96 → 4.58 dB,
  noise 2.40 → 1.98 dB, the ff spectrum 14.4 → 11.2 dB, every note still on its partial. Tuba BETTER 10.83
  → 5.89 (Δ 4.93 ± 0.24), then its breath noise refitted, BETTER 5.89 → 5.81. Its level was
  then set 4.5 dB lower for its limiter's sake (#84), which the judge's level term reads as 5.81 → 5.00.
* **Known limits.** The lips' fitted sharpness (Q about 50) is far above what is measured on players
  (3–10). The horn's soft middle register (no pp C2–B3 was recorded) is the model's own extrapolation. The
  tuba's pianissimo recordings are brighter than its mezzo-forte's (hiss) and the model does not follow
  them. Its level is set by its limiter and its place beside the horn, not by its recording.

### Trumpet

* **Fit.** By hand, each step judged (`scripts/trumpet-iter.ts`); the constants are in `brass.ts`. Pitch by
  `scripts/tune-trumpet.ts`.
* **Verdicts.** Three steps, each BETTER: the bell's radiation (12.93 → 7.24), breath noise at the lips
  (→ 4.11), level (→ 3.25). Eleven other attempts were NO CLEAR CHANGE or WORSE and dropped. The tongued
  onset was NO CLEAR CHANGE, kept for short notes.
* **Known limits.** Pianissimo is too bright in its upper harmonics (the lips close every cycle at every
  dynamic; a real player's do not when soft). Long tones start faster than the recorded ones (×0.64). The
  bore is an ideal harmonic series.

### Trombone

* **Fit.** `scripts/fit-trombone.ts`: as the horn's, with the bore's own measures left alone. Into
  `TROMBONE_VOICE`; pitch by `scripts/tune-trombone.ts`. Tenor and bass are one model at two sizes, each
  compared with its own recording. The alto has none.
* **Verdicts.** BETTER 7.70 → 3.97 (Δ 3.73 ± 0.25).
* **Known limits.** Pianissimo ×1.29 too bright, fortissimo ×0.75 too dark: the same one-mass lips. It is
  played 9 dB over its calibrated level in an ensemble (`PLAYBACK_DB`), its session having been recorded low.

### Timpani

* **Fit.** `scripts/fit-timpani.ts` then `polish-timpani.ts`, thirty constants, on drums 1, 3 and 5. Into
  `TIMPANI_VOICE`. Compared at the recorded drum's own pitch.
* **Verdicts.** BETTER 9.25 → 3.50 (Δ 5.75 ± 0.34, twelve held-out strokes).
* **Known limits.** Fortissimo is darker than recorded (272 Hz against 363) and the second mode 3–7 dB
  low. The 15 dB spectrum error is largely the recording's room: the fit once tried to make the drum ring
  like the hall, and that was held back by hand.

### Harp

* **Fit.** `scripts/fit-harp.ts`, on every second string, into `HARP_VOICE`.
* **Verdicts.** NO CLEAR CHANGE against the voicing first set by hand (1.59 → 1.32, Δ 0.27 ± 0.15, eleven
  strings), and again with the second dynamic (1.29 → 1.28). It is the one voicing shipped without BETTER:
  a string is 1.3 spreads from any voicing fitted without it, where 1.0 is how far it is from its
  neighbour. More strings would settle it; more plucks of the same ones do not.
* **Known limits.** The wire strings are the least like the recordings (partials' levels 12 dB out).

### Glockenspiel

* **Fit.** `scripts/fit-glock.ts`: not a search. Each family of partials is measured on each recorded
  stroke and regressed over pitch and dynamic. Into `GLOCK_VOICE`.
* **Verdicts.** BETTER against a textbook thin bar (`--before textbook`): 1.86 → 1.48 (Δ 0.38 ± 0.09), and
  1.74 → 1.28 since the comparison was moved to the recorded bar's own pitch. The upper partials' levels
  were later corrected (they had been read 14–18 dB low): NO CLEAR CHANGE on the whole score, kept.
* **Known limits.** No reference for rolls or for brass mallets.

The harp and the glockenspiel were measured in this round and left as they were (another piece of work
owns them).

## Players

Every instrument but the piano has a player in its engine (`human`, 0 to 1): no two notes quite alike, a
held note that breathes and wanders, a vibrato that belongs to the hand or the breath. What a player adds
was measured on the same recordings (how much the recorded player's notes differ from one another:
`scripts/*-variation.ts`, `winds-vibrato.ts`, `mechanical.ts`) and is given at or under what they show.

The player is never what is fitted or judged. At `human: 0` each engine is, bit for bit, the model before
it had a player (`scripts/same-sound.ts`, `packages/engine/test/players.test.ts`), and every calibration
script asks for exactly that. So a refit cannot be bought with a player's randomness, and a player cannot
cost the model its verdict. A player is checked separately: it must cost no note (on its pitch, there at
all), at any length (`scripts/player-regimes.ts`).

## Levels

A recording's absolute level is its session's gain, so loudness is set and checked differently:

* *Inside an instrument*, register by register against its own recording:
  `npx tsx scripts/levels-vs-refs.ts [--only bass --notes]`. A register out of line is a fault. A difference
  the recorded players also have (the clarinet's low register is 15–20 dB under the flute's top) is not.
* *Between instruments*, as played (room, limiter, and what each is played over its calibration,
  `PLAYBACK_DB`): `scripts/levels-table.ts`, `levels-compass.ts` (LUFS), `limiter-table.ts`.
* A brass level is changed only with its LUFS and peak measured at mf and ff through the room and limiter.

LUFS figures in different pull requests' notes come from different tools and passages; they do not line up
with one another.

## Known limits

Of the method, apart from each instrument's own:

* **One instrument, one player, one microphone** for each. A fit makes the model like that Steinway, that
  cellist. Where a set has an oddity, the model is at risk of learning it.
* **Long notes alone.** The fit and the judge hear held notes from silence. How notes begin, join and end
  in music is measured by other tools, against fewer or no recordings.
* **The noise floor reads as tone.** Above 4 kHz on the piano, 10 kHz on the oboe, 3 kHz on a pianissimo
  clarinet, and across a pianissimo tuba, the recording is hiss. The comparisons gate what they can
  (bands 12 dB over the floor on the piano, harmonics within 45 dB of the strongest elsewhere); the pooled
  spectrum figure does not, and overstates the error of a clean model.
* **A room reads as decay.** The timpani's recording has a hall in it; the model is dry.
* **Dynamics are assumed.** pp, mf and ff are taken to be velocities 30, 70 and 112. A player's mf is their
  own.
* **Level is not a guard**, so the judge can pass a voicing whose register balance is off. `levels-vs-refs.ts`
  is the check.
* **The measures are not hearing.** Each is a number that tracks something audible; none says a note sounds
  right. Before/after audio ships with every audible change for that reason.

## History

The old round-by-round log is in git (`git log -- docs/CALIBRATION.md`); the per-change tables and audio are
under `artifacts/`. In short:

| when | what | where |
|---|---|---|
| 2026-11-07/08 | Piano rounds R0–R13: literature defaults → fitted stiffness, decays by register and bridge segment, a second string polarisation, unison beat-rate cap, like-with-like render lengths | `docs/calibration-rounds.json` |
| 2026-11-08 | Strings and flute first measured against Iowa; matched vibrato; dynamics from bow position | `docs/ensemble-rounds.json`, `artifacts/round2` |
| 2026-11-08/09 | The judge (round 3); trumpet rebuilt in three judged steps; piano attack and release | `artifacts/round3/{trumpet,attack,release,audit}` |
| 2026-11-09/10 | Cello rebuilt (bow width, torsion); violin and viola bodies fitted note by note; double bass | `artifacts/realistic-3d/cello-audio`, `…/final-next5/{1-bowed,double-bass}` |
| 2026-11-10/11 | Oboe, clarinet, bassoon, horn, timpani, trombone, each fitted and judged BETTER | `artifacts/realistic-3d/final-symphony/*` |
| 2026-11-11 | Three audio audits (levels, releases, joins, reed regimes) | `…/final-symphony/audio-audit`, `artifacts/round3/audio-audit-{2,3}` |
| 2026-11-11/12 | Tuba, harp, glockenspiel; players in every engine; levels against the recordings | `artifacts/round3/{tuba,harp,glockenspiel,*-polish,consistency}` |
| 2026-11-14 | Everything re-measured; this guide; a held-out judge for the piano; the piano's output EQ smoothed (BETTER) and the horn's fortissimo refitted (BETTER); the other fourteen measured as they were | `artifacts/round3/calibration` |
