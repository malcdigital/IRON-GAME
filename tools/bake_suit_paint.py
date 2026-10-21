"""Bake the painterly suit texture (art.style 'paint') from the model's full-size colour and
normal textures (2048 px, pulled out of the original .glb):

    python3 tools/bake_suit_paint.py colour.png normal.png assets/suit_paint.jpg

- colours pulled to the suit's palette (ivory / navy / orange / gunmetal), smooth crisp edges
- the model's own fine detail (panel lines, grooves, bolts) kept on top of the flat colour
- ink lines where colours meet and along the panel grooves
- small bright highlights on raised edges (from the normal map)
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

PAL = np.array([[36, 44, 72], [250, 243, 228], [244, 128, 36], [120, 126, 146]], float)   # navy, ivory, orange, gunmetal
FIND = np.array([[45, 47, 54], [249, 241, 223], [236, 127, 32], [117, 88, 65], [218, 196, 166], [158, 145, 130], [90, 92, 100]], float)
TO = [0, 1, 2, 0, 1, 3, 0]          # which painted colour each found colour becomes
INK = np.array([22, 20, 34], float)

def _box(a, k, axis):
    # running-sum box blur of width 2k+1 along one axis (edges clamped)
    pad = [(0, 0)] * a.ndim; pad[axis] = (k + 1, k)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * k + 1, 2 * k + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * k + 1)

def blur(a, r):
    # gaussian-like blur of radius r (three box passes)
    a = np.asarray(a, float)
    if r < 0.5: return a
    k = max(1, int(round(r * 0.9)))
    if r < 1.2:   # (small radius: a light 3-tap blur)
        w = r / 1.2 * 0.25
        for ax in (0, 1): a = a * (1 - 2 * w) + (np.roll(a, 1, ax) + np.roll(a, -1, ax)) * w
        return a
    for _ in range(3):
        a = _box(_box(a, k, 0), k, 1)
    return a

def main(col_path, nrm_path, out_path):
    src = Image.open(col_path).convert('RGB')
    a = np.asarray(src).astype(float)
    pre = np.asarray(src.filter(ImageFilter.MedianFilter(3))).astype(float)
    # soft vote per painted colour, smoothed, then the winner -> smooth, crisp shape edges
    d = ((pre[:, :, None, :] - FIND[None, None]) ** 2).sum(3)
    w = np.exp(-(d - d.min(2, keepdims=True)) / 900.0)
    votes = np.zeros(a.shape[:2] + (4,))
    for k, t in enumerate(TO): votes[:, :, t] += w[:, :, k]
    votes = np.stack([blur(votes[:, :, t], 2.2) for t in range(4)], 2)
    cls = votes.argmax(2).astype(np.uint8)
    cls = np.asarray(Image.fromarray(cls * 60).filter(ImageFilter.ModeFilter(5))) // 60
    cls = cls.clip(0, 3)
    out = PAL[cls]
    # keep the fine detail: high-pass of the original brightness, plus a little broad shading
    lum = a.mean(2)
    fine = lum - blur(lum, 5)
    broad = blur(lum, 8) - blur(lum, 40)
    gain = np.where(cls == 0, 0.55, 0.8)[:, :, None]   # (detail shows less on the dark navy)
    out = out + (fine * gain[:, :, 0])[:, :, None] * 0.9 + broad[:, :, None] * 0.18
    # ink: colour boundaries + the dark panel grooves in the original
    edge = np.zeros(cls.shape, bool)
    edge[:, 1:] |= cls[:, 1:] != cls[:, :-1]; edge[1:, :] |= cls[1:, :] != cls[:-1, :]
    e = blur(edge * 1.0, 0.7).clip(0, 1) * 1.6
    groove = (-(lum - blur(lum, 3))).clip(0, None) / 40.0       # thin dark lines in the original
    groove = np.where(cls == 0, groove * 0.4, groove)
    ink = (np.maximum(e, groove ** 1.2)).clip(0, 0.9)
    out = out * (1 - ink[:, :, None]) + INK * ink[:, :, None]
    # raised-edge highlights from the normal map (convex creases catch the light)
    n = np.asarray(Image.open(nrm_path).convert('RGB').resize(src.size)).astype(float) / 127.5 - 1
    div = np.gradient(n[:, :, 0], axis=1) - np.gradient(n[:, :, 1], axis=0)   # (glTF normal maps: +Y up, image rows go down)
    hi = blur(div.clip(0, None), 0.6)
    hi = ((hi - 0.06) / 0.12).clip(0, 1) * np.where(cls == 0, 0.15, 0.6)
    out = out + (np.array([255, 250, 240]) - out) * hi[:, :, None]
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(out_path, quality=92)

if __name__ == '__main__':
    main(*sys.argv[1:4])
