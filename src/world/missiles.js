import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';
import { applyZoneDamage } from '../suit/damage.js';

const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _a = new THREE.Vector3();

const insideBox = (p, c) => p.x > c.min.x && p.x < c.max.x && p.y > c.min.y && p.y < c.max.y && p.z > c.min.z && p.z < c.max.z;

// Guided missiles and flares for the evasion range.
// Missiles chase with a turn limit and a seeker that only updates now and then,
// so hard turns, jukes, rolls and ducking behind pillars all make them miss.
export class MissileSystem {
  constructor(evasion, world) {
    this.world = world;
    this.zone = { center: new THREE.Vector3(evasion.center[0], 0, evasion.center[1]), radius: evasion.radius };
    this.launchers = evasion.launchers.map((p, i) => ({ pos: new THREE.Vector3(...p), cooldown: 2 + i * 1.7 }));
    this.missiles = [];
    this.flares = [];
    this.explosions = [];   // recent blasts, for the visuals
    this.stats = { fired: 0, dodged: 0, hits: 0 };
    this.missReasons = { terrain: 0, fuel: 0 };
    this.inZone = false;
  }

  reset() {
    this.missiles.length = 0;
    this.flares.length = 0;
    this.stats = { fired: 0, dodged: 0, hits: 0 };
    this.missReasons = { terrain: 0, fuel: 0 };
    this.launchers.forEach((l, i) => { l.cooldown = 2 + i * 1.7; });
  }

  zoneDistance(pos) {
    return Math.max(0, Math.hypot(pos.x - this.zone.center.x, pos.z - this.zone.center.z) - this.zone.radius);
  }

  fireFlares(body) {
    const e = CONFIG.evade;
    for (let i = 0; i < e.flaresPerShot; i++) {
      const v = body.vel.clone().multiplyScalar(0.5)
        .add(new THREE.Vector3((Math.random() - 0.5) * 14, -4 + Math.random() * 4, (Math.random() - 0.5) * 14));
      this.flares.push({ pos: body.pos.clone(), vel: v, age: 0, alive: true });
    }
    // Missiles looking roughly at a flare may switch to it
    for (const m of this.missiles) {
      if (!m.alive || m.target !== 'player') continue;
      const flare = this.flares[this.flares.length - 1];
      _d.subVectors(flare.pos, m.pos).normalize();
      const angle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(_d.dot(_a.copy(m.vel).normalize()), -1, 1)));
      if (angle < CONFIG.missiles.flareCone && Math.random() < CONFIG.missiles.flareChance) {
        m.target = flare;
        events.emit('missile:decoyed');
      }
    }
  }

  launch(l, body) {
    const c = CONFIG.missiles;
    const pos = l.pos.clone().add(new THREE.Vector3(0, 4, 0));
    const vel = _d.subVectors(body.pos, pos).normalize().multiplyScalar(20).addScaledVector(Y, 25);
    this.missiles.push({
      pos, vel: vel.clone(), age: 0, alive: true, target: 'player',
      seen: body.pos.clone(), seenVel: body.vel.clone(), seekTimer: 0,
    });
    this.stats.fired++;
    events.emit('missile:launch', { pos });
  }

  update(dt, body, suit) {
    const c = CONFIG.missiles;
    const alt = body.pos.y - CONFIG.pilot.feetHeight;
    this.inZone = this.zoneDistance(body.pos) === 0 && alt > c.minAltitude;

    // Launch
    const alive = this.missiles.filter((m) => m.alive).length;
    for (const l of this.launchers) {
      l.cooldown -= dt;
      if (this.inZone && l.cooldown <= 0 && alive < c.maxAlive && l.pos.distanceTo(body.pos) < c.range) {
        this.launch(l, body);
        l.cooldown = c.fireInterval * (0.8 + Math.random() * 0.6);
        break;
      }
    }

    // Flares
    for (const f of this.flares) {
      if (!f.alive) continue;
      f.age += dt;
      f.vel.y -= 4 * dt;
      f.vel.multiplyScalar(1 - 0.8 * dt);
      f.pos.addScaledVector(f.vel, dt);
      if (f.age > CONFIG.evade.flareBurn) f.alive = false;
    }
    this.flares = this.flares.filter((f) => f.alive);

    // Missiles
    this.lockTime = Infinity;
    for (const m of this.missiles) {
      if (!m.alive) continue;
      m.age += dt;
      const chasingPlayer = m.target === 'player';
      const target = chasingPlayer ? body : m.target;

      // Seeker: refreshes the target's position only every so often
      m.seekTimer -= dt;
      if (m.seekTimer <= 0 && (chasingPlayer || target.alive)) {
        m.seekTimer = c.seekerUpdate;
        m.seen.copy(target.pos);
        m.seenVel.copy(target.vel);
      }
      const speedWant = c.speed * Math.min(1, 0.3 + m.age / c.boostTime);
      const speed = m.vel.length();
      const dist = m.pos.distanceTo(m.seen);
      const tGo = dist / Math.max(20, speed);
      _aim.copy(m.seen).addScaledVector(m.seenVel, tGo * c.lead);
      _d.subVectors(_aim, m.pos).normalize().multiplyScalar(speedWant);
      // Turn toward the aim point, limited by how many G the missile can pull
      _a.subVectors(_d, m.vel).multiplyScalar(c.navGain);
      const along = _a.dot(_d.normalize());
      const lateral = _a.addScaledVector(_d, -along).clampLength(0, c.maxG * 9.81);
      m.vel.add(lateral.multiplyScalar(dt));
      m.vel.setLength(speed + (speedWant - speed) * Math.min(1, 3 * dt));
      m.pos.addScaledVector(m.vel, dt);

      // Hit the player?
      const dPlayer = m.pos.distanceTo(body.pos);
      if (dPlayer < c.proximity) { this.detonate(m, body, suit, dPlayer); continue; }
      if (chasingPlayer) {
        _d.subVectors(m.pos, body.pos).normalize();
        const closing = -(m.vel.dot(_d) - body.vel.dot(_d));
        if (closing > 1) this.lockTime = Math.min(this.lockTime, dPlayer / closing);
      }
      // Hit the world, or run out of fuel
      const hitWorld = m.pos.y < this.world.groundAt(m.pos.x, m.pos.z) + 0.3 || this.world.colliders.some((col) => insideBox(m.pos, col));
      if (hitWorld || m.age > c.fuel) {
        this.missReasons[hitWorld ? 'terrain' : 'fuel']++;
        this.detonate(m, null, null, Infinity);
      }
    }
    this.missiles = this.missiles.filter((m) => m.alive);
    this.explosions = this.explosions.filter((e) => (e.age += dt) < 1);
  }

  detonate(m, body, suit, dPlayer) {
    const c = CONFIG.missiles;
    m.alive = false;
    this.explosions.push({ pos: m.pos.clone(), age: 0 });
    if (body && dPlayer < c.proximity) {
      const strength = 1 - dPlayer / (c.proximity * 1.6);
      const dmg = c.damage * strength;
      // The blast hits the chest and whatever part faced it
      _d.subVectors(m.pos, body.pos);
      const local = body.toBody(_d, new THREE.Vector3());
      const side = Math.abs(local.x) > Math.abs(local.y)
        ? (local.x < 0 ? (Math.random() < 0.5 ? 'handL' : 'bootL') : (Math.random() < 0.5 ? 'handR' : 'bootR'))
        : local.y > 0 ? 'helmet' : 'back';
      applyZoneDamage(suit, 'chest', dmg * 0.6);
      applyZoneDamage(suit, side, dmg * 0.4);
      body.vel.addScaledVector(_d.normalize(), -6);
      this.stats.hits++;
      events.emit('missile:hit', { pos: m.pos.clone(), damage: dmg });
    } else {
      this.stats.dodged++;
      events.emit('missile:dodged', { pos: m.pos.clone() });
    }
  }
}
