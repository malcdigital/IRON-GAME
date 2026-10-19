import * as THREE from '../lib/three.js';
import { concreteTexture, hazardTexture, padTexture, sheetMetalTexture, windowsTexture } from './textures.js';

const BUILDING_TINTS = [0xffffff, 0xd9d2c4, 0xc4ccd2, 0xe3d6c0, 0xb9bdb6];
const KIND_COLORS = { tower: 0x8e8a80, wall: 0x7d6e5c, block: 0x6f7570, junk: 0x8a5a3a, shed: 0xb0b4b4 };

// Draws the test range from World data.
export class WorldView {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildGround();
    this.buildBoxes();
    this.buildRings();
  }

  buildGround() {
    const size = this.world.range.groundSize;
    const tex = concreteTexture(size / 4);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    const pad = this.world.workshopPad;
    const padMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.radius * 2, pad.radius * 2),
      new THREE.MeshStandardMaterial({ map: padTexture('W'), roughness: 0.8 }),
    );
    padMesh.rotation.x = -Math.PI / 2;
    padMesh.position.copy(pad.pos).setY(0.02);
    padMesh.receiveShadow = true;
    this.group.add(padMesh);
  }

  buildBoxes() {
    const metal = sheetMetalTexture();
    const windows = windowsTexture();
    let bIndex = 0;
    let padLetter = 'A'.charCodeAt(0);
    for (const c of this.world.colliders) {
      const size = new THREE.Vector3().subVectors(c.max, c.min);
      let mat;
      if (c.kind === 'building') {
        const tex = windows.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.round(Math.max(size.x, size.z) / 6), Math.round(size.y / 4));
        mat = new THREE.MeshStandardMaterial({ map: tex, color: BUILDING_TINTS[bIndex++ % BUILDING_TINTS.length], roughness: 0.85 });
      } else if (c.kind === 'shed') {
        const tex = metal.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(size.x, size.z) / 4, size.y / 4);
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3 });
      } else {
        mat = new THREE.MeshStandardMaterial({ color: KIND_COLORS[c.kind] ?? 0x888888, roughness: 0.9, flatShading: true });
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
      mesh.position.copy(c.center);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);

      if (c.pad) {
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(size.x * 0.96, size.z * 0.96),
          new THREE.MeshStandardMaterial({ map: padTexture(String.fromCharCode(padLetter++)), roughness: 0.8 }),
        );
        top.rotation.x = -Math.PI / 2;
        top.position.set(c.center.x, c.max.y + 0.02, c.center.z);
        top.receiveShadow = true;
        this.group.add(top);
      }
      if (c.kind === 'tower') {
        // Hazard band near the top
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(size.x + 0.05, 0.6, size.z + 0.05),
          new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 }),
        );
        band.position.set(c.center.x, c.max.y - 0.5, c.center.z);
        this.group.add(band);
      }
    }
  }

  buildRings() {
    this.ringMeshes = this.world.rings.map((r) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.4 });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(r.radius, 0.16, 8, 40), mat);
      mesh.position.copy(r.center);
      // Torus faces +Z by default; turn it to face along the path
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.normal);
      this.group.add(mesh);
      return mesh;
    });
  }

  // Highlight the next ring
  update(course, time) {
    this.ringMeshes.forEach((m, i) => {
      const isNext = i === course.next;
      const done = course.running && i < course.next;
      m.material.color.setHex(done ? 0x55606b : isNext ? 0xffd27a : 0xf0a830);
      m.material.emissiveIntensity = isNext ? 0.8 + Math.sin(time * 6) * 0.3 : done ? 0 : 0.2;
      m.scale.setScalar(isNext ? 1 + Math.sin(time * 4) * 0.03 : 1);
    });
  }
}
