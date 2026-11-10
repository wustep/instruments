# Working in this repo (agents and people)

`instruments`: six acoustic instruments computed as physics in an AudioWorklet (TypeScript). Engine:
`packages/engine/src/core` (DSP), `packages/engine/src/worklet` (the AudioWorklet host),
`packages/engine/src/api` (the main-thread API). App: `apps/web` (Vite). Scripts for calibration,
renders and audits: `scripts/`.

Each rule comes with the check that enforces it. Run the check before you push.

| Rule | Check |
|---|---|
| Tests stay fast. No new test over ~10 s; build one instrument and reuse it. | `pnpm test` (unit, ~3 min), `pnpm e2e` (build plus Playwright desktop and Pixel 7, ~1.5 min) |
| The host's block size never changes the sound. Cores render their own blocks (`core/pump.ts`). Smoothing is a time constant, never a fraction per block. | `packages/engine/test/blocksize.test.ts`: bit-identical at 128/37/500 frames per call |
| A refactor must not silently change the sound. A deliberate change is blessed, with before/after audio in the commit. | `packages/engine/test/golden.test.ts`; bless with `UPDATE_GOLDEN=1 npx vitest run packages/engine/test/golden.test.ts` |
| Calibration is measured, not tuned by ear. A change is kept only with a verdict against the recordings, held-out notes included. | `npx tsx scripts/judge.ts --instrument <i> --before <old engine>` (BETTER / WORSE / NO CLEAR CHANGE); `scripts/calibrate.ts`, `scripts/attack-judge.ts` for the piano |
| Every audible engine change ships before/after MP3s and spectrograms with its numbers, under `artifacts/round3/<topic>/`. | `scripts/render-*.ts --before <engine>`; `scripts/spectrogram.ts` |
| Reference recordings (University of Iowa MIS) are for analysis only: never played as an instrument, never committed. They live in `.cache/`. | `git ls-files \| grep -iE '\.(aiff?\|wav\|flac)$'` prints nothing |
| The worklet bundle parses in Safari 14.1 (the first WebKit with AudioWorklet). | `pnpm build` runs `scripts/check-worklet-syntax.mjs` |
| Start-up never waits on a worklet round trip, keeps one AudioContext per page, and never retries outside a gesture. | e2e "start-up …" tests; `?debug` on the site shows each step |
| The audio thread never fails silently: a constructor or `process()` that throws posts one error, then silence. | `packages/engine/test/worklet.test.ts` (fake `AudioWorkletGlobalScope`) |
| The stage stays nearly wordless. Icon-only controls get a `data-tip` and an `aria-label`, not visible labels. Banned fonts: Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young Serif, Bodoni, Geist, Syne. | e2e tooltip test; `grep -riE 'Inter\|Fraunces\|Geist\|Syne\|Sora' apps/web/src` stays clean |
| The phone layout works at 390×844 with no horizontal scroll. | e2e "layout fits the viewport" (Pixel 7 project) |
| The 3D stage draws without one WebGL error or warning. A pass never samples a texture it is drawing into (the browser drops that draw; other GPUs differ). | e2e "3D draws without one WebGL warning" (console and `gl.getError()` every frame); `node scripts/webgl-warnings.mjs` counts them per instrument |

## Deploying

`main` deploys to Vercel automatically. Push small commits, each with its numbers in the message.

Don't log in to the Vercel CLI. Don't rename the repo, the Vercel project or the domain. A branch named
`claude/*`, `codex/*` or `agent/*` builds no preview (`vercel.json` `ignoreCommand`).

## Notes for the DSP

* Units are SI and sample rates are real: test at 44.1 and 48 kHz, plus 22.05 and 96 kHz in e2e.
* Physical parameters come from the literature or are fitted to recordings, and the source is cited in a comment.
* Never allocate in the audio path. The visual telemetry (`getVisual`) runs at about 30 Hz and must stay cheap.
