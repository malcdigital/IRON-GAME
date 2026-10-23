import * as THREE from '../lib/three.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';

// Draws the streets (layout: src/world/streets.js): road markings, lamps with glowing heads,
// benches, trash cans, hydrants, parked cars, and traffic driving up and down the long streets.
// Everything repeated is instanced (one draw each), so hundreds of them cost little.

const CAR_COLOURS = [0xf4f1ea, 0x2d3440, 0xd8534a, 0x4f86c6, 0xe8b04a, 0x7fb48a, 0xc6c9ce, 0x9b6fb5, 0xf08a5d, 0x3f9e9a];

function colorize(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (g.index) g = g.toNonIndexed();
  return g;
}
const part = (geo, color, x, y, z) => colorize(geo.translate(x, y, z), color);

// A small car (4.3 m long along z, nose to -z): body (tinted per car), cabin, dark windows, wheels, lights
function carGeometry() {
  const parts = [
    part(new THREE.BoxGeometry(1.85, 0.62, 4.3), 0xffffff, 0, 0.55, 0),
    part(new THREE.BoxGeometry(1.6, 0.55, 2.2), 0xffffff, 0, 1.12, 0.25),
    part(new THREE.BoxGeometry(1.64, 0.4, 2.0), 0x1c2430, 0, 1.12, 0.25),   // (windows, a touch proud of the cabin)
    part(new THREE.BoxGeometry(1.5, 0.42, 0.06), 0x1c2430, 0, 1.12, -0.86),
    part(new THREE.BoxGeometry(1.5, 0.42, 0.06), 0x1c2430, 0, 1.12, 1.36),
    part(new THREE.BoxGeometry(0.4, 0.14, 0.05), 0xfff1c8, -0.6, 0.62, -2.16), part(new THREE.BoxGeometry(0.4, 0.14, 0.05), 0xfff1c8, 0.6, 0.62, -2.16),
    part(new THREE.BoxGeometry(0.4, 0.12, 0.05), 0xd8322a, -0.62, 0.66, 2.16), part(new THREE.BoxGeometry(0.4, 0.12, 0.05), 0xd8322a, 0.62, 0.66, 2.16),
  ];
  for (const [x, z] of [[-0.86, -1.35], [0.86, -1.35], [-0.86, 1.35], [0.86, 1.35]]) parts.push(part(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12).rotateZ(Math.PI / 2), 0x202226, x, 0.34, z));
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

export class StreetView {
  constructor(parent, world) {
    this.world = world;
    const S = world.streets;
    if (!S) return;
    this.group = new THREE.Group();
    parent.add(this.group);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const place = (mesh, i, x, y, z, ang = 0) => { mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(Y, ang), one)); };
    const inst = (geo, mat, list, y = 0, shadow = true) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => place(mesh, i, p[0], y, p[1], p[2] ?? 0));
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    // road markings (white crossings, warm yellow centre dashes), just above the asphalt
    if (S.paint.length) {
      const geos = S.paint.map(([x, z, w, d, k]) => part(new THREE.BoxGeometry(w, 0.012, d), k ? 0xf2d27a : 0xf6f4ee, x, 0.042, z));
      this.group.add(Object.assign(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })), { receiveShadow: true }));
    }
    // street lamps: a dark pole and arm, a glowing head out over the road
    const pole = mergeGeometries([
      part(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), 0x3a3f48, 0, 2.6, 0),
      part(new THREE.BoxGeometry(0.08, 0.08, 1.4), 0x3a3f48, 0, 5.1, 0.65),
      part(new THREE.CylinderGeometry(0.16, 0.2, 0.25, 8), 0x3a3f48, 0, 0.12, 0),
    ]);
    inst(pole, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), S.lamps);
    inst(new THREE.BoxGeometry(0.35, 0.14, 0.6).translate(0, 5.02, 1.3), new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd28a, emissiveIntensity: 2.2 }), S.lamps, 0, false);
    // benches (wood slats on dark legs), facing the road
    const bench = mergeGeometries([
      part(new THREE.BoxGeometry(1.8, 0.08, 0.5), 0xb07a4a, 0, 0.46, 0),
      part(new THREE.BoxGeometry(1.8, 0.4, 0.06), 0xb07a4a, 0, 0.75, -0.24),
      part(new THREE.BoxGeometry(0.08, 0.46, 0.5), 0x3a3f48, -0.8, 0.23, 0), part(new THREE.BoxGeometry(0.08, 0.46, 0.5), 0x3a3f48, 0.8, 0.23, 0),
    ]);
    inst(bench, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), S.benches);
    inst(new THREE.CylinderGeometry(0.28, 0.24, 0.95, 10).translate(0, 0.48, 0), new THREE.MeshStandardMaterial({ color: 0x4d6b5a, roughness: 0.6, metalness: 0.3 }), S.cans);
    const hyd = mergeGeometries([part(new THREE.CylinderGeometry(0.13, 0.16, 0.7, 10), 0xd8432f, 0, 0.35, 0), part(new THREE.SphereGeometry(0.14, 8, 6), 0xd8432f, 0, 0.72, 0), part(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6).rotateZ(Math.PI / 2), 0xd8432f, 0, 0.45, 0)]);
    inst(hyd, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), S.hydrants);
    // cars: parked along the curbs, and traffic
    const car = carGeometry(), carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
    const parked = inst(car, carMat, S.parked);
    if (parked) { S.parked.forEach((p, i) => parked.setColorAt(i, new THREE.Color(CAR_COLOURS[p[3] % CAR_COLOURS.length]))); parked.instanceColor.needsUpdate = true; }
    // traffic: a few cars per long street, each way, wrapping round at the ends
    this.traffic = [];
    let s = 99;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const L of S.lanes) {
      const n = Math.max(1, Math.round(L.len / 70));
      for (const dir of [1, -1]) for (let k = 0; k < n; k++) this.traffic.push({ L, dir, t: (k + rand() * 0.6) / n, speed: 9 + rand() * 5, col: CAR_COLOURS[Math.floor(rand() * CAR_COLOURS.length)] });
    }
    if (this.traffic.length) {
      this.moving = new THREE.InstancedMesh(car, carMat, this.traffic.length);
      this.traffic.forEach((c, i) => this.moving.setColorAt(i, new THREE.Color(c.col)));
      this.moving.instanceColor.needsUpdate = true;
      this.moving.castShadow = true; this.moving.receiveShadow = true;
      this.moving.frustumCulled = false;
      this.group.add(this.moving);
      this._m4 = m4; this._q = q; this._Y = Y; this._one = one; this._p = new THREE.Vector3();
      this.update(0);
    }
  }

  update(dt) {
    if (!this.moving) return;
    this.traffic.forEach((c, i) => {
      const L = c.L;
      c.t = (c.t + (c.speed * dt * c.dir) / L.len + 1) % 1;
      const along = L.ax === L.bx ? 'z' : 'x', off = (L.R ?? 5) * 0.45 * c.dir;   // (keep right: each way in its own lane)
      const x = L.ax + (L.bx - L.ax) * c.t + (along === 'z' ? -off : 0), z = L.az + (L.bz - L.az) * c.t + (along === 'x' ? off : 0);
      const ang = along === 'z' ? (c.dir > 0 ? Math.PI : 0) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      this.moving.setMatrixAt(i, this._m4.compose(this._p.set(x, 0, z), this._q.setFromAxisAngle(this._Y, ang), this._one));
    });
    this.moving.instanceMatrix.needsUpdate = true;
  }
}
