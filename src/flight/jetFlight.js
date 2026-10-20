import * as THREE from '../lib/three.js';
import { events } from '../core/events.js';
import { wingCoeff } from '../physics/aero.js';

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
    this.spread = 1;
    this.jinkT = 0;
    this.jinkSide = 0;
    this._qJink = new THREE.Quaternion();
    this.gripTrim = 0;
    this.bankSign = 1;
    this._upPerp = new THREE.Vector3();
    this._bankDir = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
    this._qPrev = new THREE.Quaternion();
    this._hasPrev = false;
    this._rateNow = new THREE.Vector3();
    this._ffRate = new THREE.Vector3();
    this.carving = false;

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
  enter(body, heading, pitchOverride = null) {
    const v = body.vel, h = Math.hypot(v.x, v.z);
    // Start nearly level: along your horizontal motion, or the way you're facing
    this.yaw = h > 3 ? Math.atan2(-v.x, -v.z) : heading;
    this.pitch = h > 3 ? clamp(Math.atan2(v.y, h), -0.3, 0.3) : 0.12;
    if (pitchOverride != null) this.pitch = pitchOverride;
    this.throttle = 0.5;
    this.rollT = this.flipT = 0;
    this._hasPrev = false;
    this._ffRate.set(0, 0, 0);
  }

  // Juke: the shove is applied by the game; here the assist lets it carry and banks the suit
  jink(side) {
    this.jinkT = this.cfg.evade.jinkTime;
    this.jinkSide = side;
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
    // Fresh press = one roll; holding (corkscrew) keeps rolling
    if (roll !== 0 && this.rollT <= 0 && (this.prevRoll === 0 || this.cfg.evade.corkscrew)) {
      this.rollT = c.rollTime;
      this.rollDir = roll;
      events.emit('maneuver', { name: 'roll' });
    }
    this.prevRoll = roll;

    // Steer the flight path. Turn rate drops at speed so turns stay within the G limit.
    const fast = input.boost || caps.launching;
    // Carve: steering hard while pulling back. Pull no longer climbs; it tightens the turn.
    const steer = Math.abs(input.strafe);
    this.carving = steer > 0.3 && input.forward < -0.3 && this.flipT <= 0;
    const turnMaxG = this.carving ? c.carve.maxG : fast ? c.boostMaxG : c.maxG;
    const maxG = (this.flipT > 0 ? c.flipMaxG : turnMaxG) * g;
    const rateCap = this.carving ? c.carve.turnRate : c.turnRate;
    const turnRate = Math.min(rateCap, maxG / Math.max(speed, 1));
    // Spread the body to catch air: some when turning, full when carving
    const spreadWant = 1 + (this.carving ? c.spread.carve - 1 : (c.spread.turn - 1) * steer);
    this.spread += (spreadWant - this.spread) * Math.min(1, c.spread.rate * dt);
    const oldYaw = this.yaw, oldPitch = this.pitch;
    const vDir = speed > 1 ? this._v.copy(v).divideScalar(speed) : null;
    const leadBefore = vDir ? Math.acos(clamp(this.direction.dot(vDir), -1, 1)) : 0;
    this.yaw -= input.strafe * turnRate * dt;
    if (!this.carving) this.pitch = clamp(this.pitch - input.forward * c.pitchRate * dt, -1.45, 1.45);
    if (this.flipT > 0) {
      this.yaw += (Math.PI * dt) / c.flipTime;
      this.flipT -= dt;
    }
    // Don't let the aim run too far ahead of where the suit is really going
    if (speed > 10 && this.flipT <= 0) {
      const lead = Math.acos(clamp(this.direction.dot(vDir), -1, 1));
      if (lead > THREE.MathUtils.degToRad(this.carving ? c.carve.maxLeadDeg : c.maxLeadDeg) && lead > leadBefore) {
        this.yaw = oldYaw;
        this.pitch = oldPitch;
      }
    }

    // Speed
    this.throttle = clamp(this.throttle + (input.up - input.down) * c.throttleRamp * dt, 0, 1);
    // Close to the ground and not diving on purpose: lift the nose
    // Hands off the pitch: the path eases back to level
    if ((input.forward === 0 || this.carving) && this.flipT <= 0) this.pitch *= Math.exp(-c.autoLevel * dt);
    const ga = c.groundAvoid;
    // Look ahead: where will we be in a moment at this sink rate?
    const predicted = caps.altitude + Math.min(0, v.y) * ga.lookahead;
    const pitchFloor = predicted < ga.height && input.forward <= 0 ? ga.pitch : -Infinity;
    const savedPitch = this.pitch;
    this.pitch = Math.max(this.pitch, pitchFloor);
    const vTargetBase = fast ? c.boostSpeed : c.minSpeed + (c.cruiseSpeed - c.minSpeed) * this.throttle;
    // Carving brakes to cornering speed: slower = tighter
    const vTarget = this.carving ? Math.min(vTargetBase, c.carve.cornerSpeed) : vTargetBase;

    // Wanted acceleration: speed along the path, plus pulling the velocity onto the path
    const d = this.direction;
    this.pitch = savedPitch;
    const along = v.dot(d);
    this._aPerp.copy(v).addScaledVector(d, -along).multiplyScalar(-(this.carving ? c.carve.turnGain : c.turnGain));
    // Keep height-keeping (vertical) and turning (sideways) on separate budgets
    // During a juke, let the shove carry instead of pulling straight back onto the path
    if (this.jinkT > 0) this._aPerp.multiplyScalar(0.15);
    const vert = clamp(this._aPerp.y, -c.verticalMaxG * g, c.verticalMaxG * g);
    this._aPerp.y = 0;
    this._aPerp.clampLength(0, maxG);
    this._aPerp.y = vert;
    if (this.rollT > 0) {
      // Sideways dodge during a roll
      this._x.crossVectors(d, Y).normalize();
      this._aPerp.addScaledVector(this._x, -this.rollDir * c.dodgeAccel);
    }
    const accelCap = (caps.launching ? this.cfg.launch.maxAccelG : 2) * g;
    this._A.copy(d).multiplyScalar(clamp((vTarget - along) * c.speedGain, -2 * g, accelCap)).add(this._aPerp);
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
    // Grip available at the best angle: belly plate + wings + some thrust
    // Sideways grip per unit of sin(angle): belly plate + wings + some thrust
    const avail = (this.cfg.aero.plates[2] + wingCoeff(this.cfg.aero, this.spread)) * speed * speed + caps.maxLift * 0.7;
    // Never tilt past the best-grip angle (past it the body stalls: less grip, much more drag)
    // Learn from what the air actually gave last moment: if grip fell short, tilt more
    const got = body.mass * this._tmpW.copy(caps.aeroAccel).addScaledVector(w, -caps.aeroAccel.dot(w)).length();
    if (speed > 15 && need > 500) this.gripTrim = clamp(this.gripTrim + (need - got) / need * c.gripLearn * dt, 0, 1.5);
    else this.gripTrim *= Math.exp(-2 * dt);
    const aoa = Math.min(THREE.MathUtils.degToRad(c.maxAoaDeg), Math.asin(clamp((need / Math.max(avail, 1)) * (1 + this.gripTrim), 0, 1)));
    this._yFast.copy(w).multiplyScalar(Math.cos(aoa)).addScaledVector(this._lift, Math.sin(aoa));

    // Use the fast style only when moving quickly AND roughly where we want to go.
    // Aiming far off the path (a flip) means a braking burn: thrust straight at the new direction.
    const aligned = this.carving ? 1 : THREE.MathUtils.smoothstep(d.dot(w), 0.3, 0.8);
    const blend = THREE.MathUtils.smoothstep(speed, 10, 22) * aligned;
    // Flare: aiming way off the path at speed -> swing upright, chest into the wind.
    // The body becomes an air brake, then thrust takes over once slow.
    const flare = this.carving ? 0 : THREE.MathUtils.smoothstep(speed, 12, 25) * (1 - THREE.MathUtils.smoothstep(d.dot(w), -0.1, 0.5));
    this._yFlare.copy(Y).addScaledVector(w, -w.y);
    if (this._yFlare.lengthSq() < 1e-3) this._yFlare.copy(d);
    this._yFlare.normalize();
    this._y.copy(this._ySlow).lerp(this._yFlare, flare).lerp(this._yFast, blend).normalize();
    this.flare = flare;

    // Bank: put the back (+Z) toward where we need lift (turn center and up).
    // In a flare the back faces away from the wind.
    // Keep the back facing roughly up: a mostly-downward push comes from dipping the nose
    // (negative angle of attack), not from rolling upside down. Hysteresis stops flip-flopping.
    this._upPerp.copy(Y).addScaledVector(w, -w.y);
    const upDot = this._upPerp.lengthSq() > 1e-4 ? this._lift.dot(this._upPerp.normalize()) : 1;
    if (this.bankSign > 0 && upDot < -0.35) this.bankSign = -1;
    else if (this.bankSign < 0 && upDot > -0.1) this.bankSign = 1;
    this._bankDir.copy(this._lift).multiplyScalar(this.bankSign).lerp(this._tmpW.copy(w).negate(), flare);
    this._z.copy(this._bankDir).addScaledVector(this._y, -this._bankDir.dot(this._y));
    if (this._z.lengthSq() < 0.05) this._z.copy(Y).addScaledVector(this._y, -this._y.y);
    if (this._z.lengthSq() < 1e-4) this._z.set(0, 0, 1);
    this._z.normalize();
    this._x.crossVectors(this._y, this._z).normalize();
    this._z.crossVectors(this._x, this._y);
    this._m.makeBasis(this._x, this._y, this._z);
    const qDes = this._qRoll.setFromRotationMatrix(this._m);

    if (this.jinkT > 0) {
      const t = 1 - this.jinkT / this.cfg.evade.jinkTime;
      const bank = THREE.MathUtils.degToRad(this.cfg.evade.jinkBankDeg) * Math.sin(Math.PI * t) * this.jinkSide;
      qDes.multiply(this._qJink.setFromAxisAngle(Y, bank));
      this.jinkT -= dt;
    }
    if (this.rollT > 0) {
      const t = 1 - this.rollT / c.rollTime;
      const eased = t * t * (3 - 2 * t);
      qDes.multiply(new THREE.Quaternion().setFromAxisAngle(Y, -this.rollDir * Math.PI * 2 * eased));
      this.rollT -= dt;
    }

    this._up.copy(Y).applyQuaternion(body.quat);
    this._A.sub(caps.aeroAccel);
    out.force.set(0, Math.max(0, body.mass * this._A.dot(this._up)), 0);
    // How fast the target attitude is turning (feed-forward), smoothed
    if (this._hasPrev) {
      const dq = this._dq.multiplyQuaternions(qDes, this._qPrev.invert());
      if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
      const ang = 2 * Math.acos(Math.min(1, dq.w)), sn = Math.sqrt(Math.max(1e-12, 1 - dq.w * dq.w));
      this._rateNow.set(dq.x, dq.y, dq.z).multiplyScalar(ang / sn / Math.max(dt, 1e-4));
      if (this.rollT > 0 || this.flipT > 0 || this._rateNow.length() > 8) this._rateNow.set(0, 0, 0);
      // Fades in with speed: at low speed the target swings around too much to trust
      // (always on while you're steering, so turns stay sharp)
      const ffScale = steer > 0.2 ? 1 : THREE.MathUtils.smoothstep(speed, c.feedForwardFrom, c.feedForwardFull);
      this._rateNow.multiplyScalar(c.feedForward * ffScale);
      this._ffRate.lerp(this._rateNow, Math.min(1, 10 * dt));
    }
    this._qPrev.copy(qDes);
    this._hasPrev = true;

    const rate = this.rollT > 0 ? c.rollMaxRate : this.flipT > 0 ? c.flipMaxRate : this.cfg.attitude.maxRate;
    attitude(body, qDes, caps.assistGain * c.attitudeGain, out.torque, rate, this._ffRate);
    out.thrust = true;
    return out;
  }
}
