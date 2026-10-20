import * as THREE from '../lib/three.js';

const Y = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _aim = new THREE.Vector3();

// Distance along a ray to an axis-aligned box grown by `margin` (Infinity if missed).
function rayBox(o, d, min, max, margin, maxDist) {
  let t0 = 0, t1 = maxDist;
  for (const ax of ['x', 'y', 'z']) {
    const lo = min[ax] - margin, hi = max[ax] + margin;
    if (Math.abs(d[ax]) < 1e-9) {
      if (o[ax] < lo || o[ax] > hi) return Infinity;
      continue;
    }
    let a = (lo - o[ax]) / d[ax], b = (hi - o[ax]) / d[ax];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

// Looks ahead along where the suit is going. If a building or the ground is in the way,
// it measures the obstacle (its corners as seen from the suit) and works out the smallest
// change of direction that clears it: over the top, around the left or around the right.
export class ObstacleSensor {
  constructor(cfg) {
    this.cfg = cfg;
    this.plan = { active: false, kind: null, angle: 0, ttc: Infinity, dist: Infinity, urgency: 0, brake: false, name: '' };
    this.lastTarget = null;
    this.lastKind = null;
  }

  // Looks along the current motion and along where you're steering; returns the most urgent plan.
  scan(pos, vel, aim, colliders, altitude, maxAccel) {
    const c = this.cfg, plan = this.plan;
    plan.active = false;
    plan.urgency = 0;
    const speed = vel.length();
    if (!c.enabled || speed < c.minSpeed) { this.lastTarget = null; return plan; }

    let best = null;
    _dir.copy(vel).divideScalar(speed);
    best = this.probe(pos, _dir, speed, colliders, altitude, maxAccel);
    if (aim && aim.dot(_dir) < 0.995) {
      // Also look where you're turning
      const aimPlan = this.probe(pos, _aim.copy(aim).normalize(), speed, colliders, altitude, maxAccel);
      if (aimPlan && (!best || aimPlan.urgency > best.urgency)) best = aimPlan;
    }
    if (!best) { this.lastTarget = null; return plan; }
    Object.assign(plan, best);
    this.lastTarget = best.target;
    this.lastKind = best.kind;
    plan.active = plan.angle > 0 && plan.urgency > 0;
    return plan;
  }

  probe(pos, dir, speed, colliders, altitude, maxAccel) {
    const c = this.cfg;
    const look = speed * c.lookTime + c.lookExtra;

    // Nearest building in the way
    let best = Infinity, target = null;
    for (const col of colliders) {
      const t = rayBox(pos, dir, col.min, col.max, c.margin, look);
      if (t < best) { best = t; target = col; }
    }

    // Frame looking down this ray
    _right.crossVectors(dir, Y);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, dir).normalize();
    const baseYaw = Math.atan2(-dir.x, -dir.z);
    const basePitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));

    let result = null;
    if (target) {
      let upA = -Infinity, leftA = Infinity, rightA = -Infinity;
      for (let i = 0; i < 8; i++) {
        _rel.set(
          (i & 1 ? target.max.x + c.margin : target.min.x - c.margin) - pos.x,
          (i & 2 ? target.max.y + c.margin : target.min.y - c.margin) - pos.y,
          (i & 4 ? target.max.z + c.margin : target.min.z - c.margin) - pos.z,
        );
        const fwd = Math.max(1, _rel.dot(dir));
        upA = Math.max(upA, Math.atan2(_rel.dot(_up), fwd));
        leftA = Math.min(leftA, Math.atan2(_rel.dot(_right), fwd));
        rightA = Math.max(rightA, Math.atan2(_rel.dot(_right), fwd));
      }
      const extra = THREE.MathUtils.degToRad(c.extraDeg);
      const options = { up: (upA + extra) * c.upBias, left: -leftA + extra, right: rightA + extra };
      let kind = null, angle = Infinity;
      for (const [k, a] of Object.entries(options)) if (a < angle) { kind = k; angle = a; }
      if (target === this.lastTarget && this.lastKind && options[this.lastKind] != null && options[this.lastKind] < angle + c.stickiness) {
        kind = this.lastKind;
        angle = options[kind];
      }
      if (kind === 'up') angle /= c.upBias;
      const ttc = best / speed;
      const needAccel = (2 * best * Math.sin(Math.min(Math.max(0, angle), 1.4))) / Math.max(0.05, ttc * ttc);
      const sideKind = options.left <= options.right ? 'left' : 'right';
      result = {
        target, kind, angle: Math.max(0, angle), ttc, dist: best, baseYaw, basePitch, sideKind,
        name: target.name || 'building',
        urgency: 1 - THREE.MathUtils.smoothstep(ttc, c.urgentTime, c.lookTime),
        brake: needAccel > maxAccel * c.brakeAbove,
      };
    }

    // Ground: how much height does a pull-up need at this speed and dive angle?
    if (dir.y < -0.02) {
      const theta = Math.asin(Math.min(1, -dir.y));
      const r = (speed * speed) / (maxAccel * c.pullUpShare);
      const needed = r * (1 - Math.cos(theta)) + speed * Math.sin(theta) * c.reactTime + 1;
      const room = altitude - c.groundMargin;
      const urgency = 1 - THREE.MathUtils.smoothstep(room / needed, 1.0, c.groundEarly);
      if (urgency > 0 && (!result || urgency > result.urgency)) {
        result = {
          target: 'ground', kind: 'up', name: 'ground',
          angle: theta + THREE.MathUtils.degToRad(c.extraDeg), ttc: room / Math.max(1, speed * Math.sin(theta)),
          dist: room, baseYaw, basePitch, urgency, brake: false,
        };
      }
    }
    return result;
  }
}

// Is a predicted path (list of points) clear of buildings and the ground?
export function pathClear(points, colliders, margin = 2.5, groundMin = 1.5) {
  for (const p of points) {
    if (p.y < groundMin) return false;
    for (const c of colliders) {
      if (p.x > c.min.x - margin && p.x < c.max.x + margin &&
          p.y > c.min.y - margin && p.y < c.max.y + margin &&
          p.z > c.min.z - margin && p.z < c.max.z + margin) return false;
    }
  }
  return true;
}
