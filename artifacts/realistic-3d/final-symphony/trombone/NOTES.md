# Trombone

The thirteenth instrument and the sixth of the symphony phase: a slide trombone in three sizes sharing one
physical model — alto in E♭, tenor in B♭ with an F attachment, bass in B♭ with F and G♭ attachments — in the
brass family (buzzing lips driving a bore), fitted to the University of Iowa MIS tenor and bass trombones;
drawn in both 2D styles and modelled in 3D; an Orchestra voice that trombone lines reach (by name in five
languages and its sizes, or General MIDI program 57), each seat the size its part needs.

Brief: `.autopilot/briefs/TROMBONE.md` (item 6 of `SYMPHONY.md`), with `STANDING-PREFS.md` and
`ART-DIRECTION.md`. Branch `improve/trombone`, based on `main` at `0e0552e`. Engine: Claude Opus 5.5
throughout (the lead, and the 2D and 3D helpers in sibling worktrees, cherry-picked).

## Compass and sizes

Orchestral trombone parts are written at concert pitch (in bass, tenor and alto clefs); the engine plays at
concert pitch.

| size | tube (first position) | bore | bell | valves | the model's compass | MIDI |
|---|---|---|---|---|---|---|
| alto in E♭ (Bach 39, Yamaha YSL-871) | 2.06 m | 12.2 mm (0.481") | 178 mm (7") | none | A2–G5 | 45–79 |
| tenor in B♭/F (Bach 42B, Conn 88H) | 2.74 m | 13.9 mm (0.547") | 216 mm (8½") | F (a fourth) | E1–F5 (pedals E1–B♭1) | 28–77 |
| bass in B♭/F/G♭ (Bach 50B3) | 2.74 m | 14.3 mm (0.562") | 241 mm (9½") | F, G♭; both D | C1–C5 (pedals C1–A1) | 24–72 |
| the Iowa recordings | tenor E2–C5; bass C1 (pp), D♭1 (mf, ff) to B♭4 (pp), G4 (mf), F4 (ff) | | | | | |

The stage's trombone is the tenor; its Size knob (alto · tenor · bass) plays the others, and its keys show the
tenor's compass. The Orchestra's trombone voice spans all three (C1–G5); each trombone seat takes the size its
lines need (`tromboneSizeOf`, `apps/web/src/orchestra/assign.ts`): a line named for one ("Alto trombone",
"Trombone basso", "Bassposaune", "B. Tbn.") is that one; otherwise a part that lives low (its core under E2 or
its middle under C3) a bass trombone, one that stays high (nothing under A2, its middle at or over E4) an alto,
the tenor otherwise. Beethoven's Fifth, IV (alto, tenor, bass) and Bach's Air (below) seat all three.

The slide chart (`tromboneFingering`) is the standard one: the slide alone for positions 1–5 on the lowest
usable partial (2, 3, 4, 5, 6, 8, 9, 10, 12; the 7th and 11th, far from equal temperament, are only
alternatives), the F valve for what the slide alone would play in sixth or seventh position (F2 and C3 in
"T1", E2 and B2 in "T2", as orchestral players use it), pedal notes below the second partial (the bass
trombone's pedal B♭ in first position; C1 on both valves in third). The tenor's low B1 lies past the slide's
reach on any side ("the B natural problem"): taken past the seventh position on the F side, as a player pulling
the F valve's slide would. The slide's positions in metres come from the bore itself (below), so a natural
partial's own tuning shows as a raised or lowered position.

## Sound

### The model (`packages/engine/src/core/trombone.ts`)

Everything is in SI units: pressures in pascals, flows in m³/s, lengths in metres.

| part | model | source |
|---|---|---|
| lips | a one-mass outward-striking valve driven by Δp = mouth − cup pressure, static opening Δp/K, resonance a little under the note; opening h = max(0, h₀ + y), at most h_max; flow u = w·h·√(2\|Δp\|/ρ) | Helmholtz; Elliott & Bowsher 1982; Adachi & Sato 1996; Cullen, Gilbert & Campbell 2000; Velut et al. 2017 |
| mouthpiece | the cup a volume (compliance C = V/ρc², a spherical cap of the mouthpiece's depth over its rim: Bach 6½AL 25.4 mm, 1½G 27.9 mm), joined to the bore by the throat (7.0 / 7.5 mm) and backbore as one inertance M = ρ∫dx/S: a Helmholtz resonator (the mouthpiece's popping frequency); integrated semi-implicitly each sample | Benade 1976 §20; Campbell, Gilbert & Myers 2021 §5 |
| cylinder | the leadpipe, slide and tuning slide as one round-trip delay (fractional, eased at a slide's speed), with Keefe's viscothermal wall loss (α ≈ 3·10⁻⁵ √f / a Np/m) as a one-pole matched at 100 Hz and 800 Hz, the mean pressure reflected whole | Keefe 1984 |
| bell | a Bessel horn r(d) = R·(d₀/(d + d₀))^0.8 (d from the rim; d₀ 4 cm on the tenor), from where it reaches the bore (1.2 m from the rim) to the rim, as Kelly–Lochbaum scattering sections (a sample long each, merged where the radius grows under 4 %: 50 sections at 44.1 kHz on the tenor); the rim's open-end reflection a two-pole low-pass at ka ≈ 1 | Pyle 1975; Braden, Newton & Campbell 2009; Levine & Schwinger 1948 |
| tuning the slide | the cylinder's round trip set so that the n-th resonance of the whole bore (mouthpiece, cylinder, bell) falls on the note: the unwrapped phase of R_mouthpiece·R_bell, computed exactly from the discrete model once per size and rate, ωD = Φ(ω) + 2π(n − 1); a pedal note tunes the 2nd resonance to its octave. The visual slide is that delay's distance from first position | |
| brassiness | nonlinear steepening along the slide: a sample of pressure p arrives β·L·p/ρc³ earlier (β = 1.2, L the cylinder's length), × a fitted factor for the bell section's narrow first half; what it adds (the harmonics above the bell's cutoff) leaves through the rim's complement a bell's length later, while the loop carries the wave as it was | Hirschberg et al. 1996; Campbell 1999 |
| radiation | the rim's complement (what the bell lets out), then the colour: a high-pass, a formant, a low-pass whose corner falls with the dynamic, and the bell's beam (a shelf from about ka = 1: a wide bell's on-axis gain rises ~6 dB an octave) | Kinsler et al. §7.4 |
| slide motion | at most 4 m/s, smoothed over 12 ms; a slur that moves the slide gets a soft legato tongue (the lips' opening dips 85 % while it travels) unless the player glides (CC65 or the knob); the pitch wheel moves the slide | Kleinhammer 1963 |
| tuning | a measured table per size and note at 22.05, 44.1, 48 and 96 kHz at mf (`trombone-tuning.json`, `scripts/tune-trombone.ts`) | |

The bore's series, from `TromboneCore.resonances()` (tenor, B♭3 in first position): **0.70, 1.97, 2.97,
4.02, 5.06, 6.06, 7.09, 8.06** × the pedal; the passive bore's input impedance computed by impulse response
peaks at the same places (0.69, 1.97, 2.97, 4.03, 5.08, 6.08, 7.12, 8.10). A closed cylinder alone gives 1, 3,
5, 7 … × its first: the trombone's near-harmonic series comes from its bell and mouthpiece, as in the
literature, not from an imposed tuning.

### What the fits found

(See below: TBD after the final fit.)

### Against the recordings

(TBD.)

## Orchestra

(TBD.)

## Pictures and audio

(TBD.)
