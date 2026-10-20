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
import { allocate } from '../flight/allocator.js';
import { World } from '../world/World.js';
import { Course } from '../world/course.js';
import { CargoSystem } from '../world/cargo.js';
import { ChaseDrone } from '../world/chase.js';
import { aeroForce, aeroSteering } from '../physics/aero.js';

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
    this.time = 0;
    this.grounded = false;
    this.anyContact = false;
    this.groundCollider = null;
    this.recoverTimer = 0;
    this.powerLimited = false;
    this.twr = 0;
    this.launchT = 0;
    this.launchCharge = 1;
    this.caps = { maxLift: 0, assistGain: 1, aeroAccel: new THREE.Vector3() };
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
    this.cols = this.suit.thrusters.map(() => new Float64Array(6));
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
    this.u.fill(0);
    this.caps.aeroAccel.set(0, 0, 0);
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
        if (this.controller.flying && this.controller.jet.flip()) events.emit('maneuver', { name: 'flip' });
        break;
      case 'mode': {
        if (this.controller.flying) {
          events.emit('toast', { text: 'Press F to leave flight mode first' });
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
        events.emit('toast', { text: 'Back at the workshop. Suit repaired.' });
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
    updateThrusterAvailability(suit, input.boost, dt, launching ? l.thrustMult : 1);
    const thr = suit.thrusters;
    let maxLift = 0, fullDraw = 0;
    for (const t of thr) {
      maxLift += t.available * t.thruster.dir.y;
      fullDraw += t.available * t.thruster.powerPerN;
    }
    // The core may not be able to run every thruster flat out
    // The burst runs on stored charge, so the core isn't the limit while it lasts
    const powerOut = suit.powerOutput() * (launching ? l.thrustMult : 1) * thermalFactor(suit.core.heat);
    if (fullDraw > powerOut) maxLift *= powerOut / fullDraw;
    this.caps.maxLift = maxLift;
    this.caps.assistGain = suit.assistGain();
    this.twr = maxLift / (body.mass * CONFIG.physics.gravity);

    // Air on the body: lift, drag. The flight assist works with a smoothed estimate.
    aeroForce(body, CONFIG.aero, this.aero, this.controller.flying ? this.controller.jet.spread : 1);
    const k = 1 - Math.exp(-dt / CONFIG.aero.smoothing);
    this.caps.aeroAccel.lerp(this._tmp.copy(this.aero).divideScalar(body.mass), k);

    // 2. What does the pilot want?
    const cmd = this.controller.update(body, input, this.caps, this.grounded, dt);

    // 3. Gyro handles what torque it can; thrusters do the rest
    const g = suit.gyroTorque() * (launching ? l.gyroMult : 1) + aeroSteering(body.vel.length(), CONFIG.aero);
    this._gyro.set(
      THREE.MathUtils.clamp(cmd.torque.x, -g, g),
      THREE.MathUtils.clamp(cmd.torque.y, -g, g),
      THREE.MathUtils.clamp(cmd.torque.z, -g, g),
    );
    this._rem.subVectors(cmd.torque, this._gyro);

    // 4. Split the work between thrusters
    if (cmd.thrust) {
      for (let i = 0; i < thr.length; i++) {
        const a = thr[i].available, d = thr[i].thruster.dir, tq = thr[i].thruster.torque, col = this.cols[i];
        col[0] = d.x * a; col[1] = d.y * a; col[2] = d.z * a;
        col[3] = tq.x * a; col[4] = tq.y * a; col[5] = tq.z * a;
      }
      const t = this._target;
      t[0] = cmd.force.x; t[1] = cmd.force.y; t[2] = cmd.force.z;
      t[3] = this._rem.x; t[4] = this._rem.y; t[5] = this._rem.z;
      allocate(this.cols, t, CONFIG.allocation.weights, this.u, CONFIG.allocation.sweeps);
    } else {
      this.u.fill(0);
    }

    // 5. The power core can only supply so much
    let draw = 0;
    for (let i = 0; i < thr.length; i++) draw += this.u[i] * thr[i].available * thr[i].thruster.powerPerN;
    const out = powerOut;
    this.powerLimited = draw > out + 1e-6;
    if (this.powerLimited) {
      const k = out / draw;
      for (let i = 0; i < thr.length; i++) this.u[i] *= k;
      draw = out;
    }
    suit.powerDraw = draw;

    // 6. Push the body
    this._F.set(0, 0, 0);
    this._T.copy(this._gyro);
    for (let i = 0; i < thr.length; i++) {
      const f = this.u[i] * thr[i].available;
      thr[i].throttle = this.u[i];
      this._F.addScaledVector(thr[i].thruster.dir, f);
      this._T.addScaledVector(thr[i].thruster.torque, f);
    }
    body.force.add(this._F.applyQuaternion(body.quat));
    body.torque.add(this._T.applyQuaternion(body.quat));

    body.force.add(this.aero);

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
