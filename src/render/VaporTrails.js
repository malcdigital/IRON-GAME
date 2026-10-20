import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

const N = 36;

// White vapor streaming off the hands when the suit is gripping the air hard (carving).
export class VaporTrails {
  constructor(scene) {
    this.trails = ['handL', 'handR'].map((mount) => {
      const pts = Array.from({ length: N }, () => new THREE.Vector3());
      const pos = new Float32Array(N * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0, depthWrite: false });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      scene.add(line);
      return { local: new THREE.Vector3(...CONFIG.mounts[mount].pos), pts, pos, line, mat, primed: false };
    });
    this.timer = 0;
    this.strength = 0;
    this._p = new THREE.Vector3();
  }

  update(game, dt) {
    const jet = game.controller.jet;
    const speed = game.body.vel.length();
    const want = game.controller.flying ? THREE.MathUtils.smoothstep(jet.spread, 1.4, 2.6) * THREE.MathUtils.smoothstep(speed, 20, 40) : 0;
    this.strength += (want - this.strength) * Math.min(1, 5 * dt);
    this.timer -= dt;
    const sample = this.timer <= 0;
    if (sample) this.timer = 0.025;

    for (const t of this.trails) {
      game.body.pointToWorld(t.local, this._p);
      if (!t.primed || this.strength < 0.02) { t.pts.forEach((p) => p.copy(this._p)); t.primed = true; }
      else if (sample) { const last = t.pts.pop(); t.pts.unshift(last.copy(this._p)); }
      else t.pts[0].copy(this._p);
      t.pts.forEach((p, i) => { t.pos[i * 3] = p.x; t.pos[i * 3 + 1] = p.y; t.pos[i * 3 + 2] = p.z; });
      t.line.geometry.attributes.position.needsUpdate = true;
      t.mat.opacity = this.strength * 0.7;
      t.line.visible = this.strength > 0.02;
    }
  }
}
