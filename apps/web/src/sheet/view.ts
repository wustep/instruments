// The sheet music, in place of the instrument while a file plays (the player's page icon: ui/player.ts):
// the score of the file loaded (sheet/score.ts) on a sheet of paper, drawn with VexFlow (MIT), system by
// system as they come into view. The notes sounding are lit and a hairline stands at the place being heard;
// the page turns itself to keep it in view (not while the hand has just moved it). A tap on a bar plays on
// from there. An ensemble's file is read a part at a time (the part the keys play first; its name at the
// sheet's top left opens the others), or, for a few players on a wide stage, as a score of them all; a
// keyboard's or a harp's lines are its two staves, braced. This module and VexFlow load on first use.

import { Accidental, BarlineType, Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Tuplet, Voice, VoiceMode } from 'vexflow/bravura';
import type { MidiSong } from '../midi-file.ts';
import type { Plan, Voice as Instrument } from '../orchestra/assign.ts';
import { onTheme } from '../themes/index.ts';
import { voiceGlyph } from '../ui/controls.ts';
import { h } from '../ui/dom.ts';
import { barAt, beatsOf, buildScore, soundingAt, type Bar, type Entry, type Score, type StaffPlan } from './score.ts';
import { firstPart, partsOf, SCORE_MOST, type SheetPart } from './parts.ts';

export interface SheetHost {
  /** the song loaded, if it has a score */
  song(): MidiSong | null;
  /** the ensemble's routing while it plays this song (null: the one instrument shown plays it) */
  plan(): Plan | null;
  solo(): Instrument | null;
  /** the seats the keys play (the part the sheet opens on) */
  keySeats(): number[];
  /** "composer · title", or nothing */
  title(): string;
  /** where the song is as written (s), and whether it plays */
  position(): number;
  playing(): boolean;
  /** to written time `t` (s) */
  seek(t: number): void;
}

export interface Sheet {
  /** the song, its routing or the window changed: set out again if what it shows changed */
  refresh(): void;
  /** each frame while it shows: the place and the notes sounding */
  frame(): void;
  dispose(): void;
}

/** the staff space VexFlow draws at (px at scale 1) */
const SP = 10;
const KEY_NAMES = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const keyName = (f: number) => KEY_NAMES[Math.max(-7, Math.min(7, f)) + 7];
/** where a clef's rests sit (its middle line; a whole rest hangs from the line above) */
const REST: Record<StaffPlan['clef'], [string, string]> = { treble: ['b/4', 'd/5'], bass: ['d/3', 'f/3'], alto: ['c/4', 'e/4'] };
/** the diatonic step of each clef's bottom line (E4, G2, F3), to find a note's line */
const BOTTOM: Record<StaffPlan['clef'], number> = { treble: 4 * 7 + 2, bass: 2 * 7 + 4, alto: 3 * 7 + 3 };
const STEP: Record<string, number> = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
const lineOf = (letter: string, octave: number, clef: StaffPlan['clef']) => (octave * 7 + STEP[letter] - BOTTOM[clef]) / 2;

/** fonts loaded once (Bravura for the notes, Academico for VexFlow's few words) */
let fonts: Promise<unknown> | null = null;
const fontsReady = () => (fonts ??= Promise.all([document.fonts?.load('30px Bravura'), document.fonts?.load('12px Academico')]).catch(() => undefined));

interface SystemLayout {
  bars: number[];
  widths: number[];
  /** each staff's top line, from the system's top (px at scale 1), and the system's height */
  ys: number[];
  height: number;
  /** its box in the sheet's body (px on the screen) */
  top: number;
  el: HTMLElement;
  drawn: boolean;
  /** each bar's places: from its first note to its end, a place for each entry's beginning */
  geo: Map<number, { x0: number; x1: number; at: [number, number][] }>;
}

export function createSheet(el: HTMLElement, host: SheetHost): Sheet {
  const page = h('div', { class: 'sheet-page' });
  const partBtn = h('button', { class: 'sheet-part', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  const partName = h('span', { class: 'sheet-part-name' });
  const title = h('span', { class: 'sheet-title' });
  const head = h('div', { class: 'sheet-head' }, partBtn, partName, title);
  const body = h('div', { class: 'sheet-body' });
  const at = h('i', { class: 'sheet-at', 'aria-hidden': 'true' });
  const paper = h('div', { class: 'sheet-paper', role: 'img' }, head, body);
  body.append(at);
  page.append(paper);
  el.append(page);
  let menu: HTMLElement | null = null;

  let song: MidiSong | null = null;
  let parts: SheetPart[] = [];
  /** the part shown, by its key ('score': all of them) */
  let shown = '';
  let score: Score | null = null;
  /** what the layout was made for */
  let sig = '';
  let width = 0;
  let scale = 1;
  let systems: SystemLayout[] = [];
  let sysOfBar: number[] = [];
  let staves: StaffPlan[] = [];
  let brace: { from: number; to: number }[] = [];
  const elOf = new Map<Entry, Element>();
  let lit = new Set<Entry>();
  let lastSys = -1;
  /** the hand moved the page: it does not turn itself for a while */
  let handAt = -Infinity;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready = false;
  void fontsReady().then(() => {
    ready = true;
    sig = '';
    refresh();
  });

  // ----------------------------------------------------------------- what it shows
  const scoreOffered = () => !!host.plan() && parts.length >= 2 && parts.length <= SCORE_MOST && el.clientWidth >= 640;
  const choose = () => {
    const keys = parts.map((p) => p.key);
    if (shown === 'score' ? !scoreOffered() : !keys.includes(shown)) shown = scoreOffered() ? 'score' : (parts[firstPart(parts, host.plan(), host.keySeats())]?.key ?? '');
  };
  const syncHead = () => {
    const many = parts.length > 1;
    const p = parts.find((q) => q.key === shown);
    const name = shown === 'score' ? 'score' : (p?.name ?? '');
    partBtn.hidden = !many;
    partName.hidden = many || !name;
    partName.textContent = name;
    partBtn.replaceChildren(h('span', {}, name), h('i', { class: 'sheet-caret', 'aria-hidden': 'true' }));
    partBtn.setAttribute('aria-label', `Part: ${name}. Show another`);
    partBtn.dataset.tip = 'another part';
    const t = host.title();
    title.textContent = t;
    title.hidden = !t;
    paper.setAttribute('aria-label', `Sheet music${t ? `: ${t}` : ''}${name ? `, ${name}` : ''}`);
  };

  function refresh(): void {
    const s = host.song();
    if (s !== song) {
      song = s;
      shown = '';
      closeMenu();
    }
    parts = s ? partsOf(s, host.plan(), host.solo()) : [];
    choose();
    syncHead();
    if (!ready || !s) {
      if (!s) clear();
      return;
    }
    const chosen = shown === 'score' ? parts : parts.filter((p) => p.key === shown);
    const w = Math.round(body.clientWidth);
    const next = JSON.stringify(chosen.map((p) => p.staves)) + `|${w}`;
    if (next === sig) return;
    sig = next;
    staves = chosen.flatMap((p) => p.staves);
    brace = [];
    let k = 0;
    for (const p of chosen) {
      if (p.brace) brace.push({ from: k, to: k + p.staves.length - 1 });
      k += p.staves.length;
    }
    score = buildScore(s, staves);
    width = w;
    layout();
  }

  const clear = () => {
    for (const sy of systems) sy.el.remove();
    systems = [];
    sysOfBar = [];
    elOf.clear();
    lit = new Set();
    lastSys = -1;
    at.hidden = true;
  };

  // ----------------------------------------------------------------- layout
  /** a bar's notes for VexFlow: each staff's voice, its tuplets and beams (made before it is formatted) */
  const notesOf = (bar: Bar) =>
    bar.staves.map((entries, si) => {
      const pl = staves[si];
      const notes = entries.map((e) => {
        // (a dot in the duration counts its time; the one attached is what is drawn)
        const dur = `${e.dur}${e.bar ? '' : 'd'.repeat(e.dots)}`;
        const n = e.rest
          ? new StaveNote({ keys: [REST[pl.clef][e.bar || e.dur === 'w' ? 1 : 0]], duration: `${dur}r`, clef: pl.clef, alignCenter: e.bar })
          : new StaveNote({ keys: e.pitches.map((p) => `${p.letter}/${p.octave}`), duration: dur, clef: pl.clef, autoStem: true });
        if (!e.bar && e.dots) Dot.buildAndAttach([n], { all: true });
        e.pitches.forEach((p, i) => p.acc && n.addModifier(new Accidental(p.acc), i));
        return n;
      });
      const tuplets: Tuplet[] = [];
      for (let i = 0; i < entries.length; ) {
        const t = entries[i].tuplet;
        if (t < 0) {
          i++;
          continue;
        }
        let j = i;
        while (j < entries.length && entries[j].tuplet === t) j++;
        const of = entries[i].tupletOf;
        const group = entries.slice(i, j);
        const beamed = group.every((e) => !e.rest && (e.dur === '8' || e.dur === '16' || e.dur === '32'));
        tuplets.push(new Tuplet(notes.slice(i, j), { numNotes: of, notesOccupied: of === 6 ? 4 : 2, ratioed: false, bracketed: !beamed }));
        i = j;
      }
      const voice = new Voice({ numBeats: Math.max(1, Math.round(bar.len / 6)), beatValue: 32 });
      voice.setMode(VoiceMode.SOFT);
      voice.addTickables(notes);
      const beats = beatsOf(bar.num, bar.den, bar.len);
      const groups = beats.slice(1).map((b, i) => new Fraction(b - beats[i], 192));
      const beams = entries.length > 1 && !entries[0].bar ? Beam.generateBeams(notes, { groups, beamRests: false, maintainStemDirections: false }) : [];
      return { notes, voice, tuplets, beams };
    });

  /** a staff's reach in a stretch of bars, in staff spaces over its top line and under its bottom one */
  const reach = (si: number, bars: number[]) => {
    let up = 0;
    let down = 0;
    const pl = staves[si];
    for (const bi of bars)
      for (const e of score!.bars[bi].staves[si]) {
        for (const p of e.pitches) {
          const l = lineOf(p.letter, p.octave, pl.clef);
          // (a note under the middle line has its stem up, three and a half spaces)
          up = Math.max(up, l >= 2 ? l + 0.5 - 4 : l + 3.5 - 4);
          down = Math.max(down, l >= 2 ? 3.5 - l : 0.5 - l);
        }
        if (e.tuplet >= 0) up = Math.max(up, 1.5);
      }
    return { up: Math.max(0, up), down: Math.max(0, down) };
  };

  /** the space a bar's first staves take for their clef, key and time */
  const modsWidth = (bar: Bar, first: boolean, meter: boolean) => {
    let w = 0;
    staves.forEach((pl, si) => {
      const st = new Stave(0, 0, 400, { spaceAboveStaffLn: 0, spaceBelowStaffLn: 0 });
      if (first) st.addClef(pl.clef, 'default', pl.ottava).addKeySignature(keyName(bar.keys[si]));
      else if (bar.keyChange[si]) st.addKeySignature(keyName(bar.keys[si]));
      if (meter) st.addTimeSignature(`${bar.num}/${bar.den}`);
      w = Math.max(w, st.getNoteStartX());
    });
    return w;
  };

  function layout(): void {
    clear();
    if (!score || !score.bars.length) return;
    const bars = score.bars;
    // the scale: smaller on a phone (a staff 28 px high there, 36 on a computer)
    scale = width < 520 ? 0.7 : width < 900 ? 0.8 : 0.9;
    const lw = width / scale;
    const left = brace.length ? 26 : 4;
    const line = lw - left - 4;
    // each bar's least width, and what its own changes of key or time add to it
    const least = bars.map((bar) => {
      const vs = notesOf(bar).map((x) => x.voice);
      const f = new Formatter();
      vs.forEach((v) => f.joinVoices([v]));
      const min = f.preCalculateMinTotalWidth(vs);
      const notes = Math.max(...bar.staves.map((s) => s.length));
      return Math.max(notes <= 1 ? 70 : 46, min * 1.3 + 22 + 3 * notes);
    });
    const extra = bars.map((bar, i) => (i > 0 && (bar.meterChange || bar.keyChange.some(Boolean)) ? modsWidth(bar, false, bar.meterChange) - 12 : 0));
    // systems: as many bars as fit the line after the first bar's clef and key
    const lay: { bars: number[]; widths: number[] }[] = [];
    for (let i = 0; i < bars.length; ) {
      const first = modsWidth(bars[i], true, i === 0 || bars[i].meterChange);
      let used = first;
      const row: number[] = [];
      while (i < bars.length && (row.length === 0 || used + least[i] + extra[i] <= line)) {
        used += least[i] + (row.length ? extra[i] : 0);
        row.push(i++);
      }
      // (stretched to the line; the last system only if it nearly fills it)
      const natural = row.reduce((a, b, k) => a + least[b] + (k ? extra[b] : 0), 0);
      const room = line - first;
      const fill = i < bars.length || natural > 0.66 * room ? room / natural : 1;
      lay.push({ bars: row, widths: row.map((b, k) => (least[b] + (k ? extra[b] : 0)) * fill + (k === 0 ? first : 0)) });
    }
    let top = 0;
    systems = lay.map((ly, n) => {
      const rs = staves.map((_, si) => reach(si, ly.bars));
      const ys: number[] = [];
      let y = Math.max(3.2, rs[0].up + 1.2) * SP;
      rs.forEach((r, si) => {
        if (si > 0) y += Math.max(6.5, rs[si - 1].down + r.up + 1.5) * SP;
        ys.push(y);
        y += 4 * SP;
      });
      const height = y + Math.max(2.6, rs[rs.length - 1].down + 1) * SP;
      const el = h('div', { class: 'sheet-sys', 'data-sys': String(n) });
      el.style.height = `${Math.ceil(height * scale)}px`;
      const sy: SystemLayout = { bars: ly.bars, widths: ly.widths, ys, height, top, el, drawn: false, geo: new Map() };
      top += Math.ceil(height * scale);
      ly.bars.forEach((b) => (sysOfBar[b] = n));
      // (its first bar's number, as a part prints it, from the second system on)
      if (n > 0) el.append(h('span', { class: 'sheet-n', 'aria-hidden': 'true', style: `top:${Math.max(0, (ys[0] - 2.6 * SP) * scale)}px;left:${left * scale}px` }, String(bars[ly.bars[0]].n)));
      body.insertBefore(el, at);
      return sy;
    });
    seen.disconnect();
    for (const sy of systems) seen.observe(sy.el);
  }

  // ----------------------------------------------------------------- drawing
  const seen = new IntersectionObserver(
    (es) => {
      for (const e of es) if (e.isIntersecting) draw(systems[Number((e.target as HTMLElement).dataset.sys)]);
    },
    { root: page, rootMargin: '600px 0px' },
  );

  function draw(sy: SystemLayout | undefined): void {
    if (!sy || sy.drawn || !score) return;
    sy.drawn = true;
    const r = new Renderer(sy.el as HTMLDivElement, Renderer.Backends.SVG);
    r.resize(width, Math.ceil(sy.height * scale));
    const ctx = r.getContext();
    ctx.scale(scale, scale);
    const bars = score.bars;
    const left = brace.length ? 26 : 4;
    let x = left;
    /** per staff: a note whose tie goes on, waiting for the note it is tied to */
    const open: (StaveNote | null)[] = staves.map(() => null);
    const ties: StaveTie[] = [];
    const drawnNotes: [Entry, StaveNote][] = [];
    sy.bars.forEach((bi, k) => {
      const bar = bars[bi];
      const w = sy.widths[k];
      const sts = staves.map((pl, si) => {
        const st = new Stave(x, sy.ys[si], w, { spaceAboveStaffLn: 0, spaceBelowStaffLn: 0 });
        if (k === 0) st.addClef(pl.clef, 'default', pl.ottava).addKeySignature(keyName(bar.keys[si]));
        else if (bar.keyChange[si]) st.addKeySignature(keyName(bar.keys[si]), keyName(bars[bi - 1].keys[si]));
        if ((k === 0 && bi === 0) || bar.meterChange) st.addTimeSignature(`${bar.num}/${bar.den}`);
        if (bi === bars.length - 1) st.setEndBarType(BarlineType.END);
        return st;
      });
      const start = Math.max(...sts.map((s) => s.getNoteStartX()));
      sts.forEach((s) => s.setNoteStartX(start));
      sts.forEach((s) => s.setContext(ctx).draw());
      if (sts.length > 1) {
        if (k === 0) {
          new StaveConnector(sts[0], sts[sts.length - 1]).setType('singleLeft').setContext(ctx).draw();
          for (const b of brace) new StaveConnector(sts[b.from], sts[b.to]).setType('brace').setContext(ctx).draw();
          if (brace.length !== 1 || brace[0].to - brace[0].from + 1 !== sts.length) new StaveConnector(sts[0], sts[sts.length - 1]).setType('bracket').setContext(ctx).draw();
        }
        new StaveConnector(sts[0], sts[sts.length - 1]).setType(bi === bars.length - 1 ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();
      }
      const made = notesOf(bar);
      const f = new Formatter();
      made.forEach((m) => f.joinVoices([m.voice]));
      f.format(
        made.map((m) => m.voice),
        Math.max(10, sts[0].getNoteEndX() - start - 12),
      );
      made.forEach((m, si) => {
        m.voice.draw(ctx, sts[si]);
        m.beams.forEach((b) => b.setContext(ctx).draw());
        m.tuplets.forEach((t) => t.setContext(ctx).draw());
      });
      // the places: each entry's beginning where its note stands
      const pts = new Map<number, number>();
      bar.staves.forEach((entries, si) =>
        entries.forEach((e, j) => {
          const n = made[si].notes[j];
          drawnNotes.push([e, n]);
          if (!e.bar && !pts.has(e.start)) pts.set(e.start, n.getAbsoluteX() + 3);
          // ties: from a note waiting on this staff; one going on past the system ends at its edge
          if (e.tied && !e.rest) {
            const idx = e.pitches.map((_, i) => i);
            ties.push(new StaveTie({ firstNote: open[si], lastNote: n, firstIndexes: idx, lastIndexes: idx }));
            open[si] = null;
          }
          if (e.tie) open[si] = n;
        }),
      );
      const x0 = start;
      const x1 = sts[0].getNoteEndX();
      if (!pts.has(bar.start)) pts.set(bar.start, x0);
      sy.geo.set(bi, { x0, x1, at: [...pts].sort((a, b) => a[0] - b[0]) });
      x += w;
    });
    open.forEach((n) => n && ties.push(new StaveTie({ firstNote: n, lastNote: null, firstIndexes: n.getKeys().map((_, i) => i), lastIndexes: n.getKeys().map((_, i) => i) })));
    ties.forEach((t) => t.setContext(ctx).draw());
    for (const [e, n] of drawnNotes) {
      const g = n.getSVGElement();
      if (g) elOf.set(e, g);
    }
  }

  // ----------------------------------------------------------------- the place
  /** x of units `u` in bar `bi` (px at scale 1): between its entries' places */
  const xAt = (sy: SystemLayout, bi: number, u: number): number => {
    const g = sy.geo.get(bi);
    const bar = score!.bars[bi];
    if (!g) return 0;
    const pts = [...g.at, [bar.start + bar.len, g.x1] as [number, number]];
    for (let i = 0; i < pts.length - 1; i++) if (u < pts[i + 1][0]) return pts[i][1] + ((pts[i + 1][1] - pts[i][1]) * (u - pts[i][0])) / Math.max(1e-9, pts[i + 1][0] - pts[i][0]);
    return g.x1;
  };
  /** … and back: the units at x in a system (px at scale 1) */
  const uAt = (sy: SystemLayout, x: number): number => {
    const bars = score!.bars;
    for (const bi of sy.bars) {
      const g = sy.geo.get(bi);
      const bar = bars[bi];
      if (!g || x > g.x1 + 6) continue;
      const pts = [...g.at, [bar.start + bar.len, g.x1] as [number, number]];
      if (x <= pts[0][1]) return pts[0][0];
      for (let i = 0; i < pts.length - 1; i++) if (x < pts[i + 1][1]) return pts[i][0] + ((pts[i + 1][0] - pts[i][0]) * (x - pts[i][1])) / Math.max(1e-9, pts[i + 1][1] - pts[i][1]);
      return bar.start + bar.len - 1;
    }
    const last = bars[sy.bars[sy.bars.length - 1]];
    return last.start + last.len - 1;
  };

  function frame(): void {
    if (!score || !systems.length) return;
    const u = score.unitsAt(host.position());
    const bars = score.bars;
    const bi = Math.max(0, Math.min(bars.length - 1, barAt(bars, u)));
    const n = sysOfBar[bi];
    const sy = systems[n];
    if (!sy) return;
    draw(sy);
    const x = xAt(sy, bi, Math.max(bars[bi].start, u));
    at.hidden = false;
    at.style.transform = `translate(${(x * scale).toFixed(1)}px, ${sy.top + sy.ys[0] * scale - 6}px)`;
    at.style.height = `${(sy.ys[sy.ys.length - 1] - sy.ys[0] + 4 * SP) * scale + 12}px`;
    // the notes sounding
    const now = new Set(host.playing() ? soundingAt(bars[bi], u) : []);
    for (const e of lit) if (!now.has(e)) elOf.get(e)?.classList.remove('on');
    for (const e of now) elOf.get(e)?.classList.add('on');
    lit = now;
    // the page turns to keep the place in view (a system down from the top), not while the hand moves it
    if (n !== lastSys) {
      lastSys = n;
      const view = page.clientHeight;
      const y = paper.offsetTop + body.offsetTop + sy.top;
      const off = y < page.scrollTop || y + sy.height * scale > page.scrollTop + view;
      // (playing: unless the hand moved it in the last 2.5 s, reading ahead; paused: only if the place is out of view)
      if (host.playing() ? performance.now() - handAt > 2500 : off) page.scrollTo({ top: Math.max(0, y - Math.min(view * 0.22, 80)), behavior: reduced || !host.playing() ? 'auto' : 'smooth' });
    }
  }

  // ----------------------------------------------------------------- the hand
  for (const t of ['wheel', 'touchmove'] as const) page.addEventListener(t, () => (handAt = performance.now()), { passive: true });
  page.addEventListener('keydown', () => (handAt = performance.now()));
  let down: { x: number; y: number } | null = null;
  page.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });
  page.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || !score) return;
    const sysEl = (e.target as Element).closest?.('.sheet-sys') as HTMLElement | null;
    const sy = sysEl ? systems[Number(sysEl.dataset.sys)] : null;
    if (!sy) return;
    const r = sysEl!.getBoundingClientRect();
    host.seek(Math.max(0, score.timeAt(uAt(sy, (e.clientX - r.left) / scale))));
    lastSys = -1;
    handAt = performance.now();
  });

  // ----------------------------------------------------------------- the parts
  const closeMenu = (refocus = false) => {
    if (!menu) return;
    menu.remove();
    menu = null;
    partBtn.setAttribute('aria-expanded', 'false');
    if (refocus) partBtn.focus();
  };
  partBtn.addEventListener('click', () => {
    if (menu) return closeMenu();
    const items = parts.map((p) => {
      const b = h('button', { class: 'sheet-pick', type: 'button', role: 'menuitemradio', 'aria-checked': String(p.key === shown), 'data-part': p.key }, h('span', {}, p.name));
      if (p.voice) b.prepend(voiceGlyph(p.voice) as unknown as HTMLElement);
      b.addEventListener('click', () => pick(p.key));
      return b;
    });
    if (scoreOffered()) {
      const b = h('button', { class: 'sheet-pick sheet-pick-score', type: 'button', role: 'menuitemradio', 'aria-checked': String(shown === 'score'), 'data-part': 'score' }, h('span', {}, 'score'));
      b.addEventListener('click', () => pick('score'));
      items.unshift(b);
    }
    menu = h('div', { class: 'sheet-menu', role: 'menu', 'aria-label': 'Parts' }, ...items);
    el.append(menu);
    const r = partBtn.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    menu.style.left = `${Math.max(6, r.left - er.left)}px`;
    menu.style.top = `${r.bottom - er.top + 4}px`;
    menu.style.maxHeight = `${Math.max(120, er.bottom - r.bottom - 12)}px`;
    partBtn.setAttribute('aria-expanded', 'true');
    ((menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button')) as HTMLElement | null)?.focus();
  });
  const pick = (key: string) => {
    closeMenu(true);
    if (key === shown) return;
    shown = key;
    sig = '';
    refresh();
    page.scrollTop = 0;
    lastSys = -1;
  };
  const onDoc = (e: PointerEvent) => {
    if (menu && !menu.contains(e.target as Node) && !partBtn.contains(e.target as Node)) closeMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && menu) {
      closeMenu(true);
      e.stopPropagation();
    }
  };
  document.addEventListener('pointerdown', onDoc);
  document.addEventListener('keydown', onKey, true);
  // another theme: the list of parts was set under its button where that stood, and the paper may be a
  // few px wider or narrower (too few for the window's observer below): shut, and set out again if so
  let gone = false;
  const offTheme = onTheme(() => {
    closeMenu();
    requestAnimationFrame(() => !gone && refresh());
  });

  // the window: set out again for another width
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(body.clientWidth);
    if (Math.abs(w - lastW) < 8) return;
    lastW = w;
    requestAnimationFrame(() => refresh());
  });
  ro.observe(body);

  refresh();
  return {
    refresh,
    frame,
    dispose() {
      ro.disconnect();
      seen.disconnect();
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey, true);
      gone = true;
      offTheme();
      closeMenu();
      page.remove();
    },
  };
}
