# Performance

Measured with `pnpm bench` (`packages/engine/bench/voices.ts`). The DSP core is
run in Node 26, which uses the same V8 engine as Chrome, in 128-sample blocks at
48 kHz.

**Machine: Mac mini (Mac17,16), Apple M5 Pro, 18 cores, 64 GB.** All figures are
the share of one core spent rendering one second of audio. A real-time audio
thread has a budget of 100 %.

| struck notes | pedal | sympathetic strings | CPU % of one core (real time) | per struck note |
|---:|:---:|---:|---:|---:|
| 0 (board + post only) | up | 0 | 2.2 | – |
| 1 | up | 20 | 3.9 | 1.70 |
| 8 | up | 18 | 6.3 | 0.50 |
| 16 | up | 16 | 8.6 | 0.40 |
| 32 | up | 13 | 13.5 | 0.35 |
| 48 | up | 9 | 18.9 | 0.35 |
| 64 | up | 5 | 24.5 | 0.35 |
| 88 | up | 0 | 32.5 | 0.34 |
| 8 | down | 80 | 12.0 | 1.22 |
| 32 | down | 56 | 17.7 | 0.48 |
| 64 | down | 24 | 25.8 | 0.37 |

| instrument | scene | CPU % of one core |
|---|---|---:|
| violin | one bowed note (4 strings + 69-mode body) | 1.1 |
| violin | four-string chord | 1.1 |
| viola | triple stop | 1.1 |
| cello | four-string chord | 1.4 |
| flute | one note | 0.4 |

## Piano notes

* **Fixed cost:** the soundboard (≈150 modes, three bridge zones), the
  high-frequency path, EQ, the room and the limiter take about 2 %.
* **A struck note** (2–3 strings, each with a horizontal-polarisation twin)
  costs about 0.35 % of one core. A single A0 is dearer (≈ 1.7 %) because its
  dispersion filter has 37 biquad sections.
* **Sympathetic strings** with the pedal down cost about 0.1 % each.
* **Polyphony limit.** It defaults to **64 struck notes**, plus any number of
  sympathetic strings. On this machine all 88 keys at once cost about 33 %, so
  the limit is set for slower hardware, not for this one.
* **Live load meter.** In Chrome the worklet's meter shows 5–12 % for a pedalled
  chord. The `stats.load` value reported by the worklet is shown in the dock.
* **Load shedding.** If the audio thread passes 70 % of its budget, the worklet
  sheds sympathetic strings first, then lowers polyphony in 20 % steps (to a
  floor of 12). It restores both when load falls below 35 %.

## Other instruments

* **Violin, viola, cello:** all four strings always run, so the open strings
  resonate, and the body has 50–70 modes. They cost about 1–1.5 % in total,
  whatever is being played.
* **Flute:** one bore plus one jet costs about 0.4 %.

## Latency

* **Measured in Chrome on macOS** (`AudioContext`, `latencyHint: 'interactive'`):
  - `baseLatency` is 5.3 ms;
  - `outputLatency` is 16 ms, the value reported by headless Chrome (CoreAudio
    hardware often reports less);
  - one render quantum adds 2.7 ms;
  - total ≈ **24 ms** from a note event to sound leaving the audio stack.
* **Shown in the app.** The status line displays the current total, and its
  tooltip breaks it down.
* **No key-travel delay.** The hammer starts 0.4 mm from the string, so the model
  adds 0.1–1 ms of travel at most.
* **Event timing.** Live MIDI and keyboard events take effect at the next
  128-sample quantum. Scheduled events (offline rendering, `noteOn(…, time)`)
  are sample-accurate.

## Start-up

Measured with `node scripts/startup.mjs <url>` (real Chrome, a real click on a key,
no autoplay flag; median of 3; Apple M5 Pro):

| | before round 3 (e292022) | now |
|---|---|---|
| click → first sound, Chrome | 482 ms | ~205 ms |
| click → first sound, Chrome with the JIT off (a slow-machine stand-in) | 7840 ms | ~310 ms |
| click → first sound, WebKit | 589 ms | ~185 ms |
| piano built on the audio thread (`initMs`) | ~430 ms | ~11 ms |
| switching back to the piano | ~1000 ms | ~12 ms |

* **Filter designs are precomputed at build time.** The dispersion and loss
  designs for every string of the default grand are computed by a Vite plugin
  for 44.1 and 48 kHz and shipped as content-hashed JSON (about 60 kB gzipped
  each, one design per unison string since round 3). The page prefetches them
  with the worklet script, and the worklet builds the piano in about 10 ms.
* **The AudioContext asks for 48 kHz**, so audio interfaces at 88.2–192 kHz and
  Bluetooth headsets at 16–24 kHz still get the shipped designs. Any other rate
  is designed in the page, in slices, never on the audio thread.
* **Every step is bounded:**
  * the designs fetch times out after 2.5 s and falls back;
  * the worklet module load after 8 s;
  * the whole start after 15 s;
  * a worklet constructor that throws is reported.
* **The 3 s watchdog.** After 3 s without sound, the status lamp says why and
  what to do. A failure shows its reason, retries once by itself, and a tap
  starts over.
* **`?debug` start-up log.** Opening the page with `?debug` shows every
  start-up step with timings, HTTP statuses and errors, and has a copy button.
* **Live parameter changes** (string stiffness, string decay, preset) are
  redesigned on the main thread, spread across frames, and handed to the
  worklet, which keeps every design it has been sent. The audio thread never
  stalls.
* **The other instruments** start instantly.
