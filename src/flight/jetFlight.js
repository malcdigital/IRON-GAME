import * as THREE from '../lib/three.js';
import { events } from '../core/events.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

// Fast flight: the suit flies nose-first ("head-first"), all thrusters push forward,
// and air on the body gives lift. The pilot steers where the flight path goes;
// this works out the attitude (including banking into turns) and the thrust.
//
// Maneuvers: Q/E barrel roll (with a sideways dodge), X flips 180°.
export class JetFlight {
  constructor(config) {
    this.cfg = config;
    this.yaw = 0;
    this.pitch = 0;
    this.throttle = 0.5;
    this.rollT = 0;
    this.rollDir = 0;
    this.flipT = 0;
    this.prevRoll = 0;
    this.gLoad = 1;

    this._d = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._aPerp = new THREE.Vector3();
    this._A = new THREE.Vector3();
    this._lift = new THREE.Vector3();
    this._x = new THREE.Vector3();
    this._y = new THREE.Vector3();
    this._z = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._qRoll = new THREE.Quaternion();
    this._up = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._ySlow = new THREE.Vector3();
    this._yFast = new THREE.Vector3();
    this._yFlare = new THREE.Vector3();
    this._tmpW = new THREE.Vector3();
    this.flare = 0;
  }

  // Start flying in the direction you're already moving (or facing)
  enter(body, heading) {
    const v = body.vel, h = Math.hypot(v.x, v.z);
    // Start nearly level: along your horizontal motion, or the way you're facing
    this.yaw = h > 3 ? Math.atan2(-v.x, -v.z) : heading;
    this.pitch = h > 3 ? clamp(Math.atan2(v.y, h), -0.3, 0.3) : 0.12;
    this.throttle = 0.5;
    this.rollT = this.flipT = 0;
  }

  flip() {
    if (this.flipT > 0) return false;
    this.flipT = this.cfg.flight.flipTime;
    return true;
  }

  get direction() {
    const cp = Math.cos(this.pitch);
    return this._d.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(body, input, caps, dt, out, attitude) {
    const c = this.cfg.flight, g = this.cfg.physics.gravity;
    const v = body.vel, speed = v.length();

    // Barrel roll on a fresh Q/E press
    const roll = input.roll || 0;
    if (roll !== 0 && this.prevRoll === 0 && this.rollT <= 0) {
      this.rollT = c.rollTime;
      this.rollDir = roll;
      events.emit('maneuver', { name: 'roll' });
    }
    this.prevRoll = roll;

    // Steer the flight path. Turn rate drops at speed so turns stay within the G limit.
    const maxG = (this.flipT > 0 ? c.flipMaxG : input.boost ? c.boostMaxG : c.maxG) * g;
    const turnRate = Math.min(c.turnRate, maxG / Math.max(speed, 1));
    const oldYaw = this.yaw, oldPitch = this.pitch;
    const vDir = speed > 1 ? this._v.copy(v).divideScalar(speed) : null;
    const leadBefore = vDir ? Math.acos(clamp(this.direction.dot(vDir), -1, 1)) : 0;
    this.yaw -= input.strafe * turnRate * dt;
    this.pitch = clamp(this.pitch - input.forward * c.pitchRate * dt, -1.45, 1.45);
    if (this.flipT > 0) {
      this.yaw += (Math.PI * dt) / c.flipTime;
      this.flipT -= dt;
    }
    // Don't let the aim run too far ahead of where the suit is really going
    if (speed > 10 && this.flipT <= 0) {
      const lead = Math.acos(clamp(this.direction.dot(vDir), -1, 1));
      if (lead > THREE.MathUtils.degToRad(c.maxLeadDeg) && lead > leadBefore) {
        this.yaw = oldYaw;
        this.pitch = oldPitch;
      }
    }

    // Speed
    this.throttle = clamp(this.throttle + (input.up - input.down) * c.throttleRamp * dt, 0, 1);
    const vTarget = input.boost ? c.boostSpeed : c.minSpeed + (c.cruiseSpeed - c.minSpeed) * this.throttle;

    // Wanted acceleration: speed along the path, plus pulling the velocity onto the path
    const d = this.direction;
    const along = v.dot(d);
    this._aPerp.copy(v).addScaledVector(d, -along).multiplyScalar(-c.turnGain).clampLength(0, maxG);
    if (this.rollT > 0) {
      // Sideways dodge during a roll
      this._x.crossVectors(d, Y).normalize();
      this._aPerp.addScaledVector(this._x, -this.rollDir * c.dodgeAccel);
    }
    this._A.copy(d).multiplyScalar(clamp((vTarget - along) * c.speedGain, -2 * g, 2 * g)).add(this._aPerp);
    this._A.y += g;
    this.gLoad = this._A.length() / g;

    // Slow: point thrust where it's needed, like hovering.
    this._ySlow.copy(this._A).sub(caps.aeroAccel);
    if (this._ySlow.lengthSq() < 1e-4) this._ySlow.copy(d);
    this._ySlow.normalize();

    // Fast: keep the nose on the flight path and bank, so the body's lift does the turning.
    // Lift needed sideways/up -> angle of attack (how far the nose sits off the path).
    const w = speed > 5 ? this._w.copy(v).divideScalar(speed) : this._w.copy(d);
    this._lift.copy(this._A).addScaledVector(w, -this._A.dot(w));   // what must push across the path
    const need = body.mass * this._lift.length();
    if (this._lift.lengthSq() > 1e-6) this._lift.normalize();
    else this._lift.copy(Y).addScaledVector(w, -w.y).normalize();
    const avail = 0.5 * this.cfg.aero.plates[2] * speed * speed + caps.maxLift * 0.7;
    const aoa = 0.5 * Math.asin(clamp(need / Math.max(avail, 1), 0, 1));
    this._yFast.copy(w).multiplyScalar(Math.cos(aoa)).addScaledVector(this._lift, Math.sin(aoa));

    // Use the fast style only when moving quickly AND roughly where we want to go.
    // Aiming far off the path (a flip) means a braking burn: thrust straight at the new direction.
    const blend = THREE.MathUtils.smoothstep(speed, 10, 22) * THREE.MathUtils.smoothstep(d.dot(w), 0.3, 0.8);
    // Flare: aiming way off the path at speed -> swing upright, chest into the wind.
    // The body becomes an air brake, then thrust takes over once slow.
    const flare = THREE.MathUtils.smoothstep(speed, 12, 25) * (1 - THREE.MathUtils.smoothstep(d.dot(w), -0.1, 0.5));
    this._yFlare.copy(Y).addScaledVector(w, -w.y);
    if (this._yFlare.lengthSq() < 1e-3) this._yFlare.copy(d);
    this._yFlare.normalize();
    this._y.copy(this._ySlow).lerp(this._yFlare, flare).lerp(this._yFast, blend).normalize();
    this.flare = flare;

    // Bank: put the back (+Z) toward where we need lift (turn center and up).
    // In a flare the back faces away from the wind.
    this._lift.lerp(this._tmpW.copy(w).negate(), flare);
    this._z.copy(this._lift).addScaledVector(this._y, -this._lift.dot(this._y));
    if (this._z.lengthSq() < 0.05) this._z.copy(Y).addScaledVector(this._y, -this._y.y);
    if (this._z.lengthSq() < 1e-4) this._z.set(0, 0, 1);
    this._z.normalize();
    this._x.crossVectors(this._y, this._z).normalize();
    this._z.crossVectors(this._x, this._y);
    this._m.makeBasis(this._x, this._y, this._z);
    const qDes = this._qRoll.setFromRotationMatrix(this._m);

    if (this.rollT > 0) {
      const t = 1 - this.rollT / c.rollTime;
      const eased = t * t * (3 - 2 * t);
      qDes.multiply(new THREE.Quaternion().setFromAxisAngle(Y, -this.rollDir * Math.PI * 2 * eased));
      this.rollT -= dt;
    }

    this._up.copy(Y).applyQuaternion(body.quat);
    this._A.sub(caps.aeroAccel);
    out.force.set(0, Math.max(0, body.mass * this._A.dot(this._up)), 0);
    attitude(body, qDes, caps.assistGain * c.attitudeGain, out.torque);
    out.thrust = true;
    return out;
  }
}
