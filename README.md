# Piano Model

Five acoustic instruments, physically modelled and computed in real time in the
browser: a **piano**, a **violin**, a **viola**, a **cello** and a **flute**.
No samples are ever played as the sound. Every note is a simulation of felt
hammers, bows and air jets driving strings and tubes, which in turn drive a
soundboard or body.

**Production URL (planned):** https://piano-model-wustep.vercel.app. Vercel
deployment is handled separately and was **not verified live** at handoff: the
Vercel project lookup returned 404. `vercel.json` makes this a static build
(`pnpm build` → `apps/web/dist`).

## What you can do

* **Play.** Use the computer keyboard (`A`…`'`, with `Z`/`X` for octave and `C`/`V`
  for velocity), the on-screen keyboard (strike nearer the front of a key to play
  louder) or a MIDI keyboard. MIDI devices can be plugged in while the page is
  open.
* **Controllers and pedals.**
  * **Sustain (CC64)** is continuous, so half-pedalling works.
  * **Una corda (CC67)** and **sostenuto (CC66)** apply to the piano.
  * **Vibrato (CC1)** and **expression (CC11 / CC2)** apply to strings and flute.
  * On the computer keyboard, hold `Space` for sustain and `Shift` for una corda.
* **Instruments.** Choose one with the selector on the Play page. The piano has
  four presets: concert grand, upright, honky-tonk and prepared.
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
  your browser. A candid list of where it falls short is included.

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
  * **Body.** Fingers shorten the strings, with vibrato. All four strings stand on
    one bridge over a modal body with each instrument's signature air and wood
    resonances, so open strings ring sympathetically.
* **Flute.**
  * **Jet and tube.** A jet of breath is deflected by the sound in the tube. The
    time a ripple takes to travel along the jet decides which resonance it feeds.
  * **Overblowing.** Blowing harder makes the jet faster: the tone brightens,
    pitch rises slightly, and eventually the tube overblows to its octave, which
    is how the upper registers work.
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
| **Bowed strings** | stick–slip friction with hysteresis, Helmholtz motion, bow position/force/speed (Schelleng), stopped strings with vibrato, four strings on one bridge, modal body with A0/B1 modes, sympathetic open strings | no torsional waves, bow width, bow changes or bridge dynamics (a formant instead); bodies are not measured; **not calibrated against recordings** |
| **Flute** | jet-drive feedback with jet delay from blowing pressure, overblowing, Strouhal-limited jet, turbulence noise, open–open bore | no tone holes or bore taper; weak even harmonics; per-note tuning uses a measured voicing table; **not calibrated against recordings** |
| **Listener** | close "microphones" from mode shapes | lid shelf, small FDN room, safety limiter (audio effects, not physics) |

## Realism, candidly

* **Piano.** Against a Steinway B recording:
  * stretch tuning is within ≈ 4 ¢ RMS and inharmonicity within ≈ 15 % RMS;
  * from C4 to B5, decay times are within about ×1.4 of the recording, but the top octave's first decay is too fast (×0.6);
  * the spectral balance is within ≈ 4.5 dB per third-octave band;
  * loudness is within ≈ 4–8 dB per note.

  The biggest audible gaps:
  * the tenor's (C2–B3) first decay is about twice as slow as the real piano's;
  * the lowest octave's sustain is about two-thirds as long;
  * loud notes brighten less than real felt makes them.

  It sounds like a convincing, slightly "clean" grand: closer than classic
  synthesis, short of a high-end commercial modelled piano.
* **Strings.** They have genuine bowed attacks, transients and pressure/position
  response. The timbre is plausible violin-family, but the bodies are generic and
  bow changes are not modelled, so long passages sound "synthetic-ensemble"
  rather than like a specific instrument.
* **Flute.** The flute is breathy and responsive and overblows naturally. It is
  purer than a real flute, with weaker octave harmonics.

## Demos and screenshots (for handoff)

All rendered by the models; see [`artifacts/README.md`](artifacts/README.md) for
captions.

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

pnpm test                     # 44 DSP unit tests (vitest), ~2.5 min
pnpm e2e                      # builds, then 18 Playwright tests (desktop + phone) in installed Chrome
pnpm bench                    # CPU per voice / instrument

pnpm refs:fetch               # download Iowa reference notes into .cache/ (gitignored, ~650 MB)
pnpm calibrate [--fit]        # measure (and fit) the piano against them
npx tsx scripts/render-demos.ts   # re-render artifacts/audio
node scripts/screenshots.mjs      # re-capture artifacts/shots (needs `pnpm preview --port 4199`)
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
* **Other instruments.** The strings and flute were built and verified by
  physics tests (pitch, emergent Helmholtz motion, overblowing, sympathetic
  resonance), not by comparison with recordings.
* **Phones.** On phones, the worklet sheds sympathetic strings and polyphony
  under load.

## Status

The latest pass is local only: commits after `bb9a39f` have not been pushed or
deployed, and nothing external was created. Pushing and deployment wait on
upstream authorisation.

## Credits

* **Reference recordings:** University of Iowa Musical Instrument Samples
  (Steinway B, 2001), used for analysis. The six short labelled excerpts on the
  measurements page are used under the MIS terms ("used for any projects,
  without restrictions").
* **Fonts:** Newsreader, IBM Plex Sans, IBM Plex Mono (SIL OFL), self-hosted.
