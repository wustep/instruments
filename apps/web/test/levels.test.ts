// Every bundled piece at about one loudness, and its parts in balance (orchestra/pieces.ts `gain`: a
// piece's level on the ensemble's bus, a part's on its engine, an instrument's own piece's on its engine).
// The numbers are measured, never set by ear: scripts/levels-pieces.ts renders every piece whole as the
// page plays it and writes artifacts/round3/rebalance/levels.json; this checks that table against the
// code (a gain changed without measuring again fails here) and against the rule (each within ±1.5 LU of
// the middle, peaks clear of the bus limiter).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { placeNote } from '../src/orchestra/assign.ts';
import { DEMOS, dbGain, PIECES, piecePlan, pieceTrims, type Piece } from '../src/orchestra/pieces.ts';

const TABLE = new URL('../../../artifacts/round3/rebalance/levels.json', import.meta.url);
type Row = { id: string; gainDb: number; lufs: number; peakDb: number; prePeakDb: number; busLimDb: number; parts: { voice: string; lines: number[]; trimDb: number }[] };
const rows: Row[] = existsSync(TABLE) ? JSON.parse(readFileSync(TABLE, 'utf8')) : [];

const load = (file: string) => {
  const b = readFileSync(new URL(`../public/pieces/${file}`, import.meta.url));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

describe('the pieces’ levels', () => {
  it('each part of a piece seated as it came takes its own level; seated on a smaller stage, the level of the part of its voice it plays', () => {
    for (const pc of PIECES) {
      const song = load(pc.file);
      const whole = piecePlan(pc, song.lines, Math.max(6, pc.parts.length));
      const t = pieceTrims(pc, whole);
      expect(t.length).toBe(whole.parts.length);
      // (every part of the piece, in order, when the stage holds them all)
      if (whole.parts.length === pc.parts.length) t.forEach((g, i) => expect(g).toBeCloseTo(dbGain(pc.parts[i].gain), 12));
      const small = piecePlan(pc, song.lines, 6);
      pieceTrims(pc, small).forEach((g, k) => {
        // (a piano standing in for several lines on a phone's stage is none of the piece's parts: 1)
        const q = small.parts[k];
        const mine = pc.parts.filter((p) => p.voice === q.voice && p.lines.some((l) => q.lines.includes(l))).map((p) => dbGain(p.gain));
        if (!mine.length) expect(g).toBe(1);
        else expect(mine.some((m) => Math.abs(m - g) < 1e-12)).toBe(true);
      });
    }
    // a piece with none: 1 everywhere
    const bare: Piece = { ...PIECES[0], parts: PIECES[0].parts.map(({ gain: _, ...p }) => p) };
    expect(pieceTrims(bare, piecePlan(bare, load(bare.file).lines, 6)).every((g) => g === 1)).toBe(true);
  });

  it('Beethoven’s basses sound an octave under the cellos they share a staff’s notes with (the file writes them where they are read)', () => {
    for (const id of ['beethoven5-i', 'beethoven5-ii']) {
      const pc = PIECES.find((p) => p.id === id)!;
      const song = load(pc.file);
      const plan = piecePlan(pc, song.lines, pc.parts.length);
      const at = (line: number, voice: 'cello' | 'bass') => {
        const sh = plan.lines[line].find((r) => plan.parts[r.part].voice === voice)!.shift;
        return new Map(song.events.filter((e) => e.kind === 'on' && e.line === line).map((e) => [e.t.toFixed(3), placeNote((e as { midi: number }).midi, sh, voice)]));
      };
      const vc = at(10, 'cello');
      const cb = at(11, 'bass');
      let under = 0;
      let all = 0;
      for (const [t, m] of cb)
        if (vc.has(t)) {
          all++;
          if (vc.get(t)! - m === 12) under++;
        }
      expect(all).toBeGreaterThan(300);
      expect(under / all).toBeGreaterThan(0.75);
    }
  });

  it('the measured table is the code’s: every piece and every instrument’s own piece, at the gains set now', () => {
    const ids = [...PIECES.map((p) => p.id), ...Object.keys(DEMOS).map((k) => `demo:${k}`)];
    expect(rows.map((r) => r.id).sort(), 'measure again: npx tsx scripts/levels-pieces.ts render --tag now; … measure --tag now --json artifacts/round3/rebalance/levels.json').toEqual([...ids].sort());
    for (const r of rows) {
      const pc = PIECES.find((p) => p.id === r.id);
      const gain = pc ? (pc.gain ?? 0) : (DEMOS[r.id.slice(5) as keyof typeof DEMOS].gain ?? 0);
      expect(r.gainDb, r.id).toBeCloseTo(gain, 1);
      if (pc && r.parts.length === pc.parts.length) r.parts.forEach((q, i) => expect(q.trimDb, `${r.id} ${q.voice}`).toBeCloseTo(pc.parts[i].gain ?? 0, 1));
    }
  });

  it('every piece within ±1.5 LU of the middle, its peaks under the bus limiter (an ensemble) or the engine’s (alone)', () => {
    const l = rows.map((r) => r.lufs).sort((a, b) => a - b);
    const mid = (l[0] + l[l.length - 1]) / 2;
    for (const r of rows) {
      expect(Math.abs(r.lufs - mid), r.id).toBeLessThanOrEqual(1.5);
      // (an ensemble's bus limiter at −2 dBFS; one instrument's own at −1 dBFS)
      expect(r.prePeakDb, r.id).toBeLessThan(r.id.startsWith('demo:') ? -1 : -2);
      expect(r.busLimDb, r.id).toBeGreaterThan(-1);
    }
  });
});
