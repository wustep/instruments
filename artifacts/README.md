# Handoff artifacts

Everything here was produced by the physical models in this repository; no recorded sample is part of any sound.

## Audio — `artifacts/audio/`

48 kHz, 16-bit stereo WAV with a 192 kbps MP3 of each. Rendered by `npx tsx scripts/render-demos.ts` through the full output chain (room, limiter), peak-limited to −1 dBFS but never raised, so pp stays pp.

| file | seconds | what you hear |
|---|---:|---|
| [`piano-c-major-chord-pp.wav`](audio/piano-c-major-chord-pp.wav) · [mp3](audio/piano-c-major-chord-pp.mp3) | 6.5 | Piano: C major chord (C3 C4 E4 G4 C5), pianissimo (velocity 32), held 4.5 s then released |
| [`piano-c-major-chord-ff.wav`](audio/piano-c-major-chord-ff.wav) · [mp3](audio/piano-c-major-chord-ff.mp3) | 6.5 | Piano: the same chord fortissimo (velocity 118) — brighter from the nonlinear felt, not just louder |
| [`piano-a0-ff.wav`](audio/piano-a0-ff.wav) · [mp3](audio/piano-a0-ff.mp3) | 11 | Piano: A0 forte, held 9 s — inharmonic bass partials, phantom partials, long double decay |
| [`piano-sustain-pedal-passage.wav`](audio/piano-sustain-pedal-passage.wav) · [mp3](audio/piano-sustain-pedal-passage.mp3) | 11.5 | Piano: arpeggios C–F–G7–C with legato sustain pedalling; undamped strings ring sympathetically through the soundboard |
| [`piano-half-pedal-una-corda.wav`](audio/piano-half-pedal-una-corda.wav) · [mp3](audio/piano-half-pedal-una-corda.mp3) | 5 | Piano: a soft phrase with continuous half-pedal (CC64 ≈ 0.42) and una corda — notes blur partially and the third string of each trichord rings only sympathetically |
| [`piano-prepared.wav`](audio/piano-prepared.wav) · [mp3](audio/piano-prepared.mp3) | 5 | Prepared piano: bolts, screws and rubber modelled as masses and dashpots on the strings (after Cage) |
| [`violin-g-major-scale.wav`](audio/violin-g-major-scale.wav) · [mp3](audio/violin-g-major-scale.mp3) | 7.5 | Violin: G major scale G3–G5, détaché bow strokes, string crossings chosen like a player would |
| [`violin-long-e5-swell.wav`](audio/violin-long-e5-swell.wav) · [mp3](audio/violin-long-e5-swell.mp3) | 6 | Violin: a long E5 with vibrato and a bow-speed swell (CC11) — the Helmholtz motion grows and brightens |
| [`violin-double-and-triple-stops.wav`](audio/violin-double-and-triple-stops.wav) · [mp3](audio/violin-double-and-triple-stops.mp3) | 6.5 | Violin: double stops G3+D4 and D4+A4, then a G-major triple stop — each note on its own string, all sharing one bridge and body |
| [`viola-scale-and-chord.wav`](audio/viola-scale-and-chord.wav) · [mp3](audio/viola-scale-and-chord.mp3) | 8.5 | Viola: C3–G3 on the C string, then a C-major triple stop |
| [`cello-c-major-arpeggio.wav`](audio/cello-c-major-arpeggio.wav) · [mp3](audio/cello-c-major-arpeggio.mp3) | 9.5 | Cello: C major arpeggio C2–C4 across all four strings; open strings answer sympathetically |
| [`cello-g2-and-fifth.wav`](audio/cello-g2-and-fifth.wav) · [mp3](audio/cello-g2-and-fifth.mp3) | 6.5 | Cello: a long G2 with vibrato, joined by D3 as a double stop |
| [`flute-legato-melody.wav`](audio/flute-legato-melody.wav) · [mp3](audio/flute-legato-melody.mp3) | 6.5 | Flute: a legato phrase C5–G5 — fingering changes without re-tonguing, breath noise and vibrato |
| [`flute-three-registers.wav`](audio/flute-three-registers.wav) · [mp3](audio/flute-three-registers.mp3) | 9.5 | Flute: C4 and G4 (first register), C6 (overblown octave of C5), G6 (overblown twelfth of C5) |
| [`flute-overblowing.wav`](audio/flute-overblowing.wav) · [mp3](audio/flute-overblowing.mp3) | 7 | Flute: one fingering (D4) with breath pressure rising slowly — the jet speeds up, the tone brightens, then the tube jumps to its octave |
| [`ensemble-all-five.wav`](audio/ensemble-all-five.wav) · [mp3](audio/ensemble-all-five.mp3) | 12.6 | All five instruments together (rendered separately, summed): piano chords with pedal, cello bass, viola and violin inner voices, flute melody |

## Screenshots — `artifacts/shots/`

Captured after the page settled (fonts loaded, notes sounding ≥ 0.9 s) by `node scripts/screenshots.mjs` against `pnpm preview`; desktop 1440×900 @2x, phone = Pixel 7.

| file | shows |
|---|---|
| [`play-piano.png`](shots/play-piano.png) | Play view, piano: a pedalled C-major chord sounding; preset list, readout of the last note (partial 1, B, strings) |
| [`play-violin.png`](shots/play-violin.png) | Play view with the instrument selector on Violin; out-of-range keys dimmed |
| [`inside-piano.png`](shots/inside-piano.png) | Look inside the piano: unison string shapes, hammer force + felt hysteresis loop, soundboard modes, spectrum with stiff-string partial markers, physical controls |
| [`inside-violin.png`](shots/inside-violin.png) | Look inside the violin: Helmholtz corner on the bowed string, bow friction force and stick–slip velocity, body modes |
| [`inside-cello.png`](shots/inside-cello.png) | Look inside the cello (G2 bowed) |
| [`inside-flute.png`](shots/inside-flute.png) | Look inside the flute: standing wave in the bore (overblown 2nd mode), jet flow vs returning pressure, tube resonances |
| [`measurements.png`](shots/measurements.png) | Measurements page (first screen): headline metrics vs the Steinway B recording |
| [`measurements-full.png`](shots/measurements-full.png) | Measurements page, full length: all figures, A/B listening, calibration rounds, shortfalls |
| [`phone-play.png`](shots/phone-play.png) | Phone (Pixel 7): Play view with a chord sounding |
| [`phone-inside-violin.png`](shots/phone-inside-violin.png) | Phone: Look inside the violin |
