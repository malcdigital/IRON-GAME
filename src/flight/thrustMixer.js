import * as THREE from '../lib/three.js';
import { allocate } from './allocator.js';

const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

// Turns a wanted force + torque into thruster settings, then into the real push.
// Thrusters with a gimbal can swivel: each gets extra "sideways" options the solver can use,
// so the suit can slide around while staying upright (like angling your palms).
export class ThrustMixer {
  constructor(thrusters) {
    this.thrusters = thrusters;
    this.cols = [];
    this.map = [];
    thrusters.forEach((t, i) => {
      const th = t.thruster;
      this.map.push({ i, kind: 'main' });
      this.cols.push(new Float64Array(6));
      if (th.gimbal > 0) {
        // Two directions across the thrust axis, each usable both ways
        const e1 = X.clone().addScaledVector(th.dir, -th.dir.dot(X));
        if (e1.lengthSq() < 1e-6) e1.copy(Z).addScaledVector(th.dir, -th.dir.dot(Z));
        e1.normalize();
        const e2 = new THREE.Vector3().crossVectors(th.dir, e1).normalize();
        for (const e of [e1, e1.clone().negate(), e2, e2.clone().negate()]) {
          this.map.push({ i, kind: 'side', e, torque: new THREE.Vector3().crossVectors(th.pos, e) });
          this.cols.push(new Float64Array(6));
        }
      }
      t.thrustDir = th.dir.clone();
      t.side = new THREE.Vector3();
    });
    this.u = new Float64Array(this.cols.length);
    this._v = new THREE.Vector3();
  }

  reset() { this.u.fill(0); }

  // Pick settings that best match target = [Fx, Fy, Fz, Tx, Ty, Tz] (body frame)
  // useSide = false locks the nozzles straight (flight mode is tuned without swivel)
  solve(target, weights, sweeps, useSide = true) {
    const thr = this.thrusters;
    this.map.forEach((m, k) => {
      const t = thr[m.i], a = t.available, col = this.cols[k];
      if (m.kind === 'main') {
        const d = t.thruster.dir, tq = t.thruster.torque;
        col[0] = d.x * a; col[1] = d.y * a; col[2] = d.z * a;
        col[3] = tq.x * a; col[4] = tq.y * a; col[5] = tq.z * a;
      } else {
        const s = useSide ? Math.sin(t.thruster.gimbal) * a : 0;
        col[0] = m.e.x * s; col[1] = m.e.y * s; col[2] = m.e.z * s;
        col[3] = m.torque.x * s; col[4] = m.torque.y * s; col[5] = m.torque.z * s;
      }
    });
    if (!useSide) this.map.forEach((m, k) => { if (m.kind === 'side') this.u[k] = 0; });
    allocate(this.cols, target, weights, this.u, sweeps);
    this.resolve();
  }

  // Combine each thruster's main and sideways settings into one real setting.
  // A swivelled thruster can't lean past its gimbal, and can't exceed full thrust.
  resolve() {
    const thr = this.thrusters;
    for (const t of thr) { t.main = 0; t.side.set(0, 0, 0); }
    this.map.forEach((m, k) => {
      const t = thr[m.i];
      if (m.kind === 'main') t.main = this.u[k];
      else t.side.addScaledVector(m.e, this.u[k] * Math.sin(t.thruster.gimbal));
    });
    for (const t of thr) {
      const maxSide = t.main * Math.tan(t.thruster.gimbal || 0);
      if (t.side.length() > maxSide) t.side.setLength(maxSide);
      const mag = Math.hypot(t.main, t.side.length());
      if (mag > 1) { t.main /= mag; t.side.multiplyScalar(1 / mag); }
      t.throttle = Math.hypot(t.main, t.side.length());
      this._v.copy(t.thruster.dir).multiplyScalar(t.main).add(t.side);
      if (this._v.lengthSq() > 1e-8) t.thrustDir.copy(this._v).normalize();
      else t.thrustDir.copy(t.thruster.dir);
    }
  }

  // Power the settings would draw
  draw() {
    let d = 0;
    for (const t of this.thrusters) d += t.throttle * t.available * t.thruster.powerPerN;
    return d;
  }

  // Scale everything down (power limit)
  scale(k) {
    for (const t of this.thrusters) { t.main *= k; t.side.multiplyScalar(k); t.throttle *= k; }
  }

  // Add the resulting force and torque (body frame)
  apply(F, T) {
    for (const t of this.thrusters) {
      const a = t.available;
      this._v.copy(t.thruster.dir).multiplyScalar(t.main * a).add(this._v.clone().copy(t.side).multiplyScalar(a));
      F.add(this._v);
      T.add(new THREE.Vector3().crossVectors(t.thruster.pos, this._v));
    }
  }

  // Most sideways push available right now (for the hover assist)
  sideCapacity() {
    let s = 0;
    for (const t of this.thrusters) s += t.available * Math.sin(t.thruster.gimbal || 0);
    return s;
  }
}
