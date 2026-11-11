# A change of piano without a silence

Grand ↔ upright used to rebuild the one piano in place (`PianoCore.setPreset`: every voice, the
soundboard and the room reset). Everything sounding stopped at that sample, the room's tail included,
and nothing sounded until the next note: a piece playing had a hole, and the cut itself was a step.

Now the worklet host builds another piano and hands over to it (`processor.ts` `changePiano`,
`PianoCore.handOver`): the new one takes every note to come (what the file player had scheduled, the
pedals as they stand); the one that was playing strikes nothing more, keeps its notes until their keys
and the pedals let them go, rings out through its own soundboard and room, and is dropped when its
output has stayed under −100 dBFS for a quarter of a second. While both ring their sum goes through a
limiter of its own, so two pianos together are held to the level of one. A piano alone after the
change is that piano, sample for sample (`worklet.test.ts`). Building the second piano costs the audio
thread what the rebuild did (4–6 ms in Node on this machine, its string filters designed beforehand in
the page as ever).

## Numbers

Chopin, Prelude in C minor, Op. 28 No. 20 (the app's own piano piece), through the processor itself
with events timed as the file player times them (`scripts/render-piano-change.ts`), 48 kHz:

| Clip | Change | Engine | Level before (100 ms) | After (first 50 ms) | After (50–150 ms) | Silence | Step at the change | Peak |
|---|---|---|---|---|---|---|---|---|
| `mid-chord` | upright, mid-chord (next note in 357 ms) | before | −24.3 dB | −50.2 dB | −71.7 dB | 340 ms | ×1.14 | −2.0 dBFS |
| | | after | −24.3 dB | −25.5 dB | −26.1 dB | 0 ms | ×0.59 | −1.7 dBFS |
| `mid-chord` | grand, mid-chord (next note in 714 ms) | before | −23.0 dB | −50.6 dB | −70.3 dB | 695 ms | ×7.30 | −2.0 dBFS |
| | | after | −23.0 dB | −24.0 dB | −23.1 dB | 0 ms | ×0.80 | −1.7 dBFS |
| `at-the-turn` | upright, 50 ms before bar 5 | before | −28.8 dB | −38.6 dB | −15.4 dB | 30 ms | ×6.45 | −2.0 dBFS |
| | | after | −28.8 dB | −28.5 dB | −15.3 dB | 0 ms | ×0.93 | −1.8 dBFS |

Silence: the longest stretch under −60 dBFS between the change and the piece's next note. Step: the
largest sample-to-sample step where the sound changes hands, over the largest of the 50 ms before it
(above about 2 it is heard as a click).

`mid-chord-before.mp3` / `-after.mp3`, `at-the-turn-before.mp3` / `-after.mp3`; the spectrograms
(`mid-chord.png`, `at-the-turn.png`) have the old engine on top: its two black gaps are the holes.

In the browser (`e2e/piano-change.spec.ts`): the level 0.1 s after a change is 40–130 % of the level
before it (on the old engine it was 0.4 %), and across a change in the middle of a chord of the piece
no 20 ms falls under a tenth of the quietest moment before it.

## Not changed

- `PianoCore.setPreset` itself (offline renders, calibration) still rebuilds in place and silences.
- The first change to a piano whose string filters have not been designed yet still waits for them
  (about 0.6 s of the page's time; the piano playing plays on meanwhile). The page ships the grand's
  designs only.
- A panic, and a change of instrument, are silence at once as before.

```sh
npx tsx scripts/render-piano-change.ts --before <old checkout>/packages/engine/src/worklet/processor.ts
```
