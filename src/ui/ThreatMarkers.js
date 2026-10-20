import * as THREE from '../lib/three.js';

const MAX = 4;
const _p = new THREE.Vector3();
const _toM = new THREE.Vector3();
const _fwd = new THREE.Vector3();

// Shows where incoming missiles are: a bracket when on screen, an edge arrow when not.
export class ThreatMarkers {
  constructor(hudEl) {
    this.layer = document.createElement('div');
    this.layer.className = 'threats';
    hudEl.appendChild(this.layer);
    this.els = Array.from({ length: MAX }, () => {
      const el = document.createElement('div');
      el.className = 'threat';
      el.innerHTML = '<i></i><span></span>';
      el.hidden = true;
      this.layer.appendChild(el);
      return { el, icon: el.querySelector('i'), label: el.querySelector('span') };
    });
  }

  update(camera, missiles, playerPos) {
    const w = this.layer.clientWidth, h = this.layer.clientHeight;
    camera.getWorldDirection(_fwd);
    const list = missiles.filter((m) => m.alive && m.target === 'player').slice(0, MAX);
    this.els.forEach((e, i) => {
      const m = list[i];
      e.el.hidden = !m;
      if (!m) return;
      const behind = _toM.subVectors(m.pos, camera.position).dot(_fwd) < 0;
      _p.copy(m.pos).project(camera);
      let x = _p.x, y = _p.y;
      const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88;
      if (!onScreen) {
        if (behind) { x = -x; y = -y; }
        const len = Math.hypot(x, y) || 1;
        // Push to an ellipse near the screen edge
        x = (x / len) * 0.6;
        y = (y / len) * 0.55;
      }
      const px = (x * 0.5 + 0.5) * w, py = (-y * 0.5 + 0.5) * h;
      e.el.style.transform = `translate(${px}px, ${py}px)`;
      e.el.classList.toggle('edge', !onScreen);
      e.icon.style.transform = onScreen ? '' : `rotate(${Math.atan2(-y, x)}rad)`;
      e.label.textContent = `${Math.round(m.pos.distanceTo(playerPos))} m`;
    });
  }
}
