# Clarinet

The ninth instrument and the second of the symphony phase: a B♭ clarinet (Boehm system), in the oboe's
reed family (a waveguide bore driven by a reed blown closed), fitted to the University of Iowa MIS B♭
clarinet; drawn in both 2D styles and modelled in 3D; an Orchestra voice that clarinet lines (by name or
General MIDI program 71) reach.

Brief: `.autopilot/briefs/SYMPHONY.md` (item 2 of the missing instruments), with `STANDING-PREFS.md` and
`ART-DIRECTION.md`. Branch `improve/clarinet`, based on `main` at `dc1775a`. Engine: Claude Opus 5.5
throughout (the lead, and the 2D and 3D helpers in sibling worktrees, cherry-picked).

## Sound

### The model (`packages/engine/src/core/clarinet.ts`)

| part | model | source |
|---|---|---|
| bore | a cylinder closed at the reed, open at the first open hole: one delay line, the wave inverted at the open end. A quarter-wave pipe: resonances at odd multiples of c/4L, overblowing at the twelfth | Benade 1976; Fletcher & Rossing 1998, §15 |
| open end | the open-hole lattice reflects below its cutoff and passes the rest: a fourth-order low-pass (fitted 3.4 kHz, Q 0.52) in the reflection; the mean pressure reflected whole (−1 at 0 Hz) | Benade 1960; Benade & Kouzoupis 1988 |
| walls | a loss that grows with frequency (viscothermal ∝ √f, and the radiation): a one-pole low-pass in the loop, its corner 4.5 harmonics above the note, and a flat loss a little larger on the long tubes | |
| reed | one cane blade against the lay, the quasi-static characteristic: x = 1 − Δ, u = ζ·x·√\|Δ\|·sgn Δ, with p = 2a + u (one branch), solved exactly each sample (a cubic in √\|Δ\|, Newton). ζ 0.54 at D3 to 0.76 at B♭6 | Wilson & Beavers 1974; Dalmont, Gilbert & Ollivier 2003 |
| blowing | each note is blown from its own threshold: γ = γ_th + an excess set by the dynamic (−0.02 at velocity 1 to 0.45 at 127). γ_th in closed form, where the reed's negative conductance ζ(3γ − 1)/2√γ meets the bore's peak admittance (1 − r)/(1 + r), r the round trip's gain at the note | Dalmont, Gilbert & Kergomard 2000 (thresholds) |
| lips | the reed's rest opening falls to 0.67 of a loud note's at pp (pM ∝ H₀, ζ ∝ √H₀, as on the oboe) | |
| tonguing | the tongue holds the reed on the lay for 16 ms while the breath builds, then withdraws over 1.1 periods; the breath stays on at least 0.45 s (velocity 1) to 0.1 s (127) | |
| radiation | the flow leaving the open end, differentiated, coloured by a fitted chain (high-pass, low shelf, two formants, a low-pass whose corner follows the note and falls 2.1 octaves from ff to pp, a top shelf), its level rising 1.4 dB an octave up the compass | |
| compass | D3–B♭6 at concert pitch (written E3–C7). Each note is played on the tube whose fundamental it is (the register key and the altissimo's vents are not modelled) | |
| tuning | a measured table per note at 22.05, 44.1, 48 and 96 kHz, at mf, with pp and ff offsets (`clarinet-tuning.json`, `scripts/tune-clarinet.ts`) | |

### What the fit found (three structures, `scripts/fit-clarinet.ts`)

1. **A fixed blowing pressure, losses flat in frequency** (the oboe's structure on a cylinder). Fitted
   to 5.13 (fit half), held-out 6.74. pp sat 4–5 dB under ff (the recordings: 14 dB) and a low pp note had
   its third harmonic at −2 dB (the recordings: −21): the γ floor sat on its bound.
2. **A fourth-order lattice, the attack quicker up the compass, a level tilt** (and the register slope in
   the fit's score). Held-out 5.67; pp → ff 12.2 dB; the low pp notes still as bright as mf.
3. **Each note blown from its own threshold, and frequency-dependent wall loss.** With a flat loss
   every resonance reaches threshold together, so the softest note is already a square wave (third
   harmonic at −9.5 dB: Raman's model); with the loss growing with frequency the first resonance is the
   strongest and just over threshold the note is nearly a sine. The γ excess is per note, so the soft
   range no longer moves with the note's losses. Held-out 5.41: kept.

The register survey (`scripts/clarinet-regimes.ts`, every note D3–B♭6 at pp, mf and ff at 22.05, 44.1, 48
and 96 kHz) finds **540 of 540** cases on their fundamental (none on its twelfth or a squeak). A cylinder is
the easy case: its first impedance peak is its strongest.

### Against the recordings (Iowa MIS B♭ clarinet, pp/mf/ff, 135 notes D3–B6 concert)

The reference: the MIS "B♭ Clarinet" set (`https://theremin.music.uiowa.edu/MISBbclarinet.html`; "may be
downloaded and used for any projects, without restrictions"), analysis only, never played, never
committed (`.cache/iowa-ens`). Its runs leave short gaps between notes and are segmented with the oboe's
2-frame bridge.

What the recordings say: the chalumeau's odd harmonics stand ~25 dB over its even ones (−25 dB
even/odd); the clarion −20; the top third −11 (its second harmonic only 3–7 dB under the first). pp to ff
is 14 dB, and the top octave is ~10 dB louder than the chalumeau at the same dynamic. Soft low notes
swell in over 0.2–1 s.

Same analysis on recording and model (`scripts/calibrate-ensemble.ts --only clarinet`), dry, at the
recording's pitch and dynamic:

| | start design (4c64f23, unfitted) | fitted |
|---|---|---|
| harmonic profile error, dB RMS (median note) | 11.7 | **8.8** |
| long-term ⅓-octave spectrum, dB RMS | 4.9 | **4.1** (pp 11.8, mf 8.3, ff 3.9) |
| brightness (centroid), model ÷ recording | 1.53 (pp 1.78) | **0.99** (pp 1.00, mf 0.97, ff 0.97) |
| even/odd balance, dB off (low/mid/high third) | 4.2 / 0.0 / −17.6 | 8.9 / 4.8 / −16.7 |
| noise (HNR), model − recording | +0.2 dB | −0.3 dB |
| attack time, model ÷ recording (median) | 0.93 | 0.81 |
| pp → ff level | 4.2 dB (recording 13.8) | **12.4 dB** |
| pitch, ¢ RMS | 33.6 | **5.5** |

**The judge** (`npx tsx scripts/judge.ts --instrument clarinet --before <4c64f23>/packages/engine/src/core/index.ts`):
**BETTER**. Held-out score 4.77 → 2.14 (n = 66, Δ 2.62 ± 0.17); fit half 4.98 → 2.25 (n = 69); no guard
broken. Held-out per measure: harmonics 13.0 → 8.6 dB, centroid 0.72 → 0.18 octave, noise 3.36 → 4.07
dB (the closest guard: its limit is +0.79), attack 1.06 → 0.94 octave, pitch 24.3 → 4.4 ¢, level 4.5 → 2.5
dB.

How it was fitted: `scripts/fit-clarinet.ts`, the oboe's (1+1) evolution strategy over 34 voicing
parameters, scored on the fit half only (even MIDI numbers) as the judge scores (harmonics, centroid,
noise, attack, over the recording's spreads), plus the pp→mf and mf→ff level steps, the level steps
between the compass's thirds, and the register check on every note (model only). Pitch is left to the
tuning table. Disclosures: (1) the structure changed twice (above) and each time the held-out score was
printed alongside; (2) the first judge run of the final structure broke the noise guard (+0.85 dB against
+0.79); the noise floor was then given a pitch tilt and its two amounts chosen on a grid scored on the fit
half (2.40 → 2.34 spreads), after which the judge said BETTER with the noise guard at +0.71.

### Loudness, taps, pitch with the dynamic

The level is set by the oboe beside it: the median mf note D4–E6 is as loud as the oboe's (−20.9 dB
dry). Blown nearer its threshold a note sits ~9 ¢ flat and at ff ~5 ¢ sharp; the recorded clarinettist has
no such trend (pp +4 ¢, mf −7, ff −1), so the tuning table carries pp and ff offsets (a player lips it).
A soft low note blown just over threshold grows for ~0.4 s, so its minimum breath is 0.45 s: a 50 ms
tap speaks within 8 dB of the held note at every dynamic (`taps.test.ts`).

Audio (`audio/`, before = the unfitted start design, after = fitted, at one gain, through the site's
room): long tones D3, A3, E4, B4, F♯5, C♯6, G♯6 at pp, mf, ff; an original legato line in G minor from
G3 over the break to D5 with a swell; the Larghetto as the play icon plays it. Spectrograms stack before
over after.

## Orchestra

- **A voice of its own** (`assign.ts` `VOICE_INFO.clarinet`: D3–B♭6, centre B♭4, one note at a time),
  family `reed` (seated on the melodic arc with the oboe), heard from its seat; two by the picker, more by
  the routing grid; a second clarinet on a line is a second player.
- **By name**: clarinet(s), clarinetto/-i, Klarinette, clarinette, "Cl.", "Cls", "Clar.", "Kl.", and its kin
  (bass clarinet, basset horn, chalumeau) when its line lies in the clarinet's compass (as for every
  voice, a name counts only when the instrument can play the line as written). Until now these all went to
  the flute.
- **By program**: General MIDI 71. The saxophones (64–67), the bassoon (70) and the pipes keep the flute
  until they have their own.
- **The MIDI reader's polyphony** now counts only notes held together for 40 ms or more, in at least 1 % of
  the line: the Quintet's clarinet line has three grace notes crushed over a held note (28 ms each) and one
  270 ms appoggiatura, which made it "two-part", and no wind may take a two-part line (it went to a viola).
  Every other piece's routing is unchanged (`assign.test.ts`, `pieces.test.ts`).
- **Its own piece** (the play icon, the folder on a phone): the clarinet's line of Mozart's Clarinet
  Quintet in A, K. 581, II. Larghetto — the melody that opens the movement, to the close of bar 13, 42 s at
  the file's ♩ = 55. Mutopia-2008/06/09-337 (Maurizio Tomasi, from the Breitkopf & Härtel edition, 1883),
  **public domain**, the file byte for byte (sha256 in `pieces.ts`). The file carries the clarinet in A at
  concert pitch (its own part file is written pitch; the score's is not), so no shift. The same file routes
  automatically to a clarinet and a string quartet.
- **The picker** has nine instruments. On a phone they keep the width six took (271 px): nine 28 px picks
  and their gaps, names 8.5 px, and the clarinet's name its score abbreviation "clar." (its aria-label
  stays "Clarinet"); the band does not grow when a note sounds (Pixel 7 and 390×844, e2e).

## 2D, both styles (`apps/web/src/ui/clarinet-draw.ts`, `apps/web/src/ui/vector/clarinet.ts`)

- A Boehm B♭ clarinet (17 keys, 6 rings) drawn from the front at a measured Buffet Crampon's bore and 24
  holes (Debut, Kergomard & Laloë 2005, Applied Acoustics 66, Table 3: 664 mm reed tip to bell, Ø 14.5–15.6
  cylinder opening to Ø 60 at the bell; register hole 152.7 mm, thumb 238.9, L1–L3 252–308, R1–R3
  365–413, the little fingers' pads 446–544), its joints, outline and keywork placed from Yamaha's
  YCL-CSG III front photograph (its rings and pads, scaled, within 4 mm of the Buffet's holes); a 66 mm
  barrel (R13), a Ø 69 bell rim.
- The keys follow `clarinetFingersFor` on springs: rings on the thumb, L1, L2 and R1–R3, L3 plain, the G
  vent and the B/F♯ pad worked by the rings, the little fingers' chain of pads, the thumb ring and the
  register key drawn faintly through the wood (they light under the thumb). The reed sits behind the beak
  in a front view: its opening is a crescent round the beak's rounded tip (drawn at twice its 1.2 mm),
  opening and shutting with the engine's reed trace (shut once a cycle when loud).
- The standing wave glows in the bore from the reed (a pressure peak) to 18 mm past the first open hole:
  one quarter-wave in the chalumeau (every note within 4.6 % of c/4f), three on the same tube in the
  clarion (the register vent near the first node: the twelfth), five or more in the altissimo (C♯6–F♯6
  within 3 %).
- Lying across a laptop's stage clear of the file player; standing mouthpiece-up on a phone held upright
  as tall as fits between the file player and the keys; a cell at the strings' px/m in the Orchestra.
  Other instruments' drawings untouched.
- The fingering chart was corrected (its own commit): E♭4 and B♭5 keep L2 down with the side key (WFG's
  "T 12-|4"), C♯6–G6 are the WFG's basic fingerings (they sat a semitone high), and a bit for the B/F♯
  sliver (E♭6), which the 3D model leaves fixed.
- Before/after: `2d/` (34 JPEGs, 2.3 MB: the oboe stand-in at 4c64f23, and the clarinet at rest, F3, G5,
  D6 and A4, laptop and phone, both styles, the Orchestra among strings, close-ups of the mouthpiece and
  the keywork); `scripts/shots-clarinet-2d.mjs`.
- Gaps: the trill keys' pads and the throat keys' linkages are approximate (two measured holes not drawn);
  the bore's glow shows through the silver rings (as on the oboe); the mouthpiece reads warm while
  sounding (the pressure peak is at the reed); B♭6–C7 draw 9 or 11 quarter-waves.

## 3D (`apps/web/src/ui/gl/clarinet3d.ts`)

- A Boehm B♭ clarinet at 664 mm mouthpiece tip to bell, laid out in pixels from Yamaha's own photograph of
  the YCL-CSG III (8.71 px/mm, set by its 54 mm barrel; Debut, Kergomard & Laloë measured 664 mm on a
  Buffet): a hard-rubber (ebonite) mouthpiece with its beak, table and rails curving into a 21 mm lay (the
  reed's tip 1.1 mm off the tip rail), a 68 mm cane reed (pale vamp, glossy bark), a standard ligature with
  two knurled screws; the barrel swelling to Ø 31.9, grenadilla joints with silver rings, the bell flaring
  into a thick Ø 73.6 rim. Pieces: mouthpiece 67.9 mm showing, barrel 54, upper joint 196, lower 234, bell
  112; finger holes 245–404 mm from the tip. Measures and sources: `docs/3d-reference.md`.
- Silver keywork, 23 moving pieces after the photograph: the register key, the A key on its cross hinge,
  the G♯ key, the side E♭/B♭ key, the C♯/G♯ key, the thumb, L1, L2 and R1–R3 rings (L3 a plain hole), the
  ring pad and the bridge, the little fingers' seven spatulas, the G♯/D♯ key, the F♯, F and E pads on their
  clutches; trill keys, slivers, crow's foot, posts, rods, needle springs, white pads and the thumb rest
  fixed. (The fingering chart's comment had the plain hole at L1; on a Boehm clarinet it is L3: fixed, the
  chart's bits unchanged.)
- Live: the rings and keys spring to the chart and back to rest 0.8 s after the note; the reed's tip curls
  onto the lay with the engine's opening; closed holes (the plain L3 under its finger too) glow faintly
  with the bore's standing wave; the bell shimmers with the level.
- Framed whole on a desktop and a phone (77 % of a Pixel-class phone's stage, clear of the file player);
  the stage now keys its framing by the reed instrument too (switching oboe ↔ clarinet kept the other's
  camera). Seated in the Orchestra on the oboe's held angle. 604 k vertices, built in ~70 ms, 2.17 ms a
  frame (the oboe 2.19), no WebGL warning (`scripts/webgl-warnings.mjs`).
- Three critique passes against the photograph (`3d/review-cycle-1…3.jpg`; the sheets include CC BY-SA
  Wikimedia Commons photographs, credited in `3d/README.md`; the photographs themselves are in the
  uncommitted `.cache/refs-clarinet/`). Before (the oboe stand-in at 4c64f23) / after renders in `3d/`;
  `scripts/shots-clarinet-3d.mjs`, `scripts/sheet-clarinet-3d.py`.
- Gaps: the linkages are shown, not simulated (the ring pad and the bridge follow the second ring by rule;
  the trill keys never move); no thumb-ring link bar or register speaker tube; fewer posts than the
  photograph; a plain ligature, not Yamaha's plate; the wood a little browner than the CSG III's (the
  oboe's grenadilla); its Orchestra seat holds it as the oboe is held.

## Tests

- Engine (`packages/engine/test/clarinet.test.ts`, 6 tests): concert pitch D3–B♭6 within 6 ¢ at 44.1 and
  48 kHz; every fourth note on its own register at pp, mf and ff; the chalumeau's odd harmonics ≥ 10 dB over
  its even ones; ff ≥ 8 dB over pp; out-of-compass notes clamp; a second player differs. It also joins
  `blocksize` (bit-identical at 128/37/500 frames), `golden` (a new `clarinet.json`; every other snapshot
  unchanged), `dynamics` (CC_DYNAMICS, CC_REST), `sounding` (monophonic), `taps`.
- Web (`apps/web/test/clarinet-routing.test.ts`, 4 tests): names in five languages and abbreviations, GM
  71, the compass and octave moves, the Quintet file (clarinet and string quartet; the demo in compass; a
  second clarinet a second player), split keys and seats. `assign.test.ts`, `bass-routing.test.ts`,
  `oboe-routing.test.ts` updated (clarinet names and GM 71 no longer reach the flute).
- e2e (`e2e/clarinet.spec.ts`, desktop and Pixel 7): the picker name, "clar." and glyph; the compass on the
  keys; pitch and register through the worklet at 22.05/44.1/48/96 kHz; its piece from the overlay;
  Clarinetto I / Klarinette / Cl. 2 routed to three clarinet engines; a second clarinet by hand; nine picks
  in the phone band, names clear of each other, no growth with a note. `app.spec.ts` loops include the
  clarinet; `oboe.spec.ts`'s phone test counts nine.
- 2D: `apps/web/test/clarinet2d.test.ts` (17) and `e2e/clarinet-2d.spec.ts` (desktop, Pixel 7, 390×844).
  3D: `apps/web/test/clarinet3d.test.ts` (7: sizes within 3 %, keys for 11 notes and back to rest, the
  spring's bounce, the reed closing ~1.1 mm onto the lay, the glow, the bell, the Orchestra seat) and
  `e2e/clarinet-3d.spec.ts` (whole on desktop and Pixel 7 under the file player, no WebGL warning alone or
  seated).
- `vercel.json` rewrites `/clarinet` (`apps/web/test/vercel-paths.test.ts`).

## Known gaps

Sound:
- The top third's even harmonics are ~17 dB short (its second harmonic −21 to −29 dB where the recordings
  have −3 to −7): each note is the short tube whose fundamental it is, so its even harmonics fall on the
  bore's antiresonances; the real clarion and altissimo, on a long tube with the register vent and
  cross-fingerings, are not so tidy. The chalumeau's even harmonics are ~9 dB too strong.
- Soft low notes speak in ~0.1–0.4 s; the recordings' swell for up to a second.
- pp's long-term spectrum is 11.8 dB RMS off (mostly above 3 kHz, where the recordings' floor is room
  and microphone).
- No register key, tone holes or reed resonance; no vibrato by default (the recorded player uses almost
  none: what the analysis flags as vibrato is a 4 Hz, 8 ¢ waver).
