"""
Original background music for the LastMinute videos, synthesised from scratch
(no samples, no licensing issues).

usage: python3 videos/music.py <out.wav> <seconds> <mood: pitch|reel|partner>
"""
import sys
import wave

import numpy as np

SR = 44100
out, seconds, mood = sys.argv[1], float(sys.argv[2]), sys.argv[3]

STYLE = {
    # bpm, key root (MIDI), progression (scale degrees), drum intensity, arp density
    'pitch': dict(bpm=96, root=57, prog=[0, 5, 3, 4], drums=0.55, arp=2, bright=0.6),   # A minor-ish, calm & confident
    'reel': dict(bpm=118, root=60, prog=[0, 4, 5, 3], drums=1.0, arp=4, bright=1.0),     # C major, punchy
    'partner': dict(bpm=104, root=62, prog=[0, 3, 4, 0], drums=0.75, arp=3, bright=0.8),  # D major, warm
}[mood]

MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
scale = MINOR if mood == 'pitch' else MAJOR

n = int(SR * seconds)
t = np.arange(n) / SR
mix = np.zeros((n, 2))
beat = 60 / STYLE['bpm']
bar = beat * 4

hz = lambda m: 440 * 2 ** ((m - 69) / 12)


def chord(deg):
    notes = []
    for k in (0, 2, 4):
        idx = deg + k
        notes.append(STYLE['root'] + scale[idx % 7] + 12 * (idx // 7))
    return notes


def env(length, a=0.01, d=0.2, s=0.6, r=0.3):
    e = np.ones(length)
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A, D = min(A, length), min(D, max(0, length - A))
    e[:A] = np.linspace(0, 1, A, endpoint=False) if A else e[:A]
    e[A:A + D] = np.linspace(1, s, D, endpoint=False) if D else e[A:A + D]
    e[A + D:] = s
    if R and length > R:
        e[-R:] *= np.linspace(1, 0, R)
    return e


def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= n:
        return
    sig = sig[: n - i]
    mix[i:i + len(sig), 0] += sig * gain * (1 - max(0, pan))
    mix[i:i + len(sig), 1] += sig * gain * (1 + min(0, pan))


rng = np.random.default_rng(7)
bars = int(np.ceil(seconds / bar)) + 1
for b in range(bars):
    t0 = b * bar
    notes = chord(STYLE['prog'][b % len(STYLE['prog'])])
    # warm pad: detuned sines with soft attack
    L = int(bar * SR)
    tt = np.arange(L) / SR
    pad = sum(np.sin(2 * np.pi * hz(m) * (1 + det) * tt) for m in notes for det in (-0.003, 0.003)) / 6
    add(pad * env(L, a=0.4, d=0.5, s=0.8, r=0.5), t0, gain=0.18)
    # bass on beats 1 and 3
    for k in (0, 2):
        L2 = int(beat * 1.6 * SR)
        tt2 = np.arange(L2) / SR
        f = hz(notes[0] - 24)
        bass = np.sin(2 * np.pi * f * tt2) + 0.3 * np.sin(4 * np.pi * f * tt2)
        add(bass * env(L2, a=0.005, d=0.3, s=0.4, r=0.2), t0 + k * beat, gain=0.22)
    # plucked arpeggio
    steps = STYLE['arp'] * 4
    for s in range(steps):
        m = notes[s % 3] + 12 * (1 if (s // 3) % 2 else 0) + 12
        L3 = int(0.45 * SR)
        tt3 = np.arange(L3) / SR
        f = hz(m)
        pl = (np.sin(2 * np.pi * f * tt3) + STYLE['bright'] * 0.35 * np.sin(4 * np.pi * f * tt3) + 0.15 * np.sin(6 * np.pi * f * tt3)) * np.exp(-tt3 * 9)
        add(pl, t0 + s * bar / steps, pan=0.35 if s % 2 else -0.35, gain=0.11)
    # drums
    if b >= 1:
        for k in range(4):
            # kick
            L4 = int(0.35 * SR)
            tt4 = np.arange(L4) / SR
            kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-tt4 * 25)) * tt4) * np.exp(-tt4 * 9)
            if k in (0, 2) or STYLE['drums'] > 0.9:
                add(kick, t0 + k * beat, gain=0.55 * STYLE['drums'])
            # clap / snare on 2 and 4
            if k in (1, 3):
                L5 = int(0.2 * SR)
                noise = rng.standard_normal(L5) * np.exp(-np.arange(L5) / SR * 22)
                noise = np.convolve(noise, np.ones(3) / 3, mode='same')
                add(noise, t0 + k * beat, gain=0.13 * STYLE['drums'])
            # hats on off-beats
            for h in (0.5,):
                L6 = int(0.05 * SR)
                hat = np.diff(rng.standard_normal(L6 + 1)) * np.exp(-np.arange(L6) / SR * 80)
                add(hat, t0 + (k + h) * beat, pan=0.2, gain=0.06 * STYLE['drums'])

# master: gentle fade in/out, soft clip, normalise to -3 dBFS
fade = np.ones(n)
fi, fo = int(1.5 * SR), int(3 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade[:, None]
mix = np.tanh(mix * 1.4)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 10 ** (-3 / 20)

with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'wrote {out}: {seconds:.1f}s {mood}')
