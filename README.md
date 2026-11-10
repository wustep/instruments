# instruments

Seven acoustic instruments, physically modelled and computed in real time in the
browser: a **piano**, a **violin**, a **viola**, a **cello**, a **double bass**, a
**flute** and a **trumpet**.
No samples are ever played as the sound. Every note is a simulation of felt
hammers, bows and air jets driving strings and tubes, which in turn drive a
soundboard or body.

**Production URL (planned):** https://piano-model-wustep.vercel.app. `main` is
linked to a Vercel production deployment, which is checked separately; this
README does not claim it is live. `vercel.json` makes this a static build
(`pnpm build` → `apps/web/dist`).

## What you can do

* **Play.** Use the computer keyboard (`A`…`'`, with `Z`/`X` for octave and `C`/`V`
  for velocity), the on-screen keyboard (strike nearer the front of a key to play
  louder) or a MIDI keyboard. MIDI devices can be plugged in while the page is
  open. On a phone the keys carry no letters and stay a finger wide: a thin
  strip over them shows all 88 with a window on the ones in view, and dragging
  it slides the keys (a drag on the keys themselves is a glissando).
* **Controllers and pedals.**
  * **Sustain (CC64)** is continuous, so half-pedalling works.
  * **Una corda (CC67)** and **sostenuto (CC66)** apply to the piano.
  * **Vibrato (CC1)** and **expression (CC11 / CC2)** apply to strings and flute.
  * **A MIDI file's dynamics**: its volume (CC7) and expression (CC11) are a gain on the
    instrument playing each part (General MIDI's curve), its mod wheel (CC1) where it moves
    goes to the bowed and wind instruments. A part with none (one velocity, nothing that
    moves) is phrased automatically: phrase arches, swells on held notes (bow speed, force
    and vibrato, or breath), a little unevenness per part. The hairpin in the player turns
    that off. `apps/web/src/expression.ts`.
  * On the computer keyboard, hold `Space` for sustain and `Shift` for una corda.
* **Instruments.** Choose one with the selector on the Play page. The piano has
  four presets: concert grand, upright, honky-tonk and prepared.
* **Vector lines.** The crosshair button that closes the picker's row redraws the 2D stage as a vector
  display: thin glowing lines on black, the instrument in blue, the sound in amber, and
  each knob in a colour of its own that also marks what it moves on the drawing. The
  stage as it was stays the default; the choice is remembered, and `?style=vector` in
  the address sets it. After Jameson Hodge's Chimera vocal synth; the drawing kit and
  the colour roles are in `apps/web/src/ui/vector/kit.ts`.
* **Ensemble.** The ensemble button (four dots on an arc) puts several instruments on
  the stage, each its own engine; tap an instrument to add one. The keys (on the
  screen, the computer's, a plug-in MIDI keyboard with its pedals and wheels) play the
  instruments lit on the fallboard: the piano if there is one, else the highest melodic
  instrument, until you choose; tap to add or take one, so one key can sound on several.
  Split (the fork after them) deals a chord out by register instead, one note per
  instrument. `apps/web/src/orchestra/keys.ts`. Drop a MIDI file with several
  parts and each part gets an instrument by its name, General MIDI program and range;
  the row under the player shows each part's instrument (tap one to change or silence
  it). The list icon in the player, next to the folder, holds three public-domain pieces from the Mutopia
  Project: Haydn's "Emperor" quartet (II), Brandenburg No. 5 (III) and Handel's
  Réjouissance. Pieces and assignment: `apps/web/src/orchestra/`.
* **Look inside.** See what each instrument is doing as it plays:
  * the string displacement or bore pressure, live;
  * the hammer's contact force with its felt hysteresis loop, or the bow's
    stick–slip, or the flute's jet flow;
  * soundboard or body modes;
  * a spectrum with the predicted partials marked.

  Physical controls include:
  * piano: hammer hardness, string stiffness, unison detune, soundboard damping,
    string decay, lid and room;
  * strings: bow position, bow force, vibrato and body damping;
  * flute: breath pressure, lip-to-edge distance, noise and vibrato.
* **Measurements.** The piano is compared with a recorded Steinway model B on
  inharmonicity, stretch tuning, decay, spectra across dynamics, loudness and
  spectral balance. You can listen side by side; the model is rendered live in
  your browser. The violin, viola, cello and flute are compared with anechoic
  recordings of real ones (harmonic profiles, long-term spectra, even
  harmonics, noise, dynamics). A candid list of where it falls short is
  included.

## How it works, in plain words

* **Piano.**
  * **Strings.** Each string is a pair of travelling waves in a delay line. Stiff
    wire makes upper partials sharp, which is reproduced to within a fraction of a
    cent by an all-pass filter chain designed per key. Losses come from a fitted
    filter, and each string has a second, horizontally vibrating twin.
  * **Hammer.** A felt hammer whose spring stiffens as it is squashed is solved
    exactly each sample, so loud notes are brighter by physics rather than by
    filtering.
  * **Soundboard.** Two or three detuned strings per note, together with every
    undamped string on the instrument, share one bridge on a modal soundboard. The
    two-stage decay, beating and sympathetic resonance with the pedal down all
    come from that coupling.
  * **Dampers, pedals, noises.** Dampers press on gradually, so half-pedalling
    works. The top keys have no dampers, as on a real grand. Key thump and damper
    noise are small physical force pulses.
* **Violin, viola, cello.**
  * **Bowing.** The bow grips each string by friction (a stick–slip law) until it
    slips. Once per period it catches again, and the classic Helmholtz motion
    emerges without being programmed.
  * **Bow changes.** There is one bow, with a length. Each detached note goes
    the other way (down-bow, up-bow), and long notes change bow when the hair
    runs out. At the turn the bow slows through zero and the stick–slip
    re-forms in the opposite direction.
  * **Body.** Fingers shorten the strings, with vibrato. All four strings stand on
    one bridge over a modal body with each instrument's signature air and wood
    resonances, so open strings ring sympathetically.
* **Flute.**
  * **Jet and tube.** A jet of breath is deflected by the sound in the tube. The
    time a ripple takes to travel along the jet decides which resonance it feeds.
  * **Overblowing.** Blowing harder makes the jet faster: the tone brightens,
    pitch rises slightly, and eventually the tube overblows to its octave, which
    is how the upper registers work.
  * **Tone.** The jet is aimed slightly off the edge, so it splits unevenly and
    makes even harmonics. Vortices shed at the edge limit the amplitude before
    the jet saturates, and both openings radiate as monopoles: the sound is the
    rate of change of their air flow.
* **Where it runs.** Everything runs in an AudioWorklet written in TypeScript; no
  WASM was needed, as measured below. The DSP core has no Web Audio dependency,
  so the same code runs in Node for tests, calibration and offline rendering.

Details, design decisions and citations: [`docs/RESEARCH.md`](docs/RESEARCH.md).
Calibration rounds with numbers: [`docs/CALIBRATION.md`](docs/CALIBRATION.md).
CPU and latency: [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md).

## Modelled vs approximated

| | modelled physically | approximated / not modelled |
|---|---|---|
| **Piano strings** | waveguides with per-key dispersion (stiffness), frequency-dependent loss, 1–3 detuned unisons, horizontal polarisation, stretch tuning from inharmonicity, preparations (point masses and dashpots) | longitudinal waves are a squared-force generator through two resonances, not a waveguide |
| **Hammer** | nonlinear Hunt–Crossley felt (power law + hysteresis), implicit Newton solve, una corda shift | no key-travel delay, no shank flexibility |
| **Soundboard** | ≈150-mode passive modal board at three bridge zones, coupled to every undamped string, giving sympathetic resonance | modes are plausible rather than measured; above ~3 kHz a smoothed path; the bass aftersound is still short |
| **Dampers / pedals** | continuous damper contact with half-pedal, undamped top keys, sostenuto, pitched damper noise | key and action noises are short synthetic pulses |
| **Bowed strings** | stick–slip friction with hysteresis, Helmholtz motion, bow position/force/speed (Schelleng), one shared bow with length, direction and automatic bow changes, stopped strings with vibrato, four strings on one bridge, modal body with A0/B1 modes, sympathetic open strings | torsional waves, bow width and the bridge hill on the cello only; body modes from the literature, their radiation **fitted to Iowa MIS recordings** (violin and viola note by note on held-out-checked halves, with the Helmholtz corner's brightness following the bow force), not measured |
| **Flute** | jet-drive feedback with jet delay from blowing pressure, overblowing, Strouhal-limited jet, offset jet (even harmonics), vortex-shedding amplitude limit, monopole radiation, turbulence noise, open–open bore; voicing **fitted to Iowa MIS recordings** | no tone holes or bore taper; low-register H2 at mf/ff still ~10 dB short of a real flute; per-note tuning uses a measured voicing table |
| **Listener** | close "microphones" from mode shapes | lid shelf, small FDN room, safety limiter (audio effects, not physics) |

## Realism, candidly

* **Piano.** Against a Steinway B recording (round 2, `docs/CALIBRATION.md`):
  * stretch tuning is within ≈ 4 ¢ RMS and inharmonicity within ≈ 17 % RMS;
  * prompt decay is within ×0.90–1.14 of the recording in every register, and the aftersound within ×0.95–1.11 above B1;
  * the spectral balance is within ≈ 4.6 dB per third-octave band;
  * loudness is within ≈ 5–8 dB per note;
  * the pp→ff brightening is within 0.4 dB per partial (median).

  The biggest remaining audible gap: the lowest octave's aftersound is about
  two-thirds as long as the recording's.

  It sounds like a convincing grand: closer than classic synthesis, short of a
  high-end commercial modelled piano.
* **Strings.** Against anechoic Iowa MIS recordings (333 notes with the flute;
  round-1 → round-2 numbers in `docs/CALIBRATION.md`):
  * third-octave spectral error: violin 17.5 → 14.6 dB, viola 14.2 → 11.0 dB,
    cello 20.8 → 17.0 dB;
  * the pp→ff level spread is now close to the recordings'.

  They have genuine bowed attacks, bow changes, transients and
  pressure/position response, and play louder the way players do: closer to
  the bridge. The biggest gaps:
  * above about 4 kHz the modelled bodies still radiate far less than the real
    instruments;
  * the cello is a few dB noisier between harmonics than its recording.
* **Flute.** Even harmonics, breath noise, dynamics and register balance are
  fitted to the Iowa flute:
  * the spectral error went from 8.2 to 4.5 dB;
  * the even/odd balance error by register went from −26 / −16 / −4 dB to
    −9 / −3 / −3 dB.

  The low register at mf/ff is still about 10 dB short of a real flute's
  second harmonic, and notes speak a little slowly.

## Demos and screenshots (for handoff)

All rendered by the models.

**Round 2.** Captions, before/after pairs and measurements are in
[`artifacts/round2/README.md`](artifacts/round2/README.md).
* **Audio:** `artifacts/round2/audio/*.mp3` — piano tenor and treble notes,
  piano chorale, violin long tones with bow changes, violin détaché, viola,
  cello, flute low register and dynamics, and an ensemble chorale.
* **Before/after:** `artifacts/round2/before/*.mp3` are the same scores
  rendered by the round-1 engine.
* **Screenshots:** `artifacts/round2/shots/*.png`.

**Round 1.** See [`artifacts/README.md`](artifacts/README.md).

* Audio, WAV (48 kHz/16-bit) plus MP3: `artifacts/audio/`
  * piano: `piano-c-major-chord-pp.wav`, `piano-c-major-chord-ff.wav`,
    `piano-a0-ff.wav`, `piano-sustain-pedal-passage.wav`,
    `piano-half-pedal-una-corda.wav`, `piano-prepared.wav`
  * strings: `violin-g-major-scale.wav`, `violin-long-e5-swell.wav`,
    `violin-double-and-triple-stops.wav`, `viola-scale-and-chord.wav`,
    `cello-c-major-arpeggio.wav`, `cello-g2-and-fifth.wav`
  * flute: `flute-legato-melody.wav`, `flute-three-registers.wav`,
    `flute-overblowing.wav`
  * all five together: `ensemble-all-five.wav`
* Screenshots: `artifacts/shots/`
  * `play-piano.png`, `play-violin.png`
  * `inside-piano.png`, `inside-violin.png`, `inside-cello.png`, `inside-flute.png`
  * `measurements.png`, `measurements-full.png`
  * `phone-play.png`, `phone-inside-violin.png`

## Run, test, render

```sh
pnpm install
pnpm dev                      # http://localhost:5199
pnpm build && pnpm preview    # static build in apps/web/dist (Vercel: vercel.json)

pnpm test                     # 52 DSP/analysis unit tests (vitest), ~2.2 min
pnpm e2e                      # builds, then 18 Playwright tests (desktop + phone) in installed Chrome
pnpm bench                    # CPU per voice / instrument

pnpm refs:fetch               # download Iowa reference notes into .cache/ (gitignored, ~650 MB)
pnpm calibrate [--fit] [--decay-only]   # measure (and fit) the piano against them
pnpm refs:ensemble            # download + segment Iowa violin/viola/cello/flute runs (.cache/iowa-ens, ~500 MB)
pnpm calibrate:ensemble       # strings and flute vs those recordings [--engine <other checkout> for baselines]
npx tsx scripts/fit-flute.ts  # fit the flute voicing; scripts/fit-strings.ts <violin|viola|cello> for the bodies
npx tsx scripts/render-demos.ts   # re-render artifacts/audio (round 1)
npx tsx scripts/render-round2.ts  # round-2 MP3 demos into artifacts/round2/audio
node scripts/screenshots.mjs      # re-capture artifacts/shots (ROUND=2 → artifacts/round2/shots; needs `pnpm preview --port 4199`)
```

## Using the engine elsewhere

`packages/engine` is a self-contained package:

```ts
import { createInstrument } from '@piano-model/engine';
const inst = await createInstrument(audioContext, { instrument: 'piano', preset: 'grand' });
inst.connect(audioContext.destination);
inst.noteOn(60, 90); inst.sustain(0.5); inst.noteOff(60);
await inst.setInstrument('cello');
inst.control(11, 0.8);                       // expression
```

* **Offline rendering.** In the browser use `renderOffline({ events, duration, instrument })`,
  which goes through the real AudioWorklet. In Node use `renderInstrument` or
  `renderCore` from `@piano-model/engine/core`.
* **Bundling.** The worklet module is bundled via Vite's `?worker&url`. Other
  bundlers can pass `processorUrl`.

## Limits

* **Reference data.** Calibration used every 4th key of one piano recorded at
  three dynamics. Single-note decay comparisons are dominated by the recorded
  instrument's own idiosyncrasies, so register medians are reported.
* **Other instruments.** The strings and flute are compared with one player per
  instrument (Iowa MIS, first-position notes only, pp/mf/ff), and only their
  radiation, dynamics and flute voicing are fitted. Bodies and the flute bore
  are not measured.
* **Bow contact point.** The bow touches the string at a whole-sample tap, so
  small changes of bow position can move a note's level by a dB or two.
* **Phones.** On phones, the worklet sheds sympathetic strings and polyphony
  under load.

## Status

Round 2 (`93b5649` … this commit) is pushed to `main`, which is linked to a
Vercel production deployment. Whether that deployment is live is checked
separately and is not claimed here.

## Credits

* **Reference recordings:** University of Iowa Musical Instrument Samples
  (Steinway B, 2001; violin; viola, 1996; cello, 2001; flute, 2000), used for
  analysis only. The six short labelled excerpts on the
  measurements page are used under the MIS terms ("used for any projects,
  without restrictions").
* **Fonts:** Newsreader, IBM Plex Sans, IBM Plex Mono (SIL OFL), self-hosted.
