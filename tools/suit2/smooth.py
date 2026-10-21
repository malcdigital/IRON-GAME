import numpy as np, json, struct, sys
from glb import load, acc
from collections import defaultdict
ITER = int(sys.argv[1]) if len(sys.argv) > 1 else 10
j, BIN = load('clean.glb')
names = [m['name'] for m in j['materials']]
CLEAN = {'Armor_Ivory', 'Undersuit_Navy', 'Accent_Orange', 'Thruster_Graphite'}
moved = 0
for me in j['meshes']:
    for p in me['primitives']:
        if names[p['material']] not in CLEAN: continue
        ai = p['attributes']['POSITION']; pos = acc(j, BIN, ai).astype(np.float64)
        idx = acc(j, BIN, p['indices']).reshape(-1, 3)
        _, w, inv = np.unique(np.round(pos, 5), axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
        P = pos[w].copy(); t = inv[idx]
        ec = defaultdict(int)
        for a, b, c in t:
            for e in ((a, b), (b, c), (c, a)): ec[(min(e), max(e))] += 1
        nb = defaultdict(set)
        for (a, b), n in ec.items():
            if n == 1: nb[a].add(b); nb[b].add(a)
        vs = np.array([v for v, s in nb.items() if len(s) == 2])
        if not len(vs): continue
        n1 = np.array([sorted(nb[v])[0] for v in vs]); n2 = np.array([sorted(nb[v])[1] for v in vs])
        # Taubin smoothing along the edge loops (straightens zig-zags without shrinking)
        for _ in range(ITER):
            for lam in (0.5, -0.53):
                d = (P[n1] + P[n2]) * 0.5 - P[vs]
                P[vs] += lam * d
        newpos = P[inv].astype(np.float32)
        moved += len(vs)
        a = j['accessors'][ai]; v = j['bufferViews'][a['bufferView']]
        o = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride', 0) or 12
        raw = newpos.tobytes()
        for i in range(len(newpos)): BIN[o + i * st:o + i * st + 12] = raw[i * 12:i * 12 + 12]
        a['min'] = newpos.min(0).tolist(); a['max'] = newpos.max(0).tolist()
print('edge vertices smoothed', moved)
js = json.dumps(j).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
open('smooth.glb', 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(BIN)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(BIN), 0x004E4942) + bytes(BIN))
