"""Trace a bowed instrument's plate outline and f-hole from a front photograph on a plain background.

  python3 scripts/trace-outline.py .cache/refs-3d/cello-front.jpg [--debug out.png]

The photograph is for analysis only (it stays in .cache/); what comes out is a shape: the outline's
half-width at 241 stations along the body (u = 0 at the neck end, 1 at the tail; w as a fraction of
the body length, the two sides averaged) and the bass-side f-hole as a polygon (u, z) in the same
units (z positive towards the bass side, from the centre line). It prints them as JSON.

How: the instrument is separated from the background by its colour (a varnished body is far more
saturated, or far darker, than a grey backdrop); the body is the run of rows where the instrument is
wider than a third of its widest row; the edges are the outermost body pixels of each row. The
f-hole is the largest dark region inside the body on the bass side, above the bridge's feet, traced
around its boundary (Moore neighbourhood) and simplified (Douglas–Peucker).
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw


def mask_of(img: np.ndarray) -> np.ndarray:
    r, g, b = img[..., 0].astype(float), img[..., 1].astype(float), img[..., 2].astype(float)
    # the backdrop: its colour from the image's corners
    corners = np.concatenate([img[:40, :40].reshape(-1, 3), img[:40, -40:].reshape(-1, 3), img[-40:, :40].reshape(-1, 3), img[-40:, -40:].reshape(-1, 3)]).astype(float)
    bg = np.median(corners, axis=0)
    d = np.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2)
    sat = np.max(img, axis=2).astype(float) - np.min(img, axis=2).astype(float)
    return (d > 55) & ((sat > 38) | ((r + g + b) / 3 < bg.mean() * 0.68))


def trace(mask: np.ndarray, start: tuple[int, int]) -> list[tuple[int, int]]:
    """Moore-neighbour boundary trace (clockwise, Jacob's stopping rule) of the region at `start`,
    which must be its top-left pixel (row, col)."""
    nb = [(0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1)]  # W NW N NE E SE S SW
    fg = lambda p: 0 <= p[0] < mask.shape[0] and 0 <= p[1] < mask.shape[1] and bool(mask[p])
    s = start
    b0 = (s[0], s[1] - 1)
    c, b = s, b0
    out = [s]
    for _ in range(400000):
        ib = nb.index((b[0] - c[0], b[1] - c[1]))
        for k in range(1, 9):
            d = nb[(ib + k) % 8]
            n = (c[0] + d[0], c[1] + d[1])
            if fg(n):
                pd = nb[(ib + k - 1) % 8]
                b = (c[0] + pd[0], c[1] + pd[1])
                c = n
                break
        else:
            break
        if c == s and b == b0:
            break
        out.append(c)
    return out


def simplify(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    L = np.hypot(*ab) or 1e-9
    dmax, imax = 0.0, 0
    for i in range(1, len(pts) - 1):
        p = np.array(pts[i])
        d = abs(ab[0] * (a[1] - p[1]) - ab[1] * (a[0] - p[0])) / L
        if d > dmax:
            dmax, imax = d, i
    if dmax > eps:
        return simplify(pts[: imax + 1], eps)[:-1] + simplify(pts[imax:], eps)
    return [pts[0], pts[-1]]


def components(m: np.ndarray) -> np.ndarray:
    """4-connected labels (a small flood fill; the regions here are small)."""
    lab = np.zeros(m.shape, dtype=np.int32)
    n = 0
    ys, xs = np.nonzero(m)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        n += 1
        stack = [(y0, x0)]
        lab[y0, x0] = n
        while stack:
            y, x = stack.pop()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    stack.append((yy, xx))
    return lab


def main() -> None:
    path = sys.argv[1]
    debug = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
    im = Image.open(path).convert('RGB')
    img = np.asarray(im)
    H, W = img.shape[:2]
    m = mask_of(img)
    # per row: the run of instrument pixels through the centre line (gaps under 40 px closed: strings, the fingerboard's edges), so
    # specks on the backdrop and the shadow beside the instrument don't count
    cols = np.nonzero(m.sum(axis=0) > H * 0.05)[0]
    c0 = int(np.median(cols))
    left = np.full(H, -1)
    right = np.full(H, -1)
    for y in range(H):
        row = m[y]
        if not row[max(0, c0 - 30) : c0 + 30].any():
            continue
        xs = np.nonzero(row)[0]
        gaps = np.diff(xs)
        # walk out from the centre while the gaps stay small
        i = int(np.searchsorted(xs, c0))
        i = min(max(i, 0), len(xs) - 1)
        lo = hi = i
        while lo > 0 and gaps[lo - 1] < 40:
            lo -= 1
        while hi < len(xs) - 1 and gaps[hi] < 40:
            hi += 1
        left[y], right[y] = xs[lo], xs[hi]
    width = np.where(left >= 0, right - left, 0)
    widest = width.max()
    # body rows: where the run is mostly saturated (varnish), so the fingerboard above the body and
    # the shadow below it don't count
    satm = (np.max(img, axis=2).astype(float) - np.min(img, axis=2).astype(float)) > 38
    sat_w = np.array([int(satm[y, left[y] : right[y] + 1].sum()) if left[y] >= 0 else 0 for y in range(H)])
    body = np.nonzero(sat_w > widest / 3)[0]
    # the longest run of body rows
    runs, s0 = [], body[0]
    for a_, b_ in zip(body[:-1], body[1:]):
        if b_ != a_ + 1:
            runs.append((s0, a_))
            s0 = b_
    runs.append((s0, body[-1]))
    y0, y1 = max(runs, key=lambda r: r[1] - r[0])
    # out to the true top/bottom edge, where the plate's curve still shows
    while y0 > 0 and sat_w[y0 - 1] > widest * 0.12:
        y0 -= 1
    while y1 < H - 1 and sat_w[y1 + 1] > widest * 0.12:
        y1 += 1
    Lpx = y1 - y0
    centre = np.median((left[y0:y1] + right[y0:y1]) / 2)
    N = 480
    stations = []
    for i in range(N + 1):
        u = i / N
        y = int(round(y0 + u * Lpx))
        y = min(max(y, y0), y1)
        hw = (right[y] - left[y]) / 2
        stations.append([round(u, 5), round(float(hw / Lpx), 5)])
    # the bouts: the widest rows above and below the middle, the narrowest in the middle third
    hw = np.array([s[1] for s in stations])
    up = hw[: N // 2].max() * 2
    lo = hw[N // 2 :].max() * 2
    cb = hw[int(N * 0.35) : int(N * 0.65)].min() * 2
    # the f-hole on the bass side (the player's left = the photo's right for a front view? A front
    # photo shows the bass side on the left of the image)
    dark = np.zeros_like(m)
    lum = img.mean(axis=2)
    yA, yB = int(y0 + 0.4 * Lpx), int(y0 + 0.66 * Lpx)
    region = np.zeros_like(m)
    region[yA:yB, int(centre - 0.3 * Lpx) : int(centre - 0.02 * Lpx)] = True
    dark = region & (lum < np.percentile(lum[region], 7))
    # close small gaps (an eye joins the stem through a narrow, lighter neck): dilate 3 px, keep the
    # largest region, erode back, and keep only what was dark or lies inside the closed shape
    def shift_or(m: np.ndarray, r: int) -> np.ndarray:
        out = m.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dy * dy + dx * dx <= r * r:
                    out |= np.roll(np.roll(m, dy, 0), dx, 1)
        return out
    def shift_and(m: np.ndarray, r: int) -> np.ndarray:
        out = m.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if dy * dy + dx * dx <= r * r:
                    out &= np.roll(np.roll(m, dy, 0), dx, 1)
        return out
    best = None
    for rad in (0, 2, 3):
        grown = shift_or(dark, rad) if rad else dark
        lab = components(grown)
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        k = int(sizes.argmax())
        cand = shift_and(lab == k, rad) if rad else lab == k
        cy, cx = np.nonzero(cand)
        du = (cy.max() - cy.min()) / Lpx
        dz = (cx.max() - cx.min()) / Lpx
        # an f-hole is at most ~24 % of the body long and ~15 % wide; keep the largest that fits
        if du < 0.24 and dz < 0.15 and (best is None or cand.sum() > best.sum()):
            best = cand
    fh = best
    ys, xs = np.nonzero(fh)
    top = (int(ys.min()), int(xs[ys == ys.min()].min()))
    edge = trace(fh, top)
    pts = [((y - y0) / Lpx, (centre - x) / Lpx) for (y, x) in edge]
    # a closed curve: simplify the two halves between the first point and the one farthest from it
    far = int(np.argmax([np.hypot(a - pts[0][0], b - pts[0][1]) for a, b in pts]))
    pts = simplify(pts[: far + 1], 0.0005)[:-1] + simplify(pts[far:] + [pts[0]], 0.0005)[:-1]
    out = {
        'source': path.split('/')[-1],
        'bodyPx': int(Lpx),
        'rows': [int(y0), int(y1)],
        'bouts': {'upper': round(float(up), 4), 'c': round(float(cb), 4), 'lower': round(float(lo), 4)},
        'halfWidth': stations,
        'fhole': [[round(a, 5), round(b, 5)] for a, b in pts],
        'fholeBox': {'u': [round(float((ys.min() - y0) / Lpx), 4), round(float((ys.max() - y0) / Lpx), 4)], 'z': [round(float((centre - xs.max()) / Lpx), 4), round(float((centre - xs.min()) / Lpx), 4)]},
    }
    print(json.dumps(out))
    if debug:
        dbg = im.copy()
        d = ImageDraw.Draw(dbg)
        for u, w in stations:
            y = y0 + u * Lpx
            d.point([(centre - w * Lpx, y), (centre + w * Lpx, y)], fill=(0, 255, 0))
            d.ellipse([centre - w * Lpx - 3, y - 3, centre - w * Lpx + 3, y + 3], outline=(0, 255, 0))
            d.ellipse([centre + w * Lpx - 3, y - 3, centre + w * Lpx + 3, y + 3], outline=(0, 255, 0))
        d.line([(centre - z * Lpx, y0 + u * Lpx) for u, z in pts], fill=(255, 0, 255), width=3)
        d.line([(centre, y0), (centre, y1)], fill=(0, 200, 255))
        dbg.save(debug)


if __name__ == '__main__':
    main()
