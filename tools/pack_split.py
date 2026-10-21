"""Pack a .glb for the game in the split format (assets/<name>.json + <name>_bin*.json parts +
<name>_tex*.jpg). The geometry goes in base64 parts under ~12 MB each (the host's file size limit).

    python3 tools/pack_split.py path/to/model.glb assets/suit2
"""
import base64, json, os, struct, sys

PART = 12_000_000

def main(src, out_base):
    b = open(src, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    BIN = b[off + 8:off + 8 + bl]
    views = j['bufferViews']
    data = lambda v: BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    d, name = os.path.dirname(out_base), os.path.basename(out_base)
    for i, img in enumerate(j.get('images', [])):
        if 'bufferView' not in img: continue
        fn = f'{name}_tex{i}.jpg'
        open(os.path.join(d, fn), 'wb').write(data(views[img['bufferView']]))
        img.pop('bufferView'); img.pop('mimeType', None); img['uri'] = fn
    used = sorted({a['bufferView'] for a in j['accessors'] if 'bufferView' in a})
    nb = bytearray(); remap = {}; nv = []
    for i in used:
        v = dict(views[i]); dd = data(views[i])
        while len(nb) % 4: nb.append(0)
        v['byteOffset'] = len(nb); nb += dd; v['buffer'] = 0; remap[i] = len(nv); nv.append(v)
    j['bufferViews'] = nv
    for a in j['accessors']:
        if 'bufferView' in a: a['bufferView'] = remap[a['bufferView']]
    j['buffers'] = [{'byteLength': len(nb)}]
    b64 = base64.b64encode(bytes(nb)).decode()
    parts = []
    for k in range(0, len(b64), PART):
        fn = f'{name}_bin{len(parts)}.json'
        json.dump({'bin': b64[k:k + PART]}, open(os.path.join(d, fn), 'w'))
        parts.append(fn)
    json.dump({'gltf': j, 'binParts': parts}, open(out_base + '.json', 'w'), separators=(',', ':'))
    print(f'{out_base}.json + {len(parts)} geometry part(s), {len(b64) // 1024} KB, {len(j.get("images", []))} textures')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
