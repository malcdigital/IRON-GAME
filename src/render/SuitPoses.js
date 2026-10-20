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
//
// Hands: a pose can also set  hands: { Left: { curl, thumb }, Right: { curl, thumb } }
//   curl:  degrees each finger joint bends: + curls toward a fist, - opens the hand flat.
//          One number for all four fingers, or [index, middle, ring, pinky].
//   thumb: the same for the thumb.
// twist: degrees to turn a bone about its own length (e.g. roll a hand palm-down).
// Any single finger joint can be bent too, e.g.  RightHandIndex1: { bend: -30 }  (point).
// Finger bones: <Left|Right>Hand<Thumb|Index|Middle|Ring|Pinky><1|2|3>, 1 = the knuckle.

export const POSES = {
  // Standing on the ground: arms relaxed
  stand: {
    hands: { Left: { curl: 12, thumb: 5 }, Right: { curl: 12, thumb: 5 } },
    LeftArm: { aim: [-0.22, -0.97, 0.02] },
    RightArm: { aim: [0.22, -0.97, 0.02] },
    LeftForeArm: { aim: [-0.18, -0.95, -0.22] },
    RightForeArm: { aim: [0.18, -0.95, -0.22] },
  },
  // Hovering (set in the Pose Studio from the hover reference sheet)
  hover: {
    hands: { Left: { curl: -6, thumb: -8 }, Right: { curl: -7, thumb: -8 } },
    LeftArm: { aim: [-0.23, -0.97, 0.07] },
    RightArm: { aim: [0.25, -0.96, -0.14] },
    LeftForeArm: { aim: [-0.45, -0.89, 0.01], twist: 30 },     // forearm twists turn the palms (hand thrusters) to the ground
    RightForeArm: { aim: [0.43, -0.9, -0.03], twist: -40 },
    LeftHand: { aim: [-0.98, -0.1, -0.17], twist: -15 },
    RightHand: { aim: [0.82, -0.26, -0.52], twist: -10, rot: [3, 0, 0] },
    LeftUpLeg: { aim: [0.01, -0.99, -0.11] },
    RightUpLeg: { aim: [0.11, -0.99, 0.01] },
    LeftLeg: { aim: [-0.55, -0.81, 0.21] },
    RightLeg: { aim: [0.1, -1, 0.16] },
    LeftFoot: { rot: [0, 0, 0], aim: [-0.39, -0.73, -0.56] },
    RightFoot: { rot: [0, 0, 0], aim: [0.34, -0.91, -0.22] },
  },

  // Flight: head up to look where you're going, arms back along the body
  flight: {
    hands: { Right: { curl: -20, thumb: 30 }, Left: { curl: 8, thumb: 0 } },
    Spine01: { rot: [8, 0, 0] },
    neck: { rot: [18, 0, 0] },
    Head: { rot: [26, 0, 0] },
    RightArm: { aim: [0.47, -0.86, 0.18] },
    RightForeArm: { aim: [0.38, -0.89, 0.27] },
    LeftArm: { aim: [-0.3, -0.93, 0.18] },
    LeftForeArm: { aim: [-0.18, -0.95, 0.25] },
    LeftUpLeg: { aim: [-0.1, -1, 0.1] },
    RightUpLeg: { aim: [0.12, -1, 0.04] },
    LeftLeg: { aim: [-0.02, -0.97, 0.24] },
    RightLeg: { aim: [0.1, -1, 0.12] },
    LeftFoot: { rot: [-35, 0, 0] },
    RightFoot: { rot: [-40, 0, 0] },
    LeftHand: { aim: [0.2, -0.97, 0.12], rot: [2, 0, -78], twist: -19 },
    RightHand: { rot: [23, 0, 83], twist: 9 },
  },
  // Boost: tucked like a missile, both arms back, legs together, toes pointed
  boost: {
    hands: { Left: { curl: 38, thumb: 25 }, Right: { curl: 38, thumb: 25 } },
    Spine01: { rot: [4, 0, 0] },
    neck: { rot: [20, 0, 0] },
    Head: { rot: [28, 0, 0] },
    LeftArm: { aim: [-0.22, -0.95, 0.2] },
    RightArm: { aim: [0.22, -0.95, 0.2] },
    LeftForeArm: { aim: [-0.12, -0.97, 0.22] },
    RightForeArm: { aim: [0.12, -0.97, 0.22] },
    LeftUpLeg: { aim: [-0.05, -1, 0.06] },
    RightUpLeg: { aim: [0.05, -1, 0.06] },
    LeftLeg: { aim: [-0.04, -1, 0.1] },
    RightLeg: { aim: [0.04, -1, 0.1] },
    LeftFoot: { rot: [-45, 0, 0] },
    RightFoot: { rot: [-45, 0, 0] },
  },
  // Brace for impact (just before a crash): forearms crossed in front of the helmet, fists shut,
  // chin and back curled, knees pulled up
  brace: {
    hands: { Left: { curl: 70, thumb: 40 }, Right: { curl: 70, thumb: 40 } },
    Spine02: { rot: [-14, 0, 0] }, Spine01: { rot: [-12, 0, 0] },
    neck: { rot: [-15, 0, 0] }, Head: { rot: [-18, 0, 0] },
    LeftArm: { aim: [-0.3, 0.55, -0.78] }, RightArm: { aim: [0.3, 0.55, -0.78] },
    LeftForeArm: { aim: [0.75, 0.5, -0.43] }, RightForeArm: { aim: [-0.75, 0.42, -0.5] },
    LeftUpLeg: { aim: [-0.12, -0.55, -0.83] }, RightUpLeg: { aim: [0.12, -0.6, -0.79] },
    LeftLeg: { aim: [-0.08, -0.9, 0.42] }, RightLeg: { aim: [0.08, -0.85, 0.5] },
    LeftFoot: { rot: [-20, 0, 0] }, RightFoot: { rot: [-20, 0, 0] },
  },
  // Braking out of flight into a hover: hands thrust out in front (palms forward), knees up,
  // leaning back against the stop
  flare: {
    hands: { Left: { curl: -25, thumb: -10 }, Right: { curl: -25, thumb: -10 } },
    Spine02: { rot: [8, 0, 0] }, Spine01: { rot: [6, 0, 0] }, Head: { rot: [-10, 0, 0] },
    LeftArm: { aim: [-0.35, -0.15, -0.92] }, RightArm: { aim: [0.35, -0.15, -0.92] },
    LeftForeArm: { aim: [-0.25, 0.05, -0.97] }, RightForeArm: { aim: [0.25, 0.05, -0.97] },
    LeftHand: { aim: [-0.1, 0.65, -0.75] }, RightHand: { aim: [0.1, 0.65, -0.75] },
    LeftUpLeg: { aim: [-0.12, -0.4, -0.91] }, RightUpLeg: { aim: [0.12, -0.55, -0.83] },
    LeftLeg: { aim: [-0.06, -0.97, 0.22] }, RightLeg: { aim: [0.06, -0.95, 0.3] },
    LeftFoot: { rot: [-25, 0, 0] }, RightFoot: { rot: [-25, 0, 0] },
  },
  // Launch: a straight rocket, arms down at the sides with the palms thrusting back, toes pointed
  launch: {
    hands: { Left: { curl: -10, thumb: 0 }, Right: { curl: -10, thumb: 0 } },
    Head: { rot: [16, 0, 0] }, neck: { rot: [6, 0, 0] },
    LeftArm: { aim: [-0.14, -0.98, 0.14] }, RightArm: { aim: [0.14, -0.98, 0.14] },
    LeftForeArm: { aim: [-0.1, -0.98, 0.18] }, RightForeArm: { aim: [0.1, -0.98, 0.18] },
    LeftHand: { aim: [-0.05, -0.9, 0.42] }, RightHand: { aim: [0.05, -0.9, 0.42] },
    LeftUpLeg: { aim: [-0.04, -1, 0.03] }, RightUpLeg: { aim: [0.04, -1, 0.03] },
    LeftLeg: { aim: [-0.03, -1, 0.06] }, RightLeg: { aim: [0.03, -1, 0.06] },
    LeftFoot: { rot: [-45, 0, 0] }, RightFoot: { rot: [-45, 0, 0] },
  },
  // Coming round after a knockout: spread out like a skydiver to face the ground and steady the
  // fall, arms out and forward with the palms down (hand thrusters), legs spread, knees soft,
  // head up to see what's coming (the head shake is added on top)
  recover: {
    hands: { Left: { curl: -20, thumb: -10 }, Right: { curl: -20, thumb: -10 } },
    Spine02: { rot: [8, 0, 0] }, Spine01: { rot: [6, 0, 0] }, neck: { rot: [14, 0, 0] }, Head: { rot: [18, 0, 0] },
    LeftArm: { aim: [-0.85, 0.3, -0.3] }, RightArm: { aim: [0.85, 0.3, -0.3] },
    LeftForeArm: { aim: [-0.6, 0.62, -0.5] }, RightForeArm: { aim: [0.6, 0.62, -0.5] },
    LeftUpLeg: { aim: [-0.35, -0.93, 0.05] }, RightUpLeg: { aim: [0.35, -0.93, 0.05] },
    LeftLeg: { aim: [-0.3, -0.8, 0.52] }, RightLeg: { aim: [0.3, -0.8, 0.52] },
    LeftFoot: { rot: [-20, 0, 0] }, RightFoot: { rot: [-20, 0, 0] },
  },
};

export const STATES = Object.keys(POSES);

// How far each joint can really move (degrees), measured from the model's rest pose and relative
// to the body part it hangs from. flex = the main bend, side = the sideways swing, twist = roll
// about the bone's own length. Signs are for the suit's right side (left is mirrored):
//   arms/legs: flex + swings forward, side + swings outward;
//   elbow + bends the forearm up toward the shoulder; knee - folds the shin back;
//   fingers/wrist: flex + curls toward the palm (- bends back).
// Joints not listed move freely.
const LIMB = (flex, side, twist) => ({ flex, side, twist });
export const LIMITS = {
  Spine02: LIMB([-35, 25], [-25, 25], [-25, 25]), Spine01: LIMB([-30, 25], [-20, 20], [-25, 25]), Spine: LIMB([-25, 20], [-15, 15], [-20, 20]),
  neck: LIMB([-40, 45], [-30, 30], [-50, 50]), Head: LIMB([-35, 40], [-25, 25], [-40, 40]),
  Shoulder: LIMB([-15, 20], [-10, 25], [-10, 10]),
  Arm: LIMB([-60, 180], [-35, 180], [-80, 80]),       // shoulder: back 60, forward/up 180; across the body 35, out/up 180
  ForeArm: LIMB([-5, 150], [-8, 8], [-85, 85]),       // elbow: a hinge; the forearm twist (palm up / down) lives here
  Hand: LIMB([-75, 80], [-25, 35], [-15, 15]),        // wrist: bend back 75, curl 80, tilt side to side
  UpLeg: LIMB([-30, 120], [-25, 50], [-40, 40]),      // hip: back 30, forward 120; in 25, out 50
  Leg: LIMB([-150, 3], [-5, 5], [-10, 10]),           // knee: a hinge that only folds back
  Foot: LIMB([-50, 25], [-20, 20], [-15, 15]),        // ankle: toes down 50, up 25
  Finger1: LIMB([-25, 90], [-15, 15], [-5, 5]),       // knuckle: bends back a little, curls 90, spreads
  Finger2: LIMB([-5, 105], [-3, 3], [-3, 3]),         // middle joint: a hinge
  Finger3: LIMB([-10, 80], [-3, 3], [-3, 3]),         // end joint
  Thumb1: LIMB([-30, 60], [-40, 40], [-30, 30]),
  Thumb2: LIMB([-15, 70], [-8, 8], [-5, 5]),
  Thumb3: LIMB([-15, 80], [-5, 5], [-5, 5]),
};
function limitsFor(name) {
  const m = name.match(/^(Left|Right)?(?:Hand(Thumb|Index|Middle|Ring|Pinky)(\d))?(.*)$/);
  if (m[2]) return LIMITS[m[2] === 'Thumb' ? `Thumb${m[3]}` : `Finger${m[3]}`];
  return LIMITS[m[4]] ?? LIMITS[name];
}
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
// Knocked out: each of these hangs like a weighted pendulum (how loose it is, 0..1)
const LIMP = { LeftArm: 0.85, RightArm: 0.85, LeftForeArm: 0.9, RightForeArm: 0.9, LeftHand: 0.7, RightHand: 0.7,
  LeftUpLeg: 0.6, RightUpLeg: 0.6, LeftLeg: 0.75, RightLeg: 0.75, Head: 0.45, neck: 0.3, LeftFoot: 0.5, RightFoot: 0.5 };
const JOINT_SHARE = [1, 1.1, 0.8];   // how a hand's curl spreads over the knuckle, middle and end joints
const D2R = Math.PI / 180;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _lq1 = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _lq3 = new THREE.Quaternion(), _lq4 = new THREE.Quaternion(), _lq5 = new THREE.Quaternion(), _lv1 = new THREE.Vector3();

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
      // the joint a bone points at: hands at the middle knuckle, the head at its top, the spine at the neck
      const kids = o.children.filter((c) => c.isBone);
      const child = kids.find((c) => /HandMiddle1$|^head_end$|^neck$/.test(c.name)) ?? kids[0];
      const p = o.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootM);
      const dir = child ? child.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootM).sub(p) : null;
      const b = {
        bone: o, name: o.name, rest: inRoot(o), restLocal: o.quaternion.clone(),
        parentRest: inRoot(o.parent), dir: dir ? dir.clone().normalize() : null, len: dir ? dir.length() : 0,
        parent: null, cur: new THREE.Quaternion(),
        aim: new THREE.Vector3(), rot: new THREE.Vector3(), hasAim: false, bend: 0, hinge: null, twist: 0, child: child ?? null,
      };
      b.parent = this.byName[o.parent.name] ?? null;
      this.byName[o.name] = b;
      this.list.push(b);
    });
    // Finger hinges: each finger joint bends toward the palm side of its hand
    for (const side of ['Left', 'Right']) {
      const at = (n) => this.byName[n] && this.byName[n].bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(rootM);
      const wrist = at(`${side}Hand`), base = at(`${side}HandMiddle1`), tip = at(`${side}HandMiddle3`);
      if (!wrist || !base || !tip) continue;
      const along = base.clone().sub(wrist).normalize();
      const palm = tip.clone().sub(base); palm.addScaledVector(along, -palm.dot(along)).normalize();   // (the fingers rest half curled)
      for (const b of this.list) {
        if (!b.name.startsWith(`${side}Hand`) || !b.dir || b.name === `${side}Hand`) continue;
        b.hinge = new THREE.Vector3().crossVectors(b.dir, palm).normalize();
      }
    }
    // Joint limits: the axes each joint bends about, in the rest pose
    for (const b of this.list) {
      const lim = limitsFor(b.name);
      if (!lim || !b.dir) continue;
      const mirror = b.name.startsWith('Left') ? -1 : 1;
      let flexAxis;
      if (b.hinge) flexAxis = b.hinge.clone();
      else if (/Hand$/.test(b.name)) {
        // at rest the arms hang with the palms facing the thighs (inward)
        const palmSide = new THREE.Vector3(b.name.startsWith('Left') ? 1 : -1, 0, 0);
        flexAxis = new THREE.Vector3().crossVectors(b.dir, palmSide);
        b.palm = palmSide.clone().addScaledVector(b.dir, -palmSide.dot(b.dir)).normalize();   // the way the palm faces (thrusters fire out of it)
      } else flexAxis = new THREE.Vector3(1, 0, 0);
      flexAxis.addScaledVector(b.dir, -flexAxis.dot(b.dir)).normalize();
      if (flexAxis.lengthSq() < 0.5) continue;
      // side axis: swings the bone toward the suit's outside (mirrored on the left)
      const sideAxis = new THREE.Vector3().crossVectors(b.dir, flexAxis).normalize();
      const out = _v.copy(b.dir).applyAxisAngle(sideAxis, 0.2);
      if ((out.x - b.dir.x) * mirror < 0 && !/Spine|neck|Head/.test(b.name)) sideAxis.negate();
      b.lim = { ...lim, flexAxis, sideAxis };
    }
    this.w = Object.fromEntries(STATES.map((s) => [s, s === 'stand' ? 1 : 0]));
    this.crouch = 0;      // landing crouch, 0..1
    this.walkPhase = 0;
    this.lean = new THREE.Vector2();    // smoothed hover movement (right, forward) m/s
    this.side = 0;                      // smoothed sideways push in flight, m/s²
    this.accH = new THREE.Vector2();    // smoothed push in hover (right, forward), m/s²
    this.yawRate = 0;                   // smoothed turning speed, rad/s
    this.vy = 0;                        // smoothed climb speed, m/s
    this.brace = 0;                     // brace-for-impact weight, 0..1
    this.mom = { flare: 0, launch: 0, crouch: 0, hop: 0, recover: 0, launchCount: null, launchClock: 9, hopClock: 9, recoverClock: 9 };
    this.limp = 0;                      // knocked-out looseness, 0..1
    this.geff = new THREE.Vector3(0, -9.8, 0);   // gravity as the suit feels it (minus its own acceleration), suit frame
    this.limbs = {};                    // knocked-out limb swing: { p: direction, v: velocity }
    this.flt = { pull: 0, lat: 0, roll: 0, rollAcc: 0, lastRoll: 0 };   // flight: g toward the back, sideways g, roll speed and its change
    this.lastVel = new THREE.Vector3();
    this.wasGrounded = true;
    this.lastVy = 0;
    this.primed = false;
    this.out = { bones: this.byName };
  }

  // Which pose the suit wants right now, and the extra motion on top
  update(game, boost, dt) {
    if (dt <= 0) return;
    if (this.preview) {   // Pose Studio: hold one pose, no movement on top
      for (const s of STATES) this.w[s] = s === this.preview ? 1 : 0;
      this.crouch = 0; this.walk = 0; this.lean.set(0, 0); this.side = 0;
      this.accH.set(0, 0); this.yawRate = 0; this.vy = 0;
      Object.assign(this.flt, { pull: 0, lat: 0, roll: 0, rollAcc: 0 });
      this.brace = 0; this.limp = 0;
      Object.assign(this.mom, { crouch: 0, hop: 0, recover: 0 });
      return this.apply();
    }
    const P = CONFIG.pose;
    const c = game.controller, body = game.body;
    // on the ground: touching it, or floating just above it (the hover assist holds you a little off it)
    const flying = c.flying, grounded = !flying && (game.grounded || (game.caps?.room ?? Infinity) < P.groundRoom);
    const want = { stand: grounded && !flying ? 1 : 0, hover: !grounded && !flying ? 1 : 0, flight: flying && !boost ? 1 : 0, boost: flying && boost ? 1 : 0 };
    // crashes: brace just before a hit; go limp while knocked out
    const C = CONFIG.crash;
    const braceWant = !game.stunT && game.impactIn < C.braceTime ? 1 : 0;
    this.brace += (braceWant - this.brace) * (1 - Math.exp(-(braceWant ? 18 : 4) * dt));
    const limpWant = game.stunT > 0 ? 1 : 0;
    this.limp += (limpWant - this.limp) * (1 - Math.exp(-(limpWant ? 20 : 2.5) * dt));
    // moments: braking into a hover, launching, coming round after a knockout
    const M = P.moments, mo = this.mom;
    // braking out of flight (the game's air brake runs for exitBrake.time)
    const brakeT = game.hoverBrakeT ?? 0, brakeAll = CONFIG.assist.exitBrake.time;
    const flareWant = brakeT > 0 && !flying ? Math.min(1, brakeT / (brakeAll * 0.35)) : 0;
    mo.flare += (flareWant - mo.flare) * (1 - Math.exp(-(flareWant > mo.flare ? 14 : 5) * dt));
    // launch: a quick crouch, then the rocket pose for the burst, easing into flight
    if (mo.launchCount === null) mo.launchCount = game.launchCount ?? 0;
    if ((game.launchCount ?? 0) !== mo.launchCount) { mo.launchCount = game.launchCount ?? 0; mo.launchClock = 0; }
    mo.launchClock += dt;
    const lt = mo.launchClock, lTime = CONFIG.launch.time;
    mo.launch = lt < lTime ? Math.min(1, lt / 0.08) * (lt > lTime - 0.5 ? (lTime - lt) / 0.5 : 1) : 0;
    mo.crouch = lt < M.launchCrouch ? Math.sin(Math.PI * lt / M.launchCrouch) : 0;
    // hopping off the ground into a hover: a small crouch and spring
    const nearGround = (game.caps?.room ?? 9) < 0.6;
    if (this.wasGroundedHop && !flying && body.vel.y > 1.2 && mo.hopClock > M.hopTime) mo.hopClock = 0;
    this.wasGroundedHop = nearGround && body.vel.y < 0.8;
    mo.hopClock += dt;
    mo.hop = mo.hopClock < M.hopTime ? Math.sin(Math.PI * mo.hopClock / M.hopTime) : 0;
    // knocked out → coming round
    if (this.wasStunned && !(game.stunT > 0)) mo.recoverClock = 0;
    this.wasStunned = game.stunT > 0;
    mo.recoverClock += dt;
    const rc = mo.recoverClock;
    // held while the suit rights itself in the air (game.rescue), then a short fade
    if (game.rescue) mo.recoverHold = 0; else mo.recoverHold = (mo.recoverHold ?? 9) + dt;
    const hold = game.rescue ? 1 : Math.max(0, 1 - mo.recoverHold / 0.6);
    mo.recover = Math.max(hold * Math.min(1, rc / 0.15), rc < M.recoverTime ? Math.min(1, rc / 0.2) * Math.min(1, (M.recoverTime - rc) / 0.5) : 0);
    const special = { brace: this.brace, flare: mo.flare, launch: mo.launch, recover: mo.recover };
    let sp = 0;
    for (const v of Object.values(special)) sp = Math.max(sp, v);
    for (const s of STATES) if (!(s in special)) want[s] *= 1 - sp;
    const k = 1 - Math.exp(-P.blendRate * dt);
    for (const s of STATES) {
      if (s in special) this.w[s] = special[s] * (sp > 0 ? special[s] / Math.max(1e-6, Object.values(special).reduce((a, b) => a + b, 0)) : 0);
      else this.w[s] += (want[s] - this.w[s]) * k;
    }

    if (!this.primed) { this.lastVel.copy(game.body.vel); this.primed = true; }
    this.dtLast = dt;
    // velocity and push in the suit's frame
    const qInv = _q.copy(body.quat).invert();
    const vL = _v.copy(body.vel).applyQuaternion(qInv);
    const acc = _v2.copy(body.vel).sub(this.lastVel).multiplyScalar(1 / dt).applyQuaternion(qInv);
    this.lastVel.copy(body.vel);
    // which way we're moving, in the suit's frame (the brake pushes the hands against it)
    if (vL.lengthSq() > 4) (this.vDir ??= new THREE.Vector3()).copy(vL).normalize();
    const kl = 1 - Math.exp(-P.leanRate * dt);
    this.lean.x += (vL.x - this.lean.x) * kl;
    this.lean.y += (-vL.z - this.lean.y) * kl;
    this.side += (THREE.MathUtils.clamp(acc.x, -80, 80) - this.side) * (1 - Math.exp(-P.turnRate * dt));
    const H = P.hover, kh = 1 - Math.exp(-H.react * dt);
    this.accH.x += (THREE.MathUtils.clamp(acc.x, -40, 40) - this.accH.x) * kh;
    this.accH.y += (THREE.MathUtils.clamp(-acc.z, -40, 40) - this.accH.y) * kh;
    this.yawRate += ((body.angVel?.y ?? 0) - this.yawRate) * kh;
    this.vy += (body.vel.y - this.vy) * kh;
    // gravity as the body feels it: real gravity minus its own acceleration (in free fall: nothing)
    const gw = _v3.set(0, -CONFIG.physics.gravity, 0).sub(_v.copy(body.vel).sub(this._prevVel ?? body.vel).multiplyScalar(1 / dt));
    this._prevVel = (this._prevVel ?? new THREE.Vector3()).copy(body.vel);
    this.geff.lerp(gw.applyQuaternion(qInv).clampLength(0, 120), 1 - Math.exp(-25 * dt));
    // flight: push in the suit's frame (+Z is its back) and how fast it's rolling about its length
    const FL = P.flight, kf = 1 - Math.exp(-FL.react * dt), ft = this.flt;
    const wL = _v3.set(0, 0, 0);
    if (body.angVel) wL.copy(body.angVel).applyQuaternion(qInv);
    ft.pull += (THREE.MathUtils.clamp(acc.z, -80, 80) - ft.pull) * kf;
    ft.lat += (THREE.MathUtils.clamp(acc.x, -80, 80) - ft.lat) * kf;
    const rollAccNow = (wL.y - ft.lastRoll) / dt; ft.lastRoll = wL.y;
    ft.roll += (wL.y - ft.roll) * kf;
    ft.rollAcc += (THREE.MathUtils.clamp(rollAccNow, -200, 200) - ft.rollAcc) * kf;

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
      b.aim.set(0, 0, 0); b.rot.set(0, 0, 0); b.hasAim = false; b.bend = 0; b.twist = 0;
      let restW = 0;
      for (const s of STATES) {
        if (w[s] < 1e-3) continue;
        const p = POSES[s][b.name];
        if (p?.aim && b.dir) { b.aim.addScaledVector(_v.fromArray(p.aim).normalize(), w[s]); b.hasAim = true; }
        else if (b.dir) restW += w[s];
        if (p?.rot) b.rot.x += p.rot[0] * w[s], b.rot.y += p.rot[1] * w[s], b.rot.z += p.rot[2] * w[s];
        if (p?.bend) b.bend += p.bend * w[s];
        if (p?.twist) b.twist += p.twist * w[s];
      }
      if (b.hasAim && restW > 0) b.aim.addScaledVector(b.dir, restW);   // poses that leave it at rest
    }
    const R = this.byName;
    if (this.limp > 0.01) this.applyLimp();
    // braking into a hover: hands push against the way you're going, knees come up toward it
    // (the body swings upright during the brake, so this follows the real direction of travel)
    if (w.flare > 0.01 && this.vDir) {
      const d = this.vDir, fw = w.flare;
      const steer = (name, dx, along, down) => {
        const b = R[name];
        if (!b?.dir) return;
        _v.set(dx, -down, 0).addScaledVector(d, along).normalize();
        if (!b.hasAim) { b.aim.copy(b.dir); b.hasAim = true; }
        b.aim.normalize().lerp(_v, fw).normalize();
      };
      steer('LeftArm', -0.35, 1, 0.15); steer('RightArm', 0.35, 1, 0.15);
      steer('LeftForeArm', -0.25, 1, 0); steer('RightForeArm', 0.25, 1, 0);
      steer('LeftUpLeg', -0.12, 0.9, 0.5); steer('RightUpLeg', 0.12, 0.75, 0.65);
    }
    // hands: curl each finger joint
    for (const s of STATES) {
      if (w[s] < 1e-3 || !POSES[s].hands) continue;
      for (const [side, h] of Object.entries(POSES[s].hands)) {
        FINGERS.forEach((f, i) => {
          const c = Array.isArray(h.curl) ? h.curl[i] : h.curl ?? 0;
          JOINT_SHARE.forEach((k, j) => { const b = R[`${side}Hand${f}${j + 1}`]; if (b) b.bend += c * k * w[s]; });
        });
        JOINT_SHARE.forEach((k, j) => { const b = R[`${side}HandThumb${j + 1}`]; if (b) b.bend += (h.thumb ?? 0) * k * w[s]; });
      }
    }
    // 2. motion on top
    const add = (n, x, y, z) => { const b = R[n]; if (b) { b.rot.x += x; b.rot.y += y; b.rot.z += z; } };
    // hover: body language from the physics, a little exaggerated (CONFIG.pose.hover)
    const H = P.hover, hv = (w.hover + w.stand * 0.3) * H.amount;
    const clampD = (v, m) => THREE.MathUtils.clamp(v, -m, m);
    // tilt into where you're going (speed) with an extra lurch when you speed up or brake (push)
    const fwd = clampD(this.lean.y * P.leanPerMs + this.accH.y * H.pushPerMs2, H.tiltMax) * hv;
    const rt = clampD(this.lean.x * P.leanPerMs + this.accH.x * H.pushPerMs2, H.tiltMax) * hv;
    // sideways (matches art/strafe_ref.png): the thrusters carry the upper body, so the chest and
    // head stay level while the hips and legs swing out behind as one straight piece (pendulum)
    const side = Math.abs(rt);
    add('Hips', 0, 0, -rt * H.sideHips);                                    // pelvis and legs swing
    add('Spine02', -fwd * 0.5, 0, rt * H.sideHips * 0.6); add('Spine01', -fwd * 0.3, 0, rt * H.sideHips * 0.4);   // chest back to level
    add('Head', fwd * 0.45, 0, 0);
    for (const n of ['LeftUpLeg', 'RightUpLeg']) add(n, -fwd * H.legTrail, 0, -rt * H.sideTrail);   // legs together
    for (const n of ['LeftLeg', 'RightLeg']) add(n, side * H.sideStraight, 0, 0);                  // knees straighten (the joint limit stops them at straight)
    for (const n of ['LeftFoot', 'RightFoot']) add(n, -side * 0.4, 0, 0);                         // toes point
    for (const n of ['LeftLeg', 'RightLeg']) add(n, -Math.abs(fwd) * 0.5, 0, 0);                 // knees fold as they swing back
    for (const n of ['LeftArm', 'RightArm']) add(n, -fwd * H.armSweep, 0, 0);   // arms sweep back (sideways they stay evenly spread)
    // turning: the chest leads into the turn, the hips and legs lag behind
    const yaw = clampD(this.yawRate * H.twistPerRads, H.twistMax) * hv;
    add('Spine01', 0, yaw * 0.6, 0); add('Head', 0, yaw * 0.5, 0);
    add('LeftUpLeg', 0, -yaw * 0.5, 0); add('RightUpLeg', 0, -yaw * 0.5, 0);
    // climbing: arms press down to the sides, toes point; dropping: arms lift out, knees tuck
    const up = THREE.MathUtils.clamp(this.vy / H.climbFull, -1, 1) * hv;
    const climb = Math.max(0, up), drop = Math.max(0, -up);
    add('LeftArm', 0, 0, climb * 14 - drop * 28); add('RightArm', 0, 0, -climb * 14 + drop * 28);
    add('LeftFoot', -climb * 18 + drop * 15, 0, 0); add('RightFoot', -climb * 18 + drop * 15, 0, 0);
    add('LeftUpLeg', drop * 22, 0, 0); add('RightUpLeg', drop * 16, 0, 0);
    add('LeftLeg', -drop * 38, 0, 0); add('RightLeg', -drop * 30, 0, 0);
    // launch and hop: crouch then spring (knees fold, arms swing back, then everything extends)
    const mo = this.mom, sq = Math.max(mo.crouch, mo.hop * 0.7);
    if (sq > 0.01) {
      for (const sd of ['Left', 'Right']) { add(`${sd}UpLeg`, 40 * sq, 0, 0); add(`${sd}Leg`, -70 * sq, 0, 0); add(`${sd}Foot`, 25 * sq, 0, 0); add(`${sd}Arm`, -30 * sq, 0, 0); }
      add('Spine02', -18 * sq, 0, 0); add('Head', 10 * sq, 0, 0);
    }
    // coming round: a couple of quick head shakes, dying away
    if (mo.recover > 0.01) {
      const rc = mo.recoverClock, shake = Math.sin(rc * 22) * Math.exp(-rc * 2.2) * P.moments.shakeDeg * mo.recover;
      add('neck', 0, shake * 0.6, shake * 0.15); add('Head', 0, shake, -shake * 0.2);
    }
    // FLIGHT body language, from the physics (CONFIG.pose.flight). The suit flies head first, back up.
    const F = P.flight, fl = (w.flight + w.boost) * F.amount;
    if (fl > 0.01) {
      // Turning: the suit banks, then pulls round with its back toward the inside of the turn.
      // That pull (g toward the back) leaves the legs and arms lagging toward the chest side;
      // the back arches and the head lifts to look round the turn.
      const pull = THREE.MathUtils.clamp(this.flt.pull / F.pullFull, -1, 1) * fl;
      const pu = Math.max(0, pull), pd = Math.max(0, -pull);
      add('Spine02', 6 * pull, 0, 0); add('Spine01', 10 * pull, 0, 0); add('Head', 12 * pu - 6 * pd, 0, 0);
      add('LeftUpLeg', 30 * pull, 0, 0); add('RightUpLeg', 24 * pull, 0, 0);             // legs lag toward the chest side
      add('LeftLeg', -28 * pu, 0, 0); add('RightLeg', -18 * pu, 0, 0);                     // knees give under the g
      add('LeftArm', 14 * pull, 0, -22 * pu); add('RightArm', 14 * pull, 0, 22 * pu);     // arms open out like wings
      // Sideways push: legs swing to the outside, the head and chest lean in
      const lat = THREE.MathUtils.clamp(this.flt.lat / F.latFull, -1, 1) * fl;
      add('LeftUpLeg', 0, 0, -18 * lat); add('RightUpLeg', 0, 0, -18 * lat);
      add('Spine01', 0, 0, -8 * lat); add('Head', 0, 0, -10 * lat);
      // Barrel rolls: an arm flings out to thrust the suit into the spin (and the other arm to stop it);
      // mid-spin everything tucks in tight, like a skater spinning faster
      const spin = Math.min(1, Math.abs(this.flt.roll) / F.rollFull) * fl;
      const kick = THREE.MathUtils.clamp(this.flt.rollAcc / F.rollAccFull, -1, 1) * fl;
      const kr = Math.max(0, kick), kl = Math.max(0, -kick);
      add('LeftArm', 0, 0, 26 * spin * (1 - kl) - 70 * kl); add('RightArm', 0, 0, -26 * spin * (1 - kr) + 70 * kr);
      add('LeftForeArm', 0, 0, -20 * kl); add('RightForeArm', 0, 0, 20 * kr);
      add('LeftUpLeg', 0, 0, 6 * spin); add('RightUpLeg', 0, 0, -6 * spin);               // legs squeeze together
      for (const n of ['LeftLeg', 'RightLeg']) add(n, 8 * spin, 0, 0);                     // and straighten
      add('Head', -8 * spin, 0, 0);                                                          // chin tucks
      // the thrusting hand opens (palm out), the others close up
      this.handCurl('Right', -40 * kr + 25 * spin * (1 - kr));
      this.handCurl('Left', -40 * kl + 25 * spin * (1 - kl));
    }
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
      if (Math.abs(b.twist) > 0.01 && b.dir) {
        const along = _v.copy(b.dir).applyQuaternion(_q.copy(b.rest).invert()).applyQuaternion(b.cur);
        b.cur.premultiply(_q2.setFromAxisAngle(along.normalize(), b.twist * D2R));
      }
      if (b.hinge && Math.abs(b.bend) > 0.01) {
        // the hinge moves with the hand: carry it from rest to now
        const hinge = _v.copy(b.hinge).applyQuaternion(_q.copy(b.rest).invert()).applyQuaternion(b.cur);
        b.cur.premultiply(_q2.setFromAxisAngle(hinge.normalize(), b.bend * D2R));
      }
      if (b.lim && CONFIG.pose.limits) this.limit(b, pCur);
      // back into the bone's own (parent-relative) rotation
      b.bone.quaternion.copy(_q.copy(pCur).invert().multiply(b.cur));
    }
  }

  // Keep a bone within its joint's real range. Its turn beyond just following its parent is split
  // into a swing (where it points) and a twist (roll about its length); each part is clamped.
  limit(b, pCur) {
    const L = b.lim;
    const P = _lq1.copy(pCur).multiply(_lq2.copy(b.parentRest).invert());           // the parent's move from rest
    const Qr = _lq3.copy(P).invert().multiply(b.cur).multiply(_lq2.copy(b.rest).invert());   // this joint's turn, in rest terms
    // twist about the rest direction, and the swing that's left
    const r = b.dir;
    const d = r.x * Qr.x + r.y * Qr.y + r.z * Qr.z;
    const tw = _lq4.set(r.x * d, r.y * d, r.z * d, Qr.w);
    if (tw.lengthSq() < 1e-10) tw.identity(); else tw.normalize();
    const sw = _lq5.copy(Qr).multiply(_lq2.copy(tw).invert());
    // swing as a turn vector, clamped on the flex and side axes
    if (sw.w < 0) { sw.x = -sw.x; sw.y = -sw.y; sw.z = -sw.z; sw.w = -sw.w; }
    const sAng = 2 * Math.acos(Math.min(1, sw.w)), sn = Math.sqrt(Math.max(1e-12, 1 - sw.w * sw.w));
    const rv = _lv1.set(sw.x / sn, sw.y / sn, sw.z / sn).multiplyScalar(sAng);
    const f = THREE.MathUtils.clamp(rv.dot(L.flexAxis) / D2R, L.flex[0], L.flex[1]) * D2R;
    const sd = THREE.MathUtils.clamp(rv.dot(L.sideAxis) / D2R, L.side[0], L.side[1]) * D2R;
    rv.copy(L.flexAxis).multiplyScalar(f).addScaledVector(L.sideAxis, sd);
    const ang = rv.length();
    if (ang > 1e-6) sw.setFromAxisAngle(rv.multiplyScalar(1 / ang), ang); else sw.identity();
    let tAng = 2 * Math.atan2(tw.x * r.x + tw.y * r.y + tw.z * r.z, tw.w);
    if (tAng > Math.PI) tAng -= 2 * Math.PI; if (tAng < -Math.PI) tAng += 2 * Math.PI;
    tAng = THREE.MathUtils.clamp(tAng / D2R, L.twist[0], L.twist[1]) * D2R;
    tw.setFromAxisAngle(r, tAng);
    b.cur.copy(P).multiply(sw.multiply(tw)).multiply(b.rest);
  }

  // Which way a hand's palm faces right now, in the suit's frame
  palmDir(side, out = new THREE.Vector3()) {
    const b = this.byName[`${side}Hand`];
    if (!b?.palm) return null;
    return out.copy(b.palm).applyQuaternion(_q.copy(b.rest).invert()).applyQuaternion(b.cur);
  }

  // Extra finger curl on one hand (+ fist, - open), on top of the pose
  handCurl(side, deg) {
    if (Math.abs(deg) < 0.1) return;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) JOINT_SHARE.forEach((k, j) => { const b = this.byName[`${side}Hand${f}${j + 1}`]; if (b) b.bend += deg * k; });
    JOINT_SHARE.forEach((k, j) => { const b = this.byName[`${side}HandThumb${j + 1}`]; if (b) b.bend += deg * 0.5 * k; });
  }

  // Knocked out: limbs hang and swing like weighted pendulums. Each one is pulled toward the
  // way gravity feels to the body (so in free fall they float, and a bounce flings them), with
  // springy, under-damped motion so they flop and overshoot. The joint limits keep it human.
  applyLimp() {
    const dt = Math.min(0.05, this.dtLast ?? 0.016), L = this.limp;
    const g = this.geff, gl = g.length();
    for (const [name, loose] of Object.entries(LIMP)) {
      const b = this.byName[name];
      if (!b?.dir) continue;
      const st = (this.limbs[name] ??= { p: (b.hasAim ? b.aim.clone() : b.dir.clone()).normalize(), v: new THREE.Vector3() });
      const posed = _v.copy(b.hasAim ? b.aim : b.dir).normalize();
      // target: hang along felt gravity (if there's any to speak of), else drift where it is
      const target = gl > 2 ? _v2.copy(g).multiplyScalar(1 / gl).lerp(posed, 1 - loose).normalize() : _v2.copy(st.p);
      if (L < 0.05) { st.p.copy(posed); st.v.set(0, 0, 0); continue; }
      st.v.addScaledVector(_v3.subVectors(target, st.p), 70 * dt).multiplyScalar(Math.exp(-5 * dt));
      st.p.addScaledVector(st.v, dt).normalize();
      b.aim.copy(posed).lerp(st.p, L).normalize();
      b.hasAim = true;
      b.rot.multiplyScalar(1 - L);
    }
    this.handCurl('Left', 20 * L); this.handCurl('Right', 20 * L);
  }
}
