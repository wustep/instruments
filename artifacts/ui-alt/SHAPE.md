# Evening Hall — design brief (`/impeccable shape`)

No interview was held. The answers a shape round would ask for are in `artifacts/ui-alt/BRIEF.md`, AGENTS.md
and `apps/web/PRODUCT.md`; what is assumed beyond them is marked *(assumed)*.

## 1. Job and audience

Someone arrives on a link, on a computer or a phone, to hear and see an instrument work, and stays to play it,
seat an orchestra or leave a piece running. Visitor mode: **Experience** on the stage (the work leads, the
interface recedes), held to **Operate**'s discipline for every control (standard controls, in standard places),
and **Read** on Notes and Measurements.

## 2. Outcome and proof

A first note within seconds, believed. The proof is on the page already: the instrument moving as the
simulation computes it. The redesign's job is to put that instrument in a place and to give the chrome that
place's voice, without adding a word to the stage.

## 3. Selected direction

**Evening Hall**, pinned by the brief: "A warm concert hall at night. The instrument sits on a stage under a
stage spotlight; the house beyond is dark and warm (wood, velvet, gold, a soft falloff into the hall). It
should feel like a recital, not a product shot and not a night-mode dashboard."

- **Structural thesis.** Three materials, each with one job. The *hall* (claret-black, velvet, boards) is
  everything that stays: the stage and its fixed chrome. The *light* (one warm spot, gold) is everything that
  is chosen or sounding. *Paper* (ivory programme stock, sepia ink, a claret second colour) is everything that
  opens: menus, tooltips, the sheet music, the two reading pages.
- **Focal moment.** The lights come up with the first sound: before a gesture the stage waits under a low
  light; the first note brings the spot up and the house down. *(assumed: no rule or test reads the stage's
  brightness before a gesture; verified before it is kept.)*
- **Type.** Libre Caslon (Display and Text, with its italic) for what speaks; Cabin, in tracked capitals and
  tabular figures, for what labels and measures. Italic is the voice of stage directions ("tap a key",
  tooltips, titles). No monospace outside code and equations.
- **Implementation consequence.** One token set with a paper scope that re-points the same variables; the 2D
  ground in CSS under a transparent canvas; the 3D world rebuilt in `three3d.ts` (environment, three lights,
  a boarded floor, a curtain and a beam in the final pass).

## 4. Scope and boundaries

In: the bar, picker, view switch, Orchestra controls, player, readout band, fallboard, knobs, pedals, keys,
menus, tooltips, the sheet music's chrome, Notes, Measurements, the 404 page, the 2D ground in both styles, the
vector palette, the 3D environment, lights, floor, backdrop and tone.

Untouched: the engine and its sound; the address grammar; every geometric rule in AGENTS.md (the bar's and
band's heights, the picker's row and sheet, the player's box, the knobs' places, phone framing); the
instruments' own drawings and models (wood, brass and silver are what they are); the Orchestra's seating; the
copy, but for the Notes page's one phrase about the light.

Anti-goals: a recolour of the night bench; a theme picker; a drawn auditorium (seats, chandeliers, a
proscenium arch); any new permanent word on the stage.

## 5. States and ranges

- Sound: idle (the stage waits, the lamp unlit), starting, running (lit), failed (the only red).
- One instrument, or an orchestra of 2–18 seats; a readout of one note to a seventeen-part count.
- Looks: 2D, vector lines, 3D; a piano key's close-up in each.
- Windows: 1440×900, the picker's fold at 1340 px, a tablet, 390×844, a phone on its side, 320 px.
- `ui=0`, `keys=0`; reduced motion (the light changes at once).

## 6. Interaction and layout

The topology stands: bar, band, stage, fallboard, keys. Hierarchy changes inside it. The stage is the only lit
thing; the bar is a dark velvet field that carries the picker; the fallboard is lacquer with brass; whatever a
visitor opens arrives as paper over the dark. Chosen is lit (an instrument, a view, a part), never boxed.
Labels have an 11 px floor; legends on the keys reach 4.5:1; icons are drawn, not typed.

## 7. Constraints and open decisions

- Banned faces (Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk, Sora, Young Serif,
  Bodoni, Geist, Syne) and the incumbent pair (Newsreader, IBM Plex) are out.
- The 3D stage keeps `lite`, a phone's occlusion and shadow switches, the shader warming, and draws with no
  WebGL warning.
- Tests that pin the old look by value (the 404 page's faces and ground; the vector display's blue) are
  rewritten to the new values, never loosened.
- Open, for Stephen: whether the Orchestra's four glyph rows should become one (the critique's first issue).
  It is behaviour and outside this brief; here they are only made quieter.
