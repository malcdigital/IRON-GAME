import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

// Numbers that make up a camera shot (see CONFIG.camera.shots)
export const SHOT_KEYS = ['distance', 'orbit', 'height', 'shoulder', 'lookUp', 'lookAhead', 'fov', 'bank', 'lag', 'shake'];

// Which shot fits what the suit is doing right now
export function shotFor(game, boost) {
  if (!game.controller.flying) return 'hover';
  return boost || game.launchT > 0 ? 'boost' : 'flight';
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

  update(game, dt, boost = false) {
    const body = game.body, ctrl = game.controller, cc = CONFIG.camera;
    const target = body.pos;
    const speed = body.vel.length();

    // Blend toward the shot for what you're doing
    this.shotName = this.lockShot ?? shotFor(game, boost);
    const shot = cc.shots[this.shotName];
    const kb = this.snapNext ? 1 : 1 - Math.exp(-cc.blendRate * dt);
    for (const k of SHOT_KEYS) this.cur[k] += (shot[k] - this.cur[k]) * kb;
    const s = this.cur;

    // Frame: hover follows your heading; flight follows where you're actually going
    let yaw = ctrl.heading, pitch = 0;
    if (ctrl.flying) {
      const d = speed > 8 ? this._dir.copy(body.vel).normalize() : this._dir.copy(ctrl.jet.direction);
      yaw = Math.atan2(-d.x, -d.z);
      pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) * cc.followPitch;
    }
    const dist = s.distance * (this.mode.distanceMult ?? 1);
    const elev = THREE.MathUtils.degToRad(s.height);
    this._q.setFromAxisAngle(Y, yaw + THREE.MathUtils.degToRad(s.orbit + (this.mode.orbit ?? 0)));
    this._qp.setFromAxisAngle(X, pitch);
    this._q.multiply(this._qp);
    // (in this frame -Z is forward, +Z behind, +X right)
    this._off.set(s.shoulder, Math.sin(elev) * dist, Math.cos(elev) * dist).applyQuaternion(this._q);
    this._want.copy(target).add(this._off);
    this._q.setFromAxisAngle(Y, yaw).multiply(this._qp);
    this._wantLook.set(0, s.lookUp, -s.lookAhead).applyQuaternion(this._q).add(target);

    // Lean the horizon with the suit's bank (flight)
    this._wantUp.copy(Y);
    if (ctrl.flying && s.bank > 0) {
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
    this.camera.position.y = Math.max(0.6, this.camera.position.y);
    this.look.lerp(this._wantLook, this.snapNext ? 1 : Math.min(1, k * 2));
    this.up.lerp(this._wantUp, this.snapNext ? 1 : Math.min(1, k)).normalize();

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
    const wantFov = s.fov + Math.min(cc.speedFovMax, Math.max(0, speed - cc.speedFovFrom) * cc.speedFovPer);
    this.camera.fov += (wantFov - this.camera.fov) * (this.snapNext ? 1 : Math.min(1, 3 * dt));
    this.camera.updateProjectionMatrix();
    this.snapNext = false;
  }
}
