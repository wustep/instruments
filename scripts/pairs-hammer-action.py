# The action close-up: put each before shot beside its after shot.
#   python3 scripts/pairs-hammer-action.py <before dir> <after dir> <out dir>
# Reads the PNGs of scripts/shots-hammer-action.mjs (same names in both directories) and writes
# <out>/<name>.jpg, before left and after right, for the states that tell the story: just opened on
# a key played before, at rest, early in a held strike (the damper), at the strike, held, a tap
# mid-flight; the whole page at the small sizes; the 3D close-up at rest and held.
import sys
from pathlib import Path

from PIL import Image, ImageDraw

before, after, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
GROUND = (14, 13, 11)
KEEP_2D = ('a-opened-after-playing', '0-rest', '1-held-early', '2-held-mid', '3-held-settled', '5-tap-early', 'page')
KEEP_3D = ('0-rest', '2-held')


def fit(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


n = 0
for a in sorted(after.glob('*.png')):
    stem = a.stem
    is3d = stem.startswith('3d-')
    if not stem.endswith(KEEP_3D if is3d else KEEP_2D):
        continue
    b = before / a.name
    ia = Image.open(a).convert('RGB')
    ims = [Image.open(b).convert('RGB'), ia] if b.exists() else [ia]
    w = 520 if ia.height > ia.width else 820
    ims = [fit(i, w) for i in ims]
    gap = 12
    sheet = Image.new('RGB', (sum(i.width for i in ims) + gap * (len(ims) - 1), max(i.height for i in ims) + 18), GROUND)
    d = ImageDraw.Draw(sheet)
    x = 0
    for i, label in zip(ims, ('before', 'after') if len(ims) == 2 else ('after',)):
        d.text((x + 4, 3), label, fill=(201, 191, 171))
        sheet.paste(i, (x, 18))
        x += i.width + gap
    sheet.save(out / f'{stem}.jpg', quality=84, optimize=True, progressive=True)
    n += 1
print(n, 'pairs →', out)
