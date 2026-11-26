# Four themes, and “player” on Measurements and Notes

The brief is `BRIEF.md` beside this file. Stephen picked all four looks: the one on `main` and the three
alternates built on 2026-11-23 (draft PRs #103, #104, #105). This is those four as themes of one app, and a
small change to the bar of the two reading pages.

| Theme | From | In a line |
|---|---|---|
| **Night Bench** | `main` (the default) | warm near-black, ivory linework, vermilion where something vibrates; Newsreader and IBM Plex; a product studio in 3D |
| **Evening Hall** | `ui-alt-a` (#103) | a concert hall at night: a velvet bar, gold for what is chosen or sounds, ivory paper for what opens; Libre Caslon and Cabin; boards, one spot and a curtain in 3D |
| **Day Studio** | `ui-alt-b` (#105) | a north-lit white room: plaster, paper and soft shadows, ink for what is chosen, one blue for what sounds; Ysabeau Office and Sometype Mono; its 2D instruments re-drawn for daylight; a daylight studio in 3D |
| **Night Gallery** | `ui-alt-c` (#104) | a museum room after closing: cool charcoal, light as the only signal (silver, tungsten, steel); Libre Franklin; a silver light from behind in 3D |

## How it is built

`apps/web/src/themes/` is the one place a theme lives:

```
themes/
  index.ts        the registry and the runtime: THEMES, theme(), setTheme(), onTheme(), themeEpoch()
  types.ts        what a theme is (Theme, Ink, VectorLook, Glyphs, DrawLook, Chrome, Words)
  sheets.ts       the page's one stylesheet: base.css and every theme's three sheets
  base.css        what is every theme's (the theme's sign, data-themes)
  worlds.ts       theme → its 3D world (loaded with the 3D stage)
  drawers.ts      a theme's own 2D drawers, where it has them (loaded with that theme)
  words.ts        theme → what the Notes say of it (loaded with that page)
  <id>/theme.ts   data only: 2D inks by role, vector palette, the chrome's signs, what else a look sets
  <id>/styles.css, panel.css, vector.css      its chrome, written as if it were the only look
  <id>/world.ts   its 3D room: the scene photographed for the image-based light, the lights, the floor,
                  what stands behind the instrument, exposure, bloom, material adjustments, risers
  <id>/words.ts   the parts of the Notes' sentences the look changes
  day-studio/draw/   Day Studio's own 2D drawers
```

* **Sheets.** Each alternate rewrote the whole chrome with its own vocabulary of variables and rules, so a
  theme keeps its three sheets whole (the alternates' are their branches' files; Night Bench's are main's,
  moved). The build scopes every rule of a file under `themes/<id>/` to `<html data-theme="<id>">`
  (`apps/web/theme-plugins.ts` `themeScope`, a PostCSS plugin): the scope is a `:where(...)`, which weighs
  nothing, so a sheet brought in whole behaves as it did alone; `@keyframes` are named for their theme. All
  four are in the page's one stylesheet: a change of theme asks for nothing and waits for nothing.
* **No flash.** The build writes a boot script from the registry into the head of both pages (the app and
  the 404), before the stylesheet: it puts the device's choice (`localStorage['piano-model.theme']`) on
  `<html data-theme>`, so the first paint is already that theme's. A first visit, or a value it does not
  know, is Night Bench.
* **2D.** The inks were hues in main (`INK.vermilion`, `V.blue`); they are roles now (`INK.line / sound /
  warm / cool`, `V.line / sound / slot1…4`), live objects refreshed from the theme, so the three themes of
  the night are one set of drawings in their own inks. What a branch changed beyond a palette value became
  typed theme data (`DrawLook`, `VectorLook`: the spectrum's scale, an orchestra piano's own keys, how lines
  blend, the glow pass, …). Day Studio did not recolour the instruments, it re-drew them for daylight: those
  are drawers of its own (`themes/day-studio/draw/`, 136 kB, 42 kB gzip, fetched only with that theme); the
  drawers in `ui/` stay the one entry and hand over at their top (`ownDrawer`). Pictures kept from frame to
  frame are keyed on `themeEpoch()`.
* **3D.** `ui/gl/three3d.ts` no longer has a look of its own: it asks a `World` (`ui/gl/world.ts`) for the
  room, the lights, the floor and final-pass shader parts, and the numbers. `setTheme` in 3D swaps the
  world in place (the environment, the floor and final materials are rebuilt, the instruments' materials
  only have their uniforms changed: no instrument program is compiled again).
* **The page's code.** The few places a look needs the DOM to differ are theme data too (`Chrome`: a
  knob's pointer, the signs on the stage's knobs, Day Studio's skip link), or an element marked
  `data-themes` that the shared sheet hides elsewhere. The chrome's signs (‹ › × ↺ ◐) are a character under
  Night Bench and a drawn path under the others (`ui/dom.ts` `sign`).
* **The theme's sign** (`ui/theme-pick.ts`): four dots, the four looks' colours, no word; it opens a pick
  of the four, laid out as the sheet music's list of parts is, so each theme's own sheet already draws it.
  Every theme's bar is full to the pixel at 1366 px (an upright in 3D) and at a phone's width (the lamp's
  “tap a key” beside an orchestra's count), and tests pin both: a button in the row pushed the hint out at
  412 px and the page 9 px wide at 1366. So the sign stands in the bar's own right margin, past the pages'
  links, and takes none of the row; on a phone the links give it 10 px from their own spacing.

## Measurements and Notes

The lamp, its “tap a key” and the MIDI indicator are hidden on those two pages (the status element is
`hidden`; sound and MIDI themselves are untouched). The pages' links begin there with **player**, which
goes to the stage as it was (the instrument or the orchestra's address); it is set as its neighbours are
in every theme, and its target for a finger is 48 px tall. It takes the place of the bare ← that stood at
the bar's left. On the stage it is not shown.

## What was measured

* Unit: `pnpm test`; the theme tests are `themes.test.ts` (registry, a change reaching inks and palette,
  scoping, the boot script), `themes-draw.test.ts` (each branch's pinned facts per theme), `themes-chrome
  .test.ts`, `worlds3d.test.ts` (Night Bench's shader text and numbers pinned to main's), `day-drawers
  .test.ts`.
* Night Bench against production: the 3D canvas 0 differing pixels over thirteen scenes on a computer and a
  phone; the chrome's computed styles equal outside the bar's two changes; the 2D canvases bit-identical at
  rest except where the idle animation differs from itself.
* Each alternate against its own branch's dev server: 3D 0 differing pixels over the same scenes; the 2D
  canvases identical at rest (212/240 Evening Hall, 210/240 Night Gallery, the rest idle animation); Day
  Studio's drawers call for call against the branch's code, 111 of 111 drawings; chrome computed styles
  equal over about 145 states a theme.
* Changing theme while the page runs: the picture after a change equals a fresh load in that theme (2D,
  lines, 3D); four worlds twice round leave the same count of programs, textures and geometries; no WebGL
  error or warning.
* e2e: `e2e/themes.spec.ts` (first visit, the pick, kept across a reload with the attribute on `<html>`
  before the first paint and never another theme's, every theme in 2D, lines and 3D, a phone, the 404,
  what a look has of its own in the page).

## Left as it is, and said

* **The sheets are four whole copies of the chrome** (427 kB, 61 kB gzip, where one was 87 kB): a new
  control needs its rule in each theme's own words, or a place in `base.css`. Folding their common
  structure into one sheet with tokens would be a rewrite of three designs; it was not done here.
* **Day Studio's first frames.** Its drawers are a chunk of their own: on a cold load the 2D stage is the
  plain ground for three to five frames (about 50 ms on localhost) before the instrument is drawn.
* **Icons and the link preview** are Night Bench's whatever the theme (the favicon, the home-screen icon,
  `og/instruments-grand.jpg`): alt-b and alt-c had redrawn them; a link preview cannot follow a device.
* **The skip link and the hidden page heading** are Day Studio's only, as in its branch.
* The e2e suite runs under Night Bench; the alternates' own re-pinned e2e facts (ink by alpha on a light
  ground, a board paler than its block, …) are in the unit tests where they could be, not in Playwright.
* The theme's sign is small (14 px, 12 on a phone) because the bar has no room for more; its box for a
  finger is the margin's width and the bar's height.
