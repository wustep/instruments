# NEXT5 item 5: put each before shot beside its after shot and measure the whites.
#   python3 scripts/pairs-next5-webgl.py <raw dir> <out dir> [shot,shot,…]
# Reads <raw>/<name>-before.png and <raw>/<name>-after.png (scripts/shots-next5-webgl.mjs) and writes
# <out>/<name>.jpg: before on top and after below for a wide stage, before left and after right for a
# phone's. Prints, per shot, the share of the stage's pixels at or over 250 and 235 in all three
# channels (clipped white, nearly white) and the level the brightest 0.1 % reach.
import sys
from pathlib import Path

import numpy as np
from PIL import Image

raw, out = Path(sys.argv[1]), Path(sys.argv[2])
only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
out.mkdir(parents=True, exist_ok=True)
GROUND = (14, 13, 11)


def whites(im):
    a = np.asarray(im).min(axis=2)
    return (a >= 250).mean() * 100, (a >= 235).mean() * 100, np.percentile(a, 99.9)


print(f"{'shot':28s} {'>=250 before':>13s} {'after':>8s}   {'>=235 before':>13s} {'after':>8s}   {'top 0.1% before':>16s} {'after':>6s}")
for b in sorted(raw.glob('*-before.png')):
    name = b.name[: -len('-before.png')]
    a = raw / f'{name}-after.png'
    if not a.exists():
        continue
    ib = Image.open(b).convert('RGB')
    ia = Image.open(a).convert('RGB')
    wb, wa = whites(ib), whites(ia)
    print(f'{name:28s} {wb[0]:12.3f}% {wa[0]:7.3f}%   {wb[1]:12.3f}% {wa[1]:7.3f}%   {wb[2]:16.0f} {wa[2]:6.0f}')
    if only and not any(name.endswith('-' + s) for s in only):
        continue
    if ib.height > ib.width:
        w = 620
        h = round(ib.height * w / ib.width)
        sheet = Image.new('RGB', (2 * w + 8, h), GROUND)
        sheet.paste(ib.resize((w, h), Image.LANCZOS), (0, 0))
        sheet.paste(ia.resize((w, round(ia.height * w / ia.width)), Image.LANCZOS), (w + 8, 0))
    else:
        w = min(1500, ib.width)
        hb = round(ib.height * w / ib.width)
        ha = round(ia.height * w / ia.width)
        sheet = Image.new('RGB', (w, hb + ha + 8), GROUND)
        sheet.paste(ib.resize((w, hb), Image.LANCZOS), (0, 0))
        sheet.paste(ia.resize((w, ha), Image.LANCZOS), (0, hb + 8))
    sheet.save(out / f'{name}.jpg', quality=84, optimize=True, progressive=True)
