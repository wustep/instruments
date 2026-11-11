# Performance pass: numbers

Machine: Apple M5 Pro (Mac mini). Production builds served with `vite preview`: **before** = af894f5
(`artifacts/perf/before-dist`, :4611), **after** = this branch (:4612). Chrome stable via Playwright
(`--use-angle=metal --enable-gpu`); WebKit = Playwright WebKit. Desktop 1440×900 @2×; phone =
390×844 @3× touch (Pixel 7 size); "CPU ÷4" = CDP CPU throttling ×4; the slow network = 150 ms RTT,
1.6 Mb/s down. Medians of 3 runs unless noted. Raw outputs: `zoom-matrix.txt`, `load-*.txt`,
`switch-*.txt`, `frames-*.txt`; traces in `traces/`.

## 1. Piano key zoom (`scripts/perf-zoom.mjs`: a real click/tap on C4's strings)

| target | click → zoomed frame | worst frame | long tasks | | after: zoomed frame | worst frame | long tasks |
|---|---:|---:|---:|---|---:|---:|---:|
| 3D grand, Chrome desktop | 227 ms | 217 ms | 213 ms | → | 22 ms | 16.8 ms | 0 |
| 3D grand, Chrome phone | — ¹ | 250 ms | 251 ms | → | 23 ms | 16.8 ms | 0 |
| 3D grand, Chrome phone CPU ÷4 | — ¹ | 383 ms | 383 ms | → | 22 ms | 33.4 ms | 0 |
| 3D upright, Chrome desktop | 224 ms | 217 ms | 220 ms | → | 22 ms | 16.8 ms | 0 |
| 3D grand, WebKit desktop | 237 ms | 228 ms | n/a ² | → | 32 ms | 22 ms | n/a |
| 3D grand, WebKit phone | 263 ms | 253 ms | n/a ² | → | 30 ms | 24 ms | n/a |
| 2D close-up panel, Chrome desktop | 30 ms | 16.8 ms | 0 | → | 25 ms | 16.8 ms | 0 |
| 2D close-up panel, Chrome phone CPU ÷4 | 23 ms | 16.8 ms | 0 | → | 21 ms | 16.8 ms | 0 |

Programs compiled by the zoom: 36 → 0 (total for the page: 83 either way). Warm-up cost: no frame
over 16.8 ms in the 3 s after the piano appears (3 runs). Mean frame through the 1.6 s after the
click: 19.1 → 16.7 ms (desktop). Root cause and fix: `ROOT-CAUSE.md`.

¹ on a tap the stall landed one frame later than the script's "zoomed frame" mark; the worst frame is
the measure. ² WebKit has no `longtask` entries.

## 2. First load (`scripts/perf-load.mjs`, Lighthouse-style vitals measured in the page ³)

| page | device | FCP | LCP | CLS | TBT | longest task | script kB | total kB |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| /piano 2D | desktop | 84 → 116 ⁴ | 84 → 116 | 0 → 0 | 0 → 0 | 0 → 0 | 233 → 204 | 470 → 441 |
| /piano 2D | phone, CPU ÷4, slow net | 1756 → 1712 | 1756 → 1712 | 0 → 0 | 0 → 0 | 119 → 161 | 233 → 204 | 470 → 441 |
| /piano 3D | desktop | 80 → 84 | 80 → 84 | 0 → 0 | **305 → 103** | 355 → 153 | 505 → 477 | 742 → 714 |
| /piano 3D | phone, CPU ÷4, slow net | 1760 → 1612 | 1760 → 1612 | 0 → 0 | **857 → 659** | 866 → 623 | 505 → 477 | 742 → 714 |
| /notes | phone, CPU ÷4, slow net | 1804 → 1632 | 1804 → 1796 ⁵ | 0.015 → 0.015 | 0 → 0 | 156 → 86 | 233 → 226 | 734 → 727 |
| /measurements | phone, CPU ÷4, slow net | 1644 → 1556 | 3044 → 3000 | 0 → 0 | 0 → 0 | 78 → 77 | 233 → 213 | 817 → 798 |

³ Lighthouse itself could not be installed here (package download blocked), so FCP/LCP/CLS come from
PerformanceObserver and TBT is the long tasks' time past 50 ms from FCP to 5 s (8 s on the phone).
⁴ desktop unthrottled loads are ~0.1 s and vary ±30 ms between runs.
⁵ without the modulepreload, /notes LCP rose to 2308 ms (its chunk fetched after the main one ran):
fixed by preloading it when the page opens on /notes or /measurements.

### Bundles (vite build, minified / gzip)

| chunk | before | after |
|---|---:|---:|
| index (entry) | 685.05 / 241.27 kB | 609.16 / 211.56 kB |
| notes (lazy) | (in index) | 52.71 / 21.88 kB |
| measure (lazy) | (in index) | 23.90 / 9.07 kB |
| stage3d (lazy, three.js) | 955.75 / 281.46 kB | 958.64 / 282.43 kB |
| processor (worklet) | 215.63 kB | 216 kB (the audio audit #50, not this pass) |

3D and every instrument's 3D module were already split into the lazy `stage3d` chunk; the 2D drawers
stay in the entry (the stage draws them synchronously, and the Orchestra uses them all).

## 3. Instrument switching (`scripts/perf-switch.mjs`, 12 instruments in turn, each a first visit)

| | before | after |
|---|---:|---:|
| 3D: long tasks, total | 2244 ms | 1541 ms |
| 3D: worst frame, median / max | 150 / 433 ms | 133 / 233 ms |
| 3D: switch → instrument shown, median | 186 ms ⁶ | 208 ms ⁶ |
| 2D: worst frame | 33 ms | 33 ms |
| 2D: long tasks | 0 | 0 |

Bowed 3D model build (Node, 4 models, 3 alternating runs): 1535 → ~650 ms, meshes bit-identical.
⁶ the time to first picture is about the same (it still waits for the shaders and the model build);
what changed is that the page keeps running meanwhile (fewer, shorter long tasks).

## 4. 3D frame rate and GPU memory

| | before | after |
|---|---:|---:|
| grand, steady: fps / mean frame | 62.7 / 16.67 ms | 62.7 / 16.67 ms |
| grand: geometries / textures (renderer.info) | 38 / 16 | 38 / 16 |
| grand: programs (whole page, after a zoom) | 82–83 | 83 |
| 3D stage CPU per frame (`stats.ms`) | 0.7–1.6 ms | 0.9–1.3 ms |

## 5. Playing: main thread (`scripts/perf-frames.mjs`, 3 s trace, CrRendererMain busy ms per second)

| scene | before | after |
|---|---:|---:|
| piano 2D, desktop | 117 | 109 |
| piano 3D, desktop | 113 | 122 (noise) |
| piano 2D, phone CPU ÷4 | 367 | **219** |
| violin 2D, phone CPU ÷4 | 257 | **200** |
| piano 3D, phone CPU ÷4 | 275 | 272 |
| Orchestra quartet 2D / 3D, desktop | 41–54 / 72 | 44–54 / 76–92 (noise) |
| Orchestra Beethoven 5 3D, desktop | 69–79 | 68–74 |

All scenes: 60 fps, no frame over 33 ms, no long task, before and after. The Orchestra's main thread
was already light (≤ 9 % busy); its cost is the audio thread (out of scope: audio is unchanged).
Re-render hot spots: the app has no React; per frame the 2D mode field (`ModeField.update`) was the
largest single cost of the piano and the bowed 2D drawings (60 ms/s of 140 ms/s on a desktop), now
2.4–2.9× cheaper. Per-frame `getBoundingClientRect` (~5 ms/s, no forced layouts) and the spectrum's
`getFloatFrequencyData` (~4 ms/s) were measured and left.
