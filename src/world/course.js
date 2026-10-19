import * as THREE from '../lib/three.js';
import { events } from '../core/events.js';
import { storage } from '../core/storage.js';

const _d = new THREE.Vector3();

// Ring course: fly through rings in order. Passing ring 1 starts the clock.
export class Course {
  constructor(rings) {
    this.rings = rings;
    this.next = 0;
    this.running = false;
    this.startTime = 0;
    this.last = null;
    this.best = storage.get('bestTime', null);
  }

  reset() {
    this.next = 0;
    this.running = false;
  }

  passes(ring, pos) {
    _d.subVectors(pos, ring.center);
    const along = _d.dot(ring.normal);
    const radial = _d.addScaledVector(ring.normal, -along).length();
    return Math.abs(along) < 1.2 && radial < ring.radius;
  }

  update(pos, time) {
    // Flying through ring 1 always starts a fresh run
    if (this.next !== 0 && this.passes(this.rings[0], pos) && this.next !== 1) {
      this.next = 0;
    }
    const ring = this.rings[this.next];
    if (!this.passes(ring, pos)) return;

    if (this.next === 0) {
      this.running = true;
      this.startTime = time;
      events.emit('course:start');
    }
    events.emit('course:ring', { index: this.next, total: this.rings.length });
    this.next++;

    if (this.next === this.rings.length) {
      const t = time - this.startTime;
      const record = this.best == null || t < this.best;
      if (record) {
        this.best = t;
        storage.set('bestTime', t);
      }
      this.last = t;
      this.running = false;
      this.next = 0;
      events.emit('course:finish', { time: t, best: this.best, record });
    }
  }

  elapsed(time) { return this.running ? time - this.startTime : this.last; }
}
