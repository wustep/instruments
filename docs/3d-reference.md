# 3D reference: real-scale dimensions

Measured or published dimensions for modelling the instruments at real scale. Lengths are in mm unless a
row says otherwise. Every number links to its source. **typical, unsourced** marks a value I could not
find in a citable source. Treat it as a placeholder to check against the photos.

How to read the sources:

* **Johannsson tables.** Violin maker Hans Jóhannsson publishes working measurement tables for the cello,
  violin and viola. They are a maker's working numbers for a modern full-size instrument, not one measured
  antique. The pages say the tables are "being modified". For the violin, some rows have only four values
  in five size columns. I assumed the last value is the full-size one (marked ‡).
* **Tarisio Cozio.** These are the archive records for the named Stradivari instruments. tarisio.com blocks
  scripted fetches, so these numbers come from its search-indexed record text. Open the link to confirm them.

## Cello (4/4)

| part | value | source |
|---|---|---|
| Body (back) length | 750 typical; Davidoff Strad (1712): **758** | [HJ-vc]; [Cozio-Davidoff] |
| Upper / C / lower bout | 342 / 238 / 432 typical; Davidoff: **357 / 232 / 437** | [HJ-vc]; [Cozio-Davidoff] |
| Rib height (average) | 120 | [HJ-vc] |
| Arching height, top / back | 29 / 28 | [HJ-vc] |
| Plate overhang at the ribs | 3 | [HJ-vc] |
| Purfling inset from the edge | 5.5–6 | [HJ-vc] |
| Neck length (nut to body edge) | 280 | [HJ-vc] |
| Scroll length | 204 | [HJ-vc] |
| Pegbox length / width at nut | 135 / 45 | [HJ-vc] |
| Stop (body edge to bridge) | 405 | [HJ-vc] |
| String length (nut to bridge) | 695 (copies of the Davidoff are often 690) | [HJ-vc] |
| Bridge height / foot width / thickness | ≈92 / 90 / 11 | [HJ-vc] |
| f-hole length / gap between the upper eyes | 130 / 98 | [HJ-vc] |
| Fingerboard length / width at nut / width at the bridge end | 580 / 32 / 63 | [HJ-vc] |
| Fingerboard end to top plate | 65 | [HJ-vc] |
| Neck projection ("elevation") / neck-root height above the edge | 79.5 / 20 | [HJ-vc] |
| String break angle over the bridge | 153° | [HJ-vc] |
| String spacing at nut / at bridge | 23 / 47 | [HJ-vc] |
| Endpin rod | Ø 10 mm, 500–540 long (20″ is the standard 10 mm length) | [Gewa endpin], [R&J endpin], [SaddleRider] |

## Violin (4/4)

| part | value | source |
|---|---|---|
| Body (back) length | 356 typical; Messiah Strad (1716): **356** | [HJ-vn]; [Cozio-Messiah] |
| Upper / C / lower bout | 168 / 112 / 206 typical; Messiah: **167.5 / 108.3 / 208** | [HJ-vn]; [Cozio-Messiah] |
| Overall length | 593 (Messiah) | [Ashmolean-Messiah] |
| Rib height (average) | 30 | [HJ-vn] |
| Arching height, top / back | 15.5 / 15.0 ‡ | [HJ-vn] |
| Neck length | 130 | [HJ-vn] |
| Stop | 195 | [HJ-vn] |
| String length | 327 (≈328) | [HJ-vn] |
| Scroll length / pegbox length | 108 / 72 ‡ | [HJ-vn] |
| Fingerboard length / width at nut / width at the bridge end | 270 ‡ / 24.5 / 42.5 | [HJ-vn] |
| f-hole length / gap between the upper eyes | 73 ‡ / 42 | [HJ-vn] |
| Bridge height / foot width | ≈33 / 41 | [HJ-vn] |
| Neck projection ("elevation") / neck-root height | 27 / 6 | [HJ-vn] |

## Viola (16″ ≈ 406 mm body)

Jóhannsson's "medium" column (405–415 mm) is the 16″ size. His "large" column (420–430 mm) has 40 mm ribs.

| part | value | source |
|---|---|---|
| Body length | 405–415 | [HJ-va] |
| Upper / C / lower bout | 195–198 / 130–138 / 235–238 | [HJ-va] |
| Rib height (average) | 38 | [HJ-va] |
| Arching height, top / back | 17 / 16 | [HJ-va] |
| Neck length / stop | 150 / 225 | [HJ-va] |
| String length | ≈380 (the page writes "38", in cm) | [HJ-va] |
| Scroll length | ≈125 (the page writes "12,5", in cm) | [HJ-va] |
| Fingerboard length / bridge height | 305 / ≈39 | [HJ-va] |

## Double bass (3/4 orchestral)

No maker publishes a full table for the bass as Jóhannsson does for the cello. The body and its bouts
come from retail specification sheets for 3/4 basses and from two measured antiques at the Met. The
fittings come from blanks and parts sold for 3/4 basses. The model (`strings3d.ts` `SPEC.bass`,
`bass-outline.ts`, `bass3d.ts`) is built to the middle of these figures.

| part | value | model | source |
|---|---|---|---|
| Body length | 1090–1110 (modern 3/4); Plumerel: **1125 / 1120** (top / back); Eberle: **1162** | 1110 | [Gewa-Ideale], [Thomann-11], [Walther-Solo]; [Met-Plumerel]; [Met-Eberle] |
| Upper / C / lower bout | 487 / 370 / 645 (Gewa); 502 / – / 682 (Walther); Plumerel **530 / 357 / 658** | 520 / 375 / 665 | [Gewa-Ideale], [Walther-Solo], [Met-Plumerel] |
| Rib height | 200–203 (modern, one figure); Plumerel **156 / 200 / 197** (upper / centre / tail); Eberle 207 / 224 / 220 | 148 at the neck block, 194 at the break, 200 at the tail | [Thomann-11], [Gewa-Ideale]; [Met-Plumerel]; [Met-Eberle] |
| Back | flat, bent towards the top at the break (the upper bout tapers into the neck block) | flat, 3 mm crown; break at 24 % of the length, canted 10.5° | [TB-flatback], [Brown-2004] |
| Top arching | Plumerel **25.6** | 30 | [Met-Plumerel] |
| String length | 1042–1050 (modern); Plumerel 1070; Eberle 1115 | 1050 (the engine's) | [Walther-Solo], [Gewa-Premium]; [Met-Plumerel]; [Met-Eberle] |
| Overall length | 1830–1840 without the endpin; 1900 with it (Gewa Ideale); Eberle 1966 | 1870 scroll to tail | [Thomann-11], [Gewa-Premium], [Gewa-Ideale]; [Met-Eberle] |
| Height at the bridge (back to the bridge's top) | 440–460 (as sold, the bridge uncut or nearly) | 400 (a 160 mm bridge) | [Gewa-Ideale], [Gewa-Premium] |
| Bridge blank (3/4): height / feet outside / feet inside | 160–191 / 142–155 / 59–72; with height adjusters (wheels or screws) | 160 / 150 / 72, wheel adjusters | [Despiau-adj], [Teller-wheels], [Aubert-34], [Aubert-feet] |
| Machines | worm-and-cog sets, brass or steel plates (one per machine, ≈45 mm wide, or one per side), brass, ebony or bone keys; ratios 19–22 : 1 | full-cheek brass plates, 26-tooth cogs ⌀25, rollers ⌀10 at 40 mm, brass keys | [RJ-machines], [Rubner-machines], [Strad-mechanics]; the French set in `contrebasse-clefs.jpg` |
| Fingerboard, string action, bow | 880 long, ≈44 / 108 wide; 5–7 mm (G) and 7–10 mm (E) off the end; French bow 71–75 cm, hair ≈ 58 cm | 880; 6.5–7.4 mm; hair 0.58 m (the engine's) | **typical, unsourced** |
| Endpin | steel rod ⌀10–12, socket with a thumbscrew | ⌀12, 45 mm collar, thumbscrew | **typical, unsourced** |

The model stands on its endpin with the socket 0.22 m off the floor, leaning back 15.5°, so the
scroll's top is 1.97 m up.

## Steinway Model D (concert grand)

| part | value | source |
|---|---|---|
| Length | 2740 | [Steinway-D], [dims-D] |
| Width | 1560 (the Steinway UK page header also says 1570) | [Steinway-D], [dims-D] |
| Height of the keyboard (top of the keys above the floor) | 715 | [dims-D] |
| Height | 1960, as listed; the page does not say whether the lid is open (likely on full stick) | [dims-D] |
| Height, lid closed | **typical, unsourced** ≈1000. For comparison, the Yamaha CFX (2750 long) is 1030 high | [Yamaha-CFX] |
| Rim thickness | 3¼″ ≈ 83 | [Steinway-D] |
| Soundboard thickness | 9 at the centre, tapering to 6 at the rim | [Steinway-D] |
| Longest string (agraffe to bridge) | 2010 | [Steinway-D] |
| Longest key | 622 | [Steinway-D] |
| Keybed thickness | 44.5 | [Steinway-D] |
| Weight | 480 kg | [Steinway-D] |
| Case (rim) depth, lid outline, prop-stick length | **typical, unsourced**. Measure from `grand-34.jpg`, using the 2740 mm length as scale | — |

### Grand action (typical regulation)

| part | value | source |
|---|---|---|
| Key dip at the front of the key | 10 (Steinway's range is 0.390–0.420″ ≈ 9.9–10.7; Kawai GS-100: 10.1) | [Erwin AR], [Steinway manual]¹, [Kawai GS100]¹ |
| Hammer blow distance (hammer at rest to string) | 45–47 (Kawai GS-100: 46) | [Askenfelt-Jansson], [Erwin AR], [Kawai GS100]¹ |
| Let-off / drop | 1–3 let-off (an example regulation uses 1.5 let-off, 1 drop) | [Askenfelt-Jansson], [Erwin AR] |
| Action ratio (hammer travel ÷ key travel) | 5:1 to 6:1 (target ≈5.5; old Steinways often 6:1) | [Erwin AR] |
| Hammer flange centre to hammer centre (shank) | 130 on most Steinways | [Erwin AR] |
| Action spread (hammer centre to wippen centre) | 111.5–114 | [Erwin AR] |
| Wippen centre to jack centre / to the capstan contact | 99 / 66 | [Erwin AR] |
| Key length | Longest key on the D is 622 (see above) | [Steinway-D] |

¹ Quoted from the search-indexed text of the Steinway use-and-care manual and the Kawai GS-100 regulation manual. Both pages block scripted fetches.

### Action materials (a key's close-up)

Matched by eye to the two action photos; the species are the usual ones, **typical, unsourced** beyond the photos.

| part | material in the model (`mats3.ts`) | seen in |
|---|---|---|
| Wippens, jacks, repetition levers, shanks, flanges | hornbeam: pale cream, close and even, a low satin (`hornbeam`) | `upright-action-close.jpg`, `grand-action-side.jpg` |
| Key sticks; a white key's sides under its facing | bare spruce, straight latewood lines along the stick (`keyWood`, `keyIvory`) | `grand-action-side.jpg` (the key along the bottom) |
| Rails, backcheck heads, underlevers (grand) | hard maple under a thin finish, golden (`actionWood`) | `grand-action-side.jpg` |
| Rails (upright) | beech, its rays as short dark dashes (`railBeech`) | `upright-action-close.jpg` |
| Hammer felt, damper felt, cloths | pressed wool: matte, a fibre mottle and nap, warm off-white / white / dyed (`hammerFelt`, `damperFelt`, `redFelt`, `greenFelt`, `underfelt`) | both |
| Damper and backcheck wires | drawn steel, satin grey (`wire`) | `grand-action-side.jpg` |
| A part cut open by the section | its own stuff, as the cut blocks show in `grand-action-side.jpg`: end grain across a part's grain, long grain along it; the wood under a case's lacquer; grey iron for the plate | `grand-action-side.jpg` (the sawn blocks at its left) |

## Yamaha U1 (upright)

| part | value | source |
|---|---|---|
| Height × width × depth | 1210 × 1530 × 620 (some dealers list 610 deep) | [Yamaha-U] (Canada spec table), [Maene-U1] |
| Weight | 228 kg | [Yamaha-U], [Maene-U1] |
| Key dip / blow | Regulated the same way as a grand: ≈10 dip, ≈45–47 blow. **typical, unsourced** for the U1 specifically | [Askenfelt-Jansson] (grand) |

## Boehm concert flute (C)

| part | value | source |
|---|---|---|
| Overall length, assembled (C foot) | 670–672 (a Powell Cooper-scale flute is 670; a 1970s US Boehm-style flute is 672) | [McGee-lengths] |
| Sounding length (embouchure centre to the foot end) | 598–603 | [McGee-lengths] |
| B foot | Adds about 25–35 to the overall length. **typical, unsourced** | — |
| Bore, body and foot | 19 (cylindrical) | [UNSW-anatomy] |
| Bore at the embouchure (headjoint taper) | tapers to ≈17 | [UNSW-anatomy] |
| Head cork to embouchure-hole centre | ≈17 | [UNSW-acoustics] |
| Tone holes | ≈13, nearly uniform (silver 13.2–13.5; Boehm's own guide is "at least ¾ of the tube", 14.25) | [UNSW-anatomy], [McGee-Boehm] |
| Small holes | D and D♯ trill holes 7.6; C♯ hole 6.6 | [McGee-Boehm] |
| Pad sizes (≈ inside diameter of the key cups) | Yamaha set: 8 × 18, 3 × 19.5, 2 × 16.5, 3 × 12 | [Dawkes-pads] |
| Trill and C♯ holes, from the cork | D♯ trill 216.3, D trill 233.4, C♯ 253.5 (Boehm's schema at A = 435) | [McGee-Boehm] |
| Pad cups (inside) | trill keys and C♯ key 11–11.5; body 17–17.5; foot 18–19 | [OSU-repair] p. 160 |
| Keywork, main line from the head | C♯ key and its lever (L1's cup), B♭ key, A (L2), G1 (L3), G2 (closed with G1), F♯, F (R1), E (R2), D (R3); thumb key and Briccialdi B♭ lever, G♯ key on the back; long trill rod; F/B♭ and F/F♯ back connectors, B♭/A front connector, E and D front connector to the F♯ key | [OSU-repair] fig. 2.2 |
| Fingerings modelled | standard first choices, C4–C7 | [WFG-flute], [fluteinfo-chart] |
| Headjoint length | ≈200–220. **typical, unsourced** | — |
| Embouchure hole | ≈10 × 12 oval-rectangle. **typical, unsourced** | — |
| Lip plate | ≈35 × 25. **typical, unsourced** | — |
| Wall thickness | ≈0.38–0.40. **typical, unsourced** | — |

## B♭ trumpet (Bach Stradivarius 180S37)

| part | value | source |
|---|---|---|
| Bore | 0.459″ = 11.66 (ML) | [Bach-180S37], [Thomann-190S37] |
| Bell | #37, one piece, Ø 122.2 (4 13/16″; often written 4.8″) | [Bach-180S37], [Thomann-190S37] |
| Mouthpipe (leadpipe) | #25 taper. Length **typical, unsourced** | [Bach-180S37] |
| Pistons | Monel, two-piece nickel-silver/brass casings. Casing and piston diameters and casing length: **typical, unsourced** | [Bach-180S37], [Thomann-190S37] |
| Overall length (the museum's catalogued "height"; whether the mouthpiece is included is not stated) | 480 (1957 Strad, #16433); 489 (1981–82 Strad 72) | [NMM-9107], [NMM-13509]² |
| Bell (measured, museum examples) | 122–123 | [NMM-9107], [NMM-13509]² |
| Tubing length | ≈1480 nominal for B♭. The 1957 Strad's catalogued "tube length" is 1307 | [Wikipedia-trumpet], [NMM-9107]² |
| Mouthpiece (Bach 7C) | cup Ø 16.20, throat 3.66, #10 backbore. Overall length ≈88: **typical, unsourced** | [Kirstein-7C] |

² The National Music Museum's eMuseum blocks scripted fetches. These figures come from its search-indexed
record text, so check them at the links.

## Oboe (conservatoire system)

Modelled as a full conservatoire (Gillet) oboe of the Lorée / Marigaux / Yamaha class, laid out from
Yamaha's own full-length photograph of the YOB-831 (`oboe-yamaha-side.jpg`, 4013 px for the body,
measured in pixels at 6.69 px/mm) and checked against the measured instruments below.

| part | value | source |
|---|---|---|
| Body (top of the top joint to the bell rim, no reed) | 601 (Lorée, 1983); 597–598 (Howarth Gillet body, Kohlert); 593 (Durand). Modelled: 600 | [MIM-Loree], [Bate-oboes] |
| Top joint | 233 + 19 tenon (Lorée); 238 in the photograph, to the lower joint's socket ring. Modelled: 236 + a 4.5 mm silver ring | [MIM-Loree], photograph |
| Lower joint | 240 + 17 tenon (Lorée); 236 in the photograph. Modelled: 231 + the bell's 6.5 mm silver ring | [MIM-Loree], photograph |
| Bell | 127 (Lorée); 126 in the photograph. Modelled: 122 + its ring | [MIM-Loree], photograph |
| Bell rim, outside | "Max diam [bell]" 53 (Howarth), 55 (Kohlert), 56 (Durand); 50 in the photograph. Modelled: Ø 50 | [Bate-oboes], photograph |
| Outside diameters | the bulb under the ferrule Ø 23.7; the top joint Ø 20.1 below its bead, tapering to Ø 23.2 at its foot; the lower joint Ø 27.2–28.0; the bell Ø 28.8 under its ring, flaring over its last 15 mm into the rim | photograph |
| Bore | minimal c. 4.0; reed well Ø 7.4 × 18.2 deep; 10.0 at the top joint's foot, 15.5 at the lower joint's, 15.7 at the bell's top | [MIM-Loree] |
| Reed | 71.5 overall (by the rule in `oboe-reeds.jpg`): cane 23 out of the thread, thread 16, cork 32 on a 47 mm staple; tip 6.9 wide, thread Ø ≈ 4.6, cork Ø 7.0. With 18 mm of cork in the well, 53.5 stands out of the top joint: 653.5 reed tip to rim | `oboe-reeds.jpg`, [MIM-Loree] |
| Overall | "roughly 65 cm" | [Wikipedia-oboe] |
| Keywork | 45 pieces on a full conservatoire oboe; nickel silver, silver-plated | [Wikipedia-oboe] |
| Keys modelled | the side (second) octave key's vent at 29 mm (from the top of the body) and its touch beside L1; the thumb octave key's vent at 80 and its plate on the back; trill vents at 90, 110, 122; the perforated plates L1 131 (its half-hole plate 142), L2 162.5, L3 193; G♯ vent 178; R1 255 (its crescent 264), R2 293, the ring R3 320; the F key's half-moon touch 306.5; E♭ 358; C♯ 384 and C 452 on the right-hand side; F resonance 420; B 497 and B♭ 522 on the bell; the left little finger's G♯, E♭, B, B♭ touches hanging past the joint (round ends at 206–222), the right little finger's C, C♯, E♭ (320–337); the thumb rest at 296 | photograph |
| Key travel (modelled, a little more than life so it reads) | plates 2.2 at the cup's middle, vents 1.2–1.8, the low keys 2.6–3.0, touches 2.6 | **typical, unsourced** |
| Fingerings modelled | the standard conservatoire fingerings B♭3–A6 (`apps/web/src/ui/oboe-fingering.ts`, shared with the 2D stage) | [WFG-oboe] |
| Wood | grenadilla (African blackwood); student oboes resin | [Wikipedia-oboe] |

## Clarinet (Boehm system, B♭)

Modelled as Yamaha's YCL-CSG III (17 keys, 6 rings), laid out in pixels from Yamaha's own full-length
photograph of it (`clarinet-yamaha-csg3-front.jpg`, 651 × 5786). Its 54 mm barrel (Yamaha's specification)
is 470.5 px, so 8.71 px/mm; the whole is then 664 mm from the mouthpiece's tip to the bell, which is what
Debut, Kergomard & Laloë measured on a Buffet Crampon from the reed's tip to the bell's end. The photograph is
to scale both ways (its diameters at 8.71 px/mm agree with the joints' and the bell's).

| part | value | source |
|---|---|---|
| Overall, assembled with the mouthpiece | 664 (the photograph); 664 reed tip to bell end (Buffet Crampon); "approx. 66 cm" | photograph, [Debut], [VSL-clarinet] |
| Mouthpiece | 67.9 out of the barrel (89–90 overall: Buffet 89.3–89.9, Selmer 89.3–90.2, so a ≈ 21 mm tenon); Ø 13.5 two mm behind the tip, Ø 27 at its shank | photograph, [CP-mouthpieces] |
| Lay | facing 21 (Yamaha Custom), tip opening 1.1 (Yamaha Custom 1.05–1.15; Vandoren B45 1.195); window 31–33.6 long | [Yamaha-mp], [Vandoren-B45], [CP-mouthpieces] |
| Reed | 68 long, 13 wide at the tip, heel 2.9–3.0 thick; the vamp 34 at its heart (modelled) | [Thomann-reed] |
| Ligature | 24.5 wide (photograph); two screws, their heads ≈ 7 off the mouthpiece. Modelled as the standard band with its two screws on the reed's side ([`clarinet-mouthpiece-side.jpg`]) | photograph |
| Barrel | 54 (YCL-CSG III; R13 65–66); Ø 28.7 under its top ring swelling to 31.9 about 40 down, its rings 6.2 and 6.8 tall | [Yamaha-CSG], photograph |
| Upper joint | 196 between the barrel and the lower joint's socket ring; Ø 30 under the barrel, then 28.5 | photograph (Buffet BC20: 190, NMM 05834) |
| Lower joint | 234 with its socket ring (7.8 tall); Ø 28.7, flaring to 31.5 into the bell's ring | photograph (Buffet BC20: 235) |
| Bell | 112 with its socket ring (7.2 tall, Ø 32.4); the rim Ø 73.6 outside, its mouth Ø 60 inside | photograph (Buffet BC20: 110.1), [Debut] |
| Bore | 14.6–15.0 (R13 14.64 polycylindrical; Debut's Buffet 14.4–14.8) | [CP-bores], [Debut] |
| Finger holes (mm from the tip) | L1 245, L2 278, L3 300 (no ring), R1 357, R2 382, R3 404 | photograph |
| Keys modelled | the register key's vent at 149 on the back and its touch over the thumb ring (thumb hole 239); the A key's pad at 195 on its cross hinge (214) with the spatula below; the G♯ key's pad at 208 and its touch on the player's left; the side keys' vents at 165, 180, 204 and the side E♭/B♭ key's at 264, their touches stacked at 309–335 on the player's right; the ring pad between L1 and L2 (263); the E♭/B♭ sliver (287); the C♯/G♯ key (vent at 306, spatula across the front at 315); the bridge (lower pad at 340); the B/F♯ sliver (393); the left little finger's E/B, F♯/C♯ and F/C spatulas beside the joint (320–347), the right little finger's A♭/E♭, F/C, F♯/C♯, E/B spatulas across the front (418–440); the G♯/D♯ key (452); the F♯ (464), F (494) and E (533) pads on the low keys' line; the thumb rest at 362 | photograph, `clarinet-lower-joint-front-selmer10s.jpg`, `clarinet-upper-joint-front-and-back-selmer10s.jpg` |
| Key travel (modelled) | rings 1.35 (they stand 1.5 off the wood); vents 1.6–2.0; the low pads 2.8–3.0 (at least a third of the tone hole: "≈ 2.5–3 for 7–9 mm holes") | [clarinets-keys]; per key **typical, unsourced** |
| Fingerings modelled | the standard Boehm chart, written E3–C7 (`apps/web/src/ui/clarinet-fingering.ts`, shared with the 2D stage) | [WFG-clarinet] |
| Wood, mouthpiece | grenadilla (the oboe's material); hard rubber (ebonite) | |

The tone holes' bore positions (Debut's Table 3: 23 holes, register vent Ø 2.8 at 152.7 from the reed tip)
were used to check the photograph's places, not to place the keys: the paper does not say which hole is which.

## Reference photos

The photos are in `.cache/refs-3d/`, which is not committed. Full attributions are in `.cache/refs-3d/SOURCES.md`.
The double bass's are in `.cache/refs-bass/` (`bass/` below), the oboe's in `.cache/refs-oboe/` (`oboe/` below,
fetched from Wikimedia Commons' API, the 1920 px thumbnails), the clarinet's in `.cache/refs-clarinet/`
(`clarinet/` below, with its own `SOURCES.md`), also not committed.

| file | license | shows |
|---|---|---|
| `cello-front.jpg` | CC0 (The Met) | Vuillaume cello, front |
| `cello-34.jpg` | CC0 (The Met) | Pique cello, slight three-quarter, endpin out |
| `cello-scroll.jpg` | CC BY-SA 3.0, Jorge Royan | scroll, pegbox, pegs |
| `violin-front.jpg` | CC0 (The Met) | "Francesca" Strad, front |
| `violin-34.png` | CC BY-SA 3.0, Tumdil | close three-quarter: f-hole, bridge, varnish |
| `violin-bridge.jpg` | CC BY-SA 3.0, Pascalou petit | low view of the bridge, f-holes and arching |
| `violin-scroll.jpg` | CC0 (The Met) | "Francesca" scroll, side profile (the 3D scroll is traced from it: `scripts/trace-scroll.py`) |
| `violin-back.jpg` | CC0 (The Met) | "Francesca" from the back: the pegbox's fluting, the bare maple neck |
| `viola-front.jpg`, `viola-side.jpg`, `viola-34.jpg` | CC0 (The Met) | Stainer viola: front, full side profile, angled on black |
| `grand-34.jpg` | CC BY-SA 3.0, Steinway & Sons | D-274, lid open, three-quarter from the keyboard side |
| `grand-inside.jpg` | CC0, Kjethdubns | plate, strings, dampers from above |
| `grand-action.jpg` | Public domain, Museumsinsulaner | full grand action on its keyframe |
| `grand-action-side.jpg` | CC0, Юрій Булка | single-note grand action model, side |
| `grand-action-diagram.png` | Public domain, W. B. White | numbered grand-action diagram |
| `upright-front.jpg` | CC BY 3.0, Daniel Christensen | Yamaha U1, front (small, in a room) |
| `upright-studio.png` | CC BY-SA 3.0, Steinway & Sons | K-132 upright, studio |
| `upright-action.jpg` | CC BY-SA 3.0, Deathgleaner | upright with the panels off: hammers, dampers, plate |
| `upright-action-close.jpg` | Public domain, Drondent | upright action close-up |
| `flute-side.jpg` | CC BY-SA 4.0, Yamaha Corporation | YFL-482H, full length, keywork side (rotated locally) |
| `flute-keys.jpg` | CC BY-SA 3.0, Amadís | keywork close-up |
| `flute-joints.png` | CC BY-SA 3.0, Alessandro Forghieri | head, body and foot joints from above, lip plate |
| `trumpet-side.jpg` | CC BY-SA 3.0, Amada44 | B♭ trumpet, side, bell to the right |
| `trumpet-34.jpg` | CC BY-SA 4.0, Simon Schnepp | B♭ trumpet, three-quarter from above (vintage) |
| `trumpet-34-modern.jpg` | CC BY-SA 4.0, Rube451 | modern silver B♭ trumpet, three-quarter (soft) |
| `trumpet-valves.jpg` | CC BY-SA 3.0, Amada44 | valve casings and caps |
| `trumpet-mouthpiece.jpg` | CC BY-SA 3.0, Didelu | Bach mouthpiece, side |
| `bass/met-plumerel-*.jpg` (`MUS1340B1`, `MUS1340B`, `MUS289A`) | CC0 (The Met) | Plumerel double bass (Paris, 18th c.): front, beside a cello and violins, and lying on its side (the sloped shoulders) |
| `bass/met-cristofori-*.jpg` (`DP217153–5`) | CC0 (The Met) | Cristofori double bass: front, back, scroll in profile |
| `bass/met-eberle.jpg` (`231788`) | CC0 (The Met) | Eberle double bass (1734), front |
| `bass/contrebasse-clefs.jpg` | CC BY-SA 1.0, Ruizo | French bass machines: a full-cheek brass plate, cogs, worms, a butterfly key |
| `bass/kay-scroll.jpg` | CC BY 2.0, Philip Newton | Kay bass scroll: single machine plates, keys behind the pegbox |
| `oboe/oboe-yamaha-side.jpg` (`Yamaha_Oboe_YOB-831.tif`) | CC BY-SA 4.0, Yamaha Corporation | YOB-831, full length, front, no reed, white background: the outline, the joints and every key's place were measured off it |
| `oboe/oboe-loree-reed.jpg` (`Oboe_modern.jpg`) | CC BY-SA 3.0, Hustvedt | Lorée oboe with its reed, three-quarter from above, lying on white |
| `oboe/oboe-reeds.jpg` (`Anches_hautbois_conservatoire_et_baroque.jpg`) | CC BY-SA 4.0, Cdang | conservatoire and baroque oboe reeds beside a mm rule |
| `oboe/oboe-keys-blanks.jpg` (`Campionatura chiavi oboe … (chiavi grezze).JPG`) | CC BY-SA 4.0, Paperkat | the raw key blanks of a Lorée-system oboe: plates, touches, hinge tubes |
| `oboe/oboe-wlm-5641.jpg`, `oboe-wlm-5642.jpg` (`Wiki_loves_Music_-_Hamburg-5641/5642.jpg`) | CC BY-SA 4.0, Wuselig | a Yamaha oboe taken apart (bell, lower and top joints, reed), and its top joint from the back |
| `oboe/oboe-keys-moennig.jpg` (`Keys_oboe+clarinet.jpg`) | CC BY-SA 4.0, Gebr. Mönnig + F. Arthur Uebel | oboe keywork, lying horizontal: plates, posts, rods |
| `oboe/oboe-yamaha-bottom.jpg` (`Yamaha_bottom_joint.jpg`) | Public domain, Glio | a YOB-241's lower joint |
| `clarinet/clarinet-yamaha-csg3-front.jpg` (`Yamaha_Clarinet_YCL-CSGIII.tif`) | CC BY-SA 4.0, Yamaha Corporation | YCL-CSG III, full length, front, white background (the TIFF converted to JPEG at its full 651 × 5786): the outline, the joints and every key's place were measured off it |
| `clarinet/clarinet-mouthpiece-side.jpg` (`Clarinet002.jpg`) | CC BY-SA 3.0, Fewskulchor | a mouthpiece with its reed and a two-screw ligature, side view |
| `clarinet/clarinet-upper-joint-front-and-back-selmer10s.jpg` (`Clarinette_Selmer_10S_corps_du_haut_(2x).jpg`) | CC BY-SA 4.0, Clarioio | Selmer 10S upper joint, front and back (register key, thumb ring) |
| `clarinet/clarinet-lower-joint-front-selmer10s.jpg` (`Clarinette_10S_corps_du_bas.jpg`) | CC BY-SA 4.0, Clarioio | Selmer 10S lower joint, front: rings, both little fingers' keys |
| `clarinet/clarinet-buffet-front-boehm-trio.jpg` (`Boehm_3.jpg`) | CC BY-SA 4.0, Buffet Crampon, Patricola, Wurlitzer; collage Gisbert König | three Boehm clarinets, front (left: Buffet Crampon) |
| `clarinet/clarinet-lower-joint-back-thumb-rest.jpg` (`Clarinet_thumb_rest.jpg`) | CC BY-SA 4.0, Jud McCranie | the thumb rest on a Signet 100's lower joint |
| `clarinet/clarinet-{upper-joint,lower-joint,bell}-with-tape-selmer-signet.jpg` | CC BY-SA 4.0, Jud McCranie | Signet 100 joints and bell beside a tape measure (L3 plain, L1 and L2 ringed) |
| `clarinet/clarinet-five-pieces-labeled.jpg` (`Parts_of_clarinet_6.jpg`) | CC0, Gisbert König | a clarinet in its five pieces, labelled lengths |
| `Clarinette_auriculaire_droit.jpg` (not saved; on Commons) | CC BY-SA 1.0, Clarioio | the right little finger's four spatulas and the long rods, close up |

[HJ-vc]: https://www.hansjohannsson.com/resources/mescello.html
[HJ-vn]: https://hansjohannsson.com/resources/mesvioli.html
[HJ-va]: https://www.hansjohannsson.com/resources/mesviola.html
[Cozio-Davidoff]: https://tarisio.com/cozio-archive/property/?ID=40277
[Cozio-Messiah]: https://tarisio.com/cozio-archive/property/?ID=40111
[Ashmolean-Messiah]: https://ashmolean.org/node/179001
[Gewa endpin]: https://www.thomannmusic.com/gewa_cello_endpin_standard_52cm.htm
[R&J endpin]: https://www.thomann.de/ie/roth_junius_cello_endpin_carbon_fiber_4_4.htm
[SaddleRider]: https://saddlerider.squarespace.com/shop/p/cello-endpins
[Steinway-D]: https://steinway.co.uk/?p=1831
[dims-D]: https://dimensions.com/element/steinway-grand-piano-model-d
[Yamaha-CFX]: https://in.yamaha.com/en/products/musical_instruments/pianos/grand_pianos/cfx_02/specs.html
[Erwin AR]: https://cdn.shopify.com/s/files/1/0113/8170/2756/files/ErwinActionRatioGauge.pdf
[Steinway manual]: https://manuals.online/steinway-and-sons/musical-instrument/s/use-and-care-manual/vo33
[Kawai GS100]: https://manualshive.com/en/manual/kawai/gs100/658524?page=17
[Askenfelt-Jansson]: https://www.speech.kth.se/music/5_lectures/askenflt/timing.html
[Yamaha-U]: https://ca.yamaha.com/en/products/musical_instruments/pianos/upright_pianos/u_series/specs.html
[Maene-U1]: https://www.maene.be/en_BE/yamaha-u1
[McGee-lengths]: https://mcgee-flutes.com/flutelengths.htm
[McGee-Boehm]: https://www.mcgee-flutes.com/Boehm's%20Schema.htm
[UNSW-anatomy]: https://newt.phys.unsw.edu.au/music/flute/anatomy.html
[UNSW-acoustics]: https://newt.phys.unsw.edu.au/jw/fluteacoustics.html
[Dawkes-pads]: https://dawkes.co.uk/yamaha-flute-pad-set-200-older-models-pad-sets/4258
[OSU-repair]: https://etd.ohiolink.edu/acprod/odb_etd/ws/send_file/send?accession=osu1211871566&disposition=inline
[WFG-flute]: https://www.wfg.woodwind.org/flute/fl_fing.html
[fluteinfo-chart]: https://fluteinfo.com/Fingering_chart/modern.php
[Bach-180S37]: https://bachbrass.com/print/bach-stradivarius-trumpet-in-bb-180s37
[Thomann-190S37]: https://www.thomann.ie/bach_ml190s37_bb_trumpet_silver.htm
[NMM-9107]: https://emuseum.nmmusd.org/objects/9107/trumpet-bflat
[NMM-13509]: https://emuseum.nmmusd.org/objects/13509/trumpet-bflat
[Wikipedia-trumpet]: https://en.wikipedia.org/wiki/Trumpet
[Kirstein-7C]: https://www.kirstein.de/en/Wind-Instruments/Accessories/Mouthpieces/Mouthpieces-Brass/Bach-Trumpet-Mouthpiece-7C.html
[Gewa-Ideale]: https://www.thomannmusic.com/gewa_ideale_double_bass_3_4.htm
[Gewa-Premium]: https://www.thomann.co.uk/gewa_premium_line_solid_bass_3_4.htm
[Thomann-11]: https://www.thomannmusic.com/thomann_11_5str_3_4_europe_double_bass.htm
[Walther-Solo]: https://www.thomannmusic.com/georg_walther_solo_double_bass_3_4_am.htm
[Met-Plumerel]: https://www.metmuseum.org/art/collection/search/501551
[Met-Eberle]: https://www.metmuseum.org/art/collection/search/504228
[Met-Cristofori]: https://www.metmuseum.org/art/collection/search/503176
[TB-flatback]: https://www.talkbass.com/threads/flatback-vs-roundback.1049827/
[Brown-2004]: https://doublebassblog.org/downloads/2004_Brown_WEB_Dissertation.pdf
[Despiau-adj]: https://www.thomannmusic.com/despiau_bass_bridge_34_adjustable.htm
[Teller-wheels]: https://www.thomannmusic.com/teller_bass_bridge_3_4_with_wheels.htm
[Aubert-34]: https://www.thomannmusic.com/aubert_bass_steg_34.htm
[Aubert-feet]: https://www.thomannmusic.com/aubert_bass_bridge_3_4_movable_feet.htm
[RJ-machines]: https://www.thomannmusic.com/roth_junius_single_machines_bass_3_4_br.htm
[Rubner-machines]: https://www.thomannmusic.com/rubner_bass_machines_140_114o_eh_5.htm
[Strad-mechanics]: https://www.thestrad.com/lutherie/trade-secrets-using-baker-style-mechanics-on-a-double-bass/14611.article
[MIM-Loree]: https://brusselsmimoboecollection.kcb.be/instrument-checklist/1983.021loree/
[Bate-oboes]: https://www.bate.ox.ac.uk/files/oboespdf
[Wikipedia-oboe]: https://en.wikipedia.org/wiki/Oboe
[WFG-oboe]: https://www.wfg.woodwind.org/oboe/ob_bas_1.html
[Debut]: https://arxiv.org/pdf/physics/0309051
[VSL-clarinet]: https://www.vsl.co.at/academy/woodwinds/clarinet
[CP-mouthpieces]: https://web.archive.org/web/2025/https://www.woodwindforum.com/clarinetperfection/?p=353
[CP-bores]: https://web.archive.org/web/2025/https://www.woodwindforum.com/clarinetperfection/?p=492
[Yamaha-mp]: https://usa.yamaha.com/products/musical_instruments/winds/mouthpieces/clarinets/custom_standard.html
[Yamaha-CSG]: https://usa.yamaha.com/products/musical_instruments/winds/clarinets/ycl-csgiii/specs.html
[Vandoren-B45]: https://vandoren.fr/en/?p=6243
[Thomann-reed]: https://www.thomann.co.uk/pilgerstorfer_morr_french_cut_bb_clar_4.0.htm
[clarinets-keys]: https://www.the-clarinets.net/clarinet-keys.html
[WFG-clarinet]: https://www.wfg.woodwind.org/clarinet/cl_fing.html
