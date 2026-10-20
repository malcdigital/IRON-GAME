import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';
import { RANGE } from '../data/range.js';
import { RigidBody } from '../physics/RigidBody.js';
import { sphereContacts, resolveContact } from '../physics/collision.js';
import { Suit } from '../suit/Suit.js';
import { updateHeat } from '../suit/heat.js';
import { applyZoneDamage, impactDamage, updateThrusterAvailability, thermalFactor } from '../suit/damage.js';
import { FlightController, yawOf } from '../flight/controller.js';
import { ThrustMixer } from '../flight/thrustMixer.js';
import { World } from '../world/World.js';
import { Course } from '../world/course.js';
import { CargoSystem } from '../world/cargo.js';
import { ChaseDrone } from '../world/chase.js';
import { MissileSystem } from '../world/missiles.js';
import { storage } from '../core/storage.js';
import { aeroForce, aeroSteering } from '../physics/aero.js';
import { pathClear, rayBox } from '../flight/avoidance.js';
import { BurstPath } from '../flight/burstPath.js';

const Y = new THREE.Vector3(0, 1, 0);
const SPHERES = CONFIG.collision.spheres.map((s) => ({ ...s, local: new THREE.Vector3(...s.pos) }));
const FOOT = SPHERES.filter((s) => s.foot).reduce((a, s, _, all) => a.addScaledVector(s.local, 1 / all.length), new THREE.Vector3());   // middle of the feet

// The simulation. No rendering, no DOM: it can run headless and is easy to port.
export class Game {
  constructor(loadout) {
    this._qTmp = new THREE.Quaternion(); this._qTmp2 = new THREE.Quaternion(); this._qTmp3 = new THREE.Quaternion(); this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._v3 = new THREE.Vector3(); this._v4 = new THREE.Vector3(); this._jumpQ = new THREE.Quaternion(); this._jumpQ2 = new THREE.Quaternion(); this._xAxis = new THREE.Vector3();
    this.world = new World(RANGE);
    this.body = new RigidBody();
    this.controller = new FlightController(CONFIG);
    this.course = new Course(this.world.rings);
    this.cargo = new CargoSystem(RANGE.crates, this.world);
    this.chase = new ChaseDrone(RANGE.chasePath);
    this.missiles = new MissileSystem(RANGE.evasion, this.world);
    this.evadeCharge = CONFIG.evade.charges;
    this.flares = CONFIG.evade.flares;
    this.flareTimer = 0;
    this.time = 0;
    this.grounded = false;
    this.hoverBrakeT = 0;
    this.anyContact = false;
    this.groundCollider = null;
    this.recoverTimer = 0;
    this.powerLimited = false;
    this.twr = 0;
    this.launchT = 0;
    this.rescue = null;      // coming round in the air (see stepRescue)
    this.launchKick = null;
    this.launchClimb = null;
    this.burst = null;       // boosted takeoff along the burst curve (see stepBurst)
    this.launchSeq = null;   // launching: { t, jumpAt, fireAt, ... } (see step)
    this.stunT = 0;          // knocked out by a crash: thrusters off, no control (seconds left)
    this.impactIn = Infinity; // seconds until the suit hits something on its current path
    this.launchCharge = 1;
    this.caps = { maxLift: 0, assistGain: 1, aeroAccel: new THREE.Vector3(), colliders: this.world.colliders, autoSteer: storage.get('autoSteer', 'full') };
    this.aero = new THREE.Vector3();
    this._Fsave = new THREE.Vector3();
    this._Tsave = new THREE.Vector3();

    this._F = new THREE.Vector3();
    this._T = new THREE.Vector3();
    this._gyro = new THREE.Vector3();
    this._rem = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._target = new Float64Array(6);

    this.setLoadout(loadout);
  }

  setLoadout(loadout) {
    this.suit = new Suit(loadout);
    this.u = new Float64Array(this.suit.thrusters.length);
    this.mixer = new ThrustMixer(this.suit.thrusters);
    this.cargo.release();
    this.respawn();
  }

  // Back to the workshop pad, repaired and cooled down
  respawn() {
    const b = this.body;
    b.pos.copy(this.world.spawn.pos);
    b.pos.y = this.surfaceBelow(b.pos) + CONFIG.pilot.feetHeight;   // standing on the pad (not hovering just above it)
    b.vel.set(0, 0, 0);
    b.angVel.set(0, 0, 0);
    b.quat.setFromAxisAngle(Y, this.world.spawn.heading);
    this.controller.reset(this.world.spawn.heading);
    this.suit.repair();
    if (this.cargo.held) this.cargo.release();
    this.chase?.reset();
    this.missiles?.reset();
    this.evadeCharge = CONFIG.evade.charges;
    this.flares = CONFIG.evade.flares;
    this.u.fill(0);
    this.mixer?.reset();
    this.caps.aeroAccel.set(0, 0, 0);
    this.snapState = null;
    this.jukeShove = null;
    this.hopShove = null;
    this.pendingSnap = null;
    this.launchT = 0;
    this.rescue = null;      // coming round in the air (see stepRescue)
    this.burst = null;
    this.launchClimb = null;
    this.launchKick = null;
    this.launchSeq = null;
    this.stunT = 0;          // knocked out by a crash: thrusters off, no control (seconds left)
    this.impactIn = Infinity; // seconds until the suit hits something on its current path
    this.launchCharge = 1;
    this.syncMass();
    this.grounded = true;
    events.emit('respawn');   // (the suit's look starts fresh too: see SuitView)
  }

  // Dump the stored charge into the thrusters for a burst of speed
  // boosted: boost held as you launch (R1 + ✕ / Shift + F): a stronger launch for the same time
  launch(boosted = false, rampTime = null) {
    const l = CONFIG.launch;
    if (this.launchCharge < 1) {
      events.emit('toast', { text: `Flight mode. Burst recharging (${Math.round(this.launchCharge * 100)}%)` });
      return;
    }
    this.launchCharge = 0;
    this.launchT = l.time;
    this.launchCount = (this.launchCount ?? 0) + 1;   // (the camera punches in on each launch)
    this.launchPower = boosted ? l.boosted : 1;
    // the kick builds smoothly over rampTime (gentle start, strongest mid-way, easing off) instead of all at once
    this.launchRamp = rampTime ?? l.rampTime;
    this.launchKick = { dv: l.kick * this.launchPower, t: 0 };
    if (boosted) events.emit('toast', { text: 'Boosted takeoff' });
    events.emit('launch');
  }

  // Sharp sidestep: a burst from the stored charge
  // Sidestep left or right. In flight it rides along with a barrel roll.
  juke(dir, fromRoll = false) {
    const e = CONFIG.evade;
    // Hold height through the roll (the body's lift spins round with it)
    if (this.controller.flying) this.rollHold = { y0: this.body.pos.y, vy0: this.body.vel.y, t: 0 };
    if (this.autoStep) {
      // Auto-steer sidestep: moves exactly the planned distance, then stops (free, no charge)
      const st = this.autoStep; this.autoStep = null;
      const fwd = this.controller.jet.direction;
      const vec = new THREE.Vector3().crossVectors(fwd, Y).normalize();
      if (dir === 'left') vec.negate();
      this.jukeShove = { exact: true, vec, shift: st.shift, dur: st.time, t: 0, start: this.body.pos.clone(), vel0: this.body.vel.clone() };
      this.controller.jet.jink(0);
      this.controller.jet.jinkT = st.time + CONFIG.avoid.stepSettle;
      events.emit('maneuver', { name: 'juke', dir });
      return;
    }
    if (this.evadeCharge < 1) {
      if (!fromRoll) events.emit('toast', { text: 'Juke recharging' });
      return;
    }
    this.evadeCharge -= 1;
    const flying = this.controller.flying;
    const fwd = flying ? this.controller.jet.direction.clone() : new THREE.Vector3(-Math.sin(this.controller.heading), 0, -Math.cos(this.controller.heading));
    const right = new THREE.Vector3().crossVectors(fwd, Y);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    right.normalize();
    const shove = dir === 'left' ? right.clone().negate() : right;
    // Spread the sidestep over a short time so it moves with the roll instead of jumping ahead of it
    const scale = flying ? 1 : e.hoverJukeScale;
    this.jukeShove = { vec: shove, t: 0, dur: flying ? e.jukeSpread : 0.12, scale, fromRoll };
    if (flying) this.controller.jet.jink(fromRoll ? 0 : dir === 'left' ? 1 : -1);
    events.emit('maneuver', { name: 'juke', dir });
  }

  fireFlares() {
    if (this.flares <= 0) {
      events.emit('toast', { text: 'Out of flares, reloading' });
      return;
    }
    this.flares -= 1;
    this.missiles.fireFlares(this.body);
    events.emit('flares', { left: this.flares });
  }

  // Where would a hard turn take us? Points along the swing and a little beyond.
  predictSnap(side) {
    const s = CONFIG.flight.snap, v = this.body.vel, sp = Math.hypot(v.x, v.z);
    const from = new THREE.Vector3(v.x / sp, 0, v.z / sp);
    const to = from.clone().applyAxisAngle(Y, side * THREE.MathUtils.degToRad(s.angleDeg));
    const pts = [], p = this.body.pos.clone(), dir = new THREE.Vector3(), step = 0.04;
    for (let t = 0; t < s.time + s.checkAfter; t += step) {
      const q = Math.min(1, t / s.time), e = q * q * (3 - 2 * q);
      const k = q < 0.5 ? THREE.MathUtils.lerp(1, s.cornerFrac, q * 2) : THREE.MathUtils.lerp(s.cornerFrac, s.exitFrac, (q - 0.5) * 2);
      dir.copy(from).lerp(to, e).normalize();
      p.addScaledVector(dir, sp * k * step);
      p.y += v.y * step;
      pts.push(p.clone());
    }
    return { pts, from, to, speed: sp };
  }

  // Start a hard turn if its path is clear. Returns false if there's no room (or it can't start).
  startSnap(side) {
    const v = this.body.vel, sp = Math.hypot(v.x, v.z);
    if (sp < 3) return false;
    const pred = this.predictSnap(side);
    if (!pathClear(pred.pts, this.world.colliders, CONFIG.flight.snap.clearance)) return false;
    if (!this.controller.jet.snap(side, v.length(), Math.atan2(-v.x, -v.z))) return true;   // cooling down: don't queue it
    // Hold height through the hard turn and the burst (slowing down loses lift)
    this.rollHold = { y0: this.body.pos.y, vy0: Math.max(0, v.y), t: 0, time: CONFIG.flight.snap.time + CONFIG.flight.snap.holdAfter };
    this.snapState = { t: 0, from: pred.from, to: pred.to, speed: pred.speed };
    this.pendingSnap = null;
    events.emit('maneuver', { name: 'snap' });
    return true;
  }

  // Where would a sidestep (juke) or hop take us over the next moment?
  // Predicted path if the suit keeps following the path it's flying now (with any correction)
  predictCourse(jet, horizon) {
    const pts = [], p = this.body.pos.clone(), v = this.body.vel.clone(), d = jet.steerDir, a = new THREE.Vector3(), dt = 0.05;
    for (let t = dt; t <= horizon; t += dt) {
      a.copy(v).addScaledVector(d, -v.dot(d)).multiplyScalar(-jet.steerGain).clampLength(0, jet.steerMaxA);
      v.addScaledVector(a, dt);
      p.addScaledVector(v, dt);
      pts.push(p.clone());
    }
    return pts;
  }

  // Predicted path for an exact sidestep of `dist` metres over `time` seconds
  predictStep(vec, dist, time, horizon) {
    const pts = [], b = this.body;
    for (let t = 0.05; t <= horizon; t += 0.05) pts.push(b.pos.clone().addScaledVector(b.vel, t).addScaledVector(vec, dist * minJerk(Math.min(1, t / time))));
    return pts;
  }

  // Predicted path after a sideways push of dv (m/s), moving you about dv/2 metres
  predictShove(vec, dv, horizon = 0.8) {
    const pts = [], b = this.body;
    for (let t = 0.05; t <= horizon; t += 0.05) pts.push(b.pos.clone().addScaledVector(b.vel, t).addScaledVector(vec, dv * Math.min(t, 0.5)));
    return pts;
  }

  // Height of the ground or rooftop directly below a point
  surfaceBelow(p) {
    let top = 0;
    for (const c of this.world.colliders) {
      if (p.x > c.min.x && p.x < c.max.x && p.z > c.min.z && p.z < c.max.z && c.max.y <= p.y + 0.5 && c.max.y > top) top = c.max.y;
    }
    return top;
  }

  hoverFraction() {
    return (this.body.mass * CONFIG.physics.gravity) / Math.max(1, this.caps.maxLift);
  }

  syncMass() {
    this.body.setMass(this.suit.mass + this.cargo.heldMass, CONFIG.pilot.inertiaFactors);
  }

  handleAction(action) {
    switch (action) {
      case 'flight':
        if (this.controller.flying) {
          this.controller.exitFlight(this.body, this.hoverFraction());
          this.hoverBrakeT = CONFIG.assist.exitBrake.time;   // air-brake down to a hover
          events.emit('toast', { text: 'Hover mode' });
        } else if (!this.launchSeq) {
          // Launch sequence (CONFIG.launch.seq): wind up, jump, then the thrusters fire.
          // From the ground it's a crouch and a real jump; in the air, a quick tuck and fire.
          const seq = CONFIG.launch.seq, onGround = this.grounded || (this.caps.room ?? 9) < 0.6;
          this.launchSeq = { t: 0, ground: onGround, jumped: !onGround, boosted: this.boostHeld || this.takeoffBoostHeld,
            jumpAt: onGround ? seq.jumpAt : 0, fireAt: onGround ? seq.fireAt : seq.airFireAt };
          // already crouched and charged up (L1 + R1 held): skip the wind-up and jump straight away
          if (onGround && this.charging && this.chargeT > CONFIG.launch.chargeReady) this.launchSeq.t = this.launchSeq.jumpAt;
        }
        break;
      case 'flip':
        if (this.controller.flying) {
          if (this.controller.jet.flip()) events.emit('maneuver', { name: 'flip' });
        } else if (this.controller.mode === 'assist') {
          this.controller.turnAround();
          events.emit('toast', { text: 'Turning around' });
        }
        break;
      case 'jukeLeft': case 'jukeRight': {
        const dir = action === 'jukeLeft' ? 'left' : 'right';
        if (this.controller.flying) this.controller.jet.startRoll(dir === 'left' ? 1 : -1, true);  // roll + juke
        else this.juke(dir);
        break;
      }
      case 'autosteer': {
        const levels = ['off', 'light', 'full'];
        this.caps.autoSteer = levels[(levels.indexOf(this.caps.autoSteer) + 1) % levels.length];
        storage.set('autoSteer', this.caps.autoSteer);
        const what = { off: 'Off', light: 'Light (small course corrections)', full: 'Full (adds last-moment hops and rolls)' }[this.caps.autoSteer];
        events.emit('toast', { text: `Auto-steer: ${what}` });
        break;
      }
      case 'rollLeft': case 'rollRight':
        if (this.controller.flying) this.controller.jet.startRoll(action === 'rollLeft' ? 1 : -1);
        break;
      case 'rollJukeLeft': case 'rollJukeRight':
        if (this.controller.flying) this.controller.jet.addJuke(action === 'rollJukeLeft' ? 1 : -1);
        break;
      case 'snapLeft': case 'snapRight': {
        const side = action === 'snapLeft' ? 1 : -1;
        if (this.controller.flying) {
          if (this.jukeShove && this.jukeShove.fromRoll) {   // the first tap's sidestep becomes the hard turn instead
            this.jukeShove = null;
            this.evadeCharge = Math.min(CONFIG.evade.charges, this.evadeCharge + 1);
          }
          // Only turn when there's room: otherwise hold the turn and take it at the first opening
          if (!this.startSnap(side)) {
            this.pendingSnap = { side, until: this.time + CONFIG.flight.snap.waitWindow };
            events.emit('toast', { text: 'Hard turn ready: waiting for room' });
          }
        } else if (this.controller.mode === 'assist') {
          this.controller.heading += side * Math.PI / 2;   // hover: quick quarter turn
        }
        break;
      }
      case 'flare':
        if (this.controller.flying) this.fireFlares();   // (in hover the same key cuts the thrusters)
        break;
      case 'mode': {
        if (this.controller.flying) {
          this.fireFlares();   // in flight the hover-mode button drops flares
          break;
        }
        if (!CONFIG.assist.allowManual) break;
        const hover = this.hoverFraction();
        const mode = this.controller.toggleMode(this.body, hover);
        events.emit('toast', { text: mode === 'assist' ? 'Assisted flight: suit levels itself' : 'Manual flight: you control the spin and throttle' });
        break;
      }
      case 'grab':
        if (this.cargo.toggleGrab(this.body)) this.syncMass();
        break;
      case 'reset':
        this.respawn();
        this.cargo.reset();
        this.course.reset();
        events.emit('toast', { text: 'Reset to the start. Suit repaired.' });
        break;
    }
  }

  step(dt, input) {
    const { body, suit } = this;
    // Climb and descend held together (L1 + R1): in the air, hold height. Standing on the ground,
    // crouch and charge up (the boosted takeoff's wind-up): press launch to go straight away.
    const both = input.up > 0 && input.down > 0 && !this.controller.flying;
    const onGround = this.grounded || (this.caps.room ?? 9) < 0.3;
    this.charging = both && onGround && !this.launchSeq;
    this.chargeT = this.charging ? (this.chargeT ?? 0) + dt : 0;
    if (both) input = { ...input, up: 0, down: 0 };
    if (this.charging) input = { ...input, forward: 0, strafe: 0 };   // (tensed up: no walking)
    this.time += dt;
    suit.time = this.time;

    // Knocked out by a crash: thrusters off and no control; the suit tumbles and falls on its
    // own physics (the safety catch still fires the thrusters before the ground)
    if (this.stunT > 0) {
      this.stunT = Math.max(0, this.stunT - dt);
      input = { ...input, cut: true, up: 0, down: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, roll: 0, boost: false, takeoffBoost: false };
      if (this.stunT === 0 && !this.grounded) {
        const c = CONFIG.crash, sideways = Math.hypot(body.vel.x, body.vel.z);
        if (this.knockFlying && sideways > c.keepFlightSpeed && (this.caps.room ?? 0) > c.rescueAbortRoom) {
          // a glancing hit that didn't kill your speed: straight back into flight along your path
          this.controller.enterFlight(body, null);
          events.emit('toast', { text: 'Back in flight' });
        } else if ((this.caps.room ?? 0) > c.rescueMinRoom) {
          // coming round in the air: twist to face the ground, burn to stop the fall, then upright
          this.rescue = { phase: 'orient', t: 0 };
        }
      }
    }
    this.caps.attTarget = null;
    if (this.rescue) input = this.stepRescue(dt, input);
    // Launch sequence: wind up, jump (a real push off the ground), then fire into flight
    if (this.launchSeq) {
      const s = this.launchSeq, seq = CONFIG.launch.seq;
      s.t += dt;
      s.boosted ||= !!(input.boost || input.takeoffBoost);
      if (!s.jumped && s.t >= s.jumpAt) {
        // jump forward and up at jumpAngleDeg (the way you're facing), so you leave the pad already moving
        s.jumped = true;
        const h = this.controller.heading ?? 0, a = (s.boosted ? CONFIG.launch.burst.jumpAngleDeg : seq.jumpAngleDeg) * Math.PI / 180;
        s.jumpBoosted = s.boosted;
        s.origin = body.pos.clone().setY(body.pos.y - CONFIG.pilot.feetHeight);   // (the boosted path starts here)
        const up = seq.jumpSpeed * Math.sin(a), fwd = seq.jumpSpeed * Math.cos(a);
        body.vel.y += up;
        body.vel.x += -Math.sin(h) * fwd; body.vel.z += -Math.cos(h) * fwd;
      }
      if (s.t >= s.fireAt) {
        this.launchSeq = null;
        const c = CONFIG.launch.climb;
        this.lastLaunchGround = s.ground;   // (the suit's poses play a ground launch or a mid-air lean into flight)
        if (s.ground && s.jumpBoosted && s.origin) {
          // Boosted takeoff: fly the burst curve (see stepBurst)
          this.startBurst(s.origin);
          this.launch(true);
          this.launchKick = null;   // (the path sets the speed)
        } else {
          this.controller.enterFlight(body, s.ground ? c.pitchDeg * Math.PI / 180 : null);
          if (s.ground) this.launchClimb = { t: 0 };   // ease the nose down over the climb (below)
          else {
            // from a hover: start steep and arc over into level flight (slow enough to see the lean)
            const A = CONFIG.launch.air;
            this.launchClimb = { t: 0, air: true, from: A.startDeg, to: this.controller.jet.pitch * 180 / Math.PI, time: A.tipTime };
            this.airLaunchCount = (this.airLaunchCount ?? 0) + 1;   // (the suit plays its lean into flight)
          }
          this.launch(s.boosted, s.ground ? null : CONFIG.launch.air.rampTime);
        }
      } else {
        // hold still while winding up
        input = { ...input, forward: 0, strafe: 0, yaw: 0, down: 0, cut: false, up: 0 };
        if (s.jumped && s.ground) {
          // in the jump: thrusters off (a real leap), and the body throws itself forward until it
          // lines up with the jump, head first, ready to fire along it
          input.cut = true;
          const a = (90 - (s.jumpBoosted ? CONFIG.launch.burst.jumpAngleDeg : seq.jumpAngleDeg)) * Math.PI / 180, h = this.controller.heading ?? 0;
          const full = this._jumpQ.setFromAxisAngle(Y, h).multiply(this._qTmp2.setFromAxisAngle(this._xAxis.set(1, 0, 0), -a));
          this.caps.attTarget = full; this.caps.attGain = 3;
          this.spinToward(full, CONFIG.launch.seq.tipRate, 12);
        }
      }
    }
    // Climb out after a launch from the ground: the nose starts climb.pitchDeg up and eases down to
    // climb.levelDeg over climb.time s (a smooth gain in height that rounds off into flight).
    // Pitching yourself (stick forward / back) takes over.
    if (this.launchClimb) {
      const c = CONFIG.launch.climb, lc = this.launchClimb, jet = this.controller.jet;
      lc.t += dt;
      if (!this.controller.flying || Math.abs(input.forward ?? 0) > 0.1 || lc.t > (lc.time ?? c.time)) this.launchClimb = null;
      else {
        const from = lc.air ? lc.from : c.pitchDeg, to = lc.air ? lc.to : c.levelDeg;
        const u = THREE.MathUtils.smoothstep(lc.t, 0, lc.time ?? c.time);
        jet.pitch = (from + (to - from) * u) * Math.PI / 180;
        // keep the body lined up head first along the climb as it speeds up
        if (lc.t < c.alignTime && !lc.air) {
          // (along the climb angle being flown, so the thrust carries you up it)
          const q = this._jumpQ.setFromAxisAngle(Y, jet.yaw).multiply(this._qTmp2.setFromAxisAngle(this._xAxis.set(1, 0, 0), -(Math.PI / 2 - jet.pitch)));
          this.spinToward(q, 8, 8);
        }
      }
    }
    // How soon will we hit something? (for the brace-for-impact pose)
    if ((this._impactTick = ((this._impactTick ?? 0) + 1) % 4) === 0) this.impactIn = this.timeToImpact();

    // 1. What can each thruster give right now?
    const l = CONFIG.launch;
    const launching = this.launchT > 0;
    if (launching) this.launchT -= dt;
    else this.launchCharge = Math.min(1, this.launchCharge + dt / l.recharge);
    this.caps.launching = launching;
    this.caps.launchPower = this.launchPower ?? 1;
    this.caps.altitude = body.pos.y - CONFIG.pilot.feetHeight;
    // Hover lift reserve: stop a descent / start a climb quickly (the starter suit is barely stronger than gravity)
    const a = CONFIG.assist;
    const vyWant = input.up * a.climbRate - input.down * a.descendRate;
    this.liftReserve = this.controller.mode === 'assist' && !this.grounded && !launching && !input.boost
      && vyWant - body.vel.y > a.liftReserve.below;
    this.boostHeld = input.boost;
    this.takeoffBoostHeld = !!input.takeoffBoost;
    this.lastInput = input;
    // launching: the thrusters spool up to the launch boost over rampTime (no jolt)
    const spool = launching ? THREE.MathUtils.smoothstep(l.time - this.launchT, 0, this.launchRamp ?? l.rampTime) : 0;
    const extra = launching ? 1 + (l.thrustMult * (this.launchPower ?? 1) - 1) * spool : this.liftReserve ? a.liftReserve.thrustMult : 1;
    updateThrusterAvailability(suit, input.boost, dt, extra);
    const thr = suit.thrusters;
    let maxLift = 0, fullDraw = 0;
    for (const t of thr) {
      maxLift += t.available * t.thruster.dir.y;
      fullDraw += t.available * t.thruster.powerPerN;
    }
    // The core may not be able to run every thruster flat out
    // The burst runs on stored charge, so the core isn't the limit while it lasts
    // Boosting in flight overclocks the core (more heat, see boost.heatMult)
    const overclock = input.boost && this.controller.flying ? CONFIG.boost.powerMult : 1;
    const powerOut = suit.powerOutput() * extra * overclock * thermalFactor(suit.core.heat);
    if (fullDraw > powerOut) maxLift *= powerOut / fullDraw;
    this.caps.maxLift = maxLift;
    this.caps.assistGain = suit.assistGain();
    this.caps.sideMax = this.mixer.sideCapacity() * Math.min(1, powerOut / Math.max(1, fullDraw));
    this.twr = maxLift / (body.mass * CONFIG.physics.gravity);

    // Air on the body: lift, drag. The flight assist works with a smoothed estimate.
    aeroForce(body, CONFIG.aero, this.aero, this.controller.flying ? this.controller.jet.spread : 1);
    const k = 1 - Math.exp(-dt / CONFIG.aero.smoothing);
    this.caps.aeroAccel.lerp(this._tmp.copy(this.aero).divideScalar(body.mass), k);

    // 2. What does the pilot want?
    // Thruster cut-off (hover): free-fall while held. Safety catch: if whatever is below is
    // coming up too fast to stop in time, the thrusters fire anyway.
    const hovering = this.controller.mode === 'assist' && !this.controller.flying;
    if (input.cut && hovering && !this.grounded && !this.launchSeq) {
      const co = CONFIG.assist.cutoff, fall = Math.max(0, -body.vel.y);
      const room = body.pos.y - CONFIG.pilot.feetHeight - this.surfaceBelow(body.pos);
      const stop = (fall * fall) / (2 * co.catchAccel);
      if (room < stop * co.safetyMargin + co.safetyExtra) {
        input.cut = false;
        if (!this.safetyCatch) events.emit('toast', { text: 'Thrusters back on: too close to land' });
        this.safetyCatch = true;
        this.catchGrace = CONFIG.assist.cutoff.noDamageTime;
      }
    } else if (!input.cut) this.safetyCatch = false;
    this.cutting = !!input.cut && hovering && !this.grounded;
    this.catchGrace = Math.max(0, (this.catchGrace ?? 0) - dt);
    this.caps.room = body.pos.y - CONFIG.pilot.feetHeight - this.surfaceBelow(body.pos);   // height above whatever's below
    this.caps.stunned = this.stunT > 0;
    if (this.rescue && !input.cut) this.rescue = null;   // the safety catch took over
    if (this.burst) this.stepBurst(dt, input);
    const cmd = this.controller.update(body, input, this.caps, this.grounded, dt);
    if (this.burst) {
      // the thrusters push whatever the path needs (body frame); turning is done in stepBurst
      cmd.force.copy(this.burst.need).applyQuaternion(this._qTmp.copy(body.quat).invert());
      cmd.torque.set(0, 0, 0);
      cmd.thrust = true;
    }
    // Vertical steering jets: reach the climb / descent speed quickly, and catch you after a drop
    if (this.controller.mode === 'assist' && !this.controller.flying && !this.grounded && !input.cut && this.hoverBrakeT <= 0) {
      const a = CONFIG.assist, vyWant = input.up * (input.boost ? a.boostClimbRate : a.climbRate) - input.down * (input.boost ? a.boostClimbRate : a.descendRate);
      // Descending fast: ease off near whatever's below so you never hit hard
      const vyFloor = -Math.sqrt(2 * a.landingBrake * Math.max(0, this.caps.room - 0.5)) - 1;
      const err = Math.max(vyWant, vyFloor) - body.vel.y;
      const lim = err > 0 && body.vel.y < -2 ? a.cutoff.catchAccel : a.vertical.accel;   // braking a fall gets the strongest push
      body.force.y += body.mass * THREE.MathUtils.clamp(err * a.vertical.gain, -a.vertical.accel, lim);
    }
    // Walking: the feet grip the ground at the stick's walking speed (see collide)
    this.walkVel = cmd.walk && this.grounded ? cmd.walk : null;
    if (this.walkVel) {
      // Legs balance you: cancel the tip from the feet being pushed ahead of the body
      const a = this._c.set(this.walkVel.x - body.vel.x, 0, this.walkVel.z - body.vel.z).multiplyScalar(10)
        .clampLength(0, CONFIG.physics.friction * CONFIG.physics.gravity).multiplyScalar(body.mass);
      const foot = body.pointToWorld(FOOT, this._tmp).sub(body.pos);
      body.torque.add(this._c.crossVectors(foot, a).negate());
    }
    // Hover agility: steering jets push you straight toward the stick's speed, so you can move
    // and change direction fast while staying upright (the swivel push alone is too weak)
    if (cmd.hoverVel && !this.controller.flying && this.hoverBrakeT <= 0) {
      const ag = CONFIG.assist.agility;
      const a = this._c.set(cmd.hoverVel.x - body.vel.x, 0, cmd.hoverVel.z - body.vel.z).multiplyScalar(ag.gain)
        .clampLength(0, input.boost ? ag.boostAccel : ag.accel);
      body.force.addScaledVector(a, body.mass);
    }
    // Flight brake: an air-brake (spread out into the wind) down to the brake's target speed
    if (this.controller.flying && this.controller.jet.braking) {
      const sp = body.vel.length(), want = this.controller.jet.brakeTarget, b = CONFIG.flight.brake;
      if (sp > want + 0.5) body.force.addScaledVector(body.vel, -body.mass * Math.min(b.accelG * CONFIG.physics.gravity, (sp - want) * 3) / sp);
    }
    // Just switched from flight to hover: brake hard to a hover (thrust + chest into the wind)
    if (this.hoverBrakeT > 0) {
      this.hoverBrakeT -= dt;
      if (this.controller.flying) this.hoverBrakeT = 0;
      else {
        const eb = CONFIG.assist.exitBrake, g = CONFIG.physics.gravity;
        const a = this._c.set(-body.vel.x, 0, -body.vel.z).multiplyScalar(eb.gain).clampLength(0, eb.maxG * g);
        body.force.addScaledVector(a, body.mass);
      }
    }
    const jet = this.controller.jet;
    if (this.controller.flying) {
      // A fresh barrel roll carries a juke; a finished hard turn fires a burst
      // Auto-steer moves
      if (jet.autoMove) {
        const m = jet.autoMove; jet.autoMove = null;
        const cols = this.world.colliders;
        if (m.type === 'roll') {
          // Smallest sidestep that clears this building without running into the next one:
          // try growing distances along the predicted path until one is clear
          const right = new THREE.Vector3().crossVectors(jet.direction, Y).normalize();
          const vec = m.dir > 0 ? right.negate() : right;
          const av = CONFIG.avoid;
          const time = m.time;
          let shift = null;
          // Is the course correction already enough? Then no roll.
          const fine = pathClear(this.predictCourse(jet, m.ttc + 0.4), cols, 1.5);
          if (fine) { m.need = Infinity; jet.autoHandled = null; jet.autoCool = 0; jet.autoLabelT = 0; jet.autoRollT = 0; }
          for (let d = Math.max(2, m.need); d <= av.rollMax; d += 0.5) {
            if (pathClear(this.predictStep(vec, d, time, m.ttc + 0.5), cols, 2)) { shift = d; break; }
          }
          if (shift != null) {
            this.autoStep = { shift, time };
            if (!jet.startRoll(m.dir, true)) this.autoStep = null;
            else jet.autoDodgeT = time + av.stepSettle;
          } else if (!fine) { jet.autoLabelT = 0; jet.autoRollT = 0; }
        }
        if (m.type === 'hop' && !pathClear(this.predictShove(Y, m.dv), cols, 2)) { m.type = 'none'; jet.autoLabelT = 0; }
        if (m.type === 'snap' && !this.startSnap(m.side)) jet.autoLabelT = 0;
        if (m.type === 'hop') {
          this.hopShove = { dv: m.dv, t: 0, dur: CONFIG.avoid.hopTime };
          jet.jink(0);   // let the hop carry instead of being pulled straight back down
          events.emit('maneuver', { name: 'hop' });
        }
      }
      if (jet.pendingJuke) { this.juke(jet.pendingJuke > 0 ? 'left' : 'right', true); jet.pendingJuke = 0; }
      if (jet.burstPending) {
        jet.burstPending = false;
        this.launchT = Math.max(this.launchT, CONFIG.flight.snap.burstTime);
        body.vel.addScaledVector(jet.direction, CONFIG.flight.snap.kick);
        events.emit('launch');
      }
    } else { jet.pendingJuke = 0; jet.burstPending = false; this.snapState = null; }

    // 3. Gyro handles what torque it can; thrusters do the rest
    const g = suit.gyroTorque() * (launching ? l.gyroMult : 1) + aeroSteering(body.vel.length(), CONFIG.aero);
    this._gyro.set(
      THREE.MathUtils.clamp(cmd.torque.x, -g, g),
      THREE.MathUtils.clamp(cmd.torque.y, -g, g),
      THREE.MathUtils.clamp(cmd.torque.z, -g, g),
    );
    this._rem.subVectors(cmd.torque, this._gyro);

    // 4. Split the work between thrusters (swivelling ones can push sideways too)
    if (cmd.thrust) {
      const t = this._target;
      t[0] = cmd.force.x; t[1] = cmd.force.y; t[2] = cmd.force.z;
      t[3] = this._rem.x; t[4] = this._rem.y; t[5] = this._rem.z;
      const w = cmd.sideways ? CONFIG.allocation.hoverWeights : CONFIG.allocation.weights;
      this.mixer.solve(t, w, CONFIG.allocation.sweeps, !!cmd.sideways);
    } else {
      this.mixer.reset();
      this.mixer.resolve();
    }

    // 5. The power core can only supply so much
    let draw = this.mixer.draw();
    const out = powerOut;
    this.powerLimited = draw > out + 1e-6;
    if (this.powerLimited) {
      this.mixer.scale(out / draw);
      draw = out;
    }
    suit.powerDraw = draw;
    thr.forEach((t, i) => { this.u[i] = t.throttle; });

    // 6. Push the body
    this._F.set(0, 0, 0);
    this._T.copy(this._gyro);
    this.mixer.apply(this._F, this._T);
    body.force.add(this._F.applyQuaternion(body.quat));
    // boosted takeoff: anything the thrusters couldn't give (sideways pull round the curve, or past
    // their power) is topped up so the suit stays on the path
    if (this.burst) body.force.add(this._c.copy(this.burst.need).sub(this._F));
    body.torque.add(this._T.applyQuaternion(body.quat));

    body.force.add(this.aero);
    // Rescue burn: the hand and boot thrusters fire at the ground (shown on the flames)
    if (this.rescue?.phase === 'brake' && this.rescue.level > 0.02) {
      const upBody = this._c.set(0, 1, 0).applyQuaternion(this._qTmp.copy(body.quat).invert());
      for (const t of thr) {
        const slot = t.comp?.slot ?? t.slot;
        if (slot !== 'gauntlets' && slot !== 'boots') continue;
        t.throttle = Math.max(t.throttle, this.rescue.level);
        t.thrustDir.copy(upBody);
      }
    }

    // Auto-steer hop in progress (stored charge, straight up)
    // Launch kick, spread over rampTime along the way you're launching
    if (this.launchKick) {
      const k = this.launchKick, ramp = this.launchRamp ?? CONFIG.launch.rampTime, u = k.t / ramp;
      if (u >= 1) this.launchKick = null;
      else body.force.addScaledVector(this.controller.jet.direction, (body.mass * k.dv * 6 * u * (1 - u)) / ramp);
      k.t += dt;
    }
    if (this.hopShove) {
      const h = this.hopShove;
      body.force.y += (body.mass * h.dv) / h.dur;
      h.t += dt;
      if (h.t >= h.dur) this.hopShove = null;
    }

    // Juke sidestep in progress
    if (this.jukeShove && this.jukeShove.exact) {
      // Follow a smooth sideways profile, then hold the new line (stops the drift)
      const j = this.jukeShove, T = j.dur, x = Math.min(1, j.t / T);
      const sWant = j.shift * minJerk(x);
      const uWant = x < 1 ? (j.shift * 30 * x * x * (1 - x) * (1 - x)) / T : 0;
      const aWant = x < 1 ? (j.shift * 60 * x * (1 - x) * (1 - 2 * x)) / (T * T) : 0;
      const s = this._tmp.copy(body.pos).sub(j.start).addScaledVector(j.vel0, -j.t).dot(j.vec);
      const u = this._tmp.copy(body.vel).sub(j.vel0).dot(j.vec);
      body.force.addScaledVector(j.vec, body.mass * (aWant + 40 * (sWant - s) + 12 * (uWant - u)));
      j.t += dt;
      if (j.t >= T + CONFIG.avoid.stepSettle) this.jukeShove = null;
    } else if (this.jukeShove) {
      const j = this.jukeShove, e = CONFIG.evade;
      body.force.addScaledVector(j.vec, (body.mass * e.jukeSpeed * j.scale) / j.dur);
      j.t += dt;
      if (j.t >= j.dur) this.jukeShove = null;
    }

    // Keep height steady while rolling past something
    if (this.rollHold) {
      const h = this.rollHold, r = CONFIG.evade.rollHold;
      const err = r.kp * (h.y0 + h.vy0 * h.t - body.pos.y) + r.kd * (h.vy0 - body.vel.y);
      body.force.y += body.mass * THREE.MathUtils.clamp(err, -r.maxG * CONFIG.physics.gravity, r.maxG * CONFIG.physics.gravity);
      h.t += dt;
      if (h.t >= (h.time ?? r.time) || !this.controller.flying) this.rollHold = null;
    }

    // A hard turn waiting for room: take it at the first opening
    if (this.pendingSnap) {
      if (!this.controller.flying || this.time > this.pendingSnap.until) {
        if (this.controller.flying) events.emit('toast', { text: 'No room to turn' });
        this.pendingSnap = null;
      } else this.startSnap(this.pendingSnap.side);
    }

    // Hard turn: a stored-charge dump that sheds speed, swings the motion round and fires you out
    if (this.snapState) {
      const s = CONFIG.flight.snap, st = this.snapState;
      st.t += dt;
      const p = Math.min(1, st.t / s.time);
      const e = p * p * (3 - 2 * p);
      const dir = this._tmp.copy(st.from).lerp(st.to, e).normalize();
      const k = p < 0.5
        ? THREE.MathUtils.lerp(1, s.cornerFrac, THREE.MathUtils.smoothstep(p, 0, 0.5))
        : THREE.MathUtils.lerp(s.cornerFrac, s.exitFrac, THREE.MathUtils.smoothstep(p, 0.5, 1));
      const want = dir.multiplyScalar(st.speed * k);
      want.y = body.vel.y;
      const push = this._c.subVectors(want, body.vel).multiplyScalar(body.mass / s.response);
      push.clampLength(0, body.mass * s.maxG * CONFIG.physics.gravity);
      body.force.add(push);
      if (p >= 1) {
        this.snapState = null;
        this.launchT = Math.max(this.launchT, s.burstTime);
        events.emit('launch');
      }
    }

    updateHeat(suit, dt, input.boost);
    this.applyStance();

    // Fast flight: split the move into small steps so we can't skip through walls
    const n = Math.max(1, Math.min(12, Math.ceil((body.vel.length() * dt) / 0.2)));
    this._Fsave.copy(body.force);
    this._Tsave.copy(body.torque);
    for (let i = 0; i < n; i++) {
      body.force.copy(this._Fsave);
      body.torque.copy(this._Tsave);
      body.integrate(dt / n, CONFIG.physics);
      this.collide();
    }
    this.checkRecover(dt);

    // Touching down slowly in flight mode drops back to hover
    if (this.controller.flying && (this.grounded || this.anyContact) && body.vel.length() < CONFIG.flight.autoExitSpeed + (this.grounded ? 0 : 2)) {
      this.controller.exitFlight(body, this.hoverFraction());
      events.emit('toast', { text: 'Landed. Hover mode.' });
    }

    this.course.update(body.pos, this.time);
    this.cargo.update(dt, body, CONFIG.physics);
    this.chase.update(dt, body.pos, this.time);
    this.missiles.update(dt, body, suit);

    // Evade charges and flares refill over time
    const e = CONFIG.evade;
    this.evadeCharge = Math.min(e.charges, this.evadeCharge + dt / e.rechargeTime);
    if (this.flares < e.flares) {
      this.flareTimer += dt;
      if (this.flareTimer >= e.flareRecharge) { this.flareTimer = 0; this.flares++; }
    } else this.flareTimer = 0;
  }

  // Legs keep you upright while standing
  applyStance() {
    if (!this.grounded) return;
    const s = CONFIG.stance, b = this.body;
    this._up.copy(Y).applyQuaternion(b.quat);
    if (this._up.y < s.minUp) return;
    const axis = this._tmp.crossVectors(this._up, Y).multiplyScalar(s.uprightGain);
    const w = b.angVel;
    const wy = w.dot(Y);
    axis.x -= (w.x) * s.damping;
    axis.y -= (w.y - wy) * s.damping;
    axis.z -= (w.z) * s.damping;
    b.torque.add(b.inertiaWorld(axis, this._c));
  }

  collide() {
    const b = this.body, phys = CONFIG.physics;
    this._preHitVel = (this._preHitVel ?? new THREE.Vector3()).copy(b.vel);
    const wasGrounded = this.grounded, lastCollider = this.groundCollider;
    this.grounded = false;
    this.anyContact = false;
    this.groundCollider = null;

    const contacts = [];
    for (const s of SPHERES) {
      b.pointToWorld(s.local, this._c);
      const found = sphereContacts(this._c, s.r, this.world.colliders, []);
      for (const c of found) { c.sphere = s; if (s.foot && this.walkVel) c.surfaceVel = this.walkVel; contacts.push(c); }
    }
    if (!contacts.length) return;
    this.anyContact = true;
    this.supportHeight = -Infinity;
    for (const c of contacts) if (c.normal.y > 0.7) this.supportHeight = Math.max(this.supportHeight, c.point.y);

    let hardest = 0;
    for (const c of contacts) {
      const speed = resolveContact(b, c, phys);
      if (c.sphere.foot && c.normal.y > 0.7) {
        this.grounded = true;
        this.groundCollider = c.collider;
      }
      const dmg = impactDamage(speed);
      if (dmg > 0 && !(this.catchGrace > 0)) applyZoneDamage(this.suit, c.sphere.zone, dmg);   // (never hurt by a safety catch)
      if (speed > hardest) hardest = speed;
      if (speed > 3) events.emit('impact', { point: c.point.clone(), speed });
    }
    if (hardest > CONFIG.damage.safeImpactSpeed) events.emit('crash', { speed: hardest });
    if (hardest > CONFIG.crash.knockSpeed && !(this.catchGrace > 0)) this.knockOut(hardest, this._preHitVel);

    // Push out of whatever we sank into
    const start = b.pos.clone();
    for (const c of contacts) {
      const moved = this._tmp.subVectors(b.pos, start).dot(c.normal);
      const rem = c.depth - moved;
      if (rem > 0) b.pos.addScaledVector(c.normal, rem);
    }

    if (this.grounded && this.groundCollider?.pad && (!wasGrounded || lastCollider !== this.groundCollider)) {
      events.emit('toast', { text: `Landed on ${this.groundCollider.name}` });
    }
  }

  // Lying on the ground? Get back up after a moment.
  // After a knockout in the air: (1) gyros twist the suit to face the ground, spread like a
  // skydiver; (2) the hand and boot jets burn to stop the fall; (3) back to the normal upright hover.
  stepRescue(dt, input) {
    const r = this.rescue, c = CONFIG.crash, b = this.body, g = CONFIG.physics.gravity;
    r.t += dt;
    // too close to the ground: hand over to the safety catch and the normal hover
    if ((this.caps.room ?? 0) < c.rescueAbortRoom) { this.rescue = null; return input; }
    const heading = this.controller.heading ?? yawOf(b.quat);
    const target = (this._rescueQ ??= new THREE.Quaternion()).setFromAxisAngle(Y, heading)
      .multiply(this._qTmp2.setFromAxisAngle(this._xAxis.set(1, 0, 0), -Math.PI / 2));   // head forward, chest to the ground
    this.caps.attTarget = target;
    this.caps.attGain = c.rescueTurnGain;
    r.level = 0;
    // the hand and boot jets twist the suit (much stronger than the gyros): spin toward the
    // target at up to rescueSpin rad/s, settling as it arrives
    const qe = this._qTmp.copy(target).multiply(this._qTmp2.copy(b.quat).invert());
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w);
    const ang = 2 * Math.acos(Math.min(1, qe.w)), sn = Math.sqrt(Math.max(1e-9, 1 - qe.w * qe.w));
    const wDes = this._c.set(qe.x / sn, qe.y / sn, qe.z / sn).multiplyScalar(Math.min(c.rescueSpin, ang * 5));
    const alpha = wDes.sub(b.angVel).multiplyScalar(10);
    b.torque.add(b.inertiaWorld(alpha, alpha));
    r.err = ang;
    if (r.phase === 'orient') {
      if (r.err < c.rescueFacedDeg * Math.PI / 180 || r.t > c.rescueOrientMax) { r.phase = 'brake'; r.t = 0; }
    } else if (r.phase === 'brake') {
      // burn: bring the fall down to a gentle sink, and kill the drift
      const want = -c.rescueSinkSpeed, a = THREE.MathUtils.clamp((want - b.vel.y) * 3, 0, c.rescueBrakeAccel);
      b.force.y += b.mass * (g + a);
      b.force.x -= b.vel.x * b.mass * 1.5; b.force.z -= b.vel.z * b.mass * 1.5;
      r.level = Math.min(1, (g + a) / (g + c.rescueBrakeAccel) * 1.3);
      if (b.vel.y > -c.rescueSinkSpeed - 1 && r.t > 0.35) { this.rescue = null; events.emit('toast', { text: 'Systems back online' }); }
    }
    return { ...input, cut: true, up: 0, down: 0, forward: 0, strafe: 0, yaw: 0, pitch: 0, roll: 0, boost: false, takeoffBoost: false };
  }

  // Boosted takeoff along the burst curve (CONFIG.launch.burst): starts at the jump point, in the
  // direction you face. Speed builds smoothly to burst.speed; the body points along the path
  // (upright at the start, head first once it levels); at the end, normal flight takes over.
  startBurst(origin) {
    const B = CONFIG.launch.burst;
    this.burstPath ??= new BurstPath(B.curve);
    const h = this.controller.heading ?? 0, fwd = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
    const rel = this._c.copy(this.body.pos).sub(origin);
    const x = rel.dot(fwd), y = this.body.pos.y - CONFIG.pilot.feetHeight - origin.y;   // (origin is at the feet)
    const d = this.burstPath.nearest(Math.max(0, x), Math.max(0, y));
    this.burst = { origin: origin.clone(), fwd, heading: h, d, t: 0, v0: this.body.vel.length(), need: new THREE.Vector3(), pitch: Math.PI / 2 };
    this.controller.enterFlight(this.body, this.burstPath.angle(d));
  }

  // Distance along the burst curve where it reaches x metres forward
  burstD(x) {
    const path = this.burstPath;
    this._burstDCache ??= {};
    if (this._burstDCache[x] == null) { const p = path.pts.find((q) => q.x >= x) ?? path.pts[path.pts.length - 1]; this._burstDCache[x] = p.d; }
    return this._burstDCache[x];
  }

  stepBurst(dt) {
    const B = CONFIG.launch.burst, r = this.burst, path = this.burstPath, b = this.body, g = CONFIG.physics.gravity;
    r.t += dt;
    // speed along the path: a hard kick off the jump that tapers off (ease-out), reaching burst.speed by rampTime
    const ut = Math.min(1, r.t / B.rampTime), u = 1 - (1 - ut) ** 3;
    const v = r.v0 + (B.speed - r.v0) * u;
    const dNext = r.d + v * dt;
    // where we should be and how we should be moving, now and a moment from now
    const p = path.at(dNext), a1 = path.angle(dNext), a0 = path.angle(r.d);
    const tgt = this._c.copy(r.origin).addScaledVector(r.fwd, p.x); tgt.y += p.y + CONFIG.pilot.feetHeight;
    const vPrev = r.v ?? r.v0;   // (last step's path speed: the feed-forward includes speeding up)
    const vNow = this._v1.copy(r.fwd).multiplyScalar(Math.cos(a0) * vPrev); vNow.y = Math.sin(a0) * vPrev;
    r.v = v;
    const vNext = this._v2.copy(r.fwd).multiplyScalar(Math.cos(a1) * v); vNext.y = Math.sin(a1) * v;
    // wanted acceleration: follow the curve (feed-forward), match its speed, close any gap
    const aDes = this._v3.copy(vNext).sub(vNow).divideScalar(Math.max(dt, 1e-4))
      .addScaledVector(this._v4.copy(vNext).sub(b.vel), B.velGain)
      .addScaledVector(this._v4.copy(tgt).sub(b.pos), B.posGain);
    // force the thrusters must give: that, plus holding up against gravity, minus the air's push
    r.need.copy(aDes).multiplyScalar(b.mass); r.need.y += b.mass * g; r.need.sub(this.aero);
    r.d = dNext;
    r.pitch = a1;
    // the flight controls hold the same heading and climb angle, ready to take over
    const jet = this.controller.jet;
    jet.yaw = r.heading; jet.pitch = a1;
    // body lined up with the path: upright at the start, head first once level
    const q = this._jumpQ.setFromAxisAngle(Y, r.heading).multiply(this._qTmp2.setFromAxisAngle(this._xAxis.set(1, 0, 0), -(Math.PI / 2 - a1)));
    // barrel rolls along the curve: spin about the body's length (head axis), eased in and out
    const dFrom = B.rollFrom, dTo = Math.min(B.rollTo, path.length);
    const ru = THREE.MathUtils.clamp((r.d - dFrom) / Math.max(1, dTo - dFrom), 0, 1);
    // spin up quickly, hold a steady spin, spin down (so the fastest part isn't much above the average)
    const e = B.rollEase, vmax = 1 / (1 - e);
    const prog = ru < e ? vmax * ru * ru / (2 * e) : ru < 1 - e ? vmax * (e / 2 + ru - e) : 1 - vmax * (1 - ru) ** 2 / (2 * e);
    const progRate = ru < e ? vmax * ru / e : ru < 1 - e ? vmax : vmax * (1 - ru) / e;
    const rollAngle = B.rolls * Math.PI * 2 * prog;
    if (rollAngle > 0 && ru < 1) {
      q.multiply(this._qTmp2.setFromAxisAngle(this._xAxis.set(0, 1, 0), rollAngle));
      // (rolls are scripted: set the body's turn directly, with its spin so the poses tuck in)
      const rate = B.rolls * Math.PI * 2 * progRate * v / Math.max(1, dTo - dFrom);
      b.quat.copy(q);
      b.angVel.copy(this._v4.set(0, 1, 0).applyQuaternion(q)).multiplyScalar(rate);
    } else this.spinToward(q, B.turnRate, 16);
    if (r.d >= path.length) this.burst = null;   // end of the curve: normal flight from here
  }

  // Turn the body toward an orientation with a strong jet-assisted spin (up to maxRate rad/s)
  spinToward(target, maxRate, gain = 5) {
    const b = this.body;
    const qe = this._qTmp.copy(target).multiply(this._qTmp3.copy(b.quat).invert());
    if (qe.w < 0) qe.set(-qe.x, -qe.y, -qe.z, -qe.w);
    const ang = 2 * Math.acos(Math.min(1, qe.w)), sn = Math.sqrt(Math.max(1e-9, 1 - qe.w * qe.w));
    const wDes = this._c.set(qe.x / sn, qe.y / sn, qe.z / sn).multiplyScalar(Math.min(maxRate, ang * gain));
    const alpha = wDes.sub(b.angVel).multiplyScalar(gain * 2);
    b.torque.add(b.inertiaWorld(alpha, alpha));
    return ang;
  }

  // A hard hit knocks the pilot out for a moment (longer for harder hits)
  knockOut(speed, before) {
    const c = CONFIG.crash;
    // No hit is perfectly centred: the body is sent tumbling (more for harder hits), feet carrying on
    // the way you were going while the head stops
    if (this.stunT <= 0) {
      const b = this.body, dir = (before ?? b.vel).clone().normalize();
      const head = this._c.set(0, 1, 0).applyQuaternion(b.quat);
      const axis = new THREE.Vector3().crossVectors(head, dir);
      if (axis.lengthSq() < 0.05) axis.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      axis.normalize().applyAxisAngle(dir, (Math.random() - 0.5) * 0.8);
      b.angVel.addScaledVector(axis, -speed * c.tumble);
    }
    const t = Math.min(c.stunMax, c.stunMin + (speed - c.knockSpeed) * c.stunPerMs);
    if (this.stunT <= 0) events.emit('toast', { text: 'Crash! Suit rebooting…', kind: 'hot' });
    if (this.stunT <= 0) this.knockFlying = this.controller.flying;   // (a new knockout: were we flying?)
    this.stunT = Math.max(this.stunT, t);
    if (this.controller.flying) this.controller.exitFlight(this.body, this.hoverFraction());
  }

  // Seconds until the suit's path meets a building or the ground (Infinity if clear / slow)
  timeToImpact() {
    const b = this.body, v = b.vel.length(), c = CONFIG.crash;
    if (v < c.braceSpeed) return Infinity;
    const d = this._c.copy(b.vel).divideScalar(v), reach = v * c.braceTime * 1.5;
    let best = Infinity;
    for (const col of this.world.colliders) {
      const t = rayBox(b.pos, d, col.min, col.max, 0.6, reach);
      if (t < best) best = t;
    }
    if (b.vel.y < -1) best = Math.min(best, Math.max(0, this.caps.room ?? Infinity) / Math.max(0.01, -d.y) / 1);
    return best / v;
  }

  checkRecover(dt) {
    const b = this.body;
    this._up.copy(Y).applyQuaternion(b.quat);
    const lying = this.anyContact && this._up.y < CONFIG.stance.minUp && b.vel.length() < 2;
    this.recoverTimer = lying ? this.recoverTimer + dt : 0;
    if (this.recoverTimer < CONFIG.recover.delay) return;
    const heading = yawOf(b.quat);
    b.quat.setFromAxisAngle(Y, heading);
    const floor = Number.isFinite(this.supportHeight) ? this.supportHeight : b.pos.y - 0.3;
    b.pos.y = floor + CONFIG.pilot.feetHeight + 0.02;
    b.vel.set(0, 0, 0);
    b.angVel.set(0, 0, 0);
    this.controller.reset(heading);
    this.recoverTimer = 0;
    events.emit('toast', { text: 'Back on your feet' });
  }

  telemetry() {
    const b = this.body, s = this.suit;
    const held = this.cargo.held;
    return {
      alt: Math.max(0, b.pos.y - CONFIG.pilot.feetHeight),
      speed: b.vel.length(),
      vs: b.vel.y,
      twr: this.twr,
      mass: b.mass,
      mode: this.controller.mode,
      cutting: this.cutting,
      braking: this.controller.flying && this.controller.jet.braking,
      throttle: this.controller.flying ? this.controller.jet.throttle : this.controller.throttle,
      gLoad: this.controller.flying ? this.controller.jet.gLoad : 1,
      launchCharge: this.launchCharge,
      carving: this.controller.flying && this.controller.jet.carving,
      avoiding: this.controller.flying ? this.controller.jet.avoiding : null,
      autoLabel: this.controller.flying && this.controller.jet.autoLabelT > 0 ? this.controller.jet.autoLabel : '',
      autoSteer: this.caps.autoSteer,
      snapping: this.controller.flying && this.controller.jet.snapT > 0,
      snapWaiting: !!this.pendingSnap,
      evadeCharge: this.evadeCharge,
      flares: this.flares,
      missiles: {
        inZone: this.missiles.inZone,
        zoneDistance: this.missiles.zoneDistance(b.pos),
        incoming: this.missiles.missiles.filter((m) => m.target === 'player').length,
        lockTime: this.missiles.lockTime,
        ...this.missiles.stats,
      },
      launching: this.launchT > 0,
      powerDraw: s.powerDraw,
      powerOut: s.powerOutput(),
      powerLimited: this.powerLimited,
      glitch: s.hudGlitch(),
      components: s.list,
      course: {
        next: this.course.next,
        total: this.course.rings.length,
        running: this.course.running,
        elapsed: this.course.elapsed(this.time),
        best: this.course.best,
      },
      cargo: {
        held: held ? { name: held.name, mass: held.mass } : null,
        inRange: this.cargo.crates.find((c) => c.inRange)?.name ?? null,
        crates: this.cargo.crates.map((c) => ({ name: c.name, mass: c.mass, delivered: c.delivered })),
      },
      chase: {
        state: this.chase.state,
        distance: this.chase.distance,
        progress: this.chase.progress,
        elapsed: this.chase.elapsed(this.time),
        best: this.chase.best,
      },
      atWorkshop: this.world.isAtWorkshop(b.pos),
    };
  }
}

// Smooth 0..1 ease (minimum jerk)
function minJerk(x) { return x * x * x * (10 - 15 * x + 6 * x * x); }
