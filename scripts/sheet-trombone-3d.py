"""The trombone's 3D review sheet: each render beside a reference photograph at the same angle (art direction
§5): the player's right side square on (Yamaha's YSL-882OR and YSL-620 tenors, the YBL-822G bass, the YSL-871
alto), the valve and its linkage close up (a Bach 42G's, a Rath R4's), the slide's crook, the inner slide's
braces, the mouthpiece, the bell, and players holding it.

  python3 scripts/sheet-trombone-3d.py <renders dir> <out.jpg> [--refs .cache/refs-trombone/photos] [--rows full,sizes,mech,details,play]

Renders come from scripts/shots-trombone-3d.mjs (trombone-<view>.png). The photographs are Yamaha
Corporation's product photographs (CC BY-SA 4.0) and the others listed in .cache/refs-trombone/SOURCES.md
(CC BY 4.0, CC BY-SA 3.0, public domain): a sheet that includes them carries their licences, credited in the
artifacts' README.
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
    refs = args[args.index('--refs') + 1] if '--refs' in args else '.cache/refs-trombone/photos'
    rows_wanted = (args[args.index('--rows') + 1] if '--rows' in args else 'full,sizes,mech,details,play').split(',')
    R = lambda n: os.path.join(src, n)
    have = lambda v: os.path.exists(R(f'trombone-{v}.png'))
    ref = lambda n: flat(Image.open(os.path.join(refs, n)))
    render = lambda v, crop=True: (crop_to if crop else (lambda x: x))(Image.open(R(f'trombone-{v}.png')).convert('RGB'))
    rows = []

    def row(H, items):
        cells = []
        for kind, what, text, *rest in items:
            if kind == 'ref':
                im = ref(what)
                if rest:
                    im = im.crop(rest[0])
                cells.append(label(fit_h(im, H), f'ref: {text}'))
            elif have(what):
                cells.append(label(fit_h(render(what, not rest or rest[0]), H), f'render: {text}'))
        if cells:
            rows.append(cells)

    if 'full' in rows_wanted:
        row(300, [('ref', 'tbn-yamaha-ysl882or-tenor-f-openwrap-side.jpg', 'Yamaha YSL-882OR, open-wrap F (CC BY-SA 4.0)'), ('render', 'side', 'side (tenor)')])
        row(360, [('render', 'hero', 'hero (the stage’s own view)'), ('render', 'left', 'the player’s left side'), ('render', 'front', 'into the bell')])
    if 'sizes' in rows_wanted:
        row(260, [('ref', 'tbn-yamaha-ysl871-alto-side.jpg', 'Yamaha YSL-871 alto', (0, 180, 1920, 760)), ('render', 'size-alto-side', 'alto, side'), ('ref', 'tbn-yamaha-ybl822g-bass-side.jpg', 'Yamaha YBL-822G bass'), ('render', 'size-bass-side', 'bass, side')])
        row(300, [('render', 'size-alto', 'alto'), ('render', 'size-tenor', 'tenor'), ('render', 'size-bass', 'bass'), ('render', 'actuated-bass', 'bass, D (both valves)')])
    if 'mech' in rows_wanted:
        row(420, [('ref', 'tbn-bach42g-rotary-valve-lever-bellbrace.jpg', 'Bach 42G valve, lever, link (CC BY 4.0)', (650, 600, 1527, 1500)), ('render', 'valve', 'valve', False), ('render', 'actuated-valve', 'valve, F side', False), ('render', 'linkage', 'linkage', False), ('ref', 'tbn-rath-r4-openwrap-valve-lever.jpg', 'Rath R4 lever (CC BY 4.0)', (250, 1500, 1150, 2350))])
    if 'details' in rows_wanted:
        row(320, [('ref', 'tbn-courtois-slide-crook.jpg', 'Courtois crook (CC BY 4.0)'), ('render', 'crook', 'crook, water key', False), ('ref', 'tbn-conn70h-inner-slide-braces-lock.jpg', 'Conn 70H slide braces (CC BY 4.0)'), ('render', 'slidetop', 'slide top', False)])
        row(320, [('ref', 'tbn-mouthpiece-schilke-51c4-side.jpg', 'mouthpiece (CC BY-SA 3.0)'), ('render', 'mouthpiece', 'mouthpiece', False), ('ref', 'tbn-bell-rim-kruspe-garland.jpg', 'bell rim (CC BY 4.0)'), ('render', 'rim', 'bell', False)])
    if 'play' in rows_wanted:
        row(340, [('ref', 'tbn-section-seated-usnavy-threequarter.jpg', 'a seated section (public domain)', (400, 300, 1920, 1280)), ('ref', 'tbn-player-standing-side-ksg9973.jpg', 'held (CC BY-SA 3.0)'), ('render', 'orchestra-air', 'Bach’s Air: alto, tenors, bass', False), ('render', 'actuated', 'C2: F valve, sixth position')])
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
