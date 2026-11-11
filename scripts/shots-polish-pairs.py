"""Lays the polish pass's pictures side by side: the build before on the left, after on the right.
   python3 scripts/shots-polish-pairs.py <before dir> <after dir> <out dir>
(pictures from scripts/shots-polish.mjs; JPEG, at most 1400 px wide: small enough to commit)"""
import sys
from pathlib import Path
from PIL import Image

before, after, out = (Path(p) for p in sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
GAP = 16
for a in sorted(after.glob('*.png')):
    b = before / a.name
    if not b.exists():
        continue
    ia, ib = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    h = max(ia.height, ib.height)
    sheet = Image.new('RGB', (ib.width + GAP + ia.width, h), (120, 20, 110))
    sheet.paste(ib, (0, 0))
    sheet.paste(ia, (ib.width + GAP, 0))
    if sheet.width > 1400:
        sheet = sheet.resize((1400, round(sheet.height * 1400 / sheet.width)), Image.LANCZOS)
    sheet.save(out / f'{a.stem}.jpg', quality=84, optimize=True)
    print(a.stem, sheet.size)
