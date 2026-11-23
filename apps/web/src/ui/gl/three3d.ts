// The 3D stage's renderer, on three.js. It draws what a scene puts in a `Batch` (gl3d.ts) each frame:
// static meshes posed by model matrices (drawn instanced), and the live lines (strings' glow,
// stopping marks, breath, wavefronts).
//
// The look is a gallery at night, the instrument the one lit object in it: a strong silver light from
// behind and above that cuts its outline and throws its shadow forward over a dark honed floor, a second
// from behind on the other side for the far edge; a dim tungsten key across the front from one side, just
// enough to read the form; no fill from the front at all. The image-based light is a
// generated room with very little in it (`gallery`): two slots of cool light behind, one small warm lamp
// in front, the far wall's dim wash, and the dark. Behind the instrument the stage paints the room
// itself (FINAL_FS): the page's own wall, a scallop of light on it, the line where it meets the floor.
// Ground-truth ambient occlusion (GTAO) so parts sit together, Khronos neutral tone mapping, and a
// floor that takes the shadow and occlusion and the room's pool of light.
// The scene renders into an HDR target (multisampled); a last pass applies the occlusion, tone maps,
// and composites over the room; the lines are drawn on top, tested against the scene's depth.
//
// The scenes are laid out with the bass at −x; seen from the player's side (−z) that would put the
// bass on the right, so the whole world is mirrored in x (as a parent group, which three.js renders
// correctly: it flips the winding for mirrored objects).
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Batch, Mat4, Mesh, Mirror, Vec3 } from './gl3d.ts';
import { LINE_FS, LINE_VS, type LineSet } from './gl3d.ts';
import { SECTION, disposeMaterials, materialFor, setEnvironment } from './mats3.ts';
import { MAT_LIST } from './mesh.ts';

/** the shadow pass of a dissolving mesh: the same screen-door as its colour pass, so the shadow
 *  thins out with the part instead of popping */
let fadeDepth: THREE.MeshDepthMaterial | null = null;
function fadeDepthMaterial(): THREE.MeshDepthMaterial {
  if (fadeDepth) return fadeDepth;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 iGlow; varying float vKeep;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeep = iGlow.a > 1.5 ? iGlow.a - 2.0 : 1.0;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKeep;')
      .replace('void main() {', 'void main() {\n  if (vKeep < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= vKeep) discard;');
  };
  fadeDepth = m;
  return m;
}
/** a depth-only pass before the colour pass (a section: `Renderer3.draw`) */
function depthFirstMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 iGlow; varying float vKeep;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeep = iGlow.a > 1.5 ? iGlow.a - 2.0 : 1.0;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKeep;')
      .replace('void main() {', 'void main() {\n  if (vKeep < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= vKeep) discard;');
  };
  return m;
}
interface Entry {
  im: THREE.InstancedMesh;
  glow: THREE.InstancedBufferAttribute;
  cap: number;
  /** a moving surface (Mesh.dyn): each drawn vertex's own vertex in the mesh, and the count last uploaded */
  src?: Uint32Array;
  ver?: number;
}

const FINAL_FS = /* glsl */ `
#include <tonemapping_pars_fragment>
uniform sampler2D tColor; uniform sampler2D tAO; uniform float uAO; uniform vec3 uGround; uniform vec2 uRes;
uniform sampler2D tBloom; uniform float uBloom;
uniform vec2 uGlowC; uniform vec2 uGlowR; uniform float uGlow; uniform float uHorizon;
varying vec2 vUv;
// The light a wall-washer throws on the far wall behind the instrument: a scallop, its upper edge a
// parabola over the instrument, brightest under that edge and falling away down the wall and to the sides.
// p: a place on the screen. The scallop's width and fall are the instrument's own box's (uGlowR); its top
// is over the box's, and never so high that the picture's upper edge would cut it.
float scallop(vec2 p) {
  float x = (p.x - uGlowC.x) / uGlowR.x;
  float apex = min(uGlowC.y + 1.05 * uGlowR.y, 0.8);
  float d = (apex - p.y) / uGlowR.y - 0.42 * x * x;
  return smoothstep(-0.16, 0.34, d) * exp(-0.62 * max(0.0, d)) * exp(-0.3 * x * x);
}
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
  // The room behind the instrument. The far wall is the page's own wall (uGround: at the canvas's upper edge
  // it is that colour exactly, so the canvas meets the page without a seam), washed by one scallop of cool
  // light over the instrument. It meets the floor at uHorizon (the screen's height, 0 at the foot; the wall
  // faces the camera, so the line is level): under it the floor, darker, a polished one that returns a
  // little of the lit wall and falls away towards us. A hairline of light where the two meet.
  float top = 1.0 - smoothstep(0.8, 0.985, vUv.y);
  vec3 lamp = vec3(0.112, 0.124, 0.142) * uGlow * top;
  float up = vUv.y - uHorizon;
  vec3 wall = uGround * mix(0.82, 1.0, smoothstep(0.0, 0.16, up)) + lamp * scallop(vUv);
  vec3 floorC = uGround * mix(0.5, 0.72, exp(6.0 * up)) + lamp * scallop(vec2(vUv.x, 2.0 * uHorizon - vUv.y)) * 0.28 * exp(9.0 * up);
  floorC = mix(floorC, uGround, 1.0 - top);
  float px = 1.0 / uRes.y;
  vec3 back = mix(floorC, wall, smoothstep(-px, px, up));
  back += vec3(0.020, 0.024, 0.030) * top * (1.0 - smoothstep(0.0, 1.6 * px, abs(up)));
  gl_FragColor = vec4(mix(back, s, a) + d / 255.0, 1.0);
}`;
const FINAL_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// bloom: a bright-pass at quarter resolution, then a separable blur
const BRIGHT_FS = /* glsl */ `
uniform sampler2D tColor; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i % 2) - 0.5, float(i / 2) - 0.5) * uTexel * 2.0;
    vec4 t = texture2D(tColor, vUv + o);
    // a soft knee, capped: a near-mirror metal's hot spot (hundreds over white) must not flood the
    // blur into a fog ball
    vec3 e = max(t.rgb - vec3(2.2), vec3(0.0));
    c += min(e / (1.0 + e * 0.35), vec3(2.0));
  }
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;
const BLUR_FS = /* glsl */ `
uniform sampler2D tIn; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tIn, vUv).rgb * 0.2270;
  c += (texture2D(tIn, vUv + uDir * 1.3846).rgb + texture2D(tIn, vUv - uDir * 1.3846).rgb) * 0.3162;
  c += (texture2D(tIn, vUv + uDir * 3.2308).rgb + texture2D(tIn, vUv - uDir * 3.2308).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}`;

// a planar mirror (the polished underside of a grand's lid): the scene, drawn from the camera's mirror
// image, added over the lacquer by its Fresnel reflectance (a little over-exposed, as the
// lacquer's view of the studio is: mats3.ts)
const MIRROR_VS = /* glsl */ `
uniform mat4 uTexM; varying vec4 vP; varying vec3 vW; varying vec3 vN;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = uTexM * w; vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0, -1.0, 0.0));
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const MIRROR_FS = /* glsl */ `
uniform sampler2D tMirror; uniform float uK; varying vec4 vP; varying vec3 vW; varying vec3 vN;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec4 c = texture2DProj(tMirror, vP);
  float cosT = abs(dot(normalize(cameraPosition - vW), vN));
  float F = min(0.05 + 0.95 * pow(1.0 - cosT, 5.0), 0.42);
  gl_FragColor = vec4(c.rgb * F * 1.3 * uK, 0.0);
}`;

// the floor: a lit, shadowed surface whose coverage (alpha) fades into the room's own floor with distance;
// on it, the room's light (a spot's pool as large as the room: gl3d's Pool). uPool: its radius, its rim's
// half-width, the light past it (a share of the pool's) and the pool's lift with the sound; uPoolHot:
// the rim brightened while the room's knob is under the pointer, turned or focused
const FLOOR_FADE = /* glsl */ `
uniform vec3 uFloorC; uniform vec2 uFloorR; uniform vec4 uPool; uniform float uPoolHot; uniform vec3 uWall;
varying vec3 vWorldP;`;
const FLOOR_FS = /* glsl */ `
{
  float rr = length((vWorldP - uFloorC).xz);
  float inPool = 1.0 - smoothstep(uPool.x - uPool.y, uPool.x + uPool.y, rr);
  float e = (rr - uPool.x) / max(uPool.y, 1e-3);
  float k = mix(uPool.z, 1.0 + uPool.w, inPool) + uPoolHot * 0.3 * exp(-e * e);
  gl_FragColor.rgb *= k;
  gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr);
  // (the floor ends at the far wall: uWall, its normal in xz and its distance)
  gl_FragColor.a *= 1.0 - smoothstep(-0.03, 0.0, dot(vWorldP.xz, uWall.xy) - uWall.z);
}`;

/** The room that lights the scene and is seen in lacquer and brass: a gallery after closing. Almost all
 *  of it is dark. What is lit: two slots of cool light behind the instrument (the silver light's own
 *  source, tall and narrow: they are the long bright lines down a case's edge, a tube and a bell's rim);
 *  one small tungsten lamp in front and above (the key: a round highlight, not a softbox's window); the
 *  wall behind the camera, washed very dimly (what a piano's black front and a bell's flare return, or
 *  they read as holes: polished metal has no colour but what it reflects); a little of the floor. */
function gallery(): THREE.Scene {
  const s = new THREE.Scene();
  // dark walls and ceiling, a shade of the page's own cool wall
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.011, 0.013, 0.017), side: THREE.BackSide }));
  room.scale.set(30, 14, 30);
  room.position.y = 5;
  s.add(room);
  // the floor: dark, polished
  const flo = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.026, 0.029, 0.034) }));
  flo.rotation.x = -Math.PI / 2;
  flo.position.y = -1.9;
  s.add(flo);
  // a lit surface: brightest in the middle, feathered to nothing over `soft` of its half-size (a
  // hard-edged card reflects as a paper cut-out)
  const panel = (w: number, h: number, c: [number, number, number], k: number, pos: Vec3, look: Vec3, soft = 0.5) => {
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
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  const SILVER: [number, number, number] = [0.8, 0.88, 1];
  const TUNGSTEN: [number, number, number] = [1, 0.84, 0.64];
  // the light from behind: a tall slot behind left (where the silver light itself comes from), a
  // narrower one behind right (the second light's), so both edges of a silhouette catch
  panel(1.5, 10, SILVER, 14, [-6.6, 4.2, 7.6], [0, 1.2, 0], 0.55);
  panel(1.0, 9, SILVER, 8.5, [7.6, 3.2, 6.0], [0, 1.2, 0], 0.55);
  // … and its spill on the wall behind them, low and wide: the line along a lid's edge and a soundboard
  panel(16, 2.6, SILVER, 0.5, [0, 4.6, 11], [0, 1.4, 0], 0.9);
  // the key: one small lamp, front left and above
  panel(2.4, 2.4, TUNGSTEN, 7.5, [-7.2, 5.2, -4.6], [0, 0.6, 0], 0.7);
  // the wall behind the camera, washed so dimly that a body falls off into it: enough that a piano's
  // black front and a bell's flare are not holes
  panel(22, 7, [0.86, 0.9, 1], 0.36, [0, 3.2, -12], [0, 1.4, 0], 0.9);
  // what comes down from above: next to nothing (a head, a lid's top, a key's face)
  panel(9, 9, [0.82, 0.88, 1], 0.26, [0, 9.5, 0], [0, 0, 0], 0.8);
  // the floor in front of the instrument, as the pool lights it: what a case's black front, a bell's
  // underside and a rib's lower edge return (they face down and out, at the floor)
  panel(20, 14, [0.9, 0.92, 1], 0.2, [0, -1.85, -4], [0, 10, -4], 1.0);
  return s;
}

/** The stage's own lights, a whole instrument's (a key's close-up has its own: CLOSE). Directions are
 *  towards the light, in the scene's frame (the audience at −z, so +z is behind the instrument). */
const ROOM = {
  /** the silver light: from behind and above, the one that casts the shadow (forward, towards us); a scene
   *  may point it itself (Batch.key) */
  back: [-0.62, 0.6, 0.72] as Vec3,
  backI: 3.5,
  backC: [0.84, 0.9, 1] as Vec3,
  /** the key: dim, tungsten, across the front from the left and above (most stages are seen from the
   *  right: the light crosses the body and it falls off towards us) */
  key: [-0.72, 0.52, -0.46] as Vec3,
  keyI: 1.1,
  keyC: [1, 0.86, 0.68] as Vec3,
  /** no fill from the front. The third light is a second one from behind, low, on the other side: the
   *  far edge of a silhouette, a case's flank (it casts no shadow) */
  fill: [0.74, 0.34, 0.58] as Vec3,
  fillI: 1.5,
  fillC: [0.84, 0.9, 1] as Vec3,
  /** the generated room's share of the light */
  env: 0.8,
  /** the floor past the pool's rim, as a share of the pool's light */
  dusk: 0.3,
};

/** the light of a piano key's action close up (a section: `Renderer3.closeUp`). Directions are
 *  towards the light, in the scene's own frame for a section cut from the treble end (x is mirrored
 *  for one cut from the bass end), so the key light always comes in through the open side. */
const CLOSE = {
  /** half the width the lights and the shadow map are fitted to (m): the action, key front to dampers */
  radius: 0.5,
  key: [0.6, 0.66, -0.46] as Vec3,
  keyI: 3.1,
  keyC: [1, 0.93, 0.84] as Vec3,
  rim: [0.12, 0.8, 0.58] as Vec3,
  rimI: 0.5,
  rimC: [0.8, 0.88, 1] as Vec3,
  fill: [0.45, 0.12, -0.88] as Vec3,
  fillI: 0.3,
  fillC: [1, 0.9, 0.78] as Vec3,
  env: 0.5,
  exposure: 0.74,
  normalBias: 0.0006,
  near: 0.004,
  /** ambient occlusion radius (m) */
  ao: 0.035,
};

export class Renderer3 {
  readonly r: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** the mirrored world */
  private root = new THREE.Group();
  readonly cam = new THREE.PerspectiveCamera(24, 1, 0.02, 60);
  private rt: THREE.WebGLRenderTarget;
  private gtao: GTAOPass | null = null;
  private final: FullScreenQuad;
  private bloomA: THREE.WebGLRenderTarget;
  private bloomB: THREE.WebGLRenderTarget;
  private brightQ: FullScreenQuad;
  private blurQ: FullScreenQuad;
  private brightMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  /** bloom on the specular hot spots (off on phones) */
  bloom = true;
  private finalMat: THREE.ShaderMaterial;
  /** the light that casts the shadow: the silver one from behind (a key's close-up: its work light) */
  private key: THREE.DirectionalLight;
  /** the second light: the dim tungsten key in front (a close-up: its rim) */
  private rim: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private floor: THREE.Mesh;
  private floorU = { uFloorC: { value: new THREE.Vector3() }, uFloorR: { value: new THREE.Vector2(1, 2) }, uPool: { value: new THREE.Vector4(1e3, 1, 1, 0) }, uPoolHot: { value: 0 }, uWall: { value: new THREE.Vector3(0, 1, 1e6) } };
  /** the room's light pool's rim, brightened (0 … 1: its knob under the pointer, turned or focused) */
  poolHot = 0;
  private entries = new Map<Mesh, Entry>();
  private lineScene = new THREE.Scene();
  private inkL: LineLayer;
  private glowL: LineLayer;
  private wireL: LineLayer;
  private envRT: THREE.WebGLRenderTarget;
  /** the planar mirrors' passes (a grand's lid; two grands in an ensemble): a target, a material and
   *  the surface each */
  private mirrorSlots: { rt: THREE.WebGLRenderTarget; mat: THREE.ShaderMaterial; mesh: THREE.Mesh | null; poly: unknown }[] = [];
  private mirrorCam = new THREE.PerspectiveCamera();
  private lite: boolean;
  private w = 1;
  private h = 1;
  /** shadows (off in the lightest scene) and ambient occlusion (off on phones / slow frames) */
  shadows = true;
  ao = true;
  /** how many planar mirrors (a grand's open lid) the last frame drew */
  mirrored = 0;
  /** a piano key's action close up (0 the whole instrument … 1 the close-up; eased with the camera's
   *  flight): the section's own light, exposure and near plane (see `draw`) */
  closeUp = 0;
  /** the last frame's exposure (1 for a whole instrument; capped in a close-up) */
  exposure = 1;
  /** where the far wall meets the floor on the picture (0 at its foot … 1 at its top; outside that, not in it) */
  horizon = -1;

  static create(canvas: HTMLCanvasElement, lite: boolean): Renderer3 | null {
    try {
      const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      if (!r.capabilities.isWebGL2) {
        r.dispose();
        return null;
      }
      return new Renderer3(r, lite);
    } catch {
      return null;
    }
  }

  private constructor(r: THREE.WebGLRenderer, lite: boolean) {
    this.r = r;
    this.lite = lite;
    r.setPixelRatio(1);
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.autoClear = false;
    this.root.scale.x = -1;
    this.scene.add(this.root);
    // image-based light: the gallery, pre-filtered
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromScene(gallery(), 0.02);
    pm.dispose();
    this.scene.environment = this.envRT.texture;
    setEnvironment(this.envRT.texture);
    this.scene.environmentIntensity = ROOM.env;
    // the silver light from behind (it casts the shadow) and the dim key in front
    this.key = new THREE.DirectionalLight(new THREE.Color(...ROOM.backC), ROOM.backI);
    this.key.castShadow = true;
    const sz = lite ? 1024 : 2048;
    this.key.shadow.mapSize.set(sz, sz);
    this.key.shadow.radius = lite ? 3 : 5;
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.002;
    this.root.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(new THREE.Color(...ROOM.keyC), ROOM.keyI);
    this.root.add(this.rim, this.rim.target);
    // the second light from behind, low (no shadow); no fill
    this.fill = new THREE.DirectionalLight(new THREE.Color(...ROOM.fillC), ROOM.fillI);
    this.root.add(this.fill, this.fill.target);
    // the floor
    // (dark, honed more than polished: it returns the light from behind as a broad sheen, not a glare)
    const fm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.044, 0.046, 0.05), roughness: 0.72, metalness: 0, specularIntensity: 0.18, envMap: this.envRT.texture, envMapIntensity: 0.4, transparent: true, depthWrite: true });
    fm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.floorU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${FLOOR_FADE}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${FLOOR_FS}`);
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), fm);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.renderOrder = -1;
    this.root.add(this.floor);
    // targets
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lite ? 2 : 4, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rt.texture }, tAO: { value: null }, uAO: { value: 0 }, uGround: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2() }, uGlowC: { value: new THREE.Vector2(0.5, 0.5) }, uGlowR: { value: new THREE.Vector2(0.4, 0.5) }, uGlow: { value: 1 }, uHorizon: { value: -1 }, toneMappingExposure: { value: 1.0 } },
      vertexShader: FINAL_VS,
      fragmentShader: FINAL_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.final = new FullScreenQuad(this.finalMat);
    const bo = { type: THREE.HalfFloatType, depthBuffer: false };
    this.bloomA = new THREE.WebGLRenderTarget(1, 1, bo);
    this.bloomB = new THREE.WebGLRenderTarget(1, 1, bo);
    this.brightMat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: this.rt.texture }, uTexel: { value: new THREE.Vector2() } }, vertexShader: FINAL_VS, fragmentShader: BRIGHT_FS, depthTest: false, depthWrite: false });
    this.blurMat = new THREE.ShaderMaterial({ uniforms: { tIn: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: FINAL_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false });
    this.brightQ = new FullScreenQuad(this.brightMat);
    this.blurQ = new FullScreenQuad(this.blurMat);
    this.finalMat.uniforms.tBloom = { value: this.bloomA.texture };
    this.finalMat.uniforms.uBloom = { value: 0 };
    this.bloom = !lite;
    this.wireL = new LineLayer(this.rt.depthTexture!, THREE.NormalBlending, true);
    this.inkL = new LineLayer(this.rt.depthTexture!, THREE.NormalBlending);
    this.glowL = new LineLayer(this.rt.depthTexture!, THREE.AdditiveBlending);
    this.wireL.mesh.renderOrder = 0;
    this.inkL.mesh.renderOrder = 1;
    this.glowL.mesh.renderOrder = 2;
    this.lineScene.add(this.wireL.mesh, this.inkL.mesh, this.glowL.mesh);
    this.ao = !lite;
  }

  private entry(m: Mesh, need: number): Entry {
    let e = this.entries.get(m);
    if (e && e.cap >= need) return e;
    const cap = Math.max(need, e ? e.cap * 2 : need);
    let geo: THREE.BufferGeometry;
    let mats: THREE.Material[];
    let src = e?.src;
    const ver = e ? e.ver : m.dyn;
    if (e) {
      geo = e.im.geometry;
      mats = e.im.material as THREE.Material[];
      this.root.remove(e.im);
      e.im.dispose();
    } else ({ geo, mats, src } = toGeometry(m, this.lite));
    const glow = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    glow.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iGlow', glow);
    const im = new THREE.InstancedMesh(geo, mats, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    im.castShadow = true;
    im.receiveShadow = true;
    if (m.fade) im.customDepthMaterial = fadeDepthMaterial();
    this.root.add(im);
    this.cold = true;
    this.still = 0;
    this.fresh = true;
    e = { im, glow, cap, src: m.dyn !== undefined ? src : undefined, ver };
    this.entries.set(m, e);
    return e;
  }

  private clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  private clipPlanes = [this.clipPlane];
  private sectioned = false;
  /** cut the scene at the section's plane, or stop. The plane is each material's own (not the
   *  renderer's), so that the shadow pass is cut by it too: the parts cut away cast no shadow across
   *  the section, and the key light can model what is left */
  private section(on: boolean): void {
    if (!on && !this.sectioned) return;
    this.sectioned = on;
    this.r.localClippingEnabled = on;
    const want = on ? this.clipPlanes : null;
    for (const e of this.entries.values())
      for (const m of e.im.material as THREE.Material[])
        if (m.clippingPlanes !== want) {
          m.clippingPlanes = want;
          m.clipShadows = on;
        }
    if (this.gtao) this.gtao.normalMaterial.clippingPlanes = want;
    this.depthPre.clippingPlanes = want;
  }
  /** depth alone, drawn first in a section (see `draw`): pushed back a hair, so that the colour pass,
   *  whose shaders differ, never loses the comparison with its own surface; a dissolving part's
   *  screen-door as in its colour pass */
  private depthPre = depthFirstMaterial();
  /** a mesh made (`entry`) since the last frame drew: its materials may need programs */
  private fresh = false;
  /** the materials whose programs the driver is still compiling, and since when (ms) */
  private compiling: { mats: Set<THREE.Material>; t0: number } | null = null;
  /** the last frame was held back (`hold`): nothing was drawn, the canvas shows the frame before */
  held = false;

  /** Whether to hold this frame back while a new instrument's programs compile. three.js compiles a
   *  material's program the first time it draws it, and waits for the driver there: the first frame
   *  of each instrument in 3D froze the page (≈ 250 ms of a 440 ms task for the grand on a fast
   *  computer, 870 ms on a phone's CPU). Its programs are sent first (`compile`), and with
   *  KHR_parallel_shader_compile the driver compiles them off the page's thread while the page goes
   *  on; the frame is drawn once they are ready, as it would have been, only without the freeze (and
   *  in any case within 1.5 s). Without the extension a program counts as ready at once: as before. */
  private hold(): boolean {
    const r = this.r;
    if (this.fresh) {
      this.fresh = false;
      // (as the scene's pass draws: into the HDR target, the section's plane on or off as it is)
      r.setRenderTarget(this.rt);
      const mats = new Set<THREE.Material>();
      for (const e of this.entries.values()) if (e.im.visible) for (const m of e.im.material as THREE.Material[]) mats.add(m);
      r.compile(this.scene, this.cam);
      this.compiling = { mats, t0: performance.now() };
    }
    const c = this.compiling;
    this.held = false;
    if (!c) return false;
    for (const m of c.mats) {
      const p = (r.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
      if (!p || p.isReady()) c.mats.delete(m);
    }
    if (c.mats.size && performance.now() - c.t0 < 1500) return (this.held = true);
    this.compiling = null;
    return false;
  }

  /** the materials whose section shaders are compiled or queued (`warmSection`) */
  private warmed = new WeakSet<THREE.Material>();
  /** the materials still to compile, each on a part that draws with it */
  private warmQ: { geo: THREE.BufferGeometry; m: THREE.Material }[] = [];
  /** the passes drawn with one material over the whole scene still to compile (`warmSection`) */
  private warmPasses = false;
  /** a mesh made (`entry`) since the section's shaders were last looked for */
  private cold = false;
  /** frames drawn since the last mesh was made (the warming waits for the scene to settle) */
  private still = 0;
  /** the section's shadow pass: a depth material for each side a part casts from (`warmSection`) */
  private warmDepth = new Map<THREE.Side, THREE.MeshDepthMaterial>();

  /** Compile, in the background, the shaders a section draws with, before it is first drawn. A clipping
   *  plane is part of every material's program: switched on, every material of the scene, the shadow
   *  pass's, the depth-first pass's and the occlusion's normals each need a program of their own (36
   *  for a grand), and three.js compiled them as the first section frame drew, synchronously: a click
   *  on a key froze the stage for ≈ 200 ms (330 ms on a phone's CPU) before the flight began.
   *  Compiled here ahead, a few a frame (with KHR_parallel_shader_compile the driver compiles them off
   *  the page's thread; without it the commands are sent and the GPU process works through them
   *  meanwhile), the first section frame only selects them. Nothing is drawn, and the materials are
   *  left as they were. Called after each frame while a piano shows whole; nothing to do, it returns
   *  at once. */
  warmSection(): void {
    if (this.sectioned) return;
    if (this.cold && ++this.still >= 20) {
      this.cold = false;
      for (const e of this.entries.values())
        for (const m of e.im.material as THREE.Material[])
          if (!this.warmed.has(m)) {
            this.warmed.add(m);
            this.warmQ.push({ geo: e.im.geometry, m });
            this.warmPasses = true;
          }
    }
    if (!this.warmQ.length && !this.warmPasses) return;
    const r = this.r;
    const was = r.getRenderTarget();
    // (the scene draws into the HDR target: its programs are keyed by that target's colour space)
    r.setRenderTarget(this.rt);
    this.section(true);
    const tmp = new THREE.Group();
    try {
      if (this.warmQ.length) {
        // the colour pass: four of the scene's materials, cut, each on a part of its own
        // (section() has given them the plane)
        for (const { geo, m } of this.warmQ.splice(0, 4)) tmp.add(new THREE.InstancedMesh(geo, m, 1));
      } else {
        this.warmPasses = false;
        // the passes drawn with one material over the whole scene (depth first; the occlusion's
        // normals), on a part and on the floor; and the shadow pass's depth, on each side a part
        // casts from (a dissolving part's own screen-door too)
        const first = this.entries.values().next().value;
        if (!first) return;
        const geo = first.im.geometry;
        const over: THREE.Material[] = [this.depthPre];
        if (this.gtao) over.push(this.gtao.normalMaterial);
        for (const m of over) tmp.add(new THREE.InstancedMesh(geo, m, 1), new THREE.Mesh(this.floor.geometry, m));
        const flip = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide } as Record<THREE.Side, THREE.Side>;
        const sides = new Set<THREE.Side>();
        let fade = false;
        for (const e of this.entries.values()) {
          if (e.im.customDepthMaterial) fade = true;
          for (const m of e.im.material as THREE.Material[]) sides.add(m.shadowSide ?? flip[m.side]);
        }
        for (const side of sides) {
          let d = this.warmDepth.get(side);
          if (!d) this.warmDepth.set(side, (d = new THREE.MeshDepthMaterial({ side })));
          d.clippingPlanes = this.clipPlanes;
          d.clipShadows = true;
          tmp.add(new THREE.InstancedMesh(geo, d, 1));
        }
        if (fade) {
          const fd = fadeDepthMaterial();
          const side = fd.side;
          fd.clippingPlanes = this.clipPlanes;
          fd.clipShadows = true;
          r.compile(new THREE.InstancedMesh(geo, fd, 1), this.cam, this.scene);
          fd.clippingPlanes = null;
          fd.side = side;
        }
      }
      r.compile(tmp, this.cam, this.scene);
    } finally {
      this.section(false);
      r.setRenderTarget(was);
    }
  }
  /** review shots (scripts/review-3d.mjs SECTION=x): a section without a zoomed key */
  debugClip: { at: number; side: 1 | -1 } | null = null;
  /** the view-projection the lines and picks use (world, unmirrored, → clip) */
  readonly vp = new THREE.Matrix4();

  draw(b: Batch, eye: Vec3, target: Vec3, fovDeg: number, w: number, h: number, ground: [number, number, number]): void {
    const r = this.r;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      r.setSize(w, h, false);
      this.rt.setSize(w, h);
      this.bloomA.setSize(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4)));
      this.bloomB.setSize(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4)));
      // big canvases (high-DPR laptops): 2× multisampling is enough at that pixel density
      const ms = w * h > 2.6e6 ? 2 : this.lite ? 2 : 4;
      if (this.rt.samples !== ms) {
        this.rt.samples = ms;
        this.rt.dispose();
      }
      // occlusion is low-frequency: half resolution
      this.gtao?.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    }
    // instances
    const used = new Set<Mesh>();
    for (const m of b.meshes()) {
      const buf = b.inst.get(m)!;
      const n = buf.n / 20;
      if (!n || !m.count) continue;
      const e = this.entry(m, n);
      used.add(m);
      const im = e.im;
      // a moving surface: its new positions and normals
      if (m.dyn !== undefined && e.src && e.ver !== m.dyn) {
        e.ver = m.dyn;
        const pa = im.geometry.getAttribute('position') as THREE.BufferAttribute;
        const na = im.geometry.getAttribute('normal') as THREE.BufferAttribute;
        const P = pa.array as Float32Array;
        const N = na.array as Float32Array;
        const d = m.data;
        const src = e.src;
        for (let o = 0; o < src.length; o++) {
          const q = src[o] * 14;
          P[o * 3] = d[q];
          P[o * 3 + 1] = d[q + 1];
          P[o * 3 + 2] = d[q + 2];
          N[o * 3] = d[q + 3];
          N[o * 3 + 1] = d[q + 4];
          N[o * 3 + 2] = d[q + 5];
        }
        pa.needsUpdate = true;
        na.needsUpdate = true;
      }
      const A = im.instanceMatrix.array as Float32Array;
      const G = e.glow.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const o = i * 20;
        for (let k = 0; k < 16; k++) A[i * 16 + k] = buf.a[o + k];
        G[i * 4] = buf.a[o + 16];
        G[i * 4 + 1] = buf.a[o + 17];
        G[i * 4 + 2] = buf.a[o + 18];
        G[i * 4 + 3] = buf.a[o + 19];
      }
      im.count = n;
      im.instanceMatrix.clearUpdateRanges();
      im.instanceMatrix.addUpdateRange(0, n * 16);
      im.instanceMatrix.needsUpdate = true;
      e.glow.clearUpdateRanges();
      e.glow.addUpdateRange(0, n * 4);
      e.glow.needsUpdate = true;
      im.visible = true;
    }
    for (const [m, e] of this.entries) if (!used.has(m)) e.im.visible = false;
    // a section (a key's action close up) cuts the whole scene, the shadow and occlusion passes included
    const clip = b.clip ?? this.debugClip;
    if (clip) {
      // (the root is mirrored in x: keep side·(x − at) ≤ 0 ⇔ side·X + side·at ≥ 0 in three's world)
      this.clipPlane.normal.set(clip.side, 0, 0);
      this.clipPlane.constant = clip.side * clip.at;
    }
    this.section(!!clip);
    // lights fitted to the scene: the silver light from behind and above (it casts the shadow, forward;
    // a scene's own direction for it: Batch.key), a second from behind on the other side, the dim key
    // across the front, no fill.
    // In a key's close-up (k → 1) they are the section's own, as a workbench is lit: the shadow's light
    // from the open side, above and in front (whichever end the section was cut from), warm, fitted to
    // the action so its shadow map resolves a jack; the other two, which cast no shadow and would shine
    // through the keys left standing, turned down; the room's ambient too, so the one light models the parts
    const { c, r: rad } = b.bounds;
    const k = clip && b.clip ? Math.max(0, Math.min(1, this.closeUp)) : 0;
    const mix = (a: number, z: number) => a + (z - a) * k;
    const side = clip ? clip.side : 1;
    const C = new THREE.Vector3(mix(c[0], target[0]), mix(c[1], target[1]), mix(c[2], target[2]));
    const radL = mix(rad, CLOSE.radius);
    const dir = (a: Vec3, z: Vec3) => new THREE.Vector3(mix(a[0], z[0] * side), mix(a[1], z[1]), mix(a[2], z[2])).normalize();
    const mixC = (l: THREE.DirectionalLight, a: Vec3, z: Vec3) => l.color.setRGB(mix(a[0], z[0]), mix(a[1], z[1]), mix(a[2], z[2]));
    // (a scene may point the light itself: Batch.key, a glockenspiel's, set for the sheen along its steel)
    const keyDir = dir(b.key ?? ROOM.back, CLOSE.key);
    this.key.position.copy(C).add(keyDir.clone().multiplyScalar(radL * 3));
    this.key.target.position.copy(C);
    this.key.intensity = mix(ROOM.backI, CLOSE.keyI);
    mixC(this.key, ROOM.backC, CLOSE.keyC);
    // the section's cut faces all face its open side: lit alike, by the key and the studio (mats3.ts)
    SECTION.light.value = (this.key.intensity * Math.max(0.15, keyDir.x * side)) / Math.PI + 0.3 * mix(1, CLOSE.env);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -radL * 1.05;
    sc.right = sc.top = radL * 1.05;
    sc.near = radL * 0.5;
    sc.far = radL * 6;
    sc.updateProjectionMatrix();
    // (the offset along the normal is in metres: 2 mm for a case, a fraction of a jack's width close up)
    this.key.shadow.normalBias = mix(0.002, CLOSE.normalBias);
    this.key.castShadow = this.shadows;
    this.rim.position.copy(C).add(dir(ROOM.key, CLOSE.rim).multiplyScalar(radL * 3));
    this.rim.target.position.copy(C);
    this.rim.intensity = mix(ROOM.keyI, CLOSE.rimI);
    mixC(this.rim, ROOM.keyC, CLOSE.rimC);
    this.fill.position.copy(C).add(dir(ROOM.fill, CLOSE.fill).multiplyScalar(radL * 3));
    this.fill.target.position.copy(C);
    this.fill.intensity = mix(ROOM.fillI, CLOSE.fillI);
    // (close up, warm: a cool fill turned pale wood in the work light's shadow olive)
    mixC(this.fill, ROOM.fillC, CLOSE.fillC);
    this.scene.environmentIntensity = mix(ROOM.env, CLOSE.env);
    // floor
    const f = b.floor;
    this.floor.visible = !!f;
    if (f) {
      this.floor.position.set(f.c[0], f.y, f.c[2]);
      this.floorU.uFloorC.value.set(-f.c[0], f.y, f.c[2]);
      this.floorU.uFloorR.value.set(f.r0, f.r1);
      // (no pool: the whole floor as one, as an ensemble's)
      const p = f.pool;
      if (p) this.floorU.uPool.value.set(p.R, p.soft, ROOM.dusk, p.lift);
      else this.floorU.uPool.value.set(1e3, 1, 1, 0);
      this.floorU.uPoolHot.value = p ? this.poolHot : 0;
    }
    // camera (in the mirrored world)
    this.cam.fov = fovDeg;
    this.cam.aspect = w / h;
    // (close up the camera is centimetres from the parts, and may be brought nearer: the near plane
    // comes in with it, so nothing in front of the lens is cut)
    this.cam.near = mix(Math.max(0.01, rad * 0.02), CLOSE.near);
    this.cam.far = rad * 40 + 10;
    this.cam.position.set(-eye[0], eye[1], eye[2]);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(-target[0], target[1], target[2]);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    this.vp.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    // The far wall: upright, facing the camera, behind the instrument at a distance that grows with the
    // room (a small room's wall 1.9 of the instrument's radius from its middle, the largest's 2.65: past
    // the pool at its largest, so the room's knob stays on the floor). Where it meets the floor is a level
    // line on the screen (`horizon`, 0 at the foot … 1; under the picture in a key's close-up, over it from straight above).
    {
      const fwd = this.cam.getWorldDirection(new THREE.Vector3());
      fwd.y = 0;
      const flat = fwd.lengthSq();
      const fc = f ? new THREE.Vector3(-f.c[0], f.y, f.c[2]) : new THREE.Vector3(-c[0], c[1] - rad, c[2]);
      // (an orchestra, which has no pool: its wall close behind its last row)
      const wallR = f?.pool ? f.pool.R + 0.77 * f.pool.Rmax : rad * 1.25;
      if (flat > 1e-6) {
        fwd.multiplyScalar(1 / Math.sqrt(flat));
        const P = fc.clone().addScaledVector(fwd, wallR);
        this.floorU.uWall.value.set(fwd.x, fwd.z, fwd.x * P.x + fwd.z * P.z);
        // (flying into a close-up the line sinks out of the picture: there the wall is all there is)
        this.horizon = mix(P.project(this.cam).y * 0.5 + 0.5, -1);
      } else {
        this.floorU.uWall.value.set(0, 1, 1e6);
        this.horizon = 2;
      }
    }
    // a new instrument's shaders: compiled in parallel, the frame held (the canvas keeps its last
    // picture) until they are ready (`held`)
    if (this.hold()) return;
    // the lids' mirrors: the scene from the camera's mirror image, cut at the mirror's plane
    const mirrored = clip ? 0 : this.drawMirrors(b, w, h);
    this.mirrored = mirrored;
    // (the shadow map was drawn with the mirrors' first pass)
    r.shadowMap.autoUpdate = mirrored === 0;
    // scene → HDR target
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    if (clip) {
      // A section looks across the keyboard: up to 88 keys' parts stand one behind another, and every
      // one of them would be shaded (felt, wood, the shadow's filter) only to be drawn over. Depth
      // first, then colour where it shows.
      this.scene.overrideMaterial = this.depthPre;
      r.render(this.scene, this.cam);
      this.scene.overrideMaterial = null;
      // (the shadow map was drawn with that pass)
      r.shadowMap.autoUpdate = false;
    }
    r.render(this.scene, this.cam);
    r.shadowMap.autoUpdate = true;
    for (const ms of this.mirrorSlots) if (ms.mesh) ms.mesh.visible = false;
    // ambient occlusion (its radius scales with the instrument)
    let aoTex: THREE.Texture | null = null;
    if (this.ao) {
      if (!this.gtao) {
        this.gtao = new GTAOPass(this.scene, this.cam, Math.ceil(w / 2), Math.ceil(h / 2));
        this.gtao.output = GTAOPass.OUTPUT.Off;
      }
      // (close up, the occlusion of a part by its neighbour: centimetres, not the case's decimetres)
      this.gtao.updateGtaoMaterial({ radius: mix(rad * 0.09, CLOSE.ao), distanceExponent: 1.5, thickness: mix(rad * 0.06, CLOSE.ao * 0.7), scale: 1.1, samples: 12 });
      // (the denoiser blurs only along a surface: a neighbour more than 1 % of the instrument's size off
      // the pixel's own plane is left out. At the pass's default, 2 m, it mixed the occlusion of whatever
      // stood in front into what lay behind, a different mix at every pixel: an upright's damper levers,
      // seen between the hammer shanks, were peppered grey)
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: mix(rad * 0.01, CLOSE.ao * 0.1), normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.gtao.render(r, null as unknown as THREE.WebGLRenderTarget, this.rt, 0, false);
      aoTex = this.gtao.pdRenderTarget.texture;
    }
    // tone map, occlusion, composite over the page's ground → canvas
    const u = this.finalMat.uniforms;
    u.tAO.value = aoTex ?? this.rt.texture;
    // bloom: bright-pass → blur (horizontal, vertical, twice)
    if (this.bloom) {
      const bw = this.bloomA.width;
      const bh = this.bloomA.height;
      this.brightMat.uniforms.uTexel.value.set(1 / w, 1 / h);
      r.setRenderTarget(this.bloomA);
      this.brightQ.render(r);
      for (let k = 0; k < 2; k++) {
        this.blurMat.uniforms.tIn.value = this.bloomA.texture;
        this.blurMat.uniforms.uDir.value.set((1 + k) / bw, 0);
        r.setRenderTarget(this.bloomB);
        this.blurQ.render(r);
        this.blurMat.uniforms.tIn.value = this.bloomB.texture;
        this.blurMat.uniforms.uDir.value.set(0, (1 + k) / bh);
        r.setRenderTarget(this.bloomA);
        this.blurQ.render(r);
      }
    }
    u.uBloom.value = this.bloom ? 0.35 : 0;
    // exposure: capped in the close-up, where pale felt and bare wood fill the frame under the key
    // light (at the whole instrument's exposure they clip to white)
    u.toneMappingExposure.value = this.exposure = mix(1, CLOSE.exposure);
    u.uAO.value = aoTex ? 1 : 0;
    u.uGround.value.setRGB(ground[0], ground[1], ground[2]);
    u.uRes.value.set(w, h);
    // (the room is the whole instrument's: flying into a key's close-up its wall's light goes out)
    u.uHorizon.value = this.horizon;
    u.uGlow.value = 1 - k;
    // the backdrop's light centred a little above the instrument's middle, sized to it on screen
    {
      const pc = new THREE.Vector3(-c[0], c[1] + rad * 0.15, c[2]).project(this.cam);
      const pr = new THREE.Vector3(-c[0], c[1] + rad * 1.15, c[2]).project(this.cam);
      const ry = Math.max(0.25, Math.min(0.9, Math.abs(pr.y - pc.y) * 0.5 * 1.6));
      u.uGlowC.value.set(pc.x * 0.5 + 0.5, pc.y * 0.5 + 0.5);
      u.uGlowR.value.set((ry * h) / w * 1.3, ry);
    }
    r.setRenderTarget(null);
    r.clear(true, true, false);
    this.final.render(r);
    // the lines on top, tested against the scene's depth
    const vpArr = this.vp.elements as unknown as Mat4;
    const py = this.cam.projectionMatrix.elements[5];
    // −2fn/(f−n): how clip z moves with view depth (the lines' depth bias is in metres)
    const pz = this.cam.projectionMatrix.elements[14];
    const dt = this.rt.depthTexture!;
    // (a mirror's pass has sent them already)
    const fresh = mirrored === 0;
    this.wireL.set(b.wireL, vpArr, w, h, py, pz, dt, fresh);
    this.inkL.set(b.inkL, vpArr, w, h, py, pz, dt, fresh);
    this.glowL.set(b.glow, vpArr, w, h, py, pz, dt, fresh);
    r.render(this.lineScene, this.cam);
  }

  /** the most planar mirrors drawn in a frame (each is a pass of the whole scene) */
  static readonly MIRRORS = 2;

  /** render the batch's mirrors (if any) into their targets and pose their surfaces; how many */
  private drawMirrors(b: Batch, w: number, h: number): number {
    const n = Math.min(Renderer3.MIRRORS, b.mirrors.length);
    for (let i = n; i < this.mirrorSlots.length; i++) if (this.mirrorSlots[i].mesh) this.mirrorSlots[i].mesh!.visible = false;
    // pose every surface first: each pass leaves all of them out
    const posed: boolean[] = [];
    for (let i = 0; i < n; i++) posed.push(this.poseMirror(i, b.mirrors[i]));
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (!posed[i]) continue;
      // (the first pass draws the shadow map; the others reuse it)
      if (drawn) this.r.shadowMap.autoUpdate = false;
      this.drawMirror(i, b, w, h, drawn === 0);
      drawn++;
    }
    this.r.shadowMap.autoUpdate = true;
    for (let i = 0; i < n; i++) if (posed[i]) this.mirrorSlots[i].mesh!.visible = true;
    return drawn;
  }

  /** the i-th mirror's slot, made when first needed */
  private mirrorSlot(i: number) {
    while (this.mirrorSlots.length <= i) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
      const mat = new THREE.ShaderMaterial({
        uniforms: { tMirror: { value: rt.texture }, uTexM: { value: new THREE.Matrix4() }, uK: { value: 1 } },
        vertexShader: MIRROR_VS,
        fragmentShader: MIRROR_FS,
        clipping: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      });
      this.mirrorSlots.push({ rt, mat, mesh: null, poly: null });
    }
    return this.mirrorSlots[i];
  }

  /** place the i-th mirror's surface; false (and hidden) when there is nothing to mirror */
  private poseMirror(i: number, mi: Mirror): boolean {
    const slot = this.mirrorSlot(i);
    if (mi.k <= 0) {
      if (slot.mesh) slot.mesh.visible = false;
      return false;
    }
    if (slot.poly !== mi.poly) {
      // (a new outline: a rebuilt model)
      slot.poly = mi.poly;
      const g = new THREE.ShapeGeometry(new THREE.Shape(mi.poly.map(([x, z]) => new THREE.Vector2(x, z))));
      const P = g.attributes.position;
      for (let k = 0; k < P.count; k++) P.setXYZ(k, P.getX(k), mi.y, P.getY(k));
      if (slot.mesh) {
        slot.mesh.geometry.dispose();
        slot.mesh.geometry = g;
      } else {
        slot.mesh = new THREE.Mesh(g, slot.mat);
        slot.mesh.matrixAutoUpdate = false;
        slot.mesh.frustumCulled = false;
        slot.mesh.renderOrder = 5;
        this.root.add(slot.mesh);
      }
    }
    const mesh = slot.mesh!;
    mesh.matrix.fromArray(mi.m);
    mesh.updateMatrixWorld(true);
    // seen from behind (above an open lid): nothing to mirror
    const p0 = new THREE.Vector3(mi.poly[0][0], mi.y, mi.poly[0][1]).applyMatrix4(mesh.matrixWorld);
    const nrm = new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
    if (this.cam.position.clone().sub(p0).dot(nrm) <= 0) {
      mesh.visible = false;
      return false;
    }
    // (hidden while any mirror's pass draws: shown again after them all)
    mesh.visible = false;
    return true;
  }

  /** render the i-th mirror (posed) into its target; `first`: the frame's first pass (it sends the
   *  lines' buffers, the later ones draw them again) */
  private drawMirror(i: number, b: Batch, w: number, h: number, first: boolean): void {
    const mi = b.mirrors[i];
    const slot = this.mirrorSlots[i];
    const mesh = slot.mesh!;
    // (at the canvas's own size up to ≈ 2 MP: a polished lid's image is sharp)
    const ms = w * h > 2.2e6 ? 0.5 : 1;
    const mw = Math.max(1, Math.ceil(w * ms));
    const mh = Math.max(1, Math.ceil(h * ms));
    // (no multisampling: resolving a second multisampled target with a depth texture cost ≈ 2.5 ms a frame)
    if (slot.rt.width !== mw || slot.rt.height !== mh) slot.rt.setSize(mw, mh);
    // the plane (three's world): a point on it and its normal, towards the side it reflects
    const p0 = new THREE.Vector3(mi.poly[0][0], mi.y, mi.poly[0][1]).applyMatrix4(mesh.matrixWorld);
    const n = new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
    const cam = this.cam;
    const eye = cam.position.clone();
    const reflect = (v: THREE.Vector3) => v.sub(n.clone().multiplyScalar(2 * v.clone().sub(p0).dot(n)));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const vc = this.mirrorCam;
    const vEye = reflect(eye.clone());
    const vAt = reflect(eye.clone().add(fwd));
    vc.position.copy(vEye);
    vc.up.copy(reflect(eye.clone().add(up)).sub(vEye));
    vc.lookAt(vAt);
    vc.projectionMatrix.copy(cam.projectionMatrix);
    vc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    vc.near = cam.near;
    vc.far = cam.far;
    vc.updateMatrixWorld();
    // (the virtual camera sees the mirror image left-right flipped relative to the surface; the
    // texture matrix carries a point of the surface to where the virtual camera drew what it reflects)
    (slot.mat.uniforms.uTexM.value as THREE.Matrix4).set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    slot.mat.uniforms.uK.value = Math.max(0, Math.min(1, mi.k));
    // draw without the mirror's own body (the lid: it stands between the virtual camera and the
    // scene; everything else of a grand is on the reflecting side). Hidden, not clipped: a clipping
    // plane switched on and off within a frame makes three re-select every material's program twice
    const r = this.r;
    const body = mi.body ? this.entries.get(mi.body)?.im : undefined;
    if (body) body.visible = false;
    r.setRenderTarget(slot.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(this.scene, vc);
    // the strings (lines), from the same virtual camera, behind what the mirror pass drew nearer
    {
      const mvp = new THREE.Matrix4().multiplyMatrices(vc.projectionMatrix, vc.matrixWorldInverse).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      const a = mvp.elements as unknown as Mat4;
      const py = vc.projectionMatrix.elements[5];
      const pz = vc.projectionMatrix.elements[14];
      // (by the target's own depth test, not its depth texture: sampling the depth this pass is
      // bound to is a feedback loop, and the browser drops the draw)
      this.wireL.set(b.wireL, a, mw, mh, py, pz, null, first);
      this.inkL.set(b.inkL, a, mw, mh, py, pz, null, first);
      this.glowL.set(b.glow, a, mw, mh, py, pz, null, first);
      r.render(this.lineScene, vc);
    }
    if (body) body.visible = true;
  }

  /** read a pixel of the canvas (tests): must be called right after draw */
  readPixel(x: number, y: number, out: Uint8Array): void {
    const gl = this.r.getContext();
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  }

  dispose(): void {
    for (const e of this.entries.values()) {
      e.im.geometry.dispose();
      e.im.dispose();
    }
    this.entries.clear();
    disposeMaterials();
    this.gtao?.dispose();
    this.rt.dispose();
    this.envRT.dispose();
    for (const ms of this.mirrorSlots) {
      ms.rt.dispose();
      ms.mat.dispose();
      ms.mesh?.geometry.dispose();
    }
    this.depthPre.dispose();
    this.final.dispose();
    this.finalMat.dispose();
    this.bloomA.dispose();
    this.bloomB.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.wireL.dispose();
    this.inkL.dispose();
    this.glowL.dispose();
    this.r.dispose();
    this.r.forceContextLoss();
  }
}

/** a mesh's triangles grouped by material: position, normal, uv and the part's own coordinates */
function toGeometry(m: Mesh, lite: boolean): { geo: THREE.BufferGeometry; mats: THREE.Material[]; src: Uint32Array } {
  const n = m.count;
  const d = m.data;
  const ids = m.mats ?? new Uint16Array(n);
  const loc = m.loc;
  const byMat = new Map<number, number[]>();
  for (let t = 0; t < n; t += 3) {
    const id = ids[t];
    let l = byMat.get(id);
    if (!l) byMat.set(id, (l = []));
    l.push(t);
  }
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const lc = new Float32Array(n * 3);
  const src = new Uint32Array(n);
  const geo = new THREE.BufferGeometry();
  const mats: THREE.Material[] = [];
  let o = 0;
  for (const [id, tris] of byMat) {
    const start = o;
    for (const t of tris) {
      // three.js lights a double-sided face by its winding: wind each triangle so that its front
      // faces the way its normals point (the builders give normals; their winding was free)
      const a = t * 14;
      const b = (t + 1) * 14;
      const c = (t + 2) * 14;
      const e1x = d[b] - d[a], e1y = d[b + 1] - d[a + 1], e1z = d[b + 2] - d[a + 2];
      const e2x = d[c] - d[a], e2y = d[c + 1] - d[a + 1], e2z = d[c + 2] - d[a + 2];
      const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const nx = d[a + 3] + d[b + 3] + d[c + 3], ny = d[a + 4] + d[b + 4] + d[c + 4], nz = d[a + 5] + d[b + 5] + d[c + 5];
      const order = fx * nx + fy * ny + fz * nz < 0 ? [0, 2, 1] : [0, 1, 2];
      for (const k of order) {
        const v = t + k;
        const s = v * 14;
        src[o] = v;
        pos[o * 3] = d[s];
        pos[o * 3 + 1] = d[s + 1];
        pos[o * 3 + 2] = d[s + 2];
        nrm[o * 3] = d[s + 3];
        nrm[o * 3 + 1] = d[s + 4];
        nrm[o * 3 + 2] = d[s + 5];
        uv[o * 2] = d[s + 12];
        uv[o * 2 + 1] = d[s + 13];
        if (loc) {
          lc[o * 3] = loc[v * 3];
          lc[o * 3 + 1] = loc[v * 3 + 1];
          lc[o * 3 + 2] = loc[v * 3 + 2];
        } else {
          lc[o * 3] = d[s];
          lc[o * 3 + 1] = d[s + 1];
          lc[o * 3 + 2] = d[s + 2];
        }
        o++;
      }
    }
    geo.addGroup(start * 1, o - start, mats.length);
    mats.push(materialFor(MAT_LIST[id], lite));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aLoc', new THREE.BufferAttribute(lc, 3));
  if (m.dyn !== undefined) for (const a of ['position', 'normal']) (geo.getAttribute(a) as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  return { geo, mats, src };
}

/** camera-facing ribbons (the old line shader), hidden where the scene is nearer. Over the
 *  composited picture that is a comparison with the scene's depth texture (`mat`); inside a pass that
 *  still has its depth attached (the lid's mirror) it is the depth buffer's own test (`matZ`, which
 *  has no sampler at all: a pass must never sample the depth it is bound to) */
class LineLayer {
  mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private ib: THREE.InterleavedBuffer;
  private idx: THREE.BufferAttribute;
  private mat: THREE.RawShaderMaterial;
  private matZ: THREE.RawShaderMaterial;
  constructor(depth: THREE.DepthTexture, blending: THREE.Blending, wire = false) {
    this.ib = new THREE.InterleavedBuffer(new Float32Array(15 * 1024), 15);
    this.ib.setUsage(THREE.DynamicDrawUsage);
    this.idx = new THREE.BufferAttribute(new Uint32Array(3 * 1024), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    this.bind();
    const uniforms = { uVP: { value: new THREE.Matrix4() }, uHalf: { value: new THREE.Vector2(1, 1) }, tDepth: { value: depth }, uRes: { value: new THREE.Vector2(1, 1) }, uProjY: { value: 1 }, uProjZ: { value: 0 }, uWire: { value: wire ? 1 : 0 } };
    const base = {
      glslVersion: THREE.GLSL3,
      vertexShader: LINE_VS,
      fragmentShader: LINE_FS,
      transparent: true,
      depthWrite: false,
      // a ribbon's winding depends on its direction on screen
      side: THREE.DoubleSide,
      blending,
    };
    this.mat = new THREE.RawShaderMaterial({ ...base, uniforms, defines: { DEPTH_TEX: 1 }, depthTest: false });
    // (the same uniform values; this program has no tDepth or uRes to take)
    const { tDepth: _t, uRes: _r, ...rest } = uniforms;
    this.matZ = new THREE.RawShaderMaterial({ ...base, uniforms: rest, depthTest: true, depthFunc: THREE.LessEqualDepth });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  private bind(): void {
    const ib = this.ib;
    this.geo.setAttribute('aPos', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    this.geo.setAttribute('aPrev', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    this.geo.setAttribute('aNext', new THREE.InterleavedBufferAttribute(ib, 3, 6));
    this.geo.setAttribute('aSide', new THREE.InterleavedBufferAttribute(ib, 1, 9));
    this.geo.setAttribute('aColor', new THREE.InterleavedBufferAttribute(ib, 4, 10));
    this.geo.setAttribute('aWidth', new THREE.InterleavedBufferAttribute(ib, 1, 14));
    // three needs a `position` to count vertices; aPos doubles as it
    this.geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    this.geo.setIndex(this.idx);
  }
  /** `depth`: the scene's depth texture to test against, or null inside a pass that has its depth
   *  attached (then the buffer's own test). `fresh`: the lines are new this frame (a frame's later
   *  passes draw the same ones from another camera: nothing to send again) */
  set(ls: LineSet, vp: Mat4, w: number, h: number, projY: number, projZ: number, depth: THREE.DepthTexture | null, fresh = true): void {
    this.mesh.material = depth ? this.mat : this.matZ;
    if (depth) this.mat.uniforms.tDepth.value = depth;
    this.mat.uniforms.uProjY.value = projY;
    this.mat.uniforms.uProjZ.value = projZ;
    (this.mat.uniforms.uVP.value as THREE.Matrix4).fromArray(vp);
    this.mat.uniforms.uHalf.value.set(w / 2, h / 2);
    this.mat.uniforms.uRes.value.set(w, h);
    const nf = ls.lv.n;
    const ni = ls.li.n;
    this.mesh.visible = ni > 0;
    if (!ni || !fresh) return;
    if (nf > this.ib.array.length || ni > this.idx.array.length) {
      this.geo.dispose();
      this.geo = new THREE.BufferGeometry();
      this.ib = new THREE.InterleavedBuffer(new Float32Array(Math.max(nf, this.ib.array.length * 2)), 15);
      this.ib.setUsage(THREE.DynamicDrawUsage);
      this.idx = new THREE.BufferAttribute(new Uint32Array(Math.max(ni, this.idx.array.length * 2)), 1);
      this.idx.setUsage(THREE.DynamicDrawUsage);
      this.bind();
      this.mesh.geometry = this.geo;
    }
    (this.ib.array as Float32Array).set(ls.lv.a.subarray(0, nf));
    this.ib.clearUpdateRanges();
    this.ib.addUpdateRange(0, nf);
    this.ib.needsUpdate = true;
    (this.idx.array as Uint32Array).set(ls.li.a.subarray(0, ni));
    this.idx.clearUpdateRanges();
    this.idx.addUpdateRange(0, ni);
    this.idx.needsUpdate = true;
    this.geo.setDrawRange(0, ni);
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.matZ.dispose();
  }
}
