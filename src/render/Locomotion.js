import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// Walking, running, strafing, turning on the spot and standing idle on the ground, from the Mixamo
// clips in art/locomotion (sampled by tools/locomotion/extract_clips.py into assets/locomotion.json).
//
// Each clip frame holds the direction every body bone points, in the suit's frame. Each frame the
// clips are blended by how fast and which way you're moving on the ground and how fast you're
// turning; the result goes to the poser as bone aims (in place of the stand pose).
// The clips' own travel is thrown away: the game moves you, and the steps keep pace with it.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Locomotion {
  constructor() {
    this.ready = false;
    this.aims = {};      // bone name -> blended direction (suit frame)
    this.phase = 0;      // 0..1 through one stride (two steps), shared by every moving clip
    this.idleT = 0;
    this.turnPhase = 0;
    this.yawS = 0;       // smoothed turn rate (rad/s)
    this.velS = new THREE.Vector2();   // smoothed ground velocity in the suit's frame (x right, y forward)
    const url = CONFIG.locomotion.url;
    fetch(url).then((r) => r.json()).then((d) => this.load(d))
      .catch((e) => console.warn('Locomotion clips failed to load; using the stand pose', e));
  }

  load(d) {
    this.bones = d.bones;
    this.clips = d.clips;
    for (const c of Object.values(this.clips)) c.stride = Math.max(0.5, c.speed * c.duration);   // metres per loop
    for (const n of this.bones) this.aims[n] = new THREE.Vector3();
    this.ready = true;
  }

  // Add clip `name` at time u (0..1 through the clip) into the blend, with weight w
  addClip(name, u, w) {
    if (w < 1e-3) return;
    const c = this.clips[name], nb = this.bones.length, n = c.frames;
    const f = c.loop ? ((u % 1) + 1) % 1 * n : THREE.MathUtils.clamp(u, 0, 1) * (n - 1);
    const i0 = Math.floor(f) % n, i1 = c.loop ? (i0 + 1) % n : Math.min(n - 1, i0 + 1), k = f - Math.floor(f);
    const D = c.dirs;
    for (let j = 0; j < nb; j++) {
      const a = (i0 * nb + j) * 3, b = (i1 * nb + j) * 3;
      _a.set(D[a], D[a + 1], D[a + 2]).lerp(_b.set(D[b], D[b + 1], D[b + 2]), k);
      this.aims[this.bones[j]].addScaledVector(_a, w);
    }
  }

  // A whole-body clip (getting up) at u (0..1): bone aims into `aims`, and the hips' turn and height
  sampleFull(name, u, aims, q) {
    const c = this.clips[name];
    if (!c?.hipsQ) return null;
    const nb = this.bones.length, n = c.frames, f = THREE.MathUtils.clamp(u, 0, 1) * (n - 1);
    const i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), k = f - i0, D = c.dirs, H = c.hipsQ;
    for (let j = 0; j < nb; j++) {
      const a = (i0 * nb + j) * 3, b = (i1 * nb + j) * 3;
      (aims[this.bones[j]] ??= new THREE.Vector3()).set(D[a], D[a + 1], D[a + 2]).lerp(_b.set(D[b], D[b + 1], D[b + 2]), k).normalize();
    }
    q.set(H[i0 * 4], H[i0 * 4 + 1], H[i0 * 4 + 2], H[i0 * 4 + 3]).slerp(_q.set(H[i1 * 4], H[i1 * 4 + 1], H[i1 * 4 + 2], H[i1 * 4 + 3]), k);
    return c.hipsY[i0] + (c.hipsY[i1] - c.hipsY[i0]) * k - c.hipsRest;   // (height change from standing, m)
  }

  // vel: ground velocity in the suit's frame (x right, y forward, m/s); yawRate: + turning left (rad/s)
  update(dt, vel, yawRate) {
    if (!this.ready) return false;
    const L = CONFIG.locomotion;
    const k = 1 - Math.exp(-L.smooth * dt);
    this.velS.lerp(vel, k);
    this.yawS += (yawRate - this.yawS) * k;
    const sp = this.velS.length();
    const move = THREE.MathUtils.smoothstep(sp, L.moveFrom, L.moveFull);
    const run = THREE.MathUtils.smoothstep(sp, L.runFrom, L.runFull);
    const turn = THREE.MathUtils.smoothstep(Math.abs(this.yawS), L.turnFrom, L.turnFull) * (1 - move);
    // which way: forward, backward (the walk played in reverse) and left / right (strafes)
    const fx = sp > 1e-3 ? this.velS.y / sp : 1, rx = sp > 1e-3 ? this.velS.x / sp : 0;
    let wf = Math.max(0, fx), wb = Math.max(0, -fx), wl = Math.max(0, -rx), wr = Math.max(0, rx);
    const sum = wf + wb + wl + wr || 1;
    wf /= sum; wb /= sum; wl /= sum; wr /= sum;
    // stride length for this mix, so the feet keep pace with the ground
    const C = this.clips;
    const lerp = (a, b) => a + (b - a) * run;
    const stride = (wf + wb) * lerp(C.walk.stride, C.run.stride) + wl * lerp(C.strafeWalkL.stride, C.strafeRunL.stride) + wr * lerp(C.strafeWalkR.stride, C.strafeRunR.stride);
    this.phase = (this.phase + (sp / Math.max(0.5, stride)) * L.cadence * dt) % 1;
    this.idleT = (this.idleT + dt / C.idle.duration) % 1;
    this.turnPhase = (this.turnPhase + Math.abs(this.yawS) / (Math.PI / 2) * dt) % 1;   // (each turn clip turns 90°)

    for (const n of this.bones) this.aims[n].set(0, 0, 0);
    const still = (1 - move) * (1 - turn);
    this.addClip('idle', this.idleT, still);
    this.addClip(this.yawS > 0 ? 'turnL' : 'turnR', this.turnPhase, turn);
    const p = this.phase, mw = move * (1 - run), mr = move * run;
    this.addClip('walk', p, wf * mw); this.addClip('run', p, wf * mr);
    this.addClip('walk', 1 - p, wb * mw); this.addClip('run', 1 - p, wb * mr);
    this.addClip('strafeWalkL', p, wl * mw); this.addClip('strafeRunL', p, wl * mr);
    this.addClip('strafeWalkR', p, wr * mw); this.addClip('strafeRunR', p, wr * mr);
    for (const n of this.bones) this.aims[n].normalize();
    return true;
  }
}
