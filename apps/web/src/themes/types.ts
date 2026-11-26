// A theme: one whole look of the app. Chrome, type and colour (its three sheets, beside this file, scoped to
// it at build time: vite.config.ts `themeScope`), the 2D stage's inks, the vector style's palette, the
// chrome's few drawn signs, and (in `world.ts`, loaded with the 3D stage) its room and its lights.
//
// A theme's `theme.ts` is data and nothing else: no DOM, no three.js, no import from the app. It is read
// in Node too (the build writes the page's boot script from it; the unit tests draw with it).

export type ThemeId = 'night-bench' | 'evening-hall' | 'day-studio' | 'night-gallery';

/** The 2D stage's inks. `ground` is #rrggbb; the rest are 'r,g,b' triplets, taken with an alpha
 *  (stage-draw.ts `rgba`). By role, never by hue:
 *  `line` the instrument's linework; `sound` whatever vibrates or sounds; `warm` what a body does in
 *  answer (a board's modes, a sympathetic string, a key under a finger); `cool` a reference, what is
 *  ideal, the other half of a wave, air. The last four are materials the drawings share. */
export interface Ink {
  ground: string;
  line: string;
  sound: string;
  warm: string;
  cool: string;
  copper: string;
  felt: string;
  wood: string;
  ebony: string;
}

/** The vector style's palette (#rrggbb). `ground`: what a solid part is masked with (the sheet's own
 *  colour, so a hidden line is hidden and nothing shows where the part stands); `line` in three weights
 *  and `frame`: the instrument; `sound`: what sounds; `slot1`–`slot4`: the four control slots, a knob's
 *  colour and whatever it moves on the drawing. */
export interface VectorInk {
  ground: string;
  line: string;
  lineMid: string;
  lineDim: string;
  frame: string;
  sound: string;
  slot1: string;
  slot2: string;
  slot3: string;
  slot4: string;
}

export interface VectorLook {
  ink: VectorInk;
  /** sound level 0..1 → colour: stops of [level, #rrggbb] */
  heat: [number, string][];
  /** how lines are laid over one another: added as beams on a tube are, or multiplied as ink is */
  blend: 'lighter' | 'multiply';
  /** the core of the heaviest lines: the colour mixed towards [#rrggbb, by how much] */
  core: [string, number];
  /** the tube's halo, once a frame after everything is drawn (a line on paper has none) */
  glow: boolean;
  /** the display's own type after Hershey (what Hershey lacks falls to it) */
  mono: string;
  /** the spectrum's figures on the vector display (a canvas font) */
  figures: string;
}

/** One of the chrome's signs: a character of the page's type, or a drawn path on a 16 px square
 *  (`size`: the px it is shown at, where a look sets it on the element) */
export type Glyph = string | { d: string; size?: number };
export type GlyphName = 'back' | 'prev' | 'next' | 'close' | 'reset' | 'knobs';
export interface Glyphs extends Record<GlyphName, Glyph> {
  /** a drawn sign's class (its sheet styles it) and any attributes it carries itself */
  svgClass: string;
  svgAttrs?: Record<string, string>;
}

export interface Theme {
  id: ThemeId;
  /** its name: the theme button's tooltip and its menu */
  name: string;
  scheme: 'dark' | 'light';
  /** the browser's own chrome round the page (meta theme-color) */
  bar: string;
  /** the theme button's swatch: the ground, what is chosen or sounds, the linework (#rrggbb) */
  swatch: [string, string, string];
  ink: Ink;
  vector: VectorLook;
  glyphs: Glyphs;
  /** the spectrum's and the scope's figures on the 2D stage (a canvas font) */
  figures: string;
}
