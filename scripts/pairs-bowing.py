# The bow's pictures paired for the PR (scripts/shots-bowing.mjs made the PNGs): every `<name>-before.png`
# with its `<name>-after.png` side by side at half size (scripts/pair-shots.py does that); and, for the
# held note on a single 2D stage, the contact close up, before | after, enlarged: the drawn
# style's direction chevron there before and gone after, the vector style's there in both.
#   python3 scripts/pairs-bowing.py <dir of PNGs> <out dir>
import sys
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)


def contact(im, near=None):
    """where the hair meets the string: the densest patch of the contact's colour on the stage (the drawn
    style's vermilion glow, the vector style's red ring), between the top band and the keys; `near`: only
    within 160 px of that point"""
    w, h = im.size
    q = 4
    small = im.resize((w // q, h // q), Image.BOX)
    px = small.load()
    sw, sh = small.size
    y0, y1 = int(0.14 * sh), int(0.6 * sh)
    x0, x1 = 0, sw
    if near:
        x0, x1 = max(0, near[0] // q - 40), min(sw, near[0] // q + 40)
        y0, y1 = max(y0, near[1] // q - 40), min(y1, near[1] // q + 40)
    red = [[0] * sw for _ in range(sh)]
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = px[x, y]
            # (near a known place: the ring's own red; anywhere on the stage: the glow, wider)
            if (r > 170 and g < 110 and b < 95 and r - g > 90) if near else (r > 150 and g < 125 and b < 105 and r - g > 70):
                red[y][x] = 1
    # (summed-area table: the count in a window)
    S = [[0] * (sw + 1) for _ in range(sh + 1)]
    for y in range(sh):
        row = 0
        for x in range(sw):
            row += red[y][x]
            S[y + 1][x + 1] = S[y][x + 1] + row
    R = 9
    best = (-1, 0, 0)
    for cy in range(y0 + R, y1 - R):
        for cx in range(x0 + R, x1 - R):
            n = S[cy + R + 1][cx + R + 1] - S[cy - R][cx + R + 1] - S[cy + R + 1][cx - R] + S[cy - R][cx - R]
            if n > best[0]:
                best = (n, cx, cy)
    _, cx, cy = best
    pts = [(x, y) for y in range(cy - R, cy + R + 1) for x in range(cx - R, cx + R + 1) if red[y][x]]
    if pts:
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
    return int(cx * q), int(cy * q)


# the drawn style's picture before gives the place (its glow and chevron); the same held note is at the
# same place after, and in the vector style (looked for near it: its ring)
for a in sorted(src.glob('held-*-2d-*-after.png')):
    name = a.name[: -len('-after.png')]
    b = src / f'{name}-before.png'
    if not b.exists():
        continue
    at = contact(Image.open(b).convert('RGB'))
    for look in ('2d', 'vector'):
        n2 = name.replace('-2d-', f'-{look}-')
        tiles = []
        for tag in ('before', 'after'):
            im = Image.open(src / f'{n2}-{tag}.png').convert('RGB')
            cx, cy = contact(im, at) if look == 'vector' else at
            half = 150
            cx = min(max(cx, half), im.width - half)
            box = (cx - half, cy - half, cx + half, cy + half)
            tiles.append(im.crop(box).resize((660, 660), Image.LANCZOS))
        gap = 12
        sheet = Image.new('RGB', (660 * 2 + gap, 660), (60, 55, 45))
        sheet.paste(tiles[0], (0, 0))
        sheet.paste(tiles[1], (660 + gap, 0))
        dest = out / f'contact-before-after-{n2}.jpg'
        sheet.save(dest, quality=88, optimize=True, progressive=True)
        print(dest.name)
