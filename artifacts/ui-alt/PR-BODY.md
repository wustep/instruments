## UI alternate C: Night Gallery

**One of three alternative UIs. Do not merge until Stephen picks.**

The instrument is the one lit object in a museum room after closing, and the page is that room: a cool charcoal wall, a picture rail, a wall label, a plinth. Light is the only signal: what is chosen, pressed or sounding is lit, never coloured or boxed.

**Preview:** PREVIEW_URL

### What changed

- **Layout and navigation.** The bar is a rail: the sixteen instruments stand on its lower hairline, the one on the stage lit from a fixture on its upper edge. The piano's kind, the view (2D · Vector · 3D) and the two pages are words that light, where they were boxed chips. On a phone the picker button and the orchestra button have no frames and the view switch hangs from the rail. Every address, class and layout fact the e2e checks measure is as it was.
- **Type and colour.** One family, Libre Franklin (digits from Public Sans, its fork, for tabular figures), 11 px floor; Newsreader and IBM Plex are gone. Wall `#111315`, bone ink, and three lights with no paint: silver (whatever is on or sounds), tungsten (what a body does), steel (reference). The vermilion and amber are gone; all colour on the page is an instrument's own.
- **Controls.** Dials are a thin ring with an index and an arc of light; pedals are outlines that fill when held; keys stand in half-light and go white when they sound; the octave arrows, back, reset, close and the phone's knob button are drawn icons (they were `‹ › ← ↺ × ◐`). The stage's two knobs each carry what they move (a lid on its hinge, a room). The pieces menu leads with the title.
- **2D backgrounds.** The wall is washed by scallops of light from a rail of wall-washers, and the light lies across the drawing too; the floor line is the fallboard's lit edge. The vector style is the same wall turned down, argon blue and tungsten amber, one floor hairline where its frame was.
- **3D environment and lighting.** The nine-softbox studio is replaced by a gallery: a silver light from behind and above that casts the shadow forward, a second from behind for the far edge, a dim tungsten key across the front, no fill. Behind the instrument the stage paints a far wall with its scallop of light and the line where it meets a dark honed floor; the wall moves back as the room's knob is turned. The risers are plinths. `lite`, phone AO and shadows are untouched.
- **Pages.** Notes and Measurements in the same family on a 33 rem measure; the 404 keeps *Tacet*. Favicon and link preview redrawn in the new look.

Process: `/impeccable critique` of the incumbent (27/40, `artifacts/ui-alt/CRITIQUE.md`), a pinned direction contract, the build, an independent finish review (one fix round), `/impeccable audit` (`artifacts/ui-alt/AUDIT.md`), polish. `DESIGN.md` is the system; `PRODUCT.md` the product record.

### Before / after

| Before (production) | After (this branch) |
| :---: | :---: |
SHOT_ROWS

### Checks

CHECKS

### Left for a follow-up

- The Orchestra shows its lineup four times (critique P1); outside this brief.
- Icon-only controls have no name on touch (tooltips are hover and focus only).
- The 88 keys have names but no role; no skip link past the picker.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
