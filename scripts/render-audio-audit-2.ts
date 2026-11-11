// Audio audit, round 2: before/after clips of every finding (each round-1 leftover and each new fix), rendered
// by an earlier checkout's engine (--before) and by this one, as played (the room on, the playback gains, the
// Orchestra's bus where a clip is a lineup), with a spectrogram of each and the clip's own number printed.
//   npx tsx scripts/render-audio-audit-2.ts --before <repo>/packages/engine/src/core/index.ts
//       [--out artifacts/round3/audio-audit-2] [--wav .audit2/out/wav] [--only name,…]
// MP3 (160 kbps) and PNG (0–16 kHz) go to --out; 16-bit WAVs of both to --wav.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { lufs } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BEFORE = resolve(opt('--before', ''));
const AFTER = resolve(join(import.meta.dirname, '../packages/engine/src/core/index.ts'));
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'audio-audit-2')));
const WAV = resolve(opt('--wav', '.audit2/out/wav'));
const ONLY = opt('--only', '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
mkdirSync(WAV, { recursive: true });

type Ev = { time: number; event: Record<string, unknown> };
const on = (time: number, midi: number, velocity: number): Ev => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): Ev => ({ time, event: { type: 'noteOff', midi } });
/** a note a file plays: foreseen (the bowed strings plan their bow: audio.foreseeFileEvent), then on and off */
const filed = (time: number, midi: number, velocity: number, dur: number): Ev[] => [
  { time, event: { type: 'foresee', midi, velocity, dur } },
  on(time, midi, velocity),
  off(time + dur, midi),
];
interface Part {
  instrument: string;
  events: Ev[];
  params?: Record<string, unknown>;
}
interface Clip {
  name: string;
  what: string;
  parts: Part[];
  seconds: number;
  fs?: number;
  /** the parts share a bus (the Orchestra's: 1/√Σw², each part's limiter told of it), else summed as they are */
  bus?: boolean;
  /** the clip's own number, printed */
  measure?: (L: Float32Array, R: Float32Array, fs: number, parts: Float32Array[]) => string;
}
const clips: Clip[] = [];
const db = (x: number) => 20 * Math.log10(Math.max(1e-12, x));
const rmsOf = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
/** a harmonic's (or any frequency's) power over [a, a + W) (Hann) */
const bin = (x: Float32Array, a: number, W: number, f: number, fs: number) => {
  let re = 0;
  let im = 0;
  for (let i = 0; i < W; i++) {
    const w = (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W)) * x[a + i];
    re += w * Math.cos((2 * Math.PI * f * i) / fs);
    im += w * Math.sin((2 * Math.PI * f * i) / fs);
  }
  return re * re + im * im;
};
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

{
  // 1. the trombone's level: the trumpet's phrase, then the trombone's, mf then ff (each its own instrument)
  const tp: Ev[] = [];
  const tb: Ev[] = [];
  let t = 0.1;
  for (const vel of [72, 112]) {
    for (const m of [60, 64, 67, 72]) (tp.push(on(t, m, vel), off(t + 0.45, m)), (t += 0.5));
    t += 0.3;
    for (const m of [48, 52, 55, 60]) (tb.push(on(t, m, vel), off(t + 0.45, m)), (t += 0.5));
    t += 0.5;
  }
  clips.push({
    name: 'trombone-level',
    what: 'the trumpet’s phrase, then the trombone’s an octave lower, mf then ff',
    parts: [{ instrument: 'trumpet', events: tp }, { instrument: 'trombone', events: tb }],
    seconds: t + 0.6,
    measure: (_L, _R, fs, p) => `trombone ${lufs(p[1], p[1], fs).toFixed(1)} LUFS vs trumpet ${lufs(p[0], p[0], fs).toFixed(1)}`,
  });
}
{
  // 2. a brass and timpani chorale as the Orchestra plays it (one bus): trumpet, horn, trombone, timpani
  const v: Record<string, Ev[]> = { trumpet: [], horn: [], trombone: [], timpani: [] };
  let t = 0.1;
  const chords = [
    [72, 67, 52, 43],
    [74, 65, 53, 38],
    [72, 64, 48, 43],
    [71, 62, 55, 43],
    [72, 64, 48, 36],
  ];
  for (const [k, vel] of [[0, 96], [1, 112]] as const) {
    for (const [a, b, c, d] of chords) {
      v.trumpet.push(on(t, a, vel), off(t + 0.9, a));
      v.horn.push(on(t, b, vel), off(t + 0.9, b));
      v.trombone.push(on(t, c, vel), off(t + 0.9, c));
      for (let r = 0; r < (k ? 11 : 1); r++) v.timpani.push(on(t + r / 12, d, vel - (r % 2) * 6));
      t += 1;
    }
    t += 0.4;
  }
  clips.push({
    name: 'brass-chorale',
    what: 'trumpet, horn, trombone and timpani on one bus (the Orchestra’s), a chorale forte then fortissimo with a roll',
    parts: Object.entries(v).map(([instrument, events]) => ({ instrument, events })),
    seconds: t + 1.5,
    bus: true,
    measure: (_L, _R, fs, p) => `at the bus, RMS dBFS: trumpet ${db(rmsOf(p[0], 0, p[0].length)).toFixed(1)}, horn ${db(rmsOf(p[1], 0, p[1].length)).toFixed(1)}, trombone ${db(rmsOf(p[2], 0, p[2].length)).toFixed(1)}, timpani ${db(rmsOf(p[3], 0, p[3].length)).toFixed(1)}`,
  });
}
{
  // 3. the violin's A0: a chromatic scale G3–F4, ff (C4 and C♯4 boomed)
  const ev: Ev[] = [];
  let t = 0.1;
  for (let m = 55; m <= 65; m++) (ev.push(on(t, m, 112), off(t + 0.5, m)), (t += 0.6));
  clips.push({
    name: 'violin-a0',
    what: 'the violin, G3–F4 chromatic, ff, half a second each',
    parts: [{ instrument: 'violin', events: ev }],
    seconds: t + 0.8,
    measure: (L, _R, fs) => {
      const lv = (i: number) => db(rmsOf(L, Math.round((0.25 + 0.6 * i) * fs), Math.round((0.55 + 0.6 * i) * fs)));
      const ns = Array.from({ length: 11 }, (_, i) => lv(i));
      return `C♯4 ${(ns[6] - (ns[4] + ns[7]) / 2).toFixed(1)} dB over B3/D4, C4 ${(ns[5] - (ns[4] + ns[7]) / 2).toFixed(1)} dB`;
    },
  });
}
{
  // 4. the viola's A0: F♯3–D4 chromatic, ff
  const ev: Ev[] = [];
  let t = 0.1;
  for (let m = 54; m <= 62; m++) (ev.push(on(t, m, 112), off(t + 0.5, m)), (t += 0.6));
  clips.push({
    name: 'viola-a0',
    what: 'the viola, F♯3–D4 chromatic, ff',
    parts: [{ instrument: 'viola', events: ev }],
    seconds: t + 0.8,
    measure: (L, _R, fs) => {
      const ns = Array.from({ length: 9 }, (_, i) => db(rmsOf(L, Math.round((0.25 + 0.6 * i) * fs), Math.round((0.55 + 0.6 * i) * fs))));
      return `A♯3 ${(ns[4] - (ns[3] + ns[5]) / 2).toFixed(1)} dB over A3/B3, C♯4 ${(ns[7] - (ns[6] + ns[8]) / 2).toFixed(1)} dB over C4/D4`;
    },
  });
}
{
  // 5. the bowed strings' releases: violin D5 and E4, viola C4, held and let go (as played: vibrato on)
  const ev: Record<string, Ev[]> = { violin: [], viola: [] };
  ev.violin.push(on(0.1, 74, 100), off(1.3, 74), on(3.6, 64, 100), off(4.8, 64));
  ev.viola.push(on(7.1, 60, 100), off(8.3, 60));
  clips.push({
    name: 'bowed-releases',
    what: 'violin D5, violin E4, viola C4: held 1.2 s and let go, each tail 2.3 s',
    parts: [{ instrument: 'violin', events: ev.violin }, { instrument: 'viola', events: ev.viola }],
    seconds: 10.6,
    measure: (_L, _R, fs, p) => {
      // the tail's largest rise between 50 ms windows, from 0.1 s after the release
      const rise = (x: Float32Array, rel: number) => {
        let worst = -99;
        let prev = NaN;
        for (let t = rel + 0.1; t < rel + 2.2; t += 0.05) {
          const v = db(rmsOf(x, Math.round(t * fs), Math.round((t + 0.05) * fs)));
          if (Number.isFinite(prev)) worst = Math.max(worst, v - prev);
          prev = v;
        }
        return worst.toFixed(1);
      };
      return `the tail's largest rise in 50 ms: violin D5 ${rise(p[0], 1.3)} dB, E4 ${rise(p[0], 4.8)} dB, viola C4 ${rise(p[1], 8.3)} dB`;
    },
  });
}
{
  // 6. the trumpet, soft: each note after the last one's tail (a walk, pp)
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [54, 56, 58, 60, 62, 64, 66, 68, 70]) (ev.push(on(t, m, 28), off(t + 0.4, m)), (t += 0.6));
  clips.push({
    name: 'trumpet-pp',
    what: 'the trumpet, pp, F♯3 up by whole tones, each note over the last one’s tail',
    parts: [{ instrument: 'trumpet', events: ev, params: {} }],
    seconds: t + 0.6,
    measure: (L, _R, fs) => {
      // the largest one-sample step at each note-on against the steps in the 50 ms around it
      let worst = 0;
      for (const e of ev.filter((x) => x.event.type === 'noteOn')) {
        const c = Math.round(e.time * fs);
        let at = 0;
        for (let i = c - 10; i < c + 15; i++) at = Math.max(at, Math.abs(L[i] - L[i - 1]));
        const st: number[] = [];
        for (let i = c - 2400; i < c + 2400; i++) if (i < c - 10 || i >= c + 15) st.push(Math.abs(L[i] - L[i - 1]));
        st.sort((a, b) => a - b);
        worst = Math.max(worst, at / (st[Math.floor(0.99 * (st.length - 1))] + 1e-12));
      }
      return `worst note-on step ${worst.toFixed(2)}× the 99th percentile of the steps around it`;
    },
  });
}
{
  // 7. the flute at 22.05 kHz: C6 up to C7, mf
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [84, 86, 88, 89, 91, 93, 95, 96]) (ev.push(on(t, m, 80), off(t + 0.5, m)), (t += 0.6));
  clips.push({
    name: 'flute-22k-top',
    what: 'the flute at 22.05 kHz, C6–C7, mf',
    parts: [{ instrument: 'flute', events: ev }],
    seconds: t + 0.6,
    fs: 22050,
    measure: (L, _R, fs) => {
      let wrong = 0;
      [84, 86, 88, 89, 91, 93, 95, 96].forEach((m, i) => {
        const a = Math.round((0.35 + 0.6 * i) * fs);
        const W = Math.round(0.2 * fs);
        // its own harmonics against those of the notes up to a ninth above
        const own = bin(L, a, W, et(m), fs) + bin(L, a, W, 2 * et(m), fs);
        let other = 0;
        for (let d = 1; d <= 14; d++) if (d !== 12) other = Math.max(other, bin(L, a, W, et(m + d), fs));
        if (other > own) wrong++;
      });
      return `${wrong} of 8 notes sounding another note`;
    },
  });
}
{
  // 8. the violin's quarter notes in a file (the bow foreseen), a falling D-minor arpeggio around D5 at ff, as
  // in Fable's Toward Morning, where its D5s read an octave low
  const ev: Ev[] = [];
  let t = 0.1;
  for (const [a, b] of [[81, 77], [81, 77], [82, 79], [81, 77], [82, 79], [81, 77]] as const) {
    ev.push(...filed(t, a, 84, 0.325), ...filed(t + 0.385, b, 103, 0.325), ...filed(t + 0.77, 74, 104, 0.325));
    t += 1.155;
  }
  clips.push({
    name: 'violin-quarters',
    what: 'the violin in a file (bow foreseen): A5 F5 D5 / B♭5 G5 D5 in quarters, 0.33 s, v84–104',
    parts: [{ instrument: 'violin', events: ev }],
    seconds: t + 0.8,
    measure: (L, R, fs) => {
      const x = Float32Array.from(L, (v, i) => v + R[i]);
      let worst = -99;
      for (const e of ev.filter((y) => y.event.type === 'noteOn' && y.event.midi === 74)) {
        const a = Math.round((e.time + 0.1) * fs);
        const W = Math.round(0.16 * fs);
        let h = 0;
        let s = 0;
        for (let k = 1; k <= 8; k++) (h += bin(x, a, W, k * et(74), fs), (s += bin(x, a, W, (k - 0.5) * et(74), fs)));
        worst = Math.max(worst, 10 * Math.log10(s / h));
      }
      return `D5s: the octave below (f0/2 and its odd multiples) at most ${worst.toFixed(1)} dB re the note's harmonics`;
    },
  });
}
{
  // 9. the bassoon's register: B2 and D3 held, each begun at two moments 14 ms apart (the reed's noise at
  // the start differs), mf; then A3, whose fundamental is weak (the formant), as recorded
  const ev: Ev[] = [];
  let t = 0.1;
  for (const m of [47, 50])
    for (const dt of [0, 0.0137]) {
      ev.push(on(t + dt, m, 100), off(t + dt + 1.3, m));
      t += 1.8;
    }
  ev.push(on(t, 57, 100), off(t + 1.3, 57));
  t += 1.8;
  clips.push({
    name: 'bassoon-register',
    what: 'the bassoon: B2 twice, D3 twice (each begun 14 ms later the second time), then A3; mf',
    parts: [{ instrument: 'bassoon', events: ev }],
    seconds: t + 0.4,
    measure: (L, _R, fs) => {
      const r: string[] = [];
      [47, 47, 50, 50, 57].forEach((m, i) => {
        const a = Math.round((0.1 + 1.8 * i + 0.9) * fs);
        const W = Math.round(0.3 * fs);
        const H = [1, 2, 3, 4, 5, 6].map((k) => bin(L, a, W, k * et(m), fs));
        const odd = H[0] + H[2] + H[4];
        const all = H.reduce((p, q) => p + q, 0);
        r.push(`${['B2', 'B2′', 'D3', 'D3′', 'A3'][i]} odd harmonics ${(10 * Math.log10(odd / all)).toFixed(0)} dB`);
      });
      return r.join(', ');
    },
  });
}
{
  // 10. the timpani's level: a forte roll on G2 between the cello's and the trombone's held forte
  const vc: Ev[] = [on(0.1, 50, 100), off(2.1, 50)];
  const tm: Ev[] = [];
  for (let i = 0; i < 24; i++) tm.push(on(2.5 + i / 12, 43, 96 + (i % 3) * 4));
  const tb: Ev[] = [on(5.0, 50, 100), off(7.0, 50)];
  clips.push({
    name: 'timpani-level',
    what: 'a forte: the cello’s D3 held, a timpani roll on G2, the trombone’s D3 held',
    parts: [{ instrument: 'cello', events: vc }, { instrument: 'timpani', events: tm }, { instrument: 'trombone', events: tb }],
    seconds: 7.8,
    measure: (_L, _R, fs, p) => `LUFS: cello ${lufs(p[0], p[0], fs).toFixed(1)}, timpani roll ${lufs(p[1], p[1], fs).toFixed(1)}, trombone ${lufs(p[2], p[2], fs).toFixed(1)}`,
  });
}

writeFileSync(join(WAV, 'clips-2.json'), JSON.stringify(clips.map((c) => ({ name: c.name, what: c.what, fs: c.fs ?? 48000 }))));
const report: Record<string, Record<string, string>> = {};
for (const [tag, path] of [['before', BEFORE], ['after', AFTER]] as const) {
  const eng = (await import(pathToFileURL(path).href)) as typeof import('../packages/engine/src/core/index.ts');
  // (the earlier engine had no bus option: its parts' limiters are blind to the bus, as they then were)
  const busOf = (ids: string[]) => {
    const pdb = (eng as unknown as { PLAYBACK_DB?: Record<string, number> }).PLAYBACK_DB ?? {};
    return 1 / Math.sqrt(Math.max(1, ids.reduce((s, id) => s + Math.pow(10, (pdb[id] ?? 0) / 10), 0)));
  };
  for (const c of clips) {
    if (ONLY.length && !ONLY.includes(c.name)) continue;
    const fs = c.fs ?? 48000;
    const n = Math.ceil(c.seconds * fs);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const g = c.bus ? busOf(c.parts.map((p) => p.instrument)) : 1;
    const outs: Float32Array[] = [];
    for (const p of c.parts) {
      const r = eng.renderInstrument({ sampleRate: fs, instrument: p.instrument as never, events: p.events as never, duration: c.seconds, params: p.params as never, ...(c.bus ? { bus: g } : {}) } as never);
      const mono = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        L[i] += g * r.left[i];
        R[i] += g * r.right[i];
        mono[i] = g * r.left[i];
      }
      outs.push(mono);
    }
    const num = c.measure ? c.measure(L, R, fs, outs) : '';
    (report[c.name] ??= { what: c.what })[tag] = num;
    const wav = join(WAV, `${c.name}-${tag}.wav`);
    writeFileSync(wav, encodeWav({ sampleRate: fs, channels: [L, R] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ar', '48000', '-b:a', '160k', join(OUT, `${c.name}-${tag}.mp3`)]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-lavfi', 'aformat=channel_layouts=mono,showspectrumpic=s=960x300:legend=0:scale=log:fscale=lin:stop=16000:color=intensity', join(OUT, `${c.name}-${tag}.png`)]);
    console.log(`${c.name}-${tag}: ${num}`);
  }
}
writeFileSync(join(OUT, 'clips.json'), JSON.stringify(report, null, 1) + '\n');
rmSync(join(WAV, 'clips-2.json'));
