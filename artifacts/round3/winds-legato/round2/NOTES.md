# Winds, round 2: a player in the woodwinds, and no bell lit in 3D

Branch `improve/winds-legato` (PR #74), on top of round 1 (`5a2f2ee`). Stephen listened to round 1's clips
and said the winds "still sound a bit mechanical or something", and yes, take the bells' shimmer out in 3D.

I cannot hear. Everything below is measured: the engine's notes and the University of Iowa MIS players'
recorded notes read by the same tools (analysis only; the recordings stay in `.cache/`), and the clips are
for the ear that can.

## What still made them mechanical, in plain words

Round 1 fixed how the notes join. What was left was the notes themselves, and the players were nowhere in
them. Measured against the Iowa flautist, oboist, clarinettist and bassoonist:

**1. The flute had no vibrato you could hear.** The engine asks for one (6 % of the breath, from half a
second into a breath), but its tone hardly follows its breath: 10 % more breath moves its level by
−0.7 to +0.1 dB. So the vibrato came out at 0.4 cents and 0.08 dB, where the Iowa flautist's (the vibrato
runs, fetched for this) is 12 cents and 1.8 dB. And what little there was was a generator: one sine
(98 % of the pitch's movement), each cycle as long as the last (1 % apart). The flautist's is 67 % one sine,
11 % from one cycle's length to the next and 22 % in its swing, and moves the harmonics above the
fundamental three times as far as the fundamental (Fletcher 1975 says the same). In the Beethoven excerpt
the flutes are the loudest part a fifth of the time; there they played like an organ pipe.

**2. A held note did not move.** Its pitch wandered 0.1–0.3 cents from one tenth of a second to the next
(the players 0.6–3.5), its level a few hundredths of a dB at mf and ff.

**3. No two notes differed.** From one note to the next the pitch was the same within 0.1–1.3 cents (the
players: ±3–10), the strength within 0.1–0.3 dB on the flute and clarinet (±1.4–2.8), the attack's
length within 14–46 % (50–150 %). Repeated notes in the Beethoven excerpt began alike: their first
moments correlate 0.72 (flute) to 0.96 (oboe; a tenth of them over 0.996), where the violins' are 0.22–0.33.

**4. Notes stopped dead.** Let go, a note was 10 dB down in 30 ms (flute), 36 (oboe), 14 (clarinet), 44
(bassoon). The players take 68, 98, 40 and about 150.

Not causes, measured and left: the joins (round 1's work: unchanged), the room (the same for every
instrument and not what was named), the dynamics (the automatic phrasing already varies them, 4–9 dB
across a part).

## What changed

**A player in each woodwind** (`packages/engine/src/core/winds-human.ts`; `FLUTE_HUMAN`, `OBOE_HUMAN`,
`CLARINET_HUMAN`, `BASSOON_HUMAN`; the parameter `human`, 1 by default, as the tuba and trombone have).
What it does is put where it is heard and nowhere it could change what the reed or the jet does: the
tube's length (a few cents), what leaves the instrument (its level, and the harmonics above the
fundamental further than the fundamental), the attack's timing, the breath's release.

* **The flute's vibrato is the flautist's:** in pitch, in the fundamental's level and further in the
  harmonics above, every cycle its own length and swing, the rate a little different each breath.
* **The double reeds' vibrato is the bassoonist's:** a few cents, deeper soft than loud. The oboe's is its
  breath alone (the Iowa oboist plays without vibrato, and see below). The clarinet has none, as a
  clarinettist in an orchestra plays.
* **A held note's pitch and breath wander**, the breath more when soft.
* **Each note its own:** where the player puts its pitch (a few cents; the same again on a repeated pitch),
  its strength, and on the flute and bassoon the breath's rise; on all four the tongue's push.
* **A file's long note before a rest dies away** as the players' do (a note held half a second or more,
  with no note within 0.4 s after it; or the part's last). A note with another soon after, and any key let
  go by hand, stops as it did: nothing says a rest is coming, and a note 50 ms later must still sound
  detached.

`human: 0` is the model alone, bit-identical to `5a2f2ee`: what is fitted and judged.

**3D: no wind's bell is lit any more**, sounding or not: the oboe's, the clarinet's and the bassoon's, and
the trumpet's, horn's, trombone's and tuba's (Stephen's "any other wind bells"). Kept: the brass's glow
along the air's path through their valves, the reeds' blades moving with their opening, the breath at the
mouthpiece. **2D is untouched** (no 2D drawer shares this code).

## The numbers

"Before" is `5a2f2ee`, "after" this head. The recordings and the engine are read by the same tools:
`scripts/winds-vibrato.ts`, `winds-variation.ts`, `trombone-variation.ts --instrument <wind>`,
`mechanical.ts`.

### The vibrato (mf; quartile medians)

| | pitch | level (fundamental / above) | cycle to cycle: length / swing | one sine | rate |
|---|---|---|---|---|---|
| flute, Iowa (vibrato runs) | 12.1 ¢ | 1.66 dB (1.33 / 2.68) | 13 % / 26 % | 0.64 | 4.85 Hz |
| flute, before | 0.4 ¢ | 0.08 dB | 1 % / 4 % | 0.98 | 5.00 |
| flute, after | 12.1 ¢ | 1.39 dB (1.30 / 2.62) | 11 % / 20 % | 0.64 | 5.00 |
| bassoon, Iowa | 2.7 ¢ | 0.13 dB | 12 % / 34 % | 0.73 | 3.90 |
| bassoon, before | 0.1 ¢ | 0.24 dB (no one rate) | 21 % / 27 % | 0.15 | 5.10 |
| bassoon, after | 2.6 ¢ | 0.12 dB | 11 % / 26 % | 0.67 | 4.10 |

At pp and ff the flute's is 10.5 / 15.5 cents (Iowa 10.7 / 15.6), its fundamental 1.0 / 1.0 dB (1.0 / 1.0),
the harmonics above 5.5 / 3.8 dB (5.3 / 3.8); the bassoon's 3.7 / 0.9 cents and 0.35 / 0.05 dB
(3.9 / 0.9, 0.35 / 0.05).

### A held note, and from one note to the next

Held notes without vibrato (`winds-variation.ts`, the recordings' non-vibrato runs; pp / mf / ff where the
three differ), and from one note to the next across a run (`trombone-variation.ts --instrument`):

| | Iowa | before | after |
|---|---|---|---|
| held pitch wander, flute | 1.6 / 1.1 / 1.2 ¢ | 0.3 | 1.2 |
| … oboe | 1.4 / 0.7 / 0.6 | 0.1 | 0.7 |
| … bassoon | 3.5 / 2.5 / 1.0 (its vibrato in it) | 0.1 | 0.8 (no vibrato) |
| … clarinet | (its runs do not come apart into held notes) | 0.2–0.5 | 0.6–0.8 |
| held level wander, flute | 0.51 / 0.11 / 0.18 dB | 0.31 / 0.07 / 0.04 | 0.31 / 0.11 / 0.06 |
| … oboe | 0.43 / 0.07 / 0.03 | 0.08 / 0.04 / 0.02 | 0.13 / 0.07 / 0.03 |
| … bassoon | 0.17 / 0.07 / 0.07 | 0.04 / 0.04 / 0.03 | 0.08 / 0.04 / 0.03 |
| … clarinet | – | 0.04 / 0.01 / 0.00 | 0.11 / 0.04 / 0.02 |
| note to note: pitch, flute / oboe / clarinet / bassoon | ±3.2–4.7 / 7.6–9.5 / 6.5 / 5.1–7.3 ¢ | ±0.3–1.3 / 0.6–0.8 / 0.1–0.9 / 0.2–0.3 | ±3.7 / 2.8 / 3.1 / 2.7–3.0 |
| … strength | ±2.0–2.8 / 2.0–2.8 / 1.4–3.0 / 2.0–2.3 dB | ±0.2–0.3 / 0.4–1.7 / 0.07 / 1.1–1.2 | ±0.8–1.5 / 1.3–2.3 / 0.65 / 1.1–1.5 |
| … the attack's length | ±70–149 / 61–110 / 28–74 / 48–76 % | ±14–27 / 21–46 / 15–28 / 58–75 | ±33–49 / 40–48 / 16–28 / 68–87 |

The players' pitch from one note to the next is a run of notes played alone, with nothing to tune to: the
player here puts about half of it on each note. The clarinet's attack does not vary (its rise is the
model's, below); its strength varies less than a player's.

### Letting go (a file's note of 1.5 s before a rest; to −10 / −20 / −30 dB)

| | Iowa | before | after |
|---|---|---|---|
| flute | 68 / 108 / 134 ms | 30 / 80 / 132 | 64 / 96 / 122 |
| oboe | 98 / 140 / 168 | 36 / 46 / 64 | 96 / 122 / 132 |
| clarinet | 40 / 68 / 88 | 14 / 20 / 24 | 36 / 52 / 64 |
| bassoon | about 156 / 214 / 226 (three notes) | 44 / 66 / 80 | 130 / 184 / 210 |

### Beethoven's Fifth, II, as the Orchestra plays it (100 s from 240 s, each part alone as seated; `mechanical.ts`)

| | before | after |
|---|---|---|
| flute 1, its held notes' vibrato | none | 11.1 ¢ at 5.3 Hz, ±0.58 Hz and ±21 % from note to note, 70 % one sine |
| flute 1, repeated notes' beginnings correlate | 0.72 (a tenth over 0.86) | 0.39 (0.67) |
| oboe 1, held pitch / repeats | ±0.5 ¢ / 0.957 | ±1.2 ¢ / 0.938 |
| clarinet 1, held pitch / repeats | ±0.3 ¢ / 0.900 | ±1.0 ¢ / 0.893 |

### The clips

* `winds-before.mp3` / `winds-after.mp3` (22.6 s): the same Beethoven 5 II excerpt as round 1, the eight
  woodwinds from 284 s, as the Orchestra routes and plays them. The flutes' 34 joined notes: none late,
  none on a wrong register, before and after (90th percentile 15 ms to speak in both).
* `flute-swaps-before.mp3` (round 1's after, `5a2f2ee`) / `flute-swaps-after2.mp3` (19.7 s): the flute
  alone over both register breaks. Its 50 joins: none late, none on a wrong register, before and after.
  What changed is the player: the slow slurred line at the end has the flautist's vibrato, and no two of
  the quick notes are quite alike.
* `flute-solo-before.mp3` / `flute-solo-after.mp3` (16 s): Toward Morning's first flute from 45 s, alone,
  as played. Nine of its 18 notes are held over a second; on those the pitch swings 0.4 cents before (dead
  still) and 29–40 cents peak to peak after (35 the median), the level 0.4 dB and 3.9 dB.
* `winds.png`, `flute-swaps.png`, `flute-solo.png`: spectrograms, before on top.
* `oboe-3d-bell-{silent,sounding}.png`, `clarinet-…`, `bassoon-…`: each bell close up, silent and with a
  loud note held (`BELL=1 node scripts/shots-winds-holes.mjs`). The bell's wood, its mean RGB in a box over
  it, silent and sounding: oboe 35.9 29.6 27.1 and 36.3 30.0 27.5; clarinet 38.9 33.2 30.0 and
  39.6 33.9 30.7; bassoon 69 28.8 21 both; no pixel of it gains more than 10 of 255 (the light's and the
  breath's noise). Round 1 measured the oboe's bell going from 52 44 40 to 82 63 47 on a loud note
  (`../oboe-3d-bell-sounding.png`, another framing).

## What did not survive measuring

* **The reeds' breath rise stays the model's.** A soft low oboe or clarinet note is near its threshold:
  with its rise varied by ±10 %, five of eight players' 50 ms D4 pp taps on the oboe did not speak at all
  (25–30 dB down), and one clarinet C4 pp tap in sixteen (22 dB). The bassoon's taps do not care; its rise
  varies a little.
* **The flute's jet aim stays the model's** (aimed sharper still, a note after a short rest an octave and
  a fifth up sounded its twelfth).
* **The oboe has no pitch vibrato.** With the bassoonist's few cents, the tube's length swung five times a
  second, the oboe's held E♭5 in Beethoven 5 II went to its octave 10 times in ten performances where the
  model alone does 3 (`winds-midi-players.ts`, ten players). Bringing the player's pitch in only after the
  attack did not help (it is the held note that tips), so it was taken out, not hidden.
* **A few cents at the start of each note** (the bassoonist's ±3–5 cents, settling): no measurable change
  to the reeds' repeated notes (oboe 0.941, clarinet 0.87–0.91), so not kept.
* **A release taper for every note let go** (a first version): by hand a note 50 ms after a long one had
  no rest before it any more (a hole of 0.2 dB, where the model alone has 7.5). Now only a file's note
  before a rest tapers; by hand the hole is 7.1 dB.

### What the player must not cost

* **Short notes.** A detached run of 70 ms notes, twelve players, 96 notes: more than 10 dB under the run's
  median note, flute 6 → 3, oboe 1 → 0, clarinet 0 → 0, bassoon 0 → 0. A 50 ms tap by hand against the note
  held, eight players (worst / 10th percentile): flute −25.8 / −25.4 → −26.9 / −23.6 dB (the model's own
  weak low taps), oboe −8.9 / −4.3 → −11.1 / −7.0, clarinet −15.4 / −6.6 → −11.5 / −6.2, bassoon
  −3.9 / −2.5 → −4.3 / −3.0. The oboe's weakest taps are 2–3 dB weaker with the tongue's push varied; none is
  lost.
* **Repeated notes struck.** Four eighths at 139 ms, eight players: the dip at each stroke (10th
  percentile), flute 9.3 → 8.5 dB, oboe 3.3 → 3.3, clarinet 5.9 → 5.5 (each note's own ±0.6 dB, read against
  the weaker neighbour).
* **Octave regimes** (`winds-midi-players.ts`, ten players, notes on another register a performance):
  Beethoven 5 II oboe 1 2.0 → 2.0, oboe 2 4.5 → 2.1, bassoon 1 1.3 → 2.0; Beethoven 5 I oboe 1 0.7 → 0.5,
  bassoon 1 2.1 → 1.9. Together 10.6 → 8.5. The oboe's low notes from silence by hand (B♭3–G4, three
  dynamics, three players, 44.1 and 48 kHz): on their octave 22 of 180 alone, 24 of 180 with the player, a
  different 24 (the e2e spec's B♭3 at 44.1 kHz is one the player moves onto it: that spec, which checks the
  tube's own tuning and register at four rates, asks for `human: 0`, as the trombone's does).
* **Round 1's joins, with the player on.** `flute-rise.ts --also falls`: 0 of 1008 rises and 0 of 360 falls
  fail, at 48 and 44.1 kHz. `winds-legato.ts` (3024 pairs, told ahead): slurs speak in 9 ms (16 at the 90th
  percentile) with holes as before; 2 pairs on a wrong register for 12–14 ms (E♭5 → C6 after a rest; 0
  before: see Left). By hand: a 50 ms rest's hole 7.1 dB (7.5 before), the same one slur (E♭5 → B♭5) on
  another register first. The clips' joins are as before (above).

## Left

* **The reeds' repeated notes still begin alike** (oboe 0.94, clarinet 0.87–0.89, bassoon 0.83). What a
  player could vary safely (the level, a pitch that stays on a repeated pitch) does not change a waveform's
  shape, and what would (the breath's rise, the tongue's hold) puts a double reed's low notes on their
  octave or loses short soft notes. It needs the reed's own attack made robust first (the oboe's and
  bassoon's two-regime low notes, left by audit 3 and round 1).
* **D5 → C6 after a short rest starts an octave low for 12–29 ms**, in the model alone too (all nine
  dynamics and lengths, `5a2f2ee`): a leap of a seventh inside the second register glides the tube, and the
  jet catches its first mode. It is not in round 1's pair set (no leap of ten semitones), and is a change to
  the joins, not the player: left for a joins pass. E♭5 → C6 sits on the same edge: with the player 2 of its
  9 renderings (12–14 ms, the told-ahead legato set's only cracks of 3024 pairs; the model alone 0).
* **By hand** (nothing told ahead) a slur from E♭5 upward still sometimes arrives late or on another
  register first: as in the model alone (the same pair, E♭5 → B♭5), its 90th percentile to speak 55 ms where
  the model alone's is 43 (the player's quicker or slower rise on the note before).
* **The bands under the oboe's notes, 61–71 dB down**, rise 4.5 dB with the tube's length moving by the
  player's few cents (its golden's spectrum). Inaudible.
* **Timing.** The expression layer (KTH rules) shapes dynamics only; a rubato or agogic layer would move
  every part of the Orchestra, and nothing measured pointed at timing. A player's few milliseconds of
  lateness per note were not added either: the tongue's timing in this engine is planned ahead of joined
  notes (`mono.ts`) and moving it risks round 1's joins.
* **Horn and trumpet** still have no player (the tuba's and trombone's do); round 1's notes on their
  slurs stand.

## Judge, goldens, bit for bit

* `human: 0` is bit-identical to `5a2f2ee`: every third note of each compass alone at 44.1 and 48 kHz,
  by hand and told ahead (`scripts/winds-alone-same.ts --params '{"human":0}'`: largest difference 0), and
  every bundled woodwind part's first 40 s as the Orchestra plays them, dry and through the room (new
  `scripts/winds-human-same.ts`).
* Judge (`scripts/judge.ts --instrument <i> --before 5a2f2ee`): **NO CLEAR CHANGE** on all four,
  held-out Δ 0.00 ± 0.00 (flute 3.30, oboe 2.34, clarinet 1.95, bassoon 2.07): the judge renders `human: 0`.
* Goldens: the four woodwinds' blessed (the player is in them, as the trombone's and tuba's are in theirs):
  envelope 0.3–1.2 dB rms, spectrum 0.5–2.5 dB rms. The bass, cello and trombone snapshots, which an
  update rewrote from earlier PRs, are left as they were (they pass).
* Tests that mean the model's own mechanism ask for `human: 0` (in tune within 3 cents, a register rise, a
  slur's join, the tongue's stroke between repeats, a 50 ms tap's minimum blow, a second oboe's 4 cents):
  flute-rates, flute-rise, legato, instruments, oboe, mono, taps. The player has its own,
  `packages/engine/test/winds-human.test.ts` (6 cases, 2 s): a held note's pitch moves; the flute's vibrato
  is heard and no generator; no two tongued notes alike; a file's long note before a rest dies away, a
  short one and a key in the hand stop as they did; a 50 ms tap speaks as it does without the player over
  eight players; a second player is another. `player.test.ts` compares two flute players over eight notes
  (one note is one draw of each). The block-size test covers all four with the player on: bit-identical at
  128, 37 and 500 frames a call.

## The gate, on the tree rebased onto `055d8dd` (main with #73, Pass It On)

* `pnpm typecheck`: clean. `pnpm build`: built; the worklet parses in Safari 14.1 (292 kB).
* `pnpm test` (Vitest): 99 files, 1040 tests pass.
* Playwright, the whole suite (Chrome desktop and Pixel 7, the WebKit smoke test), on port 4257 served by this
  worktree's own build: 373 passed, 32 skipped, 3 failed. `[desktop] app.spec.ts:1256` (`.av-speed` empty: the
  known flake of the piano's action close-up) passed when rerun, on desktop and phone. `[desktop]` and
  `[phone] oboe.spec.ts:28`: its B♭3 at 44.1 kHz from silence sounded its octave with the player (above: the
  player reshuffles which low notes take which regime, 22 vs 24 of 180); the spec checks the tube's own
  tuning and register at four rates, so it now asks for `human: 0`, as `trombone.spec.ts` does (the clarinet's
  and bassoon's twins too, which passed either way). Rerun: the three reed specs and the close-up, desktop and
  phone, 17 of 17 pass.
* A first Playwright run was thrown away: port 4231 was another worktree's preview (`piano-model-horn`, left
  running since Tue Nov 10), which the config reuses, so it tested that app. That server was left alone.

## Files

Engine: `packages/engine/src/core/winds-human.ts` (new), `flute.ts`, `oboe.ts`, `clarinet.ts`,
`bassoon.ts`, `mono.ts` (`nextAfter`). Tests: `packages/engine/test/winds-human.test.ts` (new), the seven
above, `golden/{flute,oboe,clarinet,bassoon}.json`. 3D: `apps/web/src/ui/gl/{oboe,clarinet,bassoon,horn,tuba,trombone,winds}3d.ts`
and their tests. Notes page: `apps/web/src/views/notes.ts` (the woodwinds' player). `AGENTS.md`: a rule row.
Tools: `scripts/winds-vibrato.ts`, `winds-human-same.ts` (new); `trombone-variation.ts --instrument`,
`winds-variation.ts` (notes in one sitting), `render-winds-legato.ts --solo`, `shots-winds-holes.mjs`
(`BELL=1`). The Iowa flute vibrato runs used: `.cache/iowa-vib` (analysis only, not committed).
