# Repainting a 2D drawer for daylight

The app is being redesigned as **Day Studio**: an instrument in a north-lit white studio at midday. The 2D
stage used to be near-black (`#0e0d0b`), and every drawer was painted for it: pale hairlines, glows, dark
brass. The ground is now pale plaster, `#eceff1`, a breath brighter behind the instrument. The drawers'
geometry is right and stays exactly as it is; their paint is what changes.

## The rules

1. **An instrument is an object on a bright field.** It is opaque, in its own materials as they look in
   daylight, and it casts one soft shadow on the floor, down and a little to the right (the window is up
   and to the left): `rgba(28,34,42,0.30–0.34)`, blur about 20–26 px, offset about (7, 12) px for a body the
   size of a cello on a desktop stage; smaller parts and smaller instruments in proportion (a flute: blur
   10, offset (3, 6)). Paint it where the still picture is cached (a `Layer`, an offscreen canvas, a
   `paint…Layers` function), never as a per-frame blur. Shadows of one part on another stay, softer
   (`rgba(24,28,34,0.40)`), and fall the same way.
2. **Nothing glows.** No `globalCompositeOperation = 'lighter'` or `'screen'`, no coloured `shadowBlur`
   halo, no light-on-dark bloom. Where a glow said "this is active", say it with the rules below. Where an
   additive pass built up a picture (a pressure envelope, a wave), lay it over with `source-over` at a
   modest alpha, or `'multiply'` where it should darken what is under it.
3. **Blue is what sounds, and only that.** `INK.sound` (`29,72,209`): a vibrating string's shape, the air
   column's pressure, the wave in a tube, a reed's or the lips' motion, a struck head's or bar's motion, a
   wavefront, the bow's pull on the string. Use it firmly (a 1.5 px line at 0.9, a wash at 0.10–0.18).
   Never for decoration, never for a mechanical state.
4. **Ink is what is held or chosen.** A key pressed down, a pad shut, a valve or lever held, a pedal's notch,
   a slide's position mark: `INK.line` (graphite, `28,34,42`), as a firm outline or a solid fill. These were
   amber lights on the night bench. They are mechanical facts, not sound.
5. **Lines on the ground are graphite.** A hint, a leader, a dashed guide, a label drawn on the plaster:
   `INK.line` at 0.2–0.6 alpha. (`INK.line` used to be `INK.ivory`, a pale line; every former use was
   renamed mechanically, so **check each one**: where it is a highlight laid on a *dark part of the object*
   (a sheen on ebony, grenadilla, a black key, dark varnish) it must now be `INK.light` (`249,250,251`), or
   it has vanished into the dark.)
6. **Pale things need an edge.** Silver, nickel, ivory, a drum's head, bow hair, steel bars: on the pale
   ground they must stand off it by a graphite hairline (0.3–0.5 alpha) or their own shade side, and by
   their shadow. Check that no part of the instrument disappears into the ground.
7. **Materials in daylight** (targets, adjust by eye to the drawing's own shading):
   - brass, lacquered: lit `#f3dc9a`, body `#dcb65c`, shade `#b0863a`, deep shade and the bore `#7d5c22`,
     an edge line that reads on the plaster `#8a651f`. The night-bench brass (olive-brown bodies with amber
     edge lines) reads as mud in daylight: make it gold.
   - silver / nickel: lit `#f6f7f8`, body `#d3d8dd`, shade `#98a1aa`, edge `#5f6872`.
   - copper: lit `#e8a57a`, body `#c57a4c`, shade `#8a4a26`.
   - woods keep their colour; a very dark wood (grenadilla, ebony) keeps a readable sheen (`INK.light` at
     low alpha) so its form shows; a varnish painted very dark for the night may come up a little.
   - `INK.amber` is now a bronze (`158,110,36`) for brass linework and warm secondary marks, `INK.steel` a
     slate (`92,112,138`) for the breath and for "the ideal / reference", `INK.copper` `176,108,62`.
8. **Text drawn on the canvas** uses `CANVAS_FONT` (exported from `ui/stage-draw.ts`), never a font named
   in a string. Size 11 px or more, graphite.

## What must not change

- Geometry, layout, sizes, hit boxes, what a drawer returns or stores in its state (`drawn`, boxes, lines),
  exported names and signatures. Tests measure these.
- Anything outside your files. No git commits, no branches, no other checkouts.
- Per-frame cost: do not add blurs, big gradients or offscreen canvases to the live path.

## How to look and how to check

- A dev server is already running at `http://localhost:4317` (do not start another, do not build).
- `node artifacts/ui-alt/tools/look.mjs <out dir> <name>=<dev>:<path>:<notes> …` photographs several pages in
  one browser, e.g.
  `node artifacts/ui-alt/tools/look.mjs "$OUT" oboe=desktop:/oboe?view=2d:67 oboePhone=phone:/oboe?view=2d:67 orch=desktop:/symphony?view=2d:play`
  (`desktop` 1440×900, `phone` 390×844 @2x, `tablet`; the notes are MIDI numbers held for the picture;
  `:play` plays a loaded piece; `:idle` leaves the sound off). Then open the PNGs with the Read tool. Put
  `$OUT` under the scratchpad directory you are given, not in the repo.
- The machine is under load from other headless browsers. **At most five `look.mjs` runs in total**, several
  stills in each: plan a look, make every fix it shows, look again.
- `npx tsc -p apps/web` from the repo root must pass.
- The unit tests that touch your drawers must pass: `npx vitest run apps/web/test/<name>.test.ts` (find them
  with `grep -l <your file's name> apps/web/test/*.ts`). A test that asserts a colour of the old look may be
  brought to the new colour if its intent is kept (say which, and why). A test that fails for another reason:
  fix the code, or stop and report it. Never loosen a test.
