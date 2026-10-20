import * as THREE from '../lib/three.js';

const TRAIL = 50;
const POOL = 6;

// Draws the evasion range: zone ring, launchers, missiles with smoke trails, flares, blasts.
export class MissileView {
  constructor(scene, system) {
    this.sys = system;
    this.scene = scene;

    // Zone ring on the ground
    const z = system.zone;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(z.radius - 3, z.radius, 96),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(z.center.x, 0.05, z.center.z);
    scene.add(ring);

    // Launchers: a base and a tilted tube
    const base = new THREE.MeshStandardMaterial({ color: 0x3d4238, roughness: 0.8, flatShading: true });
    const tube = new THREE.MeshStandardMaterial({ color: 0x59604f, roughness: 0.6, flatShading: true });
    for (const l of system.launchers) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(5, 1.5, 5), base);
      b.position.y = 0.75;
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 5), tube);
      t.position.set(0, 2.4, 0);
      t.rotation.x = -0.9;
      b.castShadow = t.castShadow = true;
      g.add(b, t);
      g.position.copy(l.pos);
      scene.add(g);
    }

    // Missile pool
    const body = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.5 });
    const tip = new THREE.MeshBasicMaterial({ color: 0xff3b2f });
    const flame = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = Array.from({ length: POOL }, () => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 8), body);
      m.rotation.x = Math.PI / 2;
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), tip);
      n.rotation.x = -Math.PI / 2;
      n.position.z = -1.35;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 8), flame);
      f.rotation.x = -Math.PI / 2;
      f.position.z = 1.7;
      g.add(m, n, f);
      g.visible = false;
      scene.add(g);
      const pts = Array.from({ length: TRAIL }, () => new THREE.Vector3());
      const pos = new Float32Array(TRAIL * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdedad0, transparent: true, opacity: 0.55, depthWrite: false }));
      trail.frustumCulled = false;
      trail.visible = false;
      scene.add(trail);
      return { g, trail, pts, pos, missile: null, fade: 0 };
    });

    // Flares
    this.flareMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flareMeshes = Array.from({ length: 16 }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), this.flareMat);
      m.visible = false;
      scene.add(m);
      return m;
    });

    // Blasts
    this.blastMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.blasts = Array.from({ length: 6 }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), this.blastMat.clone());
      m.visible = false;
      scene.add(m);
      return m;
    });
    this.trailTimer = 0;
  }

  update(dt, time) {
    const s = this.sys;
    this.trailTimer -= dt;
    const sample = this.trailTimer <= 0;
    if (sample) this.trailTimer = 0.03;

    // Hand out pool slots to live missiles
    for (const slot of this.pool) if (slot.missile && !slot.missile.alive) { slot.missile = null; slot.fade = 1.5; }
    for (const m of s.missiles) {
      if (this.pool.some((p) => p.missile === m)) continue;
      const free = this.pool.find((p) => !p.missile && p.fade <= 0);
      if (free) { free.missile = m; free.pts.forEach((p) => p.copy(m.pos)); }
    }
    for (const slot of this.pool) {
      const m = slot.missile;
      slot.g.visible = !!m;
      if (m) {
        slot.g.position.copy(m.pos);
        slot.g.lookAt(m.pos.clone().sub(m.vel));
        if (sample) { const last = slot.pts.pop(); slot.pts.unshift(last.copy(m.pos)); }
        slot.trail.visible = true;
        slot.trail.material.opacity = 0.55;
      } else if (slot.fade > 0) {
        slot.fade -= dt;
        slot.trail.material.opacity = Math.max(0, slot.fade / 1.5) * 0.55;
        slot.trail.visible = slot.fade > 0;
      }
      slot.pts.forEach((p, i) => { slot.pos[i * 3] = p.x; slot.pos[i * 3 + 1] = p.y; slot.pos[i * 3 + 2] = p.z; });
      slot.trail.geometry.attributes.position.needsUpdate = true;
    }

    this.flareMeshes.forEach((m, i) => {
      const f = s.flares[i];
      m.visible = !!f;
      if (f) { m.position.copy(f.pos); m.scale.setScalar(0.7 + Math.random() * 0.6); }
    });
    this.flareMat.opacity = 0.7 + Math.sin(time * 40) * 0.3;

    this.blasts.forEach((m, i) => {
      const e = s.explosions[i];
      m.visible = !!e;
      if (e) {
        m.position.copy(e.pos);
        m.scale.setScalar(1 + e.age * 14);
        m.material.opacity = Math.max(0, 1 - e.age * 1.6);
      }
    });
  }
}
