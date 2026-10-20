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
  ],

  // Drone chase: the drone flies this loop (through the downtown streets) when you get close.
  chasePath: [
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
  ],

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
