// Standard MIDI File reader (format 0 and 1): every track merged, the tempo map applied, timing in
// seconds. Notes, sustain/sostenuto/soft pedals, and the controllers that carry dynamics: volume
// (CC7), expression (CC11) and the mod wheel (CC1); the drum channel (10) is skipped, since it would
// play pitches on a pitched instrument. Each note, pedal and controller also says which line it
// belongs to: a line is one track's notes on one channel (format 1 files keep a part per track,
// format 0 files a part per channel), described in `lines` for assigning parts to instruments
// (orchestra/assign.ts). A controller in a track with no notes of its channel (a conductor track)
// goes to every line on that channel. The bar lines (from the time signatures) are kept for phrasing
// (expression.ts).

export type FileEvent =
  | { t: number; kind: 'on'; midi: number; vel: number; line?: number }
  | { t: number; kind: 'off'; midi: number; line?: number }
  | { t: number; kind: 'pedal'; cc: 64 | 66 | 67; value: number; line?: number }
  /** a controller that carries dynamics, 0…1 (value / 127): CC7 volume, CC11 expression, CC1 mod wheel */
  | { t: number; kind: 'cc'; cc: FileCC; value: number; line?: number }
  /** automatic expression (expression.ts): the line's dynamic within a held note, as a velocity offset */
  | { t: number; kind: 'dyn'; value: number; line?: number };

/** the controllers a file's dynamics come in */
export type FileCC = 1 | 7 | 11;

/** one part of the file: a track's notes on one channel */
export interface MidiLine {
  track: number;
  channel: number;
  /** the track's name (meta 3) and instrument name (meta 4), as written */
  name: string;
  instrument: string;
  /** General MIDI program (0…127) in force at the line's first note, −1 if the file sets none */
  program: number;
  notes: number;
  lo: number;
  hi: number;
  median: number;
  /** most notes held at once */
  poly: number;
}

export interface MidiSong {
  events: FileEvent[];
  duration: number;
  lines: MidiLine[];
  /** the bar lines, seconds (4/4 where the file sets no time signature) */
  bars?: number[];
}

/** how long (s) notes must sound together to count as a chord (MidiLine.poly) */
const POLY_HOLD = 0.04;

export function parseMidi(buf: ArrayBuffer): MidiSong {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i));
    return s;
  };
  if (str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = d.getUint32(4);
  const ntracks = d.getUint16(10);
  const division = d.getUint16(12);
  p = 8 + hlen;
  // ticks → seconds: PPQ with a tempo map, or SMPTE (fixed ticks per second)
  const smpte = (division & 0x8000) !== 0;
  const ppq = division & 0x7fff;
  const smpteTps = smpte ? -((division >> 8) - 256 || -25) * (division & 0xff) : 0;

  type Raw = { tick: number; order: number; key: number; ev: { kind: 'on' | 'off' | 'pedal' | 'cc' | 'tempo' | 'bar'; a: number; b: number } };
  const raw: Raw[] = [];
  const names: string[] = [];
  const insts: string[] = [];
  /** program changes per channel, in file order: [tick, program] */
  const progs: [number, number][][] = Array.from({ length: 16 }, () => []);
  /** time signatures: [tick, ticks per bar] */
  const meters: [number, number][] = [];
  let lastTickAll = 0;
  let order = 0;
  for (let tr = 0; tr < ntracks && p + 8 <= d.byteLength; tr++) {
    const id = str(4);
    const len = d.getUint32(p + 4);
    p += 8;
    const end = Math.min(d.byteLength, p + len);
    names[tr] = '';
    insts[tr] = '';
    if (id !== 'MTrk') {
      p = end;
      continue;
    }
    let tick = 0;
    let status = 0;
    const vlq = () => {
      let v = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const b = d.getUint8(p++);
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return v;
    };
    const text = (l: number) => {
      let s = '';
      for (let i = 0; i < l && p + i < end; i++) s += String.fromCharCode(d.getUint8(p + i));
      return s.trim();
    };
    while (p < end) {
      tick += vlq();
      let b = d.getUint8(p);
      if (b & 0x80) {
        status = b;
        p++;
      } else if (!status) break; // corrupt: data without status
      b = status;
      if (b === 0xff) {
        const type = d.getUint8(p++);
        const l = vlq();
        if (type === 0x51 && l === 3) raw.push({ tick, order: order++, key: -1, ev: { kind: 'tempo', a: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2), b: 0 } });
        else if (type === 0x58 && l >= 2) meters.push([tick, Math.max(1, d.getUint8(p)) * 4 * (ppq || 480) / 2 ** Math.min(6, d.getUint8(p + 1))]);
        else if (type === 0x03 && !names[tr]) names[tr] = text(l);
        else if (type === 0x04 && !insts[tr]) insts[tr] = text(l);
        p += l;
        if (type === 0x2f) break;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        p += vlq();
        continue;
      }
      const type = b & 0xf0;
      const ch = b & 0x0f;
      const d1 = d.getUint8(p++);
      const d2 = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
      if (ch === 9) continue;
      const key = tr * 16 + ch;
      if (type === 0x90 && d2 > 0) raw.push({ tick, order: order++, key, ev: { kind: 'on', a: d1, b: d2 } });
      else if (type === 0x80 || (type === 0x90 && d2 === 0)) raw.push({ tick, order: order++, key, ev: { kind: 'off', a: d1, b: 0 } });
      else if (type === 0xb0 && (d1 === 64 || d1 === 66 || d1 === 67)) raw.push({ tick, order: order++, key, ev: { kind: 'pedal', a: d1, b: d2 } });
      else if (type === 0xb0 && (d1 === 1 || d1 === 7 || d1 === 11)) raw.push({ tick, order: order++, key, ev: { kind: 'cc', a: d1, b: d2 } });
      // reset all controllers: expression back to full, the mod wheel to rest (the volume stays)
      else if (type === 0xb0 && d1 === 121) {
        raw.push({ tick, order: order++, key, ev: { kind: 'cc', a: 11, b: 127 } });
        raw.push({ tick, order: order++, key, ev: { kind: 'cc', a: 1, b: 0 } });
      } else if (type === 0xc0) progs[ch].push([tick, d1]);
      if (tick > lastTickAll) lastTickAll = tick;
    }
    p = end;
  }
  // the bar lines up to the last event (a time signature starts a bar; 4/4 before any)
  if (!smpte) {
    meters.sort((a, b) => a[0] - b[0]);
    let m = 0;
    let len = 4 * (ppq || 480);
    for (let t = 0, guard = 0; t <= lastTickAll && guard < 100000; guard++) {
      while (m < meters.length && meters[m][0] <= t) len = meters[m++][1];
      raw.push({ tick: t, order: order++, key: -1, ev: { kind: 'bar', a: 0, b: 0 } });
      // a time signature in the middle of a bar starts the next bar there
      const next = t + len;
      t = m < meters.length && meters[m][0] < next ? meters[m][0] : next;
    }
  }
  // same tick: tempo first, then note-offs (a repeated note re-strikes), then the rest
  const rank = { tempo: 0, bar: 1, off: 2, pedal: 3, cc: 4, on: 5 } as const;
  raw.sort((x, y) => x.tick - y.tick || rank[x.ev.kind] - rank[y.ev.kind] || x.order - y.order);

  // the lines, in the order of their tracks and channels (a file's own score order)
  const keys = [...new Set(raw.filter((r) => r.ev.kind === 'on').map((r) => r.key))].sort((a, b) => a - b);
  const lineOf = new Map(keys.map((k, i) => [k, i]));
  /** a controller's lines: its own, or (a track with no notes on its channel) every line on that channel */
  const ccLines = (key: number): (number | undefined)[] => {
    const own = lineOf.get(key);
    if (own !== undefined) return [own];
    const same = keys.flatMap((k, i) => (k % 16 === key % 16 ? [i] : []));
    return same.length ? same : [undefined];
  };
  // (poly: the most notes held together, for at least POLY_HOLD s, and in at least 1 % of the line: a grace
  // note over a held one, or a typesetter's lone overlap, does not make a melody two-part, so a wind
  // can still take it. `spans[k]`: how many times k notes sounded together that long)
  const stats = keys.map(() => ({ pitches: [] as number[], held: new Map<number, number>(), n: 0, at: 0, spans: [] as number[], firstTick: -1 }));
  const level = (s: (typeof stats)[number], t: number, n: number) => {
    if (s.n > 0 && t - s.at >= POLY_HOLD) s.spans[s.n] = (s.spans[s.n] ?? 0) + 1;
    s.n = n;
    s.at = t;
  };
  const polyOf = (s: (typeof stats)[number]): number => {
    if (s.n > 0) level(s, Infinity, 0);
    const need = Math.max(1, Math.ceil(0.01 * s.pitches.length));
    let poly = s.pitches.length ? 1 : 0;
    let atLeast = 0;
    for (let k = s.spans.length - 1; k >= 2; k--) {
      atLeast += s.spans[k] ?? 0;
      if (atLeast >= need) {
        poly = k;
        break;
      }
    }
    return poly;
  };

  const events: FileEvent[] = [];
  const bars: number[] = [];
  let usPerQ = 500000;
  let lastTick = 0;
  let sec = 0;
  for (const r of raw) {
    sec += smpte ? (r.tick - lastTick) / smpteTps : ((r.tick - lastTick) * usPerQ) / 1e6 / (ppq || 480);
    lastTick = r.tick;
    const e = r.ev;
    const line = lineOf.get(r.key);
    const s = line === undefined ? null : stats[line];
    if (e.kind === 'tempo') usPerQ = e.a || 500000;
    else if (e.kind === 'bar') bars.push(sec);
    else if (e.kind === 'cc') for (const l of ccLines(r.key)) events.push({ t: sec, kind: 'cc', cc: e.a as FileCC, value: e.b / 127, line: l });
    else if (e.kind === 'on') {
      events.push({ t: sec, kind: 'on', midi: e.a, vel: e.b, line });
      if (s) {
        if (s.firstTick < 0) s.firstTick = r.tick;
        s.pitches.push(e.a);
        s.held.set(e.a, (s.held.get(e.a) ?? 0) + 1);
        level(s, sec, s.n + 1);
      }
    } else if (e.kind === 'off') {
      events.push({ t: sec, kind: 'off', midi: e.a, line });
      const h = s?.held.get(e.a);
      if (s && h) {
        s.held.set(e.a, h - 1);
        level(s, sec, s.n - 1);
      }
    } else events.push({ t: sec, kind: 'pedal', cc: e.a as 64 | 66 | 67, value: e.b / 127, line });
  }
  const lines: MidiLine[] = keys.map((k, i) => {
    const s = stats[i];
    const tr = Math.floor(k / 16);
    const ch = k % 16;
    const pc = progs[ch];
    let program = -1;
    for (const [t, v] of pc) if (t <= s.firstTick || program < 0) program = v;
    const sorted = [...s.pitches].sort((a, b) => a - b);
    return {
      track: tr,
      channel: ch,
      name: names[tr] ?? '',
      instrument: insts[tr] ?? '',
      program,
      notes: sorted.length,
      lo: sorted[0],
      hi: sorted[sorted.length - 1],
      median: sorted[sorted.length >> 1],
      poly: polyOf(s),
    };
  });
  // (the length is the music's: a controller after the last note does not make it longer)
  let last = events.length - 1;
  while (last > 0 && events[last].kind === 'cc') last--;
  const duration = last >= 0 ? events[last].t : 0;
  return { events, duration, lines, bars: smpte ? undefined : bars.filter((b) => b <= duration + 1e-9) };
}
