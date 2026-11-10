"""The oboe's 3D review sheet: each render beside a reference photograph at the same angle (art
direction §5). The stage holds the oboe at a player's slant, so the renders are turned upright here
(the axis found from the silver keywork's pixels) and cropped to the instrument, and the reference
photographs are set beside them at the same height per row.

  python3 scripts/sheet-oboe-3d.py <renders dir> <out.jpg> [--refs .cache/refs-oboe] [--rows full,reed,keys]

Renders come from scripts/shots-oboe-3d.mjs (oboe-<view>.png). The references are Yamaha's YOB-831
photograph (CC BY-SA 4.0, Yamaha Corporation) and the reed photograph (CC BY-SA 4.0, Cdang): a sheet
that includes them is itself CC BY-SA 4.0, credited in the artifacts' README.
"""
import math
import os
import sys

from PIL import Image, ImageDraw


def axis_angle(im):
    """the oboe's axis on screen (degrees from the picture's vertical), from its bright keywork"""
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
    """the turn that stands the axis upright, the reed (at the upper left) on top"""
    return th + 90 if th < 0 else th - 90


def upright(path, pad=40, th=None, box=None):
    """a render turned so the oboe stands upright (reed up), cropped to its keywork's extent (or to
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
    refs = args[args.index('--refs') + 1] if '--refs' in args else '.cache/refs-oboe'
    rows_wanted = (args[args.index('--rows') + 1] if '--rows' in args else 'full,reed,keys').split(',')
    R = lambda n: os.path.join(src, n)
    rows = []
    if 'full' in rows_wanted:
        H = 900
        cells = [label(fit_h(Image.open(os.path.join(refs, 'oboe-yamaha-side.jpg')).convert('RGB'), H), 'ref: Yamaha YOB-831 (CC BY-SA 4.0)')]
        for v in ['front', 'side', 'back', 'hero']:
            if os.path.exists(R(f'oboe-{v}.png')):
                cells.append(label(fit_h(upright(R(f'oboe-{v}.png')), H), f'render: {v}'))
        rows.append(cells)
    if 'reed' in rows_wanted:
        H = 520
        ref = Image.open(os.path.join(refs, 'oboe-reeds.jpg')).convert('RGB').crop((760, 280, 970, 1200))
        cells = [label(fit_h(ref, H), 'ref: reed, mm rule (CC BY-SA 4.0)')]
        top = Image.open(os.path.join(refs, 'oboe-yamaha-side.jpg')).convert('RGB').crop((150, 0, 420, 260))
        cells.append(label(fit_h(top, H), 'ref: top joint'))
        for v in ['reed', 'actuated-reed']:
            if os.path.exists(R(f'oboe-{v}.png')):
                cells.append(label(fit_h(Image.open(R(f'oboe-{v}.png')).convert('RGB').crop((380, 0, 1060, 547)), H), f'render: {v}'))
        rows.append(cells)
    if 'keys' in rows_wanted:
        # square on to the plates, turned upright beside the photograph's same stretch of the body
        H = 640
        y = Image.open(os.path.join(refs, 'oboe-yamaha-side.jpg')).convert('RGB')
        th = axis_angle(Image.open(R('oboe-front.png')).convert('RGB')) if os.path.exists(R('oboe-front.png')) else None
        for (a, b, v, name) in [(700, 1500, 'upperF', 'L1-L3'), (1560, 2360, 'lowerF', 'R1-R3'), (2900, 3700, 'bellF', 'low keys')]:
            cells = [label(fit_h(y.crop((60, a, 440, b)), H), f'ref: {name}')]
            for pre in ['', 'actuated-']:
                if os.path.exists(R(f'oboe-{pre}{v}.png')):
                    cells.append(label(fit_h(upright(R(f'oboe-{pre}{v}.png'), th=th, box=(420, 880)), H), f'render: {pre}{v}'))
            rows.append(cells)
        cells = []
        for v in ['upper', 'lower', 'thumb', 'bell']:
            if os.path.exists(R(f'oboe-{v}.png')):
                cells.append(label(fit_h(Image.open(R(f'oboe-{v}.png')).convert('RGB').crop((200, 0, 1240, 547)), 420), f'render: {v}'))
        if cells:
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
