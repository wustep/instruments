// Render demo audio (WAV, plus MP3 if ffmpeg is available) into artifacts/audio/.
// Every sample is synthesised by the physical models; nothing is played back.
//   npx tsx scripts/render-demos.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type InstrumentId, type TimedEvent } from '../packages/engine/src/core/index.ts';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';

const OUT = join(import.meta.dirname, '..', 'artifacts', 'audio');
mkdirSync(OUT, { recursive: true });
const FS = 48000;

type Note = [midi: number, start: number, dur: number, vel: number];
const notes = (ns: Note[]): TimedEvent[] =>
  ns.flatMap(([m, t, d, v]) => [
    { time: t, event: { type: 'noteOn', midi: m, velocity: v } },
    { time: t + d, event: { type: 'noteOff', midi: m } },
  ]);
const ev = (time: number, event: TimedEvent['event']): TimedEvent => ({ time, event });

function render(instrument: InstrumentId, events: TimedEvent[], duration: number, opts: { preset?: string; params?: Record<string, unknown> } = {}) {
  const r = renderInstrument({ sampleRate: FS, instrument, preset: opts.preset, params: opts.params as never, events, duration });
  return { L: r.left, R: r.right, cpu: r.cpuMs };
}

function normalize(L: Float32Array, R: Float32Array, peakDb = -1): void {
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const g = pk > 0 ? Math.pow(10, peakDb / 20) / pk : 1;
  // only ever attenuate (keep the instrument's own dynamics between demos)
  if (g < 1) for (let i = 0; i < L.length; i++) {
    L[i] *= g;
    R[i] *= g;
  }
}

const written: { file: string; caption: string; seconds: number }[] = [];
function save(name: string, caption: string, L: Float32Array, R: Float32Array): void {
  normalize(L, R);
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}.mp3`)]);
  } catch {
    /* ffmpeg optional */
  }
  written.push({ file: name, caption, seconds: +(L.length / FS).toFixed(1) });
  console.log(`${name}.wav  ${(L.length / FS).toFixed(1)} s`);
}

function mix(parts: { L: Float32Array; R: Float32Array; gain: number }[], n: number) {
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const p of parts) for (let i = 0; i < n && i < p.L.length; i++) {
    L[i] += p.gain * p.L[i];
    R[i] += p.gain * p.R[i];
  }
  return { L, R };
}

// ---------------------------------------------------------------- piano
{
  const chord = [48, 60, 64, 67, 72];
  let r = render('piano', notes(chord.map((m) => [m, 0.1, 4.5, 32] as Note)), 6.5);
  save('piano-c-major-chord-pp', 'Piano: C major chord (C3 C4 E4 G4 C5), pianissimo (velocity 32), held 4.5 s then released', r.L, r.R);
  r = render('piano', notes(chord.map((m) => [m, 0.1, 4.5, 118] as Note)), 6.5);
  save('piano-c-major-chord-ff', 'Piano: the same chord fortissimo (velocity 118) — brighter from the nonlinear felt, not just louder', r.L, r.R);
  r = render('piano', notes([[21, 0.1, 9, 110]]), 11);
  save('piano-a0-ff', 'Piano: A0 forte, held 9 s — inharmonic bass partials, phantom partials, long double decay', r.L, r.R);
  // sustain-pedal passage: arpeggios with pedal changes (legato pedalling)
  const arp = (root: number[], t0: number): Note[] => root.map((m, i) => [m, t0 + i * 0.18, 0.3, 64 + (i % 3) * 8] as Note);
  const pedal: TimedEvent[] = [
    ev(0.05, { type: 'sustain', value: 1 }),
    ev(2.05, { type: 'sustain', value: 0 }), ev(2.12, { type: 'sustain', value: 1 }),
    ev(4.05, { type: 'sustain', value: 0 }), ev(4.12, { type: 'sustain', value: 1 }),
    ev(6.05, { type: 'sustain', value: 0 }), ev(6.12, { type: 'sustain', value: 1 }),
    ev(9.6, { type: 'sustain', value: 0 }),
  ];
  const passage = [
    ...arp([36, 43, 48, 52, 55, 60, 64, 67, 72], 0.1),
    ...arp([41, 48, 53, 57, 60, 65, 69, 72, 77], 2.1),
    ...arp([43, 50, 55, 59, 62, 65, 67, 71, 74], 4.1),
    ...arp([36, 43, 48, 52, 55, 60, 64, 67, 72, 76], 6.1),
  ];
  r = render('piano', [...pedal, ...notes(passage)], 11.5);
  save('piano-sustain-pedal-passage', 'Piano: arpeggios C–F–G7–C with legato sustain pedalling; undamped strings ring sympathetically through the soundboard', r.L, r.R);
  // half pedal + una corda
  const hp: TimedEvent[] = [ev(0.05, { type: 'sustain', value: 0.42 }), ev(0.05, { type: 'soft', value: 1 })];
  const melody: Note[] = [[67, 0.1, 0.5, 50], [69, 0.6, 0.5, 48], [71, 1.1, 0.5, 52], [72, 1.6, 1.0, 55], [64, 0.1, 2.4, 38], [60, 0.1, 2.4, 36], [48, 0.1, 2.4, 40]];
  r = render('piano', [...hp, ...notes(melody), ev(3.0, { type: 'sustain', value: 0 })], 5);
  save('piano-half-pedal-una-corda', 'Piano: a soft phrase with continuous half-pedal (CC64 ≈ 0.42) and una corda — notes blur partially and the third string of each trichord rings only sympathetically', r.L, r.R);
  r = render('piano', notes([[48, 0.1, 0.6, 90], [53, 0.5, 0.6, 85], [55, 0.9, 0.6, 95], [58, 1.3, 0.6, 80], [60, 1.7, 0.6, 90], [62, 2.1, 0.6, 85], [64, 2.5, 1.5, 100], [41, 2.5, 1.5, 100]]), 5, { preset: 'prepared' });
  save('piano-prepared', 'Prepared piano: bolts, screws and rubber modelled as masses and dashpots on the strings (after Cage)', r.L, r.R);
}

// ---------------------------------------------------------------- strings
{
  const gmaj = [55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79];
  let r = render('violin', notes(gmaj.map((m, i) => [m, 0.1 + i * 0.42, 0.38, 70 + (i % 4) * 6] as Note)), 7.5);
  save('violin-g-major-scale', 'Violin: G major scale G3–G5, détaché bow strokes, string crossings chosen like a player would', r.L, r.R);
  const exprRamp: TimedEvent[] = [];
  for (let i = 0; i <= 40; i++) exprRamp.push(ev(0.1 + i * 0.1, { type: 'control', cc: 11, value: 0.25 + 0.75 * Math.sin((Math.PI * i) / 40) }));
  r = render('violin', [...exprRamp, ...notes([[69 + 7, 0.1, 4.2, 80]])], 6);
  save('violin-long-e5-swell', 'Violin: a long E5 with vibrato and a bow-speed swell (CC11) — the Helmholtz motion grows and brightens', r.L, r.R);
  r = render('violin', notes([[55, 0.1, 1.4, 90], [62, 0.1, 1.4, 90], [62, 1.7, 1.4, 90], [69, 1.7, 1.4, 90], [55, 3.3, 2.0, 105], [62, 3.3, 2.0, 105], [71, 3.3, 2.0, 105]]), 6.5);
  save('violin-double-and-triple-stops', 'Violin: double stops G3+D4 and D4+A4, then a G-major triple stop — each note on its own string, all sharing one bridge and body', r.L, r.R);
  r = render('viola', notes([[48, 0.1, 0.9, 80], [50, 1.0, 0.9, 80], [52, 1.9, 0.9, 80], [53, 2.8, 0.9, 80], [55, 3.7, 1.6, 85], [48, 5.5, 2.2, 95], [55, 5.5, 2.2, 95], [64, 5.5, 2.2, 95]]), 8.5);
  save('viola-scale-and-chord', 'Viola: C3–G3 on the C string, then a C-major triple stop', r.L, r.R);
  r = render('cello', notes([[36, 0.1, 1.2, 85], [43, 1.3, 1.2, 85], [48, 2.5, 1.2, 85], [52, 3.7, 1.2, 85], [55, 4.9, 1.2, 85], [60, 6.1, 2.4, 90]]), 9.5);
  save('cello-c-major-arpeggio', 'Cello: C major arpeggio C2–C4 across all four strings; open strings answer sympathetically', r.L, r.R);
  r = render('cello', notes([[43, 0.1, 4.5, 95], [50, 2.2, 2.4, 85]]), 6.5);
  save('cello-g2-and-fifth', 'Cello: a long G2 with vibrato, joined by D3 as a double stop', r.L, r.R);
}

// ---------------------------------------------------------------- flute
{
  const mel: Note[] = [[72, 0.1, 0.55, 80], [74, 0.6, 0.55, 82], [76, 1.1, 0.55, 84], [77, 1.6, 0.35, 80], [79, 1.9, 1.0, 90], [77, 2.9, 0.5, 78], [76, 3.35, 0.5, 76], [74, 3.8, 0.5, 74], [72, 4.25, 1.4, 80]];
  // slight overlaps make it legato (no re-articulation)
  let r = render('flute', notes(mel.map(([m, t, d, v]) => [m, t, d + 0.04, v] as Note)), 6.5);
  save('flute-legato-melody', 'Flute: a legato phrase C5–G5 — fingering changes without re-tonguing, breath noise and vibrato', r.L, r.R);
  r = render('flute', notes([[60, 0.1, 2.0, 80], [67, 2.3, 2.0, 80], [84, 4.6, 2.0, 80], [91, 6.9, 2.0, 80]]), 9.5);
  save('flute-three-registers', 'Flute: C4 and G4 (first register), C6 (overblown octave of C5), G6 (overblown twelfth of C5)', r.L, r.R);
  const breathRamp: TimedEvent[] = [];
  for (let i = 0; i <= 60; i++) breathRamp.push(ev(0.1 + i * 0.1, { type: 'control', cc: 2, value: i / 60 }));
  r = render('flute', [...breathRamp, ...notes([[62, 0.1, 6.2, 70]])], 7, { params: { breath: 1.6 } });
  save('flute-overblowing', 'Flute: one fingering (D4) with breath pressure rising slowly — the jet speeds up, the tone brightens, then the tube jumps to its octave', r.L, r.R);
}

// ---------------------------------------------------------------- ensemble: all five instruments
{
  const beat = 0.6;
  const bar = 4 * beat;
  const prog = [
    [48, 52, 55, 60], [45, 52, 57, 60], [41, 53, 57, 60], [43, 50, 55, 59],
  ];
  const pianoNotes: Note[] = [];
  prog.forEach((ch, b) => ch.forEach((m, i) => pianoNotes.push([m + 12 * (i > 0 ? 0 : 0), 0.1 + b * bar + i * 0.05, bar - 0.1, 52])));
  const pianoPedal: TimedEvent[] = prog.flatMap((_, b) => [ev(0.05 + b * bar, { type: 'sustain', value: 0 }), ev(0.15 + b * bar, { type: 'sustain', value: 1 })]);
  const cello: Note[] = [[36, 0.1, bar - 0.05, 80], [33, 0.1 + bar, bar - 0.05, 80], [41, 0.1 + 2 * bar, bar - 0.05, 80], [43, 0.1 + 3 * bar, bar - 0.05, 85]];
  const viola: Note[] = [[55, 0.1, bar, 60], [57, 0.1 + bar, bar, 60], [57, 0.1 + 2 * bar, bar, 60], [59, 0.1 + 3 * bar, bar, 62]];
  const violin: Note[] = [[64, 0.1, bar, 62], [64, 0.1 + bar, bar, 62], [65, 0.1 + 2 * bar, bar, 64], [62, 0.1 + 3 * bar, bar, 64]];
  const flute: Note[] = [
    [79, 0.1, beat * 2, 78], [76, 0.1 + 2 * beat, beat, 74], [77, 0.1 + 3 * beat, beat, 74],
    [76, 0.1 + bar, beat * 2, 78], [72, 0.1 + bar + 2 * beat, beat * 2, 74],
    [77, 0.1 + 2 * bar, beat * 1.5, 78], [76, 0.1 + 2 * bar + 1.5 * beat, beat * 0.5, 72], [74, 0.1 + 2 * bar + 2 * beat, beat * 2, 74],
    [74, 0.1 + 3 * bar, beat, 76], [71, 0.1 + 3 * bar + beat, beat, 74], [74, 0.1 + 3 * bar + 2 * beat, beat * 2, 80],
  ];
  const dur = 4 * bar + 3;
  const n = Math.ceil(dur * FS);
  const parts = [
    { ...render('piano', [...pianoPedal, ...notes(pianoNotes), ev(4 * bar, { type: 'sustain', value: 0 })], dur), gain: 0.55 },
    { ...render('cello', notes(cello), dur), gain: 0.8 },
    { ...render('viola', notes(viola), dur), gain: 0.6 },
    { ...render('violin', notes(violin), dur), gain: 0.6 },
    { ...render('flute', notes(flute.map(([m, t, d, v]) => [m, t, d + 0.03, v] as Note)), dur), gain: 0.8 },
  ];
  const m = mix(parts, n);
  save('ensemble-all-five', 'All five instruments together (rendered separately, summed): piano chords with pedal, cello bass, viola and violin inner voices, flute melody', m.L, m.R);
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(written, null, 2) + '\n');
