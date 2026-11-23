### Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3/4 | Text tokens meet AA on the plaster (ink 13.9:1, ink-2 8.0:1, muted 4.5:1, the blue 6.3:1); a skip link and a page heading were added; icon-only controls are named for assistive tech but not for a finger. |
| 2 | Performance | 3/4 | Nothing new in the frame loop: floor shadows are cached, the room's patch of light is one CSS layer placed only when it changes; fonts are 18 self-hosted subsets, the largest 43 kB. |
| 3 | Theming | 3/4 | One token set in `:root` drives all chrome; the canvases keep their own palettes (`INK`, `V`, the materials), so the ground and the blue are written in two places. No dark theme, by the brief. |
| 4 | Responsive | 3/4 | Phone, landscape, 320 px and five more windows hold with no horizontal scroll; a few targets are under 44 px (octave buttons 36, a score's line chips 22 at the narrowest). |
| 5 | Implementation integrity | 4/4 | The detector finds no anti-pattern on the stage, the Orchestra, Measurements or the 404 page; Notes has 6 advisories (13 px diagram labels). |
| **Total** | | **16/20** | **Good** |

### Implementation Integrity Verdict

Coherent and intentional. The rendered detector reports 0 findings on `/piano`, `/symphony`, `/measurements` and `/404.html`, and 6 `tiny-text` advisories on `/notes` (figure labels at 13 px inside SVG diagrams). The source scan reports 153 `design-system-*` advisories since DESIGN.md exists (113 colours, 23 radii, 17 sizes): nearly all are the drawn instruments' material colours and the canvases' own geometry, which are not chrome tokens. No side-stripes, gradient text, glass, nested cards or decorative motion.

### Executive Summary
- Audit Health Score: **16/20** (Good)
- Issues: P0 0, P1 0, P2 3, P3 6
- The system holds across the three looks: one ground, ink for chosen, one blue for sound, nothing glowing.
- What is left is mostly inherited behaviour the redesign was told not to change (a nearly wordless stage; a row of thirteen line chips on a phone).

### Detailed Findings by Severity

**P2**
- **Icon-only controls have no visible name on touch.** `data-tip` tooltips answer hover and focus; a finger gets the icon alone (player, stage knobs, the knob toggle). Names exist as `aria-label`. Carried from the critique; it needs a behaviour decision (a long-press label, or a first-use caption) that the brief's "no new permanent copy" leaves to the owner.
- **A score's line chips are 22 px wide at the narrowest phones.** Thirteen in one row with 1 px between them is under WCAG 2.5.8's 24 px spacing. The rule and its test are the repo's own (`e2e/phone-orchestra.spec.ts`); a second row is the fix and costs the orchestra its back row.
- **Two sources for the same colours.** `--ground`, `--ink`, `--accent` in CSS and `INK.ground`, `INK.line`, `INK.sound`, `V.*` in TypeScript. They agree today (the vector CSS inks were brought to `kit.ts` in this pass); nothing enforces it.

**P3**
- Notes: figure labels are 13 px in SVG units (6 advisories). They scale with the figure; raising them needs each diagram checked for collisions.
- Octave buttons are 36 px on touch (32 px under 360 px wide), spaced clear of their neighbours.
- Counts drawn on glyphs are 8.5–11.5 px (a player count, a part's note). A control's name is never under 12 px.
- The room's patch of light is a blurred layer; it re-rasters while the room knob turns. Fine on the machines tested; watch a low-end phone.
- `ring-glow.ts` and its uniforms still say "glow" for what is now a cast of the blue on the material.
- The cached 2D floor shadows were looked at in Chrome only; WebKit runs the smoke test, not a picture review.

### Patterns & Systemic Issues
- The chrome is tokenised; the drawings are not, by nature. DESIGN.md records the materials in prose (`2D-DAYLIGHT.md`, `stage-draw.ts` `BRASS`/`SILVER`) rather than as tokens.
- Tests that measured pictures by brightness on a dark ground were moved to alpha or to the new inks; none was removed.

### Positive Findings
- Contrast is comfortable everywhere text sits on the ground or on paper, and what sounds is never told by colour alone (a string's shape, a key's wash and its name, the readout's words).
- `prefers-reduced-motion` stills the chrome's transitions and leaves every state change in place.
- Focus is a 2 px ink ring on every control; the skip link and the hidden heading give the page a start.
- The first viewport passes the first-viewport checks at 1440×900 and 390×844 (the stage whole, the play disc inside it and answering a click).

## Recommended Actions
1. **[P2] `/impeccable clarify`**: decide how a touch user learns an icon's name without permanent copy.
2. **[P2] `/impeccable adapt`**: the line chips on the narrowest phones (a scroll, or two rows with the orchestra moved, as 320 px does today).
3. **[P2] `/impeccable extract`**: read the canvas palettes from the CSS tokens (or generate both) so the ground and the blue have one source.
4. **[P3] `/impeccable typeset`**: Notes' figure labels at 14 px, each diagram checked.
5. **[P3] `/impeccable polish`**: rename `ring-glow` to what it now is.
