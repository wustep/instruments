// Seeds (orchestra/seeds.ts): a piece with no end, grown from a word. What it promises, checked on the
// score itself (no sound: scripts/seeds-check.ts reads the notes as they sound, scripts/seeds-soak.mjs
// leaves it playing in a browser): the same seed is the same music, any stretch of it can be asked for in
// any pieces, the loops share no measure, a phrase is under a third of its loop, it is quiet, no note
// hangs, and the list the player holds stays short however long it plays.
import { describe, expect, it } from 'vitest';
import { STREAM, streamMore, streamOpen, notesAhead, type FileEvent } from '../src/midi-file.ts';
import { lineupOf, VOICE_INFO } from '../src/orchestra/assign.ts';
import { pieceForLineup, PIECES, piecePlan } from '../src/orchestra/pieces.ts';
import { cleanSeed, entriesBetween, entryOf, FIELDS, newSeed, ROLES, seedsEvents, seedsExcerpt, SEEDS_VOICES, seedsSong, seedsSystem, WAYS } from '../src/orchestra/seeds.ts';

const SEEDS = ['kelumo', 'tavide', 'sorami', 'a', 'stephen', '2026-11-15'];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

describe('Seeds: what a seed grows into', () => {
  it('the same seed is the same music, to the last event; another seed is another', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const a = seedsEvents(seedsSystem(seed), 0, 600);
      const b = seedsEvents(seedsSystem(seed), 0, 600);
      expect(a.length).toBeGreaterThan(2000);
      expect(b).toEqual(a);
    }
    const key = (seed: string) => JSON.stringify(seedsEvents(seedsSystem(seed), 0, 120).filter((e) => e.kind === 'on'));
    expect(new Set(SEEDS.map(key)).size).toBe(SEEDS.length);
  });

  it('any stretch, asked for in any pieces: the stretches laid end to end are the whole', () => {
    const sys = seedsSystem('kelumo');
    const whole = seedsEvents(sys, 0, 900);
    for (const cuts of [[0, 30, 60, 90, 900], [0, 0.4, 7.77, 123.456, 451, 899.99, 900], Array.from({ length: 91 }, (_, i) => i * 10)]) {
      const laid: FileEvent[] = [];
      for (let i = 1; i < cuts.length; i++) laid.push(...seedsEvents(sys, cuts[i - 1], cuts[i]));
      expect(laid).toEqual(whole);
    }
    // in order, and a stretch from the middle is the middle (nothing before it has to have been asked for)
    for (let i = 1; i < whole.length; i++) expect(whole[i].t).toBeGreaterThanOrEqual(whole[i - 1].t);
    expect(seedsEvents(seedsSystem('kelumo'), 5000, 5060)).toEqual(seedsEvents(seedsSystem('kelumo'), 4000, 5060).filter((e) => e.t >= 5000));
  });

  it('ten players, each a loop of its own: whole hundredths of a second, no two sharing a factor, so they come round together after longer than the universe is old', () => {
    for (const seed of SEEDS) {
      const sys = seedsSystem(seed);
      expect(sys.players.map((p) => p.role.voice)).toEqual(SEEDS_VOICES);
      const cs = sys.players.map((p) => Math.round(p.loop * 100));
      cs.forEach((c, i) => {
        expect(c / 100).toBe(sys.players[i].loop);
        expect(c).toBeGreaterThanOrEqual(1700);
        expect(c).toBeLessThanOrEqual(6100);
        for (let j = 0; j < i; j++) expect(gcd(c, cs[j]), `${seed}: ${c} and ${cs[j]}`).toBe(1);
      });
      expect(sys.years).toBeGreaterThan(1.4e10);
    }
  });

  it('a blown or bowed phrase is under a third of its loop (a silence at least twice as long as the sound), within a breath, and each entry strays from its loop by under a second', () => {
    for (const seed of SEEDS) {
      const sys = seedsSystem(seed);
      for (const p of sys.players) {
        const starts: number[] = [];
        for (let n = 0; n < 120; n++) {
          const e = entryOf(sys, p, n);
          if (!e) continue;
          starts.push(e.t - (p.first + n * p.loop));
          if (p.role.kind !== 'ring') expect(e.end - e.t, `${seed} ${p.role.name} ${n}`).toBeLessThanOrEqual(p.loop / 3 + 1e-9);
          if (p.role.breath) expect(e.end - e.t).toBeLessThanOrEqual(p.role.breath + 0.031);
          expect(e.notes.length).toBeGreaterThanOrEqual(1);
          expect(e.notes.length).toBeLessThanOrEqual(p.role.notes[1]);
        }
        // a player's entries: never on the loop's instant twice running, never far from it
        expect(Math.max(...starts.map(Math.abs))).toBeLessThan(1.2);
        const moved = starts.slice(1).filter((d, i) => Math.abs(d - starts[i]) > 0.005).length;
        expect(moved / (starts.length - 1)).toBeGreaterThan(0.9);
      }
    }
  });

  it('every note is in its player’s register and in the field (or its colour, a last note’s only), soft, with an end; no pitch is begun while its line holds it', () => {
    for (const seed of SEEDS) {
      const sys = seedsSystem(seed);
      const played = entriesBetween(sys, 0, 1800);
      expect(played.length).toBeGreaterThan(400);
      let colours = 0;
      let notes = 0;
      for (const { p, e } of played) {
        const f = FIELDS[e.field];
        e.notes.forEach((x, j) => {
          notes++;
          const info = VOICE_INFO[p.role.voice];
          expect(x.midi, `${seed} ${p.role.name}`).toBeGreaterThanOrEqual(info.lo);
          expect(x.midi).toBeLessThanOrEqual(info.hi);
          expect(p.role.avoid ?? []).not.toContain(x.midi);
          const inField = f.set.includes(x.midi % 12);
          if (!inField) {
            colours++;
            expect(x.midi % 12).toBe(f.colour);
            expect(j).toBe(e.notes.length - 1);
            expect(p.role.colour).toBeGreaterThan(0);
          }
          expect(x.vel).toBeGreaterThanOrEqual(28);
          expect(x.vel).toBeLessThanOrEqual(90);
          expect(x.end).toBeGreaterThan(x.t);
        });
      }
      // the colour is rare: now and then, never often
      expect(colours / notes).toBeLessThan(0.05);
      // as events: every note begun is ended, and none begun on a pitch its line still holds
      const open = new Map<string, number>();
      for (const ev of seedsEvents(sys, 0, 1800)) {
        if (ev.kind !== 'on' && ev.kind !== 'off') continue;
        const k = `${ev.line}:${ev.midi}`;
        if (ev.kind === 'on') expect(open.get(k) ?? 0, `${seed} ${k} at ${ev.t}`).toBe(0);
        open.set(k, (open.get(k) ?? 0) + (ev.kind === 'on' ? 1 : -1));
      }
      for (const [k, v] of open) expect(v === 0 || v === 1, k).toBe(true);
    }
  });

  it('a swell under every blown or bowed phrase: the expression (CC11, whole steps of 127) from under its top, up, and away; the bow or breath with it, back at rest when the phrase ends; what rings has none', () => {
    const sys = seedsSystem('kelumo');
    const ev = seedsEvents(sys, 0, 900);
    for (const [i, role] of ROLES.entries()) {
      const cc = ev.filter((e) => e.line === i && e.kind === 'cc');
      const dyn = ev.filter((e) => e.line === i && e.kind === 'dyn');
      for (const e of cc) {
        if (e.kind !== 'cc') continue;
        expect(e.cc).toBe(11);
        expect(Math.abs(e.value * 127 - Math.round(e.value * 127))).toBeLessThan(1e-9);
        // (never under −36 dB: a phrase dies away, it is not switched off)
        expect(e.value).toBeGreaterThan(0.125);
        expect(e.value).toBeLessThanOrEqual(1);
      }
      if (!role.swell) {
        expect(dyn.length, role.name).toBe(0);
        continue;
      }
      // per entry: it begins and ends under its top, and the breath is back at rest at its end
      for (const { p, e } of entriesBetween(sys, 0, 850).filter((x) => x.p.line === i)) {
        const mine = cc.filter((c) => c.t >= e.t - 0.06 && c.t <= e.end + 1e-6) as (FileEvent & { kind: 'cc' })[];
        const top = Math.max(...mine.map((c) => c.value));
        expect(mine[0].value, `${p.role.name} at ${e.t}`).toBeLessThan(top);
        expect(mine[mine.length - 1].value).toBeLessThan(top);
        // (further away than it began, where its first and last notes have one place in the balance)
        const ev0 = p.role.even?.[e.notes[0].midi] ?? 0;
        const ev1 = p.role.even?.[e.notes[e.notes.length - 1].midi] ?? 0;
        if (ev0 === ev1) expect(mine[mine.length - 1].value).toBeLessThan(mine[0].value);
        const d = dyn.filter((c) => c.t > e.t && c.t <= e.end + 1e-6) as (FileEvent & { kind: 'dyn' })[];
        expect(Math.max(...d.map((c) => c.value))).toBeGreaterThan(3);
        expect(d[d.length - 1].value).toBe(0);
        // (no step of the expression is a jump: under 1.5 dB at once, glided over by the output's gain)
        for (let k = 1; k < mine.length; k++) expect(Math.abs(40 * Math.log10(mine[k].value / mine[k - 1].value))).toBeLessThan(1.5 + (p.role.even ? 8 : 0));
      }
    }
    // the piano's pedal: down under each phrase, up before the next
    const ped = ev.filter((e) => e.kind === 'pedal');
    expect(ped.length).toBeGreaterThan(20);
    ped.forEach((e, k) => e.kind === 'pedal' && expect(e.value).toBe(k % 2 === 0 ? 1 : 0));
  });

  it('the harmony moves one note at a time or none, a field lasts minutes, and no player is ever more than one field from another', () => {
    for (const f of FIELDS)
      for (const k of f.next) {
        const other = FIELDS[k];
        expect(other.next).toContain(FIELDS.indexOf(f));
        expect(f.set.filter((pc) => !other.set.includes(pc)).length).toBeLessThanOrEqual(1);
      }
    for (const seed of SEEDS) {
      const sys = seedsSystem(seed);
      const starts = new Set<number>();
      for (let t = 0; t < 3600; t += 5) starts.add(sys.fieldAt(t).from);
      const s = [...starts].sort((a, b) => a - b);
      expect(s.length).toBeGreaterThan(10);
      for (let i = 1; i < s.length; i++) {
        expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(130);
        expect(s[i] - s[i - 1]).toBeLessThanOrEqual(260);
        const a = sys.fieldAt(s[i - 1]).field;
        const b = sys.fieldAt(s[i]).field;
        expect(FIELDS[a].next).toContain(b);
        if (i > 1) expect(b).not.toBe(sys.fieldAt(s[i - 2]).field);
      }
      // (a player takes a field up within WAYS.lag of its coming: well inside a field's length)
      for (const p of sys.players) expect(p.lag).toBeLessThan(WAYS.lag + 1e-9);
      expect(WAYS.lag).toBeLessThan(130 / 2);
    }
  });

  it('it begins at once, the players come in one at a time, and it never falls silent for long: after seven to ten seconds of nothing someone who is free comes in', () => {
    for (const seed of SEEDS) {
      const sys = seedsSystem(seed);
      const played = entriesBetween(sys, 0, 3600);
      expect(played[0].e.t).toBeLessThan(1);
      expect(played[0].p.role.voice).not.toBe('glockenspiel');
      // everyone has come in within two minutes, no two in the same five seconds
      const firsts = sys.players.map((p) => p.first).sort((a, b) => a - b);
      expect(firsts[firsts.length - 1]).toBeLessThan(120);
      for (let i = 1; i < firsts.length; i++) expect(firsts[i] - firsts[i - 1]).toBeGreaterThanOrEqual(3.7);
      let end = 0;
      let longest = 0;
      let held = 0;
      for (const { p, e } of played) {
        longest = Math.max(longest, e.t - end);
        end = Math.max(end, p.role.kind === 'ring' ? e.notes[e.notes.length - 1].t + 4 : e.end);
        if (p.role.kind !== 'ring') held += e.end - e.t;
      }
      expect(longest, seed).toBeLessThan(16);
      // and it is never thick: between one and two notes held at once, on average
      expect(held / 3600).toBeGreaterThan(1.1);
      expect(held / 3600).toBeLessThan(1.9);
      // an entry that fills a silence is its player's own phrase, clear of that player's own loop
      for (const x of played.filter((q) => q.fill)) {
        const own = played.filter((q) => q.p === x.p && !q.fill);
        for (const o of own) expect(x.e.t >= o.e.end + 4 || x.e.end <= o.e.t - 1, `${seed} ${x.p.role.name} at ${x.e.t}`).toBe(true);
      }
    }
  });

  it('it does not come round: no minute of an hour has the notes of another', () => {
    const sys = seedsSystem('kelumo');
    const minutes = new Set<string>();
    for (let m = 0; m < 60; m++)
      minutes.add(
        seedsEvents(sys, m * 60, m * 60 + 60)
          .filter((e) => e.kind === 'on')
          .map((e) => (e.kind === 'on' ? `${e.line}:${e.midi}:${(e.t - m * 60).toFixed(1)}` : ''))
          .join(' '),
      );
    expect(minutes.size).toBe(60);
  });

  it('a seed is a word an address can carry; a new one can be said', () => {
    expect(cleanSeed('Kelumo')).toBe('kelumo');
    expect(cleanSeed(' a b/c?d=é&e ')).toBe('abcde');
    expect(cleanSeed('2026-11-15')).toBe('2026-11-15');
    expect(cleanSeed('x'.repeat(40))).toHaveLength(24);
    expect(cleanSeed('%%%')).toBe('');
    let k = 0;
    const rnd = () => [0.1, 0.5, 0.9, 0.3, 0.7, 0.05][k++ % 6];
    const s = newSeed(rnd);
    expect(s).toMatch(/^([bdfghklmnprstvwz][aeiou]){3}$/);
    expect(cleanSeed(s)).toBe(s);
    const many = new Set(Array.from({ length: 200 }, () => newSeed()));
    expect(many.size).toBeGreaterThan(190);
  });
});

describe('Seeds: as a piece', () => {
  const seeds = PIECES.find((p) => p.id === 'seeds')!;

  it('is the ten on their own seats, one line each; the ten’s play icon plays it, and the other pieces’ orchestras still play their own', () => {
    const song = seeds.generate!('kelumo');
    expect(song.duration).toBe(Infinity);
    expect(song.events).toEqual([]);
    expect(song.stream!.seed).toBe('kelumo');
    expect(song.lines.map((l) => l.name)).toEqual(['Flute', 'Clarinet', 'Horn', 'Glockenspiel', 'Harp', 'Piano', 'Violin', 'Viola', 'Cello', 'Double Bass']);
    const plan = piecePlan(seeds, song.lines, 10);
    expect(lineupOf(plan)).toEqual(SEEDS_VOICES);
    expect(plan.lines.map((rs) => rs.map((r) => [r.part, r.shift]))).toEqual(SEEDS_VOICES.map((_, i) => [[i, 0]]));
    expect(PIECES[pieceForLineup(SEEDS_VOICES)].id).toBe('seeds');
    // (two pieces on one orchestra, the Fifth's two movements: the first of them)
    for (const other of PIECES.filter((p) => p.id !== 'beethoven5-ii')) expect(PIECES[pieceForLineup(other.parts.map((q) => q.voice))].id, other.id).toBe(other.id);
  });

  it('a stretch of it as a file would hold it ends clean: every note let go, the pedal up', () => {
    for (const [seconds, from] of [[300, 0], [45, 613]] as const) {
      const x = seedsExcerpt('kelumo', seconds, from);
      expect(x.duration).toBe(seconds);
      const open = new Map<string, number>();
      let pedal = 0;
      for (const e of x.events) {
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeLessThanOrEqual(seconds);
        if (e.kind === 'pedal') pedal = e.value;
        if (e.kind === 'on' || e.kind === 'off') open.set(`${e.line}:${e.midi}`, Math.max(0, (open.get(`${e.line}:${e.midi}`) ?? 0) + (e.kind === 'on' ? 1 : -1)));
      }
      expect([...open.values()].every((v) => v === 0)).toBe(true);
      expect(pedal).toBe(0);
    }
  });

  it('played for an hour, the player’s list stays a minute or two long, and every event is sent once, in order, each note told ahead with its end', () => {
    const song = seedsSong('tavide');
    const st = song.stream!;
    const want = st.events(0, 3660);
    // the player's own bookkeeping (ui/player.ts tick), on a clock that steps 30 ms
    let { events, to } = streamOpen(st, 0);
    let idx = 0;
    let told = 0;
    let most = 0;
    let ahead = notesAhead(events);
    const sent: FileEvent[] = [];
    for (let now = 0; now < 3600; now += 0.03) {
      const w = streamMore(st, events, to, now, Math.min(idx, told));
      if (w) {
        events = w.events;
        to = w.to;
        idx -= w.dropped;
        told -= w.dropped;
        ahead = notesAhead(events);
      }
      while (told < events.length && events[told].t <= now + 5) {
        const e = events[told];
        // (a note told to the bows has its end in the list: its length is its own, not the list's)
        if (e.kind === 'on') {
          const off = events.findIndex((x, k) => k > told && x.kind === 'off' && x.line === e.line && x.midi === e.midi);
          expect(off).toBeGreaterThan(told);
          expect(ahead.len[told]).toBeCloseTo(events[off].t - e.t, 5);
        }
        told++;
      }
      while (idx < events.length && events[idx].t <= now + 0.2) sent.push(events[idx++]);
      most = Math.max(most, events.length);
    }
    expect(sent[sent.length - 1].t).toBeGreaterThan(3590);
    expect(sent).toEqual(want.slice(0, sent.length));
    // the list: never more than what STREAM asks for at once
    expect(most).toBeLessThan(((STREAM.keep + STREAM.ahead + 2 * STREAM.chunk) * want.length) / 3660 * 2.5);
    expect(most).toBeLessThan(6000);
    // a resume in the middle of the hour asks for nothing of what came before but the last few seconds
    const mid = streamOpen(st, 1800);
    expect(mid.events[0].t).toBeGreaterThanOrEqual(1800 - STREAM.keep);
    expect(mid.events).toEqual(want.filter((e) => e.t >= 1800 - STREAM.keep && e.t < mid.to));
    expect(mid.events.length).toBeLessThan(most);
  });
});
