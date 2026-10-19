import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';
import { storage } from '../core/storage.js';

// A drone that runs a loop through the city when you get close.
// Stay within tagging range long enough to catch it. It speeds up when you're close
// and waits for you when you fall behind, so it's always a chase.
export class ChaseDrone {
  constructor(path) {
    this.curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), true, 'centripetal');
    this.length = this.curve.getLength();
    this.pos = this.curve.getPointAt(0);
    this.dir = this.curve.getTangentAt(0);
    this.state = 'idle';
    this.s = 0;
    this.speed = 0;
    this.tag = 0;
    this.startTime = 0;
    this.distance = Infinity;
    this.best = storage.get('chaseBest', null);
    this.last = null;
    this.cooldown = 0;
  }

  reset() {
    this.state = 'idle';
    this.s = 0;
    this.speed = 0;
    this.tag = 0;
    this.pos.copy(this.curve.getPointAt(0));
    this.dir.copy(this.curve.getTangentAt(0));
  }

  update(dt, playerPos, time) {
    const c = CONFIG.chase;
    this.distance = this.pos.distanceTo(playerPos);

    if (this.state === 'caught') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.reset();
      return;
    }
    if (this.state === 'idle') {
      if (this.distance < c.startRadius) {
        this.state = 'running';
        this.startTime = time;
        this.speed = c.minSpeed;
        events.emit('chase:start');
      }
      return;
    }

    // Rubber band: faster when you're close, slower when you're far behind
    const want = THREE.MathUtils.clamp(c.maxSpeed - (this.distance - c.tagRadius) * c.catchUpGain, c.minSpeed, c.maxSpeed);
    this.speed += (want - this.speed) * Math.min(1, 2 * dt);
    this.s = (this.s + this.speed * dt) % this.length;
    const u = this.s / this.length;
    this.curve.getPointAt(u, this.pos);
    this.curve.getTangentAt(u, this.dir);

    if (this.distance < c.tagRadius) this.tag += dt;
    else this.tag = Math.max(0, this.tag - dt * 0.5);

    if (this.tag >= c.tagTime) {
      const t = time - this.startTime;
      const record = this.best == null || t < this.best;
      if (record) { this.best = t; storage.set('chaseBest', t); }
      this.last = t;
      this.state = 'caught';
      this.cooldown = 4;
      events.emit('chase:caught', { time: t, record });
    } else if (this.distance > c.loseDistance) {
      events.emit('chase:lost');
      this.reset();
    }
  }

  get progress() { return Math.min(1, this.tag / CONFIG.chase.tagTime); }
  elapsed(time) { return this.state === 'running' ? time - this.startTime : this.last; }
}
