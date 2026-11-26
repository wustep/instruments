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
  /** how its lettering is laid over the lines: as the lines themselves are, or plainly */
  labelBlend: 'lighter' | 'multiply' | 'source-over';
  /** the corner travelling along a bowed string: one point, the brightest thing drawn (on paper the
   *  deepest) (#rrggbb) */
  corner: string;
  /** an orchestra's piano's own keys in lines (ensemble-draw.ts `drawOwnKeys`): a black key's wash over
   *  the ground, a held black's and a held white's (css colours), and which weight of line a black's and
   *  a white's edge is drawn in (a held key's edge is the sound's) */
  ownKeys: { black: string; blackDown: string; whiteDown: string; blackEdge: VectorLine; whiteEdge: VectorLine };
}
/** one of the palette's three weights of line */
export type VectorLine = 'line' | 'lineMid' | 'lineDim';

/** What the 2D stage draws that is no ink of a role: the few things a look sets for itself (read as it
 *  draws: stage-draw.ts, glock-draw.ts, ensemble-draw.ts, views/stage.ts). */
export interface DrawLook {
  /** the spectrum in the top band (stage-draw.ts `drawSpectrum`). Each pair is the drawn style's, then
   *  vector lines'. */
  spectrum: {
    /** the scale's figures: how much of the label's ink */
    label: [number, number];
    /** the trace: how much of the line's ink */
    trace: [number, number];
    /** with no sound yet, a hairline where the trace will rise from, so its figures stand on something:
     *  how much of the line's ink (0: none) */
    floor: [number, number];
    /** px kept under the trace's floor for the scale's figures, each hung from a tick at its frequency,
     *  the trace whole over them (0: they stand in the trace's own box, at its foot) */
    foot: number;
  };
  /** the excitation scope before a piano's key is struck: its axis alone (false: nothing at all) */
  scopeAxisAtRest: boolean;
  /** the room round one instrument in the drawn style is a patch of light on the floor, the room's own
   *  size, laid by the page under the canvas (the look's sheet: `.stage[data-room]::before`, placed by
   *  views/stage.ts with `--room-l/-t/-w/-h`); false: nothing of the room is the page's (its walls are
   *  drawn on the canvas) */
  roomLight: boolean;
  /** the note stamped on a glockenspiel's bar: the face it is cut in (the size is the bar's) */
  stamp: { weight: number; family: string };
  /** an orchestra's piano's own keys where it stands away from the screen's (ensemble-draw.ts
   *  `drawOwnKeys`), as the screen's keys are in this look (css colours): the whites' field and a held
   *  white, their partings, the shade on their front edge and the slip's shadow on their far end, a
   *  black key and a held one */
  ownKeys: { white: string; whiteDown: string; parting: string; front: string; slip: string; black: string; blackDown: string };
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

/** A dial's pointer on its 40 px face: a line from so far to so far from the middle (from 0: a hand from
 *  the middle; from further out: a mark at the cap's rim) */
export type Pointer = [from: number, to: number];

/** What of the page's chrome is not in a sheet: the little a look's sheets count on the page's code for
 *  (ui/controls.ts, ui/stage-knob.ts, main.ts). */
export interface Chrome {
  /** a fallboard knob's pointer */
  knobPointer: Pointer;
  /** the pointer of a knob on the stage (the lid, the room) */
  stagePointer: Pointer;
  /** what each knob on the stage carries on its cap to say what it moves, where a look has the two not
   *  be one dial twice: a path on the 40 px face for each, the class its sheet draws them by, and whether
   *  it lies over the pointer or under it. None: the bare dial. */
  stageSigns?: { cls: string; over: boolean; lid: string; room: string };
  /** for a keyboard and a screen reader: a way past the bar's stops to the stage (a link, the page's
   *  first stop, shown when it has the focus) and the page's name as a heading nothing shows; `main` can
   *  then be given the focus */
  skip: boolean;
}

/** What the Notes page says of a look, set into its sentences (views/notes.ts): a page's words are true
 *  of the page under every theme. Each is the part of a sentence that the look changes. A theme's are
 *  in its `words.ts`, loaded with that page (words.ts), not in its `theme.ts`. */
export interface Words {
  /** strings that ring in sympathy: "On the stage they ___ exactly as much as they really move" */
  sympathetic: string;
  /** … and those that do not: "The undamped treble … stays ___ under a bass note" */
  still: string;
  /** a key whose note sounds: "The keyboard ___ only the notes the engine is really sounding" */
  keySounds: string;
  /** … and a held key that has lost its string: "stays pressed but ___" */
  keyLost: string;
  /** the trumpet's standing wave: "On the stage its standing wave ___ inside the tube" */
  wave: string;
  /** … and its valve slides: "the valve slides ___ when the air goes through them" */
  slides: string;
  /** the room in 3D: "the room is the ___ of light on the floor … where the ___ at its largest ends" */
  pool: string;
  /** the 3D stage's light: "physically based materials ___, the strings drawn as wires" */
  light: string;
  /** … and its strings: "wires of their real gauges, ___." */
  wires: string;
  /** the instruments the keys play: "the notes go to the instruments ___ on the fallboard" */
  chosen: string;
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
  /** what else of the 2D stage is this look's own */
  draw: DrawLook;
  /** what its sheets count on the page's code for */
  chrome: Chrome;
}
