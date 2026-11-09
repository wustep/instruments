// The 3D stage's materials, physically based (three.js MeshPhysicalMaterial): each of the shared
// surfaces in `mesh.ts` (by name) becomes a layered material — clearcoat over the lacquer, the
// varnish and the brass; sheen on felt and hair; anisotropic steel; iridescent pearl — and the
// woods get solid textures computed in the shader from each part's own coordinates (spruce grain,
// flamed maple whose stripes flip light/dark with the viewing angle, ebony, maple fleck), with
// micro-variation in roughness everywhere. A violin's plates carry their own painted maps
// (varnish, purfling, edge wear; the f-holes cut through), drawn once on a canvas.
//
// Every material also takes two live inputs: a per-instance glow (rgb, amount: keys, hammers, the
// bow) and, for the soundboard/violin top and the flute/trumpet bore, the engine's mode
// amplitudes or standing wave, added as light.
import * as THREE from 'three';
import { MAT_LIST, type Mat, type PaintSpec } from './mesh.ts';

/** live uniforms shared by every material */
export const LIVE = {
  uAmp: { value: new Float32Array(16) },
  uMN: { value: new Float32Array(32) },
  uModalHot: { value: new THREE.Color(0.95, 0.65, 0.27) },
  uModalGain: { value: 0 },
  uWave: { value: new Float32Array(48) },
  uWaveCol: { value: new THREE.Color(1, 0.37, 0.22) },
};

type Phys = THREE.MeshPhysicalMaterialParameters & {
  /** solid texture: 0 none, 1 spruce, 2 flamed maple, 3 plain wood, 4 ebony, 5 cast iron, 6 felt, 7 maple fleck, 8 brushed */
  tex?: number;
  /** the grain/long axis in the part's own frame */
  axis?: [number, number, number];
  /** the scale of the texture (1 = a violin's) */
  texScale?: number;
};

const P: Record<string, Phys> = {
  lacquer: { color: '#050505', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.035, tex: 0 },
  lacquerSatin: { color: '#0a0909', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22 },
  caseInner: { color: '#1d140e', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, tex: 3, axis: [1, 0, 0], texScale: 3 },
  // the plate: gold-bronze lacquer over cast iron (a lacquered paint, not bare metal)
  plate: { color: '#b98a3c', metalness: 0.55, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3, tex: 5 },
  spruce: { color: '#d8b175', roughness: 0.48, clearcoat: 0.55, clearcoatRoughness: 0.18, tex: 1, axis: [0.42, 0, 0.91], texScale: 2.2 },
  spruceBare: { color: '#d9b77e', roughness: 0.62, tex: 1, axis: [0, 0, 1], texScale: 1.5 },
  maple: { color: '#b88654', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, tex: 7, axis: [1, 0, 0], texScale: 1.5 },
  hornbeam: { color: '#e6d0a6', roughness: 0.55, tex: 3, axis: [0, 1, 0], texScale: 0.6 },
  keyWood: { color: '#d3b689', roughness: 0.7, tex: 3, axis: [0, 0, 1], texScale: 1 },
  actionWood: { color: '#b48759', roughness: 0.6, tex: 3, axis: [0, 0, 1], texScale: 0.8 },
  hammerFelt: { color: '#efe8d8', roughness: 1, sheen: 1, sheenColor: '#fffaf0', sheenRoughness: 0.55, tex: 6 },
  damperFelt: { color: '#e4e1db', roughness: 1, sheen: 0.8, sheenColor: '#ffffff', sheenRoughness: 0.6, tex: 6 },
  redFelt: { color: '#7d1d1a', roughness: 1, sheen: 1, sheenColor: '#d0605a', sheenRoughness: 0.5, tex: 6 },
  buckskin: { color: '#b39876', roughness: 0.95, sheen: 0.6, sheenColor: '#e8d8bf', sheenRoughness: 0.7, tex: 6 },
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
  castAction: { color: '#8a8985', metalness: 0.85, roughness: 0.45, tex: 5 },
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
  // pianos: the plate is lacquered metal-flake paint over cast iron (a thin, slightly rough coat; a
  // heavy clearcoat would wash it to cream under the softbox)
  pianoPlate: { color: '#a07533', metalness: 0.82, roughness: 0.4, clearcoat: 0.2, clearcoatRoughness: 0.4, tex: 5 },
  underfelt: { color: '#5c1418', roughness: 1, sheen: 0.9, sheenColor: '#b04048', sheenRoughness: 0.5, tex: 6 },
  greenFelt: { color: '#1f4a36', roughness: 1, sheen: 0.8, sheenColor: '#5a9a7a', sheenRoughness: 0.5, tex: 6 },
  bracketCast: { color: '#7a6e4c', metalness: 0.85, roughness: 0.42, tex: 5 },
  mahogany: { color: '#6b3219', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, tex: 3, axis: [0, 1, 0], texScale: 0.5 },
  keyIvory: { color: '#f1ece0', roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.1, sheen: 0.4, sheenColor: '#fff4dc', sheenRoughness: 0.35 },
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
`;

/** one material per shared Mat (by object), built on first use */
const cache = new Map<Mat, THREE.Material>();
const textures: THREE.Texture[] = [];

export function materialFor(m: Mat, lite: boolean): THREE.Material {
  let mat = cache.get(m);
  if (mat) return mat;
  const name = m.name ?? 'plain';
  const base = P[name] ?? { color: new THREE.Color().setRGB(m.col[0], m.col[1], m.col[2], THREE.SRGBColorSpace), roughness: m.rough, metalness: m.metal };
  const { tex = 0, axis = [1, 0, 0], texScale = 1, ...params } = base;
  const pm = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, ...params });
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
    // the cut-outs (f-holes): alpha to coverage, so their edges are antialiased by the multisampling
    if (paint.cut) {
      pm.alphaTest = 0.02;
      pm.alphaToCoverage = true;
    }
    pm.color.set('#ffffff');
  }
  pm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LIVE);
    sh.uniforms.uAxis = { value: new THREE.Vector3(...axis).normalize() };
    sh.uniforms.uTexScale = { value: texScale };
    if (aux) sh.uniforms.tAux = { value: aux };
    if (paint) sh.uniforms.uRect = { value: new THREE.Vector4(...paint.rect) };
    sh.defines = { ...(sh.defines ?? {}), TEX: tex, KIND: kind, PAINTED: paint ? 1 : 0 };
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
uniform vec3 uAxis; uniform float uTexScale;
uniform float uAmp[16]; uniform vec2 uMN[16]; uniform vec3 uModalHot; uniform float uModalGain;
uniform float uWave[48]; uniform vec3 uWaveCol;
#if PAINTED
uniform sampler2D tAux; uniform vec4 uRect;
#endif
${NOISE}
// a basis across the grain
vec3 crossAxis(vec3 a) { return normalize(abs(a.y) < 0.9 ? cross(a, vec3(0, 1, 0)) : cross(a, vec3(1, 0, 0))); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#if PAINTED
vec2 pUV = vec2((vLoc.x - uRect.x) / (uRect.z - uRect.x), (vLoc.z - uRect.y) / (uRect.w - uRect.y));
vec4 texelColor = texture2D(map, pUV);
diffuseColor *= texelColor;
vec4 auxT = texture2D(tAux, pUV);
#else
#include <map_fragment>
#endif
float microR = 0.0;
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
  #endif
  #if PAINTED
  // the painted aux map: r = figure (flame) under the varnish, flipping with the view; g = 1 at the edge
  float fig = auxT.r * 2.0 - 1.0;
  float vd = dot(normalize(vViewPosition), normalize(vAxisV));
  diffuseColor.rgb *= 1.0 + 0.38 * fig * clamp(vd * 3.0, -1.0, 1.0);
  microR += 0.25 * auxT.g;
  #endif
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + microR, 0.03, 1.0);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += vGlow.rgb * vGlow.rgb * vGlow.a * 0.55;
#if KIND == 1
{
  float s = 0.0;
  for (int k = 0; k < 16; k++) s += uAmp[k] * sin(uMN[k].x * PI * vUv2.x) * sin(uMN[k].y * PI * vUv2.y);
  float e = clamp(abs(s) * uModalGain, 0.0, 1.0);
  totalEmissiveRadiance += uModalHot * e * e * 0.22;
}
#elif KIND == 2
{
  float x = clamp(vUv2.x, 0.0, 1.0) * 47.0;
  int i = int(floor(x));
  float e = mix(uWave[i], uWave[min(i + 1, 47)], fract(x));
  totalEmissiveRadiance += uWaveCol * e * e * 0.06;
}
#endif`,
      );
  };
  pm.customProgramCacheKey = () => `${name}|${tex}|${kind}|${paint ? 'p' : ''}`;
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
