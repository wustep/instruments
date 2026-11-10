# Oboe

The eighth instrument and the first of the symphony phase: a conservatoire oboe, in the same physical
family as the flute and the trumpet (a waveguide bore driven by a nonlinear valve), fitted to the
University of Iowa MIS oboe; drawn in both 2D styles and modelled in 3D; an Orchestra voice that oboe
lines (by name or General MIDI program) reach.

Brief: `.autopilot/briefs/OBOE.md` (with `SYMPHONY.md`, `STANDING-PREFS.md`, `ART-DIRECTION.md`). Branch
`improve/oboe`, based on `main` at `5ffac9e`. Engine: Claude Opus 5.5 throughout (the lead and both
helpers).

## Sound

### The model (`packages/engine/src/core/oboe.ts`)

| part | model | source |
|---|---|---|
| bore | a truncated cone as two delay lines meeting at the reed: the bore down to the first open hole, and the missing apex x₀ (the "cylindrical saxophone": the cone's admittance −j·cot kL + 1/(j·k·x₀) ≈ −j·cot kL − j·cot kx₀). Resonances n·c / 2(L + x₀): every harmonic, overblowing at the octave | Dalmont, Gilbert & Kergomard 2000, Acta Acustica 86; Ollivier, Dalmont & Kergomard 2004, Acta Acustica 90 |
| ends | both reflect through one gentle low-pass (radiation and walls) and the walls' loss; the mean pressure is reflected whole (−1 at 0 Hz) | an open end is a pressure release; viscothermal losses grow as √f |
| reed | two cane blades blown closed: opening x = 1 − Δ (Δ = mouth − staple pressure in units of the closing pressure pM), flow u = ζ·x·√\|Δ\|·sgn Δ, solved with p = a₁ + a₂ + u/2 exactly each sample (a cubic in √\|Δ\|, Newton). Quasi-static | Almeida, Vergez & Caussé 2007, JASA 121 (the double reed's quasi-static characteristic is the single reed's) |
| dynamics | mostly in the lips: the reed's rest opening H₀ falls to `openPp` of a loud note's; pM ∝ H₀ (so the swing in pascals scales with H₀), ζ ∝ √H₀, γ = p_mouth / pM rises; the mouth pressure itself moves less | Fuks & Sundberg 1999, Acustica 85 (oboists' blowing pressure follows pitch, not dynamic) |
| tonguing | the breath builds behind the tongue on the blades, then the tongue withdraws over 0.63 of a period (a half-cosine opening); the breath stays on at least 0.3 s (velocity 1) to 0.1 s (127) for taps | as the flute's and trumpet's taps |
| radiation | the flow leaving the open end, differentiated (a small opening radiates ∝ f), coloured by a fitted chain: a high-pass at 300 Hz, a low shelf, the formant at 1.15 kHz (+14 dB, Q 2), a low-pass whose corner follows the note (2.3 kHz × (f₀/440)^0.9) and falls 1.8 octaves from ff to pp, a top shelf | Meyer 2009, *Acoustics and the Performance of Music* (the oboe's main formant is fixed in frequency) |
| compass | B♭3–A6 (MIDI 58–93) at concert pitch: the oboe is in C, written as it sounds. Each note is played on the tube whose fundamental it is (the octave vents are not modelled) | Woodwind Fingering Guide's basic chart (apps/web/src/ui/oboe-fingering.ts drives the keys in 2D and 3D) |
| tuning | a measured table per note at 22.05, 44.1, 48 and 96 kHz (`oboe-tuning.json`, `scripts/tune-oboe.ts`) | |

### Getting the register right (what was tried)

A reed on a cone has to choose which resonance to play on, and the low register kept choosing its
octave or twelfth. `scripts/oboe-regimes.ts` surveys every note B♭3–A6 at pp, mf and ff at 22.05,
44.1, 48 and 96 kHz (432 cases).

1. **The apex as a lumped mass** (the cone's exact 1/(jkx₀) term), with and without the reed cavity's
   volume S·x₀/3 (Nederveen's condition, which makes the resonances harmonic again), and with the
   tone-hole lattice's 1–1.5 kHz cutoff inside the loop. Physically right — the cone's impedance peaks
   then rise with frequency (peak 1 ≈ 0.3–0.5 of peaks 3–5 for the low notes, by the discrete bore's
   input impedance), as a real oboe's do — but the low register settled on its 2nd or 3rd mode at every
   dynamic, and a reed resonance (0.8–3 kHz, any damping) did not stop it.
2. **The cylindrical saxophone itself** (a short open tube for the apex) squealed at the tube's own
   quarter-wave c / 4x₀ ≈ 2.4 kHz once the lattice stopped reflecting the long branch; with the same
   gentle low-pass on both ends and low loop losses it plays every note's fundamental.
3. **A reed resonance** (2.6–4.5 kHz, damping 0.5–1.5) tipped notes of the low and middle register
   into the octave; the reed is quasi-static.
4. **Tonguing** decides between regimes the low notes can hold either way (G4 at pp is bistable: a
   small seed of its fundamental keeps it there). The breath held 30 ms behind the tongue and a release over
   about two-thirds of a period of the note does it.
5. **The ff blowing pressure.** The first fit put it at γ ≈ 0.99, at the reed's static closure; there
   B4 and C5 had only their octave as a stable regime at 48 kHz. Capped at 0.88 (the fit took 0.85).
6. **The detector.** An autocorrelation at half the period flagged notes whose radiated second
   harmonic dominates (the radiation favours it) although they sound on their fundamental;
   `scripts/oboe-regimes.ts` now reads the harmonics instead (on the octave every odd one is gone, on
   the twelfth all but every third).

The register check in the fit (`scripts/fit-oboe.ts`) runs on every note at pp, mf and ff at 48 kHz.
It reads only the model, never the recordings, so it uses nothing of the held-out half.

Final survey: **430 of 432** cases on their fundamental. Every note at pp, mf and ff at 44.1 and 48 kHz;
the two left are E4 at ff at 22.05 kHz (its twelfth) and D♯4 at mf at 96 kHz (its octave). The top note,
A6, splits its period at pp (energy at 1.5 × the note about 20 dB under its harmonics, at 44.1 and
48 kHz), which oboists rarely ask of it; no other note does at any dynamic.

### Against the recordings (Iowa MIS oboe, pp/mf/ff, 103 notes B♭3–A♭6)

The reference: the MIS "Oboe" set (`https://theremin.music.uiowa.edu/MISoboe.html`; "may be downloaded
and used for any projects, without restrictions"), analysis only, never played, never committed
(`.cache/iowa-ens`). Its runs leave 50–100 ms between notes, which the analysis's segmentation bridged
into one long note (the ff C4–B4 run gave one note for its twelve): the oboe's files are segmented with a
2-frame bridge (`ensemble-refs.ts` `merge`), the other instruments' as before (their analysis is
unchanged). The player uses almost no vibrato (10 % of notes, 3.5 Hz, 6 ¢); the model is compared without.

What the recordings say: the strongest harmonic sits near 1.1–1.5 kHz whatever the note (the 4th–5th
on B♭3–E4, the 3rd up to B4, the 2nd to A5, the fundamental above), the fundamental 6–19 dB under it in
the low register; the harmonic-to-noise ratio is 40–50 dB; pp to ff is 14 dB.

Same analysis on recording and model (`scripts/calibrate-ensemble.ts --only oboe`), the model rendered
dry at the recording's pitch and dynamic:

| | start design (95c567c, unfitted) | fitted |
|---|---|---|
| harmonic profile error, dB RMS (median note) | 16.6 | **8.0** |
| long-term ⅓-octave spectrum, dB RMS | 12.0 | **10.5** (pp 7.5, mf 10.1, ff 11.9) |
| brightness (centroid), model ÷ recording | 1.66 (pp 2.05) | **0.92** (pp 0.98, mf 0.88, ff 0.91) |
| even/odd balance, dB off (low/mid/high register) | 2.0 / −0.6 / 6.4 | −0.3 / 4.0 / −0.9 |
| noise (HNR), model − recording | +12.3 dB (too pure) | **+2.0 dB** |
| attack time, model ÷ recording (median) | 0.38 | 1.31 |
| pp → ff level | 1.7 dB (recording 14.1) | **14.2 dB** |
| pitch, ¢ RMS | 30.4 | **0.8** |

**The judge** (`npx tsx scripts/judge.ts --instrument oboe --before <95c567c>/packages/engine/src/core/index.ts`):
**BETTER**. Held-out score (mean error over the recording's own note-to-note spread) 4.88 → 2.34 (n = 50,
Δ 2.54 ± 0.15); fit half 5.00 → 2.05 (n = 53); no guard broken. Held-out per measure: harmonics 15.8 →
8.4 dB, centroid 0.69 → 0.25 octave, noise 16.0 → 6.7 dB, attack 1.91 → 1.31 octave, pitch 26.4 → 0.5 ¢,
level 7.8 → 8.3 dB (not a guard: the microphone's gain).

How it was fitted: `scripts/fit-oboe.ts`, a (1+1) evolution strategy over 29 voicing parameters,
scored on the fit half only (even MIDI numbers) as the judge scores (harmonics, centroid, noise,
attack, over the recording's spreads), plus the pp→mf and mf→ff level steps, plus the register check
on every note (model only). Pitch is left to the tuning table, made after. Two disclosures: (1) the
voicing was refitted three times as the model's structure changed (the lips' dynamics, the ends'
mean pressure, the radiation's moving corner, the soft rise) and each time the held-out score was
printed alongside; (2) between two final candidates (the fitted soft rise 0.2 s and a faster 0.05 s)
the choice was made on the register survey (the slow rise keeps every 44.1/48 kHz note on its
fundamental; the fast one does not), not on the held-out score — the held-out half preferred the same
one (3.83 vs 3.93).

### Loudness and taps

The recordings' absolute levels are their microphone's gain, so the oboe's level is set by its
neighbour: its median mf note (D4–E6) is as loud as the flute's (−21.7 dB dry). At ff it peaks at
−5.9 dBFS dry, −4.9 through the room and limiter.

Taps (`packages/engine/test/taps.test.ts`): the recordings' soft notes swell in (the fitted breath
rise is 0.2 s at pp), so a soft low note speaks 0.13–0.22 s after the key; a loud one within 33–70 ms.
The minimum blow (the breath stays on after a short key) grows as the velocity falls, 0.3 s at
velocity 1 to 0.1 s at 127, so a 50 ms tap is within 2–6 dB of the held note at every dynamic (it was
32 dB under at pp with the flute's flat 0.1 s).

## Orchestra

- **A voice of its own** (`apps/web/src/orchestra/assign.ts` `VOICE_INFO.oboe`: B♭3–A6, centre D5, one
  note at a time), seated on the melodic arc (`seats.ts`, family `reed`), heard from its seat, two of
  them by the picker (`MOST`), more by the routing grid; a second oboe on one line is a second player
  (its own noise stream, vibrato phase and +4 ¢), as for every voice.
- **Routing by name**: oboe, oboi, hautbois, Hoboe, oboe d'amore, "Ob.", "Obs", and the cor anglais
  (cor anglais, English horn, corno inglese, Englischhorn: the alto oboe, moved by octaves into the
  oboe's compass). Until now these all went to the flute.
- **Routing by General MIDI program**: 68 (oboe) and 69 (English horn). The other reeds (64–67 saxes,
  70 bassoon, 71 clarinet) and the pipes keep their current instruments until they have their own.
- Brandenburg No. 2's oboe line (a file the tests carry) now plays on an oboe beside its flute and
  trumpet; on a phone's smaller stage the lineup is trumpet, flute, oboe and a piano.
- **Its own piece** (the play icon, and the folder on a phone): the first oboe's line of Brandenburg
  Concerto No. 1, II. Adagio — its solo that opens the movement and the long notes under the violino
  piccolo's answer, 39 s at ♩ = 51. Mutopia-2008/10/29-1577 (Ben Stewart, from the Bach-Gesellschaft
  edition), the file byte for byte (sha256 in `pieces.ts`), licensed **CC BY 3.0** — the first piece
  that is not public domain; the symphony brief allows a CC licence that permits redistribution with
  credit, and the credit is given as the others' are. Mutopia lists no oboe-and-keyboard piece; its
  only other oboe-alone files (Devienne's sonatas, public domain) are fast movements.
- **Heard in an ensemble**: `orchestra/brandenburg1-adagio-orchestra.mp3`, the first 40 s of Mutopia's whole
  Brandenburg No. 1 Adagio score (CC BY 3.0; the score file itself is not shipped), auto-routed
  (`scripts/render-orchestra.ts --cap 8`): oboe I, II and III on three oboes (players 0, 1, 2, each from
  its seat), the bassoon and continuo on cellos, the violins as a section, viola, violone on the bass.
- **The picker** has eight instruments. On a phone they keep the width six took (271 px): picks 32 px,
  names 9 px with a hair of negative tracking ("trumpet" was already wider than its pick); the band does
  not grow when a note sounds (Pixel 7 and 390×844, e2e).

## 2D, both styles (`apps/web/src/ui/oboe-draw.ts`, `apps/web/src/ui/vector/oboe.ts`)

- Laid out from a Lorée conservatoire oboe measured by the Brussels MIM (inv. 1983.021: top joint
  233 mm, lower joint 240, bell 127; a 71 mm reed, 55 of it above the socket; bore 4 → 10 → 15.5 mm), its
  outline and key positions from a front photograph (Wikimedia `File:Oboe_2.JPG`).
- The keys follow `oboeFingersFor` on springs (rings, L1's half-hole plate, cups that lift, touches lit
  amber under a finger); the reed's tip opens and shuts with the engine's own reed trace, a cycle at a
  time, slowed; the standing wave glows in the conical bore and ends at the first open hole (holes placed
  so each first-register note's open hole falls within 4.2 % of its half-wavelength; overblown notes show
  two half-waves).
- A laptop draws it lying across the stage; a phone held upright, standing (reed up, keys to the
  audience) as tall as fits between the file player and the keys; in the Orchestra it takes a cell at the
  strings' px/m. The other instruments' drawings are untouched (no shared drawing code changed).
- Before/after: `2d/` (21 JPEGs: the placeholder at 95c567c and the oboe at rest, A4 and E6, laptop and
  phone, both styles, the Orchestra among strings, close-ups of the reed and of the keywork under D5);
  `scripts/shots-oboe-2d.mjs` reshoots them.

## 3D (`apps/web/src/ui/gl/oboe3d.ts`)

- A conservatoire oboe at 653.5 mm reed tip to bell rim (a 600 mm body: Lorée 601, Bate 597–598; 53.5 mm
  of a 71.5 mm reed), laid out in pixels from Yamaha's full-length YOB-831 photograph: joints with silver
  rings, the bulb, the top joint tapering Ø 20.1 → 23.2, the lower Ø 27.2–28.0, a bell turned in one piece
  flaring into its Ø 50 rim with its dark throat. Measures and sources: `docs/3d-reference.md`.
- Grenadilla, silver-plated keywork (29 moving pieces: both octave keys and the thumb plate, the
  perforated plates L1–L3, R1, R2 and the R3 ring, the half-hole plate, G♯, E♭, F resonance, C♯, C, B, B♭,
  the little fingers' seven touches; trill vents, crossbars, posts, rods, needle springs, thumb rest
  fixed), leather pads under the low keys, cane and green thread on the reed.
- Live: the keys spring to the fingering (the flute's spring and overshoot) and go back to rest 0.8 s
  after the note; the reed's blades close and shimmer with the engine's opening; closed keys glow faintly
  with the bore's standing wave; the bell shimmers with the level.
- Framed whole on a desktop and a phone (77 % of a Pixel-class phone's stage, clear of the file player);
  its own Orchestra seat at the flute's height (other seats unchanged). 606 k vertices, built once in
  ~110 ms; 2.18 ms a frame (the flute 2.25); no WebGL warning (`scripts/webgl-warnings.mjs`).
- Four critique passes against the photograph (`3d/review-cycle-1…4.jpg`; those sheets include CC BY-SA
  4.0 Wikimedia Commons photographs and carry their credit in `3d/README.md`; the photographs themselves
  are in the uncommitted `.cache/refs-oboe/`). Before/after: `3d/` (the flute stand-in at 95c567c; the
  oboe's hero, front/side/back, reed, keywork, bell, low keys, thumb side, a grazing view, D4 sounding,
  phone, Orchestra); `scripts/shots-oboe-3d.mjs`, `scripts/sheet-oboe-3d.py`.

## Tests

- Engine (`packages/engine/test/oboe.test.ts`, 5 tests, ~2 s): concert pitch B♭3–A6 within 6 ¢ at 44.1 and
  48 kHz; every third note on its own register at pp, mf and ff; ff ≥ 8 dB over pp; out-of-compass notes
  clamp; a second player differs. The oboe also joins `blocksize` (bit-identical at 128/37/500 frames),
  `golden` (a new `oboe.json`; every other snapshot unchanged), `dynamics` (CC_DYNAMICS, CC_REST),
  `sounding` (monophonic), `taps` (50 ms taps within 8 dB at every dynamic).
- Web (`apps/web/test/oboe-routing.test.ts`, 4 tests): names in five languages and abbreviations, GM 68/69,
  the compass and octave moves, its Brandenburg file with three oboes as three players, split keys and
  seats. `assign.test.ts` and `pieces.test.ts` updated (Brandenburg No. 2's oboe line now on an oboe; a
  CC BY credit allowed).
- e2e (`e2e/oboe.spec.ts`, desktop and Pixel 7): the picker name and glyph, the compass on the keys,
  pitch and register through the worklet at 22.05/44.1/48/96 kHz, its piece from the overlay, a file's
  Oboe I / Hautbois / Corno inglese routed to three oboe engines, a second oboe by hand, and eight picks
  in the phone band with no growth when a note sounds. `app.spec.ts` loops now include the oboe (every
  instrument at pitch, 3D stats, the no-WebGL-warning sweep, the vector look's colours).
- 2D: `apps/web/test/oboe2d.test.ts` (14: keys per fingering, the layout in laptop, phone and upright
  boxes, both styles with a silent and a sounding frame) and `e2e/oboe-2d.spec.ts` (alone in both styles,
  whole under the file player and above the keys, keys following the note; among strings in the
  Orchestra; desktop and Pixel 7).
- 3D: `apps/web/test/oboe3d.test.ts` (7: sizes within 3 % of the references, keys per fingering for nine
  notes and back to rest, the spring's bounce, the reed and the glow, the Orchestra seat) and
  `e2e/oboe-3d.spec.ts` (its own model, whole on a desktop and a Pixel 7 under the file player, no WebGL
  warning alone or seated in the Orchestra).


## Known gaps

Sound:
- Two register misses left of 432: E4 at ff at 22.05 kHz (twelfth), D♯4 at mf at 96 kHz (octave); A6, the
  top note, splits its period at pp.
- Low notes at ff build their fundamental over ~0.3–0.4 s (the 4th–6th harmonics, where the cone's
  impedance peaks are highest, speak first); the recordings' ff low notes speak in 15–55 ms. Soft low
  notes speak 0.13–0.22 s after the key (the recordings' soft notes swell in; the minimum blow makes a
  short tap sound anyway).
- The long-term spectrum is still 10.5 dB RMS off: above 10 kHz the recordings sit on a −46 dB floor
  (room and microphone) that the model has no reason to make, and 5–8 kHz is 4–8 dB short.
- No tone holes, octave vents or reed resonance; each note is the tube whose fundamental it is. Even
  harmonics of the middle register are 4 dB too strong.
- Brightness at mf/ff ×0.88–0.91 of the recordings'.

2D and 3D:
- The keys the chart never uses (trills, the banana key) never move; the left F key and the low B♭ vent
  are not drawn in 2D. In 3D the linkages are shown, not simulated (each key springs to its own bit); the
  half-hole is the small plate below L1 lifting.
- On a phone the standing 2D oboe is slim (about 30 px across at its true proportions).
- 3D keywork is still lighter than the photograph (fewer levers and lugs); the wood's grain is subtle; the
  geometry helpers are copied from `winds3d.ts` (not exported there, to leave that file alone).
- At A4 the bore's pressure is dominated by its 2nd harmonic, so the 2D standing wave shows two lobes:
  the engine's, not the drawing's.

