import { CONFIG } from '../core/config.js';

// Rooftop layouts, shared by the physics (the bigger pieces are solid) and the drawing (WorldView).
// No rendering here: each roof is a list of pieces to draw, palms to plant and solid boxes.
//
// A roof: a membrane deck with a parapet and coping round the edge, then the clutter of a real roof
// (scaled to its size): a stair hut, AC units, water tanks on legs, vent pipes, skylights, sometimes
// solar panels or a garden with palms; tall towers get a mast with a red light.
//
// Pieces:  { t: 'box', list, s: [sx, sy, sz], p: [x, y, z], col, uw?, uh? }
//          { t: 'cyl' | 'cone', list, r, h, p, col, seg? }   { t: 'sphere', list, r, p, col }
//          { t: 'panel', list, s, p, col, tilt }   (a box tipped back by tilt radians)
// list: which merged mesh it joins (cap, room, mech, garden, glass, deck, panel, beacon)
// solids: [minX, minY, minZ, maxX, maxY, maxZ] boxes the suit bumps into and can stand on

export function layoutRoof(c, index) {
  let s = (index * 7919 + 1013) % 2147483647 || 1;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = CONFIG.world;
  const sx = c.max.x - c.min.x, sy = c.max.y - c.min.y, sz = c.max.z - c.min.z;
  const top = c.max.y, cx = (c.min.x + c.max.x) / 2, cz = (c.min.z + c.max.z) / 2;
  const pieces = [], palms = [], solids = [];
  const box = (list, w, h, d, x, y, z, col, solid = false, uw, uh) => {
    pieces.push({ t: 'box', list, s: [w, h, d], p: [x, y, z], col, uw, uh });
    if (solid) solids.push([x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2]);
  };
  const solid = (x, z, w, d, y0, y1) => solids.push([x - w / 2, y0, z - d / 2, x + w / 2, y1, z + d / 2]);

  // deck (the building's top is the walking surface)
  const decks = [0xd9d4cc, 0xcfc8bd, 0xc9cbc6, 0xd8cdbd, 0xbfc4bd];
  box('deck', sx, 0.1, sz, cx, top + 0.05, cz, decks[Math.floor(rand() * decks.length)], false, 6, 6);
  // parapet + coping (solid: you bump into it, or perch on it)
  const ph = 0.75 + rand() * 0.35, t = 0.35, coping = 0xfbf7ef, wall = 0xf1ebe0;
  for (const k of [-1, 1]) {
    box('cap', sx + 0.3, ph, t, cx, top + ph / 2, cz + k * (sz / 2 - t / 2 + 0.15), wall);
    box('cap', t, ph, sz + 0.3, cx + k * (sx / 2 - t / 2 + 0.15), top + ph / 2, cz, wall);
    box('cap', sx + 0.5, 0.12, t + 0.2, cx, top + ph + 0.06, cz + k * (sz / 2 - t / 2 + 0.15), coping);
    box('cap', t + 0.2, 0.12, sz + 0.5, cx + k * (sx / 2 - t / 2 + 0.15), top + ph + 0.06, cz, coping);
    solid(cx, cz + k * (sz / 2 - t / 2 + 0.15), sx + 0.5, t + 0.2, top, top + ph + 0.12);
    solid(cx + k * (sx / 2 - t / 2 + 0.15), cz, t + 0.2, sz + 0.5, top, top + ph + 0.12);
  }
  // places on the roof, kept clear of each other and the parapet
  const taken = [];
  const spot = (w, d, margin = 1.2) => {
    for (let tries = 0; tries < 12; tries++) {
      const x = cx + (rand() - 0.5) * Math.max(0, sx - w - margin * 2), z = cz + (rand() - 0.5) * Math.max(0, sz - d - margin * 2);
      if (taken.every((r) => Math.abs(r[0] - x) > (r[2] + w) / 2 + 0.6 || Math.abs(r[1] - z) > (r[3] + d) / 2 + 0.6)) { taken.push([x, z, w, d]); return [x, z]; }
    }
    return null;
  };
  const area = sx * sz, tall = sy > 45;
  // stair hut with a door
  const hw = Math.min(5, sx * 0.3), hd = Math.min(4, sz * 0.25), hh = 2.6;
  const hut = spot(hw, hd);
  if (hut) {
    box('room', hw, hh, hd, hut[0], top + hh / 2, hut[1], 0xece5da, true);
    box('room', hw + 0.3, 0.15, hd + 0.3, hut[0], top + hh + 0.07, hut[1], 0xd6cfc4, true);
    box('mech', 1, 2, 0.06, hut[0], top + 1, hut[1] + hd / 2 + 0.03, 0x6d7480, false, 1, 1);
  }
  if (c.kind === 'building' && rand() < W.roofPalms) {
    // roof garden (planter with palms)
    const gw = sx * 0.45, gd = sz * 0.45, g = spot(gw, gd);
    if (g) {
      box('cap', gw + 0.5, 0.6, gd + 0.5, g[0], top + 0.3, g[1], 0xe9e1d3, true);
      box('garden', gw, 0.2, gd, g[0], top + 0.62, g[1], W.grass);
      const n = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < n; k++) palms.push([g[0] + (rand() - 0.5) * gw * 0.7, top + 0.7, g[1] + (rand() - 0.5) * gd * 0.7, 0.6 + rand() * 0.4]);
    }
  } else if (area > 500 && rand() < 0.45) {
    // solar panels in rows, tilted to the sun
    const rows = Math.min(5, Math.floor(sz / 6)), pw = Math.min(14, sx * 0.5);
    const p = spot(pw, rows * 3);
    if (p) for (let r = 0; r < rows; r++) {
      const z = p[1] - (rows - 1) * 1.5 + r * 3;
      pieces.push({ t: 'panel', list: 'panel', s: [pw, 0.08, 1.8], p: [p[0], top + 0.9, z], col: 0xc8d2ea, tilt: -0.45 });
      box('mech', pw * 0.96, 0.7, 0.12, p[0], top + 0.35, z + 0.55, 0x9aa1aa, false, 2, 1);
      solid(p[0], z, pw, 1.8, top, top + 1.3);
    }
  }
  // AC units (a box with a fan on top)
  const nAc = Math.min(8, 1 + Math.floor(area / 160));
  for (let k = 0; k < nAc; k++) {
    const w = 1.4 + rand() * 0.8, d = 1.1 + rand() * 0.5, h = 0.9 + rand() * 0.5, a = spot(w, d);
    if (!a) continue;
    box('mech', w, h, d, a[0], top + h / 2, a[1], 0xd7dade, true, 1.5, 1);
    pieces.push({ t: 'cyl', list: 'mech', r: Math.min(w, d) * 0.36, h: 0.08, p: [a[0], top + h + 0.04, a[1]], col: 0x3c4048 });
  }
  // water tank on legs
  if (area > 260 && rand() < 0.55) {
    const r = 1.1 + rand() * 0.6, a = spot(r * 2 + 0.4, r * 2 + 0.4);
    if (a) {
      const leg = 1.6;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box('mech', 0.16, leg, 0.16, a[0] + dx * r * 0.65, top + leg / 2, a[1] + dz * r * 0.65, 0x5e5852, false, 1, 1);
      pieces.push({ t: 'cyl', list: 'room', r, h: 2.4, p: [a[0], top + leg + 1.2, a[1]], col: rand() < 0.5 ? 0xb98a63 : 0xe7e2da, seg: 14 });
      pieces.push({ t: 'cone', list: 'room', r: r * 1.08, h: 0.7, p: [a[0], top + leg + 2.75, a[1]], col: 0x8f6a4c });
      solid(a[0], a[1], r * 1.6, r * 1.6, top, top + leg + 2.4);   // (the tank and its legs as one block)
    }
  }
  // vent pipes and skylights
  const nPipe = Math.min(6, Math.floor(area / 220) + (rand() < 0.5 ? 1 : 0));
  for (let k = 0; k < nPipe; k++) {
    const a = spot(0.5, 0.5, 0.8);
    if (!a) continue;
    const h = 0.8 + rand() * 1.2, r = 0.14 + rand() * 0.1;
    pieces.push({ t: 'cyl', list: 'mech', r, h, p: [a[0], top + h / 2, a[1]], col: 0xb5bac2 });
    solid(a[0], a[1], r * 2, r * 2, top, top + h);
  }
  const nSky = area > 400 ? Math.floor(rand() * 3) : 0;
  for (let k = 0; k < nSky; k++) {
    const w = 2 + rand() * 2, d = 1.5 + rand() * 1.5, a = spot(w, d);
    if (!a) continue;
    box('cap', w + 0.3, 0.4, d + 0.3, a[0], top + 0.2, a[1], 0xe9e3d8, true);
    box('glass', w, 0.12, d, a[0], top + 0.45, a[1], 0x5f86a8, true);
  }
  // tall towers: a mast with a red light
  if (tall || c.kind === 'skyline') {
    const a = spot(0.6, 0.6, 2);
    if (a) {
      const h = 4 + rand() * 5;
      pieces.push({ t: 'cyl', list: 'mech', r: 0.08, h, p: [a[0], top + h / 2, a[1]], col: 0xc9ccd2, seg: 6 });
      pieces.push({ t: 'sphere', list: 'beacon', r: 0.22, p: [a[0], top + h + 0.1, a[1]], col: 0xff5a4a });
      solid(a[0], a[1], 0.3, 0.3, top, top + h + 0.3);
    }
  }
  return { pieces, palms, solids };
}

// Which world boxes get a rooftop
export const hasRoof = (c) => c.kind === 'building' || c.kind === 'skyline' || c.kind === 'pillar' || c.kind === 'block';
