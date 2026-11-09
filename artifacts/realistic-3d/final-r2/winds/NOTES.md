# Winds, round 2: flute keywork and trumpet polish

All changes are in `apps/web/src/ui/gl/winds3d.ts`, plus new entries appended to the shared tables
(`mesh.ts` `M`, `mats3.ts` `P`): `padSkin`, `nickelKnurl`, `pearlButton`, `brassBell`, `brassHandled`,
`nickelDrawn`. No existing entry was changed, and there are no audio changes.

## Shots

| file | what |
|---|---|
| `before-after.jpg` | 63c5266 against this round: flute hero, the left-hand and right-hand keywork at `flute-side.jpg`'s near top-down angle (D5: the C♯ key and L1's cup now lift to vent, as on a real flute), trumpet hero, trumpet valves |
| `flute-hero.jpg`, `flute-close.jpg`, `flute-act.jpg` (G4), `flute-keywork.jpg` | the final flute |
| `trumpet-hero.jpg`, `trumpet-close.jpg`, `trumpet-valves.jpg`, `trumpet-act.jpg` (C4: valves 1 and 3 pressed, the 3rd slide kicked) | the final trumpet |

Reference photographs were compared in scratch sheets only. `flute-side.jpg` and `trumpet-side.jpg`
are CC BY-SA, so they are not committed here.

## Frame cost

This is CPU per frame (`stats.ms`), from the review script at 1440×900.

| | before (63c5266) | after |
|---|---|---|
| flute | 0.43–0.69 ms | 0.48–0.78 ms |
| trumpet | 0.43–0.70 ms | 0.40–0.84 ms |

The ranges cover every review run. The same view varies by about ±0.15 ms from run to run.

The flute's keywork is still built once: 14 keys and the Briccialdi lever are posed (15 of the pose's
16 springs). Everything else is one static mesh.

## Flute

### The mechanism, as built

The layout follows the main-body nomenclature of the OSU flute repair manual (fig. 2.2). The tone holes
and trill positions come from McGee's Boehm schema. The fingerings are the standard first choices
(The Woodwind Fingering Guide, fluteinfo.com). The sources are listed in `docs/3d-reference.md`.

* **The C♯ key and its lever are one piece.** The lever is the first finger's cup. L1 closes the small
  C♯ hole, so C5 is L1 alone, with the thumb's C hole open. D5 and D♯5 lift L1 to vent through the C♯
  key.
* **The B♭ key** stays open. It closes for the Briccialdi thumb lever, for L2 (the A key's front
  connector) and for R1 (the F/B♭ back connector). Its long inner tube comes out past the G keys, where
  it carries the kicker and the B♭ shake lever.
* **G1 (L3) closes the duplicate G♯ key (G2)** through a clutch over the post.
* **R1, R2 or R3 close the F♯ key.** R1 does it through a back connector over the post. R2 and R3 do it
  through feet that rest on the F♯ bridge, which hangs below the rod.
* **Closed-standing keys:** the G♯ key (on the back, a lever with its spatula) and the D♯ key. The C
  roller closes the C♯ key too, through a clutch over the foot's post.
* **Static keys:** the D and D♯ trill keys and the C♯ trill key, which is new (closed-standing, its cup
  on the back by the C hole). Their teardrop touches lie in the gaps between the right-hand cups.
* **Keywork parts:** hinge tubes on brushed steel rods, slotted screw heads, needle springs from the
  posts into a catch on each key, tongues with adjusting screws and corks, and white pad skins.
* **Driven by the engine:** the note is the engine's own `focus.midi` (the bore's note when a frame has
  none). The keys hold while the flute sounds and go back to rest 0.8 s after it stops.

### Cycle 1 (render against `flute-side.jpg`)

The top things that looked fake, ranked:

1. The fingering was a bore length, not Boehm. There was no C♯ lever, no B♭ logic and no F♯ bridge, and
   the G♯ key sat where G2 belongs.
2. There were no clutches or connectors, so the rod line read as a railing.
3. The needle springs were invisible, and there were no spring catches.
4. The pads were invisible: only a cream line.
5. The posts were all identical.
6. The hinge tubes were uniform.
7. The thumb mechanism was static and the thumb key's cup was missing.
8. The trill keys looked like saucers.
9. Rods and keys had the same finish.
10. The foot touches were static.

**Fixed:** items 1–4, 6 and 7, and the levers in item 10. The keys were rebuilt as pieces with their
own tubes, catches and connectors.

### Cycle 2 (at the reference's own near top-down angle: pitch ≈ 0.95)

1. The cups were shallow discs where the photo shows deep cans with a rounded shoulder.
2. The arms were thin stalks.
3. The hinge tubes and posts were spindly.
4. The G♯ spatula was one cup too far towards the head.
5. The needle springs aliased into dashes.

**Fixed:** the cups are 4.1 mm deep with a 1.2 mm shoulder. Arms are 4.6–4.8 mm wide and 1.2 mm thick.
Hinge tubes are Ø4.0 and post balls Ø4.8. The spatula now rises between G1 and G2. The needles are
Ø0.6 and clear the tubes.

### Cycle 3

1. The trill, shake and C♯ trill touches were small balls on stalks out in space. In the photo, they
   are teardrops lying on the tube between the cups.
2. The French arms were narrower than a quarter of the cup where they cross its edge.
3. The trill arms looped below the rods.

**Fixed:** the touches are 5–7 mm teardrops lying in the cup gaps, the arms are wider, and the trill arms
take a tighter path.

### Still fake (flute), honestly

1. **The silver is dark chrome.** On this dark stage the cup tops reflect black, while the reference is
   white-on-white. The look depends on the shared studio environment, which was left alone.
2. **The keywork is approximate in places.** The thumb levers pivot along the tube rather than on
   Briccialdi's cross axle. The G♯ cup and the C♯ trill's arm placement on the back are plausible, not
   measured. The trill keys never open.
3. **There is no wear.** There are no solder fillets at the posts and ribs, no tarnish at contact points,
   and no engraving.
4. **The open-hole grommets are simpler** than the photo's raised, conical rings.
5. **The pads show only when a key lifts,** and they read brown in the tube's shadow.

## Trumpet

### Cycle 1 (render against `trumpet-side.jpg`, `trumpet-valves.jpg`, `trumpet-34-modern.jpg`)

1. The buttons were big flat white discs.
2. The caps were wide white drums with a coarse, moiré knurl.
3. The finger hook read as a ring round valve 3's cap.
4. There were no ferrules at the joints.
5. The casings lacked port and band detail.
6. The bell bead was thin.
7. The lacquer was perfectly uniform.
8. The water key was almost invisible.
9. The main slide's nickel read as a black band.
10. The mouthpiece shank was dark.

**Fixed:** items 1–4 and 6–9.

* **Buttons:** a Ø10.6 pearl, slightly domed and greyer, under a polished bezel.
* **Knurls:** 96–132 ridges, 0.15 mm deep, in a satin nickel that reads as a grey band.
* **Finger hook:** an open hook, past valve 3, leaning back towards it.
* **Ferrules and bell:** ferrules at the bow, and a 2.1 mm bead.
* **Lacquer:** the bell is burnished and the casings have a faint handled mottle.
* **Water key:** a real one, with its nipple, the lever's cork cup, a saddle, a coil spring and a paddle.
* **Main slide:** the nickel showing is 5 mm and satin.

### Cycle 2

1. The caps were still too wide.
2. The cap face, a satin dome, read as a white drum at hero distance.
3. The exposed nickel still read black.

**Fixed:** the caps are Ø23.4. The cap face is polished, and the inner slide tubes are a drawn satin
(`nickelDrawn`).

### Cycle 3

1. The pearl inlays still read as flat cream discs.
2. The valve felt reads as a vivid red ring.
3. There are no engraved valve numbers.

**Fixed:** item 1: the pearl is greyer and domed.

### Still fake (trumpet), honestly

1. **The lacquer is still too even.** At hero distance the brass reads mid-gold, with soft highlights,
   where the photo has hard white highlight lines. That comes from the shared studio environment.
2. **There are no solder fillets** at the brace feet, knuckles and ports, and no engraving (valve
   numbers, bell).
3. **The valve felts** read too red and too visible.
4. **The 2nd slide and the bell's** interior throat are plain.
5. **The wrap still follows one photograph,** not a drawing.
