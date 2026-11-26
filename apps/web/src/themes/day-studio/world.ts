// Day Studio in 3D: a daylight studio at midday. An image-based light from a generated room (white
// plaster all round, a skylight overhead, a tall north window of panes at one side, the wall opposite
// giving the light back a little warmer), a cool-white key from the window's side with a soft shadow,
// a warm fill from the other, next to no rim, neutral tone mapping a little over-exposed, and a pale
// floor that takes the shadow and occlusion and runs out into the page's own ground: the wall, the
// floor and the page are one plaster white. Nothing glows: what sounds is drawn over the picture in the
// blue, not added to it (in daylight an added light is lost).
import * as THREE from 'three';
import type { Vec3 } from '../../ui/gl/gl3d.ts';
import { GLOW_PARS, glowBox, glowUniforms, ground, panel, walls, type World } from '../../ui/gl/world.ts';

/** How much of the room a material that sets its own share takes in the daylight studio. The shares
 *  (mats3.ts `P`) were set in a dark studio, where polished metal reads only through its reflections and
 *  was given up to twice the environment; in a daylight room a metal takes the room as it is, so what is
 *  over 1 is drawn in to a quarter of it (1.6 → 1.15), and the whole follows the room's own share
 *  (DAY.env). */
export const ROOM_SHARE = 1.2;
export const dayEnv = (v: number): number => ROOM_SHARE * (v <= 1 ? v : 1 + (v - 1) * 0.25);

/** The studio's daylight on a whole instrument. `key`, `rim`, `fill`: the three lights' strengths (the
 *  key from the window's side and above, with the shadow; the rim from behind, next to nothing; the fill
 *  low from the other side, warm); `env`: how much of the room's own light the materials take; `exposure`:
 *  a little over (a high-key picture); `floor`: the cyc floor's white, chosen so that in this light it comes
 *  out the page's ground (#eceff1) past the skylight's patch; `pool`: the light inside the patch (the room's
 *  size: its knob stands where it ends), over the floor's own, so the patch is the brightest thing on the
 *  floor and brighter than the wall behind; `past`: the light past the patch, as a share of the floor's;
 *  `lift`: how much of the sound's lift the patch takes (on white there is little room over it). */
export const DAY = {
  key: 2.2,
  rim: 0.25,
  fill: 0.7,
  env: ROOM_SHARE,
  exposure: 1.06,
  floor: [0.9, 0.915, 0.93] as [number, number, number],
  pool: 1.45,
  past: 0.95,
  lift: 0.06,
  /** how deep the key's shadow is (1: a lamp's in the dark) */
  shade: 0.62,
};

/** A daylight studio to light the scene with, and to see reflected in lacquer and brass: white plaster
 *  all round, a skylight overhead, a tall north window of panes at the key light's side, the wall
 *  opposite giving the light back a little warmer. (World frame: the camera stands at −z and the key
 *  light comes from −x, above and in front, so the window is the wall at −x.) Its cards of light (or of
 *  shade: k under the walls') are added to the wall behind them: a feathered card has no edge of its own. */
function studio(): THREE.Scene {
  // (a handle for looking at the light while it is tuned: scripts and the console)
  (globalThis as { __day?: typeof DAY }).__day = DAY;
  const s = new THREE.Scene();
  // the room: plaster in daylight, a tenth or so of the window's own brightness (as a room is: the eye
  // and the exposure make it white, but polished metal and lacquer need the window to stand out of it)
  walls(s, [0.34, 0.345, 0.355], [30, 14, 30], 5);
  // the floor: the cyc's sweep, a little under the walls (what stands on it shades it)
  ground(s, [0.3, 0.3, 0.3]);
  // the skylight: a large diffusing ceiling over the instrument and a little towards the window, cool white
  panel(s, 13, 10, [0.94, 0.97, 1], 3.6, [-1.5, 9.6, -1.5], [0, 0, 0], 0.4, true);
  // the north window: three bays of four panes in the wall at the key's side, the glazing bars between
  // them left as wall (a bell and a lid show the panes; without the bars they would show a white blank)
  for (let bay = 0; bay < 3; bay++)
    for (let row = 0; row < 4; row++) {
      const z = -8.4 + bay * 3.3;
      const y = 1.3 + row * 1.9;
      panel(s, 2.9, 1.65, [0.9, 0.95, 1], 5.2, [-12.5, y, z], [0, y, z], 0.14, true);
    }
  // the wall opposite and the one behind the instrument: daylight come back off plaster, a little warmer
  panel(s, 18, 9, [1, 0.96, 0.9], 0.55, [12.5, 4, -1], [0, 3, 0], 0.85, true);
  panel(s, 22, 9, [1, 0.98, 0.95], 0.4, [0, 4.2, 12.5], [0, 3, 0], 0.9, true);
  // the floor in front of the instrument, lit from above: what a piano's black front, a bell's underside
  // and a rib's lower edge reflect (they face down and out, at the floor)
  panel(s, 22, 16, [1, 0.98, 0.95], 0.5, [0, -1.85, -5], [0, 10, -5], 1.0, true);
  // behind the camera the room is deeper and in its own shade: a dark doorway there gives polished
  // metal and lacquer one deep tone to turn against (in an all-white room they have no form)
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.105, 0.115), side: THREE.DoubleSide }));
  shade.position.set(3.5, 2.2, -14.2);
  s.add(shade);
  // two black cards low at the room's edge, as a photographer stands them by polished metal: a tube lying
  // level (a flute, a slide, a lid's edge) takes a dark line along its side from them, and has a form on a
  // pale riser. Seen only in reflections.
  const card = (w: number, h: number, pos: Vec3, look: Vec3) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.055, 0.058, 0.064), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  card(17, 2.6, [12.2, -0.4, -2], [0, -0.4, -2]);
  card(26, 1.8, [0, -0.9, -13.8], [0, -0.9, 0]);
  return s;
}

/** what sounds, drawn over the picture in the blue (a brighter one than the page's: it lies on dark
 *  fingerboards and varnish as often as on the pale floor) */
const SOUND = '54,104,236';

export const dayStudioWorld: World = {
  id: 'day-studio',
  room: studio,
  // the key (the window and the skylight: cool white, a soft shadow; a white room fills its own
  // shadows, so the key's is a little over half as deep as a lamp's in the dark), a rim that is next to
  // none, and a soft fill from the other side, low: the opposite wall's warm white. (Their strengths
  // are read from DAY each frame, so the handle tunes them live.)
  lights: {
    key: {
      dir: [0.55, 0.78, -0.5],
      color: [0.96, 0.98, 1],
      get intensity() {
        return DAY.key;
      },
    },
    rim: {
      dir: [-0.6, 0.5, 0.75],
      color: [1, 1, 1],
      get intensity() {
        return DAY.rim;
      },
    },
    fill: {
      dir: [-0.8, 0.25, -0.55],
      color: [1, 0.95, 0.88],
      close: [1, 0.9, 0.78],
      get intensity() {
        return DAY.fill;
      },
    },
    get env() {
      return DAY.env;
    },
    shadow: {
      radius: 9,
      lite: 5,
      get depth() {
        return DAY.shade;
      },
    },
    wait: 1,
  },
  get exposure() {
    return DAY.exposure;
  },
  // (in daylight much of the picture is near white: only what is far over it blooms, the window's panes
  // in brass and lacquer)
  bloom: { over: 3.4, strength: 0.22 },
  mirror: { most: 0.36, gain: 1 },
  glow: 'laid',
  // The floor: the cyc's own white, matt; on it the room's light, the skylight's patch, as large as the
  // room. uPoolIn: the light inside the patch, over the floor's own (with no patch, an ensemble's, the
  // floor is one); uPoolHot: the rim drawn as a faint ring of shade (on a white floor nothing can be
  // brightened) while the room's knob is under the pointer, turned or focused.
  floor: {
    get color() {
      return DAY.floor;
    },
    roughness: 0.92,
    specular: 0.2,
    env: 0.3,
    get past() {
      return DAY.past;
    },
    get lift() {
      return DAY.lift;
    },
    wash: 0,
    pars: 'uniform float uPoolIn;',
    body: /* glsl */ `
{
  float rr = length((vWorldP - uFloorC).xz);
  float inPool = 1.0 - smoothstep(uPool.x - uPool.y, uPool.x + uPool.y, rr);
  float e = (rr - uPool.x) / max(uPool.y, 1e-3);
  float k = mix(uPool.z, uPoolIn + uPool.w, inPool) - uPoolHot * 0.1 * exp(-e * e);
  gl_FragColor.rgb *= k;
  gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr);
}`,
    uniforms: () => ({ uPoolIn: { value: 1 } }),
  },
  final: {
    pars: GLOW_PARS,
    body: /* glsl */ `
  // the backdrop: the studio's white wall, at its brightest behind the instrument and the page's own
  // ground at the edges (so the canvas still meets the page without a seam)
  vec2 q = (vUv - uGlowC) / uGlowR;
  float lit = max(0.0, exp(-dot(q, q)) - 0.1) / 0.9;
  vec3 back = mix(uGround, vec3(0.985, 0.988, 0.992), 0.72 * uGlow * lit);
  gl_FragColor = vec4(mix(back, s, a) + d / 255.0, 1.0);`,
    uniforms: glowUniforms,
  },
  frame(u, f) {
    u.floor.uPoolIn.value = f.floor?.pool ? DAY.pool : 1;
    glowBox(u.final, f);
  },
  // polished sterling silver and nickel silver are what they reflect: the daylight room, its window and
  // its skylight. Lacquer and the bright metals are given less of it than a dark studio gave them, and
  // the lacquered brass is a shade deeper and a touch less sharp.
  materials: {
    env: dayEnv,
    over: {
      lacquer: { envMapIntensity: 0.95 },
      glockHead: { envMapIntensity: 1.1 },
      silverPolish: { envMapIntensity: 1.1 },
      brassLacquer: { color: '#e9bf62', roughness: 0.18, envMapIntensity: 1.15 },
      nickelSilver: { envMapIntensity: 1.1 },
      nickelSatin: { envMapIntensity: 1.1 },
      silverKeys: { envMapIntensity: 1.1 },
    },
  },
  // decks of pale birch ply on fascias painted the cyc's white
  riser: { top: 'stageDeck', side: 'stagePaint' },
  // not a lamp but a cast: what rings takes a breath of the one blue that means sound, paled
  ring: [0.42, 0.58, 1],
  // the finger's mark and a ringing string are drawn in the blue (firmer the wider the string swings)
  harp: { mark: [0.21, 0.41, 0.925], lit: [0.21, 0.41, 0.925], own: 0 },
  // one blue for everything that sounds: the bowed string, a string ringing on, the stopping point's bar
  bowed: {
    sound: SOUND,
    ring: SOUND,
    bowing: [0.3, 0.55],
    ringing: [0.14, 0.4],
    stop: [
      [0.22, 12],
      [0.95, 5],
      [0.8, 2.5],
    ],
    shape: 0.95,
  },
};
