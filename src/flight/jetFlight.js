import * as THREE from '../lib/three.js';
import { events } from '../core/events.js';
import { wingCoeff } from '../physics/aero.js';
import { ObstacleSensor } from './avoidance.js';

const Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

// Fast flight: the suit flies nose-first ("head-first"), all thrusters push forward,
// and air on the body gives lift. The pilot steers where the flight path goes;
// this works out the attitude (including banking into turns) and the thrust.
//
// Maneuvers: Q/E barrel roll (doubles as the juke), double-tap Q/E for a hard 90° turn,
// X flips 180°. An obstacle sensor steers you over or around buildings and away from the ground.
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
    this.sensor = new ObstacleSensor(config.avoid);
    this.avoiding = null;
    this.snapT = 0;
    this.snapCool = 0;
    this.snapSide = 0;
    this.snapEntry = 0;
    this.pendingJuke = 0;
    this.groundHold = null;
    this.autoMove = null;
    this.autoHandled = null;
    this.autoCool = 0;
    this.releaseT = 0;
    this.hold = null;
    this.alignT = 0;
    this._own = new THREE.Vector3();
    this.steerDir = new THREE.Vector3(0, 0, -1);
    this.steerGain = 1;
    this.steerMaxA = 50;
    this.autoLabel = '';
    this.autoLabelT = 0;
    this.rollAngle = 0;
    this._rollFF = new THREE.Vector3();
    this._ffTotal = new THREE.Vector3();
    this._qRollStep = new THREE.Quaternion();
    this.burstPending = false;

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
    this.hold = null;
    this.releaseT = 0;
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

  // Bend the path off your heading for this building (only ever grows while it's the same one)
  setHold(target, kind, sign, amount) {
    const h = this.hold;
    if (h && h.target === target && h.kind === kind && h.sign === sign) h.amount = Math.max(h.amount, amount);
    else if (!h || amount > h.amount) this.hold = { target, kind, sign, amount };
  }

  // Start a barrel roll (which is also the juke)
  // Start a barrel roll right away. withJuke adds the sidestep now; otherwise addJuke() can add it a moment later.
  startRoll(dir, withJuke = false) {
    if (this.rollT > 0 || this.snapT > 0) return false;
    this.rollT = this.cfg.flight.rollTime * 2.5;   // time-out; the roll ends when a full turn is done
    this.rollDir = dir;
    this.rollAngle = 0;
    this.rollJuke = false;
    if (withJuke) this.addJuke(dir);
    events.emit('maneuver', { name: 'roll' });
    return true;
  }

  // Turn the roll in progress into a juke (a quick tap)
  addJuke(dir) {
    if (this.rollT <= 0 || this.rollDir !== dir || this.rollJuke) return false;
    this.rollJuke = true;
    this.pendingJuke = dir;
    return true;
  }

  // Hard turn: brake, snap 90° toward `side` (+1 left, -1 right), then burst away
  snap(side, speed, heading) {
    const s = this.cfg.flight.snap;
    if (this.snapT > 0 || this.snapCool > 0 || speed < s.minSpeed) return false;
    // Aim the path at the new heading right away: the suit air-brakes (chest into the wind),
    // turns while slow, then bursts away once it's lined up.
    // 90° from where you're actually moving (mid-turn your aim is already well ahead of that)
    this.yaw = heading + side * THREE.MathUtils.degToRad(s.angleDeg);
    this.jinkT = 0;
    this.hold = null;
    this.releaseT = 0;
    this.snapT = s.time;
    this.snapSide = side;
    this.snapEntry = speed;
    this.snapCool = s.cooldown;
    // Stop a roll already going (from the first tap); the suit rights itself fast (recoverRate)
    this.rollT = 0;
    return true;
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
    // A held roll (confirmed by the gesture reader) is a corkscrew: rolls only, no juke
    if (roll !== 0 && this.rollT <= 0 && this.snapT <= 0 && this.cfg.evade.corkscrew) {
      this.rollT = c.rollTime * 2.5;
      this.rollDir = roll;
      this.rollAngle = 0;
      this.rollJuke = false;
    }
    this.prevRoll = roll;

    // Steer the flight path. Turn rate drops at speed so turns stay within the G limit.
    const fast = input.boost || caps.launching;
    // Carve: steering hard while pulling back. Pull no longer climbs; it tightens the turn.
    const steer = Math.abs(input.strafe);
    this.carving = steer > 0.3 && input.forward < -0.3 && this.flipT <= 0;
    const snapping = this.snapT > 0;
    this.snapCool = Math.max(0, this.snapCool - dt);
    const turnMaxG = snapping ? c.snap.maxGTurn : this.carving ? c.carve.maxG : fast ? c.boostMaxG : c.maxG;
    let maxG = (this.flipT > 0 ? c.flipMaxG : turnMaxG) * g;
    const rateCap = this.carving ? c.carve.turnRate : c.turnRate;
    const turnRate = Math.min(rateCap, maxG / Math.max(speed, 1));
    // Spread the body to catch air: some when turning, full when carving
    const spreadWant = 1 + (this.carving ? c.spread.carve - 1 : (c.spread.turn - 1) * steer);
    this.spread += (spreadWant - this.spread) * Math.min(1, c.spread.rate * dt);
    const oldYaw = this.yaw, oldPitch = this.pitch;
    const vDir = speed > 1 ? this._v.copy(v).divideScalar(speed) : null;
    const leadBefore = vDir ? Math.acos(clamp(this.direction.dot(vDir), -1, 1)) : 0;
    if (!snapping) this.yaw -= input.strafe * turnRate * dt;   // (a hard turn ignores steering until it's done)
    // Slow = shallow dives only (there's no air to pull out of a steep one); full dives once fast
    const minPitch = -(c.slowDive.minDeg + (82 - c.slowDive.minDeg) * THREE.MathUtils.smoothstep(speed, c.slowDive.from, c.slowDive.full)) * Math.PI / 180;
    if (!this.carving) this.pitch = clamp(this.pitch - input.forward * c.pitchRate * dt, minPitch, 1.45);
    else this.pitch = Math.max(this.pitch, minPitch);
    if (this.flipT > 0) {
      this.yaw += (Math.PI * dt) / c.flipTime;
      this.flipT -= dt;
    }
    if (snapping) {
      this.snapT -= dt;   // the game swings the motion round; this just keeps the pose sharp
      this.carving = true;
    }
    // Let go of a turn: the aim stops where you're actually heading (plus the little it still
    // turns while rolling level), instead of the suit chasing an aim that ran on ahead
    const vHead = speed > 10 ? Math.atan2(-v.x, -v.z) : null;
    const headRate = vHead != null && this.prevVHead != null ? Math.atan2(Math.sin(vHead - this.prevVHead), Math.cos(vHead - this.prevVHead)) / dt : 0;
    if (vHead != null && this.prevSteer > 0.2 && steer < 0.1 && this.flipT <= 0 && !snapping) this.releaseT = c.releaseTime;
    if (steer >= 0.1 || this.flipT > 0 || snapping) this.releaseT = 0;
    if (this.releaseT > 0 && vHead != null) {
      // Follow the real heading while the suit rolls level, then hold it once the turn has stopped
      let lead = vHead + headRate * c.releaseCarry - this.yaw;
      this.yaw += Math.atan2(Math.sin(lead), Math.cos(lead));
      this.releaseT = Math.abs(headRate) < THREE.MathUtils.degToRad(c.releaseStopDeg) ? 0 : this.releaseT - dt;
    }
    this.prevSteer = steer;
    this.prevVHead = vHead;
    // Don't let the aim run too far ahead of where the suit is really going
    if (speed > 10 && this.flipT <= 0 && !snapping) {
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
    let savedYaw = this.yaw;
    this.pitch = Math.max(this.pitch, pitchFloor);

    // Obstacle sensor: steer over or around whatever is ahead, harder the closer it gets.
    // This bends this frame's path only; your own heading is restored afterwards.
    // What the suit can really pull right now: air grip at this speed (spread out) plus spare thrust
    const gripNow = ((this.cfg.aero.plates[2] + wingCoeff(this.cfg.aero, c.spread.carve)) * speed * speed * 0.57 + caps.maxLift) / body.mass - 0.5 * g;
    const canPull = clamp(gripNow, 1.5, c.carve.maxG * g);
    // Auto-steer: smallest move first. Close to a building: a small course correction. If that
    // can't clear it: one quick move that keeps your speed (hop a roof edge, roll-juke past it).
    // Light: correction only. Full: adds the hop / roll. Off / Light / Full via caps.autoSteer.
    const as = this.cfg.avoid;
    const level = caps.autoSteer || 'full';
    this.autoCool = Math.max(0, this.autoCool - dt);
    this.autoRollT = Math.max(0, (this.autoRollT || 0) - dt);
    this.autoDodgeT = Math.max(0, (this.autoDodgeT || 0) - dt);
    this.streetT = Math.max(0, (this.streetT || 0) - dt);
    this.autoLabelT = Math.max(0, this.autoLabelT - dt);
    const plan = level === 'off' ? this.sensor.plan : this.sensor.scan(body.pos, v, this.direction, caps.colliders, caps.altitude, canPull);
    if (level === 'off') plan.active = false;
    this.avoiding = plan.active && plan.urgency > 0.02 ? plan.kind : null;
    this.avoidPlan = plan;
    if (plan.inStreet) this.streetT = this.cfg.avoid.streetHold;   // stays 'between buildings' through crossings
    if (this.avoiding && this.flipT <= 0 && this.snapT <= 0) {
      const ground = plan.target === 'ground';
      const w = plan.urgency;
      const away = plan.kind === 'up' ? input.forward < -0.3 : plan.kind === 'left' ? input.strafe < -0.3 : input.strafe > 0.3;
      // Ground: full strength. Buildings: a small course correction, sized to just clear the
      // building and eased in as it gets close. It never moves the path more than nudgeMaxDeg
      // away from where YOU are steering, so it can't build up into a turn.
      const maxBend = THREE.MathUtils.degToRad(as.nudgeMaxDeg);
      const ease = 1 - THREE.MathUtils.smoothstep(plan.ttc, as.nudgeFull, as.nudgeTime);
      let tooBig = false;
      const need = plan.dist * Math.tan(clamp(plan.angle - THREE.MathUtils.degToRad(as.extraDeg), 0, 1.2)) + 1;   // metres to shift to clear it
      if (plan.kind === 'up') {
        if (ground) {
          const want = Math.min(1.3, plan.basePitch + plan.angle);
          if (want > this.pitch) this.pitch += (want - this.pitch) * w;
          if (w > 0.5) this.groundHold = Math.max(this.pitch, savedPitch);
        } else if (!away) {
          // Roof edge: a gentle climb at the last moment it can still clear (no hop)
          const want = plan.basePitch + plan.angle - savedPitch;
          const upMax = THREE.MathUtils.degToRad(as.upMaxDeg);
          tooBig = want > upMax;
          const upTime = Math.sqrt((2 * need) / (as.upAccelG * g)) + as.upLead;
          if (want > 0 && plan.ttc <= upTime) this.setHold(plan.target, 'up', 1, Math.min(want, upMax));
        }
      } else if (!away && this.autoDodgeT <= 0) {   // (not while an auto sidestep is moving you)
        const sign = plan.kind === 'left' ? 1 : -1;
        let dev = plan.baseYaw + sign * plan.angle - savedYaw;   // wanted change from your heading
        dev = Math.atan2(Math.sin(dev), Math.cos(dev)) * sign;
        tooBig = dev > maxBend * as.nudgeEnough;
        if (dev > 0 && ease > 0) this.setHold(plan.target, 'side', sign, Math.min(dev, maxBend) * ease);
      }
      if (ground && w > 0.4) {
        maxG = Math.max(maxG, c.carve.maxG * g);
        this.spread += (c.spread.carve - this.spread) * Math.min(1, c.spread.rate * dt);   // spread out for more lift
      }

      // Only when a small correction can't clear it: one quick move (hop a roof edge, or a
      // barrel roll with a sidestep sized to clear it). Never a hard turn.
      // A sidestep of `need` metres takes stepTime seconds at the suit's max sideways push;
      // the roll waits until the last moment that still works
      const stepTime = Math.sqrt((5.77 * need) / as.stepMaxAccel);
      const lastMoment = plan.kind === 'up' ? plan.ttc < as.moveTime : plan.ttc <= stepTime + as.stepLead;
      if (level === 'full' && !ground && !away && tooBig && lastMoment && this.autoCool <= 0 && plan.target !== this.autoHandled) {
        let move = null;
        if (plan.kind === 'up' && need <= as.hopMax) {
          move = { type: 'hop', dv: clamp((need / Math.max(plan.ttc, 0.3)) * 1.5 + 3, 4, as.hopMaxSpeed) };
        } else if (plan.kind !== 'up' && need <= as.rollMax) {
          const dir = plan.kind === 'left' ? 1 : -1;
          // Only one auto roll every few seconds, never between buildings or along a wall
          // you're skimming. Otherwise the course correction does the work.
          if (this.autoRollT <= 0 && this.streetT <= 0 && plan.headOn >= as.rollHeadOn) move = { type: 'roll', dir, need, ttc: plan.ttc, time: Math.max(stepTime, Math.min(as.stepTimeMax, plan.ttc - as.stepLead)) };
        }
        if (move) {
          if (move.type === 'roll') this.autoRollT = as.rollLockout;
          this.autoMove = move;
          this.autoHandled = plan.target;
          this.autoCool = as.cooldown;
          this.autoLabel = { hop: 'auto hop', roll: 'auto roll' }[move.type];
          this.autoLabelT = 1;
        }
      }
    }
    if (!this.avoiding) this.autoHandled = null;

    // A building correction stays on until your own heading would clear that building, then
    // eases off. (Letting go as soon as the danger passed swung you back at it: back and forth.)
    // Between buildings, after a nudge: line your heading up with the street and ease toward
    // the middle, so the nudge doesn't send you at the buildings on the other side.
    if (this.hold && this.hold.kind === 'side' && plan.street) this.alignT = as.alignTime;
    if (steer > 0.1 || level === 'off') this.alignT = 0;
    if (this.alignT > 0) {
      this.alignT -= dt;
      const st = plan.street;
      if (st && speed > 10) {
        let off = st.axisYaw - savedYaw;
        off = Math.atan2(Math.sin(off), Math.cos(off));
        if (Math.abs(off) < THREE.MathUtils.degToRad(as.alignMaxDeg)) {
          const center = THREE.MathUtils.degToRad(clamp(st.offset * as.centerDegPerM, -as.centerMaxDeg, as.centerMaxDeg));
          let want = off - center;   // (to go right, the yaw goes down)
          want = Math.atan2(Math.sin(want), Math.cos(want));
          const stepMax = THREE.MathUtils.degToRad(as.alignRateDeg) * dt;
          savedYaw += clamp(want, -stepMax, stepMax);
          this.yaw = savedYaw;
        }
      }
    }

    const h = this.hold;
    if (h) {
      const own = this._own.set(-Math.sin(savedYaw) * Math.cos(savedPitch), Math.sin(savedPitch), -Math.cos(savedYaw) * Math.cos(savedPitch));
      const stillHits = level !== 'off' && this.sensor.hits(body.pos, own, h.target, speed * as.lookTime + as.lookExtra);
      const takeOver = h.kind === 'up' ? input.forward < -0.3 : input.strafe * h.sign < -0.3;
      if (!stillHits || takeOver) h.amount -= THREE.MathUtils.degToRad(as.holdReleaseDeg) * dt;
      if (h.amount <= 0) this.hold = null;
      else if (h.kind === 'up') this.pitch = Math.max(this.pitch, savedPitch + h.amount);
      else this.yaw = savedYaw + h.sign * h.amount;
    }

    const vTargetBase = fast ? c.boostSpeed : c.minSpeed + (c.cruiseSpeed - c.minSpeed) * this.throttle;
    // Carving brakes to cornering speed: slower = tighter. A hard turn brakes harder.
    let vTarget = this.carving ? Math.min(vTargetBase, c.carve.cornerSpeed) : vTargetBase;
    // Brake (hold L1 / Ctrl): slow to 20% of the speed you had when you started braking
    if (input.brake && !caps.launching) {
      if (this.brakeFrom == null) this.brakeFrom = speed;
      vTarget = Math.min(vTarget, Math.max(this.brakeFrom * c.brake.keep, c.minSpeed));
      this.brakeTarget = vTarget;
    } else this.brakeFrom = null;
    this.braking = !!input.brake && this.brakeFrom != null;

    // Wanted acceleration: speed along the path, plus pulling the velocity onto the path
    const d = this.direction;
    this.pitch = this.groundHold != null ? Math.max(savedPitch, this.groundHold) : savedPitch;
    this.groundHold = null;
    this.yaw = savedYaw;
    this.steerDir.copy(d);   // the path actually being flown this frame (with any correction)
    const along = v.dot(d);
    // Steer back onto the path; much harder when dodging an obstacle
    const avoidW = this.avoiding && plan.target === 'ground' ? plan.urgency : 0;
    this._aPerp.copy(v).addScaledVector(d, -along).multiplyScalar(-(this.carving ? c.carve.turnGain : c.turnGain) * (1 + this.cfg.avoid.steerBoost * avoidW));
    // Keep height-keeping (vertical) and turning (sideways) on separate budgets
    // During a juke, let the shove carry instead of pulling straight back onto the path
    // (sideways only: height-keeping stays on, so a roll near the ground doesn't sink you into it)
    if (this.jinkT > 0) { this._aPerp.x *= 0.15; this._aPerp.z *= 0.15; }
    // Pulling up away from something gets the full turning budget
    const vMax = (this.avoiding === 'up' && plan.target === 'ground' && plan.urgency > 0.3 ? c.carve.maxG : this.hold && this.hold.kind === 'up' ? this.cfg.avoid.upAccelG + 1 : c.verticalMaxG) * g;
    const vert = clamp(this._aPerp.y, -vMax, vMax);
    this._aPerp.y = 0;
    this._aPerp.clampLength(0, maxG);
    this._aPerp.y = vert;
    this.steerGain = this.carving ? c.carve.turnGain : c.turnGain;
    this.steerMaxA = maxG;
    const accelCap = (caps.launching ? this.cfg.launch.maxAccelG * (caps.launchPower ?? 1) : 2) * g;
    this._A.copy(d).multiplyScalar(clamp((vTarget - along) * c.speedGain, -(this.braking ? c.brake.accelG : 2) * g, accelCap)).add(this._aPerp);
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
    // Barrel roll: spin about the nose at a set rate, with the target kept just ahead of the
    // actual roll (a target more than half a turn ahead would make the suit spin the wrong way)
    this._rollFF.set(0, 0, 0);
    if (this.rollT > 0) {
      const nose = this._v.set(0, 1, 0).applyQuaternion(body.quat);
      this.rollAngle += Math.max(0, -this.rollDir * body.angVel.dot(nose)) * dt;
      const left = Math.PI * 2 - this.rollAngle;
      const lead = Math.min(left, THREE.MathUtils.degToRad(c.rollLeadDeg));
      qDes.multiply(this._qRollStep.setFromAxisAngle(Y, -this.rollDir * (this.rollAngle + lead)));
      const rate = c.rollRate * clamp(left / 0.6, 0.25, 1);   // ease off over the last part
      this._rollFF.copy(nose).multiplyScalar(-this.rollDir * rate);
      this.rollT -= dt;
      if (left < 0.05) this.rollT = 0;
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

    // Way off the wanted attitude (knocked about, or a move cut short): right yourself fast
    const off = 2 * Math.acos(Math.min(1, Math.abs(qDes.dot(body.quat))));
    const recover = c.recoverRate * THREE.MathUtils.smoothstep(off, THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(90));
    const rate = this.rollT > 0 ? c.rollMaxRate : this.flipT > 0 ? c.flipMaxRate : Math.max(this.cfg.attitude.maxRate, recover);
    attitude(body, qDes, caps.assistGain * c.attitudeGain, out.torque, rate, this._ffTotal.copy(this._ffRate).add(this._rollFF));
    out.thrust = true;
    return out;
  }
}
