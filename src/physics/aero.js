import * as THREE from '../lib/three.js';

const _vb = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Air force on the body, treated as three flat plates (side, head, belly/back).
// Each plate pushes back against the air hitting it, in proportion to speed squared.
// Pitching the nose up while flying head-first lets air hit the belly: that's lift.
// Returns the force in world space.
export function aeroForce(body, aero, out = new THREE.Vector3()) {
  const speed = body.vel.length();
  if (speed < 1e-3) return out.set(0, 0, 0);
  _q.copy(body.quat).invert();
  _vb.copy(body.vel).applyQuaternion(_q);
  const [cx, cy, cz] = aero.plates;
  out.set(-cx * speed * _vb.x, -cy * speed * _vb.y, -cz * speed * _vb.z);
  return out.applyQuaternion(body.quat);
}

// Extra steering torque the pilot gets from moving arms and legs at speed
export function aeroSteering(speed, aero) {
  return Math.min(aero.steerMax, aero.steerPerV2 * speed * speed);
}
