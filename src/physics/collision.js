import * as THREE from '../lib/three.js';

export const GROUND = { id: 'ground', name: 'Ground' };

const _vp = new THREE.Vector3();
const _r = new THREE.Vector3();
const _rn = new THREE.Vector3();
const _t = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _imp = new THREE.Vector3();

// Find contacts between a sphere and the world (ground plane + axis-aligned boxes).
// Pushes { point, normal, depth, collider } objects into `out`.
// groundAt(x, z): the height of the ground there (the city is at 0, the sea lower); none = flat at 0
export function sphereContacts(center, r, colliders, out, groundAt = null) {
  const gy = groundAt ? groundAt(center.x, center.z) : 0;
  if (center.y - r < gy) {
    out.push({
      point: new THREE.Vector3(center.x, gy, center.z),
      normal: new THREE.Vector3(0, 1, 0),
      depth: r - (center.y - gy),
      collider: GROUND,
    });
  }
  for (const c of colliders) {
    boxContact(center, r, c, out);
    // its rooftop pieces (only when the sphere is over the roof, up to the tallest piece)
    if (c.gear && center.y - r < c.gearTop && center.y + r > c.max.y - 0.1
      && center.x + r > c.min.x - 0.5 && center.x - r < c.max.x + 0.5 && center.z + r > c.min.z - 0.5 && center.z - r < c.max.z + 0.5) {
      for (const g of c.gear) boxContact(center, r, g, out);
    }
  }
  return out;
}

// Contact between a sphere and one axis-aligned box (none if they don't touch)
function boxContact(center, r, c, out) {
  {
    const px = Math.max(c.min.x, Math.min(center.x, c.max.x));
    const py = Math.max(c.min.y, Math.min(center.y, c.max.y));
    const pz = Math.max(c.min.z, Math.min(center.z, c.max.z));
    const dx = center.x - px, dy = center.y - py, dz = center.z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) return;

    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      out.push({
        point: new THREE.Vector3(px, py, pz),
        normal: new THREE.Vector3(dx / d, dy / d, dz / d),
        depth: r - d,
        collider: c,
      });
    } else {
      // Center is inside the box: push out along the shallowest face.
      const faces = [
        [center.x - c.min.x, -1, 0, 0], [c.max.x - center.x, 1, 0, 0],
        [center.y - c.min.y, 0, -1, 0], [c.max.y - center.y, 0, 1, 0],
        [center.z - c.min.z, 0, 0, -1], [c.max.z - center.z, 0, 0, 1],
      ];
      faces.sort((a, b) => a[0] - b[0]);
      const [dist, nx, ny, nz] = faces[0];
      out.push({
        point: center.clone(),
        normal: new THREE.Vector3(nx, ny, nz),
        depth: dist + r,
        collider: c,
      });
    }
  }
  return out;
}

// Bounce and friction for a rigid body touching a surface.
// Returns the closing speed at impact (0 if already separating).
export function resolveContact(body, contact, cfg) {
  const n = contact.normal;
  body.velocityAt(contact.point, _vp);
  const vn = _vp.dot(n);
  if (vn >= 0) return 0;

  _r.subVectors(contact.point, body.pos);
  _rn.crossVectors(_r, n);
  const k = 1 / body.mass + n.dot(_tmp.crossVectors(body.invInertiaWorld(_rn, _tmp), _r));
  const e = -vn > 1.5 ? cfg.restitution : 0;
  const j = (-(1 + e) * vn) / k;
  body.applyImpulse(_imp.copy(n).multiplyScalar(j), contact.point);

  // Friction (toward the surface's own speed: a walking foot grips at walking speed)
  body.velocityAt(contact.point, _vp);
  if (contact.surfaceVel) _vp.sub(contact.surfaceVel);
  _t.copy(_vp).addScaledVector(n, -_vp.dot(n));
  const vt = _t.length();
  if (vt > 1e-4) {
    _t.multiplyScalar(1 / vt);
    _rn.crossVectors(_r, _t);
    const kt = 1 / body.mass + _t.dot(_tmp.crossVectors(body.invInertiaWorld(_rn, _tmp), _r));
    const jt = Math.min(vt / kt, cfg.friction * j);
    body.applyImpulse(_imp.copy(_t).multiplyScalar(-jt), contact.point);
  }
  return -vn;
}
