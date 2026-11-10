# NEXT5 item 3: put each before shot beside its after shot.
#   python3 scripts/pairs-phone.py <raw dir> <out dir>
# Reads <raw>/<name>-before.png and <raw>/<name>-after.png (scripts/shots-phone.mjs) and writes
# <out>/<name>.jpg: before left and after right for the whole phone, before over after for the keys
# close up. An after shot with no before (the strip slid, a piece playing) is saved on its own.
import sys
from pathlib import Path

from PIL import Image

raw, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
GROUND = (14, 13, 11)


def save(im, name):
    im.save(out / f'{name}.jpg', quality=86, optimize=True, progressive=True)
    print(name)


for a in sorted(raw.glob('*-after.png')):
    name = a.name[: -len('-after.png')]
    ia = Image.open(a).convert('RGB')
    b = raw / f'{name}-before.png'
    if not b.exists():
        w = 600 if ia.height > ia.width else 780
        save(ia.resize((w, round(ia.height * w / ia.width)), Image.LANCZOS), name)
        continue
    ib = Image.open(b).convert('RGB')
    if ib.height > ib.width:
        w = 600
        h = round(ib.height * w / ib.width)
        sheet = Image.new('RGB', (2 * w + 10, h), GROUND)
        sheet.paste(ib.resize((w, h), Image.LANCZOS), (0, 0))
        sheet.paste(ia.resize((w, round(ia.height * w / ia.width)), Image.LANCZOS), (w + 10, 0))
    else:
        w = 780
        hb = round(ib.height * w / ib.width)
        ha = round(ia.height * w / ia.width)
        sheet = Image.new('RGB', (w, hb + ha + 10), GROUND)
        sheet.paste(ib.resize((w, hb), Image.LANCZOS), (0, 0))
        sheet.paste(ia.resize((w, ha), Image.LANCZOS), (0, hb + 10))
    save(sheet, name)
