// Test range layout. Pure data: move things around here.
// Boxes: pos is the center, size is [width, height, depth]. Ground is y = 0, forward is -Z.

// Downtown: a grid of buildings with 16 m streets to race through.
// Building centers sit 40 m apart, so streets run along x = 0, ±40, ±80, ... and z = -340, -380, ...
function downtown({ cols = 8, rows = 8, spacing = 40, footprint = 24, originZ = -360, seed = 7 }) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const boxes = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i - (cols - 1) / 2) * spacing;
      const z = originZ - j * spacing;
      const h = Math.round(18 + rand() * rand() * 70);
      const w = footprint - Math.round(rand() * 4);
      boxes.push({ id: `bld-${i}-${j}`, kind: 'building', pos: [x, h / 2, z], size: [w, h, footprint - Math.round(rand() * 4)] });
    }
  }
  return boxes;
}

// Evasion range: tall pillars to break a missile's line of sight
function pillars({ center, radius, count, seed }) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = 60 + rand() * (radius - 80);
    const h = Math.round(30 + rand() * 60), w = 6 + Math.round(rand() * 6);
    out.push({ id: `pillar-${i}`, kind: 'pillar', pos: [center[0] + Math.cos(a) * r, h / 2, center[1] + Math.sin(a) * r], size: [w, h, w] });
  }
  return out;
}

const EVASION = { center: [460, -380], radius: 300 };

// --- The coastal city (art/ key art): land outlines, the sea, and the big structures ---

// A smooth closed outline through control points (Catmull-Rom), as [x, z] points
function outline(ctrl, per = 6) {
  const out = [], n = ctrl.length;
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([Math.round(f(p0[0], p1[0], p2[0], p3[0]) * 10) / 10, Math.round(f(p0[1], p1[1], p2[1], p3[1]) * 10) / 10]);
    }
  }
  return out;
}
// A rough round island outline
function islandOutline([cx, cz], r, seed) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ctrl = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, rr = r * (0.75 + rand() * 0.45); ctrl.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]); }
  return outline(ctrl, 5);
}

// The city's land (everything you've been flying over) and the islands out in the bay
const MAINLAND = outline([[-280, 140], [-150, 210], [20, 185], [180, 150], [330, 60], [520, 10], [700, -40], [820, -170], [850, -380],
  [810, -600], [700, -740], [540, -790], [380, -760], [220, -800], [60, -780], [-120, -800], [-250, -760], [-300, -600], [-280, -420],
  [-320, -260], [-300, -60]]);
const SKYLINE = { center: [600, -1900], radius: 260 };   // the big skyline across the bay (the bridge runs out to it)
const ISLANDS = [
  { center: [-950, -950], radius: 190, seed: 3, houses: 22 },
  { center: [1250, 250], radius: 160, seed: 5, houses: 16 },
  { center: [-420, -1550], radius: 210, seed: 9, houses: 24 },
];

// Skyline towers on their island: slim, tall, pastel and glass
function skyline({ center, radius }, seed = 21) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (radius - 40);
    const h = Math.round(60 + Math.pow(rand(), 1.6) * 280 * (1 - (r / radius) * 0.6)), w = 16 + Math.round(rand() * 18);
    out.push({ id: `sky-${i}`, kind: 'skyline', pos: [Math.round(center[0] + Math.cos(a) * r), h / 2, Math.round(center[1] + Math.sin(a) * r)], size: [w, h, w - Math.round(rand() * 6)], spire: rand() < 0.25 });
  }
  return out;
}

// Elevated monorail along the west side of the city (track and its pillars are solid)
const MONORAIL = { x: -215, z0: 120, z1: -760, top: 16 };
function monorail({ x, z0, z1, top }) {
  const out = [{ id: 'rail-track', kind: 'rail', pos: [x, top - 1, (z0 + z1) / 2], size: [3, 2, Math.abs(z1 - z0)] }];
  for (let z = z0 - 20, i = 0; z > z1; z -= 40, i++) out.push({ id: `rail-pillar-${i}`, kind: 'railPillar', pos: [x, (top - 2) / 2, z], size: [2.4, top - 2, 2.4] });
  return out;
}

// The long bridge from the city's south shore out to the skyline island
const BRIDGE = { x: 570, z0: -770, z1: -1660, deck: 30 };
function bridge({ x, z0, z1, deck }, sea) {
  const len = Math.abs(z1 - z0), out = [{ id: 'bridge-deck', kind: 'bridgeDeck', pos: [x, deck, (z0 + z1) / 2], size: [22, 3, len] }];
  let i = 0;
  for (let z = z0 - 60; z > z1 + 20; z -= 120) out.push({ id: `bridge-pier-${i++}`, kind: 'bridgePier', pos: [x, (deck - 1.5 + sea) / 2, z], size: [9, deck - 1.5 - sea, 12] });
  for (const z of [z0 - 230, z1 + 230]) for (const dx of [-13, 13]) out.push({ id: `bridge-pylon-${i++}`, kind: 'bridgePylon', pos: [x + dx, (sea + deck + 75) / 2, z], size: [4, deck + 75 - sea, 6] });
  return out;
}
// Drone chase: the drone flies this loop (through the downtown streets) when you get close.
const CHASE_PATH = [
    [0, 26, -170],
    [0, 16, -320],
    [0, 14, -440],
    [0, 14, -540],    // corner
    [80, 14, -540],
    [80, 16, -660],   // corner at the city edge
    [-20, 30, -720],
    [-120, 14, -620],
    [-120, 14, -420],
    [-40, 14, -420],  // corner
    [-40, 22, -320],
    [-90, 55, -230],
    [30, 48, -150],
  ];

const SEA = -0.8;   // sea level (the city's land is at 0)

function inside(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Places kept open: the test area round the workshop, the downtown grid (its own buildings), the
// approach to it (low-rise only), the missile park, the monorail line and the bridge's landing.
const OPEN = [
  { x0: -85, x1: 85, z0: -215, z1: 70 },                        // workshop, rings, towers, cargo
  { x0: -175, x1: 175, z0: -675, z1: -325 },                    // downtown grid
  { x0: -232, x1: -198, z0: -800, z1: 200 },                    // monorail
  { x0: 520, x1: 620, z0: -830, z1: -700 },                     // bridge landing
];
const LOW = [{ x0: -175, x1: 175, z0: -325, z1: -215 }];        // the approach (the drone flies through at 14 m+)
const PARK = { center: EVASION.center, radius: EVASION.radius - 20 };

// Is (x, z) within d metres of the drone chase route (seen from above)?
function nearChase(x, z, d) {
  const P = CHASE_PATH;
  for (let i = 0; i < P.length; i++) {
    const [ax, , az] = P[i], [bx, , bz] = P[(i + 1) % P.length];
    const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    if (Math.hypot(x - (ax + vx * t), z - (az + vz * t)) < d) return true;
  }
  return false;
}

// The rest of the city: blocks of pastel buildings on a street grid, taller toward downtown
const CITY = { pitch: 48, block: 34, margin: 12 };
function cityBlocks(land, seed = 31) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const { pitch, block, margin } = CITY, out = [], cells = [];
  const inRect = (r, x, z, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  for (let x = -400; x <= 900; x += pitch) for (let z = 260; z >= -900; z -= pitch) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([a, b]) => inside(land, x + a * (block / 2 + margin), z + b * (block / 2 + margin)));
    if (!corners || OPEN.some((r) => inRect(r, x, z, block / 2))) continue;
    if (Math.hypot(x - PARK.center[0], z - PARK.center[1]) < PARK.radius + block) continue;
    if (nearChase(x, z, 40)) continue;   // (keep the drone chase's route clear)
    cells.push([x, z]);
    const low = LOW.some((r) => inRect(r, x, z, block / 2));
    const toDowntown = Math.hypot(x, z + 500) / 700, tall = Math.max(0, 1 - toDowntown);
    // one big building, or two to four smaller ones sharing the block
    const split = rand() < 0.55 ? 1 : 2;
    const sub = block / split;
    for (let i = 0; i < split; i++) for (let j = 0; j < split; j++) {
      if (split > 1 && rand() < 0.15) continue;   // (a little courtyard)
      const w = sub - 2 - rand() * 4, d = sub - 2 - rand() * 4;
      let h = low ? 6 + rand() * 4 : 8 + rand() * 14 + Math.pow(rand(), 2) * 60 * tall;
      h = Math.round(h);
      const cx = x - block / 2 + sub * (i + 0.5), cz = z - block / 2 + sub * (j + 0.5);
      out.push({ id: `city-${out.length}`, kind: 'building', pos: [Math.round(cx * 10) / 10, h / 2, Math.round(cz * 10) / 10], size: [Math.round(w), h, Math.round(d)] });
    }
  }
  return { boxes: out, cells };
}
const CITYGEN = cityBlocks(MAINLAND);

export const RANGE = {
  groundSize: 3000,
  spawn: { pos: [0, 1.05, 0], heading: 0 },
  workshopPad: { pos: [0, 0, 0], radius: 4 },

  boxes: [
    // Workshop bay (open front)
    { id: 'bay-back',  kind: 'shed', pos: [0, 3.5, 9],   size: [16, 7, 0.6] },
    { id: 'bay-left',  kind: 'shed', pos: [-8, 3.5, 4.5], size: [0.6, 7, 9] },
    { id: 'bay-right', kind: 'shed', pos: [8, 3.5, 4.5],  size: [0.6, 7, 9] },

    // Landing towers
    { id: 'towerA', name: 'Tower A', kind: 'tower', pos: [-18, 6, -40],  size: [8, 12, 8], pad: true, delivery: true },
    { id: 'towerB', name: 'Tower B', kind: 'tower', pos: [24, 11, -78],  size: [6, 22, 6], pad: true },
    { id: 'towerC', name: 'Tower C', kind: 'tower', pos: [-26, 18, -128], size: [4.5, 36, 4.5], pad: true },

    // Obstacles to fly around (or crash into)
    { id: 'wall1',  kind: 'wall',  pos: [12, 2.5, -28],  size: [14, 5, 1] },
    { id: 'block1', kind: 'block', pos: [-38, 4, -86],   size: [12, 8, 12] },
    { id: 'archL',  kind: 'wall',  pos: [34, 7, -22],    size: [1.6, 14, 1.6] },
    { id: 'archR',  kind: 'wall',  pos: [44, 7, -22],    size: [1.6, 14, 1.6] },
    { id: 'archTop', kind: 'wall', pos: [39, 14.8, -22], size: [11.6, 1.6, 1.6] },
    { id: 'junk1', kind: 'junk', pos: [-14, 1, -14],  size: [3, 2, 2] },
    { id: 'junk2', kind: 'junk', pos: [-17, 0.75, -11], size: [2, 1.5, 3] },
    { id: 'junk3', kind: 'junk', pos: [18, 1.25, -52], size: [4, 2.5, 3] },
    { id: 'junk4', kind: 'junk', pos: [4, 0.6, -100], size: [2.5, 1.2, 2.5] },
    ...downtown({}),
    ...pillars({ center: EVASION.center, radius: EVASION.radius, count: 14, seed: 11 }),
    ...monorail(MONORAIL),
    ...bridge(BRIDGE, SEA),
    ...skyline(SKYLINE),
    ...CITYGEN.boxes,
  ],
  cityCells: CITYGEN.cells,   // street-grid blocks (for drawing streets and sidewalks)
  cityGrid: CITY,
  park: PARK,

  // The coastal city: land outlines ([x, z] points; the first is the city itself), sea level, and
  // the scenery that goes with them (see CityScenery)
  coast: MAINLAND,
  islands: [{ outline: islandOutline(SKYLINE.center, SKYLINE.radius, 13), skyline: true }, ...ISLANDS.map((i) => ({ ...i, outline: islandOutline(i.center, i.radius, i.seed) }))],
  seaLevel: SEA,
  monorail: MONORAIL,
  bridge: BRIDGE,

  // Missile launchers fire while you're airborne inside this zone
  evasion: {
    center: EVASION.center,
    radius: EVASION.radius,
    launchers: [[460, 0, -380], [590, 0, -250], [350, 0, -560]],
  },

  // Drone chase: the drone flies this loop (through the downtown streets) when you get close.
  chasePath: CHASE_PATH,
  // Ring course, flown in order. Ring facing is worked out from the path.
  ringRadius: 3,
  rings: [
    [0, 5, -20],
    [-10, 9, -55],
    [6, 16, -95],
    [-26, 40, -128],  // over Tower C
    [28, 12, -118],
    [39, 7, -22],     // through the arch
    [18, 5, 6],
    [6, 4, 14],
  ],

  // Cargo for the lift test. Deliver to the pad marked delivery.
  crates: [
    { id: 'crate',  name: 'Supply crate', mass: 25, pos: [5, 0.42, -7],  kind: 'crate' },
    { id: 'engine', name: 'Engine block', mass: 90, pos: [-5, 0.42, -7], kind: 'engine' },
  ],
};
