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
    // traffic (simulated in src/world/traffic.js): one instanced mesh, moved every frame
    this.traffic = world.traffic;
    if (this.traffic?.cars.length) {
      this.moving = new THREE.InstancedMesh(car, carMat, this.traffic.cars.length);
      this.traffic.cars.forEach((c, i) => this.moving.setColorAt(i, new THREE.Color(CAR_COLOURS[c.colour % CAR_COLOURS.length])));
      this.moving.instanceColor.needsUpdate = true;
      this.moving.castShadow = true; this.moving.receiveShadow = true;
      this.moving.frustumCulled = false;
      this.group.add(this.moving);
      // brake lights (red, bright while slowing or stopped) and turn signals (amber, blinking on the
      // side it's turning), riding on each car
      const lamp = (pts) => mergeGeometries(pts.map(([x, z]) => new THREE.BoxGeometry(0.42, 0.14, 0.06).translate(x, 0.66, z)));
      const mk = (geo) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), this.traffic.cars.length); m.frustumCulled = false; this.group.add(m); return m; };
      this.brake = mk(lamp([[-0.62, 2.19], [0.62, 2.19]]));
      this.blinkL = mk(lamp([[-0.86, -2.19], [-0.86, 2.2]]).scale(0.5, 1, 1).translate(-0.43, 0, 0));
      this.blinkR = mk(lamp([[0.86, -2.19], [0.86, 2.2]]).scale(0.5, 1, 1).translate(0.43, 0, 0));
      this.lampCol = { brakeOn: new THREE.Color(2.2, 0.02, 0.02), brakeOff: new THREE.Color(0.3, 0.02, 0.02), amberOn: new THREE.Color(2.6, 1.9, 0.15), amberOff: new THREE.Color(0.3, 0.2, 0.08) };
      this.blinkT = 0;
    }
    // traffic lights: a pole on each corner of every crossing, red / yellow / green lamps
    this.poles = [];
    for (const [ci, c] of (S.crossings ?? []).entries()) for (const [sx, sz] of c.corners ?? [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      this.poles.push({ ci, alongX: sx === sz, x: c.x + sx * (c.R + 0.9), z: c.z + sz * (c.R + 0.9), state: null });
    }
    if (this.poles.length) {
      const signal = mergeGeometries([
        part(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8), 0x2f343c, 0, 1.8, 0),
        part(new THREE.BoxGeometry(0.42, 1.15, 0.22), 0x22262c, 0, 3.95, 0),
        part(new THREE.BoxGeometry(0.56, 1.25, 0.06), 0x1a1d22, 0, 3.95, 0),
      ]);
      inst(signal, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 }), this.poles.map((p) => [p.x, p.z, p.alongX ? Math.PI / 2 : 0]));
      // the lamps poke out of both faces of the housing, so they show to traffic from either way
      this.lamps = ['red', 'yellow', 'green'].map((k, n) => {
        const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), this.poles.length);
        this.poles.forEach((p, i) => place(m, i, p.x, 4.33 - n * 0.37, p.z));
        m.instanceMatrix.needsUpdate = true;
        this.group.add(m);
        return m;
      });
      this.lampOn = { red: new THREE.Color(2.2, 0.25, 0.15), yellow: new THREE.Color(2.2, 1.5, 0.2), green: new THREE.Color(0.3, 2.2, 0.6) };
      this.lampOff = new THREE.Color(0.12, 0.12, 0.13);
    }
    this._m4 = m4; this._q = q; this._Y = Y; this._one = one; this._p = new THREE.Vector3();
    this.update(0);
  }

  update(dt) {
    if (this.moving) {
      this.blinkT += dt;
      const blinkOn = this.blinkT % 0.8 < 0.45, L = this.lampCol;
      this.traffic.cars.forEach((c, i) => {
        this._m4.compose(this._p.set(c.x, 0, c.z), this._q.setFromAxisAngle(this._Y, c.angle), this._one);
        for (const m of [this.moving, this.brake, this.blinkL, this.blinkR]) m.setMatrixAt(i, this._m4);
        this.brake.setColorAt(i, c.braking ? L.brakeOn : L.brakeOff);
        this.blinkL.setColorAt(i, c.signal === 'L' && blinkOn ? L.amberOn : L.amberOff);
        this.blinkR.setColorAt(i, c.signal === 'R' && blinkOn ? L.amberOn : L.amberOff);
      });
      for (const m of [this.moving, this.brake, this.blinkL, this.blinkR]) m.instanceMatrix.needsUpdate = true;
      for (const m of [this.brake, this.blinkL, this.blinkR]) m.instanceColor.needsUpdate = true;
    }
    if (this.lamps && this.traffic) {
      let changed = false;
      this.poles.forEach((p, i) => {
        const st = this.traffic.light(p.ci, p.alongX);
        if (st === p.state) return;
        p.state = st; changed = true;
        ['red', 'yellow', 'green'].forEach((k, n) => this.lamps[n].setColorAt(i, k === st ? this.lampOn[k] : this.lampOff));
      });
      if (changed) for (const m of this.lamps) m.instanceColor.needsUpdate = true;
    }
  }
}
