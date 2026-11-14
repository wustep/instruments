// A LilyPond part's dynamic marks, by bar and beat: enough of LilyPond is read to keep time through a
// part (durations, dots, tuplets, chords, parallel voices, repeats, grace notes) and to find its marks
// (\p … \ff, \sf, \fp, \cresc, \dim, hairpins, and words such as "cresc." in a \markup). The time kept is
// checked against the MIDI file made from the same source: the share of the file's note onsets that the
// part's notes fall on is printed, so a mark's place is known to be the file's.
//
// This is how the marks of scripts/score-dynamics/marks/*.ts were first taken from Mutopia's sources (the
// typesetters' transcriptions of the printed editions); they were then read through and corrected by hand.
//   npx tsx scripts/score-dynamics/ly-marks.ts --dir <sources> --mid <file.mid> --line 0='\violinoone' --line 1='\violinotwo' [--pickup <ticks>]
// --line n=expr: the page's line n of the file (midi-file.ts) and the LilyPond expression that is its staff
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { barOf, isOn, linesOf, readSmf } from './smf.ts';

const NOTE = /^(?:[a-g](?:isis|eses|is|es)?|as|es|ases|[rsRq])$/;
const DYNAMICS = new Set(['ppppp', 'pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sf', 'sff', 'sfz', 'fz', 'rfz', 'rf', 'fp', 'sfp', 'sp', 'spp', 'cresc', 'dim', 'decresc', 'decr', 'cr', 'crescTextCresc', 'dimTextDim']);

export function tokenize(src: string): string[] {
  const out: string[] = [];
  const n = src.length;
  let i = 0;
  const skipString = (j: number) => {
    j++;
    while (j < n && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
    return j + 1;
  };
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) i++;
    else if (c === '%') {
      if (src[i + 1] === '{') {
        const j = src.indexOf('%}', i);
        i = j < 0 ? n : j + 2;
      } else while (i < n && src[i] !== '\n') i++;
    } else if (c === '"') {
      const j = skipString(i);
      out.push(src.slice(i, j));
      i = j;
    } else if (c === '#') {
      let j = i + 1;
      if (src[j] === '#') j++;
      while (src[j] === "'" || src[j] === '`') j++;
      if (src[j] === '(') {
        let depth = 0;
        do {
          if (src[j] === '"') {
            j = skipString(j);
            continue;
          }
          if (src[j] === '(') depth++;
          if (src[j] === ')') depth--;
          j++;
        } while (j < n && depth > 0);
      } else if (src[j] === '"') j = skipString(j);
      else while (j < n && !/[\s{}]/.test(src[j])) j++;
      out.push(src.slice(i, j));
      i = j;
    } else if (c === '\\') {
      if ('<>!\\()[]'.includes(src[i + 1])) {
        out.push(src.slice(i, i + 2));
        i += 2;
      } else {
        let j = i + 1;
        while (j < n && /[A-Za-z]/.test(src[j])) j++;
        out.push(src.slice(i, j));
        i = j;
      }
    } else if ((c === '<' || c === '>') && src[i + 1] === c) {
      out.push(c + c);
      i += 2;
    } else if ('-^_'.includes(c)) {
      const m = src[i + 1];
      const two = m !== undefined && ('>.-^_+!|'.includes(m) || /\d/.test(m));
      out.push(src.slice(i, i + (two ? 2 : 1)));
      i += two ? 2 : 1;
    } else if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z]/.test(src[j])) j++;
      if (NOTE.test(src.slice(i, j))) {
        while (j < n && "',".includes(src[j])) j++;
        while (j < n && '!?'.includes(src[j])) j++;
        // (a duration may stand apart from its note, and its multiplier from it: "fis 8.", "R2 * 22")
        const m = /^\s*\d+\.*(?:\s*\*\s*\d+(?:\/\d+)?)*(?::\d+)?/.exec(src.slice(j, j + 32));
        if (m && (/^\d/.test(m[0]) || /^\s+\d+\.*(?:\s*\*\s*\d+)*(?=[\s|~)\]\\-])/.test(src.slice(j, j + 32)))) {
          out.push(src.slice(i, j) + m[0].replace(/\s+/g, ''));
          i = j + m[0].length;
          continue;
        }
      } else while (j < n && /[A-Za-z.\-]/.test(src[j])) j++;
      out.push(src.slice(i, j));
      i = j;
    } else if (/\d/.test(c)) {
      const m = /^\d+(?:\/\d+)?\.*(?:\*\d+(?:\/\d+)?)*/.exec(src.slice(i, i + 24))!;
      out.push(m[0]);
      i += m[0].length;
    } else {
      out.push(c);
      i++;
    }
  }
  return out;
}

/** a duration's length in whole notes ("4.", "2*3", "1*19", "8*2/3"), or null if the text is none */
function wholes(d: string): number | null {
  const m = /^(\d+)(\.*)((?:\*\d+(?:\/\d+)?)*)/.exec(d);
  if (!m || !m[0]) return null;
  let v = (1 / Number(m[1])) * (2 - 0.5 ** m[2].length);
  for (const f of m[3].split('*').filter(Boolean)) {
    const [a, b] = f.split('/').map(Number);
    v *= a / (b || 1);
  }
  return v;
}

/** the top-level definitions of a source: name = expression (its tokens) */
export function definitions(tokens: string[], into = new Map<string, string[]>()): Map<string, string[]> {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '{' || t === '<<') depth++;
    else if (t === '}' || t === '>>') depth--;
    else if (depth === 0 && tokens[i + 1] === '=' && /^[A-Za-z]+$/.test(t)) {
      // the expression: up to the end of its first group, or one token where it has none
      let j = i + 2;
      let d = 0;
      let grouped = false;
      for (; j < tokens.length; j++) {
        if (tokens[j] === '{' || tokens[j] === '<<') {
          d++;
          grouped = true;
        } else if (tokens[j] === '}' || tokens[j] === '>>') d--;
        else if (!grouped && !tokens[j].startsWith('\\') && !NOTE.test(tokens[j].replace(/[',\d.]+$/, ''))) break;
        if (grouped && d === 0) break;
      }
      into.set(t, tokens.slice(i + 2, j + 1));
      i = j;
    }
  }
  return into;
}

export interface Mark {
  /** whole notes from the part's start */
  at: number;
  kind: string;
}

/** A part read through: its marks, its notes' onsets (those a MIDI file would sound: no tied
 *  continuations, no grace notes), its pickup and its length, all in whole notes. */
export function readPart(expr: string[], defs: Map<string, string[]>): { marks: Mark[]; onsets: number[]; checks: number[]; length: number; partial: number | null } {
  const marks: Mark[] = [];
  const onsets: number[] = [];
  /** where the source checks its bars (|): a place to see that time was kept */
  const checks: number[] = [];
  let partial: number | null = null;
  const st = { t: 0, lastDur: 0.25, lastOnset: 0, tie: false };
  const expanding = new Set<string>();

  /** `parallel`: each item from the same instant (the voices of << >>); the longest sets the time */
  const run = (tk: string[], scale: number, grace: boolean, parallel = false): void => {
    let i = 0;
    const t0 = st.t;
    let end = t0;
    const balanced = (open: string, close: string): string[] => {
      // tk[i] is `open`: its contents, i left after its `close`
      let d = 0;
      const from = i + 1;
      for (; i < tk.length; i++) {
        if (tk[i] === open) d++;
        else if (tk[i] === close && --d === 0) break;
      }
      return tk.slice(from, i++);
    };
    const note = (tok: string, rest: boolean) => {
      const m = /(\d+\.*(?:\*\d+(?:\/\d+)?)*)(?::\d+)?$/.exec(tok);
      const w = m ? wholes(m[1]) : null;
      if (w !== null) st.lastDur = w;
      st.lastOnset = st.t;
      if (grace) return;
      if (!rest && !st.tie) onsets.push(st.t);
      st.tie = false;
      st.t += st.lastDur * scale;
    };
    const markup = (): string => {
      // the words of a \markup: through its commands to its first string, word or group
      for (;;) {
        const t = tk[i];
        if (t === undefined) return '';
        if (t === '{') return balanced('{', '}').filter((x) => !x.startsWith('\\') && !x.startsWith('#')).join(' ').replace(/"/g, '');
        i++;
        if (!t.startsWith('\\') && !t.startsWith('#')) return t.replace(/"/g, '');
      }
    };
    const item = (): void => {
      const t = tk[i++];
      if (t === '{') {
        i--;
        run(balanced('{', '}'), scale, grace);
      } else if (t === '<<') {
        i--;
        const inner = balanced('<<', '>>');
        run(inner, scale, grace, true);
      } else if (t === '<') {
        i--;
        balanced('<', '>');
        const d = tk[i] !== undefined && wholes(tk[i]) !== null && /^\d/.test(tk[i]) ? tk[i++] : '';
        note(d, false);
      } else if (t === '~') st.tie = true;
      else if (t === '|') checks.push(st.t);
      else if (NOTE.test(t.replace(/[',!?]*(?:\d+\.*(?:\*\d+(?:\/\d+)?)*)?(?::\d+)?$/, '')) && !t.startsWith('\\')) note(t, /^[rsR]/.test(t));
      else if (t.startsWith('\\')) command(t.slice(1));
    };
    const command = (c: string): void => {
      if (c === '<' || c === '>' || c === '!') marks.push({ at: st.lastOnset, kind: c });
      else if (DYNAMICS.has(c)) marks.push({ at: st.lastOnset, kind: c });
      else if (c === 'markup') {
        const text = markup();
        if (text) marks.push({ at: st.lastOnset, kind: `"${text}"` });
      } else if (c === 'clef' || c === 'bar' || c === 'ottava' || c === 'transposition' || c === 'language' || c === 'version' || c === 'include' || c === 'hide' || c === 'omit' || c === 'unset' || c === 'time' || c === 'numericTimeSignature') {
        if (c !== 'numericTimeSignature') i++;
      } else if (c === 'key') i += 2;
      else if (c === 'partial') {
        const w = wholes(tk[i++]);
        if (partial === null) partial = w;
      } else if (c === 'tempo') {
        if (tk[i]?.startsWith('"')) i++;
        if (tk[i + 1] === '=') i += 3;
      } else if (c === 'mark') {
        if (tk[i] === '\\markup') {
          i++;
          markup();
        } else i++;
      } else if (c === 'relative' || c === 'transpose') {
        while (tk[i] !== undefined && tk[i] !== '{' && tk[i] !== '<<' && !tk[i].startsWith('\\')) i++;
      } else if (c === 'new' || c === 'context') {
        i++;
        if (tk[i] === '=') i += 2;
        if (tk[i] === '\\with') {
          i++;
          balanced('{', '}');
        }
      } else if (c === 'set' || c === 'override') {
        while (tk[i] !== undefined && tk[i] !== '=') i++;
        i++;
        if (tk[i] === '\\markup') {
          i++;
          markup();
        } else i++;
      } else if (c === 'revert') {
        i++;
        if (tk[i]?.startsWith('#')) i++;
      } else if (c === 'tweak') i += 2;
      else if (c === 'change') i += 3;
      else if (c === 'times' || c === 'tuplet') {
        const [a, b] = tk[i++].split('/').map(Number);
        if (c === 'tuplet' && tk[i] !== '{' && wholes(tk[i]) !== null) i++;
        const s = c === 'times' ? a / b : b / a;
        const save = scale;
        scale *= s;
        item();
        scale = save;
      } else if (c === 'repeat') {
        const kind = tk[i++];
        const count = Number(tk[i++]);
        const from = i;
        const times = kind === 'volta' || kind === 'segno' ? 1 : count;
        // where the body ends, and its alternatives if it has them (unfolded: body, first ending, body, second …)
        const t0 = st.t;
        const [m0, o0, c0, tie0, dur0, on0] = [marks.length, onsets.length, checks.length, st.tie, st.lastDur, st.lastOnset];
        item();
        const after = i;
        let alts: string[][] = [];
        if (tk[after] === '\\alternative' && times > 1) {
          i = after + 1;
          const inner = balanced('{', '}');
          const afterAlts = i;
          let d = 0;
          let start = 0;
          inner.forEach((x, n) => {
            if (x === '{' && d++ === 0) start = n;
            else if (x === '}' && --d === 0) alts.push(inner.slice(start + 1, n));
          });
          // (the body was read once to find its end: again from the start, with the endings)
          marks.length = m0;
          onsets.length = o0;
          checks.length = c0;
          Object.assign(st, { t: t0, tie: tie0, lastDur: dur0, lastOnset: on0 });
          for (let k = 0; k < times; k++) {
            i = from;
            item();
            run(alts[Math.max(0, k - (times - alts.length))] ?? [], scale, grace);
          }
          i = afterAlts;
        } else {
          for (let k = 1; k < times; k++) {
            i = from;
            item();
          }
          i = after;
        }
      } else if (c === 'grace' || c === 'acciaccatura' || c === 'appoggiatura' || c === 'slashedGrace') {
        const save = grace;
        const t0 = st.t;
        grace = true;
        item();
        grace = save;
        st.t = t0;
      } else if (defs.has(c) && !expanding.has(c)) {
        expanding.add(c);
        run(defs.get(c)!, scale, grace);
        expanding.delete(c);
      }
      // (anything else is a command with no argument that keeps time: an articulation, a stem's direction)
    };
    while (i < tk.length) {
      if (parallel) st.t = t0;
      item();
      end = Math.max(end, st.t);
    }
    if (parallel) st.t = end;
  };
  run(expr, 1, false);
  return { marks, onsets, checks, length: st.t, partial };
}

// ------------------------------------------------------------------ the command line

if (process.argv[1]?.endsWith('ly-marks.ts')) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const dir = opt('--dir')!;
  const defs = new Map<string, string[]>();
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : /\.i?ly$/.test(f) ? [join(d, f)] : []));
  const only = opt('--files')?.split(',');
  for (const f of walk(dir)) if (!only || only.some((o) => f.endsWith(o))) definitions(tokenize(readFileSync(f, 'utf8')), defs);
  const smf = readSmf(readFileSync(opt('--mid')!));
  const lines = linesOf(smf);
  const whole = 4 * smf.ppq;
  const bar = barOf(smf).ticks;
  for (let k = 0; k < args.length; k++) {
    if (args[k] !== '--line') continue;
    const [n, expr] = [Number(args[k + 1].split('=')[0]), args[k + 1].slice(args[k + 1].indexOf('=') + 1)];
    const part = readPart(tokenize(expr), defs);
    const pickup = Math.round(Number(opt('--pickup') ?? (part.partial ?? 0) * whole));
    // the file's own onsets on this line
    const { track, channel } = lines[n];
    const ons = new Set(smf.tracks[track].filter((e) => isOn(e) && (e.bytes[0] & 15) === channel).map((e) => e.tick));
    const mine = new Set(part.onsets.map((w) => Math.round(w * whole)));
    let hit = 0;
    for (const t of ons) if (mine.has(t)) hit++;
    const missed = [...ons].filter((t) => !mine.has(t)).slice(0, 6);
    const place = (tick: number) => {
      const b = tick < pickup ? 0 : Math.floor((tick - pickup) / bar) + 1;
      const beat = 1 + (tick - (b ? pickup + (b - 1) * bar : 0)) / smf.ppq;
      return beat === 1 ? `${b}` : `${b}:${+beat.toFixed(3)}`;
    };
    const off = part.checks.map((w) => Math.round(w * whole)).find((t) => t >= pickup && (t - pickup) % bar !== 0);
    console.log(`\n// line ${n} (${expr}): ${hit} of the file's ${ons.size} onsets are the part's (${part.onsets.length} read); length ${Math.round(part.length * whole)} ticks, pickup ${pickup}${missed.length ? `; first not found: ${missed.map(place).join(' ')}` : ''}${off !== undefined ? `; first bar check off its bar line: ${place(off)}` : ''}`);
    // marks in time order, one instant's marks together
    const at = new Map<number, string[]>();
    for (const m of part.marks) {
      const t = Math.round(m.at * whole);
      if (!at.has(t)) at.set(t, []);
      if (!at.get(t)!.includes(m.kind)) at.get(t)!.push(m.kind);
    }
    const text = [...at].sort((a, b) => a[0] - b[0]).map(([t, ks]) => `${place(t)} ${ks.join(' ')}`);
    console.log(`  ${n}: \`${text.join('  ')}\`,`);
  }
}
