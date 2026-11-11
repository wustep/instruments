#!/usr/bin/env python3
# A look at one render of the audio audit (scripts/audio-audit.ts): the waveform, the high band the
# click detector reads (4th-order high-pass at 6 kHz) and a spectrogram, over a time window, with the
# detected clicks marked. Needs numpy and matplotlib.
#   python3 scripts/audio-plot.py out.png a.wav [b.wav …] [--t0 0] [--t1 2] [--title …] [--fmax 12000]
#       [--labels before,after] [--clicks audit.json:instrument:stimulus[,…]]
import json, sys, wave
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def read(path):
    with wave.open(path, 'rb') as w:
        n, ch, fs, sw = w.getnframes(), w.getnchannels(), w.getframerate(), w.getsampwidth()
        raw = w.readframes(n)
    return fs, raw, ch, sw

def load(path):
    # wave can't read float WAVs: parse the header ourselves
    b = open(path, 'rb').read()
    fmt = int.from_bytes(b[20:22], 'little'); ch = int.from_bytes(b[22:24], 'little')
    fs = int.from_bytes(b[24:28], 'little'); bits = int.from_bytes(b[34:36], 'little')
    i = 12
    while i < len(b):
        cid = b[i:i+4]; sz = int.from_bytes(b[i+4:i+8], 'little')
        if cid == b'data':
            d = b[i+8:i+8+sz]; break
        i += 8 + sz
    x = np.frombuffer(d, dtype=np.float32 if fmt == 3 else np.int16).astype(np.float64)
    if fmt != 3: x /= 32768
    return fs, x.reshape(-1, ch).T

def biquad(x, c):
    b0, b1, b2, a1, a2 = c
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        o = b0*v + b1*x1 + b2*x2 - a1*y1 - a2*y2
        x2, x1, y2, y1 = x1, v, y1, o; y[i] = o
    return y

def hp(x, fs, fc=6000):
    fc = min(fc, 0.25*fs)
    out = x
    for q in (0.5412, 1.3066):
        w = np.tan(np.pi*fc/fs); d = 1 + w/q + w*w
        out = biquad(out, [1/d, -2/d, 1/d, 2*(w*w-1)/d, (1-w/q+w*w)/d])
    return out

args = sys.argv[1:]
def opt(k, d):
    if k in args:
        i = args.index(k); v = args[i+1]; del args[i:i+2]; return v
    return d
t0 = float(opt('--t0', '0')); t1 = float(opt('--t1', '-1')); fmax = float(opt('--fmax', '12000'))
title = opt('--title', ''); labels = opt('--labels', ''); clk = opt('--clicks', '')
out, wavs = args[0], args[1:]
labels = labels.split(',') if labels else [w.split('/')[-1] for w in wavs]
clist = clk.split(',') if clk else [None]*len(wavs)
fig, axes = plt.subplots(3, len(wavs), figsize=(6.5*len(wavs), 7.5), squeeze=False, sharex='col')
for j, path in enumerate(wavs):
    fs, ch = load(path)
    a = int(t0*fs); b = ch.shape[1] if t1 < 0 else int(t1*fs)
    x = ch[:, a:b]; t = (np.arange(x.shape[1]) + a)/fs
    m = x.mean(0)
    axes[0][j].plot(t, x[0], lw=0.5, color='#335')
    axes[0][j].set_ylabel('amplitude'); axes[0][j].set_title(f'{labels[j]}' + (f' — {title}' if title else ''), fontsize=10)
    h = np.maximum(np.abs(hp(x[0], fs)), np.abs(hp(x[1], fs)))
    axes[1][j].plot(t, 20*np.log10(np.maximum(h, 1e-7)), lw=0.4, color='#a33')
    axes[1][j].set_ylabel('high band, dBFS'); axes[1][j].set_ylim(-100, 0)
    if clist[j]:
        f, inst, st = clist[j].split(':')
        for c in json.load(open(f))[inst][st].get('worstClicks', []):
            if t[0] <= c['t'] <= t[-1]:
                axes[1][j].axvline(c['t'], color='k', lw=0.6, ls=':')
    nfft = 1024 if fs <= 48000 else 2048
    axes[2][j].specgram(m + 1e-9*np.random.randn(len(m)), NFFT=nfft, Fs=fs, noverlap=nfft*7//8, xextent=(t[0], t[-1]), cmap='inferno', vmin=-140, scale='dB')
    axes[2][j].set_ylim(0, fmax); axes[2][j].set_ylabel('Hz'); axes[2][j].set_xlabel('s')
fig.tight_layout(); fig.savefig(out, dpi=110)
print(out)
