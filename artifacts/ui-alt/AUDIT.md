# Audit of the Evening Hall build (`/impeccable audit`)

Technical checks on this branch's dev build, measured on 2026-11-23 with Chrome (desktop 1440×900; touch
contexts at 320×640, 360×640, 390×844 and 412×915). The design review is `CRITIQUE.md`; this is what can be
measured.

## Audit health score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Every text pair measured is 4.5:1 or better; touch targets under 44 px remain in the bar and the player |
| 2 | Performance | 3 | No new per-frame work in 2D; the 3D frame's CPU cost is unchanged; GPU cost not measured |
| 3 | Theming | 3 | One token set with a paper scope and a vector scope; the keys' and lacquer's own gradients are literal |
| 4 | Responsive design | 3 | No sideways scroll from 320 px up, in any scene tried; the phone's bar targets are 38–40 px |
| 5 | Implementation integrity | 4 | The detector finds nothing on the rendered stage pages (34 and 26 before) |
| **Total** | | **16/20** | **Good** |

## Implementation integrity verdict

Pass. The look is one system: a token set at the top of `styles.css`, re-pointed in ink for paper and in
ivory and gold for the vector display, so a menu or a tooltip carries no second set of rules. `impeccable
detect` on the rendered pages:

| Page | Before (production) | After, 1440×900 | After, 390×844 |
|---|---|---|---|
| `/piano` | 34 | 0 | 0 |
| `/symphony` | 26 | 0 | 0 |
| `/notes` | 172 | 12 | 13 |
| `/measurements` | 15 | 1 | 2 |
| `404.html` | (2, source only) | 0 | 0 |

What is left on Notes is six SVG diagram labels that scale with their figure (15 px in the drawing's own
units, and the figure keeps a 600 px width on a phone) and single-word last lines, which are advisory. The
source scan reports four findings, all false positives: three 1 px hairline dividers and the bar's gilt
rule read as "a stripe down one side of a rounded box" (none is on a rounded box).

Two findings of the first detector pass were mine and are fixed: the stage's boards and the velvet's nap were
striped gradients (the boards are now a drawn tile of planks, each its own length; the nap is gone), and the
404's word was a 128 px italic serif (it is upright now, in the readout's face).

## Findings

**[P2] Touch targets under 44 px on a phone.** `panel.css`, `styles.css`. Measured at 390×844: the
picker's button 38 px tall, the Orchestra's 40×38, the view switch's three 35 px tall, the player's buttons
36×36, the octave's 36×38, the pages' links 40 px tall, the knobs' toggle 40×40. All pass WCAG 2.5.8 (24 px);
none reaches 44. The bar is 44 px tall and the player's box is fixed by the phone's framing rules, so these
are as large as their boxes allow. Before this branch the view switch was 25 px tall and the octave's buttons
26×30. *Suggested: `/impeccable adapt`, with the bar's height reopened.*

**[P2] Cabin has no tabular figures.** Measured: ten 1s are half the width of ten 0s. Columns of numbers
(Measurements' data tables, `table.rounds`) are therefore set in the system's monospace, and nothing else
is. A knob's reading shifts by a pixel or two as it is turned. *Suggested: `/impeccable typeset` if a label
face with tabular figures is wanted.*

**[P2] The Orchestra's bar on a 320 px phone.** Fixed here: the count's button and the pages' links are set
closer under 360 px, and the pedals stand closer. Measured after: `/piano`, `/symphony`, `/passiton` and the
404 are 320/320 wide at 320 px (production's Pass It On is 322).

**[P3] Out-of-range keys in the vector display** carry legends at about 1.6:1. They are inactive keys, as
before this branch.

**[P3] Behaviour the critique named and this branch leaves:** the readout's `aria-live` announces every
chord; tooltips do not show on touch; a bad MIDI file fails silently.

## What was measured

- **Contrast** (WCAG 2.x, computed from the tokens, worst background of each gradient): instrument names on
  the velvet 6.1:1; page links 7.9:1; the lamp's hint and a chosen view (gold ink on the velvet) 10.9:1; muted
  captions on the ground 6.9:1; pedal and knob names 6.2:1; key legends on ivory 4.8:1 (they were 2.0–2.7:1),
  on a sounding key 5.3:1, on a black key 6.7:1, on an out-of-range key 5.1:1; on paper, ink 13.9:1, second
  ink 9.2:1, muted 5.5:1, claret 7.5:1, verdigris 5.2:1; the vector display's labels 6.7:1.
- **Motion.** Reduced motion: the lamp does not breathe, the 2D pool changes at once (`.stage::before` has no
  transition) and the 3D light is set, not eased (`stage3d.ts` `still`). The light's change is opacity and
  light intensity only; nothing moves.
- **Keyboard.** Tabbing the bar shows a gold outline on each instrument (`:focus-visible`); the knobs keep
  their sliders' names and arrow keys; the drawn icons are `aria-hidden` inside buttons that keep their
  `aria-label`s.
- **Performance.** 2D: two static pseudo-elements under and over a canvas that was already clear; the only
  animated properties are their opacity and the bar's brightness, once, when sound starts. 3D
  (`__stage3d.stats.ms`, the frame's CPU time): `/piano` 0.90 ms here, 0.89 ms in production; a phone 0.70 ms
  in both. The last pass gains one ray-cylinder intersection and a cone per pixel, no new pass and no texture;
  the floor's shader gains its seams. No WebGL warning on either build. Frame time on a GPU was not measured.
- **Fonts.** Five files where there were six: Libre Caslon Display 400, Libre Caslon Text 400, 400 italic and
  700, Cabin (one variable file, weight and width). The display face loads when the readout first shows.
- **Theming.** `styles.css` holds 107 literal colours where it held 180; `var(--…)` is used 597 times across
  the three sheets. The literals left are materials (ivory and ebony keys, lacquer, brass plates).
- **Sideways scroll.** None at 320, 360, 390 and 412 px on `/piano`, `/symphony`, `/passiton?view=3d` and
  `/notes`.
- **Cold load on a phone.** The first 3D frame comes 370 ms after the chrome paints (456 ms on production).

## After the audit: the finish review and the polish pass

**The finish review** (an independent reviewer with no access to this thread, working from 34 captures and the
direction contract). Its first return was a recapture: the phone's first-viewport capture had been taken
before the 3D stage's first frame. Its full review was `fix`, with eight material findings; after one
correction round its verdict scored seven resolved and one partial, and named two regressions of that round.
That verdict is the review's last word:

| # | Finding | Verdict |
|---|---|---|
| 1 | The landing page (the piano in 2D) had no pool and no light-up: the drawing covered the stage | resolved |
| 2 | The vector display read as a third product (steel-blue lines, no velvet rail) | resolved |
| 3 | The 3D beam read as a grey rectangle | resolved |
| 4 | The chosen view was a boxed plate imitating brass | resolved |
| 5 | The spectrum's axis labels were 2.4:1; the sheet's title 4.0:1 | resolved (6.9:1, 5.7:1) |
| 6 | The 3D curtain was mechanical and floated over the boards | resolved |
| 7 | The house-lights filter dimmed the open picker's paper | resolved |
| 8 | The player's box lay on the cello's scroll; "tap a key" took two lines at 390 px | partial |

Left open by the verdict, and taken in the polish pass below: the hint's line on a 390 px phone; the 2D stage
waiting darker than the 3D one; the piano's kind and the view reading as one list of five. Named by the
reviewer and not done: a hot specular on the grand's case, the risers' unlit tops, the 2D orchestra's pool
centred on its players, a raster velvet and grain (no image generation here).

**The polish pass** (`/impeccable polish`, with `apps/web/DESIGN.md` written by then):

- The verdict's three: the lamp's words keep one line at 390 px beside a short name (measured: `/piano`,
  `/orchestra` and `/symphony` one line at 390 and 412 px; a long name or a 320 px phone two lines or the lamp
  alone); the 2D drawing waits at 0.7 of its light, as the 3D stage does; a gilt hairline stands between the
  piano's kinds and the view.
- What the tests found: the band was half a pixel taller with a caption in the scope (its line is now its
  box: 68 px either way); the bar did not fit a 1366 px laptop with an upright in 3D (it does now, with the
  lamp's words whole, 10 px to spare); the lamp's two-line state was one line set smaller.
- What the documenter found: "chosen is lit, never boxed" held only on the wide rail (the compact Orchestra
  button, a line's chosen instrument and the A/B buttons no longer mark a choice with a frame or a fill); the
  sheet music had a claret of its own (what sounds on paper is one token now); a lighter paper was a bare
  literal (`--paper-hi`); the vector palette's names said blue, green and red for ivory, verdigris and rose.
- What the design hook flagged: four one-sided dividers. The rail's gilt rule is two drawn lines at the foot
  of the velvet; the hairline after the instruments belongs to their row; two menu dividers are space.
  `impeccable detect` on the sources: 0 findings.

Not polished away, and said so: phone targets of 35–40 px in a 44 px bar; the file player's icons are solid
shapes on a 24 px box where the new icons are a 1.5 px pen on 16 px; Cabin's proportional figures.
