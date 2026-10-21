import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';
import { sphereContacts } from '../physics/collision.js';

const _hold = new THREE.Vector3();
const _offset = new THREE.Vector3();

// Crates you can pick up and carry. Holding one adds its mass to the suit.
export class CargoSystem {
  constructor(defs, world) {
    this.world = world;
    this.crates = defs.map((d) => ({
      ...d,
      home: new THREE.Vector3(...d.pos),
      pos: new THREE.Vector3(...d.pos),
      vel: new THREE.Vector3(),
      delivered: false,
      inRange: false,
    }));
    this.held = null;
  }

  get heldMass() { return this.held ? this.held.mass : 0; }

  holdPoint(body, out) {
    _offset.set(...CONFIG.cargo.holdOffset);
    return body.pointToWorld(_offset, out);
  }

  // Returns true if the carried mass changed
  toggleGrab(body) {
    if (this.held) {
      this.held.vel.copy(body.vel);
      events.emit('toast', { text: `Dropped ${this.held.name}` });
      this.held = null;
      return true;
    }
    this.holdPoint(body, _hold);
    let best = null, bestD = CONFIG.cargo.grabRange;
    for (const c of this.crates) {
      const d = c.pos.distanceTo(_hold);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) {
      events.emit('toast', { text: 'Nothing close enough to grab' });
      return false;
    }
    this.held = best;
    best.delivered = false;
    events.emit('toast', { text: `Picked up ${best.name} (${best.mass} kg)` });
    return true;
  }

  release() { this.held = null; }

  reset() {
    this.held = null;
    for (const c of this.crates) {
      c.pos.copy(c.home);
      c.vel.set(0, 0, 0);
      c.delivered = false;
    }
  }

  update(dt, body, physics) {
    const r = CONFIG.cargo.radius;
    this.holdPoint(body, _hold);
    for (const c of this.crates) {
      c.inRange = !this.held && c.pos.distanceTo(_hold) < CONFIG.cargo.grabRange;
      if (c === this.held) {
        c.pos.copy(_hold);
        c.vel.copy(body.vel);
        continue;
      }
      // Simple falling box: gravity, drag, bounce off the world
      c.vel.y -= physics.gravity * dt;
      c.vel.multiplyScalar(1 - 0.05 * dt);
      c.pos.addScaledVector(c.vel, dt);

      const contacts = sphereContacts(c.pos, r, this.world.colliders, [], this.world.groundAt);
      let onDelivery = false;
      for (const k of contacts) {
        c.pos.addScaledVector(k.normal, k.depth);
        const vn = c.vel.dot(k.normal);
        if (vn < 0) c.vel.addScaledVector(k.normal, -vn * 1.2);
        // Ground friction
        if (k.normal.y > 0.7) {
          c.vel.x *= 1 - Math.min(1, 8 * dt);
          c.vel.z *= 1 - Math.min(1, 8 * dt);
          if (k.collider.delivery) onDelivery = true;
        }
      }
      if (onDelivery && !c.delivered && c.vel.length() < 1) {
        c.delivered = true;
        events.emit('cargo:delivered', { crate: c, deliveredCount: this.crates.filter((x) => x.delivered).length });
      }
    }
  }
}
