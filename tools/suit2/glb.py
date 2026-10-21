import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def load(p):
    b = open(p, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl]); off = 20 + jl; bl = struct.unpack('<I', b[off:off + 4])[0]
    return j, bytearray(b[off + 8:off + 8 + bl])
def acc(j, BIN, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); st = v.get('byteStride', 0) or dt.itemsize * n
    raw = np.frombuffer(bytes(BIN), dtype=np.uint8, count=st * (a['count'] - 1) + dt.itemsize * n, offset=o)
    arr = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], dt.itemsize * n), strides=(st, 1)).copy()
    return arr.view(dt).reshape(a['count'], n)
