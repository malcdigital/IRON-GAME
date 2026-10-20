import * as THREE from '../lib/three.js';
import { storage } from '../core/storage.js';
import { CONFIG } from '../core/config.js';
import { POSES, STATES } from '../render/SuitPoses.js';

// Pose Studio (dev tool, not part of the finished game): look round the suit and set its poses.
// Pick a pose, then drag the dots on the joints to move a limb, or pick a body part and use the
// sliders. Drag empty space to orbit, scroll to zoom, right-drag to slide the view.
// Changes save in this browser; "Copy poses" gives text to paste into src/render/SuitPoses.js.

const LABELS = { stand: 'Stand', hover: 'Hover', flight: 'Flight', boost: 'Boost', brace: 'Brace', flare: 'Brake', launch: 'Launch', recover: 'Recover', crouch: 'Crouch' };
const PARTS = [
  ['Body', [['Hips', 'Hips (whole body)'], ['Spine02', 'Lower back'], ['Spine01', 'Mid back'], ['Spine', 'Chest'], ['neck', 'Neck'], ['Head', 'Head']]],
  ['Left arm', [['LeftArm', 'Left upper arm'], ['LeftForeArm', 'Left forearm'], ['LeftHand', 'Left hand']]],
  ['Right arm', [['RightArm', 'Right upper arm'], ['RightForeArm', 'Right forearm'], ['RightHand', 'Right hand']]],
  ['Left leg', [['LeftUpLeg', 'Left thigh'], ['LeftLeg', 'Left shin'], ['LeftFoot', 'Left foot']]],
  ['Right leg', [['RightUpLeg', 'Right thigh'], ['RightLeg', 'Right shin'], ['RightFoot', 'Right foot']]],
];
const PART_NAME = Object.fromEntries(PARTS.flatMap(([, list]) => list));
// Dragging a joint dot moves the bone that ends there
const DRAG = {
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandMiddle1',
  RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandMiddle1',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
  Head: 'head_end',
};
const ROT = [['x', 'Tip forward / back', 0], ['z', 'Tip left / right', 2]];
const FINGERS = [['curl', 'All fingers'], ['thumb', 'Thumb'], ['i0', 'Index'], ['i1', 'Middle'], ['i2', 'Ring'], ['i3', 'Pinky']];
const DEFAULTS = JSON.parse(JSON.stringify(POSES));
const r2 = (v) => Math.round(v * 100) / 100;

export function loadSavedPoses() {
  const seq = storage.get('launchSeq');
  if (seq?.airFireAt === 0.15) delete seq.airFireAt;   // (the old default; the mid-air tuck is longer now)
  if (seq) Object.assign(CONFIG.launch.seq, seq);
  const saved = storage.get('suitPoses');
  if (!saved) return;
  for (const s of STATES) if (saved[s]) POSES[s] = saved[s];
}

export class PoseStudio {
  constructor(root, viewport, { suitView, onFreeze }) {
    this.root = root; this.viewport = viewport; this.suitView = suitView; this.onFreeze = onFreeze;
    this.isOpen = false;
    this.state = 'hover';
    this.part = 'RightArm';
    this.flat = true;
    this.orbit = { yaw: 0.6, pitch: 0.15, dist: 3.4, panX: 0, panY: 0 };
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'pose-overlay';
    this.overlay.hidden = true;
    viewport.appendChild(this.overlay);
    this.ctx = this.overlay.getContext('2d');
    this.dots = [];
    this.build();
    this.bindView();
  }

  get poser() { return this.suitView.poser; }
  get pose() { return POSES[this.state]; }

  build() {
    const r = this.root;
    r.innerHTML = `
      <header class="studio-head"><h2>Pose studio</h2><button class="icon-btn" data-act="close" aria-label="Close pose studio">✕</button></header>
      <div class="studio-tabs pose-tabs" role="group" aria-label="Pose to edit">
        ${STATES.map((s) => `<button class="studio-tab" data-state="${s}">${LABELS[s] ?? s}</button>`).join('')}
      </div>
      <label class="studio-check"><input type="checkbox" data-act="flat" checked> Lie flat for flight poses</label>
      <p class="studio-hint">Drag a dot to move that limb · drag empty space to orbit · scroll to zoom · right-drag to slide the view</p>
      <label class="studio-field pose-select"><span>Body part</span>
        <select data-act="part">${PARTS.map(([g, list]) => `<optgroup label="${g}">${list.map(([b, l]) => `<option value="${b}">${l}</option>`).join('')}</optgroup>`).join('')}</select>
      </label>
      <section class="pose-timeline" data-timeline hidden>
        <h3>Launch timeline</h3>
        <label class="studio-check"><input type="checkbox" data-act="tl-on" checked> Play the launch sequence (untick to edit the pose)</label>
        <div class="tl-row"><button class="btn primary" data-act="tl-play">Play</button><output data-tl-label></output></div>
        <input type="range" class="tl-scrub" min="0" max="3" step="0.01" value="0" data-act="tl-scrub" aria-label="Time in the launch">
        <div class="studio-fields" data-tl-fields></div>
      </section>
      <div class="studio-fields" data-part-fields></div>
      <div class="studio-actions"><button class="btn ghost" data-act="reset-part">Reset part</button></div>
      <details class="pose-hands"><summary>Left hand</summary><div class="studio-fields" data-hand="Left"></div></details>
      <details class="pose-hands"><summary>Right hand</summary><div class="studio-fields" data-hand="Right"></div></details>
      <div class="studio-actions">
        <button class="btn ghost" data-act="reset">Reset pose</button>
        <button class="btn primary" data-act="copy">Copy poses</button>
      </div>
      <textarea class="studio-copy" readonly hidden aria-label="Poses to paste"></textarea>`;
    r.hidden = true;
    r.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    r.querySelectorAll('[data-state]').forEach((el) => el.addEventListener('click', () => { this.state = el.dataset.state; this.refresh(); }));
    r.querySelector('[data-act="flat"]').addEventListener('change', (e) => { this.flat = e.target.checked; });
    this.partEl = r.querySelector('[data-act="part"]');
    this.partEl.addEventListener('change', () => { this.part = this.partEl.value; this.refresh(); });
    r.querySelector('[data-act="reset-part"]').addEventListener('click', () => {
      const d = DEFAULTS[this.state][this.part];
      if (d) this.pose[this.part] = JSON.parse(JSON.stringify(d)); else delete this.pose[this.part];
      this.changed();
    });
    r.querySelector('[data-act="reset"]').addEventListener('click', () => { POSES[this.state] = JSON.parse(JSON.stringify(DEFAULTS[this.state])); this.changed(); });
    r.querySelector('[data-act="copy"]').addEventListener('click', () => this.copy());
    this.copyEl = r.querySelector('.studio-copy');
    // launch timeline
    this.tl = { t: 0, playing: false, on: true, last: 0 };
    this.tlBox = r.querySelector('[data-timeline]');
    this.tlLabel = r.querySelector('[data-tl-label]');
    this.tlScrub = r.querySelector('[data-act="tl-scrub"]');
    this.tlPlay = r.querySelector('[data-act="tl-play"]');
    r.querySelector('[data-act="tl-on"]').addEventListener('change', (e) => { this.tl.on = e.target.checked; if (!this.tl.on) this.setPlaying(false); });
    this.tlPlay.addEventListener('click', () => { if (this.tl.t >= this.tlEnd() - 0.01) this.tl.t = 0; this.setPlaying(!this.tl.playing); });
    this.tlScrub.addEventListener('input', () => { this.setPlaying(false); this.tl.t = +this.tlScrub.value; });
    const tf = r.querySelector('[data-tl-fields]');
    const seqSlider = (key, label, min, max, step, unit) => {
      const el = document.createElement('label');
      el.className = 'studio-field';
      el.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const inp = el.querySelector('input'), out = el.querySelector('output');
      const show = () => { inp.value = CONFIG.launch.seq[key]; out.textContent = `${(+CONFIG.launch.seq[key]).toFixed(2)}${unit}`; };
      inp.addEventListener('input', () => {
        const q = CONFIG.launch.seq;
        q[key] = +inp.value;
        if (q.fireAt < q.jumpAt + 0.05) { if (key === 'fireAt') q.jumpAt = Math.max(0, q.fireAt - 0.05); else q.fireAt = q.jumpAt + 0.05; }
        storage.set('launchSeq', q);
        this.tlFields.forEach((f) => f());
      });
      tf.appendChild(el);
      return show;
    };
    this.tlFields = [
      seqSlider('jumpAt', 'Jump at (crouch until then)', 0, 1.5, 0.01, ' s'),
      seqSlider('fireAt', 'Thrusters fire at (the launch point)', 0.05, 2, 0.01, ' s'),
      seqSlider('jumpSpeed', 'Jump strength', 0, 14, 0.5, ' m/s'),
      seqSlider('jumpAngleDeg', 'Jump angle (0 = flat forward, 90 = straight up)', 0, 90, 1, '°'),
      seqSlider('airFireAt', 'In the air: fire at', 0, 0.6, 0.01, ' s'),
    ];
  }

  slider(key, label, min, max, value, onInput) {
    const el = document.createElement('label');
    el.className = 'studio-field';
    el.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="1"><output></output>`;
    const inp = el.querySelector('input'), out = el.querySelector('output');
    inp.value = value; out.textContent = `${Math.round(value)}°`;
    inp.addEventListener('input', () => { out.textContent = `${inp.value}°`; onInput(+inp.value); });
    return el;
  }

  entry(bone) { return (this.pose[bone] ??= {}); }

  refresh() {
    if (this.tlBox) { this.tlBox.hidden = this.state !== 'launch'; this.tlFields.forEach((f) => f()); }
    this.root.querySelectorAll('[data-state]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.state === this.state)));
    this.partEl.value = this.part;
    if (this.poser) this.poser.preview = this.state;
    // the chosen part: tilt and twist on top of where it points
    const box = this.root.querySelector('[data-part-fields]');
    box.innerHTML = '';
    const e = this.pose[this.part] ?? {};
    for (const [k, label, i] of ROT) {
      box.appendChild(this.slider(k, label, -180, 180, e.rot?.[i] ?? 0, (v) => {
        const en = this.entry(this.part); en.rot ??= [0, 0, 0]; en.rot[i] = v; this.changed(false);
      }));
    }
    box.appendChild(this.slider('twist', 'Twist', -180, 180, e.twist ?? 0, (v) => { this.entry(this.part).twist = v; this.changed(false); }));
    if (e.aim) {
      const b = document.createElement('button');
      b.className = 'btn ghost'; b.textContent = 'Clear dragged direction';
      b.addEventListener('click', () => { delete this.entry(this.part).aim; this.changed(); });
      box.appendChild(b);
    }
    // hands
    for (const side of ['Left', 'Right']) {
      const hb = this.root.querySelector(`[data-hand="${side}"]`);
      hb.innerHTML = '';
      const h = this.pose.hands?.[side] ?? {};
      const curl = Array.isArray(h.curl) ? h.curl : [h.curl ?? 0, h.curl ?? 0, h.curl ?? 0, h.curl ?? 0];
      for (const [k, label] of FINGERS) {
        const val = k === 'curl' ? curl.reduce((a, b) => a + b, 0) / 4 : k === 'thumb' ? h.thumb ?? 0 : curl[+k[1]];
        hb.appendChild(this.slider(k, `${label} (+ curl, − open)`, -60, 100, val, (v) => {
          this.pose.hands ??= {}; const hh = (this.pose.hands[side] ??= {});
          const c = Array.isArray(hh.curl) ? hh.curl : [hh.curl ?? 0, hh.curl ?? 0, hh.curl ?? 0, hh.curl ?? 0];
          if (k === 'curl') hh.curl = v;
          else if (k === 'thumb') hh.thumb = v;
          else { c[+k[1]] = v; hh.curl = c; }
          this.changed(k === 'curl');
        }));
      }
    }
  }

  changed(redraw = true) {
    storage.set('suitPoses', POSES);
    if (redraw) this.refresh();
  }

  open() {
    this.isOpen = true;
    this.faceFront = true;   // start looking at the suit's front three-quarter
    this.root.hidden = false;
    this.overlay.hidden = false;
    this.suitView.hideFlames = true;
    document.body.classList.add('posing');
    this.onFreeze(true);
    this.refresh();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    this.overlay.hidden = true;
    this.copyEl.hidden = true;
    if (this.poser) { this.poser.preview = null; this.poser.previewLaunch = null; }
    this.setPlaying(false);
    this.suitView.viewQuat = null;
    this.suitView.hideFlames = false;
    document.body.classList.remove('posing');
    this.onFreeze(false);
    document.activeElement?.blur();
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  // Each frame while open: turn the suit to show the pose, place the camera, draw the joint dots
  update(game, camera) {
    if (!this.isOpen) return;
    this.updateTimeline();
    this.camera = camera;
    if (this.poser && this.poser.preview !== this.state) this.poser.preview = this.state;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), game.controller.heading ?? 0);
    const flatNow = this.flat && (this.state === 'flight' || this.state === 'boost');
    this.suitView.viewQuat = flatNow ? yawQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)) : yawQ;
    // orbit camera round the suit
    if (this.faceFront) { this.orbit.yaw = (game.controller.heading ?? 0) + Math.PI - 0.55; this.faceFront = false; }
    const o = this.orbit, c = game.body.pos;
    const fwd = new THREE.Vector3(Math.cos(o.pitch) * Math.sin(o.yaw), Math.sin(o.pitch), Math.cos(o.pitch) * Math.cos(o.yaw));
    const target = c.clone();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    target.addScaledVector(right, o.panX).y += o.panY;
    camera.position.copy(target).addScaledVector(fwd, o.dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix(); }
    this.drawDots(camera);
  }

  drawDots(camera) {
    const cv = this.overlay, vp = this.viewport;
    const w = vp.clientWidth, h = vp.clientHeight, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this.poser) return;
    this.suitView.root.updateMatrixWorld(true);
    const R = this.poser.byName;
    const scr = (bone) => {
      const p = bone.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, z: p.z };
    };
    this.dots = [];
    ctx.lineWidth = 2;
    for (const [bone, end] of Object.entries(DRAG)) {
      if (!R[bone] || !R[end]) continue;
      const a = scr(R[bone].bone), b = scr(R[end].bone);
      const sel = bone === this.part;
      ctx.strokeStyle = sel ? 'rgba(255,170,60,0.95)' : 'rgba(120,220,255,0.55)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = sel ? '#ffaa3c' : '#78dcff';
      ctx.beginPath(); ctx.arc(b.x, b.y, sel ? 7 : 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 2;
      this.dots.push({ bone, x: b.x, y: b.y });
    }
    if (this.dragLabel) {
      ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = '#fff';
      ctx.fillText(this.dragLabel, 12, h - 16);
    }
  }

  // Mouse on the view: drag a dot to aim that limb, drag elsewhere to orbit
  bindView() {
    const cv = this.overlay;
    let drag = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const hit = this.dots.reduce((best, d) => { const dd = Math.hypot(d.x - x, d.y - y); return dd < 16 && (!best || dd < best.dd) ? { ...d, dd } : best; }, null);
      if (hit && e.button === 0) {
        this.part = hit.bone; this.refresh();
        drag = { kind: 'limb', bone: hit.bone };
        this.dragLabel = PART_NAME[hit.bone];
      } else drag = { kind: e.button === 2 || e.shiftKey ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (drag.kind === 'limb') return this.dragLimb(drag.bone, e);
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const o = this.orbit;
      if (drag.kind === 'orbit') { o.yaw -= dx * 0.01; o.pitch = Math.max(-1.4, Math.min(1.4, o.pitch + dy * 0.01)); }
      else { o.panX -= dx * 0.004 * o.dist / 3; o.panY += dy * 0.004 * o.dist / 3; }
    });
    const end = () => { if (drag?.kind === 'limb') { this.dragLabel = null; this.changed(); } drag = null; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.orbit.dist = Math.max(1.2, Math.min(12, this.orbit.dist * (1 + Math.sign(e.deltaY) * 0.08))); }, { passive: false });
  }

  dragLimb(boneName, e) {
    const cam = this.camera;
    const b = this.poser?.byName[boneName];
    if (!cam || !b) return;
    const rect = this.overlay.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
    const head = b.bone.getWorldPosition(new THREE.Vector3());
    const end = this.poser.byName[DRAG[boneName]].bone.getWorldPosition(new THREE.Vector3());
    // keep the limb's depth: move its end within the plane facing the camera through the end joint
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cam.getWorldDirection(new THREE.Vector3()), end);
    const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!p) return;
    const dir = p.sub(head).normalize().applyQuaternion(this.suitView.root.getWorldQuaternion(new THREE.Quaternion()).invert());
    const en = this.entry(boneName);
    en.aim = [r2(dir.x), r2(dir.y), r2(dir.z)];
    if (en.rot) { en.rot[0] = 0; en.rot[2] = 0; }   // the drag sets where it points
    storage.set('suitPoses', POSES);
  }

  // Launch timeline: how long it runs, play/pause, and the label for where you are in it
  tlEnd() { return CONFIG.launch.seq.fireAt + CONFIG.launch.time + 0.4; }
  setPlaying(on) {
    if (!this.tl) return;
    this.tl.playing = on; this.tl.last = performance.now();
    if (this.tlPlay) this.tlPlay.textContent = on ? 'Pause' : 'Play';
  }
  updateTimeline() {
    const p = this.poser;
    if (!p) return;
    const active = this.state === 'launch' && this.tl.on;
    p.previewLaunch = active ? this.tl.t : null;
    if (!active) return;
    const now = performance.now();
    if (this.tl.playing) {
      this.tl.t += Math.min(0.1, (now - this.tl.last) / 1000);
      if (this.tl.t > this.tlEnd()) this.tl.t = 0;   // loop
    }
    this.tl.last = now;
    const q = CONFIG.launch.seq, t = this.tl.t;
    this.tlScrub.max = this.tlEnd().toFixed(2);
    this.tlScrub.value = t;
    const phase = t < q.jumpAt ? 'Wind-up (crouch)' : t < q.fireAt ? 'Jump' : t < q.fireAt + CONFIG.launch.time - 0.5 ? 'Launch: thrusters firing' : 'Into flight';
    this.tlLabel.textContent = `${t.toFixed(2)} s · ${phase}`;
  }

  copy() {
    const fmt = (v) => JSON.stringify(v).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ').replace(/\{/g, '{ ').replace(/\}/g, ' }');
    const text = `export const POSES = {\n${STATES.map((s) => `  ${s}: {\n${Object.entries(POSES[s]).map(([k, v]) => `    ${k}: ${fmt(v)},`).join('\n')}\n  },`).join('\n')}\n};`;
    const q = CONFIG.launch.seq;
    this.copyEl.value = `${text}

Launch sequence (config.js launch.seq):
    seq: { jumpAt: ${q.jumpAt}, fireAt: ${q.fireAt}, jumpSpeed: ${q.jumpSpeed}, jumpAngleDeg: ${q.jumpAngleDeg}, airFireAt: ${q.airFireAt} },`;
    this.copyEl.hidden = false;
    this.copyEl.select();
    try { navigator.clipboard.writeText(this.copyEl.value); } catch { /* the text is selected to copy by hand */ }
    const btn = this.root.querySelector('[data-act="copy"]');
    btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy poses'; }, 1500);
  }
}
