"""Contact sheet: each instrument's reference photograph next to its renders (art direction §5).

  python3 scripts/contact-sheet.py <renders dir> <out.jpg> [--refs .cache/refs-3d] [--views hero,close] [--only cello,grand]

The renders are the review set from scripts/review-3d.mjs (<id>-<view>.png at 1440×900; the stage
area is cropped out of the page). Reference photos are matched by name (REFS below). The sheet is a
review aid: reference photographs stay out of the repository unless their licence allows it (the
sheets in artifacts/ use only CC0 / public-domain photographs, credited in their README).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

REFS = {
    'grand': ['grand-inside.jpg', 'grand-action-side.jpg'],
    'upright': ['upright-action-close.jpg'],
    'violin': ['violin-front.jpg'],
    'viola': ['viola-34.jpg'],
    'cello': ['cello-34.jpg', 'cello-front.jpg'],
    'flute': ['flute-side.jpg'],
    'trumpet': ['trumpet-side.jpg'],
}
# CC BY-SA references (allowed with --bysa: the sheet is then itself CC BY-SA, credited in its README)
BYSA = {'flute-side.jpg', 'trumpet-side.jpg'}
# only these (CC0 / public domain) may go into committed sheets
FREE = {'grand-inside.jpg', 'grand-action-side.jpg', 'upright-action-close.jpg', 'violin-front.jpg', 'viola-34.jpg', 'viola-front.jpg', 'cello-34.jpg', 'cello-front.jpg', 'violin-scroll.jpg'}


def main() -> None:
    args = sys.argv[1:]
    src, out = args[0], args[1]
    refs = args[args.index('--refs') + 1] if '--refs' in args else '.cache/refs-3d'
    views = (args[args.index('--views') + 1] if '--views' in args else 'hero,close').split(',')
    only = args[args.index('--only') + 1].split(',') if '--only' in args else list(REFS)
    free = '--free' in args
    bysa = '--bysa' in args
    H = 420
    rows = []
    for inst in only:
        tiles = []
        for r in REFS.get(inst, []):
            if free and r not in FREE and not (bysa and r in BYSA):
                continue
            p = os.path.join(refs, r)
            if os.path.exists(p):
                im = Image.open(p).convert('RGB')
                tiles.append((im.resize((max(1, int(im.width * H / im.height)), H)), 'reference: ' + r))
        for v in views:
            p = os.path.join(src, f'{inst}-{v}.png')
            if not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGB')
            s = im.width / 1440
            im = im.crop((0, int(128 * s), im.width, int(680 * s)))
            tiles.append((im.resize((int(im.width * H / im.height), H)), f'render: {v}'))
        if tiles:
            rows.append((inst, tiles))
    W = max(sum(t.width + 8 for t, _ in tiles) for _, tiles in rows)
    sheet = Image.new('RGB', (W + 8, len(rows) * (H + 30) + 8), (14, 13, 11))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 15)
    except OSError:
        font = ImageFont.load_default()
    y = 8
    for inst, tiles in rows:
        x = 8
        for t, label in tiles:
            sheet.paste(t, (x, y + 22))
            d.text((x, y + 3), f'{inst} · {label}', fill=(200, 190, 170), font=font)
            x += t.width + 8
        y += H + 30
    sheet.save(out, quality=85)
    print(out, sheet.size)


if __name__ == '__main__':
    main()
