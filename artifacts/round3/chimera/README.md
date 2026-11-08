# Chimera-review engine changes: before/after (round 3b)

`*-before` is the engine at `ca57d10`, `*-after` the change. Each MP3 has a spectrogram (0–16 kHz) of the
same render. The numbers are also in `metrics.json` (`npx tsx scripts/render-chimera.ts --before <engine>`).

## 1. Dragging the room's edge no longer clicks

**What it was:** every new room value (a drag sends one every ~10 ms) jumped the reverb's delays: 16 late
lines, 24 image-source reflections per microphone, and the predelay, all by whole samples. Each jump is a
click.

**What changed:** a room change now glides there over ~80 ms. The reflections and predelay are read at
fractional delays, and the wet level ramps.

**Passages:** a held note or chord while the room is dragged small → hall → small (0.2 → 0.9 → 0.2), then
the same for the grand's lid (open → closed → open).

The loudest 2 ms of high frequencies while dragging, over the louder of the two ends held still, in dB
(a click shows as a large positive number):

| passage | before | after |
|---|---|---|
| `room-drag-piano` | +9.5 | −0.9 |
| `room-drag-violin` | +7.7 | 0.0 |
| `room-drag-flute` | +17.9 | +1.9 |
| `room-drag-trumpet` | +5.2 | +0.6 |
| `lid-drag-piano` (lid was already smooth) | −0.7 | −0.7 |

## 2. The host's block size no longer changes the sound

**What it was:** each core cut its internal blocks to the host's call. Its control-rate steps (bow and
breath envelopes, vibrato, the trumpet's lip glide, the piano's dampers) therefore fell at different moments
for a host that asks for 37 frames instead of Web Audio's 128. The trumpet's lip glide was also a fixed
fraction per block rather than a time constant.

**What changed:** a `Pump` makes every core render its own blocks (≤ 64 samples, cut only at events and its
own limits) and hands them out. The output is now **bit-identical** at 128, 37 and 500 frames per call, for
all four model families. The lip glide is now a 6 ms time constant. The cost is that the core runs at most
64 samples (1.3 ms) ahead of its output.

**Passages:** a four-note phrase at 37 frames per call, before and after (`blocksize-*-q37`). The after
folder also has the same phrase at 128 frames (`blocksize-*-q128-after`), which is now the same file.

Loudness at 37 vs 128 frames per call, worst 20 ms frame:

| | before | after |
|---|---|---|
| violin | 5.3 dB | 0.0 dB |
| trumpet | 4.2 dB | 0.0 dB |
| flute | 1.2 dB | 0.0 dB |
| piano | 0.0 dB | 0.0 dB |

## What changes in the browser (128 frames per call)

* **Flute and piano:** the same within 0.5 dB, with waveforms −21 and −25 dB apart.
* **Violin and trumpet:** the waveforms differ. A bow's stick–slip and the trumpet's lips are chaotic
  self-oscillators, so moving a control step by a few samples changes the waveform. The sound does not
  change measurably:
  * the phrase's ⅓-octave spectrum is within 0.70 dB RMS (violin) and 0.13 dB RMS (trumpet);
  * the Iowa ensemble calibration for violin, viola, cello and flute is identical to two decimals
    (harmonic and spectrum error, centroid, noise, attack, pitch).

**Verdict:** the drag and block-size problems are fixed, and the instruments' sound shows no clear change.
