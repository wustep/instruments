"""Trace the violin scroll's side profile for the 3D stage (strings3d.ts, `SCROLL`).

Reads .cache/refs-3d/violin-scroll.jpg (the "Francesca" Strad's head in profile, The Met, CC0; analysis
only, never committed), and prints the profile in the neck's frame: a along the neck towards the scroll
from the fingerboard's end, h towards the strings from the neck's top surface, both as fractions of the
head length.

  python3 scripts/trace-scroll.py [path/to/violin-scroll.jpg]

1. The back of the pegbox and scroll: per row, the leftmost wood pixel (wood is saturated, the backdrop
   is neutral grey, the pegs are dark).
2. The volute: a logarithmic spiral r = r0 e^(-k θ) about a centre, θ clockwise from the crown, fitted
   by a random search to points read off the turns (each with its turn index); 4.4 px rms.
3. The front edge of the cheeks (rows hidden by the pegs read by eye), ending where it curls under the
   first turn, a gap away from it.
4. Near the crown the traced back is eased into the spiral, so the two meet without a step.
"""
import colorsys
import math
import random
import sys
from pathlib import Path

from PIL import Image

REF = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / '.cache' / 'refs-3d' / 'violin-scroll.jpg'

# ---- 1. the back, per row
im = Image.open(REF).convert('RGB')
px = im.load()


def wood(x, y):
    r, g, b = px[x, y]
    _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return s > 0.28 or v < 0.3


rows = []
for y in range(560, 1610, 10):
    xs = [x for x in range(500, 1240) if wood(x, y)]
    if xs:
        rows.append((float(xs[0]), float(y)))
rows = [p for p in rows if not (1185 <= p[1] <= 1205)]  # a peg's shadow

# ---- 2. the spiral: (x, y, turn) read off the photograph (original pixels)
TURNS = [
    (950, 552, 0), (1004, 570, 0), (1048, 600, 0), (1075, 630, 0), (1093, 660, 0), (1106, 690, 0), (1113, 720, 0),
    (1116, 750, 0), (1119, 780, 0), (1117, 800, 0), (1111, 820, 0), (1102, 840, 0),
    (1085, 860, 0), (1060, 880, 0), (1030, 898, 0), (995, 910, 0), (960, 915, 0),
    (812, 770, 0), (950, 662, 1), (1040, 760, 1), (882, 775, 1), (950, 722, 2), (995, 760, 2),
]


def theta(cx, cy, x, y, turn):
    a = math.atan2(x - cx, -(y - cy))
    if a < -0.25 * math.pi:
        a += 2 * math.pi
    return a + 2 * math.pi * turn


def err(p):
    cx, cy, r0, k = p
    return sum((math.hypot(x - cx, y - cy) - r0 * math.exp(-k * theta(cx, cy, x, y, t))) ** 2 for x, y, t in TURNS)


random.seed(1)
best = (950.0, 770.0, 225.0, 0.11)
be = err(best)
for it in range(40000):
    sc = 1 - it / 40000
    q = tuple(best[i] + random.gauss(0, (10, 10, 10, 0.01)[i] * sc) for i in range(4))
    e = err(q)
    if e < be:
        best, be = q, e
cx, cy, r0, k = best
C = (cx, cy)

# ---- the neck's frame: the fingerboard's glue line runs from x 1215 at y 1700 to 1250 at y 2500
dx, dy = 1215 - 1250, 1700 - 2500
ln = math.hypot(dx, dy)
A = (dx / ln, dy / ln)
Hn = (-A[1], A[0]) if -A[1] > 0 else (A[1], -A[0])
N = (1215.0, 1505.0)  # the fingerboard's end on the neck's top surface
tilt = math.atan2(-A[0], -A[1])


def to_ah(p):
    v = (p[0] - N[0], p[1] - N[1])
    return (v[0] * A[0] + v[1] * A[1], v[0] * Hn[0] + v[1] * Hn[1])


def spiral(th, extra=0.0):
    r = r0 * math.exp(-k * th) + extra
    return (C[0] + r * math.sin(th), C[1] - r * math.cos(th))


def ang(p):
    return math.atan2(p[0] - C[0], -(p[1] - C[1]))


# ---- 4. ease the back into the spiral over θ in [-0.45π, 0]
th_b = -0.45 * math.pi
upper = sorted([(ang(p), math.hypot(p[0] - C[0], p[1] - C[1])) for p in rows if p[1] < C[1] + 60 and -math.pi < ang(p) < 0.05])


def r_trace(th):
    for (a0, q0), (a1, q1) in zip(upper, upper[1:]):
        if a0 <= th <= a1:
            return q0 + (q1 - q0) * (th - a0) / (a1 - a0 or 1)
    return r0 * math.exp(-k * th)


back = sorted([p for p in rows if not (ang(p) > th_b and p[1] < C[1])], key=lambda p: -p[1])
for i in range(15):
    th = th_b * (1 - i / 14)
    t = (th - th_b) / -th_b
    w = t * t * (3 - 2 * t)
    r = r_trace(th) * (1 - w) + r0 * math.exp(-k * th) * w
    back.append((C[0] + r * math.sin(th), C[1] - r * math.cos(th)))

# ---- 3. the front edge, the nut first; it ends on the curl a gap from the first turn
gap = 32.0
front = [(1215, 1500), (1212, 1480), (1206, 1440), (1201, 1400), (1193, 1350), (1180, 1300), (1163, 1250), (1138, 1200),
         (1113, 1160), (1080, 1118), (1047, 1080), (1017, 1050), (991, 1030), (969, 1010), (950, 993), (933, 975)]
front.append(spiral(1.05 * math.pi, gap))
under = [(1116, 1700), (1092, 1650), (1072, 1630), (1043, 1610), (990, 1603)]

amax = max(to_ah(p)[0] for p in back + [spiral(t * 0.02) for t in range(160)])
f = lambda v: round(v / amax, 4)
fmt = lambda pts: '[%s]' % ', '.join('[%s, %s]' % (f(a), f(h)) for a, h in (to_ah(p) for p in pts))
Ca = to_ah(C)
print('spiral: centre (%.1f, %.1f) px, r0 %.1f px, k %.4f, rms %.1f px' % (cx, cy, r0, k, math.sqrt(be / len(TURNS))))
print('head length %.1f px' % amax)
print('C: [%s, %s], R0: %s, K: %s, tilt: %s, gap: %s' % (f(Ca[0]), f(Ca[1]), f(r0), round(k, 4), round(tilt, 4), f(gap)))
print('under:', fmt(under))
print('back:', fmt(back))
print('front:', fmt(front))
