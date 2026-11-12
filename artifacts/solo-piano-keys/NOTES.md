# The solo piano keeps its keys with `ui=0`

Stephen: “when showing just the 2d piano i think it's good to have the keys too in there (may need to edit url param to support this)”.

## What it does now

`ui=0` still takes the bar, the band under it and the file player off the page. On a solo piano drawn flat (2D or vector lines, grand or upright), the keys now stay. The fallboard and the 88 keys sit under the stage, with the position strip on a phone, and the 2D strings stand over the keys on the screen, as they do on the full page. Anywhere else `ui=0` works as before: the 3D piano, the other instruments and the Orchestra show the stage alone. `keys=1` on one instrument's address keeps the keys there too, for example under the 3D piano or the violin. On the Orchestra's address, `keys=1` still means seat 1, so it is not read as a request for keys. `keys=0` still takes the keys off everywhere, and it wins over `keys=1`. The keys follow the stage, so if the look is switched from 3D to 2D on a `ui=0` page they come back, scrolled to the octave being played. Nothing new appears on the screen. The rule is `keysOnScreen` in `apps/web/src/look.ts`, and the address grammar is in `apps/web/src/address.ts`.

## URLs

Production base: `https://instruments-wustep.vercel.app`

| what | path + query |
|---|---|
| grand, 2D, stage + keys only | `/piano?view=2d&ui=0` |
| grand, vector lines, stage + keys only | `/piano?view=vector&ui=0` |
| upright, 2D, stage + keys only | `/piano/upright?view=2d&ui=0` |
| upright, vector lines, stage + keys only | `/piano/upright?view=vector&ui=0` |
| a 2D piano with no keys (as before) | `/piano?view=2d&ui=0&keys=0` |
| the 3D piano with its keys under it | `/piano?view=3d&ui=0&keys=1` |
| another instrument with the keys | `/violin?view=2d&ui=0&keys=1` |

Keep `view=2d` in a filming link. The page writes 2D as plain `/piano?ui=0`, and an address without `view=` opens in whatever look that device last chose, which may be 3D. `keys=1` also works with `/piano?view=2d&ui=0`, but it changes nothing there because the keys are already shown.

## Screenshots

These are in this folder, taken from the production build (`pnpm build && pnpm preview`) with `node scripts/shots-solo-piano-keys.mjs`. That script also prints each stage's box and how far the strings stand from their keys.

* `grand-2d-ui0-keys.png`: classic 2D grand, `/piano?view=2d&ui=0` (1440×900)
* `grand-vector-ui0-keys.png`: vector grand, `/piano?view=vector&ui=0`
* `upright-2d-ui0-keys.png`, `upright-vector-ui0-keys.png`: the upright, both styles
* `phone-grand-2d-ui0-keys.png`, `phone-grand-vector-ui0-keys.png`: 390×844
* `grand-2d-page.png`: the full page, for comparison (the strings are where they are here)
* `grand-2d-ui0-keys0.png`: `keys=0` with `ui=0`, the old stage-alone picture
* `grand-3d-ui0.png` (no keys, unchanged) and `grand-3d-ui0-keys1.png` (`keys=1`)

Measured at 1440×900 with `ui=0`, the stage runs from 0 to 679 px and the keys from 679 to 900, with no scroll. All 88 strings sit over their keys, and the treble lies exactly where it does on the full page. The worst gap is 34 px, at the grand's overstrung low bass, which fans out from its keys; the full page has 30 px there. On the phone, the 23 strings in view are within 10 px of their keys.
