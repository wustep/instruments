// A world: one theme's 3D room. Everything of the 3D stage that is a look and not an instrument is
// here: the room the image-based light is made from (and that lacquer and brass reflect), the three
// lights, the floor, what stands behind the instrument in the last pass, the bloom, the exposure, how
// a sounding line is laid on the picture, and what of the instruments' materials and marks the room
// changes. The renderer (three3d.ts) is the same for all of them and asks the world in use; each
// theme's is in its own folder (themes/<id>/world.ts), listed in themes/worlds.ts.
//
// A world is data, the GLSL of its floor and of its backdrop, and one hook that sets their uniforms
// each frame. It is never asked which theme it is.
import * as THREE from 'three';
import type { Batch, Vec3 } from './gl3d.ts';
import type { M } from './mesh.ts';
import type { ThemeId } from '../../themes/types.ts';

export type Uniforms = Record<string, THREE.IUniform>;
/** one of the shared surfaces (mesh.ts `M`), by name */
export type MatName = keyof typeof M;

/** One of the stage's three lights on a whole instrument. `dir`: towards the light from the
 *  instrument, in the scenes' frame (the audience at −z); `close`: its colour in a piano key's
 *  close-up, whose light is the section's own (three3d `CLOSE`; none: it keeps its colour);
 *  `waits`: it stands low before the first sound and comes up with it (`Rig.wait`). */
export interface Light3 {
  dir: Vec3;
  color: Vec3;
  intensity: number;
  close?: Vec3;
  waits?: boolean;
}

/** The lights. `key` is the one that casts the shadow, whatever it is in the room (a studio's key, a
 *  hall's spot, a gallery's light from behind); a scene may point it itself (Batch.key). `rim` and
 *  `fill` cast none. */
export interface Rig {
  key: Light3;
  rim: Light3;
  fill: Light3;
  /** the room's own share of the light on a whole instrument (the scene's environment intensity) */
  env: number;
  /** the key's shadow: how soft (and on a phone), and how deep (1: a lamp's in the dark) */
  shadow: { radius: number; lite: number; depth: number };
  /** the light before the first sound, as a share of its full strength (1: it does not wait) */
  wait: number;
  /** The first view's yaw the directions are written for. With it, the room and its lights are turned
   *  about each instrument to where that one is first seen from, so every instrument is lit the same
   *  way from its own first view. Without it the room stands still. */
  bearing?: number;
}

/** The floor: a lit, shadowed surface whose coverage fades into the ground with distance, the room's
 *  pool of light on it (gl3d's Pool). The renderer owns `uFloorC`, `uFloorR`, `uPool` (its radius, its
 *  rim's half-width, the light past it as a share of the pool's, the pool's lift) and `uPoolHot`.
 *  `pars`: the world's own uniforms' declarations; `body`: the GLSL laid over the lit floor (it has
 *  `vWorldP` and writes gl_FragColor); `uniforms`: the world's own, made once per renderer. */
export interface Floor3 {
  color: Vec3;
  roughness: number;
  specular: number;
  /** how much of the room it mirrors */
  env: number;
  /** the light past the pool's rim, as a share of the pool's */
  past: number;
  /** how much of the sound's lift the pool takes */
  lift: number;
  /** a floor with no pool (an orchestra's): its light over the plain floor's (0: none) */
  wash: number;
  pars: string;
  body: string;
  uniforms?(): Uniforms;
}

/** The last pass, behind the instrument: the room's backdrop. `pars`: its uniforms and functions;
 *  `body`: the end of `main`, which has the tone-mapped picture `s` with its coverage `a`, the dither
 *  `d`, `vUv`, `uGround` and `uRes`, and writes gl_FragColor; `uniforms`: its own, made once per
 *  renderer. */
export interface Final3 {
  pars: string;
  body: string;
  uniforms(): Uniforms;
}

/** what a world's hook is told of a frame */
export interface Frame3 {
  /** the camera, set for this frame (three's world: the scenes' mirrored in x) */
  cam: THREE.PerspectiveCamera;
  /** the picture (px) */
  w: number;
  h: number;
  /** the scene's bounds (the scenes' frame: centre, radius), its floor, its own key light's direction */
  c: Vec3;
  rad: number;
  floor: Batch['floor'];
  key: Vec3 | null;
  /** a piano key's close-up: 0 the whole instrument … 1 */
  k: number;
  /** a whole instrument's value on its way to the close-up's */
  mix(a: number, z: number): number;
  /** the light come up with the first sound (0 … 1), and the share of its full strength that is */
  up: number;
  lit: number;
}

/** What a world changes of a shared material (mats3.ts `P`, by name): its colour and the numbers that
 *  are uniforms, of those the material already sets (nothing that would need another program). */
export interface MatOver {
  color?: string;
  roughness?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
}
/** How a world takes the instruments' materials. `env`: the share of the room a material that sets its
 *  own takes (given the share it was set in a dark studio); `over`: what it changes, by name. */
export interface MatLook {
  env?(v: number): number;
  over?: Record<string, MatOver>;
}

/** The lines laid over a bowed instrument. `sound`: what the bow sounds (the bowed string, its moving
 *  shape, the bow's contact); `ring`: what answers (a string ringing on, the stopped note's bar), each
 *  'r,g,b'. A sounding string's alpha is [0] + [1] · its level, bowed (`bowing`) or ringing on
 *  (`ringing`); `stop`: the stopping mark's three strokes, each [alpha, px]: its halo, its bar, the tick
 *  up to the string; `shape`: the alpha of the bowed string's moving shape. */
export interface BowedInk {
  sound: string;
  ring: string;
  bowing: [number, number];
  ringing: [number, number];
  stop: [[number, number], [number, number], [number, number]];
  shape: number;
}

export interface World {
  id: ThemeId;
  /** the room, built to be photographed once (the pre-filtered environment) and let go */
  room(): THREE.Scene;
  lights: Rig;
  /** a whole instrument's exposure */
  exposure: number;
  /** bloom: how far over white a pixel must be to bloom, and how much of the blur is added */
  bloom: { over: number; strength: number };
  /** a grand's lid as a mirror: the most it reflects (its Fresnel term's cap) and its gain */
  mirror: { most: number; gain: number };
  /** how the sounding lines meet the picture: added to it as light is, or laid over it as ink is */
  glow: 'added' | 'laid';
  floor: Floor3;
  final: Final3;
  /** each frame, once the camera is set: the world's own uniforms (the floor's, the last pass's) */
  frame(u: { floor: Uniforms; final: Uniforms }, f: Frame3): void;
  materials: MatLook;
  /** an orchestra's risers: their decks and their fascias */
  riser: { top: MatName; side: MatName };
  /** the ring of a struck bar or head (ring-glow.ts): its colour (linear-ish rgb, squared in the shader) */
  ring: Vec3;
  /** the harp: the mark where a finger took a string, and a ringing string's line, `lit` + `own` · the
   *  string's own colour */
  harp: { mark: Vec3; lit: Vec3; own: number };
  bowed: BowedInk;
}

// ---------------------------------------------------------------- what the rooms share

/** A card of light in a room: brightest in the middle, feathered to nothing over `soft` of its
 *  half-size (a real diffuser's falloff; a hard-edged card reflects as a paper cut-out). `added`: its
 *  light is added to the wall behind it (a card in a lit room has no edge of its own). */
export function panel(s: THREE.Scene, w: number, h: number, c: Vec3, k: number, pos: Vec3, look: Vec3, soft = 0.5, added = false): void {
  const g = new THREE.PlaneGeometry(w, h, 24, 24);
  const P = g.attributes.position;
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const u = Math.abs(P.getX(i)) / (w / 2);
    const v = Math.abs(P.getY(i)) / (h / 2);
    const e = (x: number) => {
      const t = Math.max(0, Math.min(1, (1 - x) / soft));
      return t * t * (3 - 2 * t);
    };
    const f = e(u) * e(v);
    col[i * 3] = c[0] * k * f;
    col[i * 3 + 1] = c[1] * k * f;
    col[i * 3 + 2] = c[2] * k * f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial(added ? { vertexColors: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false } : { vertexColors: true, side: THREE.DoubleSide }));
  m.position.set(...pos);
  m.lookAt(...look);
  s.add(m);
}

/** a room's walls and ceiling: a box seen from inside, of one colour */
export function walls(s: THREE.Scene, c: Vec3, size: Vec3, y: number): void {
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), side: THREE.BackSide }));
  room.scale.set(...size);
  room.position.y = y;
  s.add(room);
}

/** a room's own floor, of one colour (what an instrument's underside looks down at) */
export function ground(s: THREE.Scene, c: Vec3): void {
  const flo = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]) }));
  flo.rotation.x = -Math.PI / 2;
  flo.position.y = -1.9;
  s.add(flo);
}

/** The backdrop's light as three of the rooms have it: centred a little above the instrument's middle,
 *  sized to it on the picture (`uGlowC`, `uGlowR`). */
export const GLOW_PARS = 'uniform vec2 uGlowC; uniform vec2 uGlowR; uniform float uGlow;';
export const glowUniforms = (): Uniforms => ({ uGlowC: { value: new THREE.Vector2(0.5, 0.5) }, uGlowR: { value: new THREE.Vector2(0.4, 0.5) }, uGlow: { value: 1 } });
export function glowBox(u: Uniforms, f: Frame3): void {
  const { c, rad, cam, w, h } = f;
  const pc = new THREE.Vector3(-c[0], c[1] + rad * 0.15, c[2]).project(cam);
  const pr = new THREE.Vector3(-c[0], c[1] + rad * 1.15, c[2]).project(cam);
  const ry = Math.max(0.25, Math.min(0.9, Math.abs(pr.y - pc.y) * 0.5 * 1.6));
  u.uGlowC.value.set(pc.x * 0.5 + 0.5, pc.y * 0.5 + 0.5);
  u.uGlowR.value.set((ry * h) / w * 1.3, ry);
}

// ---------------------------------------------------------------- the passes a world has a say in

/** a number as GLSL writes a float */
const fl = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/** The last pass: the occlusion, the bloom, the tone mapping, then the world's backdrop behind the
 *  instrument. */
export const FINAL_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const finalFS = (f: Final3): string => /* glsl */ `
#include <tonemapping_pars_fragment>
uniform sampler2D tColor; uniform sampler2D tAO; uniform float uAO; uniform vec3 uGround; uniform vec2 uRes;
uniform sampler2D tBloom; uniform float uBloom;
${f.pars}
varying vec2 vUv;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 c = texture2D(tColor, vUv);
  float a = clamp(c.a, 0.0, 1.0);
  vec3 col = a > 1e-4 ? c.rgb / a : vec3(0.0);
  float ao = texture2D(tAO, vUv).r;
  col *= mix(1.0, ao, uAO);
  // a slight bloom, only from the specular hot spots (the bright-pass keeps what is far over white)
  col += texture2D(tBloom, vUv).rgb * uBloom;
  vec3 s = toSRGB(NeutralToneMapping(col));
  // a little dither against banding in the dark gradients
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
${f.body}
}`;

/** bloom's bright-pass at quarter resolution: what is more than `over` over white, on a soft knee */
export const brightFS = (over: number): string => /* glsl */ `
uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i % 2) - 0.5, float(i / 2) - 0.5) * uTexel * 2.0;
    vec4 t = texture2D(tColor, vUv + o);
    // a soft knee, capped: a near-mirror metal's hot spot (hundreds over white) must not flood the
    // blur into a fog ball
    vec3 e = max(t.rgb - vec3(${fl(over)}), vec3(0.0));
    c += min(e / (1.0 + e * 0.35), vec3(2.0));
  }
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

/** A planar mirror (the polished underside of a grand's lid): the scene, drawn from the camera's mirror
 *  image, added over the lacquer by its Fresnel reflectance, capped at `most` and times `gain` (in a
 *  dark studio a little over-exposed, as the lacquer's view of the room is: mats3.ts). */
export const MIRROR_VS = /* glsl */ `
uniform mat4 uTexM; varying vec4 vP; varying vec3 vW; varying vec3 vN;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = uTexM * w; vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0, -1.0, 0.0));
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
export const mirrorFS = (m: World['mirror']): string => /* glsl */ `
uniform sampler2D tMirror; uniform float uK; varying vec4 vP; varying vec3 vW; varying vec3 vN;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec4 c = texture2DProj(tMirror, vP);
  float cosT = abs(dot(normalize(cameraPosition - vW), vN));
  float F = min(0.05 + 0.95 * pow(1.0 - cosT, 5.0), ${fl(m.most)});
  gl_FragColor = vec4(c.rgb * F * ${fl(m.gain)} * uK, 0.0);
}`;

/** the floor's part of its material's shader: the renderer's uniforms and the world's, and its body */
export const floorPars = (f: Floor3): string => /* glsl */ `
uniform vec3 uFloorC; uniform vec2 uFloorR; uniform vec4 uPool; uniform float uPoolHot;${f.pars ? ` ${f.pars}` : ''}
varying vec3 vWorldP;`;
