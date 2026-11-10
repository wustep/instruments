# Orchestra 2D bows (artifacts/realistic-3d/final-next5/ensemble-bows): the screenshots to JPEG (the
# phone's 2× shots at half size, the desktop's whole: their bow lines are a px or two), and a
# before | after pair of each view and style for the PR.
#   python3 scripts/pairs-ensemble-bows.py
from pathlib import Path
from PIL import Image, ImageDraw

d = Path('artifacts/realistic-3d/final-next5/ensemble-bows')
for p in sorted(d.glob('*.png')):
    im = Image.open(p).convert('RGB')
    if '-phone-' in p.name:
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im.save(p.with_suffix('.jpg'), quality=88, optimize=True, progressive=True)
    p.unlink()

def pair(a: Path, b: Path, out: Path, width: int) -> None:
    A, B = Image.open(a), Image.open(b)
    gap = 12
    im = Image.new('RGB', (A.width + B.width + gap, max(A.height, B.height)), (60, 60, 60))
    im.paste(A, (0, 0))
    im.paste(B, (A.width + gap, 0))
    dr = ImageDraw.Draw(im)
    for x, t in ((8, 'before (production)'), (A.width + gap + 8, 'after')):
        dr.rectangle((x - 4, im.height - 30, x + 8 * len(t) + 4, im.height - 6), fill=(0, 0, 0))
        dr.text((x, im.height - 26), t, fill=(255, 200, 120))
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(out, quality=88, optimize=True, progressive=True)

for view in ('wide', 'laptop', 'phone'):
    for style in ('vector', 'default'):
        for kind in ('', '-reach'):
            a = d / f'before-prod-{view}-{style}{kind}.jpg'
            b = d / f'after-{view}-{style}{kind}.jpg'
            if a.exists() and b.exists():
                pair(a, b, d / f'pair-{view}-{style}{kind}.jpg', 2400 if view != 'phone' else 900)
for p in sorted(d.glob('*.jpg')):
    print(f'{p.stat().st_size // 1024:5d} kB  {p.name}')
