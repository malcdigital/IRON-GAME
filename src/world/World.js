import * as THREE from '../lib/three.js';

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
    // The coast: the city stands on land at height 0; everywhere else is sea (lower)
    this.coast = range.coast;
    this.seaLevel = range.seaLevel;
    this.islands = range.islands ?? [];
    this.groundAt = (x, z) => (this.onLand(x, z) ? 0 : this.seaLevel);
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

// Is (x, z) inside the outline P ([x, z] points)?
function inPoly(P, x, z) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
