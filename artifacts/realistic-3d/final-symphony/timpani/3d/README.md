# Timpani in 3D: review set

`before/` shows the flute that stood in for the timpani at 9c9256f: the hero, the phone and the Orchestra. `after/` shows the model in `apps/web/src/ui/gl/timpani3d.ts`, shot with `scripts/shots-timpani-3d.mjs` and shrunk with `scripts/shots-compress.py`. The after set covers:

* the hero three-quarter, from the audience's side and round towards the big drums, plus a 2× crop of it (`timpani-hero-2x`)
* front, side, above and the player's side
* close-ups of the 32″ drum's pedal and of its gauge, a counterhoop with its T-handles and rods (the 23″), and the mallets over the heads, at rest and mid-stroke
* actuated frames: a loud stroke on D2 (32″), a softer one on F3 (23″) and a roll on C3
* the phone held upright (hero, actuated, roll)
* the Orchestra on a laptop and on a phone: strings with two sets of timpani behind them

`sheet-references.jpg` (made by `scripts/sheet-timpani-3d.py`) puts renders beside reference photographs taken from about the same angle.

## References

Measures, sources and licences are listed in `docs/3d-reference.md` under "Timpani".

The photographs in `sheet-references.jpg` come from Wikimedia Commons. They are used under their licences and none of them is committed on its own:

* Moreau1, *Ludwig Professional timpani 01*: public domain
* Jorge Royan, *Munich – A standard set of timpani*: CC BY-SA 3.0
* Eric Pancer, *Lefima Timpani* (Utah Symphony): CC BY 2.0
* ZooFari, *Timpani Mallets*: public domain

## Critique cycles

Each cycle lists the ten things that most made the render look fake, worst first.

1. **Against the first renders.**
   1. The copper read as matte terracotta.
   2. The heads looked like flat paper.
   3. The suspension ring looked like a black belt painted on the bowl.
   4. A mallet floated high above the gap between drums.
   5. There were too many vertices (979k).
   6. The gauge read as a black fan.
   7. The review close-ups missed their targets.

   Fixed:
   * The copper is now metallic and lacquered: roughness 0.15, clearcoat 0.85, 0.5 mm planishing facets.
   * The suspension ring is a chrome flange (as on the Adams Gen II).
   * The mallets rest lower.
   * The vertex count is down to about 620k.
   * The review views now aim at the drum's own points.
2. **Against the e2e and the actuated frames.**
   * The stroke was never seen. The frames arrive 30–60 ms after the engine strikes, so the mallet jumped from rest straight to mid-rebound.

   Fixed:
   * A stroke is drawn from the frame that brings it.
   * The felt is held on the head for one frame, then rebounds by velocity, and stays lower in a roll.
   * The head's dent starts at the strike point.
3. **Side by side with the photographs.**
   1. The copper was too uniform and orange; the Ludwig and Munich kettles are mirror-bright and pinkish.
   2. The heads were too beige; real ones are white or hazy white.
   3. The counterhoops are slimmer than the Ludwig's.
   4. The struts are plain black rods where the Dresden frame has its castings.

   Fixed:
   * The copper is lighter and pinker: roughness 0.11, environment light 2.1.
   * The heads are whiter.

   Still open:
   * The studio has too little in it for the copper to reflect, so the photographs' contrast is not reached.
   * The heads are uniform. There is no bearing-edge line and no darker haze over the kettle.
   * The struts are plain tubes rather than castings.
