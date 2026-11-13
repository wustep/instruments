// The polish pass's musical material for the harp, the glockenspiel and the tuba (the three sounded
// mechanical: each phrase begins with what gives a machine away, one note repeated and long notes held, and
// then plays a passage). One definition for the clips made from a live build (scripts/sample-live.mjs
// SET=polish: production before and after) and for the engine's own before/after renders and their numbers
// (scripts/render-polish.ts).
const on = (t, m, v) => ({ time: t, event: { type: 'noteOn', midi: m, velocity: v } });
const off = (t, m) => ({ time: t, event: { type: 'noteOff', midi: m } });
const see = (t, m, v, dur) => ({ time: t, event: { type: 'foresee', midi: m, velocity: v, dur } });

/** { events, duration, repeats: the runs of one note repeated ([first onset s, how many, s apart, MIDI]),
 *  held: the long notes ([onset s, length s, MIDI]) } */
export function polish(id) {
  const ev = [];
  const repeats = [];
  const held = [];
  const note = (t, m, len, v = 84, told = true) => {
    if (told) ev.push(see(t, m, v, len));
    ev.push(on(t, m, v), off(t + len, m));
  };
  const done = (dur) => ({ events: ev.sort((a, b) => a.time - b.time), duration: Math.min(20, Math.max(8, dur)), repeats, held });
  let t = 0.2;
  if (id === 'tuba') {
    const q = 60 / 96;
    // two long notes, a mezzo-forte C2 and a piano G1 …
    held.push([t, 2.6, 36]);
    note(t, 36, 2.6, 72);
    t += 2.9;
    held.push([t, 2.6, 31]);
    note(t, 31, 2.6, 46);
    t += 3.0;
    // … one note tongued eight times …
    repeats.push([t, 8, 0.5 * q, 41]);
    for (let i = 0; i < 8; i++) { note(t, 41, 0.5 * q * 0.62, 92); t += 0.5 * q; }
    t += 0.3;
    // … a march's bass, and a slurred phrase up to F3 and down
    for (const [m, n] of [[29, 1], [36, 1], [29, 0.5], [29, 0.5], [36, 1]]) { note(t, m, n * q * (n < 1 ? 0.62 : 0.8), 96); t += n * q; }
    t += 0.3;
    const line = [41, 45, 48, 53, 50, 46, 43, 41];
    line.forEach((m, i) => {
      const len = i === line.length - 1 ? 3 * q : q * 0.75;
      ev.push(see(t, m, 78, len), on(t, m, 78), off(t + len + (i === line.length - 1 ? 0 : 0.06), m));
      t += len;
    });
    return done(t + 1.2);
  }
  if (id === 'harp') {
    // one string six times, a wire string four times …
    repeats.push([t, 6, 0.3, 60]);
    for (let i = 0; i < 6; i++) { note(t, 60, 0.25, 80); t += 0.3; }
    t += 0.3;
    repeats.push([t, 4, 0.5, 36]);
    for (let i = 0; i < 4; i++) { note(t, 36, 0.45, 96); t += 0.5; }
    t += 0.4;
    // … a chord spread and left to ring …
    held.push([t, 2.4, 60]);
    [36, 43, 52, 60, 67, 76].forEach((m, i) => note(t + 0.03 * i, m, 2.2, 84));
    t += 2.6;
    // … an arpeggio up the compass in E♭, a figure of overlapping notes, glissandi, a last chord
    for (const m of [39, 46, 51, 55, 58, 63, 67, 70, 75, 79, 82, 87]) { note(t, m, 0.4, 82); t += 0.16; }
    t += 0.4;
    for (let k = 0; k < 3; k++) for (const m of [63, 67, 70, 75, 70, 67]) { note(t, m, 0.3, 74); t += 0.11; }
    t += 0.3;
    const white = [];
    for (let m = 48; m <= 96; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) white.push(m);
    for (const m of white) { ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 70 + Math.round(18 * (m - 48) / 48), gliss: true } }, off(t + 0.2, m)); t += 0.034; }
    t += 0.25;
    for (const m of white.slice().reverse()) { ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 66, gliss: true } }, off(t + 0.2, m)); t += 0.03; }
    t += 0.3;
    for (const m of [39, 51, 58, 63, 67, 75]) ev.push(on(t, m, 96), off(t + 0.5, m));
    return done(t + 3.4);
  }
  // the consistency pass: the instruments given a player after those three (the horn, the trumpet, the
  // timpani, the bowed strings' left hand), and the double bass's walk over its air mode: two long notes,
  // one note eight times, a passage (the strings' on stopped notes: an open string is the string)
  const SUSTAINED = {
    horn: { long: [[53, 70], [60, 46]], rep: 55, line: [[48, 1], [55, 1], [60, 1], [64, 0.5], [62, 0.5], [60, 1], [55, 1], [52, 0.5], [55, 0.5], [48, 2]] },
    trumpet: { long: [[67, 70], [72, 46]], rep: 65, line: [[60, 0.5], [60, 0.25], [60, 0.25], [64, 0.5], [67, 0.5], [72, 1], [67, 0.5], [64, 0.5], [67, 1], [60, 2]] },
    violin: { long: [[71, 70], [78, 46]], rep: 74, line: [[62, 0.5], [64, 0.5], [66, 0.5], [67, 0.5], [69, 0.5], [71, 0.5], [73, 0.5], [74, 1], [69, 0.5], [66, 0.5], [62, 2]] },
    viola: { long: [[64, 70], [71, 46]], rep: 66, line: [[55, 0.5], [57, 0.5], [59, 0.5], [60, 0.5], [62, 0.5], [64, 0.5], [66, 0.5], [67, 1], [62, 0.5], [59, 0.5], [55, 2]] },
    cello: { long: [[52, 70], [59, 46]], rep: 54, line: [[43, 0.5], [45, 0.5], [47, 0.5], [48, 0.5], [50, 0.5], [52, 0.5], [54, 0.5], [55, 1], [50, 0.5], [47, 0.5], [43, 2]] },
    bass: { long: [[37, 70], [35, 46]], rep: 36, line: [[33, 1], [35, 1], [36, 1], [37, 1], [38, 1], [40, 1], [36, 1], [33, 2]] },
  }[id];
  if (SUSTAINED) {
    const q = 60 / 92;
    for (const [m, v] of SUSTAINED.long) {
      held.push([t, 2.6, m]);
      note(t, m, 2.6, v);
      t += 3.0;
    }
    repeats.push([t, 8, 0.5 * q, SUSTAINED.rep]);
    for (let i = 0; i < 8; i++) { note(t, SUSTAINED.rep, 0.5 * q * 0.62, 88); t += 0.5 * q; }
    t += 0.4;
    for (const [m, n] of SUSTAINED.line) { note(t, m, n * q * (n < 1 ? 0.8 : 0.9), 82); t += n * q; }
    return done(t + 1.2);
  }
  if (id === 'timpani') {
    // one drum eight times, another four times louder, a figure on two drums, and a last stroke left to ring
    repeats.push([t, 8, 0.4, 43]);
    for (let i = 0; i < 8; i++) { note(t, 43, 0.3, 84, false); t += 0.4; }
    t += 0.4;
    repeats.push([t, 4, 0.6, 48]);
    for (let i = 0; i < 4; i++) { note(t, 48, 0.4, 104, false); t += 0.6; }
    t += 0.4;
    for (const [m, n] of [[43, 1], [43, 0.5], [43, 0.5], [48, 1], [43, 1], [48, 0.5], [48, 0.5], [43, 0.5], [43, 0.5], [48, 1]]) { note(t, m, 0.25, 92, false); t += n * 0.42; }
    t += 0.2;
    note(t, 43, 0.4, 110, false);
    return done(t + 3.5);
  }
  // glockenspiel: one bar eight times, another in sixteenths …
  repeats.push([t, 8, 0.25, 91]);
  for (let i = 0; i < 8; i++) { note(t, 91, 0.15, 84, false); t += 0.25; }
  t += 0.3;
  repeats.push([t, 8, 0.125, 96]);
  for (let i = 0; i < 8; i++) { note(t, 96, 0.1, 70, false); t += 0.125; }
  t += 0.4;
  // … a tune that grows from piano to forte …
  const tune = [[91, 1], [95, 0.5], [98, 0.5], [103, 1], [98, 1], [96, 0.5], [95, 0.5], [93, 0.5], [91, 0.5], [86, 2]];
  tune.forEach(([m, n], i) => { note(t, m, 0.2, 50 + Math.round((60 * i) / (tune.length - 1)), false); t += n * 0.5; });
  // … a long note held with the wheel up (a roll, where the instrument has one), and a chord left to ring
  ev.push({ time: t, event: { type: 'control', cc: 1, value: 0.6 } });
  held.push([t, 2.6, 88]);
  ev.push(see(t, 88, 76, 2.6), on(t, 88, 76), off(t + 2.6, 88));
  t += 2.6;
  ev.push({ time: t, event: { type: 'control', cc: 1, value: 0 } });
  t += 0.4;
  for (const m of [79, 83, 86, 91]) note(t, m, 0.3, 92, false);
  return done(t + 4.2);
}
