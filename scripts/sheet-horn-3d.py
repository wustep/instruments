"""The horn's 3D review sheet: each render beside a reference photograph at the same angle (art direction
§5): the player's side (the Besson BE702 from behind, its numbered drawing), the audience's side (the same
horn from the front, Yamaha's YHR-667V), the levers and the linkage close up, the mouthpiece, the bell.

  python3 scripts/sheet-horn-3d.py <renders dir> <out.jpg> [--refs .cache/refs-horn/photos] [--rows full,mech,details,play]

Renders come from scripts/shots-horn-3d.mjs (horn-<view>.png). The photographs are BenP's of a Besson
BE702 (CC BY 2.5), Hk kng's drawing of it (CC BY-SA 3.0), Yamaha Corporation's YHR-667V (CC BY-SA 4.0),
BenP's Denis Wick 7N mouthpiece (CC BY-SA 2.5) and Dba488's photograph of Karl Bradač playing (CC BY-SA
4.0): a sheet that includes them carries their licences, credited in the artifacts' README.
"""
import os
import sys

from PIL import Image, ImageDraw


def crop_to(im, pad=24):
    """a render cropped to the instrument: its brass and its silver, not the floor's pool"""
    w, h = im.size
    px = im.load()

    def hit(x, y):
        p = px[x, y]
        return (p[0] - p[2] > 60 and p[0] > 90) or sum(p) > 470

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


def flat(im):
    """a photograph with transparency, on white"""
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        return bg.convert('RGB')
    return im.convert('RGB')


def main():
    args = sys.argv[1:]
    src, out = args[0], args[1]
    refs = args[args.index('--refs') + 1] if '--refs' in args else '.cache/refs-horn/photos'
    rows_wanted = (args[args.index('--rows') + 1] if '--rows' in args else 'full,mech,details').split(',')
    R = lambda n: os.path.join(src, n)
    have = lambda n: os.path.exists(R(n))
    ref = lambda n: flat(Image.open(os.path.join(refs, n)))
    render = lambda v, crop=True: (crop_to if crop else (lambda x: x))(Image.open(R(f'horn-{v}.png')).convert('RGB'))
    rows = []
    if 'full' in rows_wanted:
        H = 520
        cells = [label(fit_h(ref('horn-besson-be702-back.png'), H), 'ref: Besson BE702, player side (CC BY 2.5)')]
        for v in ['back', 'hero']:
            if have(f'horn-{v}.png'):
                cells.append(label(fit_h(render(v), H), f'render: {v}'))
        cells.append(label(fit_h(ref('horn-besson-be702-back-diagram.png'), H), 'ref: its drawing (CC BY-SA 3.0)'))
        rows.append(cells)
        cells = [label(fit_h(ref('horn-besson-be702-front.png'), H), 'ref: Besson BE702, audience side')]
        if have('horn-front.png'):
            cells.append(label(fit_h(render('front'), H), 'render: front'))
        cells.append(label(fit_h(ref('horn-yamaha-yhr667v-front.png'), H), 'ref: Yamaha YHR-667V (CC BY-SA 4.0)'))
        if have('horn-side.png'):
            cells.append(label(fit_h(render('side'), H), 'render: side'))
        rows.append(cells)
    if 'mech' in rows_wanted:
        H = 460
        back = ref('horn-besson-be702-back.png')
        cells = [label(fit_h(back.crop((60, 250, 330, 520)), H), 'ref: levers, linkage (Besson)')]
        for v in ['linkage', 'actuated-F-linkage', 'actuated-Bb-linkage', 'valves']:
            if have(f'horn-{v}.png'):
                cells.append(label(fit_h(render(v, False), H), f'render: {v}'))
        rows.append(cells)
        yam = ref('horn-yamaha-yhr667v-front.png')
        cells = [label(fit_h(yam.crop((1180, 380, 1589, 800)), H), 'ref: caps, spatulas (Yamaha)')]
        if have('horn-caps.png'):
            cells.append(label(fit_h(render('caps', False), H), 'render: caps'))
        front = ref('horn-besson-be702-front.png')
        cells.append(label(fit_h(front.crop((680, 230, 920, 520)), H), 'ref: caps, slides (Besson)'))
        rows.append(cells)
    if 'details' in rows_wanted:
        H = 420
        mp = ref('horn-mouthpiece-denis-wick-7n.jpg')
        cells = [label(fit_h(mp.crop((180, 0, 760, 1440)), H), 'ref: Denis Wick 7N (CC BY-SA 2.5)')]
        back = ref('horn-besson-be702-back.png')
        cells.append(label(fit_h(back.crop((0, 0, 260, 420)), H), 'ref: leadpipe, hand rest (Besson)'))
        if have('horn-leadpipe.png'):
            cells.append(label(fit_h(render('leadpipe', False), H), 'render: leadpipe'))
        yam = ref('horn-yamaha-yhr667v-front.png')
        cells.append(label(fit_h(yam.crop((0, 60, 700, 760)), H), 'ref: bell (Yamaha)'))
        if have('horn-rim.png'):
            cells.append(label(fit_h(render('rim', False), H), 'render: rim'))
        rows.append(cells)
    if 'play' in rows_wanted:
        H = 420
        cells = [label(fit_h(ref('horn-player-bradac.jpg'), H), 'ref: K. Bradač playing (CC BY-SA 4.0)'), label(fit_h(ref('horn-section.jpg'), H), 'ref: a horn section (CC BY 2.0)')]
        if have('horn-orchestra.png'):
            cells.append(label(fit_h(render('orchestra', False), H), 'render: orchestra'))
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
