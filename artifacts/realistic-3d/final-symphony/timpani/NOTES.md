# Timpani

The twelfth instrument and the fifth of the symphony phase: a set of four pedal kettledrums, a new family
(`'percussion'`), each drum an air-loaded membrane over a kettle struck with a felt mallet, fitted to the
VSCO 2 Community Edition timpani (CC0); drawn in both 2D styles and modelled in 3D; an Orchestra voice that
timpani lines (by name in five languages or General MIDI program 47) reach, two sets at most.

Brief: `.autopilot/briefs/TIMPANI.md` (item 5 of `SYMPHONY.md`), with `STANDING-PREFS.md` and
`ART-DIRECTION.md`. Branch `improve/timpani`, based on `main` at `c40967c`. Engine: Claude Opus 5.5
throughout (the lead, and the 2D and 3D helpers in sibling worktrees, cherry-picked).

## The set and its compass

| drum | head | pedal range | at rest |
|---|---|---|---|
| 32″ (the player's left) | 0.813 m | C2–A2 (36–45) | D2 |
| 29″ | 0.737 m | F2–C3 (41–48) | G2 |
| 26″ | 0.660 m | B♭2–F3 (46–53) | C3 |
| 23″ (the player's right) | 0.584 m | D3–A3 (50–57) | F3 |

The compass is **C2–A3 (MIDI 36–57)**, written as it sounds; a note outside it is played an octave in. The
makers' ranges (Adams, Ludwig: 32″ D2–A2, C2 on a Dresden 32″; 29″ F2–C3; 26″ B♭2–F3; 23″ D3–A3).
American layout: the largest drum on the player's left, so the audience sees it on their right.

How the drums share a part (`TimpaniCore.drumFor`): a note goes to a drum already tuned to it; else to the
drum, among those whose pedal reaches it, whose pedal travels least, a drum not still ringing preferred
(cost 3 semitones), the middle of its range a little preferred. A retuned drum is stopped first (the
player's fingers before the pedal moves). Two mallets: a double stop sounds two drums, strokes alternate
hands (after a pause, the hand on that side). A Mozart part in D (D3, A2) plays on the 26″ and the 29″ (they
rest on C3 and G2: the first D3 retunes the 26″, the first A2 the 29″, and they stay there).

Playing: the drums ring until damped (l.v., as timpani are written): a released key damps its drum only as
far as the **damping** knob says (25·damp² /s). A held key **rolls** with the mod wheel, aftertouch or the
roll knob (8–16 strokes a second, each a little early or late, 72 % of the key's velocity, swelling with
the file's dynamics, CC_DYNAMICS). The **pitch wheel** is the last drum's pedal: a glissando on the ringing
head (T ∝ f², a 50 ms glide). The **mallet** knob is the felt's hardness (×0.25–4: stiffer and thinner over
the core); the **strike point** knob moves the stroke from the centre (a thump) to the rim (thin).

## Sound

### The model (`packages/engine/src/core/timpani.ts`)

| part | model | source |
|---|---|---|
| head | a circular membrane, Mylar 0.19 mm (σ 0.264 kg/m²), fixed at the rim: modes ψ_mn = J_m(j_mn r/a) cos mθ; the 96 lowest by loaded frequency per drum (cos mθ only: a stroke at θ = 0 cannot excite the sin mθ twins); Bessel zeros computed at start-up (2.3 ms) | Fletcher & Rossing 1998 §3.4, §18 |
| air loading | each mode carries an added mass μ_mn = μ₁₁·(a/0.33 m)·(j₁₁/j_mn)^0.80 (the evanescent layer's ρ/k on each side: exponent 1), μ₁₁ = 3.07 for a 26″ head (the simple ρ/k estimate gives 0.8; the enclosed kettle air and the finite head add to it: Christian et al. computed it in full); it draws (1,1)…(5,1) to 1 : 1.46 : 1.92 : 2.38 : 2.83 | Rayleigh; Christian, Davis, Tubis, Anderson, Mills & Rossing 1984, JASA 76, 1336; Rossing 1982, Sci. Am. 247(5) |
| kettle | a closed volume (1.13 × a hemisphere of the head's radius) is a spring on the modes that pump it: κ₀ₙ = 4πρc²a²/(Vσ j₀ₙ²), m = 0 only (the (0,1) from 0.53 to ~0.8 of the (1,1)) | Fletcher & Rossing §18.2 |
| radiation | each mode's far field closed form (a Lommel integral: 2πaα J_m(βa) J_{m+1}(j)/(α² − β²), β = (ω/c) sin φ), integrated over the half-space above the head into its radiation damping, ×0.67; heard on the audience's side (azimuth π from the strike point), 22° above the head's plane, the channels ±2°; each nodal diameter −1.9 dB | Rayleigh integral; fitted scale |
| support | the m = 1 modes (a net moment on the rim) rock the kettle on its stand, the m = 0 modes (a net force) lift it: 0.73 /s and 1.2 /s; the others leave the rim still | fitted |
| losses | a floor 0.89 /s + 0.053·(f/1 kHz)^2.2 | fitted |
| tension | the head's strain ½⟨\|∇w\|²⟩ (Σ k²∫ψ² A²) raises its tension by Eh/(1−ν) times it, ×0.81 (Mylar: E 4.9 GPa, ν 0.38): a loud stroke starts sharp (≈1–3 ¢) | Kirchhoff–Carrier for membranes |
| mallet | a mass of 11.9 g at 0.21 m/s (velocity 1) to 4.6 m/s (127), log-linear in velocity^0.73; the felt F = Kδ^1.93 (K 3·10⁶) with Hunt–Crossley loss (λ 0.093 s/m); over 1.5 mm of felt, a core F = 10⁸·(δ − 1.5 mm)^1.5; contact 6.6 ms at pp, 3.7–4.9 ms at ff, peak 4–85 N; the stick away when the felt leaves the head on the rebound (a head that ran from a mallet still coming down meets it again) | Stulov 1995 (felt); Rhaouti, Chaigne & Joly 1999, JASA 105, 3545 |
| strike point | 0.63 of the radius from the centre (a third of the radius in from the rim) | fitted (players 0.6–0.75) |
| unresolved modes | the thousands above the 96: a band of noise (high-passed at the last computed mode, low-passed at 3.9 kHz) driven by the mallet's force above that frequency, 35 dB, decaying at 25 /s | modal synthesis's statistical residual |
| colour | a presence peak +11.9 dB at 923 Hz (Q 1.0), a shelf +3.1 dB above 5.2 kHz, a high-pass at 28 Hz; the level −36.7 dB | fitted |

Each mode is an exact two-pole resonator (impulse invariant), so its frequency and decay are the same at
22.05, 44.1, 48 and 96 kHz; while a mallet is on a head the modes and the mallet are stepped together
sample by sample, after it they run on their own. 28× real time at 48 kHz with three drums ringing and a
roll (17× at 96 kHz). Bit-identical at 128, 37 and 500 frames per call, a roll and a pedal glissando
included.

### The reference

VSCO 2 Community Edition (Versilian Studios: Sam Gossner, Simon Dalzell; sample cutting Elan Hickler;
https://github.com/sgossner/VSCO-2-CE, **CC0 1.0**; the readme asks only that the samples not be sold),
`Percussion/Timpani`: five pedal drums struck at the library's velocity layers v1, v3, v4 (pp, mf, ff; the
low drum at v1 and v3 only), two takes each, 16-bit/44.1 kHz stereo with the close and room microphones
summed — a room, not an anechoic chamber. The University of Iowa MIS has no timpani (its percussion is
mallet instruments, cymbals, gongs, hand percussion). Analysis only: cached in `.cache/vsco-timpani`, never
committed, never played.

| drum | principal tone (1,1) | the library's key centre |
|---|---|---|
| 1 | 89.7 Hz (F2 +47 ¢) | F♯2 |
| 2 (held out) | 122.6 Hz (B2 −12 ¢) | B♭2 |
| 3 | 142.8 Hz (C♯3 +52 ¢) | C♯3 |
| 4 (held out) | 170.0 Hz (E3 +54 ¢) | E3 |
| 5 | 190.7 Hz (F♯3 +52 ¢) | F♯3 |

Each stroke (`packages/engine/src/analysis/struck.ts`, the same on the recordings and the model's dry
renders): the onset; the principal tone; the (2,1)–(5,1) partials' frequencies (searched ±6 % about 1.5,
1.95, 2.42, 2.88 ×) and levels (0.05–0.55 s); the (1,1)'s and (2,1)'s decay rates (from 0.2 s, while 45 dB
from their top); how long it takes to fall 30 dB; the centroid of its first 0.3 s; the attack (the first
30 ms over the next 270 ms); the level (first 0.5 s); the first second's third-octave spectrum. Only the
first 60 % of each file is used (the library faded each one to digital silence where it met the room's
noise: read as a decay, the fade doubled drum 5's). Drums 1 and 5's softest layer is left out (−64…−73 dB,
15–20 dB under the other drums' pp, where the room's rumble and the other drums' ringing are a large part
of it: drum 5's centroid lay below its own principal tone): **24 strokes**. Drum 1's (1,1) is split (89.7
and 94.9 Hz, either side of F♯2), its (2,1) at 1.54 × the lower: the model cannot split a mode.

The model renders each stroke at the recording's own pitch (the nearest note, `detune` to the rest) and
dynamic (velocity 30, 70, 112).

### Fit and judge

Fitted on drums 1, 3 and 5 only (`scripts/fit-timpani.ts`, a (1+1) evolution strategy over 30 constants in
normalised ranges, then `scripts/polish-timpani.ts`, coordinate descent); the score is the judge's: each
measure's error over the recordings' own stroke-to-stroke spread, averaged; the gain solved each time.
Judged on drums 2 and 4 (`npx tsx scripts/judge.ts --instrument timpani --before <9c9256f>/packages/engine/src/core/index.ts`):

**BETTER** — held-out 9.25 → 3.50 (n = 12, Δ 5.75 ± 0.34); fit half 8.73 → 2.01 (n = 12); no guard broken.

| held-out, mean \|error\| | start design (9c9256f) | fitted | the recordings' spread |
|---|---|---|---|
| partials' frequencies, ¢ RMS | 21.6 | 25.7 | 18.2 |
| partials' levels, dB RMS | 26.1 | 10.7 | 4.2 |
| first second's spectrum, dB RMS | 36.8 | 17.6 | 3.4 |
| (1,1) decay, octave | 0.33 | 0.23 | 0.07 |
| (2,1) decay, octave | 0.19 | 0.22 | 0.14 |
| ring (−30 dB), octave | 0.55 | 0.59 | 0.26 |
| centroid, octave | 0.70 | 0.30 | 0.11 |
| attack, dB | 5.7 | 3.3 | 0.3 |
| pitch, ¢ | 33.7* | 0.3 | 10.7 |
| level, dB | 33.1 | 3.7 | 0.9 |

\* the start design had no `detune` (it played the nearest semitone); the verdict holds without pitch.

All 24 strokes (fitted, medians): brightness ×0.98 of the recordings', (1,1) decay ×1.00, (2,1) decay ×0.98.

| model / recording | pp | mf | ff |
|---|---|---|---|
| centroid (Hz) | 151 / 148 | 195 / 201 | 272 / 363 |
| level (dB) | −48.6 / −52.2 | −38.9 / −39.1 | −29.2 / −29.8 |
| the (2,1) re the (1,1) (dB) | −9.4 / −6.5 | −5.9 / +1.2 | −3.2 / +3.8 |

The Measurements page charts each stroke's brightness and (2,1), and a stroke's spectrum by dynamic
(`apps/web/public/data/timpani.json`, from `npx tsx scripts/calibrate-timpani.ts --write`).

### What the fits found, and what was tried and rejected

- **The start design** (literature values: μ₁₁ 2, a 30 g mallet, a felt without a core, the far field as
  computed at 60°, the audience at ±0.5 rad) was dark and dynamically flat: a 25–30 g mallet stays on a
  4–5 kN/m head 6–10 ms at every dynamic (the head's give sets it, not the felt: felt 10⁸–10¹² changed
  nothing), the (2,1) near the half-sine force spectrum's first null, 15–40 dB under the recordings.
- **A felt stiff enough to shorten it** (3·10¹⁰) bounced off in 0.3 ms (the first release rule let the
  mallet go at the first separation); the mallet now follows the head until it is on its way back up.
- **A light mallet** (10–15 g moving mass) is what lets the contact shorten with the stroke (6.6 → 3.7 ms)
  and the (2,1) rise with the dynamic, as recorded (+10 dB pp → ff); the ES had settled on 23–52 g, a
  local optimum at score 2.2 with the (2,1) 10–15 dB short at mf/ff. A heavier stick's share is the open
  question (a timpani mallet's head is 15–25 g; the stick, pivoting in a loose grip, adds a third of its own).
- **The core**: a loud stroke bottoms the felt out on the mallet's core: a short spike on the long push, the
  clatter of a ff stroke. Stiffer cores (10⁹) gave kN forces; bounded to ≤ 3·10⁸.
- **The support's loss**: the recordings' (1,1) decays ~27 dB/s at every pitch and the (2,1) 8–18 dB/s
  rising with pitch; the computed radiation alone makes the (1,1) of a small high drum 4× faster than of a
  large low one, and a shared floor slows the (2,1) as much as the (1,1). Only the m = 1 and m = 0 modes
  load the rim, so a loss for them alone (the kettle rocked and lifted on its stand) fixed the ratio.
- **The listener's azimuth**: fitted free (π/2…π), it returned π: the recordings' microphones stood on the
  audience's side, opposite the strike point.
- **The unresolved modes' band**: driven by the force's size, a soft stroke came out brightest (611 Hz at pp,
  325 at ff); driven by the force's content above the last mode, it follows the stroke. The fit wanted it to
  decay at 2.2 /s, standing in for the recording room's reverberant tail: a hiss under every roll, and the
  fingers could not stop it. Held to 25 /s (score 3.37 → 3.50, the spectrum term +1.3 dB); the fingers
  damp it too.
- Not modelled: the kettle's own air resonances (above ~300 Hz), sympathetic ringing of the other drums
  (audible in the recordings: drum 1's 90/95 Hz under drums 2–5), the sin mθ twins (a head's uneven
  tension splits them: drum 1's split (1,1)), nonlinear energy transfer between modes beyond the tension's
  rise, a pedal's travel time (a retune is instant).

### Known gaps

- ff is darker than recorded (272 vs 363 Hz) and the (2,1) 3–7 dB under the (1,1)'s recorded balance at mf/ff;
  the third-octave spectrum is 15 dB RMS off (the recordings' room: their rumble below 100 Hz is excluded,
  their reverberant tail is not).
- The 96 modes end near 0.9 kHz on the 32″ at C2 and 2.6 kHz on the 23″ at A3; above, only the short band.
- The attack is 2 dB softer than recorded (the room's early reflections are in the recordings).
- A roll's strokes are 72 % of the key's velocity; real rolls are often softer at the start.

## Orchestra

- Names (`orchestra/assign.ts voiceFromName`): timpani, timpano, kettledrum(s), Pauke(n), timbales,
  timballes, "Timp.", "Timb.", "Tmp.", "Pk.", "Percussion (Timpani)"; a bass drum, a snare, "Drums" or a plain
  "Percussion" are not. General MIDI 47 (it went by range before). An unnamed low line is never the
  timpani's by range alone.
- Two mallets: poly 2, but not a section: a line never joins the timpani to make room, and the timpani are
  never where a line that needs more notes goes. A hand-picked lineup gives its timpani the timpani part.
- Up to two sets by the picker (each its own engine and player: its own random stream and intonation).
- Seated behind the players (and the pianos): z 1.45 m upstage (3.0 with pianos), two sets 3.2 m apart
  (`orchestra/seats.ts`); the sound from there. The real orchestral seating is a later PR.
- Mutopia's orchestral files label the part "timpani", GM 47 (Mozart's Requiem, Beethoven's Egmont and
  Seventh): they route by name and program.

Their own piece (the play icon): Mozart, Requiem K. 626, Sequentia, Dies irae, the timpani's line alone (D3
and A2), bars 1–27; typeset by Martin Norbäck from the Breitkopf & Härtel edition (1877);
Mutopia-2014/03/24-364; public domain; the file byte for byte (sha256 988faf18…).

## Paths

`/timpani` and the alias `/kettledrums` (`INSTRUMENT_PATHS`), both in both of `vercel.json`'s rewrite groups;
`apps/web/test/vercel-paths.test.ts` names both.

## The phone picker

Twelve picks of 20.75 px with 2 px gaps: 271 px, the band six took at 44 px. The timpani show "timp." under
their glyph (as the violin "vln.", clarinet "clar.", bassoon "bsn.", trumpet "tpt."); five letters at 8 px
IBM Plex Mono with −0.05 em spacing are 20 px, inside each pick.

## 2D

(see `2d/` and the 2D helper's commits)

## 3D (`apps/web/src/ui/gl/timpani3d.ts`)

Four pedal timpani of the Dresden pattern at the engine's sizes (heads 0.80–0.83 m up, kettles 0.47–0.345 m
deep, 8/8/8/6 tension rods, three 76 mm casters each), hammered copper, satin Mylar heads, chrome
counterhoops and suspension rings, pedals and gauges posed from the engine (`frame.timpani`), two felt
mallets that fall to the strike point when the engine reports the stroke, hold one frame, rebound by
velocity (lower in a roll) and rest above. The heads move with the engine's 14 lowest modes (exaggerated to
about 2 cm on the 32″ at full force, a dent at the strike point first; a mesh's positions re-uploaded when
its `Mesh.dyn` changes). Hero view from the audience's side, about 35° round towards the big drums. In the
Orchestra each set stands on the floor at its seat. 0 WebGL warnings alone and in an Orchestra with two
sets; fps-3d at 1440×900 @2× 3.42 ms mean (horn 2.89, the flute stand-in 2.17); on a 390×844 phone the
set fills 54 % of the stage's height and 92 % of its width, whole and clear of the player. Review set,
reference sheet and the three critique cycles: `3d/README.md`; measures and sources: `docs/3d-reference.md`.

## Tests

- Engine: `packages/engine/test/timpani.test.ts` (8), golden (`timpani.json` new; the others unchanged),
  blocksize (a roll and a pedal included).
- Web: `timpani-routing.test.ts` (7), `timpani3d.test.ts` (6), the 2D's, `vercel-paths.test.ts`.
- e2e: `e2e/timpani.spec.ts` (addresses, the worklet at four rates, a double stop, its piece, the Orchestra,
  the phone picker), `timpani-3d.spec.ts`, `timpani-2d.spec.ts`, and the timpani among all twelve in
  `app.spec.ts`.

## Artifacts

- `audio/`: strokes C2–A3 at pp/mf/ff; an original passage for a pair in C (strokes, a roll swelling
  pp → ff → p, a pedal glissando, a double stop ff); the Dies irae line; before (9c9256f) and after, each to
  −1 dBFS; spectrograms before over after; `metrics.json` (`scripts/render-timpani.ts`).
- `2d/`, `3d/`: the review sets.
