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
import { pathClear } from '../flight/avoidance.js';

const Y = new THREE.Vector3(0, 1, 0);
const SPHERES = CONFIG.collision.spheres.map((s) => ({ ...s, local: new THREE.Vector3(...s.pos) }));

// The simulation. No rendering, no DOM: it can run headless and is easy to port.
export class Game {
  constructor(loadout) {
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
    this.anyContact = false;
    this.groundCollider = null;
    this.recoverTimer = 0;
    this.powerLimited = false;
    this.twr = 0;
    this.launchT = 0;
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
    this.launchCharge = 1;
    this.syncMass();
  }

  // Dump the stored charge into the thrusters for a burst of speed
  launch() {
    const l = CONFIG.launch;
    if (this.launchCharge < 1) {
      events.emit('toast', { text: `Flight mode. Burst recharging (${Math.round(this.launchCharge * 100)}%)` });
      return;
    }
    this.launchCharge = 0;
    this.launchT = l.time;
    this.body.vel.addScaledVector(this.controller.jet.direction, l.kick);
    events.emit('launch');
  }

  // Sharp sidestep: a burst from the stored charge
  // Sidestep left or right. In flight it rides along with a barrel roll.
  juke(dir, fromRoll = false) {
    const e = CONFIG.evade;
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
    const scale = flying ? (this.autoJukeScale ?? 1) : e.hoverJukeScale;
    this.autoJukeScale = null;
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
    if (!this.controller.jet.snap(side, v.length())) return true;   // cooling down: don't queue it
    this.snapState = { t: 0, from: pred.from, to: pred.to, speed: pred.speed };
    this.pendingSnap = null;
    events.emit('maneuver', { name: 'snap' });
    return true;
  }

  // Where would a sidestep (juke) or hop take us over the next moment?
  predictShove(vec, dv) {
    const pts = [], b = this.body;
    for (let t = 0.05; t <= 0.8; t += 0.05) pts.push(b.pos.clone().addScaledVector(b.vel, t).addScaledVector(vec, dv * Math.min(t, 0.5)));
    return pts;
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
          events.emit('toast', { text: 'Hover mode' });
        } else {
          // From the ground, launch upward like a rocket
          this.controller.enterFlight(this.body, this.grounded ? CONFIG.launch.groundPitch : null);
          this.launch();
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
        const what = { off: 'Off', light: 'Light (nudges, hops, rolls)', full: 'Full (adds hard turns and braking)' }[this.caps.autoSteer];
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
        this.fireFlares();
        break;
      case 'mode': {
        if (this.controller.flying) {
          this.fireFlares();   // in flight the hover-mode button drops flares
          break;
        }
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
    this.time += dt;
    suit.time = this.time;

    // 1. What can each thruster give right now?
    const l = CONFIG.launch;
    const launching = this.launchT > 0;
    if (launching) this.launchT -= dt;
    else this.launchCharge = Math.min(1, this.launchCharge + dt / l.recharge);
    this.caps.launching = launching;
    this.caps.altitude = body.pos.y - CONFIG.pilot.feetHeight;
    // Hover lift reserve: stop a descent / start a climb quickly (the starter suit is barely stronger than gravity)
    const a = CONFIG.assist;
    const vyWant = input.up * a.climbRate - input.down * a.descendRate;
    this.liftReserve = this.controller.mode === 'assist' && !this.grounded && !launching && !input.boost
      && vyWant - body.vel.y > a.liftReserve.below;
    const extra = launching ? l.thrustMult : this.liftReserve ? a.liftReserve.thrustMult : 1;
    updateThrusterAvailability(suit, input.boost, dt, extra);
    const thr = suit.thrusters;
    let maxLift = 0, fullDraw = 0;
    for (const t of thr) {
      maxLift += t.available * t.thruster.dir.y;
      fullDraw += t.available * t.thruster.powerPerN;
    }
    // The core may not be able to run every thruster flat out
    // The burst runs on stored charge, so the core isn't the limit while it lasts
    const powerOut = suit.powerOutput() * extra * thermalFactor(suit.core.heat);
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
    const cmd = this.controller.update(body, input, this.caps, this.grounded, dt);
    const jet = this.controller.jet;
    if (this.controller.flying) {
      // A fresh barrel roll carries a juke; a finished hard turn fires a burst
      // Auto-steer moves
      if (jet.autoMove) {
        const m = jet.autoMove; jet.autoMove = null;
        const cols = this.world.colliders;
        if (m.type === 'roll') {
          // Size the sidestep to what's needed, and only if that path is clear
          const right = new THREE.Vector3().crossVectors(jet.direction, Y).normalize();
          const vec = m.dir > 0 ? right.negate() : right;
          const scale = THREE.MathUtils.clamp(m.need / CONFIG.avoid.rollShift, 0.35, 1);
          if (pathClear(this.predictShove(vec, CONFIG.evade.jukeSpeed * scale), cols, 2)) {
            this.autoJukeScale = scale;
            jet.startRoll(m.dir, true);
          } else jet.autoLabelT = 0;
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
    body.torque.add(this._T.applyQuaternion(body.quat));

    body.force.add(this.aero);

    // Auto-steer hop in progress (stored charge, straight up)
    if (this.hopShove) {
      const h = this.hopShove;
      body.force.y += (body.mass * h.dv) / h.dur;
      h.t += dt;
      if (h.t >= h.dur) this.hopShove = null;
    }

    // Juke sidestep in progress
    if (this.jukeShove) {
      const j = this.jukeShove, e = CONFIG.evade;
      body.force.addScaledVector(j.vec, (body.mass * e.jukeSpeed * j.scale) / j.dur);
      j.t += dt;
      if (j.t >= j.dur) this.jukeShove = null;
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
    const wasGrounded = this.grounded, lastCollider = this.groundCollider;
    this.grounded = false;
    this.anyContact = false;
    this.groundCollider = null;

    const contacts = [];
    for (const s of SPHERES) {
      b.pointToWorld(s.local, this._c);
      const found = sphereContacts(this._c, s.r, this.world.colliders, []);
      for (const c of found) { c.sphere = s; contacts.push(c); }
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
      if (dmg > 0) applyZoneDamage(this.suit, c.sphere.zone, dmg);
      if (speed > hardest) hardest = speed;
      if (speed > 3) events.emit('impact', { point: c.point.clone(), speed });
    }
    if (hardest > CONFIG.damage.safeImpactSpeed) events.emit('crash', { speed: hardest });

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
