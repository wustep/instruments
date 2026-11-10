// The 3D stage's materials, physically based (three.js MeshPhysicalMaterial): each of the shared
// surfaces in `mesh.ts` (by name) becomes a layered material — clearcoat over the lacquer, the
// varnish and the brass; sheen on felt and hair; anisotropic steel; iridescent pearl — and the
// woods get solid textures computed in the shader from each part's own coordinates (spruce grain,
// flamed maple whose stripes flip light/dark with the viewing angle, ebony, maple fleck), with
// micro-variation in roughness everywhere. A violin's plates carry their own painted maps
// (varnish, purfling, edge wear; the f-holes cut through), drawn once on a canvas.
//
// Every material also takes two live inputs: a per-instance glow (rgb, amount: keys, hammers, the
// bow).
//
// In a section (a piano key's action close up: the renderer gives every material the cut's plane) the
// parts are cut open, and a part is a hollow shell. Where the eye sees into one (a back face), the
// shader draws what the cut would show instead: a flat face in the plane of the cut, of the part's own
// stuff (end grain or long grain for wood, by its grain axis; the wood under a case's lacquer and a
// key's facing; felt; cut metal), evenly lit. So the cut parts read as solid. It is drawn where the
// shell's inner wall is, not in the cut's plane, so what stands inside a part would show in front of
// it; the long parts that run across the keyboard (rails, keybed, pin block) therefore carry cross-walls
// at every key's boundary, drawn as that face a millimetre behind the cut (piano3d.ts `webs`).
import * as THREE from 'three';
import { MAT_LIST, type Mat, type PaintSpec } from './mesh.ts';


type Phys = THREE.MeshPhysicalMaterialParameters & {
  /** solid texture: 0 none, 1 spruce, 2 flamed maple, 3 plain wood, 4 ebony, 5 cast iron, 6 felt, 7 maple fleck, 8 brushed,
   *  9 gold-lacquered casting, 10 veneer round a wall,
   *  11 flamed maple worn per vertex (uv.x: varnish rubbed through to the pale wood, satin; uv.y: grime),
   *  and a piano action's own: 12 pressed wool felt (fibres, nap), 13 a key stick's bare spruce, 14 hornbeam,
   *  15 beech, 16 hard maple, 17 a white key (its facing; bare wood on its sides below it), 18 a turned joint of
 *  flamed maple under a stained varnish (a bassoon's: the flame round the joint, in drifts), 19 lacquered
 *  brass, handled (uv.y: fingerprints in the coat) */
  tex?: number;
  /** the grain/long axis in the part's own frame */
  axis?: [number, number, number];
  /** the scale of the texture (1 = a violin's) */
  texScale?: number;
  /** what a section shows where it cuts the part open (a piano key's close-up): 0 the colour, flat;
   *  1 wood (end grain across the grain axis, long grain along it); 2 felt; 3 cut metal; 4 a key top
   *  (a white facing over the key's wood). Default: by the texture. */
  cap?: number;
  /** the cut face's colour (default: the part's own, a little darker) */
  cut?: string;
};

/** cut faces (a section): the laminated maple and spruce under a case's lacquer; grey cast iron */
const CORE = '#c4a57a';
const IRON = '#7d7872';
/** how brightly a section's cut faces are lit (they all face the open side, so the same for all): set
 *  by the renderer from its key light */
export const SECTION = { light: { value: 0.6 } };

const P: Record<string, Phys> = {
  // (cut open, a lacquered case part shows the wood under its lacquer: `cut`, CORE)
  lacquer: { color: '#050505', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.7, tex: 0, cap: 1, cut: CORE },
  lacquerSatin: { color: '#0a0909', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22, cap: 1, cut: CORE },
  caseInner: { color: '#1d140e', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, tex: 3, axis: [1, 0, 0], texScale: 3, cut: CORE },
  // the plate: gold-bronze lacquer over cast iron (a lacquered paint, not bare metal)
  plate: { color: '#b98a3c', metalness: 0.55, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, tex: 5, cap: 3, cut: IRON },
  spruce: { color: '#d8b175', roughness: 0.48, clearcoat: 0.55, clearcoatRoughness: 0.18, tex: 1, axis: [0.42, 0, 0.91], texScale: 2.2 },
  spruceBare: { color: '#d9b77e', roughness: 0.62, tex: 1, axis: [0, 0, 1], texScale: 1.5 },
  maple: { color: '#b88654', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, tex: 7, axis: [1, 0, 0], texScale: 1.5 },
  // A piano action's woods, each its own (seen a hand's width away in a key's close-up; matched by eye
  // to grand-action-side.jpg and upright-action-close.jpg, docs/3d-reference.md):
  //   hornbeam — wippens, jacks, repetition levers, shanks, flanges: pale, greyish cream, close and
  //     even with no ring lines to speak of, burnished to a low satin;
  //   key sticks — spruce (or basswood), bare: straw yellow, straight latewood lines along the stick;
  //   rails and levers — hard maple under a thin finish: golden, its rays as fine flecks;
  //   an upright's rails — beech (`railBeech`, below): pinkish, its rays as short dark dashes.
  hornbeam: { color: '#e4d3b3', roughness: 0.5, specularIntensity: 0.7, tex: 14, axis: [0, 0, 1], texScale: 1 },
  keyWood: { color: '#dcc394', roughness: 0.8, specularIntensity: 0.5, tex: 13, axis: [0, 0, 1], texScale: 1 },
  actionWood: { color: '#bb9163', roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5, tex: 16, axis: [1, 0, 0], texScale: 1 },
  // The felts: pressed wool, matte, no gloss at all — a fibre field (mottle and relief) under a soft
  // sheen at grazing angles, each its own colour (hammer felt a warm off-white, the dampers' whiter,
  // the cloths dyed).
  hammerFelt: { color: '#ebe1cb', roughness: 1, specularIntensity: 0.15, sheen: 1, sheenColor: '#fff8ea', sheenRoughness: 0.6, tex: 12 },
  damperFelt: { color: '#e0ddd6', roughness: 1, specularIntensity: 0.15, sheen: 0.9, sheenColor: '#ffffff', sheenRoughness: 0.6, tex: 12 },
  redFelt: { color: '#84201c', roughness: 1, specularIntensity: 0.15, sheen: 1, sheenColor: '#d0605a', sheenRoughness: 0.5, tex: 12 },
  buckskin: { color: '#b39876', roughness: 0.95, specularIntensity: 0.3, sheen: 0.6, sheenColor: '#e8d8bf', sheenRoughness: 0.7, tex: 12, texScale: 0.6 },
  ivory: { color: '#f2ece0', roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.12, sheen: 0.25, sheenColor: '#fff6e0', sheenRoughness: 0.4 },
  ebony: { color: '#0d0b0a', roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.2, tex: 4, axis: [0, 0, 1] },
  steel: { color: '#d4d7dc', metalness: 1, roughness: 0.2, anisotropy: 0.6, tex: 8 },
  darkSteel: { color: '#6a6d72', metalness: 1, roughness: 0.38, tex: 8 },
  nickel: { color: '#dddcd6', metalness: 1, roughness: 0.1 },
  copper: { color: '#c4794a', metalness: 1, roughness: 0.3, anisotropy: 0.5, tex: 8 },
  brass: { color: '#e6bb62', metalness: 1, roughness: 0.14, clearcoat: 0.8, clearcoatRoughness: 0.04 },
  brassGlow: { color: '#e6bb62', metalness: 1, roughness: 0.14, clearcoat: 0.8, clearcoatRoughness: 0.04 },
  brassDull: { color: '#c19b58', metalness: 1, roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.2 },
  silver: { color: '#ebebeb', metalness: 1, roughness: 0.07 },
  silverGlow: { color: '#ebebeb', metalness: 1, roughness: 0.07 },
  pad: { color: '#ece1c6', roughness: 0.75, sheen: 0.6, sheenColor: '#fff5e0', sheenRoughness: 0.5 },
  pearl: { color: '#f6f1ea', roughness: 0.16, clearcoat: 0.6, clearcoatRoughness: 0.08, iridescence: 0.9, iridescenceIOR: 1.35, iridescenceThicknessRange: [220, 620] },
  castAction: { color: '#8a8985', metalness: 0.85, roughness: 0.45, tex: 5, cap: 3, cut: IRON },
  // varnish: a glossy coat over matte wood (the coat carries the reflections)
  varnish: { color: '#9a4518', roughness: 0.62, clearcoat: 0.75, clearcoatRoughness: 0.18, tex: 2, axis: [1, 0, 0] },
  varnishTop: { color: '#a85a26', roughness: 0.64, clearcoat: 0.75, clearcoatRoughness: 0.18, tex: 1, axis: [1, 0, 0], texScale: 1 },
  varnishDark: { color: '#5c2208', roughness: 0.64, clearcoat: 0.75, clearcoatRoughness: 0.2, tex: 2, axis: [1, 0, 0] },
  fEdge: { color: '#2a1206', roughness: 0.6 },
  hole: { color: '#050302', roughness: 1 },
  fittings: { color: '#100c0a', roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.2, tex: 4, axis: [1, 0, 0] },
  bridgeMaple: { color: '#dec59a', roughness: 0.62, tex: 7, axis: [0, 1, 0], texScale: 0.5 },
  pernambuco: { color: '#5e2711', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.08, tex: 3, axis: [1, 0, 0], texScale: 0.5 },
  bowHair: { color: '#cfc8ba', roughness: 0.6, sheen: 0.5, sheenColor: '#f0ece4', sheenRoughness: 0.45 },
  rosewood: { color: '#34170c', roughness: 0.48, clearcoat: 0.18, clearcoatRoughness: 0.35, tex: 3, axis: [1, 0, 0], texScale: 0.4 },
  boxwood: { color: '#d9b878', roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.15, tex: 3, axis: [1, 0, 0], texScale: 0.4 },
  gut: { color: '#2a2420', roughness: 0.5 },
  interior: { color: '#2a160b', roughness: 0.92, envMapIntensity: 0.18 },
  rubber: { color: '#151413', roughness: 0.85 },
  leather: { color: '#2b1a12', roughness: 0.75, sheen: 0.4, sheenColor: '#806050', sheenRoughness: 0.6 },
  silk: { color: '#b0281e', roughness: 0.6, sheen: 1, sheenColor: '#ff8a70', sheenRoughness: 0.4 },
  silkGold: { color: '#c9962a', roughness: 0.6, sheen: 1, sheenColor: '#ffe0a0', sheenRoughness: 0.4 },
  stringSteel: { color: '#c9ccd2', metalness: 1, roughness: 0.24, anisotropy: 0.7, tex: 8 },
  stringWound: { color: '#a7a9ad', metalness: 1, roughness: 0.3, anisotropy: 0.8, tex: 8 },
  floor: { color: '#13110e', roughness: 0.7 },
  // winds3d: polished sterling silver and nickel silver read in a dark studio through their
  // reflections, so the environment counts for more (a product shot's big white cards); the lacquer
  // is a clear coat over polished yellow brass (no texture: a polished part shows no grain)
  silverPolish: { color: '#f3f3f1', metalness: 1, roughness: 0.2, envMapIntensity: 1.6, tex: 8, axis: [0, 1, 0] },
  boreDark: { color: '#2e2e2c', metalness: 1, roughness: 0.4, envMapIntensity: 0.35 },
  brassLacquer: { color: '#f6d382', metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.6 },
  nickelSilver: { color: '#e4e2db', metalness: 1, roughness: 0.18, envMapIntensity: 1.5, tex: 8, axis: [0, 1, 0] },
  valveFelt: { color: '#4d1c15', roughness: 1, sheen: 0.8, sheenColor: '#a0584a', sheenRoughness: 0.6, tex: 6 },
  cork: { color: '#a98458', roughness: 0.92, tex: 6 },
  // the valve buttons' mother-of-pearl: a satin coat (a mirror-sharp coat on a small dome made a
  // hot spot the bloom turned into a fog)
  pearlInlay: { color: '#f2ede4', roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.22, iridescence: 0.8, iridescenceIOR: 1.35, iridescenceThicknessRange: [220, 620] },
  // the valve caps' faces: satin, as most are (and a polished dome facing the key light blooms)
  nickelSatin: { color: '#e0ded7', metalness: 1, roughness: 0.32, envMapIntensity: 1.5, tex: 8, axis: [1, 0, 0] },
  // the flute's keys, rings and fittings and the mouthpiece: polished, without the drawn tube's grain
  silverKeys: { color: '#f3f3f1', metalness: 1, roughness: 0.19, envMapIntensity: 1.6 },
  // pianos: the plate is lacquered metal-flake paint over cast iron (a thin, slightly rough coat; a
  // heavy clearcoat would wash it to cream under the softbox). Its colour is matched to grand-inside.jpg,
  // whose lit plate averages sRGB ≈ (130–160, 100–125, 70–85): a dark, warm bronze-gold. The flake
  // finish scatters (rough), so a broad flange takes the overhead softbox as a sheen, not a mirror
  // (lead, after merging: as metal (metalness 1) the plate went white towards grazing angles in the
  // hero; gold plate paint is mostly diffuse — metal flake in a lacquer — so mostly diffuse here)
  pianoPlate: { color: '#9a6c26', metalness: 0.35, roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.75, tex: 5, cap: 3, cut: IRON },
  underfelt: { color: '#5c1418', roughness: 1, specularIntensity: 0.15, sheen: 0.9, sheenColor: '#b04048', sheenRoughness: 0.5, tex: 12 },
  greenFelt: { color: '#1f4a36', roughness: 1, specularIntensity: 0.15, sheen: 0.8, sheenColor: '#5a9a7a', sheenRoughness: 0.5, tex: 12 },
  bracketCast: { color: '#7a6e4c', metalness: 0.85, roughness: 0.42, tex: 5, cap: 3, cut: IRON },
  // (the upright's hammer mouldings: a brown hardwood, less red than it was: upright-action-close.jpg)
  mahogany: { color: '#7c4b2e', roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.35, tex: 3, axis: [0, 1, 0], texScale: 0.5 },
  // (cut open: a white facing, 2.5 mm, over the key's own wood)
  keyIvory: { color: '#f1ece0', roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.1, sheen: 0.4, sheenColor: '#fff4dc', sheenRoughness: 0.35, tex: 17, cap: 4, cut: '#d2b98c' },
  // a key's lead weights: dull grey (as polished steel they mirrored the dark studio: black holes)
  lead: { color: '#8d8e90', metalness: 0.55, roughness: 0.6, cap: 3 },
  // the action's wires (damper wires, backcheck wires): drawn steel, a satin grey. Polished, a row of
  // them a pixel or two wide flared to white under the close-up's key light
  wire: { color: '#8e9197', metalness: 1, roughness: 0.42 },
  // tuning pins: nickel-plated, turned (a satin finish: hundreds of mirror caps read as fog)
  pinSteel: { color: '#d2d5da', metalness: 1, roughness: 0.3, tex: 8, axis: [0, 1, 0] },
  // the raw, dark inside of a case (black-stained, unpolished)
  caseRaw: { color: '#151210', roughness: 0.85, envMapIntensity: 0.3, cap: 1, cut: CORE },
  // the upright's action (upright-action-close.jpg: natural beech rails, white cotton bridle tapes,
  // red leather on the bridle wires)
  railBeech: { color: '#d6b188', roughness: 0.6, specularIntensity: 0.6, tex: 15, axis: [1, 0, 0], texScale: 1 },
  tape: { color: '#eee9de', roughness: 1, sheen: 0.7, sheenColor: '#ffffff', sheenRoughness: 0.6, tex: 6 },
  bridleLeather: { color: '#b0261f', roughness: 0.75, sheen: 0.4, sheenColor: '#e06050', sheenRoughness: 0.5 },
  // the violin family's neck, scroll and ribs: the varnish worn per vertex (strings3d.ts) — the neck's
  // back rubbed bare by the hand, the scroll's chamfers and crown pale, grime in its hollows and throat
  varnishWorn: { color: '#9a4518', roughness: 0.62, clearcoat: 0.75, clearcoatRoughness: 0.18, tex: 11, axis: [1, 0, 0] },
  // the grand's plate (grand-only; the upright keeps pianoPlate): gold lacquer, mostly metal flake, so
  // its highlights stay gold. Fitted at the grand's default hero view to grand-inside.jpg's lit plate,
  // sRGB ≈ (130–160, 100–125, 70–85): with less metal or a gloss coat the flange's highlights are the
  // white of the studio's softbox, and the tone mapper desaturates the over-bright plate to champagne
  grandPlate: { color: '#8a6522', metalness: 0.9, roughness: 0.62, tex: 9, cap: 3, cut: IRON },
  // the inside of the grand's rim: a polished mahogany veneer under a gloss coat (grand-inside.jpg)
  rimVeneer: { color: '#3a1a0c', roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06, tex: 10, cut: CORE },
  // grand damper heads: black-stained hardwood (grand-inside.jpg, grand-action-side.jpg)
  damperHead: { color: '#0f0d0c', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2, tex: 4, axis: [0, 0, 1], cut: CORE },
  // the grand's tuning pins: bright nickel, satin enough to take the overhead softbox on every head
  // (as polished pins they mirrored the dark studio and read as a grey carpet)
  pinNickel: { color: '#e8e8e6', metalness: 1, roughness: 0.48, tex: 8, axis: [0, 1, 0] },
  // the grand's bridge caps: maple blackened with graphite where the strings bear
  bridgeCap: { color: '#3a2a1c', roughness: 0.5, metalness: 0.15, tex: 7, axis: [1, 0, 0], texScale: 1.5 },
  // the flute's pads: a white skin over felt, a soft satin sheen (winds3d.ts)
  padSkin: { color: '#f2efe7', roughness: 0.6, sheen: 0.5, sheenColor: '#ffffff', sheenRoughness: 0.45, tex: 6 },
  // the trumpet (winds3d.ts): knurled nickel (the fine ridges scatter the light into a satin grey band,
  // trumpet-valves.jpg); the buttons' mother-of-pearl, greyer and more iridescent than the inlay white;
  // the bell, burnished under its lacquer (a sharper coat); the valve casings' lacquer, handled (a
  // faint mottle of wear and fingerprints under the coat)
  nickelKnurl: { color: '#c9c7c0', metalness: 1, roughness: 0.44, envMapIntensity: 1.15, tex: 8, axis: [0, 1, 0] },
  pearlButton: { color: '#bdb5aa', roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.14, iridescence: 1, iridescenceIOR: 1.4, iridescenceThicknessRange: [250, 700], sheen: 0.3, sheenColor: '#ffe6ee', sheenRoughness: 0.4 },
  brassBell: { color: '#f4d07e', metalness: 1, roughness: 0.13, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.6 },
  brassHandled: { color: '#f3d283', metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 1.55, tex: 5 },
  // the slides' inner tubes where they show: nickel silver, drawn and worn satin by the slide
  nickelDrawn: { color: '#dedcd5', metalness: 1, roughness: 0.3, envMapIntensity: 1.4, tex: 8, axis: [0, 1, 0] },
  // the oboe (oboe3d.ts). Grenadilla: near black, a deep brown-violet where the light catches it, its
  // faint streaks along the tube (the ebony texture), oiled and polished (a thin, fairly sharp coat:
  // oboe-yamaha-side.jpg's highlights run the length of each joint as soft bands)
  grenadilla: { color: '#241e1f', roughness: 0.4, clearcoat: 0.75, clearcoatRoughness: 0.13, tex: 4, axis: [0, 1, 0], texScale: 0.6 },
  grenadillaX: { color: '#241e1f', roughness: 0.4, clearcoat: 0.75, clearcoatRoughness: 0.13, tex: 4, axis: [1, 0, 0], texScale: 0.6 },
  // the reed: Arundo donax cane, its bark glossy golden; the scraped tip and heart paler and matte,
  // fibres along the reed (oboe-reeds.jpg); the binding thread, nylon with a sheen
  cane: { color: '#ddb865', roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.18, sheen: 0.25, sheenColor: '#fff0c8', sheenRoughness: 0.5, tex: 3, axis: [1, 0, 0], texScale: 0.25 },
  caneScraped: { color: '#e6cd92', roughness: 0.62, sheen: 0.5, sheenColor: '#fff6dc', sheenRoughness: 0.5, tex: 3, axis: [1, 0, 0], texScale: 0.25 },
  reedThread: { color: '#2f6542', roughness: 0.5, sheen: 1, sheenColor: '#9ae6b8', sheenRoughness: 0.35, tex: 6 },
  // the clarinet (clarinet3d.ts): the mouthpiece's hard rubber, a near-black with a faint warm cast,
  // satin-polished (a broad, soft highlight, not the wood's sharp clearcoat), no grain
  ebonite: { color: '#100e0e', roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.28, specularIntensity: 0.8 },
  // the bassoon (bassoon3d.ts): flamed maple stained a deep red-brown under a thick, hard varnish (a
  // clearcoat that carries the studio's reflections as long bands down each joint), its flame as fine
  // stripes across the joint, 3–5 mm apart, that turn light and dark as the eye moves (bassoon-wlm-*.jpg,
  // bassoon-fox-renard220-front.jpg); the bell's bead ring, an ivory-like plastic with a soft polish
  bassoonMaple: { color: '#8c2410', roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.045, envMapIntensity: 1.25, tex: 18, axis: [0, 1, 0], texScale: 0.34 },
  bellBead: { color: '#efe8d8', roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: '#fff8e8', sheenRoughness: 0.4 },
  // the horn (horn3d.ts): yellow brass under a clear lacquer, as the trumpet's, with the lacquer's own
  // slow unevenness and, where hands hold it (uv.y: the leadpipe under the left hand, the bell's throat
  // in the right, the finger hook), fingerprints: smudges that dull the coat and roughen it, their
  // ridges showing only in the highlights
  hornBrass: { color: '#f4d17f', metalness: 1, roughness: 0.17, clearcoat: 1, clearcoatRoughness: 0.09, envMapIntensity: 1.6, tex: 19 },
  // the timpani (timpani3d.ts): copper raised and planished by hand, every blow a shallow facet, under a
  // clear lacquer (20: the facets in the normal, the metal's colour drifting a little between them); a
  // Mylar head, milky and satin, a faint sheen across it; chrome; black stove enamel over a casting
  copperHammered: { color: '#d4865a', metalness: 1, roughness: 0.15, clearcoat: 0.85, clearcoatRoughness: 0.06, envMapIntensity: 1.7, tex: 20 },
  mylar: { color: '#ddd5c3', roughness: 0.5, specularIntensity: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0.4, sheenColor: '#fff6e6', sheenRoughness: 0.55 },
  chrome: { color: '#eceef2', metalness: 1, roughness: 0.07, envMapIntensity: 1.6 },
  frameBlack: { color: '#121212', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25, tex: 5 },
  rubberGrip: { color: '#191918', roughness: 0.82, tex: 6 },
};

// GLSL: hashes, value noise and fbm (all in the part's own metres)
const NOISE = /* glsl */ `
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// a hammered surface's facets (cellular): x the dish's height at p (0 at its centre, rising to its rim),
// y a value per facet
vec2 hammerCell(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  float d1 = 9.0; float id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 c = g + vec3(h13(i + g), h13(i + g + 7.7), h13(i + g + 3.1)) * 0.8 + 0.1 - f;
    float d = dot(c, c);
    if (d < d1) { d1 = d; id = h13(i + g + 1.9); }
  }
  return vec2(d1, id);
}
`;

/** the textures that are wood (their cut faces show grain) */
const WOODS = [1, 2, 3, 4, 7, 10, 11, 13, 14, 15, 16, 18];
/** one material per shared Mat (by object), built on first use */
const cache = new Map<Mat, THREE.Material>();
/** the studio environment. three (r186) replaces a material's envMapIntensity with the scene's
 *  environmentIntensity unless the material has an envMap of its own, so the materials that set
 *  an intensity (the winds' metals 1.4–1.6, the bores, the f-holes' and the case's insides
 *  0.18–0.35, the upright's plate 0.75) are given the environment itself to have it honoured */
let envTex: THREE.Texture | null = null;
export function setEnvironment(t: THREE.Texture | null): void {
  envTex = t;
}
const textures: THREE.Texture[] = [];

export function materialFor(m: Mat, lite: boolean): THREE.Material {
  let mat = cache.get(m);
  if (mat) return mat;
  const name = m.name ?? 'plain';
  const base = P[name] ?? { color: new THREE.Color().setRGB(m.col[0], m.col[1], m.col[2], THREE.SRGBColorSpace), roughness: m.rough, metalness: m.metal };
  const { tex = 0, axis = [1, 0, 0], texScale: texScale0 = 1, cap: cap0, cut, ...params } = base;
  // (a part may scale its family's texture: a double bass's flame is broader than a violin's)
  const texScale = m.texScale ?? texScale0;
  const metal = (params.metalness ?? 0) >= 0.5;
  const cap = cap0 ?? (WOODS.includes(tex) ? 1 : tex === 6 || tex === 12 ? 2 : metal ? 3 : 0);
  const pm = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, ...params });
  if (params.envMapIntensity !== undefined && envTex) pm.envMap = envTex;
  if (m.tint) pm.color.setRGB(m.col[0], m.col[1], m.col[2], THREE.SRGBColorSpace);
  if (pm.anisotropy) pm.anisotropyRotation = 0;
  const kind = m.kind ?? 0;
  const paint = m.paint;
  let map: THREE.Texture | null = null;
  let aux: THREE.Texture | null = null;
  if (paint && typeof document !== 'undefined') {
    const painted = paintMaps(paint, lite);
    map = painted.map;
    aux = painted.aux;
    pm.map = map;
    // the cut-outs (f-holes): alpha to coverage, so their edges are antialiased by the multisampling.
    // Cut at half coverage: there the edge runs smoothly between the map's texels (at 0.02 it ran round
    // the outside of every texel the hole touched, in steps, wherever the map was magnified)
    if (paint.cut) {
      pm.alphaTest = 0.5;
      pm.alphaToCoverage = true;
    }
    pm.color.set('#ffffff');
  }
  pm.onBeforeCompile = (sh) => {
    sh.uniforms.uAxis = { value: new THREE.Vector3(...axis).normalize() };
    sh.uniforms.uTexScale = { value: texScale };
    // (the cut face: its own colour, or the part's, a little darker as sawn wood and sheared felt are)
    sh.uniforms.uCut = { value: cut ? new THREE.Color(cut) : pm.color.clone().multiplyScalar(cap === 3 ? 1 : 0.85) };
    sh.uniforms.uCapLight = SECTION.light;
    // (each wood its own rings on a cut face: where its pith lies, and how close they are)
    let hsh = 0;
    for (let i = 0; i < name.length; i++) hsh = (hsh * 31 + name.charCodeAt(i)) % 9973;
    sh.uniforms.uCapSeed = { value: new THREE.Vector3(0.12 + 0.5 * ((hsh % 97) / 97), -0.45 + 0.9 * ((hsh % 89) / 89), 0.75 + 0.6 * ((hsh % 83) / 83)) };
    if (aux) sh.uniforms.tAux = { value: aux };
    if (paint) sh.uniforms.uRect = { value: new THREE.Vector4(...paint.rect) };
    sh.defines = { ...(sh.defines ?? {}), TEX: tex, KIND: kind, PAINTED: paint ? 1 : 0, CAP: cap };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 iGlow; attribute vec3 aLoc;
varying vec4 vGlow; varying vec3 vLoc; varying vec3 vAxisV; varying vec2 vUv2;
uniform vec3 uAxis;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vGlow = iGlow; vLoc = aLoc; vUv2 = uv;
{
  vec4 ax = vec4(uAxis, 0.0);
  #ifdef USE_INSTANCING
  ax = instanceMatrix * ax;
  #endif
  vAxisV = normalize((modelViewMatrix * ax).xyz);
}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec4 vGlow; varying vec3 vLoc; varying vec3 vAxisV; varying vec2 vUv2;
uniform vec3 uAxis; uniform float uTexScale; uniform vec3 uCut; uniform float uCapLight; uniform vec3 uCapSeed;
#if PAINTED
uniform sampler2D tAux; uniform vec4 uRect;
#endif
${NOISE}
// a basis across the grain
vec3 crossAxis(vec3 a) { return normalize(abs(a.y) < 0.9 ? cross(a, vec3(0, 1, 0)) : cross(a, vec3(1, 0, 0))); }`,
      )
      .replace(
        '#include <map_fragment>',
        `// a dissolving part (a piano's case being hidden): glow alpha 2 + visibility
if (vGlow.a > 1.5) {
  float keep = vGlow.a - 2.0;
  if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= keep) discard;
}
#if PAINTED
vec2 pUV = vec2((vLoc.x - uRect.x) / (uRect.z - uRect.x), (vLoc.z - uRect.y) / (uRect.w - uRect.y));
vec4 texelColor = texture2D(map, pUV);
diffuseColor *= texelColor;
vec4 auxT = texture2D(tAux, pUV);
#else
#include <map_fragment>
#endif
float microR = 0.0;
float wearCoat = 0.0;
{
  vec3 p = vLoc / uTexScale;
  vec3 A = normalize(uAxis);
  vec3 Bx = crossAxis(A);
  vec3 Cx = cross(A, Bx);
  float along = dot(p, A);
  float across = dot(p, Bx);
  float depth = dot(p, Cx);
  #if TEX == 1
  // spruce: dark latewood lines along the grain, ~1.2 mm apart, wavering a little
  float w = fbm(vec3(along * 6.0, across * 60.0, depth * 60.0));
  float g = fract(across * 750.0 + w * 2.2);
  float late = smoothstep(0.62, 0.86, g) * (1.0 - smoothstep(0.9, 1.0, g));
  diffuseColor.rgb *= 1.0 - 0.22 * late - 0.06 * (w - 0.5);
  microR = 0.12 * late;
  #elif TEX == 2
  // flamed maple: stripes across the grain whose brightness flips with the viewing angle
  float n = fbm(vec3(along * 12.0, across * 30.0, depth * 30.0));
  float f = sin(along * 520.0 + n * 9.0 + across * 90.0);
  float fl = smoothstep(-0.2, 0.9, f) * (0.6 + 0.8 * n);
  float vdir = dot(normalize(vViewPosition), normalize(vAxisV));
  diffuseColor.rgb *= 1.0 + 0.32 * fl * clamp(vdir * 3.0, -1.0, 1.0) - 0.05;
  diffuseColor.rgb *= 0.92 + 0.16 * fbm(p * 18.0);
  #elif TEX == 3
  // plain wood: fine grain lines and a slow colour drift
  float w = fbm(vec3(along * 4.0, across * 80.0, depth * 80.0));
  float g = fract(across * 420.0 + w * 3.0);
  diffuseColor.rgb *= 0.9 + 0.12 * w - 0.1 * smoothstep(0.75, 0.95, g);
  #elif TEX == 4
  // ebony: near black with a faint, slightly lighter streak
  float w = fbm(vec3(along * 20.0, across * 300.0, depth * 300.0));
  diffuseColor.rgb *= 0.75 + 0.6 * w * w;
  microR = 0.1 * w;
  #elif TEX == 5
  // cast iron under bronze lacquer: a mottled, slightly rough skin
  float w = fbm(vLoc * 260.0);
  diffuseColor.rgb *= 0.88 + 0.2 * w;
  microR = 0.18 * (w - 0.5);
  #elif TEX == 6
  // felt: fibres
  float w = fbm(vLoc * 2400.0);
  diffuseColor.rgb *= 0.9 + 0.14 * w;
  #elif TEX == 7
  // maple with its medullary flecks
  float w = fbm(vec3(along * 30.0, across * 220.0, depth * 40.0));
  float fl = smoothstep(0.62, 0.75, fbm(vec3(along * 90.0, across * 900.0, depth * 90.0)));
  diffuseColor.rgb *= 0.92 + 0.1 * w - 0.08 * fl;
  #elif TEX == 8
  // drawn or ground metal: streaks along the axis
  float w = fbm(vec3(along * 8.0, across * 900.0, depth * 900.0));
  microR = 0.12 * (w - 0.5);
  #elif TEX == 9
  // gold lacquer over cast iron: slow clouds in the paint (centimetres: no per-pixel speckle at the
  // hero's distance) and the casting's skin in its roughness
  float w = fbm(vLoc * 22.0);
  float sk = fbm(vLoc * 420.0);
  diffuseColor.rgb *= 0.9 + 0.2 * w;
  microR = 0.1 * (w - 0.5) + 0.08 * (sk - 0.5);
  #elif TEX == 10
  // a sliced veneer round a curved wall: the grain runs along the wall (its lines vary with height),
  // wavering slowly
  float w = fbm(vec3(vLoc.x * 3.0, vLoc.y * 30.0, vLoc.z * 3.0));
  float g = fract(vLoc.y * 140.0 + w * 2.6);
  diffuseColor.rgb *= 0.86 + 0.24 * w - 0.12 * smoothstep(0.7, 0.95, g);
  #elif TEX == 11
  // flamed maple under varnish (as TEX 2), the varnish worn through to pale wood where uv.x says
  // (mottled), satin there (less clearcoat, rougher); uv.y darkens with grime
  float n = fbm(vec3(along * 12.0, across * 30.0, depth * 30.0));
  float f = sin(along * 520.0 + n * 9.0 + across * 90.0);
  float fl = smoothstep(-0.2, 0.9, f) * (0.6 + 0.8 * n);
  float vdir = dot(normalize(vViewPosition), normalize(vAxisV));
  float wear = clamp(vUv2.x * (0.7 + 0.6 * fbm(p * 45.0)), 0.0, 1.0);
  vec3 bare = vec3(0.47, 0.27, 0.12) * (0.88 + 0.24 * n);
  diffuseColor.rgb = mix(diffuseColor.rgb, bare, wear * 0.9);
  diffuseColor.rgb *= 1.0 + (0.42 - 0.15 * wear) * fl * clamp(vdir * 3.0, -1.0, 1.0) - 0.05;
  // (and a share that does not flip, so the figure still shows on a face seen square-on)
  diffuseColor.rgb *= 1.0 - 0.2 * fl + 0.06;
  // the varnish's own unevenness: thicker and darker in drifts, a finer mottle over it
  diffuseColor.rgb *= (0.8 + 0.4 * fbm(p * 6.0)) * (0.88 + 0.24 * fbm(p * 22.0));
  diffuseColor.rgb *= 1.0 - 0.55 * clamp(vUv2.y, 0.0, 1.0) * (0.7 + 0.6 * fbm(p * 70.0));
  microR = 0.28 * wear;
  wearCoat = wear;
  #elif TEX == 12
  // pressed wool felt: matted fibres (≈ 0.6 mm; faded out before a pixel would hold more than one,
  // so they never sparkle at a distance) over slow clouds of density (≈ 5 mm)
  float fade = 1.0 - smoothstep(0.35, 1.1, length(fwidth(p)) * 1600.0);
  float fib = (fbm(p * 1600.0) - 0.5) * fade;
  float den = fbm(p * 210.0) - 0.5;
  diffuseColor.rgb *= 0.96 + 0.3 * fib + 0.16 * den;
  #elif TEX == 13
  // a key stick: bare, straight-grained spruce. Growth rings about a pith off the stick (so both the
  // side and the top show lines along it), latewood dark and a little orange, ≈ 1.6 mm apart
  float w = fbm(vec3(along * 3.0, across * 40.0, depth * 40.0));
  float rr = length(vec2(across + 0.031, depth + 0.083));
  float g = fract(rr * 620.0 + w * 1.8);
  float late = smoothstep(0.5, 0.78, g) * (1.0 - smoothstep(0.88, 1.0, g));
  late *= 1.0 - smoothstep(0.3, 0.9, length(fwidth(p)) * 620.0);
  diffuseColor.rgb *= vec3(1.0) - vec3(0.2, 0.25, 0.32) * late + 0.1 * (w - 0.5);
  microR = 0.08 * late;
  #elif TEX == 14
  // hornbeam: close and even — a faint long streak, rings barely there, tiny grey flecks
  float w = fbm(vec3(along * 9.0, across * 160.0, depth * 160.0));
  float rr = length(vec2(across + 0.031, depth + 0.083));
  float fade = 1.0 - smoothstep(0.3, 0.9, length(fwidth(p)) * 1500.0);
  float fl = smoothstep(0.66, 0.78, fbm(vec3(along * 240.0, across * 1500.0, depth * 1500.0))) * fade;
  diffuseColor.rgb *= 0.98 + 0.08 * (w - 0.5) - 0.03 * sin(rr * 2600.0 + w * 6.0) - 0.07 * fl;
  microR = 0.06 * (w - 0.5);
  #elif TEX == 15
  // beech: its rays as short dark dashes along the grain (1–3 mm long, a fraction of one wide), faint rings
  float w = fbm(vec3(along * 6.0, across * 90.0, depth * 90.0));
  float rr = length(vec2(across + 0.031, depth + 0.083));
  float fade = 1.0 - smoothstep(0.3, 0.9, length(fwidth(p)) * 2400.0);
  float dash = smoothstep(0.6, 0.72, fbm(vec3(along * 420.0, across * 2400.0, depth * 2400.0))) * fade;
  float g = fract(rr * 360.0 + w * 2.0);
  diffuseColor.rgb *= vec3(1.0) + 0.12 * (w - 0.5) - 0.07 * smoothstep(0.7, 0.95, g) - vec3(0.14, 0.17, 0.2) * dash;
  #elif TEX == 16
  // hard maple under a thin finish: quiet rings, the rays as fine pale flecks, a slow drift of colour
  float w = fbm(vec3(along * 5.0, across * 70.0, depth * 70.0));
  float rr = length(vec2(across + 0.031, depth + 0.083));
  float fade = 1.0 - smoothstep(0.3, 0.9, length(fwidth(p)) * 1800.0);
  float g = fract(rr * 300.0 + w * 2.4);
  float fl = smoothstep(0.64, 0.76, fbm(vec3(along * 160.0, across * 1800.0, depth * 500.0))) * fade;
  diffuseColor.rgb *= 0.94 + 0.16 * (w - 0.5) - 0.1 * smoothstep(0.6, 0.92, g) + 0.07 * fl;
  microR = 0.1 * (w - 0.5);
  #elif TEX == 17
  // a white key: the facing covers its top and front; below the facing its sides are the key's own
  // bare wood (seen in the gaps beside the sharps, and all along a key standing at a section's cut)
  vec3 nl = normalize(cross(dFdx(vLoc), dFdy(vLoc)));
  if (abs(nl.x) > 0.8 && vLoc.y < 0.7222) {
    float w = fbm(vec3(vLoc.z * 3.0, vLoc.x * 40.0, vLoc.y * 40.0));
    float g = fract(length(vec2(vLoc.x + 0.031, vLoc.y + 0.083)) * 620.0 + w * 1.8);
    float late = smoothstep(0.5, 0.78, g) * (1.0 - smoothstep(0.88, 1.0, g)) * (1.0 - smoothstep(0.3, 0.9, length(fwidth(vLoc)) * 620.0));
    diffuseColor.rgb = uCut * (vec3(1.0) - vec3(0.2, 0.25, 0.32) * late + 0.1 * (w - 0.5));
    microR = 0.5;
    wearCoat = 1.0;
  }
  #elif TEX == 18
  // a turned joint of flamed maple under a stained varnish (a bassoon's): the flame as wavering bands
  // round the joint, 3–6 mm apart and uneven, strong in drifts along it and faint between; dark where
  // the stain sits in the dipping fibres whatever the angle, and lighter or darker again as the light
  // rakes along them; the bands fade to their mean before they are finer than the pixels (no moiré)
  float n = fbm(vec3(along * 6.0, across * 18.0, depth * 18.0));
  float drift = smoothstep(0.28, 0.68, fbm(vec3(along * 2.4 + 3.1, across * 7.0, depth * 7.0)));
  float ph = along * 470.0 + n * 11.0 + across * 55.0 + 2.6 * sin(along * 41.0 + across * 23.0);
  float aa = 1.0 - smoothstep(0.7, 1.8, fwidth(ph));
  float fl = mix(0.5, smoothstep(-0.55, 0.7, sin(ph)), aa) * (0.4 + 0.6 * drift);
  float vdir = dot(normalize(vViewPosition), normalize(vAxisV));
  diffuseColor.rgb *= vec3(1.0) - vec3(0.5, 0.62, 0.66) * fl;
  diffuseColor.rgb *= 1.0 + 0.45 * fl * clamp(vdir * 2.5, -1.0, 1.0);
  diffuseColor.rgb *= 0.84 + 0.32 * fbm(p * 4.0);
  microR = 0.08 * fl;
  #elif TEX == 19
  // lacquered brass: the coat a little thicker and warmer in slow drifts (centimetres), a faint orange
  // peel in its roughness; where hands hold it (uv.y) fingerprints: oval smudges a finger's size, their
  // ridges (0.45 mm) faded out before a pixel holds more than one, that rough and dull the coat
  // (single octaves: the bell fills much of the picture, and this runs on every pixel of it)
  vec3 q = vLoc;
  diffuseColor.rgb *= 0.965 + 0.07 * vnoise(q * 16.0);
  microR = 0.035 * (vnoise(q * 140.0) - 0.5);
  float hand = clamp(vUv2.y, 0.0, 1.0);
  if (hand > 0.001) {
    float sm = smoothstep(0.56, 0.7, fbm(q * vec3(48.0, 62.0, 55.0) + 7.3)) * hand;
    float fade = 1.0 - smoothstep(0.3, 0.9, length(fwidth(q)) * 2200.0);
    float ridge = 0.5 + 0.5 * sin(length((q - floor(q * 60.0) / 60.0) * vec3(1.0, 1.3, 1.0)) * 14000.0 + fbm(q * 900.0) * 4.0);
    microR += sm * (0.16 + 0.12 * ridge * fade);
    wearCoat = max(wearCoat, sm * 0.55);
  }
  #elif TEX == 20
  // hammered copper: each facet's metal a shade apart (the planishing work-hardens it unevenly)
  float hc = hammerCell(vLoc * 62.0).y;
  diffuseColor.rgb *= 0.93 + 0.12 * hc + 0.05 * (vnoise(vLoc * 9.0) - 0.5);
  microR = 0.05 * (hc - 0.5);
  #endif
  #if PAINTED
  // the painted aux map: r = figure (flame) under the varnish, flipping with the view; g = 1 at the edge
  float fig = auxT.r * 2.0 - 1.0;
  float vd = dot(normalize(vViewPosition), normalize(vAxisV));
  diffuseColor.rgb *= 1.0 + 0.38 * fig * clamp(vd * 3.0, -1.0, 1.0);
  microR += 0.25 * auxT.g;
  // b = wear: the varnish rubbed thin (satin: rougher, less clearcoat)
  microR += 0.22 * auxT.b;
  wearCoat = auxT.b;
  #endif
}
// a section: where the eye sees into a part cut open, the face the cut would show
bool capFrag = false;
vec3 capCol = vec3(0.0);
#if NUM_CLIPPING_PLANES > 0
// (or sees a web: a cross-wall built inside a long part, at every key's boundary, to be its cut face:
// piano3d.ts webs(), marked in uv.x)
if (!gl_FrontFacing || vUv2.x > 8.5) {
  capFrag = true;
  // where the eye's ray through this fragment meets the cut's plane, in the world (metres): the cut
  // is a plane of constant x there, so (y, z) are its own coordinates
  vec4 pl = clippingPlanes[0];
  vec3 qc = vClipPosition * (pl.w / min(dot(vClipPosition, pl.xyz), -1e-6));
  vec3 wc = cameraPosition - qc * mat3(viewMatrix);
  vec2 cp = wc.yz;
  vec3 base = uCut;
  #if CAP == 4
  // a white key: its facing (the top 2.5 mm) over the key's wood
  bool facing = wc.y > 0.7225;
  if (facing) base = diffuseColor.rgb * 0.92;
  #endif
  #if CAP == 1 || CAP == 4
  #if CAP == 4
  vec3 axW = vec3(0.0, 0.0, 1.0);
  if (!facing)
  #else
  // the part's grain in the world: across the cut it shows end grain (rings, darker: it drinks the
  // light), along it long grain (lines)
  vec3 axW = normalize(vAxisV * mat3(viewMatrix));
  #endif
  {
    float endG = smoothstep(0.45, 0.85, abs(axW.x));
    vec2 d2 = normalize(axW.yz + vec2(1e-4, 0.0));
    float acr = dot(cp, vec2(-d2.y, d2.x));
    float alo = dot(cp, d2);
    float lw = fbm(vec3(alo * 4.0, acr * 60.0, 3.7));
    float ll = fract(acr * 560.0 + lw * 2.2);
    float longF = 1.0 - 0.17 * smoothstep(0.62, 0.9, ll) + 0.1 * (lw - 0.5);
    float rw = fbm(vec3(cp * 30.0, 1.3 + uCapSeed.x));
    float rg = fract(length(cp - vec2(0.75 + uCapSeed.y, uCapSeed.x)) * 430.0 * uCapSeed.z + rw * 3.0);
    float endF = 0.8 - 0.2 * smoothstep(0.5, 0.9, rg) + 0.1 * (fbm(vec3(cp * 700.0, 2.1)) - 0.5);
    base *= mix(longF, endF, endG);
  }
  #elif CAP == 2
  // felt sheared through: its fibres, a little darker
  base *= 0.9 + 0.2 * (fbm(vec3(cp * 1500.0, 0.7)) - 0.5) + 0.12 * (fbm(vec3(cp * 200.0, 4.1)) - 0.5);
  #elif CAP == 3
  // cut metal: a fine crystalline sparkle
  base *= 0.92 + 0.16 * (fbm(vec3(cp * 2600.0, 5.3)) - 0.5);
  #endif
  capCol = base * uCapLight;
}
#endif`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat *= 1.0 - 0.85 * wearCoat;
#endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + microR, 0.03, 1.0);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#if TEX == 9 || TEX == 12 || TEX == 20
{
  #if TEX == 20
  // a planishing hammer's facets, ~16 mm across: each a shallow dish (0.25 mm deep), ridges where they
  // meet; they fade out before a pixel holds several (no shimmer at a distance)
  vec3 ph = vLoc * 62.0;
  float hb = 0.0005 * hammerCell(ph).x * (1.0 - smoothstep(0.5, 1.2, length(fwidth(ph))));
  #elif TEX == 9
  // a casting is never flat: a gentle waviness (≈ 1 mm over 10 cm, 0.3 mm over 3 cm) breaks the
  // flange's sheen up as a real plate's (a bump in metres: Mikkelsen's surface gradient, unnormalised)
  float hb = 0.0012 * fbm(vLoc * 9.0) + 0.0003 * fbm(vLoc * 37.0);
  #else
  // felt's nap: fibres standing a fifth of a millimetre off the surface, and its slow unevenness
  // (the fibres fade with distance, as in its colour)
  vec3 pf = vLoc / uTexScale;
  float hb = 0.0002 * fbm(pf * 1600.0) * (1.0 - smoothstep(0.35, 1.1, length(fwidth(pf)) * 1600.0)) + 0.0005 * fbm(pf * 210.0);
  #endif
  vec3 sp = -vViewPosition;
  vec3 sx = dFdx(sp);
  vec3 sy = dFdy(sp);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(hb) * r1 + dFdy(hb) * r2);
  normal = normalize(abs(det) * normal - grad);
}
#endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vGlow.rgb * vGlow.rgb * min(vGlow.a, 1.0) * 0.55;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (capFrag) outgoingLight = capCol + totalEmissiveRadiance;
#include <opaque_fragment>`,
      );
  };
  pm.customProgramCacheKey = () => `${name}|${tex}|${kind}|${cap}|${paint ? 'p' : ''}`;
  cache.set(m, pm);
  return pm;
}

/** paint a plate's maps once (canvas → texture); the aux map is linear */
function paintMaps(p: PaintSpec, lite: boolean): { map: THREE.Texture; aux: THREE.Texture } {
  const px = lite ? Math.min(1024, p.px) : p.px;
  const [x0, z0, x1, z1] = p.rect;
  const w = px;
  const h = Math.max(8, Math.round((px * (z1 - z0)) / (x1 - x0)));
  const c1 = document.createElement('canvas');
  const c2 = document.createElement('canvas');
  c1.width = c2.width = w;
  c1.height = c2.height = h;
  const g1 = c1.getContext('2d')!;
  const g2 = c2.getContext('2d')!;
  p.draw(g1, g2, w, h);
  const map = new THREE.CanvasTexture(c1);
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  const aux = new THREE.CanvasTexture(c2);
  aux.flipY = false;
  aux.anisotropy = 8;
  textures.push(map, aux);
  return { map, aux };
}

/** every material in use (for disposal) */
export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose();
  for (const t of textures) t.dispose();
  cache.clear();
  textures.length = 0;
}

/** the materials of a mesh, by its vertices' ids */
export function matsOf(ids: number[], lite: boolean): THREE.Material[] {
  return ids.map((id) => materialFor(MAT_LIST[id], lite));
}
