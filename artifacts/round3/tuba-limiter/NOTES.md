# The tuba's limiter

Alone at its recorded fortissimo the tuba's own limiter (post.ts `Limiter`: instant attack, 180 ms release,
ceiling −1 dBFS) took 4–6 dB off its bottom octave and 1–4 dB off the next: every low note's body was ducked
under its own attack, and fortissimo was no louder than forte. Its level (`tuba.ts` `gain`) had been set equal
to the horn's at ff by RMS; a low brass note is far peakier at the same loudness (the recorded tuba's crest
factor at ff is 15.5 dB, the model's 10: `scripts/crest.ts`, unchanged by a gain), so it met the ceiling first.

The fix is the one number: `gain` 0.5617 → 0.335 (−4.49 dB). Nothing else changes: the voicing, the player,
the pp→ff spread (the model's pp, mf and ff sit within about 2 dB of where the Iowa tuba's do: `scripts/levels-vs-refs.ts`).

## The limiter, register by register (`scripts/tuba-limiter.ts`, held notes of 1 s, every semitone)

Most the limiter takes off (dB), by octave, at the recorded ff (velocity 112) and at 127:

| | oct 1 (C1–B1) | oct 2 | oct 3 | oct 4 | worst |
|---|---|---|---|---|---|
| tuba v112, before | 5.8 | 3.8 | 0.7 | 0.3 | 5.8 |
| tuba v112, after | 1.3 | 0.0 | 0.0 | 0.0 | **1.3** |
| tuba v127, before | 7.4 | 5.3 | 2.0 | 1.7 | 7.4 |
| tuba v127, after | 2.9 | 0.8 | 0.0 | 0.0 | **2.9** |
| horn v112 / v127 | | | | | 0.5 / 2.5 |
| trumpet v112 / v127 | | | | | 1.5 / 2.0 |
| trombone v112 / v127 | | | | | 1.7 / 5.8 |

`scripts/limiter-table.ts` (every note, v100/115/127): before 1.1 / 6.8 / 7.4 dB (1, 24, 34 of 42 notes over
1 dB); after 0.0 / 2.3 / 2.9 dB (0, 3, 10 of 42). `tables/limiter-table-*.txt`, `tables/registers-*.txt`.

## Where it stands among the brass

Loudness as played (LUFS, the loudest 400 ms of each note, median by octave), after; horn and trombone in the
same octaves:

| | oct 1 | oct 2 | oct 3 |
|---|---|---|---|
| v70 (mf): tuba / horn / trombone | −30.9 / −30.3 / −26.3 | −28.9 / −28.0 / −28.8 | −26.1 / −22.0 / −22.1 |
| v112 (ff): tuba / horn / trombone | −17.4 / −24.3 / −20.5 | −16.9 / −22.0 / −19.8 | −15.1 / −16.4 / −12.5 |

At mf it is within 1 dB of the horn in its two lower octaves (and of the trombone in the second); at ff it
is still the loudest of the three there. So the one-number fix does not leave it too quiet at pp–mf beside
the others in the same register, and no other mechanism was added. The walk through the middle of each
compass (`scripts/levels-table.ts`, A1–A3 for the tuba, higher for the others) reads mf −23.2 → −27.6 LUFS,
ff −13.8 → −18.0, peak −1.0 → −3.8 dBFS; that walk sets the tuba's low compass beside the others' higher
ones, so the register table above is the fairer comparison.

The judge (`scripts/judge.ts --instrument tuba --before <main>`): **BETTER**, held-out 5.81 → 5.00, from the
level measure alone (19.45 → 14.96 dB off the Iowa session, recorded 19 dB under its horn); harmonics,
centroid, noise, attack and pitch identical. `tables/judge.txt`.

## The clip

`tuba-ff-low-{before,after}.mp3`: a low line at ff (F1, C2, B♭1, E♭1 at 112; F1 F1 C2 F1 at 120; D1 at 127;
D2 at 112), as played, at one gain. `numbers.json`: each note's limiter and how far its body rises over its
first 120 ms (the bloom a held brass note has).

| note | limiter before → after (dB) | body over attack before → after (dB) |
|---|---|---|
| F1 / 112 | 2.9 → 0 | +10.7 → +12.3 |
| E♭1 / 112 | 0.9 → 0 | +5.0 → +5.3 |
| F1 F1 C2 F1 / 120 | 4.0, 1.9, 3.8, 3.1 → 0 | (last) +3.4 → +4.3 |
| D1 / 127 | 6.7 → 2.2 | +7.0 → +9.7 |
| D2 / 112 | 2.8 → 0 | +3.5 → +4.4 |

The whole clip −15.8 → −19.5 LUFS: the notes the limiter had held down lose little, the rest 4.5 dB.

## In the bundled pieces

Only Pass It On seats a tuba (and the tuba's own piece, the Air's bass line at about mf). In an orchestra a
part's limiter is told its share of the bus and never worked on the tuba: in Pass It On (`render-orchestra.ts
--piece pass-it-on --played`) the tuba part is 4.5 dB under where it was (peak −17.9 → −22.4 dBFS, RMS −42.6 →
−47.1), the mix 0.2 dB (RMS −31.9 → −32.1; its peak, another part's, −11.5 either way). The Air's bass line
at velocity 76 never met the limiter: 4.5 dB under, all of it. The pieces are not rebalanced here: the
level-rebalance job after this does that.
