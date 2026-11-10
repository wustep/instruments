# NEXT5 item 5: stack each before shot over its after shot and measure the whites.
#   python3 scripts/pairs-next5-webgl.py <raw dir> <out dir>
# Reads <raw>/<name>-before.png and <raw>/<name>-after.png (scripts/shots-next5-webgl.mjs), writes
# <out>/<name>.jpg (before on top, after below, each ≤ 1600 px wide) and prints, per shot, the share of
# the stage's pixels at or over 250 and 235 in all three channels (clipped white, nearly white).
import sys
from pathlib import Path

import numpy as np
from PIL import Image

raw, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)


def whites(im):
    a = np.asarray(im).min(axis=2)
    return (a >= 250).mean() * 100, (a >= 235).mean() * 100


print(f"{'shot':30s} {'>=250 before':>13s} {'after':>7s}   {'>=235 before':>13s} {'after':>7s}")
for b in sorted(raw.glob('*-before.png')):
    name = b.name[: -len('-before.png')]
    a = raw / f'{name}-after.png'
    if not a.exists():
        continue
    ib = Image.open(b).convert('RGB')
    ia = Image.open(a).convert('RGB')
    wb, wa = whites(ib), whites(ia)
    print(f'{name:30s} {wb[0]:12.3f}% {wa[0]:6.3f}%   {wb[1]:12.3f}% {wa[1]:6.3f}%')
    w = min(1600, ib.width)
    hb = round(ib.height * w / ib.width)
    ha = round(ia.height * w / ia.width)
    sheet = Image.new('RGB', (w, hb + ha + 6), (14, 13, 11))
    sheet.paste(ib.resize((w, hb), Image.LANCZOS), (0, 0))
    sheet.paste(ia.resize((w, ha), Image.LANCZOS), (0, hb + 6))
    sheet.save(out / f'{name}.jpg', quality=88, optimize=True, progressive=True)
