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
      const { gltf, bin } = await res.json();
      const raw = atob(bin), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      gltf.buffers = [{ byteLength: bytes.length }];
      const base = url.slice(0, url.lastIndexOf('/') + 1);
      return new Promise((resolve, reject) => new GLTFLoader().parse(packGlb(gltf, bytes), base, resolve, reject));
    })();
  }
  return cached;
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
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;   // skinned meshes can be culled wrongly
      const m = o.material;
      if (m && !mats.includes(m)) mats.push(m);
    }
  });
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  // Back thruster pods (separated in Blender, pivot at their base mount)
  const pods = ['L', 'R'].map((s) => ({ side: s, pod: model.getObjectByName(`pod_${s}`), nozzle: model.getObjectByName(`pod_${s}_nozzle`) }))
    .filter((p) => p.pod && p.nozzle);
  return { model, mats, bones, pods };
}
