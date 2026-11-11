# Brass visual: the horn's hand, and one breath for every wind

Branch `improve/brass-visual`, on `main` at `3787306` (#42). Two visual items in one PR; no audio change
(no engine file is touched, so the golden and block-size tests are unaffected).

## (1) The hand in the horn's bell: it did nothing, so it is gone

What it was:

| Where | What was drawn | Tied to playing? |
|---|---|---|
| 2D, drawn style (`horn-draw.ts`) | a cupped right hand, a fixed silhouette with a fixed gradient, clipped inside the bell's mouth | no: the same at rest and on every note |
| 2D, vector style (`vector/horn.ts`) | the same outline as two blue beams | no |
| 3D (`gl/horn3d.ts`) | nothing: the model left the hand out | — |

The engine (`packages/engine/src/core/horn.ts`) has no hand. Nothing in it stops the bell (no hand-stopped
notes, no hand position, no MIDI control for either). Its visual frame carries the lips' opening and the
blowing pressure only (`lips: { open, blow }`), and nothing about a hand. The real hand's darkening is
already in the horn's colour, fitted to the Iowa recordings and fixed whatever is played.

So it did nothing: no sound, no stopping, and no animation that followed the notes. As the brief asks, it is
removed from both 2D styles (`HnLayout.hand`, `handNails`, `drawHand`, the vector beams; −50 lines). 3D is
unchanged (it never had one). The Notes page's acoustics paragraph keeps the real horn's hand, and now adds:
"The model has no hand of its own (no stopping, no hand position): the hand's darkening is in the colour
fitted to the recordings, so none is drawn in the bell."

Pictures: `before-after-close-classic-horn-bell.jpg`, `before-after-close-vector-horn-bell.jpg`, and the
whole horn in `before-after-{laptop,phone}-{classic,vector}-horn.jpg`.

## (2) The brass embouchure: the reeds' breath, in every style

Before, the brass each drew the player's lips at the mouthpiece:
- drawn style: two felt-and-vermilion lip cushions with a steel puff;
- vector style: two red lip cushions;
- 3D: two vermilion arcs, which read as a red smear on the rim (and on the trumpet, an amber pair even at rest).

The woodwinds drew no lips: only the breath going in, as faint dashed streams.

Now the horn, the trumpet and the trombone take the breath into the mouthpiece as the reeds do. It shows
while the note is blown and is gone at rest:

| Style | The unified treatment | Shared code |
|---|---|---|
| Drawn 2D | three faint dashed steel streams converging from the lips to the aperture at the rim's middle, flowing in; the brass streams pulse gently with the engine's lip opening (drawn slowed), since the flow through the lips is the slit's width × √Δp | `stage-draw.ts` `breathStream` (the oboe, clarinet and bassoon now draw through it too, with their own numbers: the same pixels as before), `BRASS_BREATH`, `brassBreath` |
| Vector 2D | the green slot, the reeds' converging dashed flow (now moving in on all six, as the drawn style's always did); the red slot, the lips as a line across the rim parted by their opening, drawn as the reeds' "pinch". The handles (green breath, red lips, pink noise, white vibrato) stay where they were | `vector/kit.ts` `breathFlow`, `lipLine` |
| 3D | faint steel dashes from the lips into the cup, flowing in, as the flute's jet is drawn; the vermilion lip arcs are gone | `gl/winds3d.ts` `breathIn` (the trumpet, horn and trombone) |

The streams are in metres: 17 mm out from the rim to the aperture, which is the reeds' size. The vector flows
also have a pixel floor, so they stay visible on a small stage. On the trombone in 3D, the streams sit
behind the slide's brace from the stage's own hero view, as the old lips did. They show from the
mouthpiece's side (`after-3d-trombone-mpview.jpg`).

Unchanged: playing, the engines, routing, Orchestra seating, the top panel from #42 (its scope still shows
the lips' own trace and "lips · valves …"), and the woodwinds' drawn breath.

## Pictures (all here, before | after)

- `before-after-laptop-{classic,vector,3d}-{horn,trumpet,trombone,oboe}.jpg`: alone on a laptop's stage
  (1440×900), a note held; the oboe is the reference, unchanged.
- `before-after-phone-{classic,vector,3d}-{horn,trumpet,trombone,oboe}.jpg`: the same on a phone (390×844).
- `before-after-close-{classic,vector}-{horn,trombone,oboe}-mouth.jpg`, `…-trumpet-stage.jpg`,
  `…-horn-bell.jpg`: the mouthpieces and the horn's bell at 3×.
- `before-after-close-3d-{horn,trumpet,trombone}-mouth.jpg`: the 3D mouthpieces at 3×.
- `before-after-orchestra-{laptop,phone}-{classic,vector,3d}.jpg`: an Orchestra of flute, oboe, horn,
  trumpet and trombone, a chord sounding.

Made with `scripts/shots-brass-visual.mjs`, run against a build of `3787306` (before) and of this branch
(after).

## Tests

- `apps/web/test/brass-breath.test.ts` (14): the helpers' geometry. Each brass instrument in each 2D style,
  silent (nothing at the mouthpiece) and sounding (three streams ending within 1.6 mm of the rim, no cushion
  fills, the red lips a 4-point line). The horn's bell empty once its mouth is drawn, at rest and sounding,
  in both styles. In 3D, `breathIn`'s dashes flowing in; each brass model poses no line at rest, and while
  sounding only steel streams within 18 mm of its lips.
- `e2e/brass-breath.spec.ts` (2 tests × desktop and Pixel 7): the real engine's frames turn the streams on at
  the horn's and the trombone's rims in both styles, and off after the note. On this build 4/4 pass; on a
  build of `3787306` 0/2 (desktop). The vector trombone on a phone (≈210 px/m) is not measured, because its
  slot handles sit over the breath there, as they did before this change.

## Known

- On a phone the vector trombone is drawn small (≈210 px/m), and its slot handles crowd its mouthpiece. This
  was already so; the handles are placed in metres.
