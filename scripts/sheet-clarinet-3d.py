"""The clarinet's 3D review sheet: each render beside a reference photograph at the same angle (art
direction §5). The stage holds the clarinet at a player's slant, so the renders are turned upright here
(the axis found from the silver keywork's pixels) and cropped to the instrument, and the reference
photographs are set beside them at the same height per row.

  python3 scripts/sheet-clarinet-3d.py <renders dir> <out.jpg> [--refs .cache/refs-clarinet] [--rows full,keys,mouthpiece]

Renders come from scripts/shots-clarinet-3d.mjs (clarinet-<view>.png). The references are Yamaha's
YCL-CSG III photograph (CC BY-SA 4.0, Yamaha Corporation) and a mouthpiece with its reed and ligature
(CC BY-SA 3.0, see docs/3d-reference.md): a sheet that includes them carries their licence, credited in
the artifacts' README.
"""
import math
import os
import sys

from PIL import Image, ImageDraw


def axis_angle(im):
    """the clarinet's axis on screen (degrees from the picture's vertical), from its bright keywork"""
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    xs, ys = [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if px[x, y] > 150:
                xs.append(x)
                ys.append(y)
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs) / n
    syy = sum((y - my) ** 2 for y in ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / n
    th = 0.5 * math.atan2(2 * sxy, sxx - syy)  # the principal direction, from the x axis
    return math.degrees(th)


def turn(th):
    """the turn that stands the axis upright, the mouthpiece (at the upper left) on top"""
    return th + 90 if th < 0 else th - 90


def upright(path, pad=40, th=None, box=None):
    """a render turned so the clarinet stands upright (mouthpiece up), cropped to its keywork's extent (or to
    `box`, a centred w × h, for a close-up)"""
    im = Image.open(path).convert('RGB')
    th = axis_angle(im) if th is None else th
    rot = im.rotate(turn(th), resample=Image.BICUBIC, expand=True, fillcolor=(18, 16, 14))
    w, h = rot.size
    if box:
        bw, bh = box
        return rot.crop(((w - bw) // 2, (h - bh) // 2, (w + bw) // 2, (h + bh) // 2))
    g = rot.convert('L')
    px = g.load()
    cols = [x for x in range(0, w, 2) if any(px[x, y] > 150 for y in range(0, h, 3))]
    rows = [y for y in range(0, h, 2) if any(px[x, y] > 150 for x in range(0, w, 3))]
    if not cols or not rows:
        return rot
    return rot.crop((max(0, cols[0] - pad), max(0, rows[0] - pad - 30), min(w, cols[-1] + pad), min(h, rows[-1] + pad + 30)))


def fit_h(im, H):
    return im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)


def label(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 8 + 7 * len(text), 18], fill=(0, 0, 0))
    d.text((4, 3), text, fill=(235, 235, 235))
    return im


def main():
    args = sys.argv[1:]
    src, out = args[0], args[1]
    refs = args[args.index('--refs') + 1] if '--refs' in args else '.cache/refs-clarinet'
    rows_wanted = (args[args.index('--rows') + 1] if '--rows' in args else 'full,keys,mouthpiece').split(',')
    R = lambda n: os.path.join(src, n)
    have = lambda n: os.path.exists(R(n))
    yam = Image.open(os.path.join(refs, 'clarinet-yamaha-csg3-front.jpg')).convert('RGB')
    rows = []
    th = axis_angle(Image.open(R('clarinet-front.png')).convert('RGB')) if have('clarinet-front.png') else None
    if 'full' in rows_wanted:
        H = 1000
        cells = [label(fit_h(yam, H), 'ref: Yamaha YCL-CSG III (CC BY-SA 4.0)')]
        for v in ['front', 'side', 'back', 'hero', 'actuated']:
            if have(f'clarinet-{v}.png'):
                cells.append(label(fit_h(upright(R(f'clarinet-{v}.png')), H), f'render: {v}'))
        rows.append(cells)
    if 'keys' in rows_wanted:
        # square on to the rings, turned upright beside the photograph's same stretch of the body
        H = 760
        for (a, b, v, name) in [(1600, 2860, 'upper', 'upper joint'), (2700, 3960, 'lower', 'lower joint'), (3560, 4820, 'low', 'low keys')]:
            cells = [label(fit_h(yam.crop((0, a, 651, b)), H), f'ref: {name}')]
            for pre in ['', 'actuated-']:
                if have(f'clarinet-{pre}{v}.png'):
                    cells.append(label(fit_h(upright(R(f'clarinet-{pre}{v}.png'), th=th, box=(700, 1500)), H), f'render: {pre}{v}'))
            rows.append(cells)
    if 'mouthpiece' in rows_wanted:
        H = 520
        cells = [label(fit_h(yam.crop((60, 0, 600, 700)), H), 'ref: mouthpiece, front')]
        mp = os.path.join(refs, 'clarinet-mouthpiece-side.jpg')
        if os.path.exists(mp):
            cells.append(label(fit_h(Image.open(mp).convert('RGB'), H), 'ref: mouthpiece, reed, ligature (CC BY-SA 3.0)'))
        for v in ['mouthpiece', 'reed', 'actuated-mouthpiece']:
            if have(f'clarinet-{v}.png'):
                cells.append(label(fit_h(Image.open(R(f'clarinet-{v}.png')).convert('RGB'), H), f'render: {v}'))
        rows.append(cells)
    W = max(sum(c.width for c in r) + 8 * (len(r) + 1) for r in rows)
    Ht = sum(r[0].height for r in rows) + 8 * (len(rows) + 1)
    sheet = Image.new('RGB', (W, Ht), (12, 11, 10))
    yy = 8
    for r in rows:
        xx = 8
        for c in r:
            sheet.paste(c, (xx, yy))
            xx += c.width + 8
        yy += r[0].height + 8
    if sheet.width > 3200:
        sheet = sheet.resize((3200, round(sheet.height * 3200 / sheet.width)), Image.LANCZOS)
    sheet.save(out, quality=84, optimize=True, progressive=True)
    print(out, sheet.size)


main()
