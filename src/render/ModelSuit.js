import * as THREE from '../lib/three.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// The 3D suit model, generated from the character sheet. Stored as assets/suit.json
// (the glTF description plus its geometry as base64 text) and assets/suit_*.jpg textures.
// The game decodes the geometry itself and loads the textures as plain image files, so it
// works on hosts that block data: and blob: addresses.
// It's one piece with a humanoid skeleton. The game still treats the suit as separate parts
// (for damage, heat and thrust), so the box parts are kept, hidden, for their flame positions,
// and damage/heat tint the whole model.

let cached = null;

function packGlb(gltf, bin) {
  const enc = new TextEncoder();
  let json = enc.encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.length % 4)) % 4, binPad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + json.length + jsonPad + 8 + bin.length + binPad;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, json.length + jsonPad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20); out.fill(0x20, 20 + json.length, 20 + json.length + jsonPad);
  const b = 20 + json.length + jsonPad;
  dv.setUint32(b, bin.length + binPad, true); dv.setUint32(b + 4, 0x004e4942, true);
  out.set(bin, b + 8);
  return out.buffer;
}

export function loadSuitModel(url) {
  if (!cached) {
    cached = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      const data = await res.json();
      const { gltf } = data;
      const base = url.slice(0, url.lastIndexOf('/') + 1);
      // the geometry is either inline (bin) or split across several files (binParts), each under the size limit
      let b64 = data.bin;
      if (data.binParts) {
        const parts = await Promise.all(data.binParts.map(async (f) => {
          const r = await fetch(base + f);
          if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
          return (await r.json()).bin;
        }));
        b64 = parts.join('');
      }
      const raw = atob(b64), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      gltf.buffers = [{ byteLength: bytes.length }];
      return new Promise((resolve, reject) => new GLTFLoader().parse(packGlb(gltf, bytes), base, resolve, reject));
    })();
  }
  return cached;
}

let gradient = null;
function toonGradient(steps) {
  if (gradient) return gradient;
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradient = new THREE.DataTexture(data, steps.length, 1);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

function toonFrom(m, cfg) {
  return new THREE.MeshToonMaterial({
    color: m.color, map: m.map,
    emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    normalMap: m.normalMap, normalScale: new THREE.Vector2(cfg.toonNormal, cfg.toonNormal),
    gradientMap: toonGradient(cfg.toonSteps),
    side: m.side,
  });
}

// Soft "anime key art" look: the model's own painted colours, a soft satin finish, and a warm
// rim light on the edges (like a low sunset sun catching the armour)
function animeFrom(m, cfg) {
  const n = m.clone();
  n.metalness = Math.min(n.metalness ?? 0, 0.15);
  n.metalnessMap = null;
  n.roughness = 0.55;
  n.roughnessMap = m.metalnessMap ?? m.roughnessMap;   // keep the panel detail in the shine
  if (n.normalScale) n.normalScale.setScalar(cfg.animeNormal ?? 0.7);
  const rim = cfg.rim;
  n.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: new THREE.Color(rim.color) };
    sh.uniforms.rimStrength = { value: rim.strength };
    sh.uniforms.rimPower = { value: rim.power };
    sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength, rimPower;\n' + sh.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      'totalEmissiveRadiance += rimColor * rimStrength * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), rimPower);\n#include <lights_fragment_begin>');
  };
  return n;
}

// Painterly anime look (matches the key art): the colours repainted as flat ivory / navy / orange
// shapes with ink lines (assets/suit_paint.jpg, baked from the model's own texture), soft two-tone
// shading (warm where the sun hits, cool lavender in shade), a crisp painted highlight, the warm
// sunset rim and a dark ink outline round the silhouette
const paintMaps = {};
function paintTexture(url, like, srgb) {
  if (!paintMaps[url]) {
    const t = paintMaps[url] = new THREE.TextureLoader().load(url);
    t.flipY = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  }
  const t = paintMaps[url];
  if (like) { t.wrapS = like.wrapS; t.wrapT = like.wrapT; t.channel = like.channel; }
  return t;
}
function paintGradient(cfg) {
  // dark to light across the terminator: shade colour, then a soft step up to the lit colour
  const n = 16, data = new Uint8Array(n * 4), sh = new THREE.Color(cfg.shade), li = new THREE.Color(cfg.lit);
  for (let i = 0; i < n; i++) {
    const t = THREE.MathUtils.smoothstep(i / (n - 1), cfg.step - cfg.soft, cfg.step + cfg.soft);
    const c = sh.clone().lerp(li, t);
    data.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4);
  }
  const g = new THREE.DataTexture(data, n, 1);
  g.minFilter = g.magFilter = THREE.LinearFilter;
  g.needsUpdate = true;
  return g;
}
function paintFrom(m, cfg) {
  const p = cfg.paint, rim = cfg.rim;
  const n = new THREE.MeshToonMaterial({
    color: m.color, map: paintTexture(p.map, m.map, true),
    emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity,
    normalMap: p.normalMap ? paintTexture(p.normalMap, m.normalMap, false) : m.normalMap, normalScale: new THREE.Vector2(p.normal, p.normal),
    gradientMap: paintGradient(p), side: m.side,
  });
  n.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      rimColor: { value: new THREE.Color(rim.color) }, rimStrength: { value: rim.strength }, rimPower: { value: rim.power },
      paintAmbient: { value: new THREE.Color(p.ambient) }, paintSpec: { value: p.spec }, paintSpecSize: { value: p.specSize },
    });
    sh.fragmentShader = 'uniform vec3 rimColor, paintAmbient; uniform float rimStrength, rimPower, paintSpec, paintSpecSize;\n' + sh.fragmentShader
      .replace('#include <lights_fragment_begin>',
        // rim: a soft painted band of warm light round the edges
        'float rimT = 1.0 - saturate(dot(normal, normalize(vViewPosition)));\n' +
        'totalEmissiveRadiance += rimColor * rimStrength * smoothstep(0.55, 0.85, pow(rimT, rimPower * 0.5));\n#include <lights_fragment_begin>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= paintAmbient;   // (cooler, softer fill so the two tones read)
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 H = normalize(directionalLights[0].direction + normalize(vViewPosition));
          float sp = dot(normal, H);
          totalEmissiveRadiance += directionalLights[0].color * paintSpec * smoothstep(paintSpecSize, paintSpecSize + 0.012, sp) * diffuseColor.rgb;
        }
        #endif`);
  };
  return n;
}

// Ink outline: a slightly fattened copy of the mesh drawn inside out in ink colour
function inkOutline(o, cfg, scale) {
  const ol = cfg.paint.outline;
  const mat = new THREE.MeshBasicMaterial({ color: ol.color, side: THREE.BackSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.olWidth = { value: ol.width * scale };
    sh.vertexShader = 'uniform float olWidth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * olWidth;');   // (pushed out before skinning, so it bends with the bones)
  };
  let hull;
  if (o.isSkinnedMesh) {
    hull = new THREE.SkinnedMesh(o.geometry, mat);
    hull.bind(o.skeleton, o.bindMatrix);
    hull.bindMode = o.bindMode;
  } else hull = new THREE.Mesh(o.geometry, mat);
  hull.position.copy(o.position); hull.quaternion.copy(o.quaternion); hull.scale.copy(o.scale);
  hull.frustumCulled = false;
  hull.name = o.name + '_ink';
  o.parent.add(hull);
}

// Colour lock: the suit's parts share one colour texture, and some of it bleeds the wrong colour
// onto a part (dark specks on the ivory, pale flakes on the navy). Each part keeps its own colour
// (key = the texture's colour for that part) and only takes the texture's light and dark, within lo..hi.
function colorLock(m, key, cfg) {
  const k = new THREE.Color(key);   // (sRGB hex -> linear, like the texture after decoding)
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.lockKey = { value: k };
    sh.uniforms.lockRange = { value: new THREE.Vector2(cfg.lo, cfg.hi) };
    sh.fragmentShader = 'uniform vec3 lockKey; uniform vec2 lockRange;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
      {
        float kl = dot(lockKey, vec3(0.2126, 0.7152, 0.0722));
        float sl = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = diffuse * lockKey * clamp(sl / max(kl, 1e-4), lockRange.x, lockRange.y);
      }
      #endif`);
  };
  m.customProgramCacheKey = () => 'lock' + key;
  m.needsUpdate = true;
}

// Rigid armour: the glTF blends each armour vertex across several bones, so plates bend and stretch like
// rubber. Lock them instead: a plate (a connected piece) that mostly follows one bone rides on that bone
// alone; a big shell spanning several bones keeps a sharpened blend (solid, bending only near the joint). Materials not listed (the undersuit) stay smoothly skinned.
function rigidArmour(o, cfg) {
  const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  if (!si || !sw) return;
  const n = pos.count, G = ['getX', 'getY', 'getZ', 'getW'];
  const W = (i, k) => sw[G[k]](i), B = (i, k) => si[G[k]](i);
  // weld by position (UV seams split vertices), then join along triangles into pieces
  const key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    if (!key.has(k)) key.set(k, key.size);
    weld[i] = key.get(k);
  }
  const par = new Int32Array(key.size).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const idx = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < idx.length; t += 3) {
    const a = find(weld[idx[t]]);
    par[find(weld[idx[t + 1]])] = a; par[find(weld[idx[t + 2]])] = a;
  }
  // each piece's total weight per bone
  const pieces = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(weld[i]);
    let p = pieces.get(r); if (!p) pieces.set(r, (p = { w: new Map(), n: 0 }));
    p.n++;
    for (let k = 0; k < 4; k++) { const w = W(i, k); if (w > 0) { const b = B(i, k); p.w.set(b, (p.w.get(b) ?? 0) + w); } }
  }
  for (const p of pieces.values()) {
    let best = -1, bw = 0, tot = 0;
    for (const [b, w] of p.w) { tot += w; if (w > bw) { bw = w; best = b; } }
    p.bone = (bw / tot >= cfg.share || p.n <= cfg.small) ? best : -1;   // (-1: lock point by point)
  }
  for (let i = 0; i < n; i++) {
    const b = pieces.get(find(weld[i])).bone;
    if (b >= 0) { si.setXYZW(i, b, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); continue; }
    // a shell across joints: sharpen its blend so most of it is solid and the bend squeezes into the joint
    const w = [0, 1, 2, 3].map((k) => W(i, k) ** cfg.sharpen), t = w[0] + w[1] + w[2] + w[3] || 1;
    sw.setXYZW(i, w[0] / t, w[1] / t, w[2] / t, w[3] / t);
  }
  si.needsUpdate = sw.needsUpdate = true;
}

// Fit the model to the suit's body: feet at the soles, facing -Z (the game's forward)
export function placeModel(gltf, cfg) {
  const model = gltf.scene;
  model.rotation.y = cfg.turn ?? Math.PI;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const h = box.max.y - box.min.y;
  const s = cfg.height / h;
  model.scale.multiplyScalar(s);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  model.position.y += cfg.feetY - box.min.y;
  const mats = [];
  const swapped = new Map();
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;   // skinned meshes can be culled wrongly
      if (cfg.paint && o.material) {
        if (!swapped.has(o.material)) swapped.set(o.material, paintFrom(o.material, cfg));
        o.material = swapped.get(o.material);
      } else if (cfg.anime && o.material) {
        if (!swapped.has(o.material)) swapped.set(o.material, animeFrom(o.material, cfg));
        o.material = swapped.get(o.material);
      } else if (cfg.toon && o.material) {
        // Cel look: lighting snaps into a few flat bands (like the character sheet)
        if (!swapped.has(o.material)) swapped.set(o.material, toonFrom(o.material, cfg));
        o.material = swapped.get(o.material);
      }
      const m = o.material;
      if (o.isSkinnedMesh && m && cfg.rigid?.mats?.includes(m.name)) rigidArmour(o, cfg.rigid);
      // per-material colour boost (multiplies the texture: e.g. lift the near-black navy undersuit)
      const t = m && cfg.tint?.[m.name];
      if (t && !m.userData.tinted) { m.color.multiply(new THREE.Color(...t)); m.userData.tinted = true; }
      const lock = m && cfg.colorLock?.mats?.[m.name];
      if (lock !== undefined && !m.userData.locked) { colorLock(m, lock, cfg.colorLock); m.userData.locked = true; }
      if (m && !mats.includes(m)) mats.push(m);
    }
  });
  if (cfg.paint?.outline?.width) {
    const meshes = [];
    model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      // outline width is in metres: convert to the mesh's own units
      o.geometry.computeBoundingBox();
      const gh = o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y, wb = new THREE.Box3().setFromObject(o);
      inkOutline(o, cfg, gh / Math.max(1e-6, wb.max.y - wb.min.y));
    }
  }
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // Back thruster pods (separated in Blender, pivot at their base mount)
  let pods = ['L', 'R'].map((s) => ({ side: s, pod: model.getObjectByName(`pod_${s}`), nozzle: model.getObjectByName(`pod_${s}_nozzle`) }))
    .filter((p) => p.pod && p.nozzle);
  if (cfg.pods === false) { for (const p of pods) p.pod.visible = false; pods = []; }
  return { model, mats, bones, pods };
}
