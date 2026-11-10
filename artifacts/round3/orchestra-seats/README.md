# Orchestra seats (audible engine change)

Each instrument of an ensemble is heard from its seat on the stage (the room's `seat`,
`packages/engine/src/core/post.ts`); a solo instrument is unchanged, sample for sample.

Before/after audio, the per-part numbers, the stage chart and the mono spectrogram are with the round's
notes: `artifacts/realistic-3d/final-next5/orchestra-opus/` (`NOTES.md`, `audio/`, `stage-chart.png`,
`handel-mono-spectrogram.png`, `data/`). A plain spectrogram cannot show where a sound sits, so the
chart plots each part's level difference between the channels instead.
