import * as THREE from '../lib/three.js';
import { JetFlight } from './jetFlight.js';

const Y = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3(0, 0, -1);

// Heading (yaw angle) the body is facing. 0 = facing -Z.
export function yawOf(q) {
  _f.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-_f.x, -_f.z);
}

// Turns player input into a wanted force and torque (both in the body frame).
// It never moves the suit directly: thrusters do that, so damage and heat always matter.
export class FlightController {
  constructor(config) {
    this.cfg = config;
    this.mode = 'assist';
    this.heading = 0;
    this.throttle = 0;
    this.out = { force: new THREE.Vector3(), torque: new THREE.Vector3(), thrust: false };
    this.jet = new JetFlight(config);
    this.hoverMode = 'assist';
    this._attitude = this.attitudeTorque.bind(this);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._vDes = new THREE.Vector3();
    this._aH = new THREE.Vector3();
    this._A = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._qYaw = new THREE.Quaternion();
    this._qTilt = new THREE.Quaternion();
    this._qDes = new THREE.Quaternion();
    this._qInv = new THREE.Quaternion();
    this._qErr = new THREE.Quaternion();
    this._e = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._aSide = new THREE.Vector3();
    this._aLean = new THREE.Vector3();
    this._side = new THREE.Vector3();
    this._ff = new THREE.Vector3();
  }

  reset(heading = 0) {
    this.heading = heading;
    this.throttle = 0;
    if (this.mode === 'flight') this.mode = this.hoverMode;
  }

  get flying() { return this.mode === 'flight'; }

  enterFlight(body, pitch = null) {
    if (this.mode !== 'flight') this.hoverMode = this.mode;
    this.mode = 'flight';
    this.jet.enter(body, this.heading, pitch);
  }

  exitFlight(body, hoverFraction) {
    // Always back to the upright, assisted hover (manual hover only if it's switched on in config)
    this.mode = this.cfg.assist.allowManual ? this.hoverMode : 'assist';
    this.heading = this.jet.yaw;
    if (this.mode === 'manual') this.throttle = Math.min(1, hoverFraction);
  }

  // Hover: spin round to face the other way
  turnAround() { this.heading += Math.PI; }

  toggleMode(body, hoverFraction) {
    if (this.mode === 'flight' || !this.cfg.assist.allowManual) return this.mode;
    this.mode = this.mode === 'assist' ? 'manual' : 'assist';
    this.heading = yawOf(body.quat);
    if (this.mode === 'manual') this.throttle = Math.min(1, hoverFraction);
    return this.mode;
  }

  update(body, input, caps, grounded, dt) {
    this.out.sideways = false;
    this.out.walk = null;
    if (this.mode === 'flight') {
      const out = this.jet.update(body, input, caps, dt, this.out, this._attitude);
      this.heading = this.jet.yaw;
      return out;
    }
    return this.mode === 'assist'
      ? this.assist(body, input, caps, grounded, dt)
      : this.manual(body, input, caps, grounded, dt);
  }

  assist(body, input, caps, grounded, dt) {
    const c = this.cfg.assist, g = this.cfg.physics.gravity, out = this.out;
    this.heading += input.yaw * c.yawRate * dt;
    const h = this.heading;

    // Wanted horizontal velocity from the stick, turned into a wanted acceleration
    const vmax = input.boost ? c.boostSpeed : c.maxSpeed;
    this._fwd.set(-Math.sin(h), 0, -Math.cos(h));
    this._right.set(Math.cos(h), 0, -Math.sin(h));
    this._vDes.copy(this._fwd).multiplyScalar(input.forward * vmax)
      .addScaledVector(this._right, input.strafe * vmax);
    this._aH.set(this._vDes.x - body.vel.x, 0, this._vDes.z - body.vel.z).multiplyScalar(c.velGain);
    // Never tilt further than the thrusters can hold altitude at (weak suits stay upright)
    const twr = caps.maxLift / (body.mass * g);
    const holdable = Math.acos(Math.min(1, 1 / Math.max(1e-3, twr * 0.92)));
    const cfgTilt = THREE.MathUtils.degToRad(input.boost ? c.boostTiltDeg : c.maxTiltDeg);
    const tilt = Math.min(cfgTilt, Math.max(THREE.MathUtils.degToRad(8), holdable));
    this._aH.clampLength(0, g * Math.tan(tilt));

    // Vertical: hold altitude unless climbing or descending
    const climb = input.boost ? c.boostClimbRate : c.climbRate;
    const vyDes = input.up * climb - input.down * (input.boost ? c.boostClimbRate : c.descendRate);
    const aY = (vyDes - body.vel.y) * c.climbGain + g;

    this._qYaw.setFromAxisAngle(Y, h);

    // Standing on the ground and not asking to lift off: thrusters idle, the stick walks
    if (grounded && input.up <= 0) {
      const walk = input.boost ? c.runSpeed : c.walkSpeed;
      out.walk = this._vDes.copy(this._fwd).multiplyScalar(input.forward * walk).addScaledVector(this._right, input.strafe * walk);
      out.force.set(0, 0, 0);
      this.attitudeTorque(body, this._qYaw, caps.assistGain, out.torque);
      out.thrust = false;
      return out;
    }

    // Slide upright: swivelled thrusters push sideways. Lean only for what they can't cover,
    // and (in upright mode) only while boosting.
    this._aSide.copy(this._aH).clampLength(0, (caps.sideMax * c.sideUse) / body.mass);
    this._aLean.subVectors(this._aH, this._aSide);
    if (c.upright && !input.boost) this._aLean.clampLength(0, g * Math.tan(THREE.MathUtils.degToRad(c.uprightLeanDeg)));

    // Tilt the suit so its main thrust points along the rest of the wanted acceleration
    this._A.set(this._aLean.x, Math.max(aY, 0.3 * g), this._aLean.z);
    this._up.copy(this._A).normalize();
    this._qTilt.setFromUnitVectors(Y, this._up);
    this._qDes.multiplyQuaternions(this._qTilt, this._qYaw);

    this._up.copy(Y).applyQuaternion(body.quat);
    this._A.y = aY;
    this._qInv.copy(body.quat).invert();
    this._side.copy(this._aSide).multiplyScalar(body.mass).applyQuaternion(this._qInv);
    out.force.set(this._side.x, Math.max(0, body.mass * this._A.dot(this._up)) + this._side.y, this._side.z);
    out.sideways = true;
    this.attitudeTorque(body, this._qDes, caps.assistGain, out.torque);
    out.thrust = true;
    return out;
  }

  manual(body, input, caps, grounded, dt) {
    const c = this.cfg.manual, out = this.out;
    this.throttle = THREE.MathUtils.clamp(this.throttle + (input.up - input.down) * c.throttleRamp * dt, 0, 1);
    this.heading = yawOf(body.quat);

    // Wanted spin rates in the body frame
    this._qInv.copy(body.quat).invert();
    this._w.copy(body.angVel).applyQuaternion(this._qInv);
    out.torque.set(
      (-input.forward * c.pitchRate - this._w.x) * c.rateGain * body.inertia.x,
      (input.yaw * c.yawRate - this._w.y) * c.rateGain * body.inertia.y,
      (-input.strafe * c.rollRate - this._w.z) * c.rateGain * body.inertia.z,
    );

    if (grounded && this.throttle < 0.05) {
      out.force.set(0, 0, 0);
      out.thrust = false;
      return out;
    }
    out.force.set(0, this.throttle * caps.maxLift, 0);
    out.thrust = true;
    return out;
  }

  // PD controller that rotates the body toward qDes
  // ffRate (optional, world frame): how fast the target itself is turning, so we keep up instead of lagging
  attitudeTorque(body, qDes, gain, out, maxRate = this.cfg.attitude.maxRate, ffRate = null) {
    const a = this.cfg.attitude;
    this._qInv.copy(body.quat).invert();
    this._qErr.multiplyQuaternions(qDes, this._qInv);
    const q = this._qErr;
    if (q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    const s = Math.sqrt(Math.max(0, 1 - q.w * q.w));
    const angle = 2 * Math.acos(Math.min(1, q.w));
    if (s < 1e-6) this._e.set(2 * q.x, 2 * q.y, 2 * q.z);
    else this._e.set(q.x, q.y, q.z).multiplyScalar(angle / s);

    this._e.applyQuaternion(this._qInv);
    this._w.copy(body.angVel).applyQuaternion(this._qInv);
    const kp = a.kp * gain, kd = a.kd * Math.sqrt(gain);
    // Turn the angle error into a wanted spin rate (capped), then torque toward that rate.
    // Capping the rate stops big moves from asking for more torque than the suit has.
    this._e.multiplyScalar(kp / kd).clampLength(0, maxRate);
    if (ffRate) this._e.add(this._ff.copy(ffRate).applyQuaternion(this._qInv));
    out.set(
      (this._e.x - this._w.x) * kd * body.inertia.x,
      (this._e.y - this._w.y) * kd * body.inertia.y,
      (this._e.z - this._w.z) * kd * body.inertia.z,
    );
    return out;
  }
}
