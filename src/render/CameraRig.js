import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

const Y = new THREE.Vector3(0, 1, 0);

// Third-person camera.
// Hover: trails behind the heading. Flight: sits behind the flight path, banks with you,
// and widens its view as you speed up.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.modeIndex = 0;
    this.look = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this._want = new THREE.Vector3();
    this._wantLook = new THREE.Vector3();
    this._wantUp = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.snapNext = true;
  }

  get mode() { return CONFIG.camera.modes[this.modeIndex]; }

  cycle() {
    this.modeIndex = (this.modeIndex + 1) % CONFIG.camera.modes.length;
    return this.mode.name;
  }

  snap() { this.snapNext = true; }

  update(game, dt) {
    const body = game.body, ctrl = game.controller;
    const target = body.pos;
    const speed = body.vel.length();
    let smoothing = CONFIG.camera.smoothing;

    if (ctrl.flying && this.modeIndex !== 2) {
      // Behind the flight path, a bit above, looking ahead of you
      const f = CONFIG.camera.flight;
      const dir = speed > 8 ? this._back.copy(body.vel).normalize() : ctrl.jet.direction;
      const far = this.modeIndex === 1 ? 2 : 1;
      this._want.copy(target).addScaledVector(dir, -f.distance * far).addScaledVector(Y, f.height * far);
      this._wantLook.copy(target).addScaledVector(dir, f.lookAhead);
      // Lean the horizon a little with the suit's bank
      this._back.set(0, 0, 1).applyQuaternion(body.quat);
      this._wantUp.copy(Y).lerp(this._back, f.bankFollow * (1 - ctrl.jet.flare)).normalize();
      if (this._wantUp.y < 0.3) this._wantUp.copy(Y);
      smoothing = f.smoothing;
    } else {
      const m = this.mode;
      this._q.setFromAxisAngle(Y, ctrl.heading);
      this._want.set(...m.offset).applyQuaternion(this._q).add(target);
      this._wantLook.set(...m.look).applyQuaternion(this._q).add(target);
      this._wantUp.copy(Y);
    }
    this._want.y = Math.max(0.6, this._want.y);

    const k = this.snapNext ? 1 : 1 - Math.exp(-smoothing * dt);
    this.camera.position.lerp(this._want, k);
    this.look.lerp(this._wantLook, this.snapNext ? 1 : Math.min(1, k * 2));
    this.up.lerp(this._wantUp, this.snapNext ? 1 : Math.min(1, k)).normalize();
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);

    // Wider view at speed
    const fov = CONFIG.camera.fov;
    const wantFov = Math.min(fov.max, fov.base + Math.max(0, speed - fov.startSpeed) * fov.perSpeed);
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, 3 * dt);
    this.camera.updateProjectionMatrix();
    this.snapNext = false;
  }
}
