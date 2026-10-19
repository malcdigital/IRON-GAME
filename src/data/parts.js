// Parts catalog. Add a part by adding an entry here; nothing else needs to change.
//
// Thrusters: thrust in newtons, powerPerN = power units used per newton,
// heatRate = % heat gained per second at full throttle,
// cool = % heat shed per second when at 100% heat (cooling scales with heat), hp = condition.

export const SLOTS = ['helmet', 'core', 'chest', 'back', 'gauntlets', 'boots'];

export const SLOT_LABELS = {
  helmet: 'Helmet',
  core: 'Power core',
  chest: 'Chest',
  back: 'Back jet',
  gauntlets: 'Gauntlets',
  boots: 'Boots',
};

// Make a left and right copy of a thruster.
const mirror = (t) => [
  { ...t, id: t.id + 'L', label: 'L ' + t.label, mount: t.mount + 'L' },
  { ...t, id: t.id + 'R', label: 'R ' + t.label, mount: t.mount + 'R' },
];

const backJet = (o) => [{ id: 'back', label: 'Back jet', mount: 'back', dir: [0, 1, 0], ...o }];
const boots = (o) => mirror({ id: 'boot', label: 'boot', mount: 'boot', dir: [0, 1, 0], ...o });
// Gauntlets angle slightly forward, which lets them twist the suit (yaw).
const hands = (o) => mirror({ id: 'hand', label: 'gauntlet', mount: 'hand', dir: [0, 1, -0.15], ...o });

export const PARTS = {
  // ---------- Power cores ----------
  core_battery: {
    slot: 'core', name: 'Car Battery Rig', tier: 1, mass: 18, hp: 70,
    power: 100, heatRate: 30, cool: 45,
    blurb: 'Two truck batteries and a lot of tape.',
    visual: { shape: 'battery', color: 0x3c4a3a, glow: 0xf0a830 },
  },
  core_evpack: {
    slot: 'core', name: 'Salvaged EV Pack', tier: 2, mass: 24, hp: 90,
    power: 170, heatRate: 26, cool: 50,
    blurb: 'Pulled from a crashed delivery van.',
    visual: { shape: 'pack', color: 0x55606b, glow: 0x9ad16b },
  },
  core_cell: {
    slot: 'core', name: 'Prototype Fusion Cell', tier: 3, mass: 14, hp: 100,
    power: 280, heatRate: 22, cool: 60,
    blurb: 'Light, strong, and nobody knows where it came from.',
    visual: { shape: 'cell', color: 0x2c3640, glow: 0x74d3c4 },
  },

  // ---------- Back jets ----------
  back_blower: {
    slot: 'back', name: 'Leaf-Blower Pack', tier: 1, mass: 12,
    thrusters: backJet({ thrust: 900, powerPerN: 0.05, heatRate: 42, cool: 58, hp: 60 }),
    blurb: 'Two garden blowers, re-geared and very loud.',
    visual: { shape: 'blower', color: 0xc8642c },
  },
  back_jetski: {
    slot: 'back', name: 'Jet-Ski Turbine', tier: 2, mass: 20,
    thrusters: backJet({ thrust: 1500, powerPerN: 0.045, heatRate: 36, cool: 62, hp: 90 }),
    blurb: 'Strong, heavy, still smells like the lake.',
    visual: { shape: 'turbine', color: 0xd9bf45 },
  },
  back_microjet: {
    slot: 'back', name: 'Twin Microjets', tier: 3, mass: 16,
    thrusters: backJet({ thrust: 2300, powerPerN: 0.04, heatRate: 30, cool: 72, hp: 110 }),
    blurb: 'Model-aircraft jets scaled up. Runs cool.',
    visual: { shape: 'microjet', color: 0x8a949c },
  },

  // ---------- Boots ----------
  boots_fan: {
    slot: 'boots', name: 'Welded Fan Boots', tier: 1, mass: 16,
    thrusters: boots({ thrust: 350, powerPerN: 0.05, heatRate: 48, cool: 60, hp: 50 }),
    blurb: 'Work boots with drone fans bolted under the soles.',
    visual: { shape: 'fan', color: 0x7a6a50 },
  },
  boots_ducted: {
    slot: 'boots', name: 'Ducted Fan Boots', tier: 2, mass: 18,
    thrusters: boots({ thrust: 560, powerPerN: 0.045, heatRate: 40, cool: 66, hp: 80 }),
    blurb: 'Shrouded fans. More push, less noise.',
    visual: { shape: 'ducted', color: 0xb8a24a },
  },
  boots_ion: {
    slot: 'boots', name: 'Ion Boots', tier: 3, mass: 14,
    thrusters: boots({ thrust: 820, powerPerN: 0.04, heatRate: 34, cool: 74, hp: 100 }),
    blurb: 'Quiet blue glow, serious lift.',
    visual: { shape: 'ion', color: 0x5f6b75, glow: 0x74d3c4 },
  },

  // ---------- Gauntlets ----------
  gaunt_shopvac: {
    slot: 'gauntlets', name: 'Shop-Vac Gauntlets', tier: 1, mass: 6,
    thrusters: hands({ thrust: 125, powerPerN: 0.05, heatRate: 55, cool: 62, hp: 40 }),
    blurb: 'Vacuum motors running in reverse. For balance, not lift.',
    visual: { shape: 'shopvac', color: 0x8c2f2a },
  },
  gaunt_vector: {
    slot: 'gauntlets', name: 'Vector Gauntlets', tier: 2, mass: 7,
    thrusters: hands({ thrust: 230, powerPerN: 0.045, heatRate: 45, cool: 68, hp: 60 }),
    blurb: 'Better steering, steadier hover.',
    visual: { shape: 'vector', color: 0xd9bf45 },
  },
  gaunt_pulse: {
    slot: 'gauntlets', name: 'Pulse Gauntlets', tier: 3, mass: 7,
    thrusters: hands({ thrust: 360, powerPerN: 0.04, heatRate: 38, cool: 76, hp: 80 }),
    blurb: 'Snappy and precise. Great for tight turns.',
    visual: { shape: 'pulse', color: 0x5f6b75, glow: 0x74d3c4 },
  },

  // ---------- Chest ----------
  chest_scrap: {
    slot: 'chest', name: 'Scrap Plate', tier: 1, mass: 15, hp: 120,
    armor: 1.0, coolMult: 1.0,
    blurb: 'Car door steel, hammered flat.',
    visual: { shape: 'plate', color: 0x6d6a5f },
  },
  chest_radiator: {
    slot: 'chest', name: 'Radiator Vest', tier: 2, mass: 12, hp: 90,
    armor: 1.2, coolMult: 1.6,
    blurb: 'Car radiator fins. Everything runs cooler.',
    visual: { shape: 'radiator', color: 0x9aa3a8 },
  },
  chest_composite: {
    slot: 'chest', name: 'Composite Shell', tier: 2, mass: 9, hp: 110,
    armor: 1.6, coolMult: 1.0,
    blurb: 'Light and tough. Cut from a race car body.',
    visual: { shape: 'shell', color: 0x2f4f6a },
  },
  chest_heavy: {
    slot: 'chest', name: 'Forklift Plate', tier: 3, mass: 30, hp: 240,
    armor: 2.8, coolMult: 0.85,
    blurb: 'Almost nothing gets through. Almost nothing takes off, either.',
    visual: { shape: 'heavy', color: 0xc9a227 },
  },

  // ---------- Helmets ----------
  helm_welding: {
    slot: 'helmet', name: 'Welding Mask Rig', tier: 1, mass: 3, hp: 40,
    gyro: 45, assist: 0.8,
    blurb: 'A phone gyro taped inside a welding mask.',
    visual: { shape: 'welding', color: 0x2e2f2a, glow: 0xf0a830 },
  },
  helm_drone: {
    slot: 'helmet', name: 'Drone Gyro Helm', tier: 2, mass: 5, hp: 60,
    gyro: 120, assist: 1.0,
    blurb: 'Flight controller from a racing drone. Much steadier.',
    visual: { shape: 'drone', color: 0x44505a, glow: 0x9ad16b },
  },
  helm_ai: {
    slot: 'helmet', name: 'Co-Pilot Helm', tier: 3, mass: 6, hp: 70,
    gyro: 230, assist: 1.25,
    blurb: 'An onboard AI that helps you fly. It has opinions.',
    visual: { shape: 'ai', color: 0x22303a, glow: 0x74d3c4 },
  },
};

export const STARTER_LOADOUT = {
  helmet: 'helm_welding',
  core: 'core_battery',
  chest: 'chest_scrap',
  back: 'back_blower',
  gauntlets: 'gaunt_shopvac',
  boots: 'boots_fan',
};

export function partsForSlot(slot) {
  return Object.entries(PARTS)
    .filter(([, p]) => p.slot === slot)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.tier - b.tier);
}

// Fill any missing or unknown slot with the starter part.
export function validLoadout(loadout) {
  const out = {};
  for (const slot of SLOTS) {
    const id = loadout?.[slot];
    out[slot] = PARTS[id]?.slot === slot ? id : STARTER_LOADOUT[slot];
  }
  return out;
}
