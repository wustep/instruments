---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["404.html"]
---

# The stage and its pages (the whole app)

Scope: every surface of `apps/web`: the stage in its three looks (2D drawing, vector lines, 3D), the Orchestra, the
file player and sheet music, Measurements, Notes, the 404. A replacement visual world on the same functions, DOM
classes and addresses. Mode: Experience for the stage (the instrument leads, the interface recedes); Read for
Measurements and Notes; the controls held to Operate's standard (familiar, precise, every state present).

Audience and job: someone who followed a link, on a phone or a computer, to play an instrument within seconds, then to
find the others, change the look and hear a piece. Proof is the thing itself: the instrument sounding and moving as it
is computed. No new permanent copy; the stage stays nearly wordless.

Chosen direction: Night Gallery, pinned by the owner's brief. Memorable moment: a key is touched and the room answers
in light alone: the key, the string, the spot on the floor.

Constraints: the repo's rules (`AGENTS.md`); every layout fact its e2e checks measure (the sixteen on one row over
1340 px, the phone sheet four to a row, the readout's fixed box); the 3D stage's performance knobs; banned typefaces;
no theme picker; no engine changes.

Left open for the owner: the Orchestra's four glyph rows (critique P1) and names for icon-only controls on touch.

## Direction contract

THESIS: The instrument is the one lit object in a museum room after closing, and the page is that room: its wall, its
picture rail, its label, its plinth. Light is the only signal: what is chosen, pressed or sounding is lit, never
coloured. It refuses the dark product studio (softboxes, warm key, spot in a void) and the editorial shell (italic
display serif over small mono labels, one orange accent).

OWN-WORLD: A cool charcoal wall and a floor one step lower; bone ink; three lights and no paint: silver (the rim; every
"on"), tungsten (the dim key; what a body does), steel (reference). Square corners. Hairlines only where something
stands: the rail under the index, the plinth's lit edge. Words that light instead of boxed chips; dials as a thin ring
with an index; pedals in outline; keys in half-light that brighten when they sound. One family, Libre Franklin, 11 px
floor, tight tracking, tabular figures. All colour belongs to the instruments.

STORY: The visitor sees one object standing in light, understands it is theirs to play, plays it, and reads the room's
answer: the label names what sounds, the spectrum rises, the pool on the floor lifts.

FIRST VIEWPORT: Wall edge to edge. Top, the rail: sixteen glyphs in five families, the one on the stage lit from
above; at its right the kind and the view as lit words, the lamp, two page links. Under it the label: what sounds, in
Franklin Light at 34 px over one small line; the spectrum a hairline at centre; the excitation at right. Below, the
instrument, the only colour, in 2D on a wall washed by scallops of light, in 3D on a dark floor before a far wall, cut
out by silver light from behind. Bottom: the plinth with its lit edge, then the keys in half-light: the primary action.

FORM: a museum gallery at night (wall, rail, label, plinth, spot). seed: none (pinned): "A moody dark gallery. The
instrument is a sculpture in a museum after hours: a dim room, a clean plinth or dark floor, and a sharp rim light
that cuts the silhouette"; "background is architectural and spare (a wall plane, a faint floor line)"; "museum-quiet,
tight tracking, low contrast labels, almost no ornament". Signature interaction: what sounds is lit (key, part, pick,
pool). Motion grammar: light rises in under 120 ms and falls over 300 ms, ease-out; nothing changes place but what the
hand moves; reduced motion: no fades.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
