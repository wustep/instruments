# Harp and glockenspiel, a second round (2026-11-15)

Before is `main` at 176c3ff; after is this branch. Clips are as played (room on): `before/` and `after/`.

## The harp's strings answering (`symp` 0.01419 → 0.0355)

The recordings' partials waver about their fall: the other strings beat against the plucked one through
the board, and on some strings the fundamental dips 10–20 dB and comes back. The model's partials wavered
far less. `scripts/harp-waver.ts`, median dB about the straight fall, recordings / model:

| | before | ×2.5 (kept) | ×3 | ×5 | ×10 |
|---|---|---|---|---|---|
| every partial | 1.7 / 1.0 | 1.7 / 1.4 | 1.7 / 1.5 | 1.7 / 1.9 | 1.7 / 2.6 |
| gut strings A2–B4 | 1.5 / 0.8 | 1.5 / 1.4 | 1.5 / 1.3 | 1.5 / 1.7 | 1.5 / 2.6 |
| C5 and above | 2.7 / 1.0 | 2.7 / 1.5 | 2.7 / 1.7 | 2.7 / 2.5 | 2.7 / 3.3 |

Above 2.5, `harp.test.ts` failed at both 3 and 5 times:

* **At 5 times:** a top string read 6 ¢ off its pitch (the limit is 4).
* **At 3 times:** a damped note's halo stood 5 dB too near the string, and the pluck's first 4 ms were no
  longer untouched.

At 2.5 times the halo stands 11 dB under the string. The test now asks 10 dB rather than 15. The
recordings' fundamentals, dipping 10–20 dB, need answering strings within about 10 dB.

**The judge (`judge-harp.txt`): NO CLEAR CHANGE**, held-out 1.33 → 1.34 (Δ −0.02 ± 0.01):

* the leading partial's decay 0.61 → 0.69;
* the ring 0.78 → 0.75;
* level 3.45 → 3.41.

The decays were polished again with the new coupling (`fit-harp.ts --polish`, decay and polarisation keys).
That brought the fit half back (1.03 → 1.03) and took the held-out strings further off (1.37,
`judge-harp-polished.txt`): fitted to the fit half, not the harp. Not kept. The coupling is kept for the
waver, and said so. `harp-ringing.png` shows slow arpeggios and single notes left to ring (before on top);
the beating is visible in the partials.

## The harp's forte attack (left)

A forte pluck's first 20 ms stand 2.8–4.2 dB further over what rings on than a softer pluck's do in the
recordings, and 0.1–0.2 dB further in the model (`dynamics-before.txt`). Two mechanisms were tried:

* **The slow polarisation's share falling as the pluck grows harder:** at most 0.36 dB
  (`dynamics-polvel1.8-notkept.txt`).
* **The fingertip's noise growing faster with the pluck:** the mean reached 2.2–2.5 dB, but string by
  string it was no nearer: 2.97 → 2.74 held out, 3.91 → 4.12 fit (`dynamics-noisevel7-notkept.txt`). It
  needs a forte snap about 36 dB louder than now.

Neither was kept. As the first round found, no one mechanism makes it.

## The glockenspiel in 3D, framed on its bars and lit for its steel

`glock-3d-{desktop,phone}-{before,after}.png`, its own piece playing.

**Before.** The view framed the whole instrument on its folding stand. The bars took a fifth of a desktop
stage, and the stand's legs filled the rest. The key light came from the camera's side, so flat bars facing
up showed none of it: grey paint.

**After:**

* **Framing.** On its own stage the framing counts the case, its bars and pins, not the stand under them or
  the mallets (`Batch.noFit`, as a bow is left out). The bars fill the stage: they bind its height on a
  computer and its width on a phone, while the stand runs off below.
* **Light.** The scene has a key light of its own (`Batch.key`, `GLOCK_KEY`), near the camera's mirror in
  the bars' plane, so the steel catches it. At the mirror itself every bar was one white glare (a first
  try). It is turned 0.8 rad towards the high bars and 0.2 rad lower, so the sheen runs across the low bars
  and fades along the row.

In the Orchestra the glockenspiel is framed with its stand, as before.
