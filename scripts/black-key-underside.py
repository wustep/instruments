#!/usr/bin/env python3
"""A geometry view of one piano key from below (not the app's renderer): its key top and stick as
dumped by scripts/black-key-mesh.ts, z-buffered, each face lit by its own normal (as the stage lights
a face) in its material's colour. Where the eye sees a face from its inside (into a shell left open),
the face is drawn magenta, so a missing face shows as a hole.

  python3 scripts/black-key-underside.py key.json out.png [title]
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

W, H = 960, 600


def look(eye, at):
    f = np.array(at, float) - eye
    f /= np.linalg.norm(f)
    r = np.cross(f, [0.0, 1.0, 0.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, f)
    return r, u, f


def render(path, out, title=''):
    d = json.load(open(path))
    v = np.array(d['v'], float).reshape(-1, 3, 9)
    xc = d['xc']
    # below the key's front, a little to its side, looking up at the sharp's foot
    eye = np.array([xc + 0.035, 0.676, -0.01])
    r, u, f = look(eye, [xc, 0.723, 0.085])
    foc = 1 / np.tan(np.radians(19) / 2) * H / 2
    zb = np.full((H, W), np.inf)
    img = np.zeros((H, W, 3))
    img[:] = (0.11, 0.105, 0.1)
    light = np.array([0.3, -0.8, -0.5])
    light /= np.linalg.norm(light)
    for t in v:
        P = t[:, :3] - eye
        cam = np.stack([P @ r, P @ u, P @ f], 1)
        if np.any(cam[:, 2] < 0.005):
            continue
        sx = W / 2 + foc * cam[:, 0] / cam[:, 2]
        sy = H / 2 - foc * cam[:, 1] / cam[:, 2]
        n = t[:, 3:6].mean(0)
        n /= np.linalg.norm(n) or 1
        # seen from inside as the stage decides it: the face wound to its normals (three3d.ts), then
        # its winding against the eye
        g = np.cross(t[1, :3] - t[0, :3], t[2, :3] - t[0, :3])
        if np.dot(g, t[:, 3:6].sum(0)) < 0:
            g = -g
        inside = np.dot(g, eye - t[0, :3]) < 0
        col = t[0, 6:9]
        if inside:
            shade = np.array([0.85, 0.1, 0.75])
        else:
            shade = col * (0.35 + 0.65 * max(0.0, float(np.dot(n, light)))) + 0.04 * max(0.0, float(np.dot(n, -f)))
        x0, x1 = int(max(0, np.floor(sx.min()))), int(min(W - 1, np.ceil(sx.max())))
        y0, y1 = int(max(0, np.floor(sy.min()))), int(min(H - 1, np.ceil(sy.max())))
        if x0 > x1 or y0 > y1:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, bx, cx), (ay, by, cy) = sx, sy
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        w2 = 1 - w0 - w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not m.any():
            continue
        z = 1 / (w0 / cam[0, 2] + w1 / cam[1, 2] + w2 / cam[2, 2])
        # (a face seen from inside loses a tie at a silhouette's edge to the face in front of it)
        if inside:
            z = z + 0.0004
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        m &= z < sub
        sub[m] = z[m]
        img[y0:y1 + 1, x0:x1 + 1][m] = shade
    im = Image.fromarray((np.clip(img, 0, 1) ** (1 / 1.8) * 255).astype(np.uint8))
    if title:
        ImageDraw.Draw(im).text((14, 12), title, fill=(230, 225, 215))
    im.save(out)


if __name__ == '__main__':
    render(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
