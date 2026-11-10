# Before and after side by side, for a PR: each `<name>-before.png` with its `<name>-after.png` (device pixels)
# as one JPEG at half size, a thin gap between (before left); an `-after` with no `-before` alone.
#   python3 scripts/pair-shots.py <dir of PNGs> <out dir> [prefix]
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
out = Path(sys.argv[2])
prefix = sys.argv[3] if len(sys.argv) > 3 else ''
out.mkdir(parents=True, exist_ok=True)
for a in sorted(src.glob('*-after.png')):
    name = a.name[: -len('-after.png')]
    b = src / f'{name}-before.png'
    ia = Image.open(a).convert('RGB')
    ia = ia.resize((ia.width // 2, ia.height // 2), Image.LANCZOS)
    if b.exists():
        ib = Image.open(b).convert('RGB')
        ib = ib.resize((ib.width // 2, ib.height // 2), Image.LANCZOS)
        gap = 12
        im = Image.new('RGB', (ib.width + gap + ia.width, max(ib.height, ia.height)), (60, 55, 45))
        im.paste(ib, (0, 0))
        im.paste(ia, (ib.width + gap, 0))
        dest = out / f'{prefix}before-after-{name}.jpg'
    else:
        im = ia
        dest = out / f'{prefix}after-{name}.jpg'
    im.save(dest, quality=85, optimize=True, progressive=True)
    print(dest.name, im.size)
