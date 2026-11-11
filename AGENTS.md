# Working in this repo (agents and people)

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it.

`instruments` is a browser app of thirteen acoustic instruments, each computed as physics in an AudioWorklet (TypeScript), never as samples. The instruments on `main` are the piano, the violin, the viola, the cello, the double bass, the flute, the oboe, the clarinet, the bassoon, the horn, the trumpet, the trombone and the timpani. Production is https://instruments-wustep.vercel.app (`wustep/instruments`). `main` deploys there automatically.

## Architecture

A pnpm workspace: `packages/*` and `apps/*`.

* **`packages/engine`** — the model. It has no Web Audio dependency in the core, so the same code runs in the worklet and in Node (tests, calibration, offline renders).
  * `src/core` — the DSP: `instrument.ts` (ids, families, ranges), `factory.ts`, `pump.ts` (cores render their own blocks), then one module per family (`piano-core.ts`, `bowed.ts`, `flute.ts`, `oboe.ts`, `clarinet.ts`, `bassoon.ts`, `brass.ts`, `horn.ts`, `trombone.ts`, `timpani.ts`) with its fitted voicing beside it (`*-tuning.json`, `bowed-fit.json`, `calibration-fit.json`). Shared: filters, soundboard, design, precompute, render, voice, post.
  * `src/worklet` — the AudioWorklet host (`processor.ts`).
  * `src/api` — the main-thread API (`createPiano`, `createInstrument`, `renderOffline`).
  * `src/analysis` — helpers for measurements and judges.
* **`apps/web`** — the Vite page (`@piano-model/web`).
  * `main.ts`, `nav.ts`, `address.ts` — the shell, history, and the real paths (`/piano`, `/piano/upright`, `/violin`, `/viola`, `/cello`, `/bass`, `/flute`, `/oboe`, `/clarinet`, `/bassoon`, `/horn`, `/trumpet`, `/trombone`, `/timpani`, `/orchestra`, `/measurements`, `/notes`, plus aliases `/grand`, `/upright`, `/double-bass`, `/contrabass`, `/french-horn`, `/kettledrums`, `/ensemble`). `address.ts` also writes the Orchestra's compact versioned query (`?v=1&seats=…&lines=…`).
  * `audio.ts` — talks to the worklet. `midi-file.ts`, `expression.ts`, `clock.ts`, `look.ts` (2D / vector / 3D).
  * `panel.css`, `ui/readout.ts` — the top panel: the bar (picker by family, orchestra, piano kind, view switch, pages) and the band under it (the readout of everything sounding, the spectrum, the scope or an ensemble's parts).
  * `ui/` — the 2D drawers (`stage-draw.ts`, `piano-draw.ts`, `oboe-draw.ts`, `clarinet-draw.ts`, `bassoon-draw.ts`, `horn-draw.ts`, `timpani-draw.ts`, `ensemble-draw.ts`, …), the keyboard, the player, the action close-up, tooltips.
  * `ui/vector/` — the vector (Chimera) 2D style, a second drawing of the same instruments.
  * `ui/gl/` — the 3D stage (`stage3d.ts`, `scenes3d.ts`, `gl3d.ts`, `fit3d.ts`, `fholes.ts`, and a module per instrument: `piano3d.ts`, `strings3d.ts`, `bass3d.ts`, `winds3d.ts`, `oboe3d.ts`, `clarinet3d.ts`, `bassoon3d.ts`, `horn3d.ts`, …).
  * `orchestra/` — seats, assignment, line-matching rules, the set list (`pieces.ts`), mix, the URL setup. Seating (`seats.ts`): up to four players sit on one arc in the lineup's order; five or more as an orchestra (strings in front, first violins at the audience's left, basses behind the cellos; woodwinds behind in two rows; brass at the back, the timpani past its left end or on a row behind on a phone), each row behind the strings a riser higher. The 3D stage, the 2D rows (`ui/ensemble-draw.ts`) and the sound (the room's `seat`) all take it from there. The mix (`mix.ts`): one bus at 1/√Σwᵢ², each part counted at the level it is played over its calibration (the engine's `PLAYBACK_DB`: the trombone's and the timpani's recording sessions' gain), and each part's own limiter told its share of the bus (`Limiter.bus`), so it works on the level heard. Auto-routing matches a line by its name, then its General MIDI program, then its place or range (`assign.ts`, `rules.ts`). A part named for its key ("Horn in F", "Corni in Es", "Clarinetto in A", "Tromba in D"; a bare "Horn" is in F) and typed at written pitch is shifted to concert pitch; a part already sounding stays. Lines are judged by their core range, so a few pedal notes do not send a horn to the double bass.
  * `views/` — the stage, the Measurements page, the Notes page.
* **`e2e/`** — Playwright, desktop (1440×900) and Pixel 7. Shared cases live in `app.spec.ts`; an instrument usually adds `e2e/<id>.spec.ts`, `<id>-2d.spec.ts` and `<id>-3d.spec.ts`.
* **`scripts/`** — calibration, judges, fits, renders, screenshots, and `check-worklet-syntax.mjs`.
* **`docs/`** — research, calibration, performance, 3D reference.
* **`vercel.json`** — a static build (`pnpm build` → `apps/web/dist`) and the SPA rewrites that make every path above serve `index.html`.

## Commands

Run these from the repo root (`pnpm@10`):

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server for `apps/web` |
| `pnpm typecheck` | `tsc -p packages/engine && tsc -p apps/web` |
| `pnpm build` | production Vite build, then the Safari 14.1 worklet syntax check |
| `pnpm preview` | preview the build |
| `pnpm test` | Vitest unit suite (engine and `apps/web/test`, including `vercel-paths.test.ts`) |
| `pnpm e2e` | `pnpm build && playwright test` (desktop and Pixel 7, default port 4199) |
| `pnpm refs:fetch` / `pnpm calibrate` | Iowa MIS references and the piano calibration |
| `pnpm refs:ensemble` / `pnpm calibrate:ensemble` | the same for the ensemble instruments |

A second checkout's Playwright run can use another port: `E2E_PORT=<port> npx playwright test` (after a build; `playwright.config.ts` reads `E2E_PORT`).

## The gate, before a merge

There are no GitHub Actions on this repo. The gate is local, then Vercel:

1. `pnpm typecheck`
2. `pnpm build` (the Safari 14.1 worklet check is part of this)
3. `pnpm test` (Vitest). This includes `apps/web/test/vercel-paths.test.ts`: every path `INSTRUMENT_PATHS` / `formatAddress` can write, and `/orchestra`, `/ensemble`, `/measurements`, `/notes`, must be rewritten to `/index.html` in **both** `vercel.json` rewrite groups. A missing rewrite is a 404 on a reload or a shared link in production; Vite's own server answers every path, so nothing local sees it unless this test fails.
4. Playwright: `pnpm e2e`, or `E2E_PORT=<port> npx playwright test` as above. Desktop and Pixel 7. Two known flakes — rerun them, do not loosen them: desktop “bow in the hand”; the phone or desktop action close-up `.av-speed` is sometimes empty.
5. `main` deploys to Vercel automatically. Do not log in to the Vercel CLI. Do not rename the repo, the Vercel project or the domain. A branch named `claude/*`, `codex/*` or `agent/*` builds no preview (`vercel.json` `ignoreCommand`). After a merge, confirm the production paths return HTTP 200 with no `x-vercel-error: NOT_FOUND`.

Push small commits, each with its numbers in the message. Squash-merge only when the gate is green.

## A new instrument

One pull request, the same shape each time:

* A core in `packages/engine/src/core`, registered on `INSTRUMENT_IDS` / `INSTRUMENT_INFO` / the factory. Fit it to the University of Iowa MIS (or another licensable source) with a held-out judge of BETTER (`npx tsx scripts/judge.ts --instrument <id> --before <old engine>`); keep the change only with that verdict. Cite the physical sources in comments.
* 2D in **both** styles: the default filled drawing and the vector style.
* 3D, including how a seated player holds it in the Orchestra, and the phone frame (`gl/fit3d.ts`) so the instrument is whole and clear of the player.
* An Orchestra voice and routing: its names and aliases, its General MIDI program, in `orchestra/assign.ts` and `orchestra/rules.ts`. Lines are matched by name, then program, then place or range. Transposing parts named for a key and typed at written pitch are shifted to concert; parts already sounding stay.
* Paths: add the id and any aliases so `INSTRUMENT_PATHS` in `address.ts` stays in lockstep with both rewrite groups in `vercel.json`. `apps/web/test/vercel-paths.test.ts` must stay green. (The oboe shipped in #30 without `/oboe` in `vercel.json`; #31 added the test so that cannot happen again.)
* Unit tests for the core, the drawers, the 3D module and the routing, plus e2e alone (both 2D styles and 3D) and among the others, including the Orchestra.
* The picker: add the id to its family (`groupOf` in `views/stage.ts`). On a computer the thirteen sit on one row of the bar with their whole names clear of each other (wider than 1320 px; narrower, and on a phone, one button opens them as a sheet, four to a row, each at least 44 px to touch). `e2e/top-panel.spec.ts` measures both; a fourteenth must keep them green.
* Notes and Measurements as the instrument needs them; before/after pictures and audio, and a `NOTES.md`, with the PR.
* The stage stays nearly wordless: no new permanent explanatory text, no position-line tooltip. The action close-up / per-string zoom is piano-only.

## MIDI and recordings

* Pieces bundled under `apps/web/public/pieces` must be public domain (Mutopia and the like), with their source, credit and sha256 in `orchestra/pieces.ts`. Never commit a copyrighted MIDI. Local-only files stay local (they are not in the repo).
* University of Iowa MIS reference recordings are for analysis only: never played as the instrument, never committed. They live in `.cache/` (typically `.cache/iowa` and `.cache/iowa-ens`). `git ls-files | grep -iE '\.(aiff?|wav|flac)$'` prints nothing.

## Rules, each with the check that enforces it

Run the check before you push.

| Rule | Check |
|---|---|
| Tests stay fast. No new test over ~10 s; build one instrument and reuse it. | `pnpm test` (unit, a few minutes), `pnpm e2e` (build plus Playwright desktop and Pixel 7, several minutes) |
| The host's block size never changes the sound. Cores render their own blocks (`core/pump.ts`). Smoothing is a time constant, never a fraction per block. | `packages/engine/test/blocksize.test.ts`: bit-identical at 128/37/500 frames per call |
| A refactor must not silently change the sound. A deliberate change is blessed, with before/after audio in the commit. | `packages/engine/test/golden.test.ts`; bless with `UPDATE_GOLDEN=1 npx vitest run packages/engine/test/golden.test.ts` |
| Calibration is measured, not tuned by ear. A change is kept only with a verdict against the recordings, held-out notes included. | `npx tsx scripts/judge.ts --instrument <i> --before <old engine>` (BETTER / WORSE / NO CLEAR CHANGE); `scripts/calibrate.ts`, `scripts/attack-judge.ts` for the piano |
| Every audible engine change ships before/after MP3s and spectrograms with its numbers, under `artifacts/round3/<topic>/`. | `scripts/render-*.ts --before <engine>`; `scripts/spectrogram.ts` |
| Reference recordings (University of Iowa MIS) are for analysis only: never played as an instrument, never committed. They live in `.cache/`. | `git ls-files \| grep -iE '\.(aiff?\|wav\|flac)$'` prints nothing |
| The worklet bundle parses in Safari 14.1 (the first WebKit with AudioWorklet). | `pnpm build` runs `scripts/check-worklet-syntax.mjs` |
| Start-up never waits on a worklet round trip, keeps one AudioContext per page, and never retries outside a gesture. | e2e "start-up …" tests; `?debug` on the site shows each step |
| The audio thread never fails silently: a constructor or `process()` that throws posts one error, then silence. | `packages/engine/test/worklet.test.ts` (fake `AudioWorkletGlobalScope`) |
| The readout says everything that is sounding, never one note as if it were the chord: one note and its frequency; two to four by name with their chord or interval; more, the chord or a count with the span; an ensemble, how many parts. It keeps its box (the band never moves) and dims when nothing sounds. | `apps/web/test/readout.test.ts`; e2e “the readout says every note sounding …”, “an ensemble: the readout says …” (`e2e/top-panel.spec.ts`); `npx tsx scripts/shots-top-panel.mjs` photographs it |
| The stage stays nearly wordless. Icon-only controls get a `data-tip` and an `aria-label`, not visible labels. Banned fonts: Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young Serif, Bodoni, Geist, Syne. | e2e tooltip test; `grep -riE 'Inter\|Fraunces\|Geist\|Syne\|Sora' apps/web/src` stays clean |
| The phone layout works at 390×844 with no horizontal scroll. | e2e "layout fits the viewport" (Pixel 7 project) |
| On touch the keys carry no computer-key letters and slide only from the position strip over them: a drag on the keys is a glissando. A phone held upright frames its 3D instrument whole, clear of the file player (`gl/fit3d.ts`); a wide stage keeps the scenes' own views. | e2e "phone keys …", "3D on a phone held upright …"; `apps/web/test/fit3d.test.ts`; `node scripts/measure-phone-3d.mjs` prints each instrument's share of the stage |
| The piano's action close-up shows the key being played: a strike is replayed only if it happened while the close-up was on that key, the key and the damper follow the replay (held or tapped), a note played by hand on another key and a change of piano move it, and the section is whole on every panel (a phone included; in 3D a narrow stage frames the key's action exactly). | `apps/web/test/action-motion.test.ts`; e2e "the action close-up follows the playing …", "a key’s close-up in 3D on a narrow stage …"; `node scripts/shots-hammer-action.mjs` photographs every state |
| A varnished plate reads clean in 3D: its painted wear is soft (no dots, no patches of speckle), and no facet of its arch turns a reflection more than 12°. | e2e "3D varnish …" (the painted map, measured); `apps/web/test/models3d.test.ts` "a smooth arch" |
| F-holes are constructed (`apps/web/src/ui/gl/fholes.ts`: round eyes, an S stem, two nicks), in 2D and 3D alike, never a photograph's trace. A new bowed instrument adds one `FHole`. | `apps/web/test/fholes.test.ts` |
| The 2D pianos draw what their strings are fastened to, as still picture in the cached layer (nothing per frame): the plate as a frame (pin block, a hitch rail past each bridge, a band inside the case, three tapered struts), one tuning pin and one hitch pin per string inside the case on the string's own line, the upright's hammers in one level row. Sizes follow the key pitch; under 6 px a key (an ensemble's small piano) the pins and wires are dropped. The vector style draws the same geometry as lines only. | `apps/web/test/piano-plate.test.ts`; `e2e/piano-2d.spec.ts`; `node scripts/shots-piano-2d.mjs` photographs it |
| The lid and the room are set by two rotary knobs on the stage, in 2D (both styles) and in 3D, each by what it moves and where it does not move while it is turned; no word on them, a tooltip and a slider's name. The room's knob is continuous everywhere, left wherever it is let go (2D: the stage's top right corner; 3D: on the floor where the pool of light at its largest ends; the room shows as that light pool). The 2D lid is continuous too (its knob on the lid by its hinge). The 3D lid rests only shut, on the short stick or on the long one: its knob (beside the lid on the treble side, under the rim) clicks between those three notches, its arrows step a notch, and the lid itself taken by hand follows continuously (standing on the shortest stick that reaches it, pressed down below its rest, never through the lid) and comes onto the nearest rest when let go; a 2D lid between rests switched to 3D comes onto the nearest. The other arrows move a knob by 0.05. Moving the lid never moves the camera. | `apps/web/test/lid3d.test.ts`, `apps/web/test/stage-knob.test.ts`; e2e "3D: the grand’s lid rests shut, on its short stick or on its long one …" (desktop and phone), "room and lid are turned on their knobs on the stage …" (2D); `node scripts/clip-lid-knobs.mjs` records it, `node scripts/shots-lid-knobs.mjs` photographs it |
| A file or a piece playing tells the bowed instruments the notes to come (the player, 5 s ahead: `audio.foreseeFileEvent`; the engine plans each stroke with what it sees 4 s ahead: `bowed.ts` `foresee`): detached notes alternate, notes that overlap share a bow, the hair is shared out by length and dynamic (speed and contact point together, so the level is the dynamic's), a stroke begins where it has room, the lifted bow moves there in a rest. Nothing foreseen (the keys, a keyboard, the bow in the hand) is the old path, bit-identical. The notes themselves are scheduled as ever; Orchestra routing is untouched. Only the vector 2D style marks the bow's direction (a chevron); the drawn style and 3D have none. | `packages/engine/test/bow.test.ts` “the bow planned ahead …”; `apps/web/test/bow-direction.test.ts`, `note-lengths.test.ts`; `e2e/bowing.spec.ts`; `npx tsx scripts/bow-trace.ts` draws a passage's bow before and after, `scripts/bow-plan-range.ts` measures the speed range, `node scripts/shots-bowing.mjs` photographs it |
| The 3D stage never compiles a shader where it would freeze it: a key's close-up compiles none when it opens (its section's programs are compiled ahead, `three3d.ts` `warmSection`), and a new instrument's first frame waits for its programs, compiled in parallel, without blocking the page (`hold`). | `e2e/zoom-perf.spec.ts`; `node scripts/perf-zoom.mjs` (click → zoomed frame, worst frame, long tasks), `scripts/perf-load.mjs`, `scripts/perf-switch.mjs`, `scripts/perf-frames.mjs`; `docs/PERFORMANCE.md` |
| The 3D stage draws without one WebGL error or warning. A pass never samples a texture it is drawing into (the browser drops that draw; other GPUs differ). | e2e "3D draws without one WebGL warning" (console and `gl.getError()` every frame); `node scripts/webgl-warnings.mjs` counts them per instrument |

## Deploying

`main` deploys to Vercel automatically. Push small commits, each with its numbers in the message.

Don't log in to the Vercel CLI. Don't rename the repo, the Vercel project or the domain. A branch named
`claude/*`, `codex/*` or `agent/*` builds no preview (`vercel.json` `ignoreCommand`).

## Notes for the DSP

* Units are SI and sample rates are real: test at 44.1 and 48 kHz, plus 22.05 and 96 kHz in e2e.
* Physical parameters come from the literature or are fitted to recordings, and the source is cited in a comment.
* Never allocate in the audio path. The visual telemetry (`getVisual`) runs at about 30 Hz and must stay cheap.
