// Night Gallery in 3D: a gallery at night, the instrument the one lit object in it. A strong silver
// light from behind and above that cuts its outline and throws its shadow forward over a dark honed
// floor, a second from behind on the other side for the far edge; a dim tungsten key across the front
// from one side, just enough to read the form; no fill from the front at all. The image-based light is
// a generated room with very little in it (`gallery`): two slots of cool light behind, one small warm
// lamp in front, the far wall's dim wash, and the dark. Behind the instrument the last pass paints the
// room itself: the page's own wall, a scallop of light on it, the line where it meets the floor.
import * as THREE from 'three';
import type { Vec3 } from '../../ui/gl/gl3d.ts';
import { GLOW_PARS, glowBox, glowUniforms, ground, panel, walls, type World } from '../../ui/gl/world.ts';
import { nightGallery } from './theme.ts';

/** The room that lights the scene and is seen in lacquer and brass: a gallery after closing. Almost all
 *  of it is dark. What is lit: two slots of cool light behind the instrument (the silver light's own
 *  source, tall and narrow: they are the long bright lines down a case's edge, a tube and a bell's rim);
 *  one small tungsten lamp in front and above (the key: a round highlight, not a softbox's window); the
 *  wall behind the camera, washed very dimly (what a piano's black front and a bell's flare return, or
 *  they read as holes: polished metal has no colour but what it reflects); a little of the floor. */
function gallery(): THREE.Scene {
  const s = new THREE.Scene();
  // dark walls and ceiling, a shade of the page's own cool wall
  walls(s, [0.011, 0.013, 0.017], [30, 14, 30], 5);
  // the floor: dark, polished
  ground(s, [0.026, 0.029, 0.034]);
  const SILVER: Vec3 = [0.8, 0.88, 1];
  const TUNGSTEN: Vec3 = [1, 0.84, 0.64];
  // the light from behind: a tall slot behind left (where the silver light itself comes from), a
  // narrower one behind right (the second light's), so both edges of a silhouette catch
  // (three's world is the scenes' mirrored in x: each is on the side its light is, ROOM)
  panel(s, 1.5, 10, SILVER, 14, [6.6, 3.6, 7.6], [0, 1.2, 0], 0.55);
  panel(s, 1.0, 9, SILVER, 8.5, [-7.6, 3.2, 6.0], [0, 1.2, 0], 0.55);
  // … and its spill on the wall behind them, low and wide: the line along a lid's edge and a soundboard
  panel(s, 16, 2.6, SILVER, 0.5, [0, 4.6, 11], [0, 1.4, 0], 0.9);
  // the key: one small lamp, front left and above
  panel(s, 2.4, 2.4, TUNGSTEN, 7.5, [7.2, 5.2, -4.6], [0, 0.6, 0], 0.7);
  // the wall behind the camera, washed so dimly that a body falls off into it: enough that a piano's
  // black front and a bell's flare are not holes
  panel(s, 22, 7, [0.86, 0.9, 1], 0.36, [0, 3.2, -12], [0, 1.4, 0], 0.9);
  // what comes down from above: next to nothing (a head, a lid's top, a key's face)
  panel(s, 9, 9, [0.82, 0.88, 1], 0.26, [0, 9.5, 0], [0, 0, 0], 0.8);
  // the floor in front of the instrument, as the pool lights it: what a case's black front, a bell's
  // underside and a rib's lower edge return (they face down and out, at the floor)
  panel(s, 20, 14, [0.9, 0.92, 1], 0.2, [0, -1.85, -4], [0, 10, -4], 1.0);
  return s;
}

/** The stage's own lights, a whole instrument's (a key's close-up has its own: three3d CLOSE). Directions
 *  are towards the light, in the scene's frame (the audience at −z, so +z is behind the instrument), for a
 *  visitor standing at `bearing`: the room is turned about each instrument to where it is first seen from,
 *  so every one is lit the same way from its own first view (the silver light behind it, the key across it
 *  from the left) and keeps that light as it is walked round. */
const ROOM = {
  /** the first view's yaw the directions below are written for (the cello's) */
  bearing: 0.62,
  /** the silver light: from behind and above, the one that casts the shadow (forward, towards us); a scene
   *  may point it itself (Batch.key) */
  back: [-0.62, 0.5, 0.72] as Vec3,
  backI: 3.3,
  backC: [0.84, 0.9, 1] as Vec3,
  /** the key: dim, tungsten, across the front from the left and above (most stages are seen from the
   *  right: the light crosses the body and it falls off towards us) */
  key: [-0.72, 0.52, -0.46] as Vec3,
  keyI: 1.1,
  keyC: [1, 0.86, 0.68] as Vec3,
  /** no fill from the front. The third light is a second one from behind, low, on the other side: the
   *  far edge of a silhouette, a case's flank (it casts no shadow) */
  fill: [0.74, 0.34, 0.58] as Vec3,
  fillI: 1.3,
  fillC: [0.84, 0.9, 1] as Vec3,
  /** the generated room's share of the light */
  env: 0.8,
  /** the floor past the pool's rim, as a share of the pool's light */
  dusk: 0.3,
};

export const nightGalleryWorld: World = {
  id: 'night-gallery',
  room: gallery,
  // The light that casts the shadow is the silver one from behind; the second is the dim tungsten key in
  // front; the third a second light from behind. In a key's close-up they are a workbench's: the
  // shadow's light warm, from the open side; the other two the close-up's rim and its warm fill.
  lights: {
    key: { dir: ROOM.back, color: ROOM.backC, intensity: ROOM.backI, close: [1, 0.93, 0.84] },
    rim: { dir: ROOM.key, color: ROOM.keyC, intensity: ROOM.keyI, close: [0.8, 0.88, 1] },
    fill: { dir: ROOM.fill, color: ROOM.fillC, intensity: ROOM.fillI, close: [1, 0.9, 0.78] },
    env: ROOM.env,
    shadow: { radius: 5, lite: 3, depth: 1 },
    wait: 1,
    bearing: ROOM.bearing,
  },
  exposure: 1,
  bloom: { over: 2.2, strength: 0.35 },
  mirror: { most: 0.42, gain: 1.3 },
  glow: 'added',
  // The floor: dark, honed more than polished (it returns the light from behind as a broad sheen, not a
  // glare); on it the room's light, a spot's pool as large as the room. It ends at the far wall (uWall:
  // the wall's normal in xz and its distance).
  floor: {
    color: [0.044, 0.046, 0.05],
    roughness: 0.72,
    specular: 0.18,
    env: 0.4,
    past: ROOM.dusk,
    lift: 1,
    wash: 0,
    pars: 'uniform vec3 uWall;',
    body: /* glsl */ `
{
  float rr = length((vWorldP - uFloorC).xz);
  float inPool = 1.0 - smoothstep(uPool.x - uPool.y, uPool.x + uPool.y, rr);
  float e = (rr - uPool.x) / max(uPool.y, 1e-3);
  float k = mix(uPool.z, 1.0 + uPool.w, inPool) + uPoolHot * 0.3 * exp(-e * e);
  gl_FragColor.rgb *= k;
  gl_FragColor.a *= 1.0 - smoothstep(uFloorR.x, uFloorR.y, rr);
  // (the floor ends at the far wall: uWall, its normal in xz and its distance)
  gl_FragColor.a *= 1.0 - smoothstep(-0.03, 0.0, dot(vWorldP.xz, uWall.xy) - uWall.z);
}`,
    uniforms: () => ({ uWall: { value: new THREE.Vector3(0, 1, 1e6) } }),
  },
  final: {
    pars: /* glsl */ `${GLOW_PARS} uniform float uHorizon;
// The light a wall-washer throws on the far wall behind the instrument: a scallop, its upper edge a
// parabola over the instrument, brightest under that edge and falling away down the wall and to the sides.
// p: a place on the screen. The scallop's width and fall are the instrument's own box's (uGlowR); its top
// is over the box's, and never so high that the picture's upper edge would cut it.
float scallop(vec2 p) {
  float x = (p.x - uGlowC.x) / uGlowR.x;
  float apex = min(uGlowC.y + 1.05 * uGlowR.y, 0.8);
  float d = (apex - p.y) / uGlowR.y - 0.42 * x * x;
  return smoothstep(-0.16, 0.34, d) * exp(-0.62 * max(0.0, d)) * exp(-0.3 * x * x);
}`,
    body: /* glsl */ `
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
  gl_FragColor = vec4(mix(back, s, a) + d / 255.0, 1.0);`,
    uniforms: () => ({ ...glowUniforms(), uHorizon: { value: -1 } }),
  },
  frame(u, f) {
    const { cam, c, rad, floor: fl, k, mix } = f;
    // The far wall: upright, facing the camera, behind the instrument at a distance that grows with the
    // room (a small room's wall 1.9 of the instrument's radius from its middle, the largest's 2.65: past
    // the pool at its largest, so the room's knob stays on the floor). Where it meets the floor is a level
    // line on the screen (0 at the foot … 1; under the picture in a key's close-up, over it from straight above).
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    fwd.y = 0;
    const flat = fwd.lengthSq();
    const fc = fl ? new THREE.Vector3(-fl.c[0], fl.y, fl.c[2]) : new THREE.Vector3(-c[0], c[1] - rad, c[2]);
    // (an orchestra, which has no pool: its wall close behind its last row)
    const wallR = fl?.pool ? fl.pool.R + 0.77 * fl.pool.Rmax : rad * 1.25;
    let horizon = 2;
    if (flat > 1e-6) {
      fwd.multiplyScalar(1 / Math.sqrt(flat));
      const P = fc.clone().addScaledVector(fwd, wallR);
      (u.floor.uWall.value as THREE.Vector3).set(fwd.x, fwd.z, fwd.x * P.x + fwd.z * P.z);
      // (flying into a close-up the line sinks out of the picture: there the wall is all there is)
      horizon = mix(P.project(cam).y * 0.5 + 0.5, -1);
    } else (u.floor.uWall.value as THREE.Vector3).set(0, 1, 1e6);
    u.final.uHorizon.value = horizon;
    // (the room is the whole instrument's: flying into a key's close-up its wall's light goes out)
    u.final.uGlow.value = 1 - k;
    glowBox(u.final, f);
  },
  materials: {},
  // plinths of the room's own matt dark, a little lighter on top (a stained wood top over a black fascia
  // was warm in a cool room)
  riser: { top: 'plinthTop', side: 'plinthSide' },
  ring: [1, 0.78, 0.5],
  harp: { mark: [1, 0.94, 0.82], lit: [0.5, 0.45, 0.35], own: 0.5 },
  // the room's light for the bowed string, tungsten for a string ringing on and the stopping point's bar
  bowed: {
    sound: nightGallery.ink.sound,
    ring: nightGallery.ink.warm,
    bowing: [0.18, 0.45],
    ringing: [0.12, 0.4],
    stop: [
      [0.24, 14],
      [0.9, 6],
      [0.7, 2.5],
    ],
    shape: 0.85,
  },
};
