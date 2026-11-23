# Audit of the Night Gallery build

`/impeccable audit` (Impeccable 4.10.0, project-local), 2026-11-23, on this branch after the redesign was in and
working and before the polish pass. A technical audit: what is measurable in the implementation. Measurements were
read from the running page (`artifacts/ui-alt/audit-measure.mjs`: every text node's contrast against what is behind
it, every control's box on an emulated phone with touch, sideways scroll) and from the detector.

## Audit health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Text passes AA everywhere measured; count badges sat at 10 px; the 88 keys still have names but no role (as before) |
| 2 | Performance | 3 | No blur or backdrop filter left in the chrome; the 3D pass count is unchanged; one transition that animated nothing |
| 3 | Theming | 3 | Three sheets on one token set; the keys' own shading and a few vector tints are literals |
| 4 | Responsive design | 3 | No sideways scroll at 1440 or 390; a handful of phone targets under 44 px, the Notes contents at 24 |
| 5 | Implementation integrity | 4 | Detector: 0 findings on the stage, the Orchestra and the 404; Notes 172 → 15, all then addressed |
| **Total** | | **16/20** | **Good** |

## Implementation integrity verdict

Pass. The implementation is one system: a wall, three lights and one family, expressed as tokens in `styles.css` and
carried by the same names into the 2D drawing inks (`INK`), the vector palette (`V`, `GROUND`) and the 3D room
(`ROOM`, `gallery()`). The single idiom for "this one" (a fixture on the rail's upper edge and its light) is one pair
of tokens, `--spot` and `--fixture`, used by the picker, the view switch, the piano's kind, the page links and the
keys-play chips.

Detector, static scan of `apps/web`: 0 findings (the incumbent had 7: three side-stripe hits, two glows, gradient
text, one tiny line). Rendered scans:

| Page | Incumbent | This build |
|---|---|---|
| `/piano` 1440×900 | 34 | 0 |
| `/piano` 390×844 | 10 | 0 |
| `/symphony` 1440×900 | 26 | 0 |
| `/404.html` 1440×900, 390×844 | 2, 2 | 0, 0 |
| `/notes` 1440×900 | 172 | 15 |
| `/notes` 390×844 | 77 | 10 |
| `/measurements` 1440×900 | 15 | 15 |

What remained on Notes and Measurements was verified in the page and is real: chart panel titles and diagram labels
at 11–12 px in SVG units, the sources list and table notes running to about 110 characters a line, one diagram label
at 3.0:1 on a phone. The detector cannot see the stage (a canvas), so its silence there says nothing about the
drawing or the 3D room; those were judged by eye and by the finish review.

## Executive summary

- Audit health score: **16/20** (Good).
- Issues: P0 0, P1 1, P2 5, P3 4.
- Top issues: phone targets under 44 px on Notes and Measurements; count badges at 10 px; long lines and small labels
  on the two pages; the scrub line's 17 px hit area.
- Next: `/impeccable polish` takes all of them; the two pre-existing structural ones (the keys' roles, a skip link)
  are listed and left.

## Findings

**[P1] Notes contents: twenty links 24 px tall on a phone**
- Location: `.notes .toc button`, `styles.css`.
- Category: Responsive. Impact: a miss lands on the neighbouring section. Standard: WCAG 2.5.8 (met at 24 px only
  by a hair), 44 px platform guidance.
- Recommendation: 44 px rows on coarse pointers, 36 px otherwise. Command: `/impeccable polish`.

**[P2] Count badges and part notes at 10 px**
- Location: `.pick-n`, `.part-n`, `.part-notes`, `.kf-n`, `.pl-more` (10 px); `.sm-n` (9 px); the vector look's
  `.pick-name` (10.5 px).
- Category: Accessibility. Impact: "×2" over a glyph is the only sign that a seat is doubled.
- Recommendation: the system's 11 px floor everywhere. Command: `/impeccable polish`.

**[P2] The scrub line can be taken hold of over 17 px only**
- Location: `.pl-bar::before` (`inset: -8px 0` round a 1 px line).
- Category: Responsive. Recommendation: 25 px. Command: `/impeccable polish`.

**[P2] The way back and a chart's data table are small targets on a phone**
- Location: `.back` (32×32), `details.data summary` (20 px tall), the 404's links (39 px), `.kf-toggle` (36 px),
  the phone's picker and orchestra buttons (36 px frames in a 44 px bar).
- Category: Responsive. Recommendation: 44 px where the layout has the room; a hit area the bar's height where the
  frame must stay 36. Command: `/impeccable polish`.

**[P2] Long lines and small labels on Notes and Measurements**
- Location: `.notes .refs`, `.notes .tbl .hint` (about 110 characters); `.chart svg .panel-title` (12 px),
  `.notes figure.diagram .lbl` (11 px, 6–7 px on a phone as the SVG shrinks).
- Category: Accessibility / Implementation integrity (detector `line-length`, `tiny-text`).
- Recommendation: a second, shorter measure for 13 px text; 13 px labels. Command: `/impeccable polish`.

**[P2] The file player's buttons are 36×36 on a phone**
- Location: `.pl-btn` under `(pointer: coarse)`.
- Category: Responsive. Impact: adjacent, with 2 px between. Constraint: eight controls and the hairline share one
  row of a 390 px phone (the rule in `AGENTS.md`, `e2e/phone-orchestra.spec.ts`); at 40 px the row is 36 px too
  wide. Left as it is; each passes WCAG 2.5.8's 24 px.

**[P3] A transition that animates nothing**
- Location: `.key.white { transition: … background-color … }` over a gradient background.
- Category: Performance. Recommendation: remove. Command: `/impeccable polish`.

**[P3] The readout's second line at rest**
- Location: `.readout[data-idle]` at 0.4 opacity: the note name stays large text at about 3.9:1, the line under it
  (11.5 px) falls to about 2:1.
- Category: Accessibility. It is what was last heard, deliberately dimmed, and is said again in full when it sounds.
  Left.

**[P3] Literals beside the tokens**
- Location: the keys' gradients (`.key.*`, sixteen hexes), `vector.css` (`rgb(134 189 234 / …)` for `--v-blue`).
- Category: Theming. They are one component's own shading; no second place uses them. Left.

**[P3] Pre-existing, outside this branch's brief**
- The 88 keys have accessible names but no role and no tab stop; no skip link past the seventeen picker buttons.
- Category: Accessibility. Listed in `STATUS.md` for a follow-up.

## Patterns

- The 11 px floor was applied to labels and missed on badges: one rule, one miss repeated five times.
- Touch sizes were right wherever a control was redrawn (octave arrows 40×44, view words 40×44, the knobs' button
  44×44) and stale wherever a rule was carried over (the contents, the way back, `summary`).

## Positive findings

- No sideways scroll on any page at 1440 or 390; the bar fits the same windows it fitted before (measured against
  production at 1341, 1366 and 1440: the picker is 18 px narrower).
- Text contrast: nothing under AA in the DOM. Labels are `#8f949b` on `#0f1318` (6.1:1); key names `#1e2226` on
  `#a7abb0` (6.9:1; they were 2.0:1); the script's two hits were its own blind spot (a gradient behind the text).
- "On" is never colour alone: a lit item also carries its fixture (a line on the rail) and `aria-pressed`.
- Reduced motion stills every fade and the lamp; the instrument's own motion is the simulation and stays.
- Fonts: one variable family in two files, where there were six.

## Recommended actions

1. **[P1] `/impeccable polish`**: Notes contents and the other phone targets to 44 px.
2. **[P2] `/impeccable polish`**: the 11 px floor on badges; the scrub line's hit area; the pages' measure and labels.
3. **[P3] `/impeccable polish`**: remove the dead transition.

Re-run `/impeccable audit` after fixes to see the score improve.
