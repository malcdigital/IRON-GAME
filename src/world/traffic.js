// City traffic: cars driving the long streets (both ways, keeping right), stopping at red lights,
// queueing behind each other, and braking for you if you're in the road. The cars are solid
// (near() gives the boxes round a point). The traffic lights at each crossing cycle: green one
// way while the other waits, then yellow, a moment of all-red, and the other way's turn.
// No rendering here (StreetView draws it).

export const LIGHT = { green: 8, yellow: 2, allRed: 1 };   // seconds
const CYCLE = 2 * (LIGHT.green + LIGHT.yellow + LIGHT.allRed);
const CAR = { length: 4.3, width: 1.9, height: 1.5, accel: 3, brake: 7, gap: 3 };

export class Traffic {
  constructor(streets) {
    this.streets = streets;
    this.time = 0;
    this.cars = [];
    let s = 99;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const L of streets.lanes) {
      L.alongX = L.ax !== L.bx;
      const n = Math.max(1, Math.round(L.len / 70));
      for (const dir of [1, -1]) for (let k = 0; k < n; k++) {
        this.cars.push({ L, dir, s: L.len * (k + rand() * 0.6) / n, v: 0, cruise: 9 + rand() * 5, colour: Math.floor(rand() * 10), x: 0, z: 0, angle: 0,
          min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: CAR.height, z: 0 }, id: `traffic-${this.cars.length}`, name: 'Car', kind: 'car' });
      }
    }
    // each lane-direction's cars, for following (sorted along the lane every step)
    this.groups = new Map();
    for (const c of this.cars) { const k = `${this.streets.lanes.indexOf(c.L)}:${c.dir}`; if (!this.groups.has(k)) this.groups.set(k, []); this.groups.get(k).push(c); }
    this.place();
  }

  // The light a car sees at crossing i: 'green' | 'yellow' | 'red' for traffic along x (alongX) or z
  light(i, alongX) {
    const c = this.streets.crossings[i];
    const t = (this.time + c.phase) % CYCLE, half = LIGHT.green + LIGHT.yellow + LIGHT.allRed;
    const mine = alongX ? t : (t + half) % CYCLE;   // (the other way runs half a cycle later)
    return mine < LIGHT.green ? 'green' : mine < LIGHT.green + LIGHT.yellow ? 'yellow' : 'red';
  }

  update(dt, player) {
    this.time += dt;
    for (const list of this.groups.values()) {
      list.sort((a, b) => (a.s - b.s) * a.dir);   // (back to front in the direction of travel)
      for (let k = 0; k < list.length; k++) {
        const c = list[k], L = c.L, ahead = list[k + 1];
        let allow = c.cruise;
        const stopIn = (d) => Math.sqrt(2 * CAR.brake * Math.max(0, d));   // (the speed you can still stop from in d m)
        // the car in front
        if (ahead) allow = Math.min(allow, stopIn((ahead.s - c.s) * c.dir - CAR.length - CAR.gap));
        // the next traffic light: stop at its line unless green (yellow: stop if there's room to)
        for (const st of L.stops) {
          const line = st.s - c.dir * (L.R + 3), d = (line - c.s) * c.dir;
          if (d < -0.5) continue;
          if (d > 60) break;
          const lt = this.light(st.i, L.alongX);
          if (lt === 'red' || (lt === 'yellow' && d > c.v * c.v / (2 * CAR.brake) + 1)) allow = Math.min(allow, stopIn(d - 0.3));
          break;
        }
        // you, standing (or hovering low) in its lane ahead
        if (player && player.y < 4) {
          const ps = (L.alongX ? player.x - L.ax : player.z - L.az), lat = L.alongX ? player.z - c.z : player.x - c.x, d = (ps - c.s) * c.dir;
          if (Math.abs(lat) < 2.2 && d > 0 && d < 25) allow = Math.min(allow, stopIn(d - CAR.length / 2 - 2.5));
        }
        c.v = allow < c.v ? Math.max(allow, c.v - CAR.brake * 1.5 * dt) : Math.min(allow, c.v + CAR.accel * dt);
        c.s += c.v * dt * c.dir;
        if (c.s > L.len) c.s -= L.len; else if (c.s < 0) c.s += L.len;   // (round again from the other end)
      }
    }
    this.place();
  }

  // positions, headings and solid boxes from where each car is along its lane
  place() {
    for (const c of this.cars) {
      const L = c.L, off = L.R * 0.35 * c.dir;   // (keep right, clear of the parked cars)
      c.x = L.ax + (L.alongX ? c.s : 0) + (L.alongX ? 0 : -off);
      c.z = L.az + (L.alongX ? 0 : c.s) + (L.alongX ? off : 0);
      c.angle = L.alongX ? (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (c.dir > 0 ? Math.PI : 0);
      const hl = CAR.length / 2, hw = CAR.width / 2;
      c.min.x = c.x - (L.alongX ? hl : hw); c.max.x = c.x + (L.alongX ? hl : hw);
      c.min.z = c.z - (L.alongX ? hw : hl); c.max.z = c.z + (L.alongX ? hw : hl);
    }
  }

  // the cars within a few metres of (x, z) (for collisions)
  near(x, z, out = []) {
    for (const c of this.cars) if (Math.abs(c.x - x) < 6 && Math.abs(c.z - z) < 6) out.push(c);
    return out;
  }
}
