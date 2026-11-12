<p align="center">
  <a href="https://instruments-wustep.vercel.app/piano?view=3d"><img src="apps/web/public/og/instruments-grand.jpg" alt="A 3D grand piano with its lid raised, lit by a single pool of light, beside the title Instruments." width="100%" /></a>
</p>

# Instruments

Acoustic instruments simulated as physics in real time in the browser. No samples are played: every
note is a model of hammers, bows, fingers, air jets, reeds, lips or mallets driving strings, tubes,
membranes and bars.

**Play it:** [instruments-wustep.vercel.app](https://instruments-wustep.vercel.app).
**Hear the orchestra:** [/symphony](https://instruments-wustep.vercel.app/symphony), *Toward Morning*
on thirteen seats, or [/everything](https://instruments-wustep.vercel.app/everything), *Everything So Far*
on eleven. Press play.

## Instruments

Sixteen, each at its own address:
[piano](https://instruments-wustep.vercel.app/piano) (grand, and [upright](https://instruments-wustep.vercel.app/piano/upright)),
[violin](https://instruments-wustep.vercel.app/violin),
[viola](https://instruments-wustep.vercel.app/viola),
[cello](https://instruments-wustep.vercel.app/cello),
[double bass](https://instruments-wustep.vercel.app/bass),
[harp](https://instruments-wustep.vercel.app/harp),
[flute](https://instruments-wustep.vercel.app/flute),
[oboe](https://instruments-wustep.vercel.app/oboe),
[clarinet](https://instruments-wustep.vercel.app/clarinet),
[bassoon](https://instruments-wustep.vercel.app/bassoon),
[horn](https://instruments-wustep.vercel.app/horn),
[trumpet](https://instruments-wustep.vercel.app/trumpet),
[trombone](https://instruments-wustep.vercel.app/trombone) (alto, tenor and bass),
[tuba](https://instruments-wustep.vercel.app/tuba),
[timpani](https://instruments-wustep.vercel.app/timpani) and
[glockenspiel](https://instruments-wustep.vercel.app/glockenspiel).
The list lives in `packages/engine/src/core/instrument.ts` (`INSTRUMENT_IDS`).

## Features

* **Three views** of every instrument: the filled 2D drawing, a vector-line 2D style (after Chimera,
  see [Credits](#credits)) and a WebGL2 3D stage. `?view=2d|vector|3d` sets it.
* **Play** from the on-screen keys, the computer keyboard, or a MIDI keyboard (Web MIDI: sustain,
  sostenuto and una corda on the piano; mod wheel and expression on strings and winds).
* **MIDI files.** Drop a file, or pick a bundled public-domain piece from the player. On the
  [Orchestra](https://instruments-wustep.vercel.app/orchestra) each part is routed to a seat by its name,
  then its General MIDI program, then its place or range; parts named for a key ("Horn in F") and written
  at written pitch are moved to concert pitch. Files without dynamics are phrased automatically.
* **Orchestra.** Up to 24 seats, each its own engine. Up to four sit on one arc; five or more as an
  orchestra on risers, and each part is heard from its seat. The address carries the whole setup
  (`?v=1&seats=…&lines=…`), so it is a shareable preset.
* **/symphony, /everything.** *Toward Morning* on its thirteen seats, *Everything So Far* on its eleven,
  loaded and silent until you press play.
* **Look inside.** A live readout of every note sounding, the spectrum, and each instrument's
  excitation (hammer force, bow stick–slip, jet, bore pressure); physical controls such as hammer
  hardness, bow force, breath pressure, the piano's lid and the room.
* **[Measurements](https://instruments-wustep.vercel.app/measurements)** compares the models with their
  reference recordings; **[Notes](https://instruments-wustep.vercel.app/notes)** explains the physics and
  lists the sources.
* **Less page, for filming:** `keys=0` hides the keys; `ui=0` shows the stage alone (a 2D piano keeps its keys; `keys=1` keeps them on any one instrument).

## How it works

* **Models, by family** (`packages/engine/src/core`, one module per family, its fitted voicing in a
  `*.json` beside it):
  * piano: travelling waves in stiff, detuned strings, a nonlinear felt hammer, dampers and pedals, all
    coupled through one bridge to a modal soundboard;
  * bowed strings: stick–slip friction on the string (Helmholtz motion), one bow with a length, planned
    ahead when a file is playing, four strings on a bridge over a modal body;
  * harp: 47 strings as their partials, two planes of vibration, seven pedals;
  * flute: an air jet driving an open tube; oboe, clarinet, bassoon: a reed's flow solved with a conical
    or cylindrical bore each sample;
  * brass: lips as a mass–spring valve on a bore that the valves or slide lengthen, with nonlinear
    steepening when loud;
  * timpani: air-loaded membrane modes struck by a felt mallet;
  * glockenspiel: thirty steel bars, each its pitch and five families of partials measured on recordings,
    struck by a player's two mallets (no two strokes alike; a held key can roll).

  Each is fitted to the University of Iowa MIS recordings (the timpani to VSCO 2 CE, the harp to VCSL, the
  glockenspiel to the Iowa orchestra bells), and each change is judged on notes held out of the fit
  (`scripts/judge.ts`). Citations are
  in [`docs/RESEARCH.md`](docs/RESEARCH.md), numbers in [`docs/CALIBRATION.md`](docs/CALIBRATION.md).
* **Engine.** The core has no Web Audio dependency, so the same TypeScript runs in an AudioWorklet
  (`src/worklet`, parsed by Safari 14.1 and later) and in Node for tests, calibration and offline renders.
  The page talks to it through `src/api` (`createInstrument`, `renderOffline`).
* **Renderers** (`apps/web/src/ui`): a 2D drawer per instrument in `ui/`, the vector style in
  `ui/vector/`, and the three.js 3D stage in `ui/gl/` (a module per instrument, `fit3d.ts` framing
  phones). All three draw the same telemetry from the worklet. Seating and routing are in
  `apps/web/src/orchestra/`.

[`AGENTS.md`](AGENTS.md) is the full map, the house rules and the checklist for a new instrument.

## Development

Node with pnpm 10:

```sh
pnpm install
pnpm dev          # http://localhost:5199
pnpm typecheck    # engine and web
pnpm build        # apps/web/dist, then the Safari 14.1 worklet syntax check
pnpm preview      # serve the build (port 4199)
pnpm test         # Vitest unit tests
pnpm e2e          # build, then Playwright (Chrome desktop and Pixel 7, a WebKit smoke test)
pnpm bench        # CPU per voice
```

`artifacts/` holds about 400 MB of before/after audio and screenshots that nothing builds from. To skip it:

```sh
git clone --filter=blob:none --sparse https://github.com/wustep/instruments.git
cd instruments && git sparse-checkout set --no-cone '/*' '!/artifacts/'
```

Calibration needs the reference recordings in `.cache/` (never committed): `pnpm refs:fetch`,
`pnpm calibrate`, `pnpm refs:ensemble`, `pnpm calibrate:ensemble`, and the `scripts/fit-*.ts` per
instrument.

## Credits

Built by [Stephen Wu](https://wustep.me) ([@wustep](https://x.com/wustep)) with Claude Opus 5.5 and
Claude Fable 5.2, Anthropic's models, working in Claude Code.

* **Reference recordings:** the [University of Iowa Musical Instrument
  Samples](https://theremin.music.uiowa.edu/MIS.html) (a Steinway model B, violin, viola, cello, double
  bass, flute, oboe, B♭ clarinet, bassoon, horn, trumpet, tenor and bass trombones, tuba, orchestra
  bells), for analysis
  only, never played as an instrument. Six short Steinway excerpts on the Measurements page are used
  under the MIS terms.
* **Harp and timpani recordings:** the [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE)
  by Versilian Studios (Sam Gossner and Simon Dalzell), CC0, and for the harp's two dynamics their
  [Versilian Community Sample Library](https://github.com/sgossner/VCSL), CC0. Analysis only.
* **Pieces:** the [Mutopia Project](https://www.mutopiaproject.org)'s typesettings of Bach, Handel,
  Haydn, Mozart, Beethoven, Chopin and a ground from Playford's Division Violin, played unchanged; each
  file's typesetter, source and sha256 are in `apps/web/src/orchestra/pieces.ts` and on the Notes page.
  *Toward Morning* and *Everything So Far* were written for these instruments by Fable 5.2 (2026).
* **3D:** [three.js](https://threejs.org) (MIT).
* **The vector view** is after [Chimera](https://github.com/jamesondh/chimera-vocal-synth), Jameson
  Hodge's vocal synth: its screens were the inspiration, and none of its code is used. Its type is
  AVHershey Simplex by Stewart C. Russell, from A. V. Hershey's vector fonts (US Naval Weapons
  Laboratory, 1967).
* **Fonts:** Newsreader, IBM Plex Sans and IBM Plex Mono (SIL OFL), self-hosted.
* **The physics** is other people's, cited where it is used: `docs/RESEARCH.md`, the comments in
  `packages/engine/src/core`, and the Sources on the Notes page.

## License

The code is under the [MIT License](LICENSE). Bundled third-party files keep their own terms:

* **Pieces** (`apps/web/public/pieces/*.mid`): Mutopia Project files, public domain, except
  `bach-bwv1046-adagio-oboe.mid` (typeset by Ben Stewart, Mutopia-2008/10/29-1577), which is Creative
  Commons Attribution 3.0.
* **Toward Morning** (`apps/web/public/pieces/fable-toward-morning.mid`) and **Everything So Far**
  (`apps/web/public/pieces/fable-everything-so-far.mid`), this project's own pieces, are dedicated to the
  public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
* **Reference excerpts** (`apps/web/public/ref/*.mp3`): University of Iowa MIS, see
  `apps/web/public/ref/LICENSE.txt`.
* **Fonts:** AVHershey Simplex (CC0 / WTFPL); Newsreader and IBM Plex (SIL OFL).
