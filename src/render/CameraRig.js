import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { rayBox } from '../flight/avoidance.js';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

// Numbers that make up a camera shot (see CONFIG.camera.shots)
export const SHOT_KEYS = ['distance', 'orbit', 'height', 'shoulder', 'lookUp', 'lookAhead', 'fov', 'bank', 'lag', 'shake'];

// Which shot fits what the suit is doing right now
export function shotFor(game, boost) {
  if (!game.controller.flying) return game.charging ? 'charge' : 'hover';
  return boost ? 'boost' : 'flight';
}

// Third-person cinematic camera. Each state (hover, flight, boost) has its own shot:
// where the camera sits (distance, orbit round the suit, height angle, shoulder offset),
// what it looks at, its field of view, how much it banks, how loosely it follows and how
// much it shakes. Switching state blends smoothly from one shot to the next.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.lockShot = null;          // the Camera Studio can lock the preview to one shot
    this.shotName = 'hover';
    this.cur = { ...CONFIG.camera.shots.hover };   // blended shot values
    this._want = new THREE.Vector3();
    this._wantLook = new THREE.Vector3();
    this._wantUp = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._off = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this.lookOff = new THREE.Vector3();
    this.sp = { zoom: { x: 1, v: 0 }, side: { x: 0, v: 0 }, move: { x: 0, v: 0 }, hard: { x: 0, v: 0 }, burst: { x: 0, v: 0 }, charge: { x: 0, v: 0 } };
    this.punchT = null;
    this.lastLaunch = 0;
    this._ray = new THREE.Vector3();
    this.wallDist = Infinity;
    this.from = { ...this.cur };
    this.blendT = 1;
    this.blendDur = 1;
    this.fyaw = 0; this.fpitch = 0; this.vyaw = 0; this.vpitch = 0;
    this.flyingBefore = false;
    this._back = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._qp = new THREE.Quaternion();
    this.shakeT = 0;
    this.snapNext = true;
  }

  get mode() { return CONFIG.camera.modes[this.modeIndex]; }

  cycle() {
    this.modeIndex = (this.modeIndex + 1) % CONFIG.camera.modes.length;
    return this.mode.name;
  }

  snap() { this.snapNext = true; }

  // Critically damped spring: eases toward a target without overshoot or sudden starts
  spring(name, target, w, dt) {
    const s = this.sp[name];
    if (this.snapNext) { s.x = target; s.v = 0; return; }
    s.v += (w * w * (target - s.x) - 2 * w * s.v) * dt;
    s.x += s.v * dt;
  }

  // If a building is between the suit and the camera, bring the camera in front of it
  // straight away; once clear, ease back out to the shot's distance.
  keepOutOfWalls(game, target, dt) {
    const cc = CONFIG.camera, pivot = this._pivot.copy(target);
    pivot.y += cc.wallPivotUp;
    const ray = this._ray.subVectors(this.camera.position, pivot);
    const full = ray.length();
    if (full < 1e-3) return;
    ray.divideScalar(full);
    let free = full;
    for (const col of game.world.colliders) {
      const t = rayBox(pivot, ray, col.min, col.max, cc.wallPad, full);
      if (t > 0 && t < free) free = t;
    }
    free = Math.max(cc.wallMin, free - cc.wallPad);
    if (this.snapNext || free < this.wallDist) this.wallDist = free;
    else this.wallDist += (free - this.wallDist) * (1 - Math.exp(-cc.wallEaseOut * dt));
    if (this.wallDist < full) this.camera.position.copy(pivot).addScaledVector(ray, this.wallDist);
  }

  update(game, dt, boost = false) {
    const body = game.body, ctrl = game.controller, cc = CONFIG.camera;
    const target = body.pos;
    const speed = body.vel.length();

    // Blend toward the shot for what you're doing: an eased move from the old shot to the new
    // one (slow-fast-slow), so switching mode glides instead of lurching
    const name = this.lockShot ?? shotFor(game, boost);
    if (name !== this.shotName || this.snapNext) {
      this.shotName = name;
      this.from = { ...this.cur };
      this.blendT = this.snapNext ? 1 : 0;
      this.blendDur = (this.flyingBefore !== ctrl.flying) ? cc.modeBlendTime
        : (name === 'charge' || this.from && this.lastShot === 'charge') ? cc.charge.blendTime : cc.shotBlendTime;
      this.lastShot = name;
    }
    const shot = cc.shots[this.shotName];
    this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
    const e = this.blendT * this.blendT * this.blendT * (this.blendT * (this.blendT * 6 - 15) + 10);
    for (const k of SHOT_KEYS) this.cur[k] = this.from[k] + (shot[k] - this.from[k]) * e;
    const s = this.cur;

    // Moments on top of the shot, all eased so nothing snaps:
    //   turns and rolls -> pull back a little and slide over the shoulder on the turn's side
    //   launch burst    -> a quick punch in toward the suit, then back out
    const m = cc.moments, inp = game.lastInput;
    const jet = ctrl.jet;
    const turn = !inp ? 0 : ctrl.flying ? inp.strafe : -inp.yaw;   // + = turning right
    // Turns, barrel rolls and hard turns: the camera backs off and the view widens.
    // Rolls and hard turns are quick, so the effect is held a moment after them.
    if (ctrl.flying && (jet.rollT > 0 || jet.jinkT > 0 || jet.snapT > 0)) this.moveT = m.moveHold;
    else this.moveT = Math.max(0, (this.moveT ?? 0) - dt);
    if (ctrl.flying && jet.snapT > 0) this.hardT = m.moveHold;
    else this.hardT = Math.max(0, (this.hardT ?? 0) - dt);
    const moving = Math.max(Math.min(1, Math.abs(turn)), this.moveT > 0 ? 1 : 0);
    const zoomWant = 1 + Math.max(m.moveDistance * moving, this.hardT > 0 ? m.hardTurnDistance : 0);
    this.spring('move', moving, m.zoomSpring, dt);
    this.spring('hard', this.hardT > 0 ? 1 : 0, m.zoomSpring, dt);
    const sideWant = m.turnShoulder * THREE.MathUtils.clamp(turn, -1, 1);
    this.spring('zoom', zoomWant, m.zoomSpring, dt);
    this.spring('side', sideWant, m.shoulderSpring, dt);
    if ((game.launchCount ?? 0) !== this.lastLaunch) { this.lastLaunch = game.launchCount ?? 0; if (!this.snapNext) this.punchT = 0; }
    let punch = 0;
    if (this.punchT != null) {
      this.punchT += dt;
      const p = m.punch;
      punch = this.punchT < p.attack ? THREE.MathUtils.smootherstep(this.punchT, 0, p.attack)
        : 1 - THREE.MathUtils.smootherstep(this.punchT, p.attack, p.attack + p.release);
      if (this.punchT > p.attack + p.release) this.punchT = null;
    }
    // Boosted takeoff: pull way back and widen the view (eased in and out)
    // (held until returnAt of the way along the curve, then it eases back)
    this.burstHold = game.burst && game.burst.d < (game.burstPath?.length ?? 0) * cc.burst.returnAt ? 1 : 0;
    this.spring('burst', this.burstHold > 0 ? 1 : 0, cc.burst.spring, dt);
    const bw = Math.max(0, this.sp.burst.x);
    // Charging up (L1 + R1 crouch): punch in, narrow the view, a little shake
    this.spring('charge', game.charging ? 1 : 0, cc.charge.spring, dt);
    const cw = THREE.MathUtils.clamp(this.sp.charge.x, 0, 1.2);
    // Mid-air burst into flight: knocked back, wider, shaking; fading fast
    if ((game.airLaunchCount ?? 0) !== this.lastAir) { this.lastAir = game.airLaunchCount ?? 0; if (!this.snapNext && this.lastAir) { this.blastT = 0; this.punchT = null; } }
    let blast = 0;
    const BL = CONFIG.launch.air.blast;
    if (this.blastT != null) {
      this.blastT += dt;
      blast = this.blastT < 0.06 ? this.blastT / 0.06 : Math.max(0, 1 - (this.blastT - 0.06) / BL.time) ** 2;
      if (this.blastT > BL.time + 0.06) this.blastT = null;
    }
    const zoom = this.sp.zoom.x * (1 - m.punch.distance * punch) * (1 + BL.camBack * blast);
    const fovMult = 1 + m.moveFov * this.sp.move.x + m.hardTurnFov * this.sp.hard.x;   // widens with the same easing
    const shoulder = s.shoulder + this.sp.side.x;

    // Frame: hover follows your heading; flight follows where you're actually going.
    // The frame swings on a spring, so it never jumps (e.g. the steep climb of a launch).
    let yaw = ctrl.heading, pitch = 0;
    if (ctrl.flying) {
      const d = speed > 8 ? this._dir.copy(body.vel).normalize() : this._dir.copy(ctrl.jet.direction);
      yaw = Math.atan2(-d.x, -d.z);
      // Not steering: face along your intended path, so a juke's sidestep (or its leftover drift)
      // doesn't swing the view. Steering or in a hard turn: follow your actual motion.
      if (Math.abs(turn) < 0.1 && jet.snapT <= 0 && jet.flipT <= 0 && speed > 8) yaw = jet.yaw;
      pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * cc.followPitch;
    }
    const w = ctrl.flying ? cc.frameSpring.flight : cc.frameSpring.hover;
    const settling = this.flyingBefore !== ctrl.flying ? 0 : 1;
    if (!settling) this.modeT = cc.modeBlendTime;
    this.modeT = Math.max(0, (this.modeT ?? 0) - dt);
    const wNow = w * (1 - 0.6 * (this.modeT / cc.modeBlendTime));   // softer just after a mode switch
    this.flyingBefore = ctrl.flying;
    if (this.snapNext) { this.fyaw = yaw; this.fpitch = pitch; this.vyaw = this.vpitch = 0; }
    let dy = yaw - this.fyaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.vyaw += (wNow * wNow * dy - 2 * wNow * this.vyaw) * dt;
    this.vpitch += (wNow * wNow * (pitch - this.fpitch) - 2 * wNow * this.vpitch) * dt;
    this.fyaw += this.vyaw * dt;
    this.fpitch += this.vpitch * dt;
    yaw = this.fyaw;
    pitch = this.fpitch;
    const dist = s.distance * (this.mode.distanceMult ?? 1) * zoom + cc.burst.distance * bw;
    const elev = THREE.MathUtils.degToRad(s.height);
    this._q.setFromAxisAngle(Y, yaw + THREE.MathUtils.degToRad(s.orbit + (this.mode.orbit ?? 0)));
    this._qp.setFromAxisAngle(X, pitch);
    this._q.multiply(this._qp);
    // (in this frame -Z is forward, +Z behind, +X right)
    this._off.set(shoulder, Math.sin(elev) * dist, Math.cos(elev) * dist).applyQuaternion(this._q);
    this._want.copy(target).add(this._off);
    this._q.setFromAxisAngle(Y, yaw).multiply(this._qp);
    this._wantLook.set(0, s.lookUp, -s.lookAhead).applyQuaternion(this._q).add(target);

    // Lean the horizon with the suit's bank (flight); never during the boosted takeoff (level horizon)
    this._wantUp.copy(Y);
    if (ctrl.flying && s.bank > 0 && !(this.burstHold > 0)) {
      this._back.set(0, 0, 1).applyQuaternion(body.quat);
      this._wantUp.lerp(this._back, s.bank * (1 - ctrl.jet.flare)).normalize();
      if (this._wantUp.y < 0.3) this._wantUp.copy(Y);
    }
    this._want.y = Math.max(0.6, this._want.y);

    // Smooth the camera's offset from the suit (not its position), so it never falls far
    // behind at speed: the shot's distance is the distance you get
    const k = this.snapNext ? 1 : 1 - Math.exp(-s.lag * dt);
    this._off.subVectors(this._want, target);
    if (this.snapNext) this.offset.copy(this._off);
    else this.offset.lerp(this._off, k);
    this.camera.position.copy(target).add(this.offset);
    this.keepOutOfWalls(game, target, dt);
    this.camera.position.y = Math.max(0.6, this.camera.position.y);
    // Aim point, also kept relative to the suit (a sudden burst doesn't jerk the view)
    this._wantLook.sub(target);
    if (this.snapNext) this.lookOff.copy(this._wantLook);
    else this.lookOff.lerp(this._wantLook, Math.min(1, k * 2));
    this.look.copy(target).add(this.lookOff);
    this.up.lerp(this._wantUp, this.snapNext ? 1 : Math.min(1, k)).normalize();

    // charging: a small tense shake
    if (cw > 0.01) {
      this.chargeShakeT = (this.chargeShakeT ?? 0) + dt;
      const t = this.chargeShakeT, amp = cc.charge.shake * cw;
      this.camera.position.x += amp * (Math.sin(t * 37.3) + 0.5 * Math.sin(t * 61.7));
      this.camera.position.y += amp * (Math.sin(t * 43.1) + 0.5 * Math.sin(t * 57.9));
    }
    // the burst's jolt
    if (blast > 0.01) {
      const t = this.blastT, amp = CONFIG.launch.air.blast.shake * blast;
      this.camera.position.x += amp * (Math.sin(t * 71.3) + 0.6 * Math.sin(t * 113.7));
      this.camera.position.y += amp * (Math.sin(t * 83.1) + 0.6 * Math.sin(t * 97.9));
    }
    // Handheld shake that grows with speed
    if (s.shake > 0) {
      this.shakeT += dt;
      const amp = s.shake * THREE.MathUtils.smoothstep(speed, 10, 60);
      const t = this.shakeT;
      this.camera.position.x += amp * (Math.sin(t * 23.1) + Math.sin(t * 37.7) * 0.5);
      this.camera.position.y += amp * (Math.sin(t * 29.3) + Math.sin(t * 41.9) * 0.5);
    }

    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);

    // Field of view: the shot's, a little wider at speed
    const wantFov = s.fov * fovMult * (1 + cc.burst.fovMult * bw) - cc.moments.punch.fov * punch + CONFIG.launch.air.blast.fov * blast + Math.min(cc.speedFovMax, Math.max(0, speed - cc.speedFovFrom) * cc.speedFovPer);
    this.camera.fov += (wantFov - this.camera.fov) * (this.snapNext ? 1 : Math.min(1, 3 * dt));
    if (bw > 0.01) this.camera.up.copy(Y), this.up.copy(Y);   // (boosted takeoff: horizon held level)
    this.camera.updateProjectionMatrix();
    this.snapNext = false;
  }
}
