// City traffic: cars drive the streets keeping right, stop at red lights, turn left or right (or go
// straight on) at the crossings, U-turn at the ends of the streets, and keep clear of whatever is
// in front of them (another car, one crossing their path, or you). The cars are solid (near() gives
// the boxes round a point) and moving ones knock you down (see Game.hitByCar).
// The traffic lights at each crossing cycle: green one way while the other waits, then yellow, a
// moment of all-red, and the other way's turn. No rendering here (StreetView draws it).

export const LIGHT = { green: 8, yellow: 2, allRed: 2 };   // seconds
const CYCLE = 2 * (LIGHT.green + LIGHT.yellow + LIGHT.allRed);
const CAR = { length: 4.3, width: 1.9, height: 1.5, accel: 3, brake: 7, gap: 2.5, look: 22, seeYou: 12, turnSpeed: 6, spacing: 90, jamTime: 40, jamHide: 80, claim: 10, signalFrom: 45, gapLeft: 25 };

export class Traffic {
  constructor(streets) {
    this.streets = streets;
    this.time = 0;
    const X = streets.crossings;
    // the roads: straight runs along x or z ('at' = their line), with the crossings on them
    this.runs = streets.lanes.map((L) => {
      const alongX = L.ax !== L.bx;
      const r = { alongX, at: alongX ? L.az : L.ax, a0: alongX ? L.ax : L.az, a1: alongX ? L.bx : L.bz, R: L.R };
      r.pts = X.map((c, i) => ({ i, a: alongX ? c.x : c.z, on: alongX ? c.z : c.x }))
        .filter((p) => Math.abs(p.on - r.at) < 0.5 && p.a > r.a0 - 0.5 && p.a < r.a1 + 0.5).sort((p, q) => p.a - q.a);
      return r;
    });
    for (const c of X) c.run = { x: null, z: null };
    this.runs.forEach((r, k) => { for (const p of r.pts) X[p.i].run[r.alongX ? 'x' : 'z'] = k; });
    let s = 99;
    this.rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.cars = [];
    this.runs.forEach((r, k) => {
      const n = Math.max(1, Math.round((r.a1 - r.a0) / CAR.spacing));   // (one car per spacing m of street each way: more and the grid jams)
      for (const dir of [1, -1]) for (let j = 0; j < n; j++) {
        this.cars.push({ run: k, dir, a: r.a0 + 6 + (r.a1 - r.a0 - 12) * (j + this.rand() * 0.6) / n, v: 0, cruise: 9 + this.rand() * 5, colour: Math.floor(this.rand() * 10),
          turn: null, x: 0, z: 0, angle: 0, fx: 0, fz: 0, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: CAR.height, z: 0 }, id: `traffic-${this.cars.length}`, name: 'Car', kind: 'car' });
      }
    });
    this.place();
  }

  // The light a car sees at crossing i: 'green' | 'yellow' | 'red' for traffic along x (alongX) or z
  light(i, alongX) {
    const c = this.streets.crossings[i];
    const t = (this.time + c.phase) % CYCLE, half = LIGHT.green + LIGHT.yellow + LIGHT.allRed;
    const mine = alongX ? t : (t + half) % CYCLE;   // (the other way runs half a cycle later)
    return mine < LIGHT.green ? 'green' : mine < LIGHT.green + LIGHT.yellow ? 'yellow' : 'red';
  }

  // a point in a lane: run r, travelling dir, at distance a along it (keep right)
  lanePos(r, dir, a) {
    const k = r.R * 0.35 * dir;
    return r.alongX ? { x: a, z: r.at + k } : { x: r.at - k, z: a };
  }

  update(dt, player) {
    this.time += dt;
    const stopIn = (d) => Math.sqrt(2 * CAR.brake * Math.max(0, d));   // (the speed you can still stop from in d m)
    // who's in front of whom (from where everyone is now): a car ahead in your path, within reach
    const block = this.cars.map(() => Infinity), blocker = this.cars.map(() => -1);
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      for (let j = 0; j < this.cars.length; j++) {
        if (i === j) continue;
        const o = this.cars[j], rx = o.x - c.x, rz = o.z - c.z;
        if (Math.abs(rx) > CAR.look || Math.abs(rz) > CAR.look) continue;
        // (in a crossing: mind the cars in the same crossing and on the road you're heading for;
        // on the road: the cars ahead in your lane and any turning across it)
        if (c.turn ? !((o.turn && o.turn.key === c.turn.key) || (!o.turn && o.run === c.turn.next.run && o.dir === c.turn.next.dir))
          : !(o.turn || (o.run === c.run && o.dir === c.dir))) continue;
        const d = rx * c.fx + rz * c.fz, lat = Math.abs(rx * c.fz - rz * c.fx);
        if (d > 0 && d < CAR.look && lat < 2 && d < block[i]) { block[i] = d; blocker[i] = j; }
      }
    }
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], r = this.runs[c.run];
      let allow = c.turn ? Math.min(c.cruise, CAR.turnSpeed) : c.cruise;
      // the car in front (two waiting on each other: the lower number goes first)
      const j = blocker[i];
      c.why = null;
      if (j >= 0 && !(blocker[j] === i && i < j)) { allow = Math.min(allow, stopIn(block[i] - CAR.length - CAR.gap)); c.why = 'car'; c.by = j; }
      // you, in the road ahead
      if (player && player.y < 4) {
        const rx = player.x - c.x, rz = player.z - c.z, d = rx * c.fx + rz * c.fz, lat = Math.abs(rx * c.fz - rz * c.fx);
        if (d > 0 && d < CAR.seeYou && lat < 2) allow = Math.min(allow, stopIn(d - CAR.length / 2 - 2));
      }
      if (!c.turn) {
        // the next crossing ahead: stop at its line unless green (yellow: stop if there's room to)
        const next = (c.dir > 0 ? r.pts.find((p) => p.a - c.a > 0.01) : r.pts.findLast((p) => c.a - p.a > 0.01)) ?? null;   // (the nearest one ahead, either way)
        if (next) {
          const line = next.a - c.dir * (r.R + 3), d = (line - c.a) * c.dir;
          if (!c.plan || c.plan.i !== next.i) c.plan = this.choose(c, next);   // (where to go at this crossing, picked on the way up)
          const lt = this.light(next.i, r.alongX);
          // stop at the line: red (or yellow with room to stop), or the crossing isn't clear for
          // this move (cars from another way in it, or no room on the road beyond)
          const red = lt === 'red' || (lt === 'yellow' && d > c.v * c.v / (2 * CAR.brake) + 1), blocked = !red && !this.clear(c, c.plan);
          if (d > -0.5 && (red || blocked)) { allow = Math.min(allow, stopIn(d - 0.3)); if (d < 6) c.why = red ? 'light' : 'crossing busy'; }
          // about to go through on a clear crossing: claim it (cars on clashing paths now wait for this one)
          c.res = !red && !blocked && d < CAR.claim && c.plan ? { ...this.move(c, c.plan), key: c.plan.key } : null;
          c.signal = c.plan && !c.plan.straight && d < CAR.signalFrom ? c.plan.side : null;   // (blinker on, on the way up)
          if ((c.a - (next.a - c.dir * r.R)) * c.dir >= 0) this.startTurn(c, next);
        } else {
          // the end of the street: slow down and U-turn (once the other lane's clear there)
          const end = c.dir > 0 ? r.a1 : r.a0, left = (end - c.a) * c.dir - 4;
          if (!c.plan || c.plan.i !== -1 - c.run) c.plan = { i: -1 - c.run, run: c.run, dir: -c.dir, a: end - c.dir * 4, key: `u${c.run}:${c.dir}`, straight: false };
          const ok = this.clear(c, c.plan);
          allow = Math.min(allow, ok ? Math.max(CAR.turnSpeed * 0.6, stopIn(left) + 2) : stopIn(left - 0.5));
          if (left <= 0 && ok) this.startUturn(c);
          c.signal = left < CAR.signalFrom ? 'L' : null;
        }
      } else c.signal = c.turn.move?.side === 'S' ? null : (c.turn.move?.side === 'R' ? 'R' : 'L');
      c.braking = allow < c.v - 0.05 || c.v < 0.3;   // (brake lights)
      c.v = allow < c.v ? Math.max(allow, c.v - CAR.brake * 1.5 * dt) : Math.min(allow, c.v + CAR.accel * dt);
      // jam breaker: stuck a long while, well out of your way: off it goes to a clear street elsewhere
      c.stuckT = c.v < 0.3 ? (c.stuckT ?? 0) + dt : 0;
      if (c.stuckT > CAR.jamTime && (!player || Math.hypot(c.x - player.x, c.z - player.z) > CAR.jamHide) && this.respawn(c)) continue;
      if (c.turn) {
        c.turn.u += (c.v * dt) / c.turn.len;
        if (c.turn.u >= 1) { const nx = c.turn.next; c.run = nx.run; c.dir = nx.dir; c.a = nx.a; c.turn = null; }
      } else c.a += c.v * dt * c.dir;
    }
    this.place();
  }

  // what a car is doing at a crossing: which way it came in and where it's going
  move(c, plan) { return { from: `${c.run}:${c.dir}`, run: c.run, dir: c.dir, side: plan.side ?? (plan.straight ? 'S' : 'U') }; }

  // can these two moves share a crossing at the same time? (same way in: yes; head to head, going
  // straight or turning right: yes; anything that crosses the other's path: no)
  compatible(a, b) {
    if (!b || a.from === b.from) return true;
    if (a.run === b.run && a.dir === -b.dir) return (a.side === 'S' || a.side === 'R') && (b.side === 'S' || b.side === 'R');
    return false;
  }

  // put car c somewhere clear: a random street, either way, nobody within 20 m in that lane
  respawn(c) {
    for (let tries = 0; tries < 20; tries++) {
      const k = Math.floor(this.rand() * this.runs.length), r = this.runs[k], dir = this.rand() < 0.5 ? 1 : -1;
      if (r.a1 - r.a0 < 30) continue;
      const a = r.a0 + 10 + this.rand() * (r.a1 - r.a0 - 20), p = this.lanePos(r, dir, a);
      if (r.pts.some((q) => Math.abs(q.a - a) < r.R + 6)) continue;   // (not in or by a crossing)
      if (this.cars.some((o) => o !== c && Math.hypot(o.x - p.x, o.z - p.z) < 20)) continue;
      Object.assign(c, { run: k, dir, a, v: 0, turn: null, plan: null, res: null, stuckT: 0 });
      return true;
    }
    return false;
  }

  // into a crossing: straight on, or turn left / right onto the crossing road (if it carries on that way)
  startTurn(c, p) {
    const r = this.runs[c.run];
    const choice = c.plan && c.plan.i === p.i ? c.plan : this.choose(c, p);
    c.plan = null;
    if (!choice) return this.startUturn(c);
    const E = this.lanePos(r, c.dir, c.a), Xp = this.lanePos(this.runs[choice.run], choice.dir, choice.a);
    // (turning: the curve's corner is where the two lanes meet; straight on: halfway)
    const C = choice.run === c.run ? { x: (E.x + Xp.x) / 2, z: (E.z + Xp.z) / 2 } : r.alongX ? { x: Xp.x, z: E.z } : { x: E.x, z: Xp.z };
    c.turn = { E, C, X: Xp, u: 0, len: Math.hypot(C.x - E.x, C.z - E.z) + Math.hypot(Xp.x - C.x, Xp.z - C.z), next: choice, key: `x${p.i}`, from: `${c.run}:${c.dir}`, straight: choice.straight, move: this.move(c, choice) };
    c.res = null;
  }

  // pick a way through crossing p: straight on (more often), or left / right if that road carries on
  choose(c, p) {
    const r = this.runs[c.run], X = this.streets.crossings[p.i], R = r.R, opts = [];
    if (c.dir > 0 ? r.a1 > p.a + R + 1 : r.a0 < p.a - R - 1) opts.push({ i: p.i, run: c.run, dir: c.dir, a: p.a + c.dir * R, w: 2, straight: true, alongX: r.alongX, side: 'S' });
    const ok = X.run[r.alongX ? 'z' : 'x'];
    if (ok != null) {
      const o = this.runs[ok], at = r.alongX ? X.z : X.x;
      for (const d2 of [1, -1]) if (d2 > 0 ? o.a1 > at + R + 1 : o.a0 < at - R - 1) {
        // left or right? (looking down: the way you're going turned a quarter anticlockwise is left)
        const fx = r.alongX ? c.dir : 0, fz = r.alongX ? 0 : c.dir, ex = o.alongX ? d2 : 0, ez = o.alongX ? 0 : d2;
        opts.push({ i: p.i, run: ok, dir: d2, a: at + d2 * R, w: 1, straight: false, side: fx * ez - fz * ex < 0 ? 'L' : 'R' });
      }
    }
    if (!opts.length) return null;
    let pick = this.rand() * opts.reduce((s, o) => s + o.w, 0), choice = opts[0];
    for (const o of opts) { pick -= o.w; if (pick <= 0) { choice = o; break; } }
    choice.key = `x${p.i}`;
    return choice;
  }

  // may car c go ahead with this move? The crossing holds no car from another way (two going
  // straight along the same road don't clash), and there's room on the road it's heading for
  clear(c, plan) {
    if (!plan) return true;
    const me = this.move(c, plan), r = this.runs[c.run];
    const crossA = plan.i >= 0 ? r.pts.find((q) => q.i === plan.i)?.a : null;
    for (const o of this.cars) {
      if (o === c) continue;
      // someone already in the crossing, or about to go (claimed it), on a clashing path
      if (o.turn && o.turn.key === plan.key && !this.compatible(me, o.turn.move)) return false;
      if (o.res && o.res.key === plan.key && !this.compatible(me, o.res)) return false;
      // turning left: wait for a gap in the oncoming traffic (unless it's turning left too)
      if (me.side === 'L' && crossA != null && !o.turn && o.run === c.run && o.dir === -c.dir && o.v > 1) {
        const until = (crossA - o.a) * o.dir;
        if (until > 0 && until < r.R + CAR.gapLeft) return false;
      }
      // (the road beyond: someone sitting just past the crossing, or about to be)
      const onExit = (!o.turn && o.run === plan.run && o.dir === plan.dir) ? (o.a - plan.a) * plan.dir : null;
      if (onExit != null && onExit > -1 && onExit < CAR.length + CAR.gap + 2 && o.v < 2) return false;
    }
    return true;
  }

  // the end of the street: swing round into the other lane
  startUturn(c) {
    const r = this.runs[c.run], E = this.lanePos(r, c.dir, c.a), Xp = this.lanePos(r, -c.dir, c.a);
    const mid = this.lanePos(r, 0, c.a + c.dir * 5);
    c.turn = { E, C: mid, X: Xp, u: 0, len: 9, next: { run: c.run, dir: -c.dir, a: c.a }, key: `u${c.run}:${c.dir}`, from: `${c.run}:${c.dir}`, straight: false, move: { from: `${c.run}:${c.dir}`, run: c.run, dir: c.dir, side: 'U' } };
    c.plan = null;
  }

  // positions, headings and solid boxes
  place() {
    for (const c of this.cars) {
      let x, z, tx, tz;
      if (c.turn) {
        const { E, C, X } = c.turn, u = Math.min(1, c.turn.u), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
        x = a * E.x + b * C.x + d * X.x; z = a * E.z + b * C.z + d * X.z;
        tx = 2 * (1 - u) * (C.x - E.x) + 2 * u * (X.x - C.x); tz = 2 * (1 - u) * (C.z - E.z) + 2 * u * (X.z - C.z);
      } else {
        const r = this.runs[c.run], p = this.lanePos(r, c.dir, c.a);
        x = p.x; z = p.z; tx = r.alongX ? c.dir : 0; tz = r.alongX ? 0 : c.dir;
      }
      const tl = Math.hypot(tx, tz) || 1;
      c.x = x; c.z = z; c.fx = tx / tl; c.fz = tz / tl;
      c.angle = Math.atan2(-c.fx, -c.fz);   // (the car's nose is its -z)
      const hl = CAR.length / 2, hw = CAR.width / 2, ex = Math.abs(c.fx) * hl + Math.abs(c.fz) * hw, ez = Math.abs(c.fz) * hl + Math.abs(c.fx) * hw;
      c.min.x = x - ex; c.max.x = x + ex; c.min.z = z - ez; c.max.z = z + ez;
    }
  }

  // the cars within a few metres of (x, z) (for collisions)
  near(x, z, out = []) {
    for (const c of this.cars) if (Math.abs(c.x - x) < 6 && Math.abs(c.z - z) < 6) out.push(c);
    return out;
  }
}
