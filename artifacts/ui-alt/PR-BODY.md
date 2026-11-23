## UI alternate C: Night Gallery

**One of three alternative UIs. Do not merge until Stephen picks.**

The instrument is the one lit object in a museum room after closing, and the page is that room: a cool charcoal wall, a picture rail, a wall label, a plinth. Light is the only signal: what is chosen, pressed or sounding is lit, never coloured or boxed.

**Preview:** PREVIEW_URL

### What changed

- **Layout and navigation.** The bar is a rail: the sixteen instruments stand on its lower hairline, the one on the stage lit from a fixture on its upper edge. The piano's kind, the view (2D · Vector · 3D) and the two pages are words that light, where they were boxed chips. On a phone the picker button and the orchestra button have no frames and the view switch hangs from the rail. Every address, class and layout fact the e2e checks measure is as it was.
- **Type and colour.** One family, Libre Franklin (digits from Public Sans, its fork, for tabular figures), 11 px floor; Newsreader and IBM Plex are gone. Wall `#111315`, bone ink, and three lights with no paint: silver (whatever is on or sounds), tungsten (what a body does), steel (reference). The vermilion and amber are gone; all colour on the page is an instrument's own.
- **Controls.** Dials are a thin ring with an index and an arc of light; pedals are outlines that fill when held; keys stand in half-light and go white when they sound; the octave arrows, back, reset, close and the phone's knob button are drawn icons (they were `‹ › ← ↺ × ◐`). The stage's two knobs each carry what they move (a lid on its hinge, a room). The pieces menu leads with the title.
- **2D backgrounds.** The wall is washed by scallops of light from a rail of wall-washers, and the light lies across the drawing too; the floor line is the fallboard's lit edge. The vector style is the same wall turned down, argon blue and tungsten amber, one floor hairline where its frame was.
- **3D environment and lighting.** The nine-softbox studio is replaced by a gallery: a silver light from behind and above that casts the shadow forward, a second from behind for the far edge, a dim tungsten key across the front, no fill. The room and its lights are turned to where each instrument is first seen from, so all sixteen are lit alike. Behind the instrument the stage paints a far wall with its scallop of light and the line where it meets a dark honed floor; the wall moves back as the room's knob is turned. The risers are plinths. `lite`, phone AO and shadows are untouched.
- **Pages.** Notes and Measurements in the same family on a 33 rem measure; the 404 keeps *Tacet*. Favicon and link preview redrawn in the new look.

Process: `/impeccable critique` of the incumbent (27/40, `artifacts/ui-alt/CRITIQUE.md`), a pinned direction contract, the build, an independent finish review (one fix round), `/impeccable audit` (`artifacts/ui-alt/AUDIT.md`), polish. `DESIGN.md` is the system; `PRODUCT.md` the product record.

### Before / after

A computer, 1440×900. The piano holds C3 C4 E4 G4; the others one note.

| Before (production) | After (this branch) |
| :---: | :---: |
| ![before-piano-2d-desktop](shots/before-piano-2d-desktop.png) | ![after-piano-2d-desktop](shots/after-piano-2d-desktop.png) |
| ![before-piano-3d-desktop](shots/before-piano-3d-desktop.png) | ![after-piano-3d-desktop](shots/after-piano-3d-desktop.png) |
| ![before-orchestra-3d-desktop](shots/before-orchestra-3d-desktop.png) | ![after-orchestra-3d-desktop](shots/after-orchestra-3d-desktop.png) |
| ![before-cello-3d-desktop](shots/before-cello-3d-desktop.png) | ![after-cello-3d-desktop](shots/after-cello-3d-desktop.png) |
| ![before-horn-3d-desktop](shots/before-horn-3d-desktop.png) | ![after-horn-3d-desktop](shots/after-horn-3d-desktop.png) |
| ![before-piano-vector-desktop](shots/before-piano-vector-desktop.png) | ![after-piano-vector-desktop](shots/after-piano-vector-desktop.png) |
| ![before-violin-2d-desktop](shots/before-violin-2d-desktop.png) | ![after-violin-2d-desktop](shots/after-violin-2d-desktop.png) |
| ![before-orchestra-2d-desktop](shots/before-orchestra-2d-desktop.png) | ![after-orchestra-2d-desktop](shots/after-orchestra-2d-desktop.png) |
| ![before-measurements-desktop](shots/before-measurements-desktop.png) | ![after-measurements-desktop](shots/after-measurements-desktop.png) |
| ![before-notes-desktop](shots/before-notes-desktop.png) | ![after-notes-desktop](shots/after-notes-desktop.png) |
| ![before-not-found-desktop](shots/before-not-found-desktop.png) | ![after-not-found-desktop](shots/after-not-found-desktop.png) |

A phone, 390×844.

| Before | After | Before | After |
| :---: | :---: | :---: | :---: |
| ![before-piano-2d-phone](shots/before-piano-2d-phone.png) | ![after-piano-2d-phone](shots/after-piano-2d-phone.png) | ![before-piano-3d-phone](shots/before-piano-3d-phone.png) | ![after-piano-3d-phone](shots/after-piano-3d-phone.png) |
| ![before-orchestra-3d-phone](shots/before-orchestra-3d-phone.png) | ![after-orchestra-3d-phone](shots/after-orchestra-3d-phone.png) | ![before-cello-3d-phone](shots/before-cello-3d-phone.png) | ![after-cello-3d-phone](shots/after-cello-3d-phone.png) |
| ![before-picker-phone](shots/before-picker-phone.png) | ![after-picker-phone](shots/after-picker-phone.png) | ![before-harp-vector-phone](shots/before-harp-vector-phone.png) | ![after-harp-vector-phone](shots/after-harp-vector-phone.png) |
| ![before-notes-phone](shots/before-notes-phone.png) | ![after-notes-phone](shots/after-notes-phone.png) |   |   |

### Checks

- `pnpm typecheck`: clean.
- `pnpm build`: clean, the Safari 14.1 worklet check included (`processor-*.js: ok for Safari 14.1+`).
- `pnpm test`: 1171 of 1171 in 111 files. (One of three whole runs had a single failure, while the Playwright build was starting on the same machine; its name was not kept. The run before it and the run after it, alone, passed whole.)
- Playwright, the whole suite (`E2E_PORT=4393 npx playwright test`: Chrome desktop and Pixel 7, WebKit and WebKit phone): 404 passed, 36 skipped by project, 0 failed, 15.8 min. After the last token clean-up, the chrome's own specs again (`top-panel`, `not-found`, `polish`, `phone-orchestra`, `sheet`, `ui-sweep`): 41 passed, 11 skipped by project.
- Tests changed to the new look's facts, none loosened: `e2e/not-found.spec.ts` (the family, the wall and the icon's pixels), `e2e/app.spec.ts` (the vector ground and slot colours), `e2e/phone-orchestra.spec.ts` (which windows show the lamp's hint whole, measured), `apps/web/test/vector.test.ts` (reads the palette).
- `packages/engine` is untouched (0 lines of diff): no sound changed, no golden blessed.
- Detector (`impeccable detect`): static scan of `apps/web` 0; rendered 0 on `/piano` (1440, 390, 3D), `/symphony`, `/measurements` and `/404.html`; `/notes` 6, all one rule on diagram labels read as body text. The incumbent: 7 static, 34 on `/piano`, 172 on `/notes`.
- Measured in the page (`artifacts/ui-alt/audit-measure.mjs`): no text under 11 px, none under AA, no sideways scroll, on six pages at 1440 and 390.
- Banned fonts grep: nothing. `git ls-files | grep -iE '\.(aiff?|wav|flac)$'`: only `artifacts/audio/`.
- The finish review (an independent reviewer, one fix round): eight fixes asked for; at its verdict seven were resolved, one partial (the horn's and the violin's bodies evenly lit) and it found one regression (the spectrum's trace parted for its figures). Both were taken afterwards (the room's lights turned to each instrument's first view; the figures hung under the trace) and have **not** been scored by a reviewer.

### Left for a follow-up

- The Orchestra shows its lineup four times (critique P1); outside this brief.
- The file player's buttons are 36 px on a phone (eight share a 390 px row with the hairline, by the rule in `AGENTS.md`).
- Icon-only controls have no name on touch (tooltips are hover and focus only).
- The 88 keys have names but no role; no skip link past the picker.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
