# Key-down audit (round 3b)

Stephen, live site, 1:30 PM: the piano "STILL has weird robotic/mechanical effect exactly on key-down".

The same passages, as heard on the site (default settings, room included), through the engine at `73c17ee`
(`*-before`) and after the fix (`*-after`). Each MP3 has a spectrogram of the same render (0–12 kHz, linear).

* **`mid-single`**: one C♯4 at mf.
* **`bass-single`**: one A1 at mf.
* **`mid-repeated`**: ten fast C♯4s, 9 per second, then a held one.
* **`bass-repeated`**: ten fast A1s, then a held one.

`attack-<note>-<dyn>-iowa-before-after.png` are close-ups, dry, from 20 ms before the onset to 280 ms after.
Three panels, top to bottom: the Iowa Steinway (analysis only; its audio is not in the repo), before, after.
Each panel is scaled to its own peak, with an 80 dB range.

## What it was

The board's high-frequency path (bridge force above ~700 Hz, plus the action's contact tick) went through
a "diffuser": four Schroeder allpasses in series (1.1–7.2 ms, gains 0.5–0.62). An allpass rings at its own
loop period whenever its input is impulsive. The hammer's strike and the contact tick are the most impulsive
things in a piano note, so every key-down became about 40 ms of flutter at fixed periods. It showed as tonal
lines at 9–11 kHz in the attack spectrograms, which the Steinway does not have. Round 3's contact tick
(`1599167`) went straight into that path, which made it much more obvious.

* The tick on its own lasts 2 ms. Through the allpass chain it peaked 5–24 ms after the onset and lasted
  ~40 ms.
* The strongest echo periodicity in the attack (cepstrum) sat exactly at the allpass delay of 6.67 ms
  (A2, A1, C♯4 ff).

## What changed

* **Diffuser:** now a direct part plus exponentially decaying *velvet noise*: sparse random ±1 taps,
  2500/s, T60 30 ms, energy-normalised, different for L and R. This is the dense, heavily damped,
  noise-like response a real board has above its modal range. It has no loop and no period. Cost: a
  six-note chord renders in 380 ms per 6 s instead of 352 (+0.5 % of one core).
* **Tick level** 0.6 → 0.3. It had been fitted while the allpasses smeared it. Re-fitted against 24 Iowa
  notes at mf and ff, half held out: held-out bias −0.7 dB.
* **Tick noise:** generated with `Math.imul`. The plain multiply lost its low bits in a double.

Hammer contact was checked and is not the cause: one contact per strike, smooth, 2.1–4.3 ms, also on
fast repeats.

## Judge (`npx tsx scripts/attack-judge.ts [engine]`)

6–12 kHz, model minus Iowa, mean / |mean| in dB. Only notes whose recorded burst clears the recording's
hiss by ≥ 10 dB are judged, which is mostly ff (at mf the Steinway's attack is within 2–6 dB of its hiss).

| | before (73c17ee) | after |
|---|---|---|
| burst tail, 12–40 ms vs first 12 ms (a ringing attack reads high): fit | +5.8 / 5.8 | **−0.6 / 3.5** |
| burst tail: held out | +4.9 / 5.3 | **−1.7 / 3.9** |
| burst over sustain: fit | −3.1 / 8.6 | −8.2 / 9.4 |
| burst over sustain: held out | +3.8 / 10.2 | **+2.4 / 8.6** |

**Verdict: better.** The ringing tail is gone, both in the fit half and in the held-out half. The burst
level is no clear change: its two halves disagree in sign, so it is within the noise of this measure.

**Still open:**
* In the middle register the model's 3–6 kHz content falls away faster after the attack than the
  Steinway's (its string losses at 3 kHz).
* At ff the attack burst varies by ±9 dB from note to note against the recording.
