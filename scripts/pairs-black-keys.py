# The black keys and the 3D play tint: put each before shot beside its after shot.
#   python3 scripts/pairs-black-keys.py <before dir> <after dir> <out dir>
# Reads the PNGs of scripts/shots-black-keys.mjs and scripts/black-key-underside.py (same names in both
# directories) and writes <out>/<name>.jpg (before left, after right, whole frames) and
# <out>/detail-*.jpg (the parts that changed, enlarged). The PNGs are then kept as JPEG (q88, full size).
import sys
from pathlib import Path

from PIL import Image, ImageDraw

before, after, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
GROUND = (14, 13, 11)
INK = (201, 191, 171)
# (name, crop box in the 1440×900 frame, scale): where the tint was, and the 2D controls' strings
DETAIL = [
    ('3d-grand-action-chord', (300, 140, 1060, 680), 1.0, 'grand, case hidden, a chord held: keys, sticks, dampers, strings'),
    ('3d-upright-action-chord', (380, 220, 1100, 680), 1.0, 'upright, case hidden, a chord held: keys, sticks, hammers'),
    ('3d-grand-hero-chord', (420, 330, 780, 480), 2.0, 'grand hero view, a chord held: the keyboard'),
    ('3d-upright-hero-chord', (500, 330, 900, 420), 2.0, 'upright hero view, a chord held: the keyboard'),
    ('3d-grand-closeup-strike', (0, 140, 1440, 680), 0.75, 'grand C#4 close-up at the strike: key stick, jack, strings'),
    ('3d-grand-closeup-held', (0, 140, 1440, 680), 0.75, 'grand C#4 close-up held: key, stick, damper'),
    ('3d-upright-closeup-strike', (380, 130, 1000, 680), 1.0, 'upright C#4 close-up at the strike: strings, jack, damper'),
    ('2d-default-grand-chord', (0, 130, 1440, 900), 0.6, '2D (unchanged): the sounding strings and keys still lit'),
    ('2d-vector-upright-chord', (0, 130, 1440, 900), 0.6, '2D vector (unchanged): the sounding strings and keys still lit'),
]


def fit(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def sheet(ims, labels, title=''):
    gap = 12
    top = 18 + (16 if title else 0)
    s = Image.new('RGB', (sum(i.width for i in ims) + gap * (len(ims) - 1), max(i.height for i in ims) + top), GROUND)
    d = ImageDraw.Draw(s)
    if title:
        d.text((4, 3), title, fill=INK)
    x = 0
    for i, label in zip(ims, labels):
        d.text((x + 4, top - 15), label, fill=INK)
        s.paste(i, (x, top))
        x += i.width + gap
    return s


def load(p):
    for q in (p, p.with_suffix('.jpg')):
        if q.exists():
            return Image.open(q).convert('RGB')
    return None


n = 0
for a in sorted(list(after.glob('*.png')) + list(after.glob('*.jpg'))):
    b = load(before / a.name)
    ia = Image.open(a).convert('RGB')
    ims = [b, ia] if b else [ia]
    ims = [fit(i, 820) for i in ims]
    sheet(ims, ('before', 'after') if b else ('after',)).save(out / f'{a.stem}.jpg', quality=88, optimize=True)
    n += 1
for name, box, k, title in DETAIL:
    a = load(after / f'{name}.png')
    b = load(before / f'{name}.png')
    if not a or not b:
        continue
    crop = [i.crop(box) for i in (b, a)]
    if k != 1:
        crop = [i.resize((round(i.width * k), round(i.height * k)), Image.LANCZOS) for i in crop]
    # wide crops one over the other, narrow ones side by side
    if crop[0].width > 900:
        s = Image.new('RGB', (crop[0].width, crop[0].height * 2 + 46), GROUND)
        d = ImageDraw.Draw(s)
        d.text((4, 3), title, fill=INK)
        d.text((4, 18), 'before', fill=INK)
        s.paste(crop[0], (0, 32))
        d.text((4, 32 + crop[0].height + 1), 'after', fill=INK)
        s.paste(crop[1], (0, 46 + crop[0].height))
    else:
        s = sheet(crop, ('before', 'after'), title)
    s.save(out / f'detail-{name}.jpg', quality=90, optimize=True)
    n += 1
# the geometry view of a sharp from below, both pianos
g = [load(d / f'geometry-{k}-sharp-underside.png') for k in ('grand', 'upright') for d in (before, after)]
if all(g):
    g = [fit(i, 640) for i in g]
    rows = [sheet(g[0:2], ('before', 'after'), 'grand C#4 from below (geometry view: magenta = a face seen from inside)'), sheet(g[2:4], ('before', 'after'), 'upright C#4 from below')]
    s = Image.new('RGB', (max(r.width for r in rows), sum(r.height for r in rows) + 10), GROUND)
    s.paste(rows[0], (0, 0))
    s.paste(rows[1], (0, rows[0].height + 10))
    s.save(out / 'detail-sharp-underside.jpg', quality=90, optimize=True)
    n += 1
print(f'{n} sheets in {out}')
for d in (before, after):
    for p in sorted(d.glob('*.png')):
        Image.open(p).convert('RGB').save(p.with_suffix('.jpg'), quality=88, optimize=True, progressive=True)
        p.unlink()
