import * as THREE from '../lib/three.js';

// Builds the suit's 3D model from its parts and shows heat, damage and thrust.
// Models are simple boxes so they're cheap to draw and easy to replace later.

const UP = new THREE.Vector3(0, 1, 0);
const PILOT_COLOR = 0x2b2f33;
const BURNT = new THREE.Color(0x231a14);
const HOT = new THREE.Color(0xff5a20);

const flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.075, 1, 10, 1, true);
  g.rotateX(Math.PI);      // point the tip down
  g.translate(0, -0.5, 0); // base at the nozzle, tip 1 unit below
  return g;
})();

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.35, flatShading: true, ...opts });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A box stretched between two points (arms, legs)
function limb(a, b, thick, material) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), material);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  return m;
}

function nozzle(material, pos) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 10), material);
  m.position.set(...pos);
  m.castShadow = true;
  return m;
}

// ---- Part builders: one per slot. Each returns meshes and the materials to tint. ----
// `side` is -1 (left) or 1 (right) for paired parts.

const BUILDERS = {
  helmet(part) {
    const m = mat(part.visual.color);
    const visor = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: part.visual.glow, emissiveIntensity: 1.2 });
    const g = new THREE.Group();
    g.add(box(0.27, 0.3, 0.29, m, 0, 0.68, 0));
    g.add(box(0.21, 0.06, 0.02, visor, 0, 0.7, -0.15));
    if (part.visual.shape === 'welding') g.add(box(0.29, 0.18, 0.04, m, 0, 0.6, -0.15));
    if (part.visual.shape !== 'welding') g.add(box(0.04, 0.12, 0.2, m, 0.15, 0.72, 0), box(0.04, 0.12, 0.2, m, -0.15, 0.72, 0));
    return { group: g, mats: [m] };
  },

  core(part) {
    const m = mat(part.visual.color);
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: part.visual.glow, emissiveIntensity: 1.4 });
    const g = new THREE.Group();
    if (part.visual.shape === 'cell') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16), glow);
      c.rotation.x = Math.PI / 2;
      c.position.set(0, 0.26, -0.22);
      g.add(c, box(0.2, 0.2, 0.03, m, 0, 0.26, -0.2));
    } else if (part.visual.shape === 'pack') {
      g.add(box(0.3, 0.12, 0.06, m, 0, 0.0, -0.2), box(0.22, 0.03, 0.02, glow, 0, 0.03, -0.235));
    } else {
      g.add(box(0.18, 0.13, 0.08, m, 0, 0.02, -0.21));
      g.add(box(0.03, 0.03, 0.03, glow, -0.05, 0.1, -0.22), box(0.03, 0.03, 0.03, glow, 0.05, 0.1, -0.22));
    }
    return { group: g, mats: [m] };
  },

  chest(part) {
    const m = mat(part.visual.color);
    const g = new THREE.Group();
    const heavy = part.visual.shape === 'heavy';
    const w = heavy ? 0.6 : 0.52;
    g.add(box(w, 0.36, 0.06, m, 0, 0.3, -0.17));
    g.add(box(w, 0.36, 0.05, m, 0, 0.3, 0.16));
    g.add(box(0.18, 0.08, 0.28, m, -0.3, 0.44, 0), box(0.18, 0.08, 0.28, m, 0.3, 0.44, 0));
    if (part.visual.shape === 'radiator') {
      for (let i = 0; i < 5; i++) g.add(box(0.44, 0.015, 0.03, m, 0, 0.18 + i * 0.05, -0.21));
    }
    if (heavy) g.add(box(0.5, 0.18, 0.08, m, 0, 0.0, -0.18));
    return { group: g, mats: [m] };
  },

  // Thruster parts get one builder call per thruster
  back(part) {
    const m = mat(part.visual.color);
    const dark = mat(0x22252a);
    const g = new THREE.Group();
    const shape = part.visual.shape;
    if (shape === 'blower') {
      g.add(box(0.36, 0.4, 0.2, m, 0, 0.26, 0.26));
      g.add(limb([-0.12, 0.1, 0.3], [-0.12, -0.12, 0.3], 0.1, m), limb([0.12, 0.1, 0.3], [0.12, -0.12, 0.3], 0.1, m));
    } else if (shape === 'turbine') {
      g.add(box(0.4, 0.46, 0.24, m, 0, 0.26, 0.28));
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 14), dark);
      t.position.set(0, 0.0, 0.3);
      g.add(t);
    } else {
      g.add(box(0.3, 0.36, 0.14, m, 0, 0.28, 0.23));
      for (const x of [-0.11, 0.11]) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 12), m);
        c.position.set(x, 0.12, 0.34);
        g.add(c);
      }
    }
    const nozzles = shape === 'turbine' ? [[0, -0.17, 0.3]] : [[-0.12, -0.15, 0.3], [0.12, -0.15, 0.3]];
    for (const p of nozzles) g.add(nozzle(dark, p));
    return { group: g, mats: [m], flames: nozzles.map((p) => [p[0], p[1] - 0.05, p[2]]) };
  },

  boots(part, side) {
    const m = mat(part.visual.color);
    const dark = mat(0x22252a);
    const g = new THREE.Group();
    const x = 0.15 * side;
    g.add(box(0.17, 0.2, 0.28, m, x, -0.9, -0.02));
    if (part.visual.shape !== 'fan') g.add(box(0.19, 0.08, 0.2, m, x, -0.74, 0.02));
    g.add(nozzle(dark, [x, -1.0, 0.02]));
    return { group: g, mats: [m], flames: [[x, -1.05, 0.02]] };
  },

  gauntlets(part, side) {
    const m = mat(part.visual.color);
    const dark = mat(0x22252a);
    const g = new THREE.Group();
    const x = 0.55 * side;
    g.add(box(0.13, 0.14, 0.22, m, x, 0.02, -0.17));
    if (part.visual.shape === 'shopvac') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10), m);
      c.position.set(x, 0.1, -0.12);
      g.add(c);
    }
    g.add(nozzle(dark, [x, -0.07, -0.2]));
    return { group: g, mats: [m], flames: [[x, -0.12, -0.2]] };
  },
};

function buildPilot() {
  const g = new THREE.Group();
  const m = mat(PILOT_COLOR, { metalness: 0.05, roughness: 0.9 });
  g.add(box(0.46, 0.56, 0.28, m, 0, 0.18, 0));
  g.add(box(0.38, 0.22, 0.24, m, 0, -0.2, 0));
  g.add(box(0.22, 0.26, 0.24, m, 0, 0.66, 0));
  for (const s of [-1, 1]) {
    g.add(limb([0.29 * s, 0.38, 0], [0.46 * s, 0.14, -0.08], 0.11, m));
    g.add(limb([0.46 * s, 0.14, -0.08], [0.55 * s, 0.0, -0.2], 0.1, m));
    g.add(limb([0.12 * s, -0.28, 0], [0.14 * s, -0.6, 0.05], 0.14, m));
    g.add(limb([0.14 * s, -0.6, 0.05], [0.15 * s, -0.86, 0.02], 0.12, m));
  }
  return g;
}

export class SuitView {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.parts = [];   // { comp, mats, base colors }
    this.flames = [];  // { comp, mesh, core }
  }

  build(suit) {
    this.root.clear();
    this.parts = [];
    this.flames = [];
    this.root.add(buildPilot());

    for (const comp of suit.list) {
      const slot = comp.slot;
      const side = comp.id.endsWith('L') ? -1 : comp.id.endsWith('R') ? 1 : 0;
      const built = BUILDERS[slot](comp.part, side);
      this.root.add(built.group);
      this.parts.push({ comp, mats: built.mats, base: built.mats.map((m) => m.color.clone()) });

      if (comp.thruster && built.flames) {
        for (const p of built.flames) this.addFlame(comp, p);
      }
    }
  }

  addFlame(comp, pos) {
    const outer = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
      color: 0xff8a2a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const inner = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
      color: 0xfff1c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const holder = new THREE.Group();
    holder.position.set(...pos);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), comp.thruster.dir);
    holder.add(outer, inner);
    this.root.add(holder);
    const ion = comp.part.visual.glow != null;
    if (ion) { outer.material.color.setHex(0x5fc9ff); inner.material.color.setHex(0xd8f6ff); }
    this.flames.push({ comp, holder, outer, inner });
  }

  update(game, boost, time) {
    const b = game.body;
    this.root.position.copy(b.pos);
    this.root.quaternion.copy(b.quat);

    for (const f of this.flames) {
      const u = f.comp.throttle;
      const on = u > 0.02 && f.comp.available > 0;
      f.holder.visible = on;
      if (!on) continue;
      // Nozzles swivel: point the flame along the real thrust direction
      if (f.comp.thrustDir) f.holder.quaternion.setFromUnitVectors(UP, f.comp.thrustDir);
      const flicker = 0.85 + Math.random() * 0.3;
      const len = (0.15 + u * (boost ? 1.1 : 0.7)) * flicker;
      const w = 0.6 + u * 0.6;
      f.outer.scale.set(w, len, w);
      f.inner.scale.set(w * 0.5, len * 0.55, w * 0.5);
    }

    // Heat glows orange, damage darkens the paint
    for (const p of this.parts) {
      const c = p.comp;
      const heat = Math.min(1, c.heat / 100);
      const dmg = 1 - c.hp / c.maxHp;
      p.mats.forEach((m, i) => {
        m.color.copy(p.base[i]).lerp(BURNT, dmg * 0.75);
        m.emissive.copy(HOT);
        let glow = heat * heat * 0.9;
        if (c.overheated) glow = 0.7 + Math.sin(time * 18) * 0.3;
        m.emissiveIntensity = glow;
      });
    }
  }
}

