import * as THREE from '../lib/three.js';

const COUNT = 90;

// Wind streaks that rush past when you fly fast. Purely visual.
export class SpeedLines {
  constructor(scene) {
    this.pts = Array.from({ length: COUNT }, () => new THREE.Vector3(0, -999, 0));
    this.positions = new Float32Array(COUNT * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.LineBasicMaterial({ color: 0xf6efe0, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this._dir = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._up = new THREE.Vector3();
  }

  spawn(p, pos, dir, near) {
    // Somewhere in a tube ahead of the player
    this._side.set(-dir.z, 0, dir.x).normalize();
    if (this._side.lengthSq() < 0.5) this._side.set(1, 0, 0);
    this._up.crossVectors(this._side, dir);
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 9;
    p.copy(pos)
      .addScaledVector(dir, near ? Math.random() * 40 - 5 : 25 + Math.random() * 20)
      .addScaledVector(this._side, Math.cos(a) * r)
      .addScaledVector(this._up, Math.sin(a) * r);
  }

  update(body, dt) {
    const speed = body.vel.length();
    const strength = THREE.MathUtils.smoothstep(speed, 22, 60);
    this.mat.opacity = strength * 0.55;
    this.lines.visible = strength > 0.01;
    if (!this.lines.visible) { this.reset = true; return; }

    this._dir.copy(body.vel).divideScalar(speed);
    const len = Math.min(6, speed * 0.06);
    for (let i = 0; i < COUNT; i++) {
      const p = this.pts[i];
      const rel = p.clone().sub(body.pos).dot(this._dir);
      if (this.reset || rel < -12 || p.distanceTo(body.pos) > 60) this.spawn(p, body.pos, this._dir, this.reset);
      const o = i * 6;
      this.positions[o] = p.x; this.positions[o + 1] = p.y; this.positions[o + 2] = p.z;
      this.positions[o + 3] = p.x - this._dir.x * len;
      this.positions[o + 4] = p.y - this._dir.y * len;
      this.positions[o + 5] = p.z - this._dir.z * len;
    }
    this.reset = false;
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
