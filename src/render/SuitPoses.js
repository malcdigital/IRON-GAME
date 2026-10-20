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
  // Launch (matches art/takeoff_ref.mp4): straight and upright as the jets lift you, arms down at
  // the sides a little out, palms to the ground firing straight down, legs together with a soft
  // knee, toes pointed, head level
  launch: {
    hands: { Left: { curl: -15, thumb: -5 }, Right: { curl: -15, thumb: -5 } },
    LeftArm: { aim: [-0.3, -0.95, 0.02] }, RightArm: { aim: [0.3, -0.95, 0.02] },
    LeftForeArm: { aim: [-0.34, -0.92, -0.12], twist: 30 }, RightForeArm: { aim: [0.34, -0.92, -0.12], twist: -40 },
    LeftHand: { aim: [-0.75, -0.6, -0.2], twist: -15 }, RightHand: { aim: [0.75, -0.6, -0.2], twist: -10 },
    LeftUpLeg: { aim: [-0.05, -1, -0.06] }, RightUpLeg: { aim: [0.05, -1, -0.02] },
    LeftLeg: { aim: [-0.04, -0.97, 0.22] }, RightLeg: { aim: [0.04, -0.98, 0.16] },
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
  // Launch wind-up (and the small hop off the ground): a deep crouch, tipped forward, arms swept
  // back behind the hips, head up looking ahead (from art/takeoff_ref.mp4). Feet stay under the hips.
  crouch: {
    Hips: { rot: [-35, 0, 0] },
    Spine02: { aim: [-0.01, 0.58, -0.81] }, Spine01: { aim: [-0.01, 0.5, -0.87] },
    Spine: { aim: [-0.01, 0.5, -0.87] }, neck: { aim: [-0.01, 0.55, -0.83] },
    Head: { aim: [-0.05, 0.88, -0.47] },
    LeftArm: { aim: [-0.45, -0.5, 0.74], rot: [-10, 0, 0] }, RightArm: { aim: [0.45, -0.5, 0.74], rot: [-10, 0, 0] },
    LeftForeArm: { aim: [-0.25, -0.72, 0.65], rot: [-10, 0, 0] }, RightForeArm: { aim: [0.25, -0.72, 0.65], rot: [-10, 0, 0] },
    LeftHand: { aim: [-0.2, -0.6, 0.77], rot: [149, 0, -7] }, RightHand: { aim: [0.2, -0.6, 0.77], rot: [149, 0, 7], twist: -32 },
    LeftUpLeg: { aim: [-0.17, -0.38, -0.91], rot: [6, 0, 0] }, RightUpLeg: { aim: [0.18, -0.38, -0.91], rot: [5, 0, 0] },
    LeftLeg: { aim: [-0.1, -0.88, 0.45] }, RightLeg: { aim: [0.1, -0.88, 0.45] },
    LeftFoot: { aim: [-0.12, -0.25, -0.96] }, RightFoot: { aim: [0.12, -0.25, -0.96] },
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

// The launch timeline. Before the thrusters fire (seqT = time since you pressed launch): crouch
// builds until jumpAt, then the legs drive straight while the body moves into the launch pose by
// fireAt. In the air (jumpAt 0) it's a quick tuck. After firing (sinceFire s): the launch pose holds
// for the burst and eases into flight over its last half second.
function launchCurve(seqT, jumpAt, fireAt, sinceFire) {
  if (seqT != null) {
    if (jumpAt <= 0) { const u = Math.min(1, seqT / Math.max(0.01, fireAt)); return { crouch: 0.5 * Math.sin(Math.PI * u), launch: u }; }
    if (seqT < jumpAt) { const u = seqT / jumpAt; return { crouch: u * u * (3 - 2 * u), launch: 0 }; }
    const push = Math.max(0.06, (fireAt - jumpAt) * 0.6);
    return { crouch: Math.max(0, 1 - (seqT - jumpAt) / push), launch: Math.min(1, (seqT - jumpAt) / Math.max(0.01, fireAt - jumpAt)) };
  }
  const lTime = CONFIG.launch.time, lt = sinceFire;
  return { crouch: 0, launch: lt < lTime ? Math.min(1, 0.6 + lt / 0.1) * (lt > lTime - 0.5 ? (lTime - lt) / 0.5 : 1) : 0 };
}
// Pose Studio only: roughly how high the suit is at time t of the launch (so you can see the jump)
function launchLift(t, q) {
  if (t < q.jumpAt) return 0;
  const v0 = q.jumpSpeed * Math.sin((q.jumpAngleDeg ?? 90) * Math.PI / 180);   // the upward part of the jump
  const tj = Math.min(t, q.fireAt) - q.jumpAt, hj = Math.max(0, v0 * tj - 4.9 * tj * tj);
  const tf = Math.max(0, t - q.fireAt), vj = v0 - 9.8 * (q.fireAt - q.jumpAt);
  return hj + vj * tf + 0.5 * 22 * tf * tf;
}

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
    this.suitRoot = suitRoot;
    this.restFootY = this.footY();
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
    this.t = 0;                         // running clock for breathing, glances and flutter
    this.legSpring = { Left: { x: 0, vx: 0, z: 0, vz: 0 }, Right: { x: 0, vx: 0, z: 0, vz: 0 } };   // legs swing on springs (settle with a wiggle)
    this.pitch = 0;                     // flight: how far the nose points up (+) or down (-), radians
    this.speed = 0;
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
    if (this.preview && this.previewLaunch != null) {
      // Pose Studio launch timeline: play the sequence at time previewLaunch (s)
      const q = CONFIG.launch.seq, t = this.previewLaunch;
      const lc = t < q.fireAt ? launchCurve(t, q.jumpAt, q.fireAt, 9) : launchCurve(null, 0, 0, t - q.fireAt);
      for (const s of STATES) this.w[s] = 0;
      const base = t < q.fireAt ? 'stand' : 'flight';
      const cw = lc.crouch;
      this.w.crouch = cw; this.w.launch = lc.launch * (1 - cw); this.w[base] = (1 - lc.launch) * (1 - cw);
      this.mom.crouch = lc.crouch; this.mom.hop = 0; this.mom.recover = 0;
      this.crouch = 0; this.walk = 0; this.lean.set(0, 0); this.side = 0; this.brace = 0; this.limp = 0;
      Object.assign(this.flt, { pull: 0, lat: 0, roll: 0, rollAcc: 0 });
      this.previewLift = Math.min(3, launchLift(t, q));   // (capped so it stays in view)
      return this.apply();
    }
    this.previewLift = 0;
    if (this.preview) {   // Pose Studio: hold one pose, no movement on top
      for (const s of STATES) this.w[s] = s === this.preview ? 1 : 0;
      this.crouch = 0; this.walk = 0; this.lean.set(0, 0); this.side = 0;
      this.accH.set(0, 0); this.yawRate = 0; this.vy = 0; this.upS = 0; this.upV = 0;
      Object.assign(this.flt, { pull: 0, lat: 0, roll: 0, rollAcc: 0 });
      this.brace = 0; this.limp = 0;
      Object.assign(this.mom, { crouch: this.preview === 'crouch' ? 1 : 0, hop: 0, recover: 0 });
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
    const seqNow = game.launchSeq;
    const lc = launchCurve(seqNow ? seqNow.t : null, seqNow ? seqNow.jumpAt : 0, seqNow ? seqNow.fireAt : 0, mo.launchClock);
    mo.launch = lc.launch; mo.crouch = lc.crouch;
    // From a hover in mid-air there's no ground launch: a quick tuck before firing, then the body
    // leans over into flight (the pose follows the body's real tip, see below)
    const airLaunch = seqNow ? !seqNow.ground : game.lastLaunchGround === false;
    mo.tuck = 0;
    if (airLaunch) {
      if (seqNow) mo.tuck = Math.sin(Math.PI * Math.min(1, seqNow.t / Math.max(0.01, seqNow.fireAt)));
      mo.launch = 0; mo.crouch = 0;
    }
    // lean into flight: 0 upright -> 1 head first (from the body's actual angle), for the first
    // couple of seconds after an air launch
    const headUp = Math.asin(THREE.MathUtils.clamp(_v3.set(0, 1, 0).applyQuaternion(body.quat).y, -1, 1)) * 180 / Math.PI;
    mo.lean = airLaunch && flying && mo.launchClock < M.leanWindow ? THREE.MathUtils.clamp((80 - headUp) / 65, 0, 1) : (airLaunch && flying ? 1 : 0);
    mo.leaning = airLaunch && flying && mo.launchClock < M.leanWindow;
    this.inBurst = !!game.burst;
    // boosted takeoff: the upright launch pose while the path climbs steeply, easing into flight as it levels
    if (game.burst) mo.launch = THREE.MathUtils.clamp((game.burst.pitch * 180 / Math.PI - 15) / 45, 0, 1);
    // hopping off the ground into a hover: a small crouch and spring
    const nearGround = (game.caps?.room ?? 9) < 0.6;
    if (this.wasGroundedHop && !flying && !game.launchSeq && body.vel.y > 1.2 && mo.hopClock > M.hopTime) mo.hopClock = 0;
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
    // charging up (L1 + R1 on the ground): sink into the crouch and hold it
    mo.charge = (mo.charge ?? 0) + ((game.charging ? 1 : 0) - (mo.charge ?? 0)) * (1 - Math.exp(-(game.charging ? 12 : 8) * dt));
    if (game.launchSeq) mo.charge = 0;   // (launching from the crouch: the launch timeline takes it from here)
    const special = { brace: this.brace, flare: mo.flare, launch: mo.launch * (1 - mo.crouch), recover: mo.recover, crouch: Math.max(mo.crouch, mo.hop * 0.7, mo.charge) };
    let sp = 0;
    for (const v of Object.values(special)) sp = Math.max(sp, v);
    for (const s of STATES) if (!(s in special)) want[s] *= 1 - sp;
    const k = 1 - Math.exp(-P.blendRate * dt);
    for (const s of STATES) {
      if (s in special) this.w[s] = special[s] * (sp > 0 ? special[s] / Math.max(1e-6, Object.values(special).reduce((a, b) => a + b, 0)) : 0);
      else this.w[s] += (want[s] - this.w[s]) * k;
    }
    // leaning into flight from a hover: hover -> flight follows the body's real tip
    if (mo.leaning) {
      const rest = 1 - sp;
      this.w.hover = (1 - mo.lean) * rest; this.w.flight = mo.lean * rest; this.w.boost = 0; this.w.stand = 0;
    }
    // never less than a whole pose (a blend that comes up short would sag toward the bare model)
    let total = 0;
    for (const s of STATES) total += this.w[s];
    if (total < 0.999) {
      let best = 'hover', bw = -1;
      for (const s of STATES) if (!(s in special) && want[s] > bw) { bw = want[s]; best = s; }
      this.w[best] += 1 - total;
    }

    if (!this.primed) { this.lastVel.copy(game.body.vel); this.primed = true; }
    this.dtLast = dt;
    this.t += dt;
    const headY = THREE.MathUtils.clamp(_v3.set(0, 1, 0).applyQuaternion(game.body.quat).y, -1, 1);
    this.pitch += (Math.asin(headY) - this.pitch) * (1 - Math.exp(-4 * dt));
    this.speed = game.body.vel.length();
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
    // climbing / dropping: aim for the vertical speed plus what you're asking for (the climb /
    // descend buttons), then ease there on a spring that settles without overshoot (smooth
    // between climbing, dropping and idle)
    const inp = game.lastInput ?? {}, intent = flying ? 0 : (inp.up ?? 0) - (inp.down ?? 0);
    const upWant = THREE.MathUtils.clamp(body.vel.y / H.climbFull + intent * H.intentShare, -1, 1);
    const om = H.vertSpring, ud = (this.upV ?? 0);
    const accU = om * om * (upWant - (this.upS ?? 0)) - 2 * om * ud;
    this.upV = ud + accU * dt;
    this.upS = THREE.MathUtils.clamp((this.upS ?? 0) + this.upV * dt, -1.2, 1.2);
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
    const legT = { Left: { x: -fwd * H.legTrail, z: -rt * H.sideTrail }, Right: { x: -fwd * H.legTrail, z: -rt * H.sideTrail } };   // legs together (sprung, below)
    for (const n of ['LeftLeg', 'RightLeg']) add(n, side * H.sideStraight, 0, 0);                  // knees straighten (the joint limit stops them at straight)
    for (const n of ['LeftFoot', 'RightFoot']) add(n, -side * 0.4, 0, 0);                         // toes point
    for (const n of ['LeftLeg', 'RightLeg']) add(n, -Math.abs(fwd) * 0.5, 0, 0);                 // knees fold as they swing back
    for (const n of ['LeftArm', 'RightArm']) add(n, -fwd * H.armSweep, 0, 0);   // arms sweep back behind (sideways they stay evenly spread)
    for (const n of ['LeftForeArm', 'RightForeArm']) add(n, -Math.max(0, fwd) * H.armSweep * 0.4, 0, 0);   // forearms trail too
    // turning: the chest leads into the turn, the hips and legs lag behind
    const yaw = clampD(this.yawRate * H.twistPerRads, H.twistMax) * hv;
    add('Spine01', 0, yaw * 0.6, 0); add('Head', 0, yaw * 0.5, 0);
    add('LeftUpLeg', 0, -yaw * 0.5, 0); add('RightUpLeg', 0, -yaw * 0.5, 0);
    // climbing: arms press down to the sides, toes point; dropping: arms lift out, knees tuck
    const up = THREE.MathUtils.clamp(this.upS ?? 0, -1, 1) * hv;
    const climb = Math.max(0, up), drop = Math.max(0, -up);
    add('LeftArm', 0, 0, climb * 14 - drop * 28); add('RightArm', 0, 0, -climb * 14 + drop * 28);
    add('LeftFoot', -climb * 18 + drop * 15, 0, 0); add('RightFoot', -climb * 18 + drop * 15, 0, 0);
    add('LeftUpLeg', drop * 22, 0, 0); add('RightUpLeg', drop * 16, 0, 0);
    add('LeftLeg', -drop * 38, 0, 0); add('RightLeg', -drop * 30, 0, 0);
    // coming round: a couple of quick head shakes, dying away
    const mo = this.mom;
    // mid-air launch: a quick tuck before firing (knees up, arms cock forward), then as the body
    // tips over, the arms sweep back along it, the legs straighten and trail, the head comes up
    if (mo.tuck > 0.01) {
      for (const sd of ['Left', 'Right']) { add(`${sd}UpLeg`, 28 * mo.tuck, 0, 0); add(`${sd}Leg`, -40 * mo.tuck, 0, 0); add(`${sd}Arm`, 22 * mo.tuck, 0, 0); }
      add('Spine02', -8 * mo.tuck, 0, 0);
    }
    if (mo.leaning) {
      const push = Math.sin(Math.PI * mo.lean) * P.moments.leanPush;
      for (const sd of ['Left', 'Right']) { add(`${sd}Arm`, -40 * push, 0, 0); add(`${sd}ForeArm`, -20 * push, 0, 0); add(`${sd}Leg`, 15 * push, 0, 0); add(`${sd}Foot`, -20 * push, 0, 0); }
      add('Head', 15 * push, 0, 0);
      this.handCurl('Left', -15 * push); this.handCurl('Right', -15 * push);
    }
    // charged up and tensed: a fine tremble through the body, with a slow sway on top
    if ((mo.charge ?? 0) > 0.01 && !this.preview) {
      const S = P.subtle, a = S.tremble * mo.charge, t = this.t;
      const n = (f, ph) => Math.sin(t * f + ph) * 0.6 + Math.sin(t * f * 1.73 + ph * 2.1) * 0.4;   // jittery, never repeating quite the same
      add('Spine02', a * n(31, 0.3) + a * 0.8 * Math.sin(t * 2.3), 0, a * n(27, 1.1));
      add('Spine01', a * n(37, 2.0), a * 0.6 * n(29, 0.7), 0);
      add('Head', a * 0.6 * n(23, 1.7), a * 0.8 * n(19, 0.2), 0);
      add('LeftArm', a * n(33, 0.9), 0, a * n(41, 1.4)); add('RightArm', a * n(35, 2.4), 0, a * n(39, 0.5));
      add('LeftUpLeg', a * 0.7 * n(29, 1.9), 0, a * 0.5 * n(43, 0.8)); add('RightUpLeg', a * 0.7 * n(31, 0.6), 0, a * 0.5 * n(37, 2.2));
      this.handCurl('Left', 10 * mo.charge + a * 2 * n(45, 0.1)); this.handCurl('Right', 10 * mo.charge + a * 2 * n(47, 1.3));
    }
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
      legT.Left.x += 30 * pull; legT.Right.x += 24 * pull;                                // legs lag toward the chest side
      add('LeftLeg', -28 * pu, 0, 0); add('RightLeg', -18 * pu, 0, 0);                     // knees give under the g
      add('LeftArm', 14 * pull, 0, -22 * pu); add('RightArm', 14 * pull, 0, 22 * pu);     // arms open out like wings
      // Sideways push: legs swing to the outside, the head and chest lean in
      const lat = THREE.MathUtils.clamp(this.flt.lat / F.latFull, -1, 1) * fl;
      legT.Left.z += -18 * lat; legT.Right.z += -18 * lat;
      add('Spine01', 0, 0, -8 * lat); add('Head', 0, 0, -10 * lat);
      // Barrel rolls: an arm flings out to thrust the suit into the spin (and the other arm to stop it);
      // mid-spin everything tucks in tight, like a skater spinning faster
      const spin = Math.min(1, Math.abs(this.flt.roll) / F.rollFull) * fl;
      const kick = THREE.MathUtils.clamp(this.flt.rollAcc / F.rollAccFull, -1, 1) * fl;
      const kr = Math.max(0, kick), kl = Math.max(0, -kick);
      // (in the boosted takeoff's rolls the pilot tucks only a little: the spin throws the limbs out, below)
      const tuck = this.inBurst ? 0.25 : 1;
      add('LeftArm', 0, 0, 26 * spin * tuck * (1 - kl) - 70 * kl); add('RightArm', 0, 0, -26 * spin * tuck * (1 - kr) + 70 * kr);
      add('LeftForeArm', 0, 0, -20 * kl); add('RightForeArm', 0, 0, 20 * kr);
      add('LeftUpLeg', 0, 0, 6 * spin * tuck); add('RightUpLeg', 0, 0, -6 * spin * tuck);               // legs squeeze together
      // Spin physics (boosted takeoff rolls): the spin throws the arms and legs outward and they lag
      // behind the turn; the elbows give a little; the legs splay on their springs (so they wobble)
      if (this.inBurst && spin > 0.01) {
        const S = P.subtle, fling = spin * S.spinFling, lag = -Math.sign(this.flt.roll) * spin * S.spinLag;
        add('LeftArm', 0, lag, -fling); add('RightArm', 0, lag, fling);
        add('LeftForeArm', fling * 0.4, 0, -fling * 0.3); add('RightForeArm', fling * 0.4, 0, fling * 0.3);
        legT.Left.z -= fling * 0.45; legT.Right.z += fling * 0.45;
        add('LeftUpLeg', 0, lag * 0.6, 0); add('RightUpLeg', 0, lag * 0.6, 0);
        this.handCurl('Left', -20 * spin); this.handCurl('Right', -20 * spin);
      }
      for (const n of ['LeftLeg', 'RightLeg']) add(n, 8 * spin, 0, 0);                     // and straighten
      add('Head', -8 * spin, 0, 0);                                                          // chin tucks
      // the thrusting hand opens (palm out), the others close up
      this.handCurl('Right', -40 * kr + 25 * spin * (1 - kr));
      this.handCurl('Left', -40 * kl + 25 * spin * (1 - kl));
    }
    // FLIGHT toward the ground / the sky (the way the nose points)
    if (fl > 0.01) {
      const S = P.subtle;
      const dive = Math.min(1, Math.max(0, -this.pitch) / (S.pitchFullDeg * D2R)) * fl;
      const climb = Math.min(1, Math.max(0, this.pitch) / (S.pitchFullDeg * D2R)) * fl;
      const aimTo = (name, v, wgt) => {
        const b = R[name];
        if (!b?.dir || wgt < 0.01) return;
        _v.fromArray(v).normalize();
        if (!b.hasAim) { b.aim.copy(b.dir); b.hasAim = true; }
        b.aim.normalize().lerp(_v, wgt).normalize();
      };
      // diving: streamline. Arms tight back along the body, legs together and straight, toes pointed
      aimTo('LeftArm', [-0.1, -0.98, 0.15], dive); aimTo('RightArm', [0.1, -0.98, 0.15], dive);
      aimTo('LeftForeArm', [-0.06, -0.98, 0.18], dive); aimTo('RightForeArm', [0.06, -0.98, 0.18], dive);
      legT.Left.z += 6 * dive; legT.Right.z -= 6 * dive;
      for (const n of ['LeftLeg', 'RightLeg']) add(n, 10 * dive, 0, 0);
      for (const n of ['LeftFoot', 'RightFoot']) add(n, -15 * dive, 0, 0);
      this.handCurl('Left', 30 * dive); this.handCurl('Right', 30 * dive);
      // climbing: push yourself up. Arms drive down along the body with the palms toward the feet
      // (the hand thrusters firing back down), the more so the more upright you are, like the launch
      for (const n of ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']) {
        const lp = POSES.launch[n];
        if (lp?.aim) aimTo(n, lp.aim, climb);
        if (lp?.twist && R[n]) R[n].twist += lp.twist * climb;
      }
      add('Spine01', 6 * climb, 0, 0); add('Head', 14 * climb, 0, 0);
      legT.Left.x += 10 * climb; legT.Right.x += 4 * climb;
      add('LeftLeg', -16 * climb, 0, 0);
      this.handCurl('Left', -15 * climb); this.handCurl('Right', -15 * climb);
      // flutter in the airflow: knees and feet shiver a little, more at speed
      const fz = Math.min(1, this.speed / 60) * S.flutterDeg * fl, t = this.t;
      add('LeftLeg', -fz * (0.5 + 0.5 * Math.sin(t * 15.3)), 0, 0); add('RightLeg', -fz * (0.5 + 0.5 * Math.sin(t * 13.1 + 1.7)), 0, 0);
      add('LeftFoot', fz * 0.6 * Math.sin(t * 11.7 + 0.4), 0, 0); add('RightFoot', fz * 0.6 * Math.sin(t * 12.9 + 2.2), 0, 0);
    }
    // legs swing on springs that slightly overshoot: after a turn or a stop they wiggle as they settle
    if (!this.preview) {
      const S = P.subtle, dt = Math.min(0.05, this.dtLast ?? 0.016);
      // every so often (hover / flight): a small shift of one leg, and a hand flexes
      const airborne = w.hover + w.flight + w.boost;
      this.fidgetIn = (this.fidgetIn ?? 2) - dt;
      if (this.fidgetIn <= 0) {
        const [lo, hi] = S.fidgetEvery;
        this.fidgetIn = lo + Math.random() * (hi - lo);
        if (airborne > 0.5) {
          const sd = Math.random() < 0.5 ? 'Left' : 'Right', k = S.fidgetDeg * S.legSpring;
          this.legSpring[sd].vx += (Math.random() - 0.5) * 2 * k;
          this.legSpring[sd].vz += (Math.random() - 0.5) * k;
          this.handFlex = { side: Math.random() < 0.5 ? 'Left' : 'Right', t: 0 };
        }
      }
      if (this.handFlex) {
        this.handFlex.t += dt;
        const u = this.handFlex.t / 0.7;
        if (u >= 1) this.handFlex = null; else this.handCurl(this.handFlex.side, 18 * Math.sin(Math.PI * u));
      }
      for (const [sd, om] of [['Left', S.legSpring], ['Right', S.legSpring * 1.13]]) {
        const sp = this.legSpring[sd], z2 = 2 * S.legDamping * om;
        // aim only within what the hip can do (so the overshoot is a small wiggle, not a big swing)
        const tx = THREE.MathUtils.clamp(legT[sd].x, -32, w.flight + w.boost > 0.5 ? 45 : 18), tz = THREE.MathUtils.clamp(legT[sd].z, -25, 25);
        sp.vx += (om * om * (tx - sp.x) - z2 * sp.vx) * dt; sp.x += sp.vx * dt;
        sp.vz += (om * om * (tz - sp.z) - z2 * sp.vz) * dt; sp.z += sp.vz * dt;
        add(`${sd}UpLeg`, sp.x, 0, sp.z);
      }
    }
    // at rest (standing or hovering): breathing, and the head glances around now and then
    if (!this.preview) {
      const S = P.subtle, calm = (w.hover + w.stand) * Math.max(0, 1 - this.speed / 4), t = this.t;
      const br = Math.sin(t * 2 * Math.PI / S.breathPeriod) * S.breathDeg * (w.hover + w.stand + (w.flight + w.boost) * 0.4);
      add('Spine01', br, 0, 0); add('Spine', br * 0.6, 0, 0); add('LeftArm', 0, 0, -br * 0.3); add('RightArm', 0, 0, br * 0.3);
      const look = (Math.sin(t * 0.37) + 0.6 * Math.sin(t * 0.91 + 1.3)) * S.glanceDeg * calm;
      add('neck', 0, look * 0.4, 0); add('Head', Math.sin(t * 0.53 + 0.7) * S.glanceDeg * 0.25 * calm, look * 0.6, 0);
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
    this.model.position.y = this.baseY - (th + sh) * (1 - Math.cos(cr * D2R)) * 0.9 + (this.previewLift ?? 0);   // landing crouch

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
    // Crouching (launch wind-up / hop): lower the body so the feet stay where they were
    const cw = this.w.crouch ?? 0;
    if (cw > 0.01 && this.restFootY != null) {
      const f = this.footY();
      this.model.position.y += (this.restFootY - f) * cw;
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

  // Height of the lower ankle, in the suit's frame
  footY() {
    const r = this.suitRoot, L = this.byName.LeftFoot?.bone, Rf = this.byName.RightFoot?.bone;
    if (!r || !L || !Rf) return null;
    this.model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(r.matrixWorld).invert();
    const a = L.getWorldPosition(_v).applyMatrix4(inv).y, b = Rf.getWorldPosition(_v).applyMatrix4(inv).y;
    return Math.min(a, b);
  }

  // Back to a clean start (after a reset): standing, nothing carried over
  reset() {
    for (const s of STATES) this.w[s] = s === 'stand' ? 1 : 0;
    this.brace = 0; this.limp = 0; this.crouch = 0; this.walk = 0; this.walkPhase = 0;
    this.lean.set(0, 0); this.side = 0; this.accH.set(0, 0); this.yawRate = 0; this.vy = 0; this.upS = 0; this.upV = 0; this.ay = 0;
    Object.assign(this.flt, { pull: 0, lat: 0, roll: 0, rollAcc: 0, lastRoll: 0 });
    this.mom = { flare: 0, launch: 0, crouch: 0, hop: 0, recover: 0, charge: 0, tuck: 0, lean: 0, leaning: false, launchCount: null, launchClock: 9, hopClock: 9, recoverClock: 9 };
    for (const sp of Object.values(this.legSpring)) Object.assign(sp, { x: 0, vx: 0, z: 0, vz: 0 });
    this.limbs = {}; this.handFlex = null; this.fidgetIn = 2; this.pitch = 0;
    this.geff.set(0, -9.8, 0); this._prevVel = null; this.primed = false;
    this.wasGrounded = true; this.wasGroundedHop = true; this.wasStunned = false; this.lastVy = 0;
    this.apply();
  }
}
