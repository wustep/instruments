# The stage in 3D (round 3b)

A `3d` button beside the piano presets turns the instrument area into a WebGL2 scene. You can drag to turn it,
pinch or scroll to zoom, and double-click to reset the view. Everything moves from the engine's live frames,
the same ones the 2D stage draws:

* **Grand:**
  * the case and its rim;
  * the soundboard, shaded by its live mode amplitudes;
  * the iron frame struts and the bridges;
  * every sounding string's displacement, vertical because the hammer strikes up. Sympathetic strings are
    amber and only as bright as their real motion;
  * hammers rising and rebounding, and dampers lifting with the key or pedal;
  * the lid on its bass-side hinge at its real opening (`lid`);
  * the keys, with pressed and actually-sounding keys lit.
* **Upright:** a tall case, strings vertical with the bass cross-strung over the tenor, the soundboard behind,
  hammers in front striking back, dampers above them, and the keys at 0.72 m.
* **Violin, viola, cello:**
  * the body (outline, ribs and a top shaded by the body modes), f-holes, neck, scroll, bridge and tailpiece;
  * the four strings, glowing with their level;
  * the bowed string's live shape;
  * the stopping point as a glowing bar that rocks with the live vibrato;
  * the bow at its contact point along the hair, amber during a bow change.
* **Flute:**
  * the tube and the embouchure hole;
  * the breath stream, as strong as the engine's breath pressure and wavering with the vibrato;
  * the tone holes for the fingering, covered ones pulsing with the breath vibrato;
  * the bore's standing pressure wave.
* **Trumpet:**
  * the wrapped tubing, flare and bell rim;
  * the three pistons pressed for the engine's fingering (`valves 1+3 · partial 4`);
  * the lips buzzing at the mouthpiece, with their opening following the level;
  * the standing wave along the tubing.
* **Room:**
  * the walls, sized by `room`;
  * wavefronts on the floor, spawned on onsets and while sound continues, fading with the engine's
    T60 (0.7 + 1.7·room s);
  * first reflections from the four walls' mirror sources;
  * for the grand, brighter and longer fronts with the lid open.

## How

Raw WebGL2 with three small shader programs:

* screen-space ribbons for glowing lines of any pixel width;
* flat translucent fills;
* plates whose colour is Σ aₖ·sin(mₖπu)·sin(nₖπv) from the engine's mode amplitudes.

Each frame rebuilds the scene into a growable batch, uploads it and draws it. There are no libraries.
The projection is mirrored in x so that, facing the strings from the keyboard, the bass is on the left.

## Performance

Scene build plus draw submission, CPU, per frame:

| | desktop (1440×900 @2×) | phone (Pixel 7 emulation) |
|---|---|---|
| piano, a pedalled chord | 0.5 ms, 3057 vertices, 61 fps | 0.4 ms, 2469 vertices, 60 fps |
| violin | 0.4 ms | 0.3 ms |
| cello | 0.3 ms | 0.3 ms |
| flute | 0.2 ms | 0.4 ms |
| trumpet | 0.2 ms | 0.4 ms |

* **Phone budget:**
  * phones draw at most 1.5× device pixels;
  * they start in the light scene (every other string, every third hammer and damper);
  * any device switches to the light scene if a frame costs more than 9 ms.
* **Fallback:** with no WebGL2 the button never appears and the 2D stage carries on. The context is lost
  when you leave the stage.

## Limitations

* The geometry is schematic, in real proportions where the engine has them:
  * the strings' speaking lengths and strike points;
  * the violin family's string lengths;
  * the flute's tone-hole positions from its tube lengths.

  Cases, the trumpet's wrap and the bell are drawn from typical dimensions, not measured.
* There is no lighting or depth sorting. It is line art with translucency, in the 2D stage's language.
* Two controls stay in 2D:
  * the lid and room handles (in 3D they follow the knobs and the 2D drags);
  * the single-key action view.
* String motion is exaggerated to be visible: millimetres of displacement drawn as centimetres, on one
  shared scale, so relative sizes are true.

Shots: `3d-{desktop,phone}-*.png` (each instrument playing; the grand with its lid open and closed).
