import * as THREE from '../lib/three.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();

// A single rigid body: position, velocity, orientation, spin.
// Inertia is a diagonal tensor in the body frame. Angular velocity is in world frame.
export class RigidBody {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.mass = 1;
    this.inertia = new THREE.Vector3(1, 1, 1);
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();
  }

  setMass(mass, factors) {
    this.mass = mass;
    this.inertia.set(mass * factors[0], mass * factors[1], mass * factors[2]);
  }

  toWorld(v, out = new THREE.Vector3()) { return out.copy(v).applyQuaternion(this.quat); }

  toBody(v, out = new THREE.Vector3()) {
    _q.copy(this.quat).invert();
    return out.copy(v).applyQuaternion(_q);
  }

  pointToWorld(local, out = new THREE.Vector3()) { return this.toWorld(local, out).add(this.pos); }

  // I^-1 * v, with v and result in world frame
  invInertiaWorld(v, out = new THREE.Vector3()) {
    this.toBody(v, out);
    out.set(out.x / this.inertia.x, out.y / this.inertia.y, out.z / this.inertia.z);
    return out.applyQuaternion(this.quat);
  }

  // I * v, with v and result in world frame
  inertiaWorld(v, out = new THREE.Vector3()) {
    this.toBody(v, out);
    out.set(out.x * this.inertia.x, out.y * this.inertia.y, out.z * this.inertia.z);
    return out.applyQuaternion(this.quat);
  }

  velocityAt(worldPoint, out = new THREE.Vector3()) {
    _r.subVectors(worldPoint, this.pos);
    return out.crossVectors(this.angVel, _r).add(this.vel);
  }

  applyImpulse(impulse, worldPoint) {
    this.vel.addScaledVector(impulse, 1 / this.mass);
    _r.subVectors(worldPoint, this.pos);
    _v.crossVectors(_r, impulse);
    this.angVel.add(this.invInertiaWorld(_v, _v));
  }

  integrate(dt, cfg) {
    // Linear: forces, gravity, quadratic air drag
    const speed = this.vel.length();
    this.vel.addScaledVector(this.force, dt / this.mass);
    this.vel.addScaledVector(this.vel, (-cfg.airDrag * speed * dt) / this.mass);
    this.vel.y -= cfg.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);

    // Angular
    this.angVel.addScaledVector(this.invInertiaWorld(this.torque, _v), dt);
    this.angVel.multiplyScalar(Math.max(0, 1 - cfg.angularDamping * dt));

    // Orientation: q += 0.5 * w * q * dt
    const w = this.angVel, q = this.quat;
    _q.set(w.x, w.y, w.z, 0).multiply(q);
    q.set(q.x + 0.5 * dt * _q.x, q.y + 0.5 * dt * _q.y, q.z + 0.5 * dt * _q.z, q.w + 0.5 * dt * _q.w).normalize();

    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);
  }
}
