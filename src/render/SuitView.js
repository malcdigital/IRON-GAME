import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';
import { HERO_BUILDERS, buildHeroPilot, PALETTE } from './HeroSuit.js';
import { loadSuitModel, placeModel } from './ModelSuit.js';
import { SuitPoser } from './SuitPoses.js';
import { ThrustTrail } from './ThrustTrails.js';
import { flameMaterial, Embers, Smoke, ShockRing } from './ThrusterFx.js';

// Builds the suit's 3D model from its parts and shows heat, damage and thrust.
// Models are simple boxes so they're cheap to draw and easy to replace later.

const UP = new THREE.Vector3(0, 1, 0);
const _bc = new THREE.Color(), _np = new THREE.Vector3(), _np2 = new THREE.Vector3(), _nd = new THREE.Vector3(), _nv = new THREE.Vector3(), _hp = new THREE.Vector3(), _he = new THREE.Vector3();
const PILOT_COLOR = 0x2b2f33;
const BURNT = new THREE.Color(0x231a14);
const HOT = new THREE.Color(0xff5a20);

const flameGeo = (() => {
  const g = new THREE.ConeGeometry(0.075, 1, 28, 14, true);   // (plenty of segments so the wobble bends smoothly)
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
    this._qInv = new THREE.Quaternion(); this._podQ = new THREE.Quaternion(); this._qId = new THREE.Quaternion();
    this._inv = new THREE.Matrix4(); this._tmpV = new THREE.Vector3(); this._tmpV2 = new THREE.Vector3();
    events.on('respawn', () => this.resetLook());
  }

  // After a reset: standing pose, nothing left over from before (poses, springs, streaks)
  resetLook() {
    this.poser?.reset();
    for (const f of this.flames) { f.trail.pts.length = 0; f.trail.mesh.visible = false; f.holder.visible = false; }
  }

  build(suit) {
    this.root.clear();
    for (const f of this.flames) f.trail?.dispose();
    this.poser = null;
    this.parts = [];
    this.flames = [];
    const useModel = CONFIG.suitStyle === 'model';
    const hero = CONFIG.suitStyle === 'hero' || useModel;
    this.boxes = [];
    this.model = null;
    const pilot = hero ? buildHeroPilot() : buildPilot();
    this.root.add(pilot);
    this.boxes.push(pilot);

    for (const comp of suit.list) {
      const slot = comp.slot;
      const side = comp.id.endsWith('L') ? -1 : comp.id.endsWith('R') ? 1 : 0;
      const built = (hero ? HERO_BUILDERS : BUILDERS)[slot](comp.part, side);
      this.root.add(built.group);
      this.boxes.push(built.group);
      this.parts.push({ comp, mats: built.mats, base: built.mats.map((m) => m.color.clone()) });

      if (comp.thruster && built.flames) {
        for (const p of built.flames) this.addFlame(comp, p);
      }
    }
    // The 3D model replaces the box parts once it has loaded (the boxes show until then,
    // and stay if it can't load). The boxes' flame positions are kept.
    if (useModel) {
      const token = (this.buildToken = (this.buildToken ?? 0) + 1);
      loadSuitModel(CONFIG.suitModel.url).then((gltf) => {
        if (token !== this.buildToken) return;
        const placed = placeModel(gltf, { ...CONFIG.suitModel, toon: CONFIG.art.style === 'toon', anime: CONFIG.art.style === 'anime', rim: CONFIG.art.rim });
        this.model = placed;
        this.modelBase = placed.mats.map((m) => m.color.clone());
        this.modelEmissive = placed.mats.map((m) => m.emissive.clone());
        this.root.add(placed.model);
        this.poser = new SuitPoser(placed.model, placed.bones, this.root);
        for (const b of this.boxes) b.visible = false;
        this.attachFlamesToModel(placed);
      }).catch((err) => {
        console.warn('Suit model failed to load, using the box suit', err);
        events.emit('toast', { text: `3D suit couldn't load (${err?.message ?? err}). Showing the box suit.`, kind: 'hot' });
      });
    }
  }

  // Move the hand and boot flames onto the model's hands and feet
  attachFlamesToModel(placed) {
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const at = (name) => {
      const b = placed.bones[name];
      return b ? b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : null;
    };
    // Back pods: remember their rest pose and how their parent sits relative to the suit
    const rootQInv = new THREE.Quaternion();
    this.root.getWorldQuaternion(rootQInv).invert();
    this.pods = placed.pods.map((p) => ({
      ...p,
      rest: p.pod.quaternion.clone(),
      parentQ: rootQInv.clone().multiply(p.pod.parent.getWorldQuaternion(new THREE.Quaternion())),
      delta: new THREE.Quaternion(),
    }));
    for (const f of this.flames) {
      const id = f.comp.id, slot = f.comp.slot;
      const side = id.endsWith('L') ? 'Left' : id.endsWith('R') ? 'Right' : null;
      let p = null;
      if (slot === 'gauntlets' && side) {
        p = at(`${side}Hand`);
        if (p) p.y -= 0.06;   // palm
      } else if (slot === 'boots' && side) {
        const foot = at(`${side}Foot`), toe = at(`${side}ToeBase`);
        if (foot) { p = toe ? foot.clone().lerp(toe, 0.35) : foot; p.y = CONFIG.suitModel.feetY - 0.02; }
      } else if (slot === 'back') {
        // Base of the back pods: upper back, just behind the body
        const sp = at('Spine01');
        // with pods: the base of each pod; without (sheet A): the vent between the shoulder blades
        if (sp) p = sp.add(new THREE.Vector3(placed.pods.length ? Math.sign(f.basePos.x) * 0.11 : Math.sign(f.basePos.x) * 0.04, 0.02, placed.pods.length ? 0.17 : 0.13));   // (a single centre nozzle stays centred)
      }
      if (p) f.holder.position.copy(p);
      // ride on a bone so the flame follows the poses
      const boneName = slot === 'gauntlets' && side ? `${side}Hand` : slot === 'boots' && side ? `${side}Foot` : slot === 'back' ? 'Spine01' : null;
      const bone = boneName && placed.bones[boneName];
      if (p && bone) { f.bone = bone; f.boneLocal = bone.worldToLocal(this.root.localToWorld(p.clone())); }
      // Back flames ride on the pods' nozzles (left flame: left pod; a single centre nozzle: between them)
      if (slot === 'back' && this.pods.length) f.pods = f.basePos.x < 0 ? this.pods.filter((q) => q.side === 'L') : f.basePos.x > 0 ? this.pods.filter((q) => q.side === 'R') : this.pods;
    }
  }

  // Swing the back pods so their exhaust points where the thrust is going. Hover: the real
  // (gimballed) thrust direction. Flight: the push the suit needs right now (the thruster itself
  // is fixed there, so this is for show), within podMaxDeg.
  updatePods(game, dt) {
    const back = this.parts.find((p) => p.comp.slot === 'back')?.comp;
    if (!back || !this.pods?.length) return;
    const restDir = back.thruster.dir;
    const want = this._podWant ?? (this._podWant = new THREE.Vector3());
    if (game.controller.flying && game.controller.jet._ySlow) {
      want.copy(game.controller.jet._ySlow).applyQuaternion(this._qInv.copy(game.body.quat).invert());
    } else want.copy(back.thrustDir ?? restDir);
    const target = this._podQ.setFromUnitVectors(restDir, want.normalize());
    const maxA = THREE.MathUtils.degToRad(CONFIG.suitModel.podMaxDeg);
    const ang = 2 * Math.acos(Math.min(1, Math.abs(target.w)));
    if (ang > maxA) target.slerpQuaternions(this._qId, target, maxA / ang);
    const k = 1 - Math.exp(-CONFIG.suitModel.podRate * dt);
    for (const p of this.pods) {
      p.delta.slerp(target, k);
      // delta is in the suit's frame: carry it into the pod parent's frame
      p.pod.quaternion.copy(p.parentQ).invert().multiply(p.delta).multiply(p.parentQ).multiply(p.rest);
    }
  }

  // Effects that live in the world, not on the suit (made once)
  fx(renderer) {
    this.embers = new Embers(this.scene);
    this.smoke = new Smoke(this.scene);
    this.ring = new ShockRing(this.scene);
    this.haze = renderer.haze;
    this.canvas = renderer.renderer.domElement;
    this.boostK = 0;
  }

  addFlame(comp, pos) {
    const outer = new THREE.Mesh(flameGeo, flameMaterial(false));   // (hot core, shock diamonds, flicker: ThrusterFx)
    const inner = new THREE.Mesh(flameGeo, flameMaterial(true));
    const holder = new THREE.Group();
    holder.position.set(...pos);
    const basePos = new THREE.Vector3(...pos);
    holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), comp.thruster.dir);
    outer.material.userData.outlineParameters = inner.material.userData.outlineParameters = { visible: false };   // flames glow, no ink lines
    holder.add(outer, inner);
    this.root.add(holder);
    const ion = comp.part.visual.glow != null && CONFIG.suitStyle !== 'hero';
    if (ion) for (const m of [outer.material, inner.material]) { m.uniforms.mid.value.setHex(0x8fd8ff); m.uniforms.cool.value.setHex(0x3f8bff); }
    const t = CONFIG.art.trail;
    const trail = new ThrustTrail(this.scene, { core: ion ? t.ionCore : t.core, edge: ion ? t.ionEdge : t.edge, max: t.max });
    this.flames.push({ comp, holder, outer, inner, basePos, trail, seed: Math.random() * 100, core0: trail.mat.uniforms.core.value.clone(), edge0: trail.mat.uniforms.edge.value.clone() });
  }

  update(game, boost, time, camera) {
    const b = game.body;
    this.root.position.copy(b.pos);
    this.root.quaternion.copy(this.viewQuat ?? b.quat);   // (the Pose Studio can turn the suit to show a pose)
    const dt = Math.min(0.1, time - (this.lastTime ?? time));
    this.lastTime = time;
    // pose the skeleton, then move the flames onto their (posed) bones
    if (this.poser) {
      this.poser.update(game, boost, dt);
      this.root.updateMatrixWorld(true);
      for (const f of this.flames) {
        if (!f.bone) continue;
        f.holder.position.copy(this.root.worldToLocal(f.bone.localToWorld(this._tmpV.copy(f.boneLocal))));
      }
    }
    if (this.pods?.length) {
      this.updatePods(game, dt);
      // flames follow the pod nozzles
      this.root.updateMatrixWorld(true);
      const inv = this._inv.copy(this.root.matrixWorld).invert();
      for (const f of this.flames) {
        if (!f.pods) continue;
        const pos = this._tmpV.set(0, 0, 0);
        for (const q of f.pods) pos.add(q.nozzle.getWorldPosition(this._tmpV2).applyMatrix4(inv));
        f.holder.position.copy(pos.divideScalar(f.pods.length));
      }
    }

    const T = CONFIG.art.trail;
    const flying = game.controller.flying;
    const camPos = camera?.position;
    this.root.updateMatrixWorld(true);
    // mid-air burst into flight: the flames flare huge for a moment
    if ((game.airLaunchCount ?? 0) !== this.lastAir) { this.lastAir = game.airLaunchCount ?? 0; this.blastT = this.lastAir ? 0 : null; }
    let flare = 1;
    if (this.blastT != null) {
      const BL = CONFIG.launch.air.blast;
      this.blastT += dt;
      const sc = game.blastScale ?? 1;
      flare = 1 + (BL.flame - 1) * sc * Math.max(0, 1 - this.blastT / (BL.time * sc)) ** 2;
      if (this.blastT > BL.time * sc) this.blastT = null;
    }
    // braking hard into a hover: a shorter flare as the forward jets slam on
    if ((game.brakeCount ?? 0) !== this.lastBrake) { this.lastBrake = game.brakeCount ?? 0; this.brakeFxT = this.lastBrake ? 0 : null; }
    if (this.brakeFxT != null) {
      const F = CONFIG.assist.exitBrake.fx;
      this.brakeFxT += dt;
      flare = Math.max(flare, 1 + (F.flame - 1) * Math.max(0, 1 - this.brakeFxT / F.time) ** 2);
      if (this.brakeFxT > F.time) this.brakeFxT = null;
    }
    // boost transformation: flames stretch and go blue-white; kicking it in goes off with a bang
    const TH = CONFIG.art.thrusters;
    const boostOn = flying && !!game.lastInput?.boost && !this.hideFlames;
    if (boostOn && !this.boostWas && this.ring) {
      this.bangT = 0;
      const back = this._tmpV.set(0, -0.6, 0.35).applyQuaternion(b.quat).add(b.pos);
      const exhaust = this._tmpV2.copy(b.vel).normalize().negate();
      if (exhaust.lengthSq() < 0.5) exhaust.set(0, -1, 0).applyQuaternion(b.quat);
      this.ring.fire(back, exhaust);
      if (TH.embers.enabled) this.embers.burst(back, 45, 12, 1);
    }
    this.boostWas = boostOn;
    this.boostK = (this.boostK ?? 0) + ((boostOn ? 1 : 0) - (this.boostK ?? 0)) * Math.min(1, dt * (boostOn ? 8 : 3));
    const bk = this.boostK;
    if (this.bangT != null) {
      this.bangT += dt;
      flare = Math.max(flare, 1 + 0.9 * Math.max(0, 1 - this.bangT / 0.35) ** 2);
      if (this.bangT > 0.35) this.bangT = null;
    }
    const vh = this.canvas?.height ?? innerHeight;
    let hz = 0;
    for (const f of this.flames) {
      const u = f.comp.throttle;
      // (the back thrusters only show in flight; in a hover the hands and boots carry the look)
      const on = u > 0.02 && f.comp.available > 0 && !this.hideFlames && (flying || f.comp.slot !== 'back');
      f.holder.visible = on;
      if (on) {
        // Nozzles swivel: point the flame along the real thrust direction
        if (f.comp.thrustDir) f.holder.quaternion.setFromUnitVectors(UP, f.comp.thrustDir);
        // a living flicker (smooth, not random jitter)
        const flicker = 1 + TH.flicker * (0.6 * Math.sin(time * 31 + f.seed) + 0.4 * Math.sin(time * 57 + f.seed * 2.1));
        const len = (0.15 + u * (boost ? 1.1 : 0.7)) * flicker * T.flameScale * flare * (1 + TH.boostLength * bk);
        const w = (0.6 + u * 0.6) * (1 + (flare - 1) * 0.3) * (1 + 0.15 * bk);
        f.outer.scale.set(w, len, w);
        f.inner.scale.set(w * 0.5, len * 0.6, w * 0.5);
        for (const m of [f.outer.material, f.inner.material]) {
          m.uniforms.time.value = time; m.uniforms.boost.value = bk;
          m.uniforms.intensity.value = Math.min(1.2, 0.5 + u * 0.7) * (1 + (flare - 1) * 0.3) * (1 - 0.3 * bk);
        }
        f.inner.material.uniforms.diamonds.value = TH.diamonds * (0.35 + 0.65 * Math.min(1, u * 1.5)) * (1 + 0.8 * bk);
        // trails go blue-white with the flames
        f.trail.mat.uniforms.core.value.copy(f.core0).lerp(_bc.setHex(TH.trailBoostCore), bk);
        f.trail.mat.uniforms.edge.value.copy(f.edge0).lerp(_bc.setHex(TH.trailBoostEdge), bk);
        // embers, smoke and heat haze from this nozzle
        if (this.embers && dt > 0) {
          const nozzle = f.holder.getWorldPosition(_np);
          const ex = _nd.copy(f.comp.thrustDir ?? f.comp.thruster.dir).applyQuaternion(b.quat).negate();   // (exhaust: the way the flame points)
          const E = TH.embers;
          if (E.enabled) this.embers.emit(f, nozzle, ex, _nv.copy(b.vel).multiplyScalar(0.8), (flying ? E.rate : E.hoverRate) * u * (1 + E.boostRate * bk), dt, bk);
          const S = TH.smoke, room = game.caps?.room ?? 99;
          if (!flying && room < S.washRange && f.comp.slot !== 'back') {
            // the jets washing over the ground: smoke rolling out along it
            const gy = b.pos.y - CONFIG.pilot.feetHeight - room;
            const a = Math.random() * Math.PI * 2, sp = S.washSpeed * (0.6 + Math.random() * 0.8);
            this.smoke.emit(f, _np2.set(nozzle.x, gy + 0.15, nozzle.z), _nv.set(Math.cos(a) * sp, 0.3, Math.sin(a) * sp), S.washRate * u * (1 - room / S.washRange), dt);
          } else if (flying && f.comp.slot === 'back') {
            this.smoke.emit(f, nozzle, _nv.copy(ex).multiplyScalar(3).addScaledVector(b.vel, 0.85), S.flightRate * (0.5 + bk) * (1 - THREE.MathUtils.smoothstep(b.vel.length(), 12, 30)), dt, 0.7);   // (slow flight only: at speed it would just be a dotted line)
          }
          if (this.haze && camera && hz < 6) {
            const H = TH.haze;
            const a2 = _hp.copy(nozzle).project(camera), e2 = _he.copy(nozzle).addScaledVector(ex, H.length * (0.6 + u) * (1 + bk)).project(camera);
            if (a2.z < 1 && a2.z > -1) {
              this.haze.uniforms.src.value[hz].set(a2.x * 0.5 + 0.5, a2.y * 0.5 + 0.5, (e2.x - a2.x) * 0.5, (e2.y - a2.y) * 0.5);
              this.haze.uniforms.amt.value[hz] = H.strength * Math.min(1, u * 1.5) * (1 + 0.5 * bk);
              hz++;
            }
          }
        }
        // drop a streak point at the nozzle, drifting out along the exhaust
        if (dt > 0) {
          const pos = f.holder.getWorldPosition(this._tmpV);
          const vel = this._tmpV2.copy(f.comp.thrustDir ?? f.comp.thruster.dir).applyQuaternion(b.quat).multiplyScalar(-T.exhaustSpeed).addScaledVector(b.vel, T.carry);
          // (the streak is trimmed to at most maxLen m behind the nozzle, see ThrustTrail)
          const want = !flying ? T.hoverLength : boost ? T.boostLength : T.length;
          f.trail.maxLen = Number.isFinite(f.trail.maxLen) ? f.trail.maxLen + (want - f.trail.maxLen) * Math.min(1, dt * 6) : want;
          f.trail.emit(pos, vel, flying ? T.life : T.hoverLife, (boost ? T.boostWidth : T.width) * (0.7 + 0.5 * u), Math.min(1, 0.35 + u), dt);
        }
      }
      if (!on) f.trail.rest();
      if (camPos) f.trail.update(this.hideFlames ? 10 : dt, camPos, time);   // (cleared while posing)
    }
    if (this.haze) {
      for (let i = hz; i < 6; i++) this.haze.uniforms.amt.value[i] = 0;
      this.haze.uniforms.time.value = time;
    }
    if (this.embers) {
      this.embers.update(dt, camera, vh);
      this.smoke.update(dt, camera, vh);
      this.ring.update(dt);
    }

    // The 3D model is one piece: overall damage darkens it, the hottest part sets the glow
    if (this.model) {
      let dmg = 0, heat = 0, n = 0;
      for (const p of this.parts) { dmg += 1 - p.comp.hp / p.comp.maxHp; n++; heat = Math.max(heat, Math.min(1, p.comp.heat / 100)); }
      dmg /= Math.max(1, n);
      this.model.mats.forEach((m, i) => {
        m.color.copy(this.modelBase[i]).lerp(BURNT, dmg * 0.7);
        m.emissive.copy(this.modelEmissive[i]).lerp(HOT, heat * heat);
      });
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

