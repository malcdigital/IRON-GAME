// Street furniture and traffic, laid out from the city's street grids. No rendering here: StreetView
// draws it; the parked cars are solid (World.streetNear finds the ones round a point).
//
// Each grid is a set of blocks (cell centres) with a pitch (block to block) and a sidewalk square
// (walk) round each; the road between two neighbouring blocks is pitch - walk wide.
//   paint:    road markings, flat rectangles [x, z, w, d, colour 0 white / 1 yellow]
//   lamps:    [x, z, angle] (the arm reaches out over the road along angle)
//   benches:  [x, z, angle] (facing the road), cans [x, z], hydrants [x, z]
//   parked:   [x, z, angle, colourIndex]
//   lanes:    straight runs of road for traffic: { ax, az, bx, bz, len } (driven both ways)

export function layoutStreets(world) {
  let s = 4242;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const range = world.range, out = { paint: [], lamps: [], benches: [], cans: [], hydrants: [], parked: [], lanes: [] };
  const grids = [];
  if (range.cityCells?.length) grids.push({ cells: range.cityCells, P: range.cityGrid.pitch, W: range.cityGrid.block + 4 });
  const down = world.colliders.filter((c) => c.id?.startsWith('bld-')).map((c) => [Math.round(c.center.x), Math.round(c.center.z)]);
  if (down.length) grids.push({ cells: down, P: 40, W: 28 });
  const COLS = 10;
  for (const { cells, P, W } of grids) {
    const has = new Set(cells.map(([x, z]) => `${x},${z}`)), R = (P - W) / 2;   // (R: half the road's width)
    const runs = new Map();   // line key -> list of [from, to] along it
    for (const [x, z] of cells) {
      // the road on the +x side (running along z) and the +z side (running along x), if a block is there too
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        if (!has.has(`${x + dx * P},${z + dz * P}`)) continue;
        const along = (a, b) => (dx ? [x + P / 2 + b, z + a] : [x + a, z + P / 2 + b]);   // (a: along the road, b: across it)
        const span0 = -P / 2 + R, span1 = P / 2 - R;   // (between the two intersections)
        // dashed centre line
        for (let a = span0 + 1.5; a < span1 - 1.5; a += 6) { const [px, pz] = along(a + 1.5, 0); out.paint.push(dx ? [px, pz, 0.18, 3, 1] : [px, pz, 3, 0.18, 1]); }
        // zebra crossings just short of each intersection
        for (const end of [span0 + 1.6, span1 - 1.6]) for (let b = -R + 0.7; b < R - 0.4; b += 0.9) {
          const [px, pz] = along(end, b); out.paint.push(dx ? [px, pz, 0.45, 2.6, 0] : [px, pz, 2.6, 0.45, 0]);
        }
        // parked cars along both curbs (gaps here and there, clear of the crossings)
        for (const side of [-1, 1]) for (let a = span0 + 4.5; a < span1 - 4.5; a += 6.2) {
          if (rand() > 0.42) continue;
          const [px, pz] = along(a, side * (R - 1.2));
          if (!world.onLand(px, pz)) continue;
          out.parked.push([px, pz, (dx ? 0 : Math.PI / 2) + (rand() < 0.5 ? 0 : Math.PI), Math.floor(rand() * COLS)]);
        }
        // traffic: collect this stretch into its line
        const key = dx ? `x${x + P / 2}` : `z${z + P / 2}`, base = dx ? z : x;
        if (!runs.has(key)) runs.set(key, []);
        runs.get(key).push([base - P / 2, base + P / 2]);
      }
      // the sidewalk round the block: lamps along each side, benches, cans, a hydrant
      const h = W / 2;
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ang = Math.atan2(nx, nz);
        for (let a = -h + 4; a <= h - 4; a += 16) {
          const px = x + (nx ? nx * (h - 0.6) : a), pz = z + (nz ? nz * (h - 0.6) : a);
          if (world.onLand(px, pz)) out.lamps.push([px, pz, ang]);
        }
        if (rand() < 0.5) {
          const a = (rand() - 0.5) * (W - 10), px = x + (nx ? nx * (h - 1.6) : a), pz = z + (nz ? nz * (h - 1.6) : a);
          if (world.onLand(px, pz)) {
            out.benches.push([px, pz, ang]);
            out.cans.push([px + (nx ? 0 : 1.6), pz + (nz ? 0 : 1.6)]);
          }
        }
      }
      if (rand() < 0.7) { const k = Math.floor(rand() * 4), [nx, nz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][k], a = (rand() - 0.5) * (W - 8); out.hydrants.push([x + (nx ? nx * (h - 0.9) : a), z + (nz ? nz * (h - 0.9) : a)]); }
    }
    // traffic lanes: each line's touching stretches joined into long runs
    for (const [key, list] of runs) {
      list.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const r of list) { const last = merged.at(-1); if (last && r[0] <= last[1] + 0.1) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
      const at = +key.slice(1), alongX = key[0] === 'z';
      for (const [a0, a1] of merged) {
        if (a1 - a0 < P * 1.5) continue;
        out.lanes.push(alongX ? { ax: a0, az: at, bx: a1, bz: at, len: a1 - a0, R } : { ax: at, az: a0, bx: at, bz: a1, len: a1 - a0, R });
      }
    }
  }
  // parked cars as solid boxes (4.3 x 1.5 x 1.9 m)
  out.solids = out.parked.map(([x, z, ang], i) => {
    const along = Math.abs(Math.cos(ang)) > 0.5 ? 'z' : 'x', hl = 2.15, hw = 0.95;
    return { id: `car-${i}`, name: 'Car', kind: 'car', min: { x: x - (along === 'x' ? hl : hw), y: 0, z: z - (along === 'z' ? hl : hw) }, max: { x: x + (along === 'x' ? hl : hw), y: 1.5, z: z + (along === 'z' ? hl : hw) } };
  });
  out.carColours = COLS;
  return out;
}
