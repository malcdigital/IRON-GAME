import * as THREE from '../lib/three.js';

const MAX = 300;

// Sparks on impact, and from badly damaged parts.
export class Effects {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc070, size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -999;
  }

  burst(point, count, speed) {
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      this.pos[i * 3] = point.x; this.pos[i * 3 + 1] = point.y; this.pos[i * 3 + 2] = point.z;
      this.vel[i * 3] = (Math.random() - 0.5) * speed;
      this.vel[i * 3 + 1] = Math.random() * speed;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.life[i] = 0.4 + Math.random() * 0.5;
    }
  }

  // Damaged parts throw the odd spark
  emitFromDamage(suit, body, dt) {
    for (const c of suit.list) {
      const r = c.hp / c.maxHp;
      if (r < 0.3 && Math.random() < (0.3 - r) * 30 * dt) {
        const p = c.thruster ? c.thruster.pos.clone() : new THREE.Vector3(0, 0.3, 0);
        this.burst(body.pointToWorld(p), 3, 2);
      }
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.02, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
