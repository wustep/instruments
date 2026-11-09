# Realistic 3D + cello: final deliverables

| file | what |
|---|---|
| `before-after.jpg` | Each instrument's default 3D view: before this polish pass (`624c0bf`, judged "programmer art") on the left, after on the right. |
| `contact-bowed.jpg`, `contact-pianos.jpg`, `contact-winds.jpg` | Reference photographs next to the hero, close-up and actuated renders. |
| `shots/` | Desktop 1440×900, JPEG at half the device pixels:<br>• `<instrument>-hero`, `-close` and `-act` for all seven<br>• `cello-detail` and `cello-scroll`<br>• `phone-*-hero`, Pixel 7 sized |
| `cello-audio/` | Cello phrase, Bach prelude, sustained (with and without vibrato) and transitions. Before = `af4f97e` (production), after = this branch. Includes spectrograms and `metrics.json`. See `../cello-audio/README.md`. |

**How these were made:** `scripts/final-3d.sh` (renders with `scripts/review-3d.mjs`, sheets with
`scripts/contact-sheet.py`). The 3D is procedural throughout: no model or texture files. Measured dimensions
are in `docs/3d-reference.md`.

## Photographs in the contact sheets

The reference photographs are used for comparison only. The bowed and piano sheets use only CC0 or
public-domain photographs. The winds sheet contains two CC BY-SA photographs, so `contact-winds.jpg` is
licensed CC BY-SA 4.0.

| sheet | photograph | author | licence |
|---|---|---|---|
| bowed | [Violoncello, MET DT7555](https://commons.wikimedia.org/wiki/File:Violoncello_MET_DT7555.jpg) (F.-L. Pique) | The Metropolitan Museum of Art | CC0 |
| bowed | [Violoncello, MET DT7705](https://commons.wikimedia.org/wiki/File:Violoncello_MET_DT7705.jpg) (J.-B. Vuillaume) | The Metropolitan Museum of Art | CC0 |
| bowed | ["The Francesca" violin, MET DP167848](https://commons.wikimedia.org/wiki/File:%22The_Francesca%22_Violin_MET_DP167848.jpg) (A. Stradivari) | The Metropolitan Museum of Art | CC0 |
| bowed | [Viola, MET DP318305](https://commons.wikimedia.org/wiki/File:Viola_MET_DP318305.jpg) (J. Stainer) | The Metropolitan Museum of Art | CC0 |
| pianos | [Steinway grand piano interior](https://commons.wikimedia.org/wiki/File:Steinway_grand_piano_interior.JPG) | Kjethdubns | CC0 |
| pianos | [Piano action model, Kraków](https://commons.wikimedia.org/wiki/File:Piano_action_model_Krak%C3%B3w.jpg) | Юрій Булка | CC0 |
| pianos | [Kawai UST-8 action](https://commons.wikimedia.org/wiki/File:Kawai_UST8_Action_Wide_Photo.JPG) | Drondent | Public domain |
| winds | [Yamaha Flute YFL-482H](https://commons.wikimedia.org/wiki/File:Yamaha_Flute_YFL-482H.tif) (rotated) | Yamaha Corporation | CC BY-SA 4.0 |
| winds | [Trumpet, B flat](https://commons.wikimedia.org/wiki/File:Trumpet,_B_flat_-1623.jpg) | Amada44 | CC BY-SA 3.0 |

The outlines and f-holes of the violin family were traced from the Vuillaume cello and the "Francesca"
violin photographs above (`scripts/trace-outline.py`, `apps/web/src/ui/gl/outlines.ts`).
