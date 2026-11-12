// The calibration judge (after Chimera's): is a model change BETTER, WORSE or NO CLEAR CHANGE
// against the recordings? Every error is measured in units of the recording's own note-to-note
// variation (how much neighbouring real notes differ on that measure), notes alternate between a
// fit half and a held-out half, and guards keep any one measure from being traded away.
//   npx tsx scripts/judge.ts --instrument violin --before <repo>/packages/engine/src/core/index.ts [--after <engine>]
//   (without --after: this checkout's engine)
// The verdict uses the held-out half only: the paired per-note score must improve by more than
// two standard errors (and 0.05 spreads) for BETTER, or worsen as clearly for WORSE; a guard
// measure whose held-out error grows by more than half a spread caps the verdict at NO CLEAR CHANGE.
import type { SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';

export interface NoteErr {
  /** instrument:dyn:midi */
  key: string;
  midi: number;
  /** signed errors (model − recording) per measure, in that measure's units */
  errs: Record<string, number>;
  /** held out of the fit (the timpani: drums 2 and 4); absent, by pitch (odd MIDI notes) */
  held?: boolean;
}
export interface Measure {
  name: string;
  /** the recording's own note-to-note variation of this measure (same units) */
  spread: number;
  /** true: also a guard */
  guard?: boolean;
}
export interface Verdict {
  verdict: 'BETTER' | 'WORSE' | 'NO CLEAR CHANGE';
  fit: { before: number; after: number; n: number };
  heldOut: { before: number; after: number; n: number; delta: number; se: number };
  perMeasure: Record<string, { before: number; after: number; spread: number }>;
  guardsBroken: string[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
/** notes alternate between halves by pitch, per instrument and dynamic (or as the note says: the
 *  timpani's recordings are five drums, two of them held out) */
export const isHeldOut = (n: NoteErr) => n.held ?? n.midi % 2 === 1;

function score(n: NoteErr, ms: Measure[]): number {
  const zs = ms.map((m) => Math.abs(n.errs[m.name]) / m.spread).filter(Number.isFinite);
  return zs.length ? mean(zs) : NaN;
}

export function judge(before: NoteErr[], after: NoteErr[], measures: Measure[]): Verdict {
  const A = new Map(after.map((n) => [n.key, n]));
  const pairs = before.map((b) => [b, A.get(b.key)] as const).filter((p): p is readonly [NoteErr, NoteErr] => !!p[1]);
  const half = (held: boolean) => pairs.filter(([b]) => isHeldOut(b) === held);
  const sc = (ps: (readonly [NoteErr, NoteErr])[], k: 0 | 1) => mean(ps.map((p) => score(p[k], measures)).filter(Number.isFinite));
  const fit = half(false);
  const ho = half(true);
  const d = ho.map(([b, a]) => score(b, measures) - score(a, measures)).filter(Number.isFinite);
  const delta = mean(d);
  const se = sd(d) / Math.sqrt(Math.max(1, d.length));
  const perMeasure: Verdict['perMeasure'] = {};
  const guardsBroken: string[] = [];
  for (const m of measures) {
    const mb = mean(ho.map(([b]) => Math.abs(b.errs[m.name])).filter(Number.isFinite));
    const ma = mean(ho.map(([, a]) => Math.abs(a.errs[m.name])).filter(Number.isFinite));
    perMeasure[m.name] = { before: mb, after: ma, spread: m.spread };
    if (m.guard && (ma - mb) / m.spread > 0.5) guardsBroken.push(m.name);
  }
  let verdict: Verdict['verdict'] = 'NO CLEAR CHANGE';
  if (delta > 2 * se && delta > 0.05) verdict = guardsBroken.length ? 'NO CLEAR CHANGE' : 'BETTER';
  else if (delta < -2 * se && delta < -0.05) verdict = 'WORSE';
  return { verdict, fit: { before: sc(fit, 0), after: sc(fit, 1), n: fit.length }, heldOut: { before: sc(ho, 0), after: sc(ho, 1), n: ho.length, delta, se }, perMeasure, guardsBroken };
}

/** the recording's own variation of a per-note value: neighbouring notes (same dynamic) differ by
 *  this much; median |Δ| between adjacent notes / √2 */
export function localSpread(values: { midi: number; group: string; v: number }[]): number {
  const by = new Map<string, { midi: number; v: number }[]>();
  for (const x of values) if (Number.isFinite(x.v)) (by.get(x.group) ?? by.set(x.group, []).get(x.group)!).push(x);
  const ds: number[] = [];
  for (const xs of by.values()) {
    xs.sort((a, b) => a.midi - b.midi);
    for (let i = 1; i < xs.length; i++) ds.push(Math.abs(xs[i].v - xs[i - 1].v));
  }
  ds.sort((a, b) => a - b);
  return Math.max(1e-6, (ds[Math.floor(ds.length / 2)] ?? 1) / Math.SQRT2);
}

// ---------------------------------------------------------------- sustained instruments (Iowa MIS)
/** per-note errors and the measures for the ensemble's sustained analysis */
export function sustainedErrors(pairs: { ref: SustainedAnalysis & { instrument: string; dyn: string; variant?: string }; model: SustainedAnalysis | null }[], harmErr: (m: SustainedAnalysis, r: SustainedAnalysis) => number) {
  const ok = pairs.filter((p) => p.model);
  const errs: NoteErr[] = ok.map((p) => {
    const m = p.model!;
    const r = p.ref;
    return {
      key: `${r.instrument}${r.variant ? `/${r.variant}` : ''}:${r.dyn}:${r.midi}`,
      midi: r.midi,
      errs: {
        harmonics: harmErr(m, r),
        centroid: Math.log2(m.centroid / r.centroid),
        noise: m.hnrDb - r.hnrDb,
        attack: Math.log2(m.attackMs / r.attackMs),
        pitch: m.cents,
        level: m.rmsDb - r.rmsDb,
      },
    };
  });
  const refs = ok.map((p) => p.ref);
  const g = (r: { instrument: string; dyn: string; variant?: string }) => `${r.instrument}${r.variant ? `/${r.variant}` : ''}:${r.dyn}`;
  // the recording's own spread of each measure (harmonics: how different neighbouring notes' profiles are)
  const harmSpread = (() => {
    const ds: number[] = [];
    const by = new Map<string, typeof refs>();
    for (const r of refs) (by.get(g(r)) ?? by.set(g(r), []).get(g(r))!).push(r);
    for (const xs of by.values()) {
      xs.sort((a, b) => a.midi - b.midi);
      for (let i = 1; i < xs.length; i++) ds.push(harmErr(xs[i], xs[i - 1]));
    }
    const s = ds.filter(Number.isFinite).sort((a, b) => a - b);
    return Math.max(0.5, (s[Math.floor(s.length / 2)] ?? 3) / Math.SQRT2);
  })();
  // level differences between notes in a recording are partly the player; use the same estimate
  const measures: Measure[] = [
    { name: 'harmonics', spread: harmSpread, guard: true },
    { name: 'centroid', spread: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: Math.log2(r.centroid) }))), guard: true },
    { name: 'noise', spread: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: r.hnrDb }))), guard: true },
    { name: 'attack', spread: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: Math.log2(r.attackMs) }))), guard: true },
    { name: 'pitch', spread: Math.max(1, localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: r.cents })))), guard: true },
    { name: 'level', spread: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: r.rmsDb }))) },
  ];
  return { errs, measures };
}

export function printVerdict(v: Verdict, label: string): void {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
  console.log(`${label}: ${v.verdict}`);
  console.log(`  score (mean |error| / spread): fit ${f(v.fit.before)} → ${f(v.fit.after)} (n=${v.fit.n}); held-out ${f(v.heldOut.before)} → ${f(v.heldOut.after)} (n=${v.heldOut.n}, Δ ${f(v.heldOut.delta)} ± ${f(v.heldOut.se)})`);
  for (const [k, m] of Object.entries(v.perMeasure)) console.log(`  ${k.padEnd(10)} held-out |err| ${f(m.before)} → ${f(m.after)} (spread ${f(m.spread)})`);
  if (v.guardsBroken.length) console.log(`  guards broken: ${v.guardsBroken.join(', ')}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const inst = (opt('--instrument') ?? 'violin').split(',');
  const { resolve } = await import('node:path');
  if (inst[0] === 'timpani') {
    // the timpani: struck strokes against VSCO 2 CE (scripts/calibrate-timpani.ts)
    const t = await import('./calibrate-timpani.ts');
    await t.useEngine(opt('--before') ? resolve(opt('--before')!) : undefined);
    const before = t.timpaniErrors(t.compareAll());
    await t.useEngine(opt('--after') ? resolve(opt('--after')!) : undefined);
    const after = t.timpaniErrors(t.compareAll());
    const v = judge(before.errs, after.errs, before.measures);
    printVerdict(v, `timpani: ${opt('--before') ? 'before' : 'this'} → ${opt('--after') ?? 'this checkout'}`);
    if (args.includes('--json')) console.log(JSON.stringify(v));
    process.exit(0);
  }
  if (inst[0] === 'harp') {
    // the harp: plucked strings against VSCO 2 CE (scripts/calibrate-harp.ts)
    const t = await import('./calibrate-harp.ts');
    await t.useEngine(opt('--before') ? resolve(opt('--before')!) : undefined);
    const before = t.harpErrors(await t.compareAll());
    await t.useEngine(opt('--after') ? resolve(opt('--after')!) : undefined);
    if (opt('--folds')) {
      // Two folds (one recorded pluck a string leaves eleven held-out strings: few). --folds a.json,b.json:
      // a the voicing fitted on the strings not held (fit-harp.ts), b the one fitted on the held ones
      // (fit-harp.ts --swap); each string is judged by the voicing that never saw it, so all twenty-three
      // are held out.
      const { readFileSync } = await import('node:fs');
      const [a, b] = opt('--folds')!.split(',').map((f) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, number>);
      const ea = t.harpErrors(await t.compareAll({ voice: a })).errs;
      const eb = t.harpErrors(await t.compareAll({ voice: b })).errs;
      const merged = ea.map((n, i) => ({ ...(n.held ? n : eb[i]), held: true }));
      const v = judge(before.errs.map((n) => ({ ...n, held: true })), merged, before.measures);
      printVerdict(v, `harp, two folds: ${opt('--before') ? 'before' : 'this'} → each string by the voicing fitted without it`);
      if (args.includes('--json')) console.log(JSON.stringify(v));
      process.exit(0);
    }
    const after = t.harpErrors(await t.compareAll());
    const v = judge(before.errs, after.errs, before.measures);
    printVerdict(v, `harp: ${opt('--before') ? 'before' : 'this'} → ${opt('--after') ?? 'this checkout'}`);
    if (args.includes('--json')) console.log(JSON.stringify(v));
    process.exit(0);
  }
  const { compareAll, useEngine, harmErr } = await import('./calibrate-ensemble.ts');
  const run = async (engine?: string) => {
    await useEngine(engine ? resolve(engine) : undefined);
    return compareAll({ only: inst as never });
  };
  const before = sustainedErrors(await run(opt('--before')), harmErr);
  const after = sustainedErrors(await run(opt('--after')), harmErr);
  const v = judge(before.errs, after.errs, before.measures);
  printVerdict(v, `${inst.join('+')}: ${opt('--before') ? 'before' : 'this'} → ${opt('--after') ?? 'this checkout'}`);
  if (args.includes('--json')) console.log(JSON.stringify(v));
}
