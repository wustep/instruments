// The clarinet's and the oboe's grenadilla, drawn in the 2D style, must read against the stage: it was
// #14100c on a stage of #0e0d0b to #13100d (contrast 1.0-1.03, the body vanished on a phone).
import { describe, expect, it } from 'vitest';
import { WOOD as CLARINET_WOOD } from '../src/ui/clarinet-draw.ts';
import { WOOD as OBOE_WOOD } from '../src/ui/oboe-draw.ts';

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// the stage's ground (styles.css --ground) and the lightest the stage's light makes it behind the body
const STAGE = ['#0e0d0b', '#13100d'];

describe('the reeds’ wood against the stage', () => {
  for (const [name, wood] of [['clarinet', CLARINET_WOOD], ['oboe', OBOE_WOOD]] as const)
    it(`the ${name}'s body fill is at least 1.3:1 over the stage`, () => {
      for (const s of STAGE) expect(contrast(wood, s), `${wood} on ${s}`).toBeGreaterThanOrEqual(1.3);
    });
  it('and still dark wood, not the bassoon’s red', () => {
    expect(lum(CLARINET_WOOD)).toBeLessThan(0.03);
    expect(lum(OBOE_WOOD)).toBeLessThan(0.03);
  });
});
