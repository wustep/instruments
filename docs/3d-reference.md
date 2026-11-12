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

## Bassoon (Heckel system)

Modelled as a Heckel-system bassoon of the Fox / Heckel / Yamaha class, laid out from Gregory Maxwell's
photograph of a Fox Renard 220 seen from both sides (`bassoon-fox-renard220-front.jpg`, 1920 × 4392): its
1340 mm from the boot's foot (row 4290) to the bell's rim (row 56) is 3.16 px/mm, so a height is
1340 − (row − 56) / 3.16 mm. The photograph is to scale both ways (its joints' widths at 3.16 px/mm agree
with the museum's and Yamaha's proportions). The keys' order and names follow the bassoon key diagram
(`bassoon-keys-diagram.png`); where the photograph does not show a pad, its place is the diagram's order
along the joint (**laid out, not measured**).

| part | value | source |
|---|---|---|
| Overall, boot's foot to the bell's rim | 1340 (the photograph); "1.34 m tall"; 1334 and 1343 (two maple Heckel-system bassoons) | photograph, [Wikipedia-bassoon], [NMM-5893] |
| Sounding length (bore, reed tip to bell) | 2588 modelled (the reed and the bocal 323, down the wing and the boot's small bore 883, the U-tube 64, up the large bore, the long joint and the bell 1318); "2.54 m" | [Wikipedia-bassoon] |
| Boot | 419 with its 38 mm ring (NMM: butt 407–414 without its ring); 71 × 42 across under the ring, 62 at the foot; the U-tube's cap 57 tall, its plate held by two screws at the ends | photograph, [NMM-5893], `bassoon-wlm-5688.jpg` |
| Wing joint | 486 out of the boot to the top of its 36 mm cap (NMM 480–484); Ø 28.5; the wing (the fin the finger holes are drilled through) from 505 to 725, reaching 26 across from the wing's axis in front of the long joint | photograph, [NMM-5893] |
| Long joint | 580 out of the boot to its 34.5 mm ring (NMM 568–580); Ø 43 | photograph, [NMM-5893] |
| Bell | 307 over the long joint's ring (NMM 352–356 with its tenon); a swell over the ring (Ø 49), a waist (Ø 46), a swell a third of the way up (Ø 52.5), the neck (Ø 44.6) and the bead ring (Ø 55, 11 tall, ivory-like: Yamaha's, Heckel's); the mouth Ø 40 | photograph, `bassoon-yamaha-yfg812-front.jpg`, `bassoon-001.jpg`; the mouth [Fletcher-Rossing] (engine) |
| Joints' axes | 35.5 apart (the long joint and the wing touching, Ø 43 and Ø 28.5) | photograph (the thumbs' side: 42.7 + 28.5 = 71 across the boot's ring) |
| Bocal | rises 57 over the wing's cap, falls away 206 sideways to the reed (the photograph's curve, traced at 18 points); Ø 10 at its cork tapering to Ø 5.2; ≈ 290 along its curve out of the cork (Heckel bocals 0–3 are ≈ 300–330 overall: **typical, unsourced**); the whisper key's nipple 24 above the cap | photograph, `bassoon-heckel-bocal.jpg` |
| Reed | 55 long ("around 5.5 cm"), the blades 28 above the first wire ("27–30 mm"), 14.8 wide at the tip, 9.6 at the first wire; the tip open 1.44 at rest; three wires (the first at the blades, the second at 20.5, the third under the turban); the turban 17.7 of red thread | [Wikipedia-bassoon], `bassoon-reed-binding.jpg`; widths **typical, unsourced** |
| Finger holes (mm from the foot) | L1 640 (small: the half-hole), L2 598, L3 560 in its ring; R1 348, R2 301 in its ring | photograph |
| Keys modelled (mm from the foot) | the left thumb's low D, C, B, B♭ touches (606–706 on the long joint's back) and their pads (D 742, C 848, B 954 on the long joint, B♭ 1112 on the bell); the whisper key (its touch 606–619, its pad on the bocal's nipple); the C♯ key (touch 652, vent 744); the A, C and D flick keys (vents 790, 816, 846 on the wing's back); the E♭ key (touch 619, vent 708) and the high E touch (667); the left little finger's E♭ and C♯ touches (525–552) and their pads on the long joint (484, 766); the right thumb's E plate (314, Ø 27, in its guard), B♭ key (vent 352), F♯ and A♭ touches (282, 262); the G key (R3: touch 268, pad 274 on the boot's side); the little finger's F plate with two rollers (244, its pad 141), F♯ (253 → 210) and A♭ (237 → 84); the C♯-trill key (324) and the B♭ sliver (284); the hand rest (356) | photograph, `bassoon-keys-diagram.png`, `bassoon-thumb-keys.jpg`, `bassoon-boot-thumb-keys.jpg` |
| Key travel (modelled) | rings 1.4–1.5 (they stand 1.5 off the wood); vents 1.8–2.4; the big pads 2.6–3.6; touches 2.4–2.6 | **typical, unsourced** |
| Fingerings modelled | the Heckel-system basic chart, B♭1–E5 (`apps/web/src/ui/bassoon-fingering.ts`, shared with the 2D stage) | [WFG-bassoon] |
| Wood, keys | flamed maple stained red-brown under a hard varnish (the flame 3–6 mm bands round the joint); silver-plated nickel silver | [Yamaha-YFG812], photographs |

## Horn (double horn in F/B♭, Kruspe pattern)

Modelled as a full double horn of the Kruspe pattern (the change valve nearest the leadpipe), the class of
the Conn 8D, the Holton H179 and the Hans Hoyer 6801, laid out from BenP's photographs of a Besson BE702
Kruspe double horn from both sides (`horn-besson-be702-back.png`, `…-front.png`) and Hk kng's numbered
drawing of it (`horn-besson-be702-back-diagram.png`), with the bell's rim as the scale (311 mm: 501 px on
the player's side, so 0.621 mm/px; 472 px on the audience's, 0.659 mm/px). Where the photographs do not
show a part's place it is **laid out, not measured**. The model is `apps/web/src/ui/gl/horn3d.ts`.

| part | value | model | source |
|---|---|---|---|
| Bell (outside the rim) | 12¼″ = 311 (Conn 8D, Holton H179); 310 (Hoyer 6801) | 311 with its 2.6 mm bead | [Conn-8D], [Holton-H179], [Hoyer-6801] |
| Bore | 0.468″ = 11.9 (all three) | 11.9; tubing Ø 13.0 outside (the wall **typical, unsourced**) | [Conn-8D], [Holton-H179], [Hoyer-6801] |
| Coil, across its outer wrap | 317 (back photograph: 510 px), 314 (front: 477 px), ≈ 300 (Yamaha YHR-667V: 800 px against its 830 px rim) | 312 (the unit test's measure) | photographs |
| Bell's flare | Ø 84 at 100 mm from the rim, 73 at 130 (back photograph) | a Bessel horn r = b / (x + 22 mm)^0.75: Ø 86 at 100, 73 at 130, 34 at 400, 13 at 1.6 m | photograph |
| Bell's place | its rim's centre 318 right of the coil's centre and 16 below (photograph), 316 and 18 (drawing); its axis 27° up in the coil's plane, out of the plane towards the player ≈ 15° (the front photographs see the rim nearly edge on) to ≈ 35° (the back photograph, taken from the bell's side) | 317, −17; 27° up, 20° out | photographs, drawing |
| Open tubes | the F horn 3.7 m, the B♭ horn 2.8 m | solved: F 3.740 m, B♭ 2.800 m (mouthpiece, leadpipe 725, the change valve's and valves' passages 26 each, the F loop 1100 or the B♭ slide 160, the return 122, the main slide 208, the bell branch 1108 + the bell's straight 290) | [Fletcher-Rossing] §14.6; the engine's HORN_F_LENGTH, HORN_BB_LENGTH |
| Valve slides (what each valve adds: (2^(n/12) − 1) of the side's open tube) | F: 222 (2nd), 458 (1st), 708 (3rd); B♭: 166, 343, 530 | F: 222, 458, 670; B♭: 166, 333, 424 (the thirds' long loops fold short in the coil's foot) | arithmetic on the open tubes |
| Rotary valves | four in a column, the change valve nearest the leadpipe (Kruspe); 34–37 apart (photographs); caps Ø 26–27 (drawing, photograph) | 36 apart (62, 26, −10, −46 above the coil's centre), 48 to the lever side of it; casings Ø 25.4, 42 tall; caps Ø 27.6 | photographs, drawing |
| Levers | four spatulas on an axle with springs, the thumb's (the change valve's) uppermost; paddles 21–22 apart (photographs), fanned from the rotors' 36 | spatulas 25 × 12.4 (the thumb's 27 × 13.6) at 45, 14, −9, −32; the axle 34 beyond the rotors; mechanical linkage, a four-bar each: 18° of lever (11 mm at the spatula) turns a rotor a quarter turn | photographs; the linkage's sizes **typical, unsourced** |
| Leadpipe | from the receiver down the lever side, 11.3° off the coil's vertical (photograph) | 11°; Ø 10.5 at the receiver to 13 over 450 mm, then its own wrap (r 104) round to the change valve | photograph; the taper **typical, unsourced** |
| Mouthpiece | Denis Wick 7N: overall ≈ 82, rim Ø ≈ 25, a deep funnel cup, shank Ø 9–10.5 (the photograph against its mm rule, the rim taken as 25) | 82, rim Ø 25, cup Ø 17.2, 25 in the receiver | `horn-mouthpiece-denis-wick-7n.jpg` |
| Hand rest, finger hook, water key, braces | where the photographs and the drawing have them (3, 4) | laid out, not measured | drawing |
| Hold (the Orchestra) | the coil standing in front of the player's left chest, the levers up under the left hand, the leadpipe rising to the lips, the bell down by the right thigh, its mouth behind (`horn-player-bradac.jpg`, `horn-section.jpg`) | the caps' side 37° to the audience, the bell's axis down 34°, back and to the player's right; the mouthpiece at 1.18 m | photographs |

## Trombone (2D): slide trombones, alto, tenor with F attachment, bass with two valves

The 2D stage's trombone (`apps/web/src/ui/trombone-plan.ts`, drawn by `trombone-draw.ts` and
`vector/trombone.ts`; checked in `apps/web/test/trombone2d.test.ts`). Laid out from Yamaha's own side
photographs, each scaled by its bell's published diameter: the YSL-620 tenor in B♭/F (bell 214.4 mm, bore
13.89 mm: its rim 335 px across, **0.640 mm/px**), the YBL-830 bass (bell 241 mm: 236 px, 1.02 mm/px) and the
YSL-871 alto in E♭ (380 px, 0.46 mm/px). The photographs show the slide a few degrees off the bell section's
axis (3.4° on the YSL-891Z, 4.3° on the YSL-620, none on the YSL-871); the drawing keeps it parallel, and its
measures are taken along the slide. Origin: the mouthpiece's receiver (the inner slide's upper tube).
The engine's measures (`TROMBONE_SIZES`) set the bells, bores, open tubes and the slide's travel; the
photographs set the layout. Where a size's photograph does not show a part's place it is **laid out, not
measured**.

| part | measured | drawn | source |
|---|---|---|---|
| Slide: tubes apart (centres) | tenor 112 px = 72 mm; bass 69 px = 70 mm; alto 101 px = 46.5 mm | 72 / 70 / 46.5 mm | [YSL-620], [YBL-830], [YSL-871] |
| Slide: outer tube | tenor 25 px = 16.0 mm (bore 13.89 mm) | outside Ø bore + 2.4 mm; the inner tubes bore + 0.8 mm | [YSL-620] |
| Slide: the crook's arc, down the slide from the receiver | tenor 1140 px = 730 mm; alto 1240 px = 570 mm; bass 692 px = 706 mm (low resolution) | 730 / 570 / 683 mm (the bass's fitted, its outer slide kept on the stockings to 0.60 m: past its seventh position) | photographs |
| Outer slide's top, hand brace, inner brace | tenor 103, 126, 25 px = 66, 81, 16 mm; alto 78, 83, 18 mm | the same | photographs |
| Bell: rim and its place | tenor: the rim 272 mm along the slide, its centre 45–51 mm above the slide's upper tube (the bell's axis falls 0.8° to the rim); alto 232 mm, 69 mm; bass 272 mm, 71 mm | rim Ø 178 / 216 / 241 mm (the engine's), at 232 / 272 / 272 mm, axis 69 / 51 / 71 mm above | photographs; [YSL-620-specs] |
| Bell's flare (outside Ø, tenor) | 147 mm 17 mm in from the rim, 112 at 33, 90 at 49, 74 at 65, 59 at 97, 50 at 129, 44 at 161, 38 at 225, 33.5 at 289, 25 at 385, 20 at 480 | a Bessel horn r = R·(d₀/(d + d₀))^0.75, d₀ 22 mm on a 214 mm bell (the others scaled by their bells); on the engine's 216 mm tenor bell: 141, 109, 90, 77, 61, 51, 44, 35, 30, 24, 21 | [YSL-620] |
| Mouthpiece | rim Ø 62 px = 40 mm; 41 mm out of the receiver (tenor) | a 6½AL outline (rim Ø 40, cup 25.4, 88 long), the others by their cups; 42 / 58 / 46 mm out | [YSL-620], [YSL-871]; the engine's cups |
| Tuning slide | tenor: legs 116 mm apart (51 above, 65 below the slide), its bow's outside 388 mm behind the receiver; sleeves 110 mm long | legs as measured, the bow placed so the open tube is the engine's 2.740 m: its outside 387 mm behind (alto 2.060 m, bass 2.740 m: 433 mm, as the YBL-830's 428) | [YSL-620], [YBL-830]; core/trombone.ts |
| F attachment (tenor) | the YSL-620's traditional wrap: a rotor 99 mm behind the receiver and 49 below, cap Ø 32 mm; its loop up out of the rotor, over along a leg 28 mm above the slide, round a small oval (its tuning slide, legs 28 and −21 mm), back behind along 36.5 mm, round a bow inside the tuning slide's (its outside 345 mm behind) and back along −53 mm and up an S into the rotor | as photographed, the big bow placed so the loop is the engine's fourth: 0.9175 m (its outside 347 mm behind) | [YSL-620], [Greenhoe-42G] (the rotor and its J-hook trigger) |
| Bass valves | the YBL-830: two rotors in line 49 mm apart, nested loops at the back and an upright hairpin in the middle | the F rotor where the tenor's is, the G♭ rotor 49 mm behind it; the F loop's bow inside the tuning slide's, its hairpin (its tuning slide) sized to 0.9175 m; the G♭ loop's bow inside the F loop's, its hairpin sized to 0.692 m (with F: the engine's D side, a minor sixth) | [YBL-830], [bass-dependent] (the paired thumb triggers) |
| Trigger | the J hook on a bar from the bell brace, 21–53 mm under the slide's upper tube | a hook on a pivot at the bell brace turning 14° under the thumb; its link turns the rotor's crank a quarter turn | [YSL-620], [Greenhoe-42G] |
| Bell brace, water key, bumper | the brace 104 px = 67 mm behind the receiver, its leaf on the bell's tail; the water key on the crook's lower leg; a rubber bumper on the crook | as measured; the water key's lever 36 mm, its cup Ø 12 mm (**laid out, not measured**) | photographs |
| Positions | the slide's n-th position: half the tube n−1 semitones add (the engine's `tromboneSlideOut`): the tenor's seventh 0.567 m | ticked faintly under the slide at the hand brace's place for each, the one held brighter | core/trombone.ts |

[YSL-620]: https://commons.wikimedia.org/wiki/File:Yamaha_Tenor_trombone_YSL-620.tif
[YSL-620-specs]: https://usa.yamaha.com/products/musical_instruments/winds/trombones/ysl-620_640/specs.html
[YBL-830]: https://commons.wikimedia.org/wiki/File:Yamaha_Bass_trombone_YBL-830_horizontal.tif
[YSL-871]: https://commons.wikimedia.org/wiki/File:Yamaha_Alto_trombone_YSL-871_recrop.jpg
[Greenhoe-42G]: https://commons.wikimedia.org/wiki/File:Greenhoe-Bach-42G-4.jpg
[bass-dependent]: https://commons.wikimedia.org/wiki/File:Rotary_valves_(dependent)_on_bass_trombone.jpg

## Timpani (four pedal timpani, Dresden pattern, American order)

Built in `apps/web/src/ui/gl/timpani3d.ts`; checked in `apps/web/test/timpani3d.test.ts`.

Sources: Ludwig, *Timpani Parts Catalog* AV1454 (2003); the Adams/Reisser catalogue, pp. 38–39 (the
American layout diagram); Adams' Philharmonic Classic and Professional Gen II product pages; Kolberg's
*Symphonic timpano "International"* data sheet; Yamaha's TP-8300R lineup (sizes, weights); Wiener Pauken's
technical data (proportions only); Vic Firth T1 and Thomann TMM3 mallets. Numbers marked (est.) are mine.

| Measure | Source | Model |
|---|---|---|
| Heads / kettles 32″, 29″, 26″, 23″ | Kolberg: bowls 814 / 736 / 660 / 584 mm; the engine's `TIMPANI_DRUMS` | 0.813 / 0.737 / 0.660 / 0.584 m |
| Playing height | Kolberg 82 cm on gliders (92 on casters); Yamaha TP-8300 85 cm overall; Adams Revolution 84–94 | 0.80 / 0.81 / 0.82 / 0.83 m (the small drums a little higher) |
| Bowl depth | none published; Wiener Pauken kettle 440–570 mm (est. ≈ 0.55–0.6 × d) | 0.47 / 0.43 / 0.39 / 0.345 m, parabolic |
| Tension screws | Ludwig AV1454: 6 on the 20″/23″, 8 on the 26″–32″ | 8 / 8 / 8 / 6, T-handles |
| Casters | Ludwig: 3″; Adams: three, locking | three 76 mm wheels on swivel forks |
| Counterhoop | Adams: chrome-plated; Kolberg: steel angle profile | a chrome channel, 16 mm wide, 44 mm tall, a flange for the lugs |
| Suspension ring | Adams Gen II: single-flange chrome suspension ring, free-floating kettle | chrome flange 115 mm under the head, the rods' guides on it |
| Gauge, fine tuner | Adams: all-metal tuning gauges; T-handle fine tuner on the player side | a gauge on the hoop 32° to the player's left (an arc of semitone ticks, its pointer at the note); a hand wheel 38° to the right |
| Head | Remo Renaissance "hazy film"; heads ≈ 2″ larger than the drum (Yamaha) | off-white satin film, its collar 30 mm down over the edge on an aluminium flesh hoop |
| Pedal | none published (est. 30–35 cm × 10–12 cm, 20–30° of travel) | 0.37 m × 0.105 m, +15° (heel down, lowest) … −9° (toe down, highest) |
| Mallets | Vic Firth T1 36.8 cm, 38.1 mm head; Thomann TMM3 390 mm, 39 mm, maple | 0.36 m birch stick, 11 → 9 mm, a 38 mm felt ball |
| Layout | Adams/Reisser diagram: 32″ on the player's left, then 29″, 26″, 23″ in an arc round the player | an arc about 2.5 m across, the hoops 0.12–0.2 m apart, the middle gap straight ahead |

Live from the engine (`frame.timpani`): the pedals (`pedal`), the gauges (`note` in `lo … hi`), the heads
(the first 14 modes `head`, envelope-followed, slowed to 1.6 Hz × j/j₁₁ and exaggerated to ≈ 2 cm on the
32″ at ff, the dent first at the strike point `spot`), the mallets (`hands`: contact held one frame,
rebound by velocity, lower in a roll).

## Trombone (3D): alto in E♭, tenor in B♭/F (open wrap), bass in B♭/F/D

Built in `apps/web/src/ui/gl/trombone3d.ts` (one builder, three sizes from the engine's `TROMBONE_SIZES`);
checked in `apps/web/test/trombone3d.test.ts`. Laid out from Yamaha's product photographs (`photos/` below:
the YSL-882OR open-wrap tenor, the YSL-620 traditional-wrap tenor, the YBL-822G bass, the YSL-871 alto), each
scaled by its bell's published rim (the YSL-620 at 0.506 mm/px, the YBL-822G 0.799, the YSL-871 0.302; checked
against the outer slide tube, 15.4 mm in the photograph against a published 15.3). Spacings across the slide
are projections in a photograph (a lower bound). Where a photograph does not show a part's place it is **laid
out, not measured**.

| part | value | model | source |
|---|---|---|---|
| Bores | tenor 0.547″ = 13.9 (Bach 42B, Conn 88H); bass 0.562″ = 14.3 (Bach 50B3); alto 0.468–0.490″ (Bach 39, YSL-871) | the engine's: 13.9, 14.3, 12.2; inner slide Ø bore + 0.6, outer Ø bore + 1.5 (15.4 on the tenor), the bell section's tubing bore + 1.3 | [Bach-catalogue], [Thomann-88H], [Yamaha-YSL871] |
| Bells | 8½″ = 216 (42B, 88H), 9½″ = 241 (50B3, YBL-822G), 7⅛″ = 182 (YSL-871), 6½″ = 165 (Bach 39) | the engine's: 216, 241, 178, each with its bead (2.0–2.6) | [Bach-catalogue], [Yamaha-YBL822G] |
| Bell's flare | Ø 80 at 0.1 m from a tenor's rim, 40 at 0.3, 20 at 0.7 (Pyle 1975, the engine's fit) | the engine's Bessel horn r ∝ (d + d₀)^−0.8 (d₀ 33 / 40 / 45 mm), scaled from the tuning slide's tubing to the rim: Ø 79 at 0.1 m (tenor) | the engine's `TROMBONE_SIZES` |
| Open tube, slide closed | B♭ 2.74 m (tenor and bass); E♭ a fourth shorter | solved: 2.740 / 2.740 / 2.060 m (the mouthpiece, the slide's tubes and crook, the receiver, the valves' passages, the main line to the tuning slide's legs, its bow, the bell's axis to the rim) | [Wikipedia-bass-trombone]; the engine |
| Overall, slide closed (tuning slide's bow to the crook's bumper) | ≈ 1175 (YSL-620), 1150 (YBL-822G), 854 (YSL-871) | 1152, 1140, 876 (the bow's place is what the open tube leaves) | photographs |
| Bell's rim to the crook's end | ≈ 513, 506, 392 | 512, 505, 393 | photographs |
| Slide tubes, centre to centre | 85 (a replacement crook, "fits most models"); ≈ 72 / 68 / 47.5 projected in the photographs | 82, 84, 54 | [Votaw-crook]; photographs |
| Outer slide (top ferrule to the crook's outer edge) | ≈ 716, 705, 551 | the travel + 30 mm (the inner tubes' least overlap) + the crook: 729, 729, 540 | photographs |
| Slide's travel | positions 1–7 at 0, 81, 168, 259, 356, 459, 567 mm on a tenor (half the tube each adds) | the engine's reach 0.64 / 0.64 / 0.47 m; the frame's `slide` drawn a frame behind | [Pressbooks-trombone]; the engine |
| Stockings | ≈ 100 long, ≈ 0.3 fuller | the last 100 mm of each inner tube, 0.3 fuller | [Yamaha-making] |
| Bell's axis from the slide (laid flat) | ≈ 68 above the upper (mouthpiece) tube, 141 above the lower (tenor); 87 / 155 (bass); 74 / 121 (alto) | the bell section turned about the lower tube's lock nut out of the slide's plane until the upper tube clears the rim (as the photographs show it passing in front of the bell): its axis 175 / 191 / 141 from the lower tube in its own plane, turned 36° / 36° / 31° | photographs |
| Bell section to slide when played | "slightly less than 90°" | 82° (80° the alto) in the Orchestra | [Pressbooks-trombone] |
| Valves | 42BO: a rotor, open wrap; 50B3: F and G♭ independent; YBL-822G: F and D dependent | the tenor's F rotor on the main line, its loop round behind the main tuning slide with its own slide (as the YSL-882OR); the bass's F rotor on the main line and its D rotor on the F loop (dependent, as the YBL-822G); casings Ø bore + 17.3, 2 × (bore/2 + 10.2) tall; thumb levers on a four-bar, 41.6° to a quarter turn **(linkage sizes laid out, not measured)** | [Bach-catalogue]; photographs |
| Loops | F: + 0.92 m (2.74 × (2^(5/12) − 1)); D: + 1.61 m with both, so the D valve's own + 0.69 | solved: 917 and 692 mm | arithmetic on the open tube |
| Mouthpieces | cups 25.4 (6½AL), 24.5 (12C), 27.0 (1½G); rims ≈ 38–39 outside; ≈ 80–88 long; shank taper ≈ 1:20 | the engine's cups, throats and shanks; rims 38.5 / 35 / 41; 84 / 80 / 90 long, 23 / 20 / 25 in the receiver | [Bach-mouthpieces] |
| Water key, braces, slide lock, cork barrels, counterweight | where the photographs show them (`tbn-conn70h-…`, `tbn-courtois-…`, `tbn-bach42g-…`) | laid out, not measured | photographs |
| Hold (the Orchestra) | the slide forward and down, the bell left of the face, the tuning slide over the left shoulder (`tbn-section-seated-usnavy-threequarter.jpg`, `tbn-player-standing-side-ksg9973.jpg`) | the lips at 1.16 m; the slide 21° down and 9° to the player's right; the whole rolled 26° | photographs |

## Tuba (contrabass tuba in C, four front-action pistons)

One plan for the 2D stage and the 3D model (`apps/web/src/ui/tuba-plan.ts`; `tuba-draw.ts`, `vector/tuba.ts`,
`gl/tuba3d.ts`), in metres, drawn from the makers' published figures rather than traced from a photograph:

| measure | here | sources |
|---|---|---|
| height to the rim | 0.97 m | Conn 52J/54J 0.93–0.97 m, Yamaha YCB-822 0.98 m, Miraphone 1291 0.95 m |
| bell | 0.48 m (19 in), a rolled bead | Conn 52J 19 in; YCB-822 and 54J 20 in (508 mm) |
| bore through the valves | 19 mm (0.748 in) | YCB-822 0.748–0.787 in; Conn 52J/54J 0.689 in; Miraphone 1291 0.748 in |
| open tube | 4.88 m (16 ft) | the CC tuba (Fletcher & Rossing 1998 §14.9); `TUBA_LENGTH` in the engine |
| valve loops | 0.290, 0.598, 0.923, 1.634 m | the open tube × (2^(k/12) − 1) for 1, 2, 3 and 5 semitones |
| casings | 33 mm across, 140 mm tall, 45 mm apart; 21 mm of travel | piston tubas' usual (a 0.75 in bore piston) |
| mouthpiece | 90 mm, rim 49 mm outside, a deep funnel | Conn Helleberg 120S |

The body is a flattened spiral, each lap wider than the last (11 mm at the main tuning slide to 110 mm at the
stack's foot); the bell a Bessel horn (r ∝ (d + 0.125 m)^−0.75) from the foot to the rim; the valve block stands
78 mm in front of the body's plane with its loops; the leadpipe goes round the front of the bell from the
mouthpiece beside it. The main slide's depth and each loop's reach are solved so that the open path is the
engine's 4.88 m and each valve alone adds its loop exactly (`apps/web/test/tuba2d.test.ts`); valves together
fall short of the note's tube, up to 10 % with all four, as a real tuba's do. In space the leadpipe is 0.2 m
longer than the plan's flat one (round the bell); the wave is laid along the plan's lengths
(`apps/web/test/tuba3d.test.ts`). No photograph was traced and none is kept; the layout is a schematic of
the front-action pattern (the laps nested in one plane, the fourth loop outside the body), not a copy of one
maker's wrap.

## Harp (concert grand pedal harp, 47 strings)

One plan for the 2D stage and the 3D model (`apps/web/src/ui/harp-plan.ts`; `harp-draw.ts`, `vector/harp.ts`,
`gl/harp3d.ts`), in metres, seen from its side as it stands, the column at the left and the player's place at
the right. Drawn from the makers' published measures of concert grand harps (the Lyon & Healy styles 23 and
30, the Salvi Diana: 1.85–1.88 m tall, about a metre from the column to the body's back, 35–37 kg), not traced
from a photograph:

| measure | here | note |
|---|---|---|
| height to the crown | 1.885 m | the column 1.83 m, 60 mm across |
| strings | 47, C1–G7 | the engine's own (`harpStrings`): 1.544 m to 66 mm; wire C1–B1, gut to B4, nylon above |
| spacing along the board | 17 mm in the bass to 12.6 mm at the top | |
| colours | every C red, every F dark, the wire strings bronze | as a harpist finds them |
| soundboard | rising from the base to the knee, 0.42 m wide at its foot (3D) | flat spruce; the box a tapering shell behind it |
| pedals | seven round the base's back: D C B at the left foot, E F G A at the right | three notches each, 14 mm apart: up flat, the middle natural, down sharp |
| discs | each string is stopped a semitone or two short of its top by its pedal | the string drawn from its stop |

Every string hangs plumb from the neck to the soundboard at the engine's length, so the strings' tops draw the
neck's harmonic curve by themselves: high at the column, swooping down, and up again a little at the knee
(`apps/web/test/harp2d.test.ts`). What moves is the engine's: each string swings as wide as the engine says it
does (the loudest few in their own shapes, the plucked triangle running out and back), each pedal stands in
the notch the engine has it in and travels when a note moves it (`apps/web/test/harp3d.test.ts`). No
photograph was traced and none is kept. Left out: the action's rods inside the column and the forked discs'
own shapes (each stop is a mark on its string), the carving of the crown and the base's feet.

## Glockenspiel (orchestra bells, thirty steel bars, G5–C8)

One plan for the 2D stage and the 3D model (`apps/web/src/ui/glock-plan.ts`; `glock-draw.ts`, `vector/glock.ts`,
`gl/glock3d.ts`), in metres, from above as its player sees it, the low bars at the left. Built from the
bars' own physics and the usual measures of an orchestral instrument, not traced from a photograph:

| measure | here | note |
|---|---|---|
| bars | 30, G5–C8, steel 31.75 × 9.5 mm (1¼ × ⅜ in) | the engine's own (`glockBars`) |
| lengths | 251 mm (G5) to 108 mm (C8) | from the pitch: f₁ = 1.028·h·√(E/ρ)/L², steel √(E/ρ) = 5050 m/s |
| rows | the naturals near the player, 35.75 mm apart; the accidentals behind, each between its neighbours | each row centred on one line, so both taper to the treble |
| supports | two felted rails a row, under the bars' nodes (0.224 of the length from each end); a pin through each node | the rails converge as the bars shorten |
| case | a trapezoid tray 0.70 × 0.52 m, 50 mm deep; in 3D on a folding stand, the bars 0.86 m above the floor | the far row 12 mm higher |
| mallets | two, a 28 mm head on a 0.3 m shaft | |

What moves is the engine's: a bar that rings is lit as far as the engine says it swings (in the vector style
its bending between its nodes is drawn across it), and each mallet is over the bar its hand last struck, down
on it at the stroke and up again within a fifth of a second (`apps/web/test/glock2d.test.ts`,
`glock3d.test.ts`). No photograph was traced and none is kept. Left out: the bars' cord or the pins' grommets,
the case's lid and latches, a damper pedal (orchestral bells have none).

## Reference photos

The photos are in `.cache/refs-3d/`, which is not committed. Full attributions are in `.cache/refs-3d/SOURCES.md`.
The double bass's are in `.cache/refs-bass/` (`bass/` below), the oboe's in `.cache/refs-oboe/` (`oboe/` below,
fetched from Wikimedia Commons' API, the 1920 px thumbnails), the clarinet's in `.cache/refs-clarinet/`
(`clarinet/` below, with its own `SOURCES.md`), the bassoon's in `.cache/refs-bassoon/photos/` (`bassoon/` below,
fetched from Wikimedia Commons' API, the original or its 1920 px thumbnail), the horn's in `.cache/refs-horn/photos/`
(`horn/` below, with its own `SOURCES.md`), the trombone's in `.cache/refs-trombone/photos/` (`trombone/` below, with
its own `SOURCES.md` and `DIMENSIONS.md`), also not committed.

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
| `bassoon/bassoon-fox-renard220-front.jpg` (`FoxBassoon.jpg`) | GFDL 1.2, Gregory F. Maxwell | a Fox Renard 220, full length, from the fingers' side and from the thumbs' side, white background: the outline, the joints and the keys' places were measured off it |
| `bassoon/bassoon-yamaha-yfg812-front.jpg` (`Yamaha_Bassoon_YFG-812_II.tif`) | CC BY-SA 4.0, Yamaha Corporation | YFG-812 II, full length, the thumbs' side, white background (the TIFF converted to JPEG at its 305 × 2027): the bell's bead ring, the varnish |
| `bassoon/bassoon-wlm-5687…5692.jpg` (`Wiki_loves_Music_-_Hamburg-5687…5692.jpg`) | CC BY-SA 4.0, Wuselig | a Yamaha bassoon taken apart, close up: the boot and its U-tube's cap, the flamed maple, the joints' rings |
| `bassoon/bassoon-001.jpg` (`Bassoon_001.jpg`) | CC BY 2.0, mark.drummer | a bassoon lying on a piano: the bell's bead ring, the bocal and reed |
| `bassoon/bassoon-heckel-bocal.jpg` (`Heckel_Biebrich_Bassoon_Bocal.jpg`) | CC BY 2.0, themusicgrove | a Heckel bocal: its curve, its cork |
| `bassoon/bassoon-thumb-keys.jpg`, `bassoon-finger-side.jpg`, `bassoon-boot-thumb-keys.jpg` | CC BY-SA 4.0, John Yesberg | a bassoon's left and right thumb keys, its finger holes, its hand rest and the right thumb's keys close up |
| `bassoon/bassoon-handrest-front.jpg`, `bassoon-handrest-behind.jpg` | CC BY-SA 4.0, Jeremy Visser | the hand rest from the front and behind |
| `bassoon/bassoon-reed-binding.jpg` (`Bassoon_reed_binding.jpg`) | CC BY-SA 3.0, Jeremy Visser | a bassoon reed's binding: the wires, the turban |
| `bassoon/bassoon-keys-diagram.png` (`Standard_Bassoon_Fingering_Keys_Diagram.png`) | CC BY-SA 3.0, 京市 | the keys by finger: their names and order |
| `horn/horn-besson-be702-back.png` (`French_horn_back.png`) | CC BY 2.5, BenP | a Besson BE702 Kruspe double horn from the player's side, white background: the layout was measured off it |
| `horn/horn-besson-be702-front.png` (`French_horn_front.png`) | CC BY 2.5, BenP | the same horn from the audience's side: the caps, the slides |
| `horn/horn-besson-be702-back-diagram.png` (`French_Horn_back.svg`) | CC BY-SA 3.0, Hk kng | the same horn drawn and numbered: leadpipe, hand rest, water key, change valve, levers, rotors, slides, F tubing, general slide, B♭ tubing, bell |
| `horn/horn-yamaha-yhr667v-front.png` (`Yamaha_Horn_YHR-667V.png`) | CC BY-SA 4.0, Yamaha Corporation | YHR-667V double horn, a product photograph: the bell, the spatulas and the lever axle's springs |
| `horn/horn-mouthpiece-denis-wick-7n.jpg` (`French_horn_mouthpiece.jpg`) | CC BY-SA 2.5, BenP | a Denis Wick 7N mouthpiece beside a mm rule |
| `horn/horn-player-bradac.jpg` (`KarlBradač.jpg`), `horn/horn-section.jpg` (`Orchestrahornsection.jpg`), `horn/horn-player-franganillo-1/2.jpg` | CC BY-SA 4.0, Dba488; CC BY 2.0, slgckgc; CC BY 2.0, Jorge Franganillo | players holding the horn: the hold |
| `horn/horn-on-parquet.jpg`, `horn-double-steiger.jpg`, `horn-buescher-400.jpg`, `horn-rotary-valve-parts.jpg` | CC BY-SA 3.0, Debianux; CC0, M. Steiger; CC BY-SA 4.0, Lisa19643; CC BY-SA 4.0, Berndt Meyer | other double horns; a rotary valve taken apart (rotor, caps, stop arm, stop plate) |
| `trombone/tbn-yamaha-ysl882or-tenor-f-openwrap-side.jpg`, `tbn-yamaha-ysl620-tenor-f-tradwrap-side.jpg`, `tbn-yamaha-ysl891z-tenor-straight-side.jpg` (`Yamaha_Tenor_trombone_YSL-882OR.tif`, `…YSL-620.tif`, `…YSL-891Z.tif`) | CC BY-SA 4.0, Yamaha Corporation | tenors with an open-wrap F attachment, a traditional one, and straight, side on: the layout and the lengths were measured off them |
| `trombone/tbn-yamaha-ybl822g-bass-side.jpg`, `tbn-yamaha-ysl871-alto-side.jpg` (`Yamaha_Bass_trombone_YBL-822_G_horizontal.tif`, `Yamaha_Alto_trombone_YSL-871_recrop.jpg`) | CC BY-SA 4.0, Yamaha Corporation | the bass (F and D, dependent) and the alto, side on |
| `trombone/tbn-yamaha-f-wrap-open-vs-traditional.jpg` | CC BY-SA 4.0, Samiclaus from Yamaha Corporation's | the open and the traditional F wraps side by side |
| `trombone/tbn-bach42g-rotary-valve-lever-bellbrace.jpg`, `tbn-conn70h-inner-slide-braces-lock.jpg`, `tbn-bell-rim-kruspe-garland.jpg` | CC BY 4.0, swisstbone.com (Daniel Alessi) | a Bach 42's rotor, thumb lever, link and bell brace; a Conn 70H's inner slide braces and lock; a bell's rim |
| `trombone/tbn-bach50b2l-bass-dependent-rotary-valves.jpg` | CC BY 4.0, Jonathan Harker | a Bach 50B2L's two dependent rotors and levers |
| `trombone/tbn-rath-r4-openwrap-valve-lever.jpg` | CC BY 4.0, Jonathanischoice | a Rath R4's open wrap and thumb lever |
| `trombone/tbn-courtois-slide-crook.jpg` | CC BY 4.0, Samntrombone | a slide's crook and its end boss |
| `trombone/tbn-mouthpiece-schilke-51c4-side.jpg` | CC BY-SA 3.0, Dhscommtech | a trombone mouthpiece, side on |
| `trombone/tbn-player-standing-side-ksg9973.jpg`, `tbn-section-seated-usnavy-threequarter.jpg` | CC BY-SA 3.0, Petra Klawikowski; public domain, U.S. Navy | players holding it: the hold |

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
[Wikipedia-bassoon]: https://en.wikipedia.org/wiki/Bassoon
[NMM-5893]: https://emuseum.nmmusd.org/objects/5893/bassoon-c
[WFG-bassoon]: https://www.wfg.woodwind.org/bassoon/basn_bas_1.html
[Yamaha-YFG812]: https://commons.wikimedia.org/wiki/File:Yamaha_Bassoon_YFG-812_II.tif
[Fletcher-Rossing]: https://doi.org/10.1007/978-0-387-21603-4
[Conn-8D]: https://connselmer.com/instruments/horns/conn-connstellation-double-horn-in-f-bb-8d
[Holton-H179]: https://connselmer.com/print/holton-farkas-double-horn-in-f-bb-h179
[Hoyer-6801]: https://www.towsa.com/wp-content/uploads/2018/08/tubas-french-horns-hans-hoyer-catalogo.pdf

[Bach-catalogue]: https://gmedia.gewamusic.com/external/file/media/get/38257.pdf
[Thomann-88H]: https://www.thomannmusic.com/c_g.conn_88hnv_bb_f_trombone.htm
[Yamaha-YSL871]: https://au.yamaha.com/en/products/musical_instruments/winds/trombones/ysl-872_871/specs.html
[Yamaha-YBL822G]: https://usa.yamaha.com/products/musical_instruments/winds/trombones/ybl-822g/specs.html
[Wikipedia-bass-trombone]: https://en.wikipedia.org/wiki/Bass_trombone
[Votaw-crook]: https://votawtool.com/collections/trombone-1
[Pressbooks-trombone]: https://pressbooks.palni.org/brasstechniquesandpedagogy/chapter/the-trombone/
[Yamaha-making]: https://www.yamaha.com/en/musical_instrument_guide/trombone/manufacturing/manufacturing003.html
[Bach-mouthpieces]: https://www.mouthpieceexpress.com/

### Timpani (Wikimedia Commons)
* Moreau1, *Ludwig Professional timpani 01* — public domain (PD-self): https://commons.wikimedia.org/wiki/File:Ludwig_Professional_timpani_01.jpg
* Eric Pancer, *Lefima Timpani* (Utah Symphony) — CC BY 2.0: https://commons.wikimedia.org/wiki/File:Lefima_Timpani.jpg
* Jorge Royan, *Munich – A standard set of timpani* — CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:Munich_-_A_standard_set_of_timpani_Percussion_-_5647.jpg
* sheila miguez, *Civic Orchestra of Chicago Timpani* — CC BY-SA 2.0: https://commons.wikimedia.org/wiki/File:Civic_Orchestra_of_Chicago_Timpani.jpg
* Skoch3, *Timpani, Yamaha pedal timpani* (the mechanism underneath) — CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:Timpani,_Yamaha_pedal_timpani.jpg
* ZooFari, *Timpani Mallets* — public domain: https://commons.wikimedia.org/wiki/File:Timpani_Mallets.JPG
* John Tafoya, *Dresden pedal* and *Timpani tuning gauges* — CC BY-SA 3.0 / GFDL: https://commons.wikimedia.org/wiki/File:Dresden_pedal.jpg, https://commons.wikimedia.org/wiki/File:Timpani_tuning_gauges.jpg

### Trombone, 2D (Wikimedia Commons; in `.cache/refs-trombone-2d/`, not committed)
* Yamaha Corporation, *Yamaha Tenor trombone YSL-620* — CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Yamaha_Tenor_trombone_YSL-620.tif
* Yamaha Corporation, *Yamaha Tenor trombone YSL-891Z (re-crop)* — CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Yamaha_Tenor_trombone_YSL-891Z_(re-crop).jpg
* Yamaha Corporation, *Yamaha Bass trombone YBL-830 horizontal* — CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Yamaha_Bass_trombone_YBL-830_horizontal.tif
* Yamaha Corporation, *Yamaha Alto trombone YSL-871 recrop* — CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Yamaha_Alto_trombone_YSL-871_recrop.jpg
* Samiclaus (collage of Yamaha's), *Yamaha Trombone comparison of open and traditional wrap* — CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Yamaha_Trombone_comparison_of_open_and_traditional_wrap.jpg
* www.swisstbone.com, *Greenhoe-Bach-42G-4* (the F rotor and its trigger) — CC BY 4.0: https://commons.wikimedia.org/wiki/File:Greenhoe-Bach-42G-4.jpg
* Jonathan Harker, *Rotary valves (dependent) on bass trombone* — CC BY 4.0: https://commons.wikimedia.org/wiki/File:Rotary_valves_(dependent)_on_bass_trombone.jpg
* Jonathan Harker, *Trombone family composite 2* — CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Trombone_family_composite_2.jpg
