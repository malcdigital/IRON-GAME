import * as THREE from '../lib/three.js';

// "Hero" look from the character sheet: ivory ceramic armour, navy flexible undersuit,
// orange enamel trim, a dark glass visor and glowing orange engine strips.
// Same slots and nozzle positions as the scrap look, so damage, heat and flames work the same.

export const PALETTE = {
  ivory: 0xf4ecda,
  navy: 0x1e2740,
  orange: 0xe8661c,
  black: 0x17181b,
  visor: 0x0b1633,
  engine: 0xff8a1e,
};

const ivoryMat = () => new THREE.MeshStandardMaterial({ color: PALETTE.ivory, roughness: 0.45, metalness: 0.08, flatShading: true });
const orangeMat = () => new THREE.MeshStandardMaterial({ color: PALETTE.orange, roughness: 0.35, metalness: 0.15, flatShading: true });
const navyMat = () => new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.85, metalness: 0.05, flatShading: true });
const blackMat = () => new THREE.MeshStandardMaterial({ color: PALETTE.black, roughness: 0.6, metalness: 0.3, flatShading: true });
const glowMat = (c = PALETTE.engine, i = 2.2) => new THREE.MeshStandardMaterial({ color: 0x221006, emissive: c, emissiveIntensity: i });
const visorMat = () => new THREE.MeshStandardMaterial({ color: PALETTE.visor, roughness: 0.08, metalness: 0.9, emissive: 0x1b3a7a, emissiveIntensity: 0.25 });

function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  return mesh;
}

function limb(a, b, thick, m, depth = thick) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, A.distanceTo(B), depth), m);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  mesh.castShadow = true;
  return mesh;
}

function cyl(rt, rb, h, m, pos, rot = [0, 0, 0], seg = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  return mesh;
}

function ring(r, tube, m, pos, rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 14), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  return mesh;
}

function nozzle(m, pos) {
  return cyl(0.06, 0.08, 0.1, m, pos, [0, 0, 0], 10);
}

// Navy undersuit with ivory leg and arm armour (the base everyone wears)
export function buildHeroPilot() {
  const g = new THREE.Group();
  const navy = navyMat(), ivory = ivoryMat(), orange = orangeMat(), black = blackMat();
  // Torso, hips, neck
  g.add(box(0.44, 0.56, 0.27, navy, 0, 0.18, 0));
  g.add(box(0.36, 0.22, 0.24, navy, 0, -0.2, 0));
  g.add(box(0.13, 0.1, 0.13, black, 0, 0.51, 0));
  for (const s of [-1, 1]) {
    // Arms: navy, with ivory upper-arm plate
    g.add(limb([0.29 * s, 0.38, 0], [0.46 * s, 0.14, -0.08], 0.12, navy));
    g.add(limb([0.31 * s, 0.33, -0.01], [0.42 * s, 0.18, -0.06], 0.14, ivory));
    g.add(limb([0.46 * s, 0.14, -0.08], [0.55 * s, 0.0, -0.2], 0.11, navy));
    // Legs: navy, ivory thigh and shin plates with orange knee and shin accents
    g.add(limb([0.12 * s, -0.28, 0], [0.14 * s, -0.6, 0.05], 0.16, navy));
    g.add(box(0.15, 0.24, 0.05, ivory, 0.13 * s, -0.42, -0.08, -0.12, 0, 0));
    g.add(box(0.06, 0.12, 0.04, orange, 0.19 * s, -0.4, -0.06, -0.12, 0, 0));
    g.add(limb([0.14 * s, -0.6, 0.05], [0.15 * s, -0.86, 0.02], 0.13, navy));
    g.add(box(0.15, 0.24, 0.06, ivory, 0.145 * s, -0.72, -0.05));
    g.add(box(0.1, 0.08, 0.05, orange, 0.145 * s, -0.62, -0.08));
    g.add(box(0.06, 0.06, 0.06, black, 0.145 * s, -0.6, -0.04));
    // Hips: ivory side plates with a small orange light
    g.add(box(0.07, 0.16, 0.2, ivory, 0.21 * s, -0.2, 0));
    g.add(box(0.02, 0.04, 0.04, glowMat(0xffc860, 1.4), 0.245 * s, -0.17, -0.05));
  }
  return g;
}

export const HERO_BUILDERS = {
  helmet(part) {
    const ivory = ivoryMat(), orange = orangeMat(), black = blackMat();
    const g = new THREE.Group();
    // Rounded shell
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), ivory);
    shell.scale.set(0.95, 1.05, 1.08);
    shell.position.set(0, 0.69, 0.01);
    shell.castShadow = true;
    g.add(shell);
    // Orange crest down the middle
    g.add(box(0.07, 0.04, 0.3, orange, 0, 0.84, 0.0, -0.25, 0, 0));
    g.add(box(0.06, 0.12, 0.04, orange, 0, 0.78, -0.15, 0.35, 0, 0));
    // Big dark glass visor
    // (a slice of a sphere centred on -Z, the front)
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 8, -Math.PI / 2 - Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.3, Math.PI * 0.34), visorMat());
    visor.position.set(0, 0.68, 0.0);
    visor.scale.set(1.0, 1.12, 1.12);
    g.add(visor);
    // Chin and ear rings (orange disc with a dark centre)
    g.add(box(0.14, 0.05, 0.08, black, 0, 0.56, -0.08));
    for (const s of [-1, 1]) {
      g.add(cyl(0.05, 0.05, 0.03, orange, [0.155 * s, 0.69, 0], [0, 0, Math.PI / 2]));
      g.add(cyl(0.028, 0.028, 0.035, black, [0.16 * s, 0.69, 0], [0, 0, Math.PI / 2]));
    }
    return { group: g, mats: [ivory, orange] };
  },

  core(part) {
    // Two small gold-orange lights on the chest plate
    const glow = glowMat(part.visual.glow ?? 0xffb84a, 1.6);
    const g = new THREE.Group();
    for (const s of [-1, 1]) g.add(box(0.035, 0.035, 0.02, glow, 0.09 * s, 0.4, -0.235, 0, 0, Math.PI / 4));
    return { group: g, mats: [] };
  },

  chest(part) {
    const ivory = ivoryMat(), orange = orangeMat(), black = blackMat();
    const g = new THREE.Group();
    const heavy = part.visual.shape === 'heavy';
    const w = heavy ? 0.58 : 0.5;
    // Front plate: upper chest, then a V tapering to the waist
    g.add(box(w, 0.22, 0.07, ivory, 0, 0.38, -0.19));
    g.add(box(w * 0.6, 0.16, 0.06, ivory, 0, 0.21, -0.18));
    for (const s of [-1, 1]) {
      g.add(box(w * 0.32, 0.16, 0.06, ivory, (w * 0.3) * s, 0.24, -0.17, 0, 0, -0.45 * s));
      g.add(box(0.03, 0.14, 0.03, orange, (w * 0.42) * s, 0.27, -0.205, 0, 0, -0.45 * s));
    }
    g.add(box(0.16, 0.1, 0.06, ivory, 0, 0.1, -0.16));
    g.add(box(w * 0.7, 0.03, 0.03, orange, 0, 0.495, -0.2));     // collar trim
    // Back plate and spine
    g.add(box(w, 0.36, 0.05, ivory, 0, 0.3, 0.16));
    g.add(box(0.12, 0.5, 0.05, ivory, 0, 0.2, 0.2));
    g.add(box(0.02, 0.08, 0.02, glowMat(0xffc860, 1.2), 0, 0.12, 0.23));
    // Big pauldrons with orange trim
    for (const s of [-1, 1]) {
      const px = (w / 2 + 0.08) * s;
      g.add(box(0.22, 0.12, 0.3, ivory, px, 0.44, 0, 0, 0, -0.35 * s));
      g.add(box(0.2, 0.1, 0.26, ivory, px * 1.08, 0.36, 0, 0, 0, -0.7 * s));
      g.add(box(0.04, 0.05, 0.28, orange, px * 1.25, 0.32, 0, 0, 0, -0.7 * s));
      g.add(cyl(0.035, 0.035, 0.06, black, [px * 0.82, 0.4, 0.12], [Math.PI / 2, 0, 0]));
    }
    if (part.visual.shape === 'radiator') {
      for (let i = 0; i < 4; i++) g.add(box(0.3, 0.012, 0.02, black, 0, 0.3 + i * 0.03, -0.225));
    }
    if (heavy) g.add(box(0.46, 0.12, 0.08, ivory, 0, 0.02, -0.17));
    return { group: g, mats: [ivory, orange] };
  },

  // Twin back thruster pods rising above the shoulders, glowing orange strips down the outside
  back(part) {
    const ivory = ivoryMat(), orange = orangeMat(), black = blackMat();
    const glow = glowMat();
    const g = new THREE.Group();
    const big = part.visual.shape === 'turbine';
    for (const s of [-1, 1]) {
      const x = 0.15 * s;
      // Tall pod rising above the shoulder, tilted slightly outward
      g.add(box(0.1, big ? 0.6 : 0.54, 0.14, ivory, x, 0.36, 0.3, 0.12, 0, -0.1 * s));
      g.add(box(0.11, 0.08, 0.15, orange, x + 0.006 * s, 0.6, 0.3, 0.12, 0, -0.1 * s));
      g.add(box(0.022, 0.34, 0.06, glow, x + 0.055 * s, 0.36, 0.28, 0.12, 0, -0.1 * s));
      // Lower duct down to the nozzle
      g.add(box(0.08, 0.16, 0.1, black, x * 0.85, 0.02, 0.3));
      g.add(box(0.09, 0.07, 0.11, orange, x * 0.82, -0.08, 0.3));
      g.add(ring(0.04, 0.012, orange, [x * 1.6, 0.12, 0.25], [0, Math.PI / 2, 0]));
    }
    g.add(box(0.16, 0.34, 0.08, black, 0, 0.22, 0.24));
    const nozzles = [[-0.12, -0.15, 0.3], [0.12, -0.15, 0.3]];
    for (const p of nozzles) g.add(nozzle(black, p));
    return { group: g, mats: [ivory, orange], flames: nozzles.map((p) => [p[0], p[1] - 0.05, p[2]]) };
  },

  boots(part, side) {
    const ivory = ivoryMat(), orange = orangeMat(), black = blackMat();
    const g = new THREE.Group();
    const x = 0.15 * side;
    g.add(box(0.19, 0.17, 0.3, ivory, x, -0.9, -0.03));        // chunky boot
    g.add(box(0.2, 0.05, 0.32, orange, x, -0.995, -0.03));      // orange sole
    g.add(box(0.2, 0.08, 0.2, orange, x, -0.79, 0.01));         // ankle cuff
    g.add(box(0.12, 0.05, 0.1, ivory, x, -0.84, -0.15, 0.4, 0, 0));
    g.add(nozzle(black, [x, -1.0, 0.04]));
    return { group: g, mats: [ivory, orange], flames: [[x, -1.05, 0.04]] };
  },

  gauntlets(part, side) {
    const ivory = ivoryMat(), orange = orangeMat(), black = blackMat();
    const g = new THREE.Group();
    const x = 0.55 * side;
    // Chunky forearm armour with an orange side panel, black hand
    g.add(box(0.15, 0.15, 0.24, ivory, x * 0.97, 0.05, -0.15));
    g.add(box(0.03, 0.09, 0.16, orange, x * 0.97 + 0.08 * side, 0.05, -0.15));
    g.add(box(0.1, 0.1, 0.1, black, x, -0.05, -0.24));
    g.add(ring(0.03, 0.01, orange, [x + 0.09 * side, -0.02, -0.12], [0, 0, 0]));   // carabiner
    g.add(nozzle(black, [x, -0.07, -0.2]));
    return { group: g, mats: [ivory, orange], flames: [[x, -0.12, -0.2]] };
  },
};
