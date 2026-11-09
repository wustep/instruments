// The 3D stage's renderer, on three.js. It draws what a scene puts in a `Batch` (gl3d.ts) each frame:
// static meshes posed by model matrices (drawn instanced), and the live lines (strings' glow,
// stopping marks, breath, wavefronts).
//
// The look is a studio product shot: an image-based light from a generated studio (a large overhead
// softbox, a key softbox, two strip lights for the rims, dark walls), a warm key light with a soft
// shadow, a cool rim light, ground-truth ambient occlusion (GTAO) so parts sit together, AgX tone
// mapping, and a floor that takes the shadow and occlusion and fades into the page's own ground.
// The scene renders into an HDR target (multisampled); a last pass applies the occlusion, tone maps,
// and composites over the ground; the lines are drawn on top, tested against the scene's depth.
//
// The scenes are laid out with the bass at −x; seen from the player's side (−z) that would put the
// bass on the right, so the whole world is mirrored in x (as a parent group, which three.js renders
// correctly: it flips the winding for mirrored objects).
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Batch, Mat4, Mesh, Vec3 } from './gl3d.ts';
import { LINE_FS, LINE_VS, type LineSet } from './gl3d.ts';
import { disposeMaterials, materialFor, setEnvironment } from './mats3.ts';
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
interface Entry {
  im: THREE.InstancedMesh;
  glow: THREE.InstancedBufferAttribute;
  cap: number;
}

const FINAL_FS = /* glsl */ `
#include <tonemapping_pars_fragment>
uniform sampler2D tColor; uniform sampler2D tAO; uniform float uAO; uniform vec3 uGround; uniform vec2 uRes;
uniform sampler2D tBloom; uniform float uBloom;
uniform vec2 uGlowC; uniform vec2 uGlowR; uniform float uGlow;
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
  // the backdrop: a seamless studio wall lit softly behind the instrument, falling off to the page's
  // own ground at the edges (so the canvas still meets the page without a seam)
  vec2 q = (vUv - uGlowC) / uGlowR;
  vec3 back = uGround + vec3(0.085, 0.077, 0.068) * uGlow * exp(-dot(q, q));
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

// the floor: a lit, shadowed surface whose coverage (alpha) fades into the ground with distance
const FLOOR_FADE = /* glsl */ `
uniform vec3 uFloorC; uniform vec2 uFloorR;
varying vec3 vWorldP;`;

/** a studio to light the scene with (and to see reflected in lacquer and brass) */
function studio(): THREE.Scene {
  const s = new THREE.Scene();
  // dark walls: polished metal and lacquer read through contrast, bright cards against black
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.019, 0.018), side: THREE.BackSide }));
  room.scale.set(30, 14, 30);
  room.position.y = 5;
  s.add(room);
  // a floor a little lighter than the walls (the bounce under an instrument)
  const flo = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.07, 0.06, 0.05) }));
  flo.rotation.x = -Math.PI / 2;
  flo.position.y = -1.9;
  s.add(flo);
  // a softbox: brightest in the middle, feathered to nothing over `soft` of its half-size (a real
  // diffuser's falloff; a hard-edged card reflects as a paper cut-out)
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
  // as a product studio lights lacquer and metal: a large overhead softbox; a key softbox front
  // left; a wide, feathered card behind the camera (a piano's black front and a bell's flare need
  // something bright to reflect, or they read as holes); tall strips behind left and right for the
  // rims, and two beside the camera for the long highlights down tubes and case edges; a low cool
  // card in front
  panel(10, 7, [1, 0.96, 0.9], 2.4, [0, 9, -0.5], [0, 0, 0], 0.45);
  panel(5, 4, [1, 0.9, 0.78], 6.5, [-6, 5, -6], [0, 0, 0], 0.4);
  panel(20, 7, [1, 0.97, 0.93], 1.5, [0, 3.6, -11], [0, 1.4, 0], 0.9);
  panel(1.3, 9, [0.85, 0.9, 1], 7, [-8, 3, 7], [0, 1, 0], 0.5);
  panel(1.3, 9, [0.85, 0.9, 1], 5.5, [8, 3, 6], [0, 1, 0], 0.5);
  panel(1.6, 8, [1, 0.95, 0.88], 3.2, [-10, 3, -3], [0, 1, 0], 0.6);
  panel(1.6, 8, [0.9, 0.94, 1], 2.4, [10, 3, -4], [0, 1, 0], 0.6);
  panel(9, 1.8, [0.7, 0.78, 0.9], 0.9, [0, 0.4, -9], [0, 1, 0], 0.6);
  // the lit floor in front of the instrument: what a piano's vertical black front, a bell's underside
  // and a rib's lower edge reflect (they face down and out, at the floor, not at the softboxes)
  panel(22, 16, [1, 0.93, 0.84], 0.55, [0, -1.85, -5], [0, 10, -5], 1.0);
  return s;
}

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
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;
  private floor: THREE.Mesh;
  private floorU = { uFloorC: { value: new THREE.Vector3() }, uFloorR: { value: new THREE.Vector2(1, 2) } };
  private entries = new Map<Mesh, Entry>();
  private lineScene = new THREE.Scene();
  private inkL: LineLayer;
  private glowL: LineLayer;
  private wireL: LineLayer;
  private envRT: THREE.WebGLRenderTarget;
  private mirrorRT: THREE.WebGLRenderTarget | null = null;
  private mirror: THREE.Mesh | null = null;
  private mirrorPoly: unknown = null;
  private mirrorCam = new THREE.PerspectiveCamera();
  private mirrorMat: THREE.ShaderMaterial | null = null;
  private lite: boolean;
  private w = 1;
  private h = 1;
  /** shadows (off in the lightest scene) and ambient occlusion (off on phones / slow frames) */
  shadows = true;
  ao = true;
  /** whether the last frame drew a planar mirror (a grand's open lid) */
  mirrored = false;

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
    // image-based light: the studio, pre-filtered
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromScene(studio(), 0.02);
    pm.dispose();
    this.scene.environment = this.envRT.texture;
    setEnvironment(this.envRT.texture);
    this.scene.environmentIntensity = 1.0;
    // key (warm, soft shadow) and rim (cool, from behind)
    this.key = new THREE.DirectionalLight(new THREE.Color(1, 0.93, 0.84), 2.6);
    this.key.castShadow = true;
    const sz = lite ? 1024 : 2048;
    this.key.shadow.mapSize.set(sz, sz);
    this.key.shadow.radius = lite ? 3 : 5;
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.002;
    this.root.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(new THREE.Color(0.8, 0.88, 1), 1.6);
    this.root.add(this.rim, this.rim.target);
    // a soft fill from the other side, low (no shadow)
    this.fill = new THREE.DirectionalLight(new THREE.Color(0.9, 0.92, 1), 0.55);
    this.root.add(this.fill, this.fill.target);
    // the floor
    const fm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.075, 0.062, 0.05), roughness: 0.8, metalness: 0, specularIntensity: 0.25, envMap: this.envRT.texture, envMapIntensity: 0.35, transparent: true, depthWrite: true });
    fm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.floorU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${FLOOR_FADE}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n{ float rr = length((vWorldP - uFloorC).xz); gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr); }`);
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), fm);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.renderOrder = -1;
    this.root.add(this.floor);
    // targets
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lite ? 2 : 4, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rt.texture }, tAO: { value: null }, uAO: { value: 0 }, uGround: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2() }, uGlowC: { value: new THREE.Vector2(0.5, 0.5) }, uGlowR: { value: new THREE.Vector2(0.4, 0.5) }, uGlow: { value: 1 }, toneMappingExposure: { value: 1.0 } },
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
    if (e) {
      geo = e.im.geometry;
      mats = e.im.material as THREE.Material[];
      this.root.remove(e.im);
      e.im.dispose();
    } else ({ geo, mats } = toGeometry(m, this.lite));
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
    e = { im, glow, cap };
    this.entries.set(m, e);
    return e;
  }

  private clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
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
    // lights fitted to the scene: the key from the front left, above; the rim from behind right
    const { c, r: rad } = b.bounds;
    const C = new THREE.Vector3(c[0], c[1], c[2]);
    this.key.position.copy(C).add(new THREE.Vector3(0.55, 0.78, -0.5).normalize().multiplyScalar(rad * 3));
    this.key.target.position.copy(C);
    const sc = this.key.shadow.camera;
    sc.left = sc.bottom = -rad * 1.05;
    sc.right = sc.top = rad * 1.05;
    sc.near = rad * 0.5;
    sc.far = rad * 6;
    sc.updateProjectionMatrix();
    // a section (a key's action close up) cuts the whole scene, the occlusion's passes included; the
    // parts cut away would still cast shadows across the cut, so the key light casts none meanwhile
    const clip = b.clip ?? this.debugClip;
    this.key.castShadow = this.shadows && !clip;
    if (clip) {
      // (the root is mirrored in x: keep side·(x − at) ≤ 0 ⇔ side·X + side·at ≥ 0 in three's world)
      this.clipPlane.normal.set(clip.side, 0, 0);
      this.clipPlane.constant = clip.side * clip.at;
      if (this.r.clippingPlanes.length !== 1) this.r.clippingPlanes = [this.clipPlane];
    } else if (this.r.clippingPlanes.length) this.r.clippingPlanes = [];
    this.rim.position.copy(C).add(new THREE.Vector3(-0.6, 0.5, 0.75).normalize().multiplyScalar(rad * 3));
    this.rim.target.position.copy(C);
    this.fill.position.copy(C).add(new THREE.Vector3(-0.8, 0.25, -0.55).normalize().multiplyScalar(rad * 3));
    this.fill.target.position.copy(C);
    // floor
    const f = b.floor;
    this.floor.visible = !!f;
    if (f) {
      this.floor.position.set(f.c[0], f.y, f.c[2]);
      this.floorU.uFloorC.value.set(-f.c[0], f.y, f.c[2]);
      this.floorU.uFloorR.value.set(f.r0, f.r1);
    }
    // camera (in the mirrored world)
    this.cam.fov = fovDeg;
    this.cam.aspect = w / h;
    this.cam.near = Math.max(0.01, rad * 0.02);
    this.cam.far = rad * 40 + 10;
    this.cam.position.set(-eye[0], eye[1], eye[2]);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(-target[0], target[1], target[2]);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    this.vp.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    // the lid's mirror: the scene from the camera's mirror image, cut at the mirror's plane
    const mirrored = !clip && this.drawMirror(b, w, h);
    this.mirrored = mirrored;
    // (the shadow map was drawn with the mirror's pass)
    r.shadowMap.autoUpdate = !mirrored;
    // scene → HDR target
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(this.scene, this.cam);
    r.shadowMap.autoUpdate = true;
    if (this.mirror) this.mirror.visible = false;
    // ambient occlusion (its radius scales with the instrument)
    let aoTex: THREE.Texture | null = null;
    if (this.ao) {
      if (!this.gtao) {
        this.gtao = new GTAOPass(this.scene, this.cam, Math.ceil(w / 2), Math.ceil(h / 2));
        this.gtao.output = GTAOPass.OUTPUT.Off;
      }
      this.gtao.updateGtaoMaterial({ radius: rad * 0.09, distanceExponent: 1.5, thickness: rad * 0.06, scale: 1.1, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
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
    u.uAO.value = aoTex ? 1 : 0;
    u.uGround.value.setRGB(ground[0], ground[1], ground[2]);
    u.uRes.value.set(w, h);
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
    this.wireL.set(b.wireL, vpArr, w, h, py, pz, dt);
    this.inkL.set(b.inkL, vpArr, w, h, py, pz, dt);
    this.glowL.set(b.glow, vpArr, w, h, py, pz, dt);
    r.render(this.lineScene, this.cam);
  }

  /** render the batch's mirror (if any) into its target and pose the mirror's surface; false if none */
  private drawMirror(b: Batch, w: number, h: number): boolean {
    const mi = b.mirror;
    if (!mi || mi.k <= 0) {
      if (this.mirror) this.mirror.visible = false;
      return false;
    }
    if (!this.mirrorRT) {
      this.mirrorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
      this.mirrorMat = new THREE.ShaderMaterial({
        uniforms: { tMirror: { value: this.mirrorRT.texture }, uTexM: { value: new THREE.Matrix4() }, uK: { value: 1 } },
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
    }
    if (this.mirrorPoly !== mi.poly) {
      // (a new outline: a rebuilt model)
      this.mirrorPoly = mi.poly;
      const g = new THREE.ShapeGeometry(new THREE.Shape(mi.poly.map(([x, z]) => new THREE.Vector2(x, z))));
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i), mi.y, P.getY(i));
      if (this.mirror) {
        this.mirror.geometry.dispose();
        this.mirror.geometry = g;
      } else {
        this.mirror = new THREE.Mesh(g, this.mirrorMat!);
        this.mirror.matrixAutoUpdate = false;
        this.mirror.frustumCulled = false;
        this.mirror.renderOrder = 5;
        this.root.add(this.mirror);
      }
    }
    const mesh = this.mirror!;
    mesh.matrix.fromArray(mi.m);
    mesh.updateMatrixWorld(true);
    // (at the canvas's own size up to ≈ 2 MP: a polished lid's image is sharp)
    const ms = w * h > 2.2e6 ? 0.5 : 1;
    const mw = Math.max(1, Math.ceil(w * ms));
    const mh = Math.max(1, Math.ceil(h * ms));
    // (no multisampling: resolving a second multisampled target with a depth texture cost ≈ 2.5 ms a frame)
    if (this.mirrorRT.width !== mw || this.mirrorRT.height !== mh) this.mirrorRT.setSize(mw, mh);
    // the plane (three's world): a point on it and its normal, towards the side it reflects
    const p0 = new THREE.Vector3(mi.poly[0][0], mi.y, mi.poly[0][1]).applyMatrix4(mesh.matrixWorld);
    const n = new THREE.Vector3(0, -1, 0).transformDirection(mesh.matrixWorld);
    const cam = this.cam;
    const eye = cam.position.clone();
    // seen from behind (above an open lid): nothing to mirror
    if (eye.clone().sub(p0).dot(n) <= 0) {
      mesh.visible = false;
      return false;
    }
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
    (this.mirrorMat!.uniforms.uTexM.value as THREE.Matrix4).set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    this.mirrorMat!.uniforms.uK.value = Math.max(0, Math.min(1, mi.k));
    // draw without the mirror's own body (the lid: it stands between the virtual camera and the
    // scene; everything else of a grand is on the reflecting side). Hidden, not clipped: a clipping
    // plane switched on and off within a frame makes three re-select every material's program twice
    const r = this.r;
    const body = mi.body ? this.entries.get(mi.body)?.im : undefined;
    if (body) body.visible = false;
    mesh.visible = false;
    r.setRenderTarget(this.mirrorRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(this.scene, vc);
    // the strings (lines), from the same virtual camera, against the mirror pass's depth
    {
      const mvp = new THREE.Matrix4().multiplyMatrices(vc.projectionMatrix, vc.matrixWorldInverse).multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      const a = mvp.elements as unknown as Mat4;
      const py = vc.projectionMatrix.elements[5];
      const pz = vc.projectionMatrix.elements[14];
      const d = this.mirrorRT.depthTexture!;
      this.wireL.set(b.wireL, a, mw, mh, py, pz, d);
      this.inkL.set(b.inkL, a, mw, mh, py, pz, d);
      this.glowL.set(b.glow, a, mw, mh, py, pz, d);
      r.render(this.lineScene, vc);
    }
    if (body) body.visible = true;
    mesh.visible = true;
    return true;
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
    this.mirrorRT?.dispose();
    this.mirrorMat?.dispose();
    this.mirror?.geometry.dispose();
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
function toGeometry(m: Mesh, lite: boolean): { geo: THREE.BufferGeometry; mats: THREE.Material[] } {
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
  return { geo, mats };
}

/** camera-facing ribbons (the old line shader), drawn over the composited picture, hidden where the
 *  scene is nearer (its depth texture) */
class LineLayer {
  mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private ib: THREE.InterleavedBuffer;
  private idx: THREE.BufferAttribute;
  private mat: THREE.RawShaderMaterial;
  constructor(depth: THREE.DepthTexture, blending: THREE.Blending, wire = false) {
    this.ib = new THREE.InterleavedBuffer(new Float32Array(15 * 1024), 15);
    this.ib.setUsage(THREE.DynamicDrawUsage);
    this.idx = new THREE.BufferAttribute(new Uint32Array(3 * 1024), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    this.bind();
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LINE_VS,
      fragmentShader: LINE_FS,
      uniforms: { uVP: { value: new THREE.Matrix4() }, uHalf: { value: new THREE.Vector2(1, 1) }, tDepth: { value: depth }, uRes: { value: new THREE.Vector2(1, 1) }, uProjY: { value: 1 }, uProjZ: { value: 0 }, uWire: { value: wire ? 1 : 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // a ribbon's winding depends on its direction on screen
      side: THREE.DoubleSide,
      blending,
    });
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
  set(ls: LineSet, vp: Mat4, w: number, h: number, projY: number, projZ: number, depth: THREE.DepthTexture): void {
    this.mat.uniforms.tDepth.value = depth;
    this.mat.uniforms.uProjY.value = projY;
    this.mat.uniforms.uProjZ.value = projZ;
    const nf = ls.lv.n;
    const ni = ls.li.n;
    this.mesh.visible = ni > 0;
    if (!ni) return;
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
    (this.mat.uniforms.uVP.value as THREE.Matrix4).fromArray(vp);
    this.mat.uniforms.uHalf.value.set(w / 2, h / 2);
    this.mat.uniforms.uRes.value.set(w, h);
  }
  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
