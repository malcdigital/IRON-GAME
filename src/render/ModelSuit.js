import * as THREE from '../lib/three.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// The 3D suit model (assets/suit.gltf.json: glTF with its data embedded, generated from the character sheet).
// It's one piece with a humanoid skeleton. The game still treats the suit as separate parts
// (for damage, heat and thrust), so the box parts are kept, hidden, for their flame positions,
// and damage/heat tint the whole model.

let cached = null;

export function loadSuitModel(url) {
  if (!cached) {
    cached = new Promise((resolve, reject) => {
      new GLTFLoader().load(url, (gltf) => resolve(gltf), undefined, reject);
    });
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
  return { model, mats, bones };
}
