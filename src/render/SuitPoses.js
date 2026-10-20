import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// Code-driven poses for the 3D suit's skeleton, blended from what the suit is doing.
//
// A pose lists bones and either:
//   aim: [x, y, z]  the direction the bone should point (toward its child joint), or
//   rot: [x, y, z]  an extra turn in degrees about the suit's axes.
// Directions and axes are in the suit's own frame: +Y is up the body (head), -Z is the chest
// side (forward when hovering, the ground side in flight), +X is the suit's right.
// In flight the suit lies head-first, so "along the body toward the head" is +Y there too.
// Turn signs: rot X + tips a hanging limb forward / tilts the head back (look up);
// rot Z + swings a hanging limb toward the suit's right.

export const POSES = {
  // Standing on the ground: arms relaxed
  stand: {
    LeftArm: { aim: [-0.22, -0.97, 0.02] }, RightArm: { aim: [0.22, -0.97, 0.02] },
    LeftForeArm: { aim: [-0.18, -0.95, -0.22] }, RightForeArm: { aim: [0.18, -0.95, -0.22] },
  },
  // Hovering: arms a little out with the palms down (hand thrusters), knees soft, toes down
  hover: {
    LeftArm: { aim: [-0.45, -0.88, -0.1] }, RightArm: { aim: [0.45, -0.88, -0.1] },
    LeftForeArm: { aim: [-0.38, -0.78, -0.5] }, RightForeArm: { aim: [0.38, -0.78, -0.5] },
    LeftUpLeg: { aim: [-0.13, -1, -0.06] }, RightUpLeg: { aim: [0.11, -1, -0.02] },
    LeftLeg: { aim: [-0.1, -1, 0.2] }, RightLeg: { aim: [0.1, -1, 0.14] },
    LeftFoot: { rot: [-22, 0, 0] }, RightFoot: { rot: [-18, 0, 0] },
  },
  // Superman flight: right fist forward, left arm back along the body, one knee bent,
  // head up to look where you're going
  flight: {
    Spine01: { rot: [8, 0, 0] },
    neck: { rot: [18, 0, 0] }, Head: { rot: [26, 0, 0] },
    RightArm: { aim: [-0.06, 0.96, -0.26] }, RightForeArm: { aim: [-0.02, 1, -0.12] },
    LeftArm: { aim: [-0.3, -0.93, 0.18] }, LeftForeArm: { aim: [-0.18, -0.95, 0.25] },
    LeftUpLeg: { aim: [-0.1, -1, 0.1] }, RightUpLeg: { aim: [0.12, -1, 0.04] },
    LeftLeg: { aim: [-0.08, -0.82, 0.55] }, RightLeg: { aim: [0.1, -1, 0.12] },
    LeftFoot: { rot: [-35, 0, 0] }, RightFoot: { rot: [-40, 0, 0] },
  },
  // Boost: tucked like a missile, both arms back, legs together, toes pointed
  boost: {
    Spine01: { rot: [4, 0, 0] },
    neck: { rot: [20, 0, 0] }, Head: { rot: [28, 0, 0] },
    LeftArm: { aim: [-0.22, -0.95, 0.2] }, RightArm: { aim: [0.22, -0.95, 0.2] },
    LeftForeArm: { aim: [-0.12, -0.97, 0.22] }, RightForeArm: { aim: [0.12, -0.97, 0.22] },
    LeftUpLeg: { aim: [-0.05, -1, 0.06] }, RightUpLeg: { aim: [0.05, -1, 0.06] },
    LeftLeg: { aim: [-0.04, -1, 0.1] }, RightLeg: { aim: [0.04, -1, 0.1] },
    LeftFoot: { rot: [-45, 0, 0] }, RightFoot: { rot: [-45, 0, 0] },
  },
};

const STATES = Object.keys(POSES);
const D2R = Math.PI / 180;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class SuitPoser {
  // model: the placed glTF scene; suitRoot: the object that carries the suit's frame
  constructor(model, bones, suitRoot) {
    this.model = model;
    this.baseY = model.position.y;
    suitRoot.updateMatrixWorld(true);
    const rootInv = suitRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
    const rootM = new THREE.Matrix4().copy(suitRoot.matrixWorld).invert();
    const inRoot = (o) => rootInv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
    // Bones in parent-first order, with their rest orientation and direction in the suit's frame
    this.list = [];
    this.byName = {};
    model.traverse((o) => {
      if (!o.isBone) return;
      const child = o.children.find((c) => c.isBone);
      const p = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootM);
      const dir = child ? child.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootM).sub(p) : null;
      const b = {
        bone: o, name: o.name, rest: inRoot(o), restLocal: o.quaternion.clone(),
        parentRest: inRoot(o.parent), dir: dir ? dir.clone().normalize() : null, len: dir ? dir.length() : 0,
        parent: null, cur: new THREE.Quaternion(),
        aim: new THREE.Vector3(), rot: new THREE.Vector3(), hasAim: false,
      };
      b.parent = this.byName[o.parent.name] ?? null;
      this.byName[o.name] = b;
      this.list.push(b);
    });
    this.w = Object.fromEntries(STATES.map((s) => [s, s === 'stand' ? 1 : 0]));
    this.crouch = 0;      // landing crouch, 0..1
    this.walkPhase = 0;
    this.lean = new THREE.Vector2();    // smoothed hover movement (right, forward) m/s
    this.side = 0;                      // smoothed sideways push in flight, m/s²
    this.lastVel = new THREE.Vector3();
    this.wasGrounded = true;
    this.lastVy = 0;
    this.primed = false;
    this.out = { bones: this.byName };
  }

  // Which pose the suit wants right now, and the extra motion on top
  update(game, boost, dt) {
    if (dt <= 0) return;
    const P = CONFIG.pose;
    const c = game.controller, body = game.body;
    // on the ground: touching it, or floating just above it (the hover assist holds you a little off it)
    const flying = c.flying, grounded = !flying && (game.grounded || (game.caps?.room ?? Infinity) < P.groundRoom);
    const want = { stand: grounded && !flying ? 1 : 0, hover: !grounded && !flying ? 1 : 0, flight: flying && !boost ? 1 : 0, boost: flying && boost ? 1 : 0 };
    const k = 1 - Math.exp(-P.blendRate * dt);
    for (const s of STATES) this.w[s] += (want[s] - this.w[s]) * k;

    if (!this.primed) { this.lastVel.copy(game.body.vel); this.primed = true; }
    // velocity and push in the suit's frame
    const qInv = _q.copy(body.quat).invert();
    const vL = _v.copy(body.vel).applyQuaternion(qInv);
    const acc = _v2.copy(body.vel).sub(this.lastVel).multiplyScalar(1 / dt).applyQuaternion(qInv);
    this.lastVel.copy(body.vel);
    const kl = 1 - Math.exp(-P.leanRate * dt);
    this.lean.x += (vL.x - this.lean.x) * kl;
    this.lean.y += (-vL.z - this.lean.y) * kl;
    this.side += (THREE.MathUtils.clamp(acc.x, -80, 80) - this.side) * (1 - Math.exp(-P.turnRate * dt));

    // landing: crouch by how hard you came down, then stand back up
    if (grounded && !this.wasGrounded) this.crouch = Math.min(1, Math.max(this.crouch, -this.lastVy / P.landSpeedFull));
    this.wasGrounded = grounded;
    this.lastVy = body.vel.y;
    this.crouch = Math.max(0, this.crouch - dt / P.landTime);

    // walking: swing legs with distance covered
    const groundSpeed = grounded ? Math.hypot(body.vel.x, body.vel.z) : 0;
    this.walkPhase += groundSpeed * dt * P.stepsPerMeter * Math.PI;
    this.walk = Math.min(1, groundSpeed / 2) * this.w.stand;

    this.apply();
  }

  apply() {
    const P = CONFIG.pose, w = this.w;
    // 1. blend the pose targets
    for (const b of this.list) {
      b.aim.set(0, 0, 0); b.rot.set(0, 0, 0); b.hasAim = false;
      let restW = 0;
      for (const s of STATES) {
        if (w[s] < 1e-3) continue;
        const p = POSES[s][b.name];
        if (p?.aim && b.dir) { b.aim.addScaledVector(_v.fromArray(p.aim).normalize(), w[s]); b.hasAim = true; }
        else if (b.dir) restW += w[s];
        if (p?.rot) b.rot.x += p.rot[0] * w[s], b.rot.y += p.rot[1] * w[s], b.rot.z += p.rot[2] * w[s];
      }
      if (b.hasAim && restW > 0) b.aim.addScaledVector(b.dir, restW);   // poses that leave it at rest
    }
    // 2. motion on top
    const R = this.byName;
    const add = (n, x, y, z) => { const b = R[n]; if (b) { b.rot.x += x; b.rot.y += y; b.rot.z += z; } };
    // hover: the body tilts into the way you're moving and the legs trail
    const hv = w.hover + w.stand * 0.3;
    const fwd = THREE.MathUtils.clamp(this.lean.y * P.leanPerMs, -P.leanMax, P.leanMax) * hv;
    const rt = THREE.MathUtils.clamp(this.lean.x * P.leanPerMs, -P.leanMax, P.leanMax) * hv;
    add('Spine02', -fwd * 0.6, 0, -rt * 0.6);
    for (const n of ['LeftUpLeg', 'RightUpLeg']) add(n, -fwd * 1.1, 0, -rt * 1.1);
    for (const n of ['LeftArm', 'RightArm']) add(n, -fwd * 0.5, 0, -rt * 0.4);
    // flight turns: legs swing out, the lead arm and head lean into the turn
    const fl = w.flight + w.boost;
    const turn = THREE.MathUtils.clamp(-this.side * P.turnPerMs2, -P.turnMax, P.turnMax) * fl;
    add('Spine02', 0, 0, turn * 0.35);
    add('RightArm', 0, 0, turn * 0.8);
    add('Head', 0, 0, turn * 0.5);
    add('LeftUpLeg', 0, 0, turn * 0.9); add('RightUpLeg', 0, 0, turn * 0.9);
    // walking
    if (this.walk > 0.01) {
      const s = Math.sin(this.walkPhase), a = P.walkSwing * this.walk;
      add('LeftUpLeg', s * a, 0, 0); add('RightUpLeg', -s * a, 0, 0);
      add('LeftLeg', -Math.max(0, -s) * a * 1.2, 0, 0); add('RightLeg', -Math.max(0, s) * a * 1.2, 0, 0);
      add('LeftArm', -s * a * 0.6, 0, 0); add('RightArm', s * a * 0.6, 0, 0);
    }
    // landing crouch (knees bend, body dips)
    const cr = this.crouch * this.crouch * (3 - 2 * this.crouch) * P.crouchDeg;
    if (cr > 0.01) {
      for (const sd of ['Left', 'Right']) { add(`${sd}UpLeg`, cr, 0, 0); add(`${sd}Leg`, -2 * cr, 0, 0); add(`${sd}Foot`, cr, 0, 0); }
      add('Spine02', -cr * 0.5, 0, 0);
    }
    const th = R.LeftUpLeg?.len ?? 0.45, sh = R.LeftLeg?.len ?? 0.45;
    this.model.position.y = this.baseY - (th + sh) * (1 - Math.cos(cr * D2R)) * 0.9;

    // 3. set each bone: carry the parent's motion, aim, then the extra turn
    for (const b of this.list) {
      const pCur = b.parent ? b.parent.cur : b.parentRest;
      // orientation it would have if it just followed its parent
      b.cur.copy(pCur).multiply(_q.copy(b.parentRest).invert()).multiply(b.rest);
      if (b.hasAim && b.aim.lengthSq() > 1e-6) {
        const now = _v.copy(b.dir).applyQuaternion(_q.copy(b.rest).invert()).applyQuaternion(b.cur);
        b.cur.premultiply(_q2.setFromUnitVectors(now.normalize(), _v2.copy(b.aim).normalize()));
      }
      if (b.rot.lengthSq() > 1e-4) b.cur.premultiply(_q2.setFromEuler(_e.set(b.rot.x * D2R, b.rot.y * D2R, b.rot.z * D2R)));
      // back into the bone's own (parent-relative) rotation
      b.bone.quaternion.copy(_q.copy(pCur).invert().multiply(b.cur));
    }
  }
}
