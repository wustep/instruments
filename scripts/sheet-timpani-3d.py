"""The timpani's 3D review sheet: each render beside a reference photograph at about the same angle (art
direction §5): the set from the audience's side (Moreau1's Ludwig Professional set, public domain; Jorge
Royan's set in Munich, CC BY-SA 3.0), the player's side (Eric Pancer's Lefima set at the Utah Symphony,
CC BY 2.0), the mallets (ZooFari, public domain).

  python3 scripts/sheet-timpani-3d.py <renders dir> <out.jpg> [--refs .cache/refs-timpani]

Renders come from scripts/shots-timpani-3d.mjs (timpani-<view>.png); the photographs from Wikimedia Commons
(Special:FilePath, 1000 px), kept in .cache (never committed): a sheet that includes them carries their
licences, credited in the artifacts' README.
"""
import os
import sys

from PIL import Image, ImageDraw

ROWS = [
    ('timpani-hero.png', 'Ludwig_Professional_timpani_01.jpg', 'hero 3/4  |  Ludwig Professional (Moreau1, PD)'),
    ('timpani-front.png', 'Munich_-_A_standard_set_of_timpani_Percussion_-_5647.jpg', 'front  |  Munich set (J. Royan, CC BY-SA 3.0)'),
    ('timpani-player.png', 'Lefima_Timpani.jpg', 'player side  |  Lefima, Utah Symphony (E. Pancer, CC BY 2.0)'),
    ('timpani-mallets.png', 'Timpani_Mallets.JPG', 'mallets  |  (ZooFari, PD)'),
]


def fit_h(im, H):
    return im.resize((max(1, round(im.width * H / im.height)), H), Image.LANCZOS)


def main():
    src, out = sys.argv[1], sys.argv[2]
    refs = sys.argv[sys.argv.index('--refs') + 1] if '--refs' in sys.argv else '.cache/refs-timpani'
    H = 300
    rows = []
    for render, ref, text in ROWS:
        a = fit_h(Image.open(os.path.join(src, render)).convert('RGB'), H)
        rp = os.path.join(refs, ref)
        b = fit_h(Image.open(rp).convert('RGB'), H) if os.path.exists(rp) else Image.new('RGB', (400, H), (40, 40, 40))
        row = Image.new('RGB', (a.width + b.width + 8, H), (0, 0, 0))
        row.paste(a, (0, 0))
        row.paste(b, (a.width + 8, 0))
        d = ImageDraw.Draw(row)
        d.rectangle([0, 0, 8 + 6 * len(text), 16], fill=(0, 0, 0))
        d.text((4, 2), text, fill=(255, 255, 255))
        rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new('RGB', (W, sum(r.height + 6 for r in rows)), (0, 0, 0))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 6
    sheet.save(out, quality=82)


if __name__ == '__main__':
    main()
