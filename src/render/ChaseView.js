import * as THREE from '../lib/three.js';

const TRAIL = 40;

// The chase drone: a dark quad-rotor with a blinking light, a red trail,
// and a light beam over its start point while it waits.
export class ChaseView {
  constructor(scene, chase) {
    this.chase = chase;
    this.group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.5, metalness: 0.6, flatShading: true });
    this.light = new THREE.MeshBasicMaterial({ color: 0xff3b2f });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.6), dark);
    body.castShadow = true;
    this.group.add(body);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), dark);
      arm.position.set(x * 0.7, 0, z * 0.7);
      arm.rotation.y = x * z > 0 ? Math.PI / 4 : -Math.PI / 4;
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 14),
        new THREE.MeshBasicMaterial({ color: 0x9aa3a8, transparent: true, opacity: 0.35 }));
      rotor.position.set(x * 1.0, 0.2, z * 1.0);
      this.group.add(arm, rotor);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), this.light);
    eye.position.set(0, 0, -0.85);
    this.group.add(eye);
    scene.add(this.group);

    // Beacon over the start point
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 160, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    );
    scene.add(this.beacon);

    // Trail
    this.trailPts = Array.from({ length: TRAIL }, () => chase.pos.clone());
    this.trailPos = new Float32Array(TRAIL * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff5b3a, transparent: true, opacity: 0.7 }));
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.trailTimer = 0;
  }

  update(dt, time) {
    const c = this.chase;
    this.group.position.copy(c.pos);
    if (c.dir.lengthSq() > 0) this.group.lookAt(c.pos.clone().sub(c.dir));
    this.group.rotateZ(Math.sin(time * 3) * 0.08);
    this.light.color.setHex(Math.sin(time * 10) > 0 ? 0xff3b2f : 0x401010);

    this.beacon.visible = c.state === 'idle';
    this.beacon.position.set(c.pos.x, 80, c.pos.z);
    this.beacon.material.opacity = 0.12 + Math.sin(time * 3) * 0.06;

    this.trail.visible = c.state === 'running';
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.04;
      this.trailPts.pop();
      this.trailPts.unshift(c.pos.clone());
    }
    this.trailPts.forEach((p, i) => { this.trailPos[i * 3] = p.x; this.trailPos[i * 3 + 1] = p.y; this.trailPos[i * 3 + 2] = p.z; });
    this.trail.geometry.attributes.position.needsUpdate = true;
  }
}
