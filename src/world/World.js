import * as THREE from '../lib/three.js';
import { layoutRoof, hasRoof } from './roofs.js';
import { layoutStreets } from './streets.js';
import { Traffic } from './traffic.js';
import { CONFIG } from '../core/config.js';

// Turns range data into colliders and rings. No rendering here.
export class World {
  constructor(range) {
    this.range = range;
    this.colliders = range.boxes.map((b) => {
      const half = new THREE.Vector3(...b.size).multiplyScalar(0.5);
      const center = new THREE.Vector3(...b.pos);
      return {
        ...b,
        center,
        min: center.clone().sub(half),
        max: center.clone().add(half),
      };
    });
    // The coast: the city stands on land at height 0; everywhere else is sea (lower)
    this.coast = range.coast;
    this.seaLevel = range.seaLevel;
    // The islands out in the bay: a green hill each (the ground follows it) with a village of little
    // pastel houses round its foot, terraced up it a bit (solid, like the city's buildings)
    this.islands = range.islands ?? [];
    this.hills = this.islands.filter((i) => i.center && !i.skyline && !i.headland)
      .map((i) => ({ cx: i.center[0], cz: i.center[1], R: i.radius * 0.8, H: i.radius * 0.3, seed: i.seed ?? 1 }));
    this.islands.forEach((isl, n) => { if (isl.houses && !isl.skyline && !isl.headland) this.colliders.push(...this.villageHouses(isl, n)); });
    // Rooftops: each roof's layout (drawn by WorldView) and its solid pieces (gear), checked only
    // when you're over that building (gearTop: how high the tallest piece reaches)
    this.colliders.forEach((c, i) => {
      if (!hasRoof(c)) return;
      c.roof = layoutRoof(c, i);
      c.gear = c.roof.solids.map((b, k) => ({ id: `${c.id}-roof-${k}`, name: 'Rooftop', kind: 'roofgear', min: new THREE.Vector3(b[0], b[1], b[2]), max: new THREE.Vector3(b[3], b[4], b[5]) }));
      c.gearTop = Math.max(c.max.y, ...c.gear.map((g) => g.max.y));
    });

    // Each ring faces along the path from the previous ring to the next one
    const pts = range.rings.map((p) => new THREE.Vector3(...p));
    this.rings = pts.map((center, i) => {
      const prev = pts[i - 1] ?? center.clone().add(new THREE.Vector3(0, 0, 10));
      const next = pts[i + 1] ?? center.clone().add(center.clone().sub(prev));
      const normal = next.clone().sub(prev).normalize();
      return { index: i, center, normal, radius: range.ringRadius };
    });

    this.spawn = {
      pos: new THREE.Vector3(...range.spawn.pos),
      heading: range.spawn.heading,
    };
    this.workshopPad = { pos: new THREE.Vector3(...range.workshopPad.pos), radius: range.workshopPad.radius };
    // Streets: markings, lamps, benches, parked cars (solid) and traffic lanes. The parked cars sit
    // in a 16 m grid so collisions only look at the few round you (streetNear)
    this.streets = layoutStreets(this);
    this.streetGrid = new Map();
    for (const c of this.streets.solids) {
      const k = `${Math.floor((c.min.x + c.max.x) / 32)},${Math.floor((c.min.z + c.max.z) / 32)}`;
      if (!this.streetGrid.has(k)) this.streetGrid.set(k, []);
      this.streetGrid.get(k).push(c);
    }
    this.traffic = new Traffic(this.streets);   // (the moving cars: solid too)
    this.streetNear = (x, z) => {
      const gx = Math.floor(x / 16), gz = Math.floor(z / 16), out = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = this.streetGrid.get(`${gx + i},${gz + j}`); if (l) out.push(...l); }
      return this.traffic.near(x, z, out);
    };
    // ground height: land (0, plus the island hills), the sandy beach round it, or the sea
    const beach = CONFIG.world.beachWidth ?? 16, sand = this.seaLevel + 0.25;
    this.outlines = [this.coast, ...this.islands.map((i) => i.outline)].map((P) => ({ P, box: bounds(P, beach) }));
    this.groundAt = (x, z) => {
      if (this.onLand(x, z)) return this.hillAt(x, z);
      return this.nearLand(x, z, beach) ? sand : this.seaLevel;
    };
  }

  // Height of the island hills at (x, z) (0 off them): a smooth dome with a little roll to it
  hillAt(x, z) {
    let h = 0;
    for (const H of this.hills) {
      const d = Math.hypot(x - H.cx, z - H.cz);
      if (d >= H.R) continue;
      const u = 1 - d / H.R, s = u * u * (3 - 2 * u);
      const roll = 1 + 0.08 * Math.sin(x * 0.045 + H.seed) * Math.cos(z * 0.05 - H.seed);
      h = Math.max(h, H.H * s * roll);
    }
    return h;
  }

  // Within `dist` of a shoreline? (the beach strip)
  nearLand(x, z, dist) {
    for (const { P, box } of this.outlines) {
      if (x < box[0] || x > box[2] || z < box[1] || z > box[3]) continue;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (segDist(x, z, P[j], P[i]) < dist) return true;
    }
    return false;
  }

  // The village on an island: houses round the hill's foot and up it a bit, each standing on the
  // slope (its base sunk to the lowest ground under it), clear of the others
  villageHouses(isl, n) {
    let s = (isl.seed ?? 1) * 4099 + 17;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const [cx, cz] = isl.center, r = isl.radius, out = [], placed = [];
    for (let k = 0, tries = 0; k < isl.houses && tries < isl.houses * 8; tries++) {
      const a = rand() * Math.PI * 2, rr = r * (0.4 + rand() * 0.42), w = 8 + Math.round(rand() * 8), d = 8 + Math.round(rand() * 8), hh = 6 + Math.round(rand() * 8);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (placed.some(([px, pz, pw, pd]) => Math.abs(px - x) < (pw + w) / 2 + 3 && Math.abs(pz - z) < (pd + d) / 2 + 3)) continue;
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a2, b2]) => [x + a2 * w / 2, z + b2 * d / 2]);
      if (!corners.every(([px, pz]) => this.onLand(px, pz))) continue;
      const lo = Math.min(...corners.map(([px, pz]) => this.hillAt(px, pz))) - 1, hi = Math.max(...corners.map(([px, pz]) => this.hillAt(px, pz))) + hh;
      const center = new THREE.Vector3(x, (lo + hi) / 2, z), half = new THREE.Vector3(w / 2, (hi - lo) / 2, d / 2);
      out.push({ id: `isl-${n}-house-${k}`, kind: 'building', pos: center.toArray(), size: [w, hi - lo, d], center, min: center.clone().sub(half), max: center.clone().add(half) });
      placed.push([x, z, w, d]); k++;
    }
    return out;
  }

  // Is (x, z) on land? (the city, or one of the islands)
  onLand(x, z) {
    if (inPoly(this.coast, x, z)) return true;
    for (const i of this.islands) if (inPoly(i.outline, x, z)) return true;
    return false;
  }

  isAtWorkshop(pos) {
    const dx = pos.x - this.workshopPad.pos.x, dz = pos.z - this.workshopPad.pos.z;
    return Math.hypot(dx, dz) < this.workshopPad.radius + 2 && pos.y < 3;
  }
}

function bounds(P, pad) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, z] of P) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
  return [a - pad, b - pad, c + pad, d + pad];
}

// Distance from (x, z) to the segment A-B
function segDist(x, z, A, B) {
  const ex = B[0] - A[0], ez = B[1] - A[1], L = ex * ex + ez * ez;
  const t = L > 0 ? Math.max(0, Math.min(1, ((x - A[0]) * ex + (z - A[1]) * ez) / L)) : 0;
  return Math.hypot(x - A[0] - ex * t, z - A[1] - ez * t);
}

// Is (x, z) inside the outline P ([x, z] points)?
function inPoly(P, x, z) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
