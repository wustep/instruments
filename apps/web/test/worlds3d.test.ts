// The themes' 3D worlds (themes/<id>/world.ts, ui/gl/world.ts), without WebGL. Night Bench's is the
// measure: its shaders are the renderer's as they were before there were worlds (the text below is that
// renderer's, kept here), and so are its lights' numbers. Every world is whole: a room that builds, GLSL
// whose uniforms it makes and sets, risers of materials there are. And what a world changes of the
// instruments (the materials' share of the room, the ring's colour, the lines over a harp and a bowed
// string) follows the theme while the stage shows, and comes back.
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { VisualFrame } from '@piano-model/engine';
import { BOWED } from '../../../packages/engine/src/core/bowed.ts';
import { THEMES, setTheme, theme } from '../src/themes/index.ts';
import { WORLDS, world, worldOf } from '../src/themes/worlds.ts';
import { DAY, dayEnv } from '../src/themes/day-studio/world.ts';
import { Batch, type Vec3 } from '../src/ui/gl/gl3d.ts';
import { M } from '../src/ui/gl/mesh.ts';
import { disposeMaterials, materialFor, setEnvironment, setLook, turnEnvironment } from '../src/ui/gl/mats3.ts';
import { RING_MAX, RING_TINT, ringRGBA } from '../src/ui/gl/ring-glow.ts';
import { buildHarpModel, poseHarp } from '../src/ui/gl/harp3d.ts';
import { buildBowedModel, poseBowed } from '../src/ui/gl/strings3d.ts';
import { FINAL_VS, MIRROR_VS, brightFS, finalFS, floorPars, mirrorFS, type Frame3, type Uniforms } from '../src/ui/gl/world.ts';

/** GLSL as the compiler reads it: no comments, no layout */
const glsl = (g: string): string =>
  g
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([;{}(),=+\-*/<>])\s*/g, '$1')
    .trim();

// ---- the renderer's shaders before there were worlds (three3d.ts on main), word for word
const MAIN = {
  FINAL_FS: `
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
}`,
  FINAL_VS: `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  BRIGHT_FS: `
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
}`,
  MIRROR_VS: `
uniform mat4 uTexM; varying vec4 vP; varying vec3 vW; varying vec3 vN;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = uTexM * w; vW = w.xyz; vN = normalize(mat3(modelMatrix) * vec3(0.0, -1.0, 0.0));
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
  MIRROR_FS: `
uniform sampler2D tMirror; uniform float uK; varying vec4 vP; varying vec3 vW; varying vec3 vN;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec4 c = texture2DProj(tMirror, vP);
  float cosT = abs(dot(normalize(cameraPosition - vW), vN));
  float F = min(0.05 + 0.95 * pow(1.0 - cosT, 5.0), 0.42);
  gl_FragColor = vec4(c.rgb * F * 1.3 * uK, 0.0);
}`,
  FLOOR_FADE: `
uniform vec3 uFloorC; uniform vec2 uFloorR; uniform vec4 uPool; uniform float uPoolHot;
varying vec3 vWorldP;`,
  FLOOR_FS: `
{
  float rr = length((vWorldP - uFloorC).xz);
  float inPool = 1.0 - smoothstep(uPool.x - uPool.y, uPool.x + uPool.y, rr);
  float e = (rr - uPool.x) / max(uPool.y, 1e-3);
  float k = mix(uPool.z, 1.0 + uPool.w, inPool) + uPoolHot * 0.3 * exp(-e * e);
  gl_FragColor.rgb *= k;
  gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr);
}`,
};

/** a frame as the renderer tells a world of it: the grand's home view over a floor with a pool */
function frame(over: Partial<Frame3> = {}): Frame3 {
  const cam = new THREE.PerspectiveCamera(24, 1440 / 551, 0.05, 80);
  cam.position.set(-3.2, 2.6, -5.4);
  cam.lookAt(0, 0.7, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const k = over.k ?? 0;
  return { cam, w: 1440, h: 551, c: [0, 0.8, 0.2], rad: 1.6, floor: { y: 0, c: [0, 0, 0.2], r0: 6, r1: 9, pool: { R: 2.2, Rmax: 3.4, soft: 0.5, lift: 0.1 } }, key: null, k, mix: (a, z) => a + (z - a) * k, up: 1, lit: 1, ...over };
}
const finite = (u: Uniforms): boolean =>
  Object.values(u).every(({ value: v }) => {
    const xs: number[] = typeof v === 'number' ? [v] : v?.elements ? [...v.elements] : v?.toArray ? v.toArray() : [];
    return xs.every(Number.isFinite);
  });
/** the names a GLSL chunk declares as uniforms */
const declared = (g: string): string[] => [...g.replace(/\/\/[^\n]*/g, '').matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]);

afterEach(() => {
  setTheme('night-bench', false);
});

describe('Night Bench’s 3D world is the stage as it was', () => {
  const w = WORLDS['night-bench'];

  it('its shaders are the renderer’s own before there were worlds, word for word (comments and layout aside)', () => {
    expect(glsl(finalFS(w.final))).toBe(glsl(MAIN.FINAL_FS));
    expect(glsl(FINAL_VS)).toBe(glsl(MAIN.FINAL_VS));
    expect(glsl(brightFS(w.bloom.over))).toBe(glsl(MAIN.BRIGHT_FS));
    expect(glsl(MIRROR_VS)).toBe(glsl(MAIN.MIRROR_VS));
    expect(glsl(mirrorFS(w.mirror))).toBe(glsl(MAIN.MIRROR_FS));
    expect(glsl(floorPars(w.floor))).toBe(glsl(MAIN.FLOOR_FADE));
    expect(glsl(w.floor.body)).toBe(glsl(MAIN.FLOOR_FS));
  });

  it('its lights, floor, bloom and exposure are that stage’s numbers', () => {
    const L = w.lights;
    expect(L.key).toEqual({ dir: [0.55, 0.78, -0.5], color: [1, 0.93, 0.84], intensity: 2.6 });
    expect(L.rim).toEqual({ dir: [-0.6, 0.5, 0.75], color: [0.8, 0.88, 1], intensity: 1.6 });
    expect(L.fill).toEqual({ dir: [-0.8, 0.25, -0.55], color: [0.9, 0.92, 1], intensity: 0.55, close: [1, 0.9, 0.78] });
    expect([L.env, L.wait, L.bearing]).toEqual([1, 1, undefined]);
    expect(L.shadow).toEqual({ radius: 5, lite: 3, depth: 1 });
    expect([w.exposure, w.bloom.over, w.bloom.strength, w.mirror.most, w.mirror.gain, w.glow]).toEqual([1, 2.2, 0.35, 0.42, 1.3, 'added']);
    const f = w.floor;
    expect([f.color, f.roughness, f.specular, f.env, f.past, f.lift, f.wash]).toEqual([[0.075, 0.062, 0.05], 0.8, 0.25, 0.35, 0.5, 1, 0]);
    expect(f.uniforms).toBeUndefined();
    expect(w.materials).toEqual({});
    expect(w.riser).toEqual({ top: 'caseInner', side: 'caseRaw' });
  });

  it('its room is the studio: dark walls, a floor, nine cards of light, none of them added', () => {
    const room = w.room();
    const meshes = room.children as THREE.Mesh[];
    expect(meshes.length).toBe(11);
    expect((meshes[0].material as THREE.MeshBasicMaterial).color.toArray()).toEqual([0.02, 0.019, 0.018]);
    expect((meshes[1].material as THREE.MeshBasicMaterial).color.toArray()).toEqual([0.07, 0.06, 0.05]);
    for (const m of meshes.slice(2)) expect((m.material as THREE.MeshBasicMaterial).blending).toBe(THREE.NormalBlending);
    // the key softbox, front left: its middle is its colour times its strength
    const col = meshes[3].geometry.getAttribute('color');
    let mx = 0;
    for (let i = 0; i < col.count; i++) mx = Math.max(mx, col.getX(i));
    expect(mx).toBeCloseTo(6.5, 6);
  });

  it('its marks are the stage’s: a warm ring, a pale mark on the harp, vermilion and amber over a bowed string', () => {
    expect(w.ring).toEqual([1, 0.78, 0.5]);
    expect(w.harp).toEqual({ mark: [1, 0.94, 0.82], lit: [0.5, 0.45, 0.35], own: 0.5 });
    expect(w.bowed).toEqual({ sound: '255,94,56', ring: '242,166,70', bowing: [0.18, 0.45], ringing: [0.12, 0.4], stop: [[0.24, 14], [0.9, 6], [0.7, 2.5]], shape: 0.85 });
  });

  it('the backdrop’s light stands a little over the instrument’s middle, sized to it on the picture', () => {
    const u = w.final.uniforms();
    const f = frame();
    w.frame({ floor: {}, final: u }, f);
    const pc = new THREE.Vector3(-f.c[0], f.c[1] + f.rad * 0.15, f.c[2]).project(f.cam);
    const pr = new THREE.Vector3(-f.c[0], f.c[1] + f.rad * 1.15, f.c[2]).project(f.cam);
    const ry = Math.max(0.25, Math.min(0.9, Math.abs(pr.y - pc.y) * 0.5 * 1.6));
    expect(u.uGlowC.value.toArray()).toEqual([pc.x * 0.5 + 0.5, pc.y * 0.5 + 0.5]);
    expect(u.uGlowR.value.toArray()).toEqual([(ry * f.h) / f.w * 1.3, ry]);
    expect(u.uGlow.value).toBe(1);
  });
});

describe('every theme has a 3D world, and each is whole', () => {
  it('one world a theme, each its own', () => {
    expect(Object.keys(WORLDS).sort()).toEqual(THEMES.map((t) => t.id).sort());
    for (const t of THEMES) expect(worldOf(t.id).id).toBe(t.id);
    expect(world().id).toBe(theme().id);
  });

  for (const t of THEMES) {
    const w = WORLDS[t.id];
    it(`${t.name}: a room that builds; shaders whose uniforms it makes; a frame that sets them`, () => {
      const room = w.room();
      let meshes = 0;
      room.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      expect(meshes).toBeGreaterThan(5);
      // the last pass and the floor: what the world's GLSL declares, the world makes (or the renderer has)
      const fu = w.final.uniforms();
      const xu = w.floor.uniforms?.() ?? {};
      for (const n of declared(w.final.pars)) expect(Object.keys(fu), `${n} of the last pass`).toContain(n);
      for (const n of declared(w.floor.pars)) expect(Object.keys(xu), `${n} of the floor`).toContain(n);
      const fs = finalFS(w.final);
      expect(fs).toContain('gl_FragColor');
      expect(fs.split('gl_FragColor =').length).toBe(2);
      expect(w.floor.body).toContain('gl_FragColor.a *=');
      // a whole instrument, a key's close-up, an orchestra (no pool), no floor at all, straight down
      const down = frame();
      down.cam.position.set(0, 8, 0.2);
      down.cam.lookAt(0, 0, 0.2);
      down.cam.updateMatrixWorld();
      for (const f of [frame(), frame({ k: 1 }), frame({ floor: { y: 0, c: [0, 0, 0], r0: 8, r1: 12, pool: null } }), frame({ floor: null }), frame({ key: [-0.25, 0.9, -0.35] }), frame({ up: 0, lit: w.lights.wait }), down]) {
        w.frame({ floor: xu, final: fu }, f);
        expect(finite(fu) && finite(xu)).toBe(true);
      }
    });

    it(`${t.name}: lights that point somewhere, risers of materials there are, marks in colour`, () => {
      const L = w.lights;
      for (const l of [L.key, L.rim, L.fill]) {
        expect(Math.hypot(...l.dir)).toBeGreaterThan(0.5);
        expect(l.intensity).toBeGreaterThan(0);
        for (const c of [...l.color, ...(l.close ?? [])]) expect(c >= 0 && c <= 1).toBe(true);
      }
      // (the key casts the shadow: it comes from above)
      expect(L.key.dir[1]).toBeGreaterThan(0.4);
      expect(L.wait > 0 && L.wait <= 1).toBe(true);
      expect(L.shadow.lite).toBeLessThanOrEqual(L.shadow.radius);
      expect(L.shadow.depth > 0 && L.shadow.depth <= 1).toBe(true);
      expect(M[w.riser.top]).toBeDefined();
      expect(M[w.riser.side]).toBeDefined();
      for (const c of [...w.ring, ...w.harp.mark, ...w.harp.lit]) expect(c >= 0 && c <= 1).toBe(true);
      for (const c of [w.bowed.sound, w.bowed.ring]) expect(c).toMatch(/^\d+,\d+,\d+$/);
      // (a look changes only what is a uniform of a material that already sets it: mats3 `setLook`)
      for (const o of Object.values(w.materials.over ?? {})) for (const k of Object.keys(o)) expect(['color', 'roughness', 'clearcoatRoughness', 'envMapIntensity']).toContain(k);
    });
  }

  it('the rooms at night keep the stage’s marks in their own inks; the day’s are one blue, laid over the picture', () => {
    for (const t of THEMES) {
      const w = WORLDS[t.id];
      if (t.id === 'day-studio') continue;
      expect(w.glow).toBe('added');
      expect(w.bowed.sound).toBe(t.ink.sound);
      expect(w.bowed.ring).toBe(t.ink.warm);
      expect(w.ring[0]).toBeGreaterThan(w.ring[2]);
    }
    const day = WORLDS['day-studio'];
    expect(day.glow).toBe('laid');
    expect(day.bowed.sound).toBe(day.bowed.ring);
    expect(day.ring[2]).toBeGreaterThan(day.ring[1]);
    expect(day.ring[1]).toBeGreaterThan(day.ring[0]);
  });

  it('an evening hall’s light waits before the first sound; a gallery’s room is turned to each first view', () => {
    const hall = WORLDS['evening-hall'];
    expect(hall.lights.wait).toBe(0.5);
    expect([hall.lights.key.waits, hall.lights.rim.waits, hall.lights.fill.waits]).toEqual([true, undefined, true]);
    const fu = hall.final.uniforms();
    const xu = hall.floor.uniforms!();
    hall.frame({ floor: xu, final: fu }, frame({ up: 0, lit: 0.5 }));
    // (waiting: no beam yet, the curtain at half, the pool low)
    expect(fu.uBeam.value).toBe(0);
    expect(xu.uUp.value).toBe(0);
    const waiting = fu.uHall.value as number;
    hall.frame({ floor: xu, final: fu }, frame());
    expect(fu.uBeam.value).toBeCloseTo(0.085, 9);
    expect(fu.uHall.value).toBeCloseTo(2 * waiting, 9);
    // (an orchestra stands in a wash: no beam; a key's close-up: neither)
    hall.frame({ floor: xu, final: fu }, frame({ floor: { y: 0, c: [0, 0, 0], r0: 8, r1: 12, pool: null } }));
    expect(fu.uBeam.value).toBe(0);
    hall.frame({ floor: xu, final: fu }, frame({ k: 1 }));
    expect([fu.uBeam.value, fu.uHall.value]).toEqual([0, 0]);

    const gal = WORLDS['night-gallery'];
    expect(gal.lights.bearing).toBe(0.62);
    for (const t of THEMES) if (t.id !== 'night-gallery') expect(WORLDS[t.id].lights.bearing).toBeUndefined();
    // its wall stands behind the instrument, across the camera's view: the horizon is on the picture, and
    // sinks out of it in a key's close-up, where its light goes out
    const gu = gal.final.uniforms();
    const gx = gal.floor.uniforms!();
    const f = frame();
    gal.frame({ floor: gx, final: gu }, f);
    expect(gu.uHorizon.value > 0 && gu.uHorizon.value < 1).toBe(true);
    expect(gu.uGlow.value).toBe(1);
    const wall = gx.uWall.value as THREE.Vector3;
    const fwd = f.cam.getWorldDirection(new THREE.Vector3());
    expect(Math.hypot(wall.x, wall.y)).toBeCloseTo(1, 9);
    expect(wall.x * fwd.x + wall.y * fwd.z).toBeGreaterThan(0);
    // (2.2 + 0.77 · 3.4 m behind the floor's middle, which lies at z 0.2 along the wall's normal)
    expect(wall.z).toBeCloseTo(2.2 + 0.77 * 3.4 + 0.2 * wall.y, 9);
    gal.frame({ floor: gx, final: gu }, frame({ k: 1 }));
    expect([gu.uHorizon.value, gu.uGlow.value]).toEqual([-1, 0]);
  });
});

describe('what a world changes of the instruments follows the theme, in place', () => {
  it('the materials take a daylight room’s share of it and give it back: the same materials, no new ones', () => {
    const env = new THREE.Texture();
    setEnvironment(env);
    setLook(WORLDS['night-bench'].materials);
    const mat = (name: keyof typeof M) => materialFor(M[name], false) as THREE.MeshPhysicalMaterial;
    const bench = { brass: mat('brassLacquer'), lacquer: mat('lacquer'), silver: mat('silverKeys'), bore: mat('boreDark'), spruce: mat('spruce') };
    const hex = (m: THREE.MeshPhysicalMaterial) => `#${m.color.getHexString()}`;
    const night = () => {
      expect([hex(bench.brass), bench.brass.roughness, bench.brass.envMapIntensity]).toEqual(['#f6d382', 0.16, 1.6]);
      expect(bench.lacquer.envMapIntensity).toBe(1.7);
      expect(bench.silver.envMapIntensity).toBe(1.6);
      expect(bench.bore.envMapIntensity).toBe(0.35);
      expect(bench.brass.envMap).toBe(env);
      // (a material that sets no share of its own has no map of its own: the scene's lights it)
      expect(bench.spruce.envMap).toBeNull();
    };
    night();
    // the day's look, while they are in use
    setLook(WORLDS['day-studio'].materials);
    expect(mat('brassLacquer')).toBe(bench.brass);
    expect([hex(bench.brass), bench.brass.roughness]).toEqual(['#e9bf62', 0.18]);
    expect(bench.brass.envMapIntensity).toBeCloseTo(dayEnv(1.15), 12);
    expect(bench.lacquer.envMapIntensity).toBeCloseTo(dayEnv(0.95), 12);
    expect(bench.silver.envMapIntensity).toBeCloseTo(dayEnv(1.1), 12);
    // (what the day does not name keeps its number, drawn in to the room's share: under 1 as it is, times the share)
    expect(bench.bore.envMapIntensity).toBeCloseTo(1.2 * 0.35, 12);
    expect(dayEnv(1.6)).toBeCloseTo(1.2 * 1.15, 12);
    // one made in the day is the same as one brought into it
    const made = materialFor({ ...M.brassLacquer }, false) as THREE.MeshPhysicalMaterial;
    expect([hex(made), made.roughness, made.envMapIntensity]).toEqual([hex(bench.brass), bench.brass.roughness, bench.brass.envMapIntensity]);
    // another room's picture, and the room turned (a gallery's): the same materials again
    const env2 = new THREE.Texture();
    setEnvironment(env2);
    turnEnvironment(0.4);
    expect(bench.brass.envMap).toBe(env2);
    expect(bench.brass.envMapRotation.y).toBe(0.4);
    expect(bench.spruce.envMap).toBeNull();
    turnEnvironment(0);
    setEnvironment(env);
    setLook(WORLDS['night-gallery'].materials);
    night();
    expect([hex(made), made.roughness, made.envMapIntensity]).toEqual(['#f6d382', 0.16, 1.6]);
    setLook(WORLDS['night-bench'].materials);
    night();
    disposeMaterials();
    setEnvironment(null);
  });

  it('the ring of a struck bar: warm at night, the blue by day, at the same strength', () => {
    expect(RING_TINT).toEqual([1, 0.78, 0.5]);
    const out: [number, number, number, number] = [0, 0, 0, 0];
    setTheme('day-studio', false);
    expect(RING_TINT).toEqual([0.42, 0.58, 1]);
    expect(ringRGBA(1, out)).toEqual([0.42, 0.58, 1, -RING_MAX]);
    for (const id of ['evening-hall', 'night-gallery', 'night-bench'] as const) {
      setTheme(id, false);
      expect(ringRGBA(1, out)).toEqual([1, 0.78, 0.5, -RING_MAX]);
    }
  });

  it('a ringing harp string: the string’s own colour catching the light at night, the blue by day; the finger’s mark too', () => {
    (globalThis as unknown as { window: unknown }).window ??= globalThis;
    const hm = buildHarpModel();
    const amp = new Float32Array(47);
    amp[21] = 0.8;
    const plucked = Array.from({ length: 47 }, () => -1);
    plucked[21] = 0.05;
    const fr = { focus: null, harp: { pedals: [0, 0, 0, 0, 0, 0, 0], set: [0, 0, 0, 0, 0, 0, 0], amp, last: 21, ago: 0.05, vel: 80, plucked, shapes: [] } } as unknown as VisualFrame;
    /** the colours of the lines laid over the picture (the glow set: 15 numbers a vertex, its colour at 10) */
    const lines = (): string[] => {
      const b = new Batch();
      poseHarp(b, hm, fr, 1 / 60, 16);
      const seen = new Set<string>();
      for (let o = 0; o < b.glow.lv.n; o += 15) seen.add([...b.glow.lv.a.subarray(o + 10, o + 13)].map((v) => v.toFixed(3)).join(','));
      return [...seen].sort();
    };
    const night = lines();
    // (two inks: the ringing string's and the mark's)
    expect(night.length).toBe(2);
    expect(night).toContain('1.000,0.940,0.820');
    setTheme('day-studio', false);
    expect(lines()).toEqual(['0.210,0.410,0.925']);
    setTheme('night-gallery', false);
    expect(lines()).toEqual(night);
  });

  it('a bowed string’s lines: vermilion and amber on the bench, one brighter blue by day, each theme’s own inks otherwise', () => {
    const d = BOWED.violin;
    const bm = buildBowedModel({ id: 'violin', L: d.L, bowLength: d.bowLength, strings: d.strings.map((s) => ({ name: s.name, open: s.open })) });
    // the A string bowed and stopped, the D ringing on (a line's level is three times the string's: 0.6, 0.3)
    const fr = {
      strings: d.strings.map((s, i) => ({ open: s.open, stop: i === 2 ? 0.8 : 1, stopNow: i === 2 ? 0.8 : 1, level: i === 2 ? 0.2 : i === 1 ? 0.1 : 0, bowing: i === 2 })),
      focus: null,
      bow: { dir: 1, pos: 0.5, changing: false, speed: 0.3, lift: 0 },
    } as unknown as VisualFrame;
    /** each line laid over the picture: its ink and its alpha, by its width (px) */
    const lines = (): Map<string, number[]> => {
      const b = new Batch();
      poseBowed(b, bm, fr, { of: () => 1 });
      const out = new Map<string, number[]>();
      for (let o = 0; o < b.glow.lv.n; o += 15) {
        const a = b.glow.lv.a;
        const ink = [a[o + 10], a[o + 11], a[o + 12]].map((v) => Math.round(v * 255)).join(',');
        const key = `${ink} ${+a[o + 14].toFixed(2)}`;
        if (!out.has(key)) out.set(key, []);
        out.get(key)!.push(+a[o + 13].toFixed(3));
      }
      return out;
    };
    const widths = (m: Map<string, number[]>, ink: string) => [...m.keys()].filter((k) => k.startsWith(`${ink} `)).map((k) => +k.split(' ')[1]).sort((x, y) => x - y);
    const alphas = (m: Map<string, number[]>, ink: string) => [...new Set([...m].filter(([k]) => k.startsWith(`${ink} `)).flatMap(([, v]) => v))].sort((x, y) => x - y);
    const bench = lines();
    // vermilion: the bowed string (0.18 + 0.45 · 0.6) and the bow's contact; amber: the string ringing on
    // (0.12 + 0.4 · 0.3) and the stopping mark's three strokes
    expect(widths(bench, '255,94,56')).toEqual([1.4, 5]);
    expect(alphas(bench, '255,94,56')).toEqual([0.45, 0.85]);
    expect(widths(bench, '242,166,70')).toEqual([1.4, 2.5, 6, 14]);
    expect(alphas(bench, '242,166,70')).toEqual([0.24, 0.7, 0.9]);
    setTheme('day-studio', false);
    const day = lines();
    expect([...new Set([...day.keys()].map((k) => k.split(' ')[0]))]).toEqual(['54,104,236']);
    expect(widths(day, '54,104,236')).toEqual([1.4, 2.5, 5, 12]);
    // (bowed 0.3 + 0.55 · 0.6, ringing on 0.14 + 0.4 · 0.3, the mark 0.22, 0.95 and 0.8, the contact 0.85)
    expect(alphas(day, '54,104,236')).toEqual([0.22, 0.26, 0.63, 0.8, 0.85, 0.95]);
    for (const id of ['evening-hall', 'night-gallery'] as const) {
      setTheme(id, false);
      const m = lines();
      const t = theme();
      expect(widths(m, t.ink.sound)).toEqual([1.4, 5]);
      expect(widths(m, t.ink.warm)).toEqual([1.4, 2.5, 6, 14]);
      expect(alphas(m, t.ink.warm)).toEqual([0.24, 0.7, 0.9]);
    }
    setTheme('night-bench', false);
    expect(lines()).toEqual(bench);
  });
});

/** (kept for the day's handle: the numbers a script may tune are the world's own) */
describe('the day studio’s light can be tuned while it shows', () => {
  it('its world reads the handle’s numbers each time it is asked', () => {
    const w = WORLDS['day-studio'];
    const was = { ...DAY };
    expect([w.lights.key.intensity, w.lights.rim.intensity, w.lights.fill.intensity, w.lights.env, w.exposure, w.lights.shadow.depth]).toEqual([2.2, 0.25, 0.7, 1.2, 1.06, 0.62]);
    expect([w.floor.color, w.floor.past, w.floor.lift]).toEqual([[0.9, 0.915, 0.93], 0.95, 0.06]);
    DAY.key = 3;
    DAY.exposure = 1.2;
    expect([w.lights.key.intensity, w.exposure]).toEqual([3, 1.2]);
    Object.assign(DAY, was);
    const xu = w.floor.uniforms!();
    w.frame({ floor: xu, final: w.final.uniforms() }, frame());
    expect(xu.uPoolIn.value).toBe(1.45);
    w.frame({ floor: xu, final: w.final.uniforms() }, frame({ floor: { y: 0, c: [0, 0, 0] as Vec3, r0: 8, r1: 12, pool: null } }));
    expect(xu.uPoolIn.value).toBe(1);
  });
});
