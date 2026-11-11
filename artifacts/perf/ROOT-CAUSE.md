# The piano key zoom: why it was slow, and the fix

## Symptom

In 3D, a click (or tap) on a key's strings flies the camera into that key's action, a section cut
through the keyboard. The first frame after the click froze the stage:

| | click → first zoomed frame | worst frame | long task |
|---|---:|---:|---:|
| Chrome desktop 1440×900 @2× | 227 ms | 217 ms | 213 ms |
| Chrome, Pixel 7 size | (tap) | 250 ms | 251 ms |
| Chrome, Pixel 7 size, CPU ÷4 | | 383 ms | 383 ms |
| WebKit desktop | 237 ms | 228 ms | |
| WebKit, phone size | 263 ms | 253 ms | |

(`scripts/perf-zoom.mjs`, median of 3 runs; before = af894f5.) Only the first close-up of a page
load froze; later ones were smooth. The 2D close-up panel (`ui/action-view.ts`) never had the
problem (worst frame 16.8 ms, no long task, on the desktop and a throttled phone).

## Root cause: synchronous shader compilation

A Chrome trace of the click (`traces/before/zoom-3d-desktop.json`) shows one 264 ms task in the
`requestAnimationFrame` callback, of which:

* 223 ms in `GLES2Implementation::GetProgramiv` → `CommandBufferHelper::Finish`: the page waiting
  on the GPU process for programs to finish compiling and linking;
* the JS samples are `getProgramInfoLog` / `getProgramParameter` (three.js's first-use error check)
  and `shaderSource`.

The section is drawn with a clipping plane: `Renderer3.section(true)` sets `material.clippingPlanes`
on every material of the scene, plus the depth-first pass's material and GTAO's normal material.
The number of clipping planes is part of three.js's program key (`NUM_CLIPPING_PLANES`; and our
materials' section shading is `#if NUM_CLIPPING_PLANES > 0`), so every material needs a new program.
three.js compiles a program the first time it draws with it, and checks it at once, which blocks
until the driver is done. Counting `renderer.info.programs` around the zoom: **46 → 82**, i.e. 36
programs compiled in that one frame: 30 `MeshPhysicalMaterial` variants (each piano material has its
own program: `customProgramCacheKey` carries its name), 2 shadow-pass `depth`, 2 depth-first
`basic` and 2 GTAO `normal` programs (instanced parts and the floor).

## Fix

`Renderer3.warmSection()` (`apps/web/src/ui/gl/three3d.ts`), called by the 3D stage after each frame
while a single piano shows whole:

1. waits until no new mesh has been made for 20 frames (the scene has settled);
2. queues every scene material not yet warmed;
3. each frame, turns the section on (`section(true)`), points the renderer at the HDR target (the
   programs are keyed by its colour space), and calls `renderer.compile()` on a temporary group of
   instanced meshes carrying **four** of the queued materials, then turns the section off again —
   nothing is drawn, and the materials are left exactly as they were;
4. last, the same for the passes drawn with one material over the whole scene (depth-first, GTAO
   normals; on an instanced part and on the floor) and the shadow pass's depth material for each side
   a part casts from (and the dissolving case's screen-door depth material).

`renderer.compile` only *sends* the programs; with `KHR_parallel_shader_compile` (Chrome, ANGLE on
Metal) the driver compiles them on its own threads, and without it the GPU process works through them
while the page goes on. When the section is first drawn, three.js finds every program in the
material's program cache, already linked: the first zoomed frame just selects them.

Spreading the work four materials a frame matters: compiling all 36 in one frame dropped one frame
to 33–50 ms at start-up; four a frame keeps every frame at 16.8 ms.

The same cause made the **first 3D frame of every instrument** (page load, instrument switch) a long
task (≈ 250 ms of the grand's 440 ms). `Renderer3.hold()` sends a new instrument's programs first and
holds the frame — the canvas keeps its last picture, `stats.frames` does not count it — until they are
ready (at most 1.5 s); without the extension programs count as ready at once, as before.

## After

| | click → zoomed frame | worst frame | long tasks | programs compiled at the zoom |
|---|---:|---:|---:|---:|
| Chrome desktop | 22 ms | 16.8 ms | 0 | 0 (83 in all, as before) |
| Chrome, Pixel 7 size | 23 ms | 16.8 ms | 0 | 0 |
| Chrome, Pixel 7 size, CPU ÷4 | 22 ms | 33.4 ms | 0 | 0 |
| Chrome desktop, upright | 22 ms | 16.8 ms | 0 | 0 |
| WebKit desktop | 32 ms | 22 ms | 0 | |
| WebKit, phone size | 30 ms | 24 ms | 0 | |

60 fps through the flight; the first zoomed frame 22–32 ms after the click (target: < 100 ms). The
warm-up itself: no frame over 16.8 ms in the 3 s after the piano appears.

Guard: `e2e/zoom-perf.spec.ts` (desktop and Pixel 7): opening the close-up compiles no program and
no frame of the flight passes 120 ms; it fails on af894f5 (46 → 82 programs).

Nothing drawn changes: the same programs draw the same section; only when they are compiled moves.
