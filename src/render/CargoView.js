import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// Draws the crates and highlights the one you can grab.
export class CargoView {
  constructor(scene, cargo) {
    this.cargo = cargo;
    const s = CONFIG.cargo.radius * 1.65;
    this.meshes = cargo.crates.map((c) => {
      const color = c.kind === 'engine' ? 0x4b5157 : 0x8a6236;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: c.kind === 'engine' ? 0.6 : 0, emissive: 0xf0a830, emissiveIntensity: 0, flatShading: true }),
      );
      m.castShadow = m.receiveShadow = true;
      if (c.kind === 'engine') {
        const top = new THREE.Mesh(new THREE.BoxGeometry(s * 0.7, s * 0.3, s * 0.4), m.material);
        top.position.y = s * 0.6;
        m.add(top);
      } else {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(s * 1.02, s * 0.12, s * 1.02), new THREE.MeshStandardMaterial({ color: 0xe8a623 }));
        m.add(strap);
      }
      scene.add(m);
      return m;
    });
  }

  update(time) {
    this.cargo.crates.forEach((c, i) => {
      const m = this.meshes[i];
      m.position.copy(c.pos);
      m.material.emissiveIntensity = c.inRange ? 0.25 + Math.sin(time * 8) * 0.15 : c.delivered ? 0.15 : 0;
    });
  }
}
