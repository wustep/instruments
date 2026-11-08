# Key-up audit (round 3b)

Stephen, 1:53 PM: "ROBOTIC SOUND ON KEY RELEASE/note end".

These are held-then-released notes as heard on the site (default settings, room included). `*-before` is the
engine at `8586842`, `*-after` is the fix. Each MP3 has a spectrogram of the same render (0–8 kHz).

* **`mid-held-released`**: C♯4 at mf, held 1.2 s.
* **`bass-held-released`**: A1 at mf, held 1.5 s.
* **`mid-staccato`**, **`bass-staccato`**: four notes each, held 0.35 s.

`release-<note>-before-after.png` are dry close-ups from 100 ms before the release to 400 ms after,
with before on top and after below.

The Iowa recordings cannot serve as a release reference: every note is held until it has decayed into
the noise floor, and the files end there. The physical expectation is a small key-up thump, then a smooth
decay as the felt damps the string.

## What it was

1. **The damper felt's "landing noise" was a buzz.** On release, noise was injected into the string at
   0.8 × the string's own level, decaying over 30 ms. The string's loop filtered it into a pitched comb
   (a burst of plucked-string sound) lasting ~200 ms. Above 1 kHz it was louder than the note: from 10 to
   90 ms after release the 3–6 kHz band was **+21 to +45 dB above the note just before it**.
2. **Dampers closed ~3× too fast** (the block-size bug noted in the Chimera review). The damper ramp was
   stepped by the block length before the voices had shortened it: 29 samples on average, while ~10 were
   rendered, because the undamped treble strings' loops are short. Every release was therefore abrupter
   than its 12–42 ms time constant.

The comb was the robotic part, and the abrupt ramp made it more of a cut. The velvet diffuser is not
involved: removing it changed nothing at release.

## What changed

* **Landing noise:** 0.8 → 0.008 of the string's level (−40 dB), decay 30 → 8 ms. It ends at a relative
  level, so the voice's short-block limit ends with it.
* **Control update:** now steps by the block length actually rendered; it is re-checked when a
  sympathetic string wakes.

## Metric (`post − pre`)

Band level 10–90 ms after release minus the 100 ms before it, in dB. Dry, mf, held 1 s.

| | 0.1–0.3 kHz | 0.3–1 kHz | 1–3 kHz | 3–6 kHz |
|---|---|---|---|---|
| A1 before | −1 | +1 | +2 | **+45** |
| A1 after | −1 | 0 | −1 | +3 |
| A2 before | −2 | −3 | −4 | **+23** |
| A2 after | −2 | 0 | −1 | 0 |
| C♯4 before | −7 | −11 | +6 | **+32** |
| C♯4 after | −5 | −5 | −3 | 0 |
| C♯5 before | +38 | −13 | +12 | **+21** |
| C♯5 after | +35 | −5 | −4 | −4 |

C♯5's +35 dB at 0.1–0.3 kHz is the key-up thump, in a band that is otherwise empty below the note's
fundamental. It is unchanged and physical.

**Verdict: better.** The release no longer adds energy above 1 kHz, apart from +3 dB of felt noise on the
A1 bass string.
