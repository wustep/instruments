# Shrink stage screenshots for the repo: PNG (device pixels) -> JPEG q90 at half size.
#   python3 scripts/shots-compress.py artifacts/realistic-3d/shots
import sys
from pathlib import Path
from PIL import Image

d = Path(sys.argv[1])
for p in sorted(d.glob('*.png')):
    im = Image.open(p).convert('RGB')
    im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im.save(p.with_suffix('.jpg'), quality=90, optimize=True, progressive=True)
    p.unlink()
    print(p.with_suffix('.jpg').name)
