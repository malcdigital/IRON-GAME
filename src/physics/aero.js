import * as THREE from '../lib/three.js';

const _vb = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _w = new THREE.Vector3();
const _z = new THREE.Vector3();
const _lift = new THREE.Vector3();

// Air force on the body. Two parts:
// 1. Flat plates (side, head, belly/back): push back against the air hitting them.
//    Flying head-first is slick; belly-first is a big air brake.
// 2. Wings: spread arms and legs grip the air like a wing. Lots of lift, little drag,
//    until the angle gets too steep and they stall.
// `spread` is 1 when tucked, higher when the pilot spreads out to turn.
// Returns the force in world space.
export function aeroForce(body, aero, out = new THREE.Vector3(), spread = 1) {
  const speed = body.vel.length();
  if (speed < 1e-3) return out.set(0, 0, 0);
  _q.copy(body.quat).invert();
  _vb.copy(body.vel).applyQuaternion(_q);

  // Plates
  const [cx, cy, cz] = aero.plates;
  out.set(-cx * speed * _vb.x, -cy * speed * _vb.y, -cz * speed * _vb.z).applyQuaternion(body.quat);

  // Wings: lift across the airflow, toward the back side when air hits the belly
  const sinA = THREE.MathUtils.clamp(-_vb.z / speed, -1, 1);   // angle of attack (belly into wind > 0)
  const a = Math.asin(Math.abs(sinA));
  const stall = THREE.MathUtils.degToRad(aero.wing.stallDeg);
  const grip = a <= stall ? Math.sin(a) : Math.sin(stall) * Math.max(0, 1 - (a - stall) / THREE.MathUtils.degToRad(30));
  const lift = wingCoeff(aero, spread) * speed * speed * grip * Math.sign(sinA);
  if (lift !== 0) {
    _w.copy(body.vel).divideScalar(speed);
    _z.set(0, 0, 1).applyQuaternion(body.quat);
    _lift.copy(_z).addScaledVector(_w, -_z.dot(_w));
    if (_lift.lengthSq() > 1e-8) {
      _lift.normalize().multiplyScalar(lift);
      out.add(_lift);
      out.addScaledVector(_w, -Math.abs(lift) / aero.wing.liftToDrag);  // induced drag
    }
  }
  return out;
}

// How much wing the pilot is showing
export function wingCoeff(aero, spread) {
  return aero.wing.coeff * (aero.wing.base + (spread - 1));
}

// Extra steering torque the pilot gets from moving arms and legs at speed
export function aeroSteering(speed, aero) {
  return Math.min(aero.steerMax, aero.steerPerV2 * speed * speed);
}
