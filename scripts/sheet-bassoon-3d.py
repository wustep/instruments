"""The bassoon's 3D review sheet: each render beside a reference photograph at the same angle (art
direction §5). The renders are the upright pose (a tall stage, scripts/shots-bassoon-3d.mjs TALL=1), cropped
to the instrument; the reference photographs are set beside them at the same height per row.

  python3 scripts/sheet-bassoon-3d.py <renders dir> <out.jpg> [--refs .cache/refs-bassoon/photos] [--rows full,keys,details]

Renders come from scripts/shots-bassoon-3d.mjs (bassoon-<view>.png). The references are Gregory Maxwell's
photograph of a Fox Renard 220 from both sides (GFDL 1.2), Yamaha's YFG-812 II (CC BY-SA 4.0, Yamaha
Corporation), John Yesberg's thumb-key photograph (CC BY-SA 4.0) and Wuselig's Wiki Loves Music photographs
of a Yamaha bassoon (CC BY-SA 4.0): a sheet that includes them carries their licences, credited in the
artifacts' README.
"""
import os
import sys

from PIL import Image, ImageDraw


def crop_to(im, pad=24):
    """a render cropped to the instrument: its red wood and its bright metal, not the floor's pool"""
    w, h = im.size
    px = im.load()
    hit = lambda x, y: (lambda p: p[0] - p[2] > 45 or sum(p) > 420)(px[x, y])
    cols = [x for x in range(0, w, 3) if any(hit(x, y) for y in range(0, h, 4))]
    rows = [y for y in range(0, h, 3) if any(hit(x, y) for x in range(0, w, 4))]
    if not cols or not rows:
        return im
    return im.crop((max(0, cols[0] - pad), max(0, rows[0] - pad), min(w, cols[-1] + pad), min(h, rows[-1] + pad)))


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
    refs = args[args.index('--refs') + 1] if '--refs' in args else '.cache/refs-bassoon/photos'
    rows_wanted = (args[args.index('--rows') + 1] if '--rows' in args else 'full,keys,details').split(',')
    R = lambda n: os.path.join(src, n)
    have = lambda n: os.path.exists(R(n))
    ref = lambda n: Image.open(os.path.join(refs, n)).convert('RGB')
    fox = ref('bassoon-fox-renard220-front.jpg')
    rows = []
    if 'full' in rows_wanted:
        H = 1100
        cells = [label(fit_h(fox.crop((300, 0, 760, 4392)), H), 'ref: Fox, fingers\' side (GFDL)'), label(fit_h(fox.crop((780, 0, 1900, 4392)), H), 'ref: Fox, thumbs\' side')]
        cells.append(label(fit_h(ref('bassoon-yamaha-yfg812-front.jpg'), H), 'ref: Yamaha YFG-812 II (CC BY-SA)'))
        for v in ['front', 'side', 'back', 'hero', 'actuated']:
            if have(f'bassoon-{v}.png'):
                cells.append(label(fit_h(crop_to(Image.open(R(f'bassoon-{v}.png')).convert('RGB')), H), f'render: {v}'))
        rows.append(cells)
    if 'keys' in rows_wanted:
        H = 640
        for (box, rname, views, name) in [
            ((380, 1950, 720, 2700), 'bassoon-finger-side.jpg', ['wing', 'actuated-wing'], 'wing joint, finger holes'),
            ((780, 1900, 1250, 2700), 'bassoon-thumb-keys.jpg', ['thumb', 'actuated-thumb'], 'long joint, left thumb'),
            ((380, 2950, 720, 3800), None, ['boot', 'actuated-boot'], 'boot, right hand'),
            ((780, 2900, 1250, 3800), 'bassoon-boot-thumb-keys.jpg', ['bootback', 'actuated-bootback'], 'boot, right thumb'),
        ]:
            cells = [label(fit_h(fox.crop(box), H), f'ref: {name}')]
            if rname:
                cells.append(label(fit_h(ref(rname), H), 'ref (CC BY-SA 4.0, J. Yesberg)'))
            for v in views:
                if have(f'bassoon-{v}.png'):
                    cells.append(label(fit_h(Image.open(R(f'bassoon-{v}.png')).convert('RGB'), H), f'render: {v}'))
            rows.append(cells)
    if 'details' in rows_wanted:
        H = 520
        cells = [label(fit_h(fox.crop((960, 1150, 1900, 1700)), H), 'ref: bocal, reed (Fox)'), label(fit_h(ref('bassoon-heckel-bocal.jpg'), H), 'ref: Heckel bocal (CC BY 2.0)')]
        for v in ['reed', 'actuated-reed']:
            if have(f'bassoon-{v}.png'):
                cells.append(label(fit_h(Image.open(R(f'bassoon-{v}.png')).convert('RGB'), H), f'render: {v}'))
        rows.append(cells)
        cells = [label(fit_h(fox.crop((380, 3900, 1250, 4392)), H), 'ref: boot cap (Fox)'), label(fit_h(ref('bassoon-wlm-5688.jpg'), H), 'ref: boot cap (Yamaha, CC BY-SA)')]
        if have('bassoon-cap.png'):
            cells.append(label(fit_h(Image.open(R('bassoon-cap.png')).convert('RGB'), H), 'render: cap'))
        cells.append(label(fit_h(ref('bassoon-001.jpg'), H), 'ref: bell (CC BY 2.0)'))
        if have('bassoon-bell.png'):
            cells.append(label(fit_h(Image.open(R('bassoon-bell.png')).convert('RGB'), H), 'render: bell'))
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
