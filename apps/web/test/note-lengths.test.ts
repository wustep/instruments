// What the file player tells the bows of each note to come (midi-file.ts notesAhead): its length, from
// its start to the next end of that pitch in its own line, and its line's dynamics over it.
import { describe, expect, it } from 'vitest';
import { notesAhead, type FileEvent } from '../src/midi-file.ts';

describe('each note’s length, as the bows are told it', () => {
  it('a note lasts to its own end: in its line, the same pitch struck twice in turn, a pitch shared by two lines apart', () => {
    const ev: FileEvent[] = [
      { t: 0, kind: 'on', midi: 60, vel: 80, line: 0 },
      { t: 0, kind: 'on', midi: 60, vel: 70, line: 1 },
      { t: 0.5, kind: 'cc', cc: 11, value: 0.5, line: 0 },
      { t: 1, kind: 'off', midi: 60, line: 0 },
      { t: 1, kind: 'on', midi: 60, vel: 80, line: 0 },
      { t: 1.25, kind: 'off', midi: 60, line: 0 },
      { t: 3, kind: 'off', midi: 60, line: 1 },
      { t: 3, kind: 'on', midi: 64, vel: 80, line: 0 },
      { t: 4, kind: 'pedal', cc: 64, value: 0, line: 0 },
    ];
    const len = [...notesAhead(ev).len].map((x) => Math.round(x * 1000) / 1000);
    //           on0  on1  cc  off  on   off   off  on(never ended: to the last event)  pedal
    expect(len).toEqual([1, 3, 0, 0, 0.25, 0, 0, 1, 0]);
  });
  it('the dynamics over a note: its line’s swell, averaged over the note’s time (held from one step to the next)', () => {
    const ev: FileEvent[] = [
      { t: 0, kind: 'on', midi: 60, vel: 80, line: 0 },
      { t: 0, kind: 'on', midi: 48, vel: 80, line: 1 },
      { t: 1, kind: 'dyn', value: 8, line: 0 },
      { t: 3, kind: 'dyn', value: 0, line: 0 },
      { t: 4, kind: 'off', midi: 60, line: 0 },
      { t: 4, kind: 'off', midi: 48, line: 1 },
      { t: 4, kind: 'on', midi: 62, vel: 80, line: 0 },
      { t: 4.5, kind: 'dyn', value: -6, line: 0 },
      { t: 5, kind: 'off', midi: 62, line: 0 },
    ];
    const dyn = [...notesAhead(ev).dyn];
    // 8 steps for 2 of its 4 s; the other line has none; then −6 for the second half
    expect(dyn[0]).toBeCloseTo(4, 5);
    expect(dyn[1]).toBe(0);
    expect(dyn[6]).toBeCloseTo(-3, 5);
  });
});
