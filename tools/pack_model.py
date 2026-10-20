"""Pack a .glb for the game: textures become separate .jpg files, the rest goes into a JSON
file with the binary data as base64 text. (The published page can't load data:/blob: URLs.)

    python3 tools/pack_model.py path/to/model.glb assets/suit
      -> assets/suit.json, assets/suit_tex0.jpg, assets/suit_tex1.jpg, ...
"""
import base64, io, json, os, struct, sys

def main(src, out_base, max_tex=1024):
    b = open(src, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    BIN = b[off + 8:off + 8 + bl]
    views = j['bufferViews']
    data = lambda v: BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    name = os.path.basename(out_base)
    for i, img in enumerate(j.get('images', [])):
        raw = data(views[img['bufferView']])
        try:
            from PIL import Image
            im = Image.open(io.BytesIO(raw)).convert('RGB')
            if im.size[0] > max_tex: im = im.resize((max_tex, max_tex), Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, 'JPEG', quality=88); raw = buf.getvalue()
        except ImportError:
            pass
        fn = f'{name}_tex{i}.jpg'
        open(os.path.join(os.path.dirname(out_base), fn), 'wb').write(raw)
        img.pop('bufferView'); img.pop('mimeType', None); img['uri'] = fn
    used = sorted({a['bufferView'] for a in j['accessors'] if 'bufferView' in a})
    nb = bytearray(); remap = {}; nv = []
    for i in used:
        v = dict(views[i]); d = data(views[i])
        while len(nb) % 4: nb.append(0)
        v['byteOffset'] = len(nb); nb += d; remap[i] = len(nv); nv.append(v)
    j['bufferViews'] = nv
    for a in j['accessors']:
        if 'bufferView' in a: a['bufferView'] = remap[a['bufferView']]
    j['buffers'] = [{'byteLength': len(nb)}]
    json.dump({'gltf': j, 'bin': base64.b64encode(bytes(nb)).decode()}, open(out_base + '.json', 'w'), separators=(',', ':'))
    print(f'{out_base}.json ({os.path.getsize(out_base + ".json") // 1024} KB) + {len(j.get("images", []))} textures')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
