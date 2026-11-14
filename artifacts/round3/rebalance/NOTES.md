# The pieces' levels

Every bundled piece is now played at about one loudness, and each piece's parts are in the balance its score asks for. Before this, the 26 pieces ran from −31.7 to −13.8 LUFS, a spread of 17.9 LU. Pressing play on the clarinet's own piece after the trombone's gave a piece 18 dB quieter. After You came in 14 dB under the Handel. Now they run from −21.4 to −19.6 LUFS, and each is within 0.9 LU of the middle.

## How it is measured

`scripts/levels-pieces.ts` renders every piece whole, in Node, the way the page plays it:

- the automatic expression and the ensemble timing (`express`);
- the file's CC7/CC11 as each part's output gain;
- swells and the mod wheel sent to the engines, and every note told ahead (`foresee`);
- each part from its seat, with its own limiter told its share of the bus;
- the bus at 1/√Σwᵢ²;
- then the bus's DynamicsCompressor, modelled as Chromium runs it: −2 dBFS, ratio 20, knee 0, 2 ms attack, 150 ms release, a 6 ms look-ahead, and its make-up gain of +1.1 dB.

An instrument's own piece (`DEMOS`) is its single engine, with every line on it, going straight to the output.

The numbers it gives:

- **Integrated loudness:** BS.1770-4.
- **Loudness range:** EBU, with 3 s windows.
- **Peak:** the sample peak, before and after the bus limiter.
- **The bus limiter's work:** its deepest cut, and how much of the time it cuts more than 1 dB.
- **For each part:**
  - its own loudness as it reaches the bus;
  - *in mix*: the median, over the 400 ms blocks where the part is within 20 dB of its own loudest, of its loudness less the whole's. This is how far under the whole the part stands while it plays.
  - *loudest*: the same, over the blocks within 6 dB of the part's 95th percentile. This catches a stroke or an entry.

The script works in two steps. `render --tag t` caches each part's audio, about 2 minutes for all 26 pieces with 14 processes. `measure --tag t` then mixes those parts with the gains the code has now, so a level can be tried without rendering again.

## The mechanism (`orchestra/pieces.ts` `gain`, in dB)

- **A piece's `gain`:** applied on the ensemble's bus (`ensemble.ts` `applyGain`). Each part's limiter is told about it. The gain stays with the piece's file, however the stage is organised afterwards.
- **A part's `gain`:** applied as its engine's `volume`, which comes before the engine's own limiter. It applies while the piece is seated as it came (`pieceTrims`). Once the piece is reorganised, the trims go back to 1.
- **A demo's `gain`:** applied as the single instrument's `volume` while the demo is loaded (`audio.setFileVolume`). It goes back to 1 when the demo is unloaded or another file is loaded.

Nothing in the synthesis changed. Every gain is 0 dB unless it is set.

## Every piece, before → after

"Before" is main at 39387b0, with the scores' dynamics (#91), the tuba 4.5 dB under (#84) and After You (#86). The first column is the morning's main (3f486c6) for comparison.

| piece | 3f486c6 LUFS | before (main 39387b0) LUFS / peak dBFS | gain | after LUFS / peak dBFS | bus limiter |
|---|---|---|---|---|---|
| haydn | -19.8 | -22.2 / -7.0 | +2 dB | -20.2 / -5.0 | 0.0 dB |
| bach | -19.8 | -19.8 / -3.8 | +0 dB | -19.8 / -3.8 | 0.0 dB |
| handel | -13.5 | -15.9 / -1.9 | -4 dB | -19.9 / -5.9 | 0.0 dB |
| air | -19.0 | -23.5 / -7.2 | +3.5 dB | -20.0 / -3.7 | 0.0 dB |
| beethoven5-i | -20.0 | -17.4 / -2.4 | -4.5 dB | -20.2 / -3.4 | 0.0 dB |
| beethoven5-ii | -21.9 | -21.9 / -4.3 | +0 dB | -19.6 / -1.6 | 0.0 dB |
| toward-morning | -22.0 | -22.0 / -6.9 | +2.5 dB | -20.0 / -4.7 | 0.0 dB |
| everything-so-far | -27.2 | -27.3 / -10.6 | +7.5 dB | -19.8 / -3.1 | 0.0 dB |
| pass-it-on | -27.2 | -27.2 / -10.3 | +7 dB | -20.2 / -3.3 | 0.0 dB |
| after-you | — | -29.6 / -11.4 | +9.5 dB | -20.1 / -1.9 | 0.0 dB |
| demo:piano | -18.3 | -18.3 / -1.8 | -1.5 dB | -19.8 / -3.3 | 0.0 dB |
| demo:violin | -21.1 | -21.1 / -9.0 | +0 dB | -21.1 / -9.0 | 0.0 dB |
| demo:viola | -19.6 | -19.6 / -3.0 | +0 dB | -19.6 / -3.0 | 0.0 dB |
| demo:cello | -22.1 | -22.1 / -4.1 | +2 dB | -20.1 / -2.1 | 0.0 dB |
| demo:bass | -25.5 | -25.5 / -10.1 | +5.5 dB | -20.0 / -4.6 | 0.0 dB |
| demo:harp | -27.2 | -27.2 / -14.2 | +7 dB | -20.2 / -7.2 | 0.0 dB |
| demo:glockenspiel | -16.7 | -16.7 / -5.3 | -3.5 dB | -20.2 / -8.8 | 0.0 dB |
| demo:flute | -16.5 | -16.5 / -6.5 | -3.5 dB | -20.0 / -10.0 | 0.0 dB |
| demo:oboe | -18.2 | -18.2 / -7.6 | -2 dB | -20.2 / -9.6 | 0.0 dB |
| demo:clarinet | -31.7 | -31.7 / -22.6 | +11.5 dB | -20.4 / -13.8 | 0.0 dB |
| demo:bassoon | -19.6 | -19.6 / -8.4 | +0 dB | -19.6 / -8.4 | 0.0 dB |
| demo:horn | -23.6 | -23.6 / -11.4 | +3.5 dB | -20.1 / -7.9 | 0.0 dB |
| demo:trumpet | -11.6 | -13.8 / -2.6 | -6 dB | -19.8 / -8.6 | 0.0 dB |
| demo:trombone | -17.6 | -13.8 / -1.0 | -6 dB | -19.8 / -5.9 | 0.0 dB |
| demo:tuba | -29.3 | -25.9 / -5.9 | +4.5 dB | -21.4 / -1.4 | 0.0 dB |
| demo:timpani | -22.7 | -22.7 / -4.3 | +2.5 dB | -20.2 / -1.8 | 0.0 dB |

The bus limiter cuts at most 0.0 dB on every piece. The highest peak before the bus is −2.8 dBFS (Beethoven II), against a threshold of −2. Each instrument's own piece peaks under its engine's limiter (−1 dBFS). The tuba's sits at −1.4: the tuba alone is 1.4 LU under the middle, because its bass line is peakier per unit of loudness than any other piece. The violin's (−21.1), viola's and bassoon's own pieces were already within the range and are unchanged.

Why the instruments' own pieces were so far apart:

- The clarinet's and the oboe's files set channel volume (CC7) to 48/127, their own ensemble's mix. Played alone, that cost them 12.6 dB.
- The scores' dynamics (#91) moved the Air's and La Réjouissance's files, and the trombone's, tuba's and trumpet's own pieces share those files.

## Within each piece

How far under the whole each part stands while it plays (in mix), before → after:

### Beethoven 5 (both movements: one orchestra, `BEETHOVEN_5`)

- **Basses an octave down** (the line's `shift`, 11: −12). The Mutopia files write the basses where they are read: in unison with the cellos at 416 of the 503 onsets the two lines share in the first movement, and 436 of 538 in the second. A double bass sounds an octave under its written note. In unison, the bass was lost inside the cellos at −22.1 dB and −20.8 dB. The pieces' credits now say so, as the second movement's already did for its horns. `beethoven5.test.ts` says so too. A Mutopia file dropped on the symphony's address is still read as written.
- **Basses +5 dB:** −22.1 → −15.5 (I), −20.8 → −13.2 (II). Under the cellos (−11.1 and −8.4), and present.
- **Strings +3 dB** (violins I and II, violas, cellos): each part stands for a section of eight to fourteen players, against winds that are one to a part. Violin I goes −11.2 → −9.9 (I) and −8.2 → −7.4 (II): level with the first flute (−9.7 and −9.5), where before the flute was 3 dB over it.
- **Timpani +10 dB:** −23.7 → −15.2 (I) and −26.4 → −18.3 (II). At its strokes, −22.4 → −13.9 and −24.1 → −16.2. Before, the timpani's ff strokes in the tutti were not heard.
- **Second trumpet +3 dB:** −22.5 → −21.0 (I), low in its compass under the first. In the second movement it stays under the first (−13.6 against −13.0).

### Toward Morning

- **Trombone −4 dB:** −7.7 → −11.2. Written fortissimo throughout (velocity 118–127) and played 9 dB over its session (`PLAYBACK_DB`), it stood over the violins (−9.7) and 8 dB over the horn and trumpet. This is the "trombone in front" of the symphony-robot listening.
- **Bass +3 dB:** −16.7 → −13.4, by the cellos (−12.9).

### Left as written, and why

- **Haydn, Brandenburg 5, La Réjouissance, the Air:** their parts sit as the score has them. Haydn’s four are within 2.0 dB of each other (the first violin, with the tune, on top). In the Brandenburg, the solo violin, the flute and the harpsichord stand over the ripieno. In the Air the tune is at −5.4 and the bass trombone at −9.7.
- **Everything So Far, Pass It On, After You:** written for these engines by Fable 5.2, every note with its own velocity and hairpin. Their balance is the composition: Everything So Far's strings at velocity ~30 under the harp and piano, After You's violin leading at −7.2. They only come up to the common level: +7.5, +7 and +9.5 dB.
- **Clarinet II and bassoons in Beethoven** (−17 to −21 dB): they are low and inside the texture, as in the hall.

## The clips

These are under `artifacts/round3/rebalance/`, with more in the run's out folder. Each is 30 s at its played level:

- `beethoven5-i-before-matched.mp3`, `beethoven5-i-after.mp3`: from 3:45, the coda's tutti. The before is brought to the after's loudness (−2.8 dB), so only the balance differs: the basses an octave under and the timpani heard.
- `toward-morning-before-matched.mp3`, `toward-morning-after.mp3`: from 0:45, where the trombone is busiest. The before is +2 dB.
- `beethoven5-i-spectrogram.png`: the same excerpt's first 12 s, before (top) and after. The after has a line an octave under the cellos.

## Check

- `apps/web/test/levels.test.ts`: the table (`levels.json`, written by `measure --json`) is the code's (each piece's and part's gain as measured). Every piece is within ±1.5 LU of the middle and under its limiter. Each part's trim follows it to a smaller stage. Beethoven's basses sound an octave under the cellos.
- `e2e/levels.spec.ts`: /symphony's bus and part volumes, and the clarinet's own piece's volume while it is loaded.
- A new piece, or a piece's file rewritten: `npx tsx scripts/levels-pieces.ts render --tag now`, then `measure --tag now --json artifacts/round3/rebalance/levels.json`, then set its `gain`.
