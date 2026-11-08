// Round-3 demos: MP3 (192 kbps) renders of short scores, every sample synthesised by
// the physical models. The same scores can be rendered by another checkout of the
// engine (e.g. the round-1 commit) for honest before/after pairs:
//   npx tsx scripts/render-round3.ts                         -> artifacts/round3/audio/after
//   npx tsx scripts/render-round3.ts --engine <repo>/packages/engine/src/core/index.ts --out <dir>
// Scores are original, written for these demos.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'audio', 'after')));
const ONLY = args.includes('--only') ? opt('--only', '').split(',') : null;
const { renderInstrument } = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
mkdirSync(OUT, { recursive: true });
const FS = 48000;

type Ev = { time: number; event: Record<string, unknown> };
type Note = [midi: number, start: number, dur: number, vel: number];
const notes = (ns: Note[]): Ev[] => ns.flatMap(([m, t, d, v]) => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }]);
const ev = (time: number, event: Record<string, unknown>): Ev => ({ time, event });

function render(instrument: string, events: Ev[], duration: number, params: Record<string, unknown> = {}) {
  const r = renderInstrument({ sampleRate: FS, instrument: instrument as never, params: params as never, events: events as never, duration });
  return { L: r.left, R: r.right };
}
function mix(parts: { L: Float32Array; R: Float32Array; gain: number }[]) {
  const n = Math.max(...parts.map((p) => p.L.length));
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const p of parts)
    for (let i = 0; i < p.L.length; i++) {
      L[i] += p.gain * p.L[i];
      R[i] += p.gain * p.R[i];
    }
  return { L, R };
}
const written: { file: string; caption: string; seconds: number }[] = [];
function save(name: string, caption: string, a: { L: Float32Array; R: Float32Array }): void {
  if (ONLY && !ONLY.includes(name)) return;
  let pk = 0;
  for (let i = 0; i < a.L.length; i++) pk = Math.max(pk, Math.abs(a.L[i]), Math.abs(a.R[i]));
  const g = pk > 0 ? Math.min(1, Math.pow(10, -1 / 20) / pk) : 1; // attenuate only: pp stays pp
  for (let i = 0; i < a.L.length; i++) {
    a.L[i] *= g;
    a.R[i] *= g;
  }
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [a.L, a.R] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
  written.push({ file: `${name}.mp3`, caption, seconds: +(a.L.length / FS).toFixed(1) });
  console.log(`${name}.mp3  ${(a.L.length / FS).toFixed(1)} s`);
}
const want = (n: string) => !ONLY || ONLY.includes(n);

// ------------------------------------------------------------------ piano
if (want('piano-tenor-notes'))
  save('piano-tenor-notes', 'Piano: F2, A2, C3, E3 at mf, each held 3 s — the tenor’s fast first decay into a long aftersound (round 2 fixed a ×2.2 too-slow prompt decay here)', render('piano', notes([[41, 0.1, 3, 72], [45, 3.3, 3, 72], [48, 6.5, 3, 72], [52, 9.7, 3, 72]]), 13.5));
if (want('piano-treble-notes'))
  save('piano-treble-notes', 'Piano: C6, E6, G6, C7 at mf, held 2.4 s each — treble unisons kept within a tuner’s beat rate, decaying like the recording instead of collapsing in a beat', render('piano', notes([[84, 0.1, 2.4, 74], [88, 2.6, 2.4, 74], [91, 5.1, 2.4, 74], [96, 7.6, 2.4, 74]]), 10.8));
if (want('piano-chorale')) {
  // an original eight-chord chorale in C minor with legato pedalling
  const chords = [[36, 48, 55, 63, 67], [41, 53, 56, 65, 68], [43, 50, 55, 62, 71], [36, 48, 55, 63, 72], [44, 51, 56, 63, 72], [41, 53, 57, 63, 69], [43, 50, 55, 62, 67], [36, 48, 55, 60, 63]];
  const ns: Note[] = [];
  const evs: Ev[] = [];
  chords.forEach((c, i) => {
    const t = 0.2 + i * 1.6;
    c.forEach((m, j) => ns.push([m, t + j * 0.012, 1.55, 58 + (j === c.length - 1 ? 18 : 6) + (i === 3 || i === 7 ? 8 : 0)]));
    evs.push(ev(t - 0.05 + (i ? 0.12 : 0), { type: 'sustain', value: 0 }), ev(t + 0.1, { type: 'sustain', value: 1 }));
  });
  evs.push(ev(14.5, { type: 'sustain', value: 0 }));
  save('piano-chorale', 'Piano: an eight-chord chorale in C minor with legato pedalling — tenor and bass voicing where the decay changes matter most', render('piano', [...notes(ns), ...evs], 16));
}
// ------------------------------------------------------------------ strings
if (want('violin-long-tones-bow-changes'))
  save('violin-long-tones-bow-changes', 'Violin: D4 forte for 8 s, then A4 for 6 s — the bow runs out of hair and changes direction automatically (cosine reversal, ~70 ms); listen for the turns', render('violin', notes([[62, 0.1, 8, 118], [69, 8.4, 6, 110]]), 15.2, { vibrato: 14 }));
if (want('violin-detache'))
  save('violin-detache', 'Violin: a détaché melody in G — each new note takes the other bow direction (down, up, down…), slurred pairs stay in one bow', render('violin', notes([[67, 0.1, 0.42, 86], [71, 0.55, 0.42, 86], [74, 1.0, 0.42, 90], [79, 1.45, 0.9, 96], [78, 2.4, 0.42, 88], [76, 2.85, 0.42, 86], [74, 3.3, 0.42, 84], [76, 3.75, 0.5, 86], [74, 4.2, 0.52, 84], [72, 4.7, 0.42, 82], [71, 5.15, 0.42, 80], [69, 5.6, 0.42, 82], [67, 6.05, 1.6, 90]]), 8.2, { vibrato: 12 }));
if (want('viola-melody'))
  save('viola-melody', 'Viola: a slow melody on the C and G strings, long notes with bow changes', render('viola', notes([[48, 0.1, 2.2, 90], [55, 2.4, 1.1, 88], [53, 3.6, 1.1, 84], [51, 4.8, 2.6, 92], [50, 7.5, 1.2, 84], [48, 8.8, 3.2, 96]]), 12.6, { vibrato: 14 }));
if (want('cello-long-tones'))
  save('cello-long-tones', 'Cello: C2 and G2 held forte, then an arpeggio up to C4 — bow changes on the long notes, open strings ringing sympathetically', render('cello', notes([[36, 0.1, 5, 116], [43, 5.3, 4, 110], [48, 9.5, 0.6, 96], [52, 10.15, 0.6, 96], [55, 10.8, 0.6, 98], [60, 11.45, 2.4, 104]]), 14.5, { vibrato: 16 }));
// ------------------------------------------------------------------ flute
if (want('flute-low-register'))
  save('flute-low-register', 'Flute: a low-register phrase at mf (C4–G4) — the strong second harmonic of a real flute’s low notes, from the offset jet and monopole radiation', render('flute', notes([[60, 0.1, 0.9, 72], [62, 1.05, 0.9, 72], [64, 2.0, 0.9, 76], [67, 2.95, 1.8, 80], [65, 4.85, 0.9, 74], [64, 5.8, 0.9, 72], [62, 6.75, 0.9, 70], [60, 7.7, 2.2, 66]]), 10.4, { vibrato: 0.05 }));
if (want('flute-dynamics'))
  save('flute-dynamics', 'Flute: G4, G5, G6 each played pp, mf, ff — the tone fills out with the jet as it does on a real flute (fitted to the Iowa recordings)', render('flute', notes([67, 79, 91].flatMap((m, i) => [[m, 0.1 + i * 4.2, 1.1, 30], [m, 1.5 + i * 4.2, 1.1, 70], [m, 2.9 + i * 4.2, 1.1, 112]] as Note[])), 13, { vibrato: 0 }));
// ------------------------------------------------------------------ ensemble
if (want('ensemble-chorale')) {
  // an original chorale for flute, violin, viola, cello and piano (G major)
  const bar = 2.0;
  const fl: Note[] = [[79, 0, 1.9, 74], [81, 2, 0.95, 74], [83, 3, 0.95, 78], [84, 4, 1.9, 82], [83, 6, 1.9, 76], [81, 8, 0.95, 72], [79, 9, 0.95, 70], [78, 10, 1.9, 72], [79, 12, 3.6, 70]];
  const vn: Note[] = [[71, 0, 1.9, 80], [72, 2, 1.9, 80], [76, 4, 1.9, 86], [74, 6, 1.9, 82], [72, 8, 1.9, 78], [74, 10, 1.9, 80], [71, 12, 3.6, 78]];
  const va: Note[] = [[62, 0, 1.9, 82], [64, 2, 1.9, 82], [67, 4, 1.9, 86], [67, 6, 1.9, 84], [64, 8, 1.9, 80], [66, 10, 1.9, 82], [62, 12, 3.6, 80]];
  const vc: Note[] = [[43, 0, 1.9, 92], [45, 2, 1.9, 90], [48, 4, 1.9, 94], [47, 6, 1.9, 92], [45, 8, 1.9, 90], [50, 10, 1.9, 94], [43, 12, 3.6, 92]];
  const pn: Note[] = [];
  [[55, 59, 62, 67], [57, 60, 64, 69], [60, 64, 67, 72], [59, 62, 67, 71], [57, 60, 64, 69], [50, 57, 62, 66], [43, 55, 59, 62, 67]].forEach((c, i) => c.forEach((m) => pn.push([m, i * bar + 0.02, i === 6 ? 3.5 : 1.85, 56])));
  const sh = (ns: Note[]) => ns.map(([m, t, d, v]) => [m, t + 0.2, d, v] as Note);
  const pedal: Ev[] = Array.from({ length: 7 }, (_, i) => [ev(0.2 + i * bar - 0.04 + (i ? 0.1 : 0), { type: 'sustain', value: 0 }), ev(0.2 + i * bar + 0.12, { type: 'sustain', value: 1 })]).flat();
  pedal.push(ev(16, { type: 'sustain', value: 0 }));
  const D = 17;
  const parts = [
    { ...render('piano', [...notes(sh(pn)), ...pedal], D), gain: 0.55 },
    { ...render('cello', notes(sh(vc)), D, { vibrato: 14 }), gain: 0.85 },
    { ...render('viola', notes(sh(va)), D, { vibrato: 12 }), gain: 0.7 },
    { ...render('violin', notes(sh(vn)), D, { vibrato: 12 }), gain: 0.7 },
    { ...render('flute', notes(sh(fl)), D, { vibrato: 0.05 }), gain: 0.8 },
  ];
  save('ensemble-chorale', 'All five instruments: an original chorale in G for flute, violin, viola, cello and piano (each rendered separately and summed)', mix(parts));
}
// ------------------------------------------------------------------ round 3 additions
if (want('flute-attacks'))
  save('flute-attacks', 'Flute: tongued notes in the middle register (A4 C5 E5 A5 G5 E5) — round 3 fixed onsets that took ~4x too long to speak', render('flute', notes([[69, 0.1, 0.5, 84], [72, 0.75, 0.5, 84], [76, 1.4, 0.5, 88], [81, 2.05, 0.9, 92], [79, 3.1, 0.5, 86], [76, 3.75, 1.4, 84]]), 5.6, { vibrato: 0.05 }));
if (want('room-small-vs-hall')) {
  const chords = [[48, 55, 64, 72], [53, 57, 65, 72], [55, 59, 62, 67, 71], [48, 55, 64, 72]];
  const sc = (t0: number): Ev[] => {
    const ns: Note[] = [];
    chords.forEach((c, i) => c.forEach((m) => ns.push([m, t0 + i * 1.2, 0.9, 74])));
    return notes(ns);
  };
  const a = render('piano', sc(0.1), 6, { room: 0.05 });
  const b = render('piano', sc(0.1), 7, { room: 0.95 });
  const n = a.L.length + b.L.length;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  L.set(a.L);
  R.set(a.R);
  L.set(b.L, a.L.length);
  R.set(b.R, a.R.length);
  save('room-small-vs-hall', 'Piano: the same four chords in a small room (room 0.05), then in a hall (room 0.95) — the round-3 room: image-source early reflections and a 16-line FDN', { L, R });
}
if (want('trumpet-phrase')) {
  try {
    save('trumpet-phrase', 'Trumpet (new in round 3): a fanfare and a slow phrase — buzzing lips on a bore, real valve fingerings', render('trumpet', notes([[58, 0.1, 0.25, 96], [65, 0.4, 0.25, 100], [70, 0.7, 0.25, 104], [74, 1.0, 0.9, 110], [70, 2.1, 0.4, 96], [72, 2.6, 0.5, 92], [70, 3.2, 0.5, 88], [67, 3.8, 0.5, 84], [65, 4.4, 1.6, 90]]), 6.6, { vibrato: 0.004 }));
  } catch {
    console.log('trumpet-phrase: no trumpet in this engine');
  }
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(written, null, 1) + '\n');
