// "Still Air" — Fable 5.2, for the zephyr alone. The score, as a program: writes
// apps/web/public/pieces/fable-still-air.mid and prints its sha256.   npx tsx scripts/compose-zephyr.ts
//
// E♭ major, about seventy-five seconds. The instrument's notes begin from the air and swell, and stop when
// the wind does, so the piece is made of that: voices come in one at a time and are held (the opening builds
// a chord a note at a time), a tune is passed over a slow bass with a tenor rocking under it, the harmony
// steps aside to C♭ at the top of a long crescendo (seven ribbons at once, the bass at G♭2), comes home, and
// the voices leave as they came, the first note the last.
//
// Written as it is played, not typed: a chord's notes go down from the bottom up some milliseconds apart, the
// bass a moment ahead of the beat (it is the slowest to speak), the tune's notes joined, the tempo giving way
// at the ends of phrases. One line, named for its instrument.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../apps/web/public/pieces/fable-still-air.mid');
const PPQ = 480;

// ---------------------------------------------------------------- the tempo: beats to seconds
/** the tempo (quarter notes a minute) at each beat: between the marks it moves evenly */
const TEMPO: [number, number][] = [[0, 50], [8, 52], [15, 48], [16, 58], [30, 60], [31.5, 54], [32, 60], [39, 62], [40, 52], [47, 54], [48, 50], [52, 50], [56, 46], [62, 40], [68, 38]];
const bpmAt = (b: number): number => {
  if (b <= TEMPO[0][0]) return TEMPO[0][1];
  for (let i = 1; i < TEMPO.length; i++) if (b <= TEMPO[i][0]) return TEMPO[i - 1][1] + ((TEMPO[i][1] - TEMPO[i - 1][1]) * (b - TEMPO[i - 1][0])) / (TEMPO[i][0] - TEMPO[i - 1][0]);
  return TEMPO[TEMPO.length - 1][1];
};
const STEP = 1 / 8;
const secAt: number[] = [0];
for (let k = 0; k < 80 / STEP; k++) secAt.push(secAt[k] + (60 / bpmAt((k + 0.5) * STEP)) * STEP);
const sec = (beat: number): number => {
  const x = Math.max(0, beat) / STEP;
  const i = Math.min(secAt.length - 2, Math.floor(x));
  return secAt[i] + (secAt[i + 1] - secAt[i]) * (x - i);
};

// ---------------------------------------------------------------- the notes
interface N {
  beat: number;
  dur: number;
  p: number;
  vel: number;
  /** seconds from its beat (the hand: the bass ahead, a chord from the bottom up) */
  off: number;
}
const notes: N[] = [];
/** a small deterministic unevenness */
let seed = 20800;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296 - 0.5;
};
/** a voice's note */
const n = (beat: number, dur: number, p: number, vel: number, off = 0) => notes.push({ beat, dur, p, vel: Math.round(vel + 2 * rnd()), off: off + 0.006 * rnd() });
/** a chord, its notes from the bottom up `roll` seconds apart, the lowest a little ahead; `top` more for its top note */
const chord = (beat: number, dur: number, ps: number[], vel: number, roll = 0.016, top = 3) =>
  [...ps].sort((a, b) => a - b).forEach((p, i, a) => n(beat, dur, p, vel + (i === a.length - 1 ? top : i === 0 ? 1 : -1), -0.03 + i * roll * (1 + 0.5 * rnd())));
/** a tune: [length in beats, pitch] from `beat`, each note joined to the next; `vel` by the note's index */
const tune = (beat: number, line: [number, number][], vel: (k: number) => number) => {
  let b = beat;
  line.forEach(([d, p], k) => {
    if (p > 0) n(b, d * 0.98 + 0.03, p, vel(k), 0.004);
    b += d;
  });
};

// A — one by one (beats 0–16): a chord built a note at a time, then two more, held
n(0, 8.1, 58, 40);
n(2, 6.1, 51, 40, -0.02);
n(4, 4.1, 67, 43);
n(6, 2.1, 74, 45);
chord(8, 4.05, [44, 51, 60, 67], 44);
tune(8, [[2, 70], [2, 72]], () => 49);
chord(12, 4.0, [46, 53, 62, 68], 47);
tune(12, [[2, 77], [2, 75]], (k) => 53 - 3 * k);

// B — the tune over a slow bass, a tenor rocking under it (beats 16–40), growing
const rock = (beat: number, a: number, b: number, vel: number, pat = [0, 1, 0, 1]) => pat.forEach((s, k) => n(beat + k, 1.02, s ? b : a, vel - (k % 2 ? 2 : 0), 0.006));
chord(16, 4.0, [39, 46], 54, 0.02, 0);
rock(16, 55, 58, 52);
tune(16, [[1.5, 67], [0.5, 68], [1, 70], [1, 75]], (k) => 60 + k);
chord(20, 4.0, [48], 55, 0.02, 0);
rock(20, 51, 55, 53);
tune(20, [[1.5, 74], [0.5, 72], [1, 70], [1, 67]], (k) => 63 - k);
chord(24, 4.0, [44, 51], 57, 0.02, 0);
rock(24, 60, 63, 55);
tune(24, [[1, 68], [1, 72], [1.5, 75], [0.5, 74]], (k) => 62 + 2 * k);
chord(28, 4.0, [46, 53], 58, 0.02, 0);
n(28, 2.02, 63, 56, 0.006);
n(30, 2.0, 62, 54, 0.006);
tune(28, [[2, 72], [1, 70], [1, 77]], (k) => 66 - 2 * (k === 1 ? 1 : 0) + (k === 2 ? 4 : 0));
chord(32, 2.0, [43, 50], 66, 0.02, 0);
chord(34, 2.0, [48, 55], 67, 0.02, 0);
rock(32, 58, 62, 63, [0, 1]);
rock(34, 63, 60, 64, [0, 1]);
tune(32, [[1.5, 79], [0.5, 77], [1, 75], [1, 74]], (k) => 76 - k);
chord(36, 2.0, [41, 48], 70, 0.02, 0);
chord(38, 2.0, [46, 56], 76, 0.02, 0);
rock(36, 56, 60, 68, [0, 1]);
rock(38, 62, 65, 74, [0, 1]);
tune(36, [[1, 72], [1, 75], [1, 77], [1, 80]], (k) => 76 + 5 * k);

// C — aside to C♭, and home (beats 40–52)
chord(40, 4.0, [42, 47, 54, 63, 66, 70], 100, 0.02, 0);
tune(40, [[3, 82], [1, 80]], (k) => 108 - 6 * k);
chord(44, 2.0, [44, 51, 59, 63, 68], 96, 0.018, 0);
chord(46, 2.0, [46, 53, 62, 68], 92, 0.018, 0);
tune(44, [[2, 78], [2, 77]], (k) => 100 - 4 * k);
chord(48, 4.0, [39, 46, 55, 58, 63, 70], 92, 0.022, 0);
tune(48, [[2, 79], [1, 75], [1, 70]], (k) => 98 - 9 * k);

// D — the voices leave as they came (beats 52–68)
chord(52, 4.0, [39, 51, 60, 63], 56, 0.02, 0);
tune(52, [[2, 72], [2, 70]], (k) => 60 - 5 * k);
n(56, 6.6, 39, 44, -0.03);
n(56, 6.5, 46, 43, -0.012);
n(56, 11.6, 58, 44);
n(56, 5.0, 67, 44, 0.016);
n(57.5, 6.4, 87, 38);

// ---------------------------------------------------------------- the file
const vlq = (v: number): number[] => {
  const out = [v & 0x7f];
  while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
  return out;
};
const text = (type: number, s: string) => [0xff, type, ...vlq(s.length), ...[...s].map((c) => c.charCodeAt(0))];
interface Ev {
  tick: number;
  rank: number;
  bytes: number[];
}
function chunk(evs: Ev[]): number[] {
  evs.sort((a, b) => a.tick - b.tick || a.rank - b.rank);
  const body: number[] = [];
  let at = 0;
  for (const e of evs) {
    body.push(...vlq(e.tick - at), ...e.bytes);
    at = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const len = body.length;
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body];
}
// (the file's clock is the tempo map's: a tick is the beat's; the hand's milliseconds are turned into ticks
// at the tempo there)
const tickOf = (beat: number, off: number) => Math.max(0, Math.round((beat + (off * bpmAt(beat)) / 60) * PPQ));
// the first note begins the file (its hand's lead taken out)
const lead = Math.min(...notes.map((x) => tickOf(x.beat, x.off)));
const conductor: Ev[] = [{ tick: 0, rank: 0, bytes: text(3, 'Still Air') }, { tick: 0, rank: 0, bytes: text(2, 'Fable 5.2, 2026. CC0 1.0') }, { tick: 0, rank: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] }];
for (let b = 0; b <= 70; b += 0.5) {
  const us = Math.round(60e6 / bpmAt(b + 0.25));
  conductor.push({ tick: Math.max(0, Math.round(b * PPQ) - (b ? lead : 0)), rank: 1, bytes: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
}
const track: Ev[] = [{ tick: 0, rank: 0, bytes: text(3, 'Zephyr') }, { tick: 0, rank: 1, bytes: [0xb0, 7, 100] }, { tick: 0, rank: 1, bytes: [0xb0, 11, 127] }];
for (const x of notes) {
  const on = tickOf(x.beat, x.off) - lead;
  const off = Math.max(on + 30, tickOf(x.beat + x.dur, 0) - lead);
  track.push({ tick: on, rank: 5, bytes: [0x90, x.p, Math.max(1, Math.min(127, x.vel))] }, { tick: off, rank: 2, bytes: [0x80, x.p, 0] });
}
const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, (PPQ >> 8) & 255, PPQ & 255];
const bytes = Uint8Array.from([...head, ...chunk(conductor), ...chunk(track)]);
writeFileSync(OUT, bytes);
const end = Math.max(...notes.map((x) => sec(x.beat + x.dur)));
console.log(`${OUT}\n${notes.length} notes, ${end.toFixed(1)} s, ${bytes.length} bytes\nsha256 ${createHash('sha256').update(bytes).digest('hex')}`);
