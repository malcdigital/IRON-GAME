import { CONFIG } from '../core/config.js';
import { storage } from '../core/storage.js';
import { SHOT_KEYS } from '../render/CameraRig.js';

// Camera Studio: tune the camera shot for each state (hover, flight, boost) while you play.
// Drag on the view to orbit, scroll to zoom, Shift+drag (or right-drag) to shift the framing.
// Changes are saved in this browser; "Copy settings" gives text to paste into config.js.

const SHOTS = [['hover', 'Hover'], ['flight', 'Flight'], ['boost', 'Boost'], ['charge', 'Charge']];
const FIELDS = {
  distance:  { label: 'Distance', min: 2, max: 30, step: 0.1, unit: ' m' },
  orbit:     { label: 'Orbit round you', min: -180, max: 180, step: 1, unit: '°' },
  height:    { label: 'Height angle', min: -30, max: 80, step: 1, unit: '°' },
  shoulder:  { label: 'Over the shoulder', min: -5, max: 5, step: 0.1, unit: ' m' },
  lookUp:    { label: 'Aim height', min: -3, max: 5, step: 0.1, unit: ' m' },
  lookAhead: { label: 'Aim ahead', min: 0, max: 40, step: 0.5, unit: ' m' },
  fov:       { label: 'Field of view', min: 30, max: 120, step: 1, unit: '°' },
  bank:      { label: 'Horizon lean', min: 0, max: 1, step: 0.05, unit: '' },
  lag:       { label: 'Follow tightness', min: 1, max: 20, step: 0.5, unit: '' },
  shake:     { label: 'Shake at speed', min: 0, max: 0.3, step: 0.01, unit: ' m' },
};
const DEFAULTS = JSON.parse(JSON.stringify(CONFIG.camera.shots));

// Saved tuning from earlier sessions replaces the defaults
export function loadSavedShots() {
  const saved = storage.get('cameraShots');
  if (!saved) return;
  for (const [name] of SHOTS) {
    if (!saved[name]) continue;
    for (const k of SHOT_KEYS) if (typeof saved[name][k] === 'number') CONFIG.camera.shots[name][k] = saved[name][k];
  }
}

const round = (v, step) => +(Math.round(v / step) * step).toFixed(3);
const clampTo = (v, f) => Math.min(f.max, Math.max(f.min, v));

export class CameraStudio {
  constructor(root, viewport, { onFreeze }) {
    this.root = root;
    this.viewport = viewport;
    this.onFreeze = onFreeze;
    this.isOpen = false;
    this.tab = null;          // null = follow what you're doing
    this.cam = null;
    this.inputs = {};
    this.build();
    this.bindDrag();
  }

  build() {
    const r = this.root;
    r.innerHTML = `
      <header class="studio-head">
        <h2>Camera studio</h2>
        <button class="icon-btn" data-act="close" aria-label="Close camera studio">✕</button>
      </header>
      <div class="studio-tabs" role="group" aria-label="Shot to edit">
        ${SHOTS.map(([k, l]) => `<button class="studio-tab" data-shot="${k}">${l}</button>`).join('')}
      </div>
      <p class="studio-live">Showing: <b data-live>Hover</b></p>
      <label class="studio-check"><input type="checkbox" data-act="lock"> Show this shot now (whatever you're doing)</label>
      <label class="studio-check"><input type="checkbox" data-act="freeze"> Freeze the game</label>
      <p class="studio-hint">Drag on the view to orbit · scroll to zoom · Shift+drag or right-drag to shift the framing</p>
      <div class="studio-fields">
        ${SHOT_KEYS.map((k) => { const f = FIELDS[k]; return `
          <label class="studio-field">
            <span>${f.label}</span>
            <input type="range" min="${f.min}" max="${f.max}" step="${f.step}" data-key="${k}">
            <output data-out="${k}"></output>
          </label>`; }).join('')}
      </div>
      <div class="studio-actions">
        <button class="btn ghost" data-act="reset">Reset shot</button>
        <button class="btn primary" data-act="copy">Copy settings</button>
      </div>
      <textarea class="studio-copy" readonly hidden aria-label="Camera settings to paste"></textarea>`;
    r.hidden = true;
    r.querySelectorAll('input[type="range"]').forEach((el) => {
      this.inputs[el.dataset.key] = el;
      el.addEventListener('input', () => this.set(el.dataset.key, +el.value));
    });
    r.querySelectorAll('.studio-tab').forEach((el) => el.addEventListener('click', () => { this.tab = el.dataset.shot; this.refresh(); }));
    r.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
    r.querySelector('[data-act="reset"]').addEventListener('click', () => {
      Object.assign(CONFIG.camera.shots[this.editing], DEFAULTS[this.editing]);
      this.save();
      this.refresh();
    });
    r.querySelector('[data-act="copy"]').addEventListener('click', () => this.copy());
    this.lockEl = r.querySelector('[data-act="lock"]');
    this.lockEl.addEventListener('change', () => this.applyLock());
    this.freezeEl = r.querySelector('[data-act="freeze"]');
    this.freezeEl.addEventListener('change', () => this.onFreeze(this.freezeEl.checked));
    this.liveEl = r.querySelector('[data-live]');
    this.copyEl = r.querySelector('.studio-copy');
  }

  // The shot being edited: the tab you picked, or the one in use right now
  get editing() { return this.tab ?? this.cam?.shotName ?? 'hover'; }

  open(cam) {
    this.cam = cam;
    this.isOpen = true;
    this.root.hidden = false;
    this.refresh();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    this.tab = null;
    this.lockEl.checked = false;
    this.applyLock();
    if (this.freezeEl.checked) { this.freezeEl.checked = false; this.onFreeze(false); }
    this.copyEl.hidden = true;
    document.activeElement?.blur();
  }

  toggle(cam) { if (this.isOpen) this.close(); else this.open(cam); }

  applyLock() { if (this.cam) this.cam.lockShot = this.lockEl.checked ? this.editing : null; }

  set(key, value) {
    CONFIG.camera.shots[this.editing][key] = round(clampTo(value, FIELDS[key]), FIELDS[key].step);
    this.save();
    this.refreshValues();
  }

  save() { storage.set('cameraShots', CONFIG.camera.shots); }

  refresh() {
    this.root.querySelectorAll('.studio-tab').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.shot === this.editing)));
    this.applyLock();
    this.refreshValues();
  }

  refreshValues() {
    const shot = CONFIG.camera.shots[this.editing];
    for (const k of SHOT_KEYS) {
      this.inputs[k].value = shot[k];
      this.root.querySelector(`[data-out="${k}"]`).textContent = `${shot[k]}${FIELDS[k].unit}`;
    }
  }

  // Called every frame while open: keep the "showing" label and the auto tab current
  update() {
    if (!this.isOpen || !this.cam) return;
    const live = this.cam.shotName;
    const label = SHOTS.find(([k]) => k === live)?.[1] ?? live;
    if (this.liveEl.textContent !== label) {
      this.liveEl.textContent = label;
      if (this.tab == null) this.refresh();
    }
  }

  copy() {
    const shots = CONFIG.camera.shots;
    const line = (k) => `      ${(k + ':').padEnd(7)} { ${SHOT_KEYS.map((f) => `${f}: ${shots[k][f]}`).join(', ')} },`;
    const text = `Camera shots:\n    shots: {\n${SHOTS.map(([k]) => line(k)).join('\n')}\n    },`;
    this.copyEl.value = text;
    this.copyEl.hidden = false;
    this.copyEl.select();
    const done = () => { this.root.querySelector('[data-act="copy"]').textContent = 'Copied'; setTimeout(() => { this.root.querySelector('[data-act="copy"]').textContent = 'Copy settings'; }, 1500); };
    try {
      navigator.clipboard.writeText(text).then(done, () => document.execCommand?.('copy') && done());
    } catch { try { if (document.execCommand('copy')) done(); } catch { /* select the text by hand */ } }
  }

  // Mouse on the 3D view: drag to orbit, Shift/right-drag to shift the framing, wheel to zoom
  bindDrag() {
    const vp = this.viewport;
    let drag = null;
    vp.addEventListener('contextmenu', (e) => { if (this.isOpen) e.preventDefault(); });
    vp.addEventListener('pointerdown', (e) => {
      if (!this.isOpen) return;
      drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 };
      vp.setPointerCapture(e.pointerId);
    });
    vp.addEventListener('pointermove', (e) => {
      if (!drag || !this.isOpen) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const s = CONFIG.camera.shots[this.editing];
      if (drag.pan) {
        this.set('shoulder', s.shoulder + dx * 0.02);
        this.set('lookUp', s.lookUp - dy * 0.01);
      } else {
        let orbit = s.orbit - dx * 0.4;
        if (orbit > 180) orbit -= 360;
        if (orbit < -180) orbit += 360;
        this.set('orbit', orbit);
        this.set('height', s.height + dy * 0.3);
      }
    });
    const end = () => { drag = null; };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);
    vp.addEventListener('wheel', (e) => {
      if (!this.isOpen) return;
      e.preventDefault();
      const s = CONFIG.camera.shots[this.editing];
      this.set('distance', s.distance * (1 + Math.sign(e.deltaY) * 0.08));
    }, { passive: false });
  }
}
