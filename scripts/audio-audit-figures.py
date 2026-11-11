#!/usr/bin/env python3
# The audio audit's figures (needs numpy and matplotlib):
#  * clicks-closeup.png: for each before/after clip (scripts/render-audio-audit.ts), the event where the
#    old engine's one-sample step stands highest over the tone's own steps, ±3 ms, sample by sample,
#    before (top) and after (bottom) on one scale, with the ratio printed
#  * levels.png: each Orchestra voice's loudness at its centre (scripts/audio-levels.ts), ff and mf (the
#    audit leaves the balance as it is; this is the measurement its NOTES.md discusses)
#   python3 scripts/audio-audit-figures.py <clips dir> <levels.json> <out dir>
import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

CLIPS, LV, OUT = sys.argv[1:4]
BLUE, ORANGE = '#2a78d6', '#eb6834'
INK, INK2, GRID, SURF = '#0b0b0b', '#52514e', '#e4e3df', '#fcfcfb'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 9, 'axes.edgecolor': INK2, 'axes.labelcolor': INK2,
                     'xtick.color': INK2, 'ytick.color': INK2, 'axes.facecolor': SURF, 'figure.facecolor': SURF})

def load(path):
    b = open(path, 'rb').read()
    fmt = int.from_bytes(b[20:22], 'little'); ch = int.from_bytes(b[22:24], 'little')
    fs = int.from_bytes(b[24:28], 'little')
    i = 12
    while i < len(b):
        cid = b[i:i + 4]; sz = int.from_bytes(b[i + 4:i + 8], 'little')
        if cid == b'data':
            d = b[i + 8:i + 8 + sz]; break
        i += 8 + sz
    x = np.frombuffer(d, dtype=np.float32 if fmt == 3 else np.int16).astype(np.float64)
    if fmt != 3: x /= 32768
    return fs, x.reshape(-1, ch).T[0]

def ratio(x, fs, t):
    c = int(round(t * fs))
    j = np.max(np.abs(np.diff(x[c - int(0.0002 * fs) - 1:c + int(0.0003 * fs)])))
    g, w = int(0.002 * fs), int(0.05 * fs)
    d = np.abs(np.diff(x[max(0, c - w - 1):c + w]))
    idx = np.arange(len(d)) + max(0, c - w)
    ref = np.quantile(d[np.abs(idx - c) > g], 0.99)
    return j / max(ref, 1e-9)

clips = json.load(open(f'{CLIPS}/clips.json'))
fig, axes = plt.subplots(2, len(clips), figsize=(2.6 * len(clips), 4.4), squeeze=False)
for k, c in enumerate(clips):
    fs, xb = load(f"{CLIPS}/{c['name']}-before.wav")
    _, xa = load(f"{CLIPS}/{c['name']}-after.wav")
    evs = [e['t'] for e in c['events'] if e['type'] in ('noteOn', 'control')]
    worst = max(evs, key=lambda t: ratio(xb, fs, t))
    a, b = int((worst - 0.003) * fs), int((worst + 0.003) * fs)
    tt = (np.arange(a, b) / fs - worst) * 1000
    lim = 1.1 * max(np.max(np.abs(xb[a:b])), np.max(np.abs(xa[a:b])))
    for row, (x, col, lab) in enumerate([(xb, BLUE, 'before'), (xa, ORANGE, 'after')]):
        ax = axes[row][k]
        ax.plot(tt, x[a:b], color=col, lw=1.2)
        ax.axvline(0, color=INK2, lw=0.6, ls=':')
        ax.set_ylim(-lim, lim)
        ax.grid(True, color=GRID, lw=0.6); ax.set_axisbelow(True)
        for s in ('top', 'right'): ax.spines[s].set_visible(False)
        ax.text(0.03, 0.95, f"{lab}: {ratio(x, fs, worst):.1f}×", transform=ax.transAxes, va='top', color=INK, fontsize=9)
        if row == 0: ax.set_title(c['name'] + (' (96 kHz)' if fs == 96000 else ''), fontsize=9, color=INK)
        if row == 1: ax.set_xlabel('ms from the event')
fig.suptitle('The worst step at an event over the tone\'s own steepest (99th percentile, ±50 ms)', fontsize=10, color=INK)
fig.tight_layout(); fig.savefig(f'{OUT}/clicks-closeup.png', dpi=110)

lv = json.load(open(LV))
voices = list(lv.keys())
fig, axes = plt.subplots(1, 2, figsize=(9, 4.6), sharey=True)
for ax, dyn in zip(axes, ['ff', 'mf']):
    y = np.arange(len(voices))[::-1]
    xs = [lv[v][dyn] for v in voices]
    ax.hlines(y, min(xs) - 2, xs, color=GRID, lw=1, zorder=1)
    ax.scatter(xs, y, s=64, color=BLUE, edgecolor=SURF, linewidth=2, zorder=3)
    for i, v in enumerate(voices):
        if v in ('trombone', 'trumpet', 'timpani', 'bass', 'cello'):
            ax.text(xs[i] + 0.8, y[i], f"{xs[i]:.1f}", va='center', color=INK, fontsize=8)
    ax.set_yticks(y); ax.set_yticklabels(voices)
    ax.set_xlim(min(xs) - 2, max(xs) + 5)
    ax.set_title(f'{dyn}: held notes at each voice\'s centre ±7 semitones (LUFS)', fontsize=9, color=INK)
    ax.grid(True, axis='x', color=GRID, lw=0.6); ax.set_axisbelow(True)
    for s_ in ('top', 'right', 'left'): ax.spines[s_].set_visible(False)
fig.suptitle('Each Orchestra voice alone, room on (each fitted to its own recording session\'s level; unchanged)', fontsize=10, color=INK)
fig.tight_layout(); fig.savefig(f'{OUT}/levels.png', dpi=110)
print(f'{OUT}/clicks-closeup.png', f'{OUT}/levels.png')
