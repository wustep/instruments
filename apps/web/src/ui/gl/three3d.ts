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
import { LIVE, disposeMaterials, materialFor } from './mats3.ts';
import { MAT_LIST } from './mesh.ts';

interface Entry {
  im: THREE.InstancedMesh;
  glow: THREE.InstancedBufferAttribute;
  cap: number;
}

const FINAL_FS = /* glsl */ `
#include <tonemapping_pars_fragment>
uniform sampler2D tColor; uniform sampler2D tAO; uniform float uAO; uniform vec3 uGround; uniform vec2 uRes;
varying vec2 vUv;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec4 c = texture2D(tColor, vUv);
  float a = clamp(c.a, 0.0, 1.0);
  vec3 col = a > 1e-4 ? c.rgb / a : vec3(0.0);
  float ao = texture2D(tAO, vUv).r;
  col *= mix(1.0, ao, uAO);
  vec3 s = toSRGB(NeutralToneMapping(col));
  // a little dither against banding in the dark gradients
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  gl_FragColor = vec4(mix(uGround, s, a) + d / 255.0, 1.0);
}`;
const FINAL_VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// the floor: a lit, shadowed surface whose coverage (alpha) fades into the ground with distance
const FLOOR_FADE = /* glsl */ `
uniform vec3 uFloorC; uniform vec2 uFloorR;
varying vec3 vWorldP;`;

/** a studio to light the scene with (and to see reflected in lacquer and brass) */
function studio(): THREE.Scene {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.032, 0.03), side: THREE.BackSide }));
  room.scale.set(30, 14, 30);
  room.position.y = 5;
  s.add(room);
  // a floor a little lighter than the walls (the bounce under an instrument)
  const flo = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.052, 0.045) }));
  flo.rotation.x = -Math.PI / 2;
  flo.position.y = -1.9;
  s.add(flo);
  const panel = (w: number, h: number, c: [number, number, number], k: number, pos: Vec3, look: Vec3) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0] * k, c[1] * k, c[2] * k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    s.add(m);
  };
  // as a product studio lights metal: a large overhead softbox; a key softbox front left; a wide,
  // soft card behind the camera (polished brass and silver need something bright to reflect, or
  // they read as dark mirrors of the walls); tall strips behind left and right for the rims; a
  // low cool card in front; a faint floor bounce
  panel(9, 6, [1, 0.96, 0.9], 2.6, [0, 9, -0.5], [0, 0, 0]);
  panel(4.5, 3.5, [1, 0.9, 0.78], 5, [-6, 5, -6], [0, 0, 0]);
  panel(16, 4.5, [1, 0.97, 0.93], 0.75, [0, 3.2, -11], [0, 1.4, 0]);
  panel(1.2, 9, [0.85, 0.9, 1], 5, [-8, 3, 7], [0, 1, 0]);
  panel(1.2, 9, [0.85, 0.9, 1], 4, [8, 3, 6], [0, 1, 0]);
  panel(8, 1.6, [0.7, 0.78, 0.9], 0.8, [0, 0.4, -9], [0, 1, 0]);
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
  private lite: boolean;
  private w = 1;
  private h = 1;
  /** shadows (off in the lightest scene) and ambient occlusion (off on phones / slow frames) */
  shadows = true;
  ao = true;

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
    const fm = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.018, 0.016, 0.014), roughness: 0.85, metalness: 0, specularIntensity: 0.35, envMapIntensity: 0.35, transparent: true, depthWrite: true });
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
      uniforms: { tColor: { value: this.rt.texture }, tAO: { value: null }, uAO: { value: 0 }, uGround: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2() }, toneMappingExposure: { value: 1.0 } },
      vertexShader: FINAL_VS,
      fragmentShader: FINAL_FS,
      depthTest: false,
      depthWrite: false,
    });
    this.final = new FullScreenQuad(this.finalMat);
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
    this.root.add(im);
    e = { im, glow, cap };
    this.entries.set(m, e);
    return e;
  }

  /** the view-projection the lines and picks use (world, unmirrored, → clip) */
  readonly vp = new THREE.Matrix4();

  draw(b: Batch, eye: Vec3, target: Vec3, fovDeg: number, w: number, h: number, ground: [number, number, number]): void {
    const r = this.r;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      r.setSize(w, h, false);
      this.rt.setSize(w, h);
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
    // live overlays
    LIVE.uAmp.value.set(b.ov.amps);
    LIVE.uMN.value.set(b.ov.mn);
    LIVE.uModalHot.value.setRGB(b.ov.modalHot[0], b.ov.modalHot[1], b.ov.modalHot[2], THREE.SRGBColorSpace);
    LIVE.uModalGain.value = b.ov.modalGain;
    LIVE.uWave.value.set(b.ov.wave);
    LIVE.uWaveCol.value.setRGB(b.ov.waveCol[0], b.ov.waveCol[1], b.ov.waveCol[2], THREE.SRGBColorSpace);
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
    this.key.castShadow = this.shadows;
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
    // scene → HDR target
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(this.scene, this.cam);
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
    u.uAO.value = aoTex ? 1 : 0;
    u.uGround.value.setRGB(ground[0], ground[1], ground[2]);
    u.uRes.value.set(w, h);
    r.setRenderTarget(null);
    r.clear(true, true, false);
    this.final.render(r);
    // the lines on top, tested against the scene's depth
    const vpArr = this.vp.elements as unknown as Mat4;
    const py = this.cam.projectionMatrix.elements[5];
    this.wireL.set(b.wireL, vpArr, w, h, py);
    this.inkL.set(b.inkL, vpArr, w, h, py);
    this.glowL.set(b.glow, vpArr, w, h, py);
    r.render(this.lineScene, this.cam);
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
    this.final.dispose();
    this.finalMat.dispose();
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
      uniforms: { uVP: { value: new THREE.Matrix4() }, uHalf: { value: new THREE.Vector2(1, 1) }, tDepth: { value: depth }, uRes: { value: new THREE.Vector2(1, 1) }, uProjY: { value: 1 }, uWire: { value: wire ? 1 : 0 } },
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
  set(ls: LineSet, vp: Mat4, w: number, h: number, projY: number): void {
    this.mat.uniforms.uProjY.value = projY;
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
