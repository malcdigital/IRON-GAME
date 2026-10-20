import * as THREE from '../lib/three.js';

// Glowing thrust streaks: each nozzle leaves a ribbon of light behind it, like the long
// exhaust trails in the key art. Each frame the nozzle drops a point; points drift away along
// the exhaust and fade out. In fast flight the suit outruns its points, so the ribbon stretches
// into a long streak; in hover the points fall away below it as a short jet.
// The ribbon always turns its flat side to the camera, is bright in the middle, soft at the
// edges, and thins out toward the tail.

const VERT = `
  attribute float aT;   // 0 at the nozzle, 1 at the tail
  attribute float aV;   // -1..1 across the ribbon
  attribute float aI;   // brightness of this point
  varying float vT; varying float vV; varying float vI;
  void main() { vT = aT; vV = aV; vI = aI; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
  uniform vec3 core; uniform vec3 edge; uniform float opacity;
  varying float vT; varying float vV; varying float vI;
  void main() {
    float across = 1.0 - vV * vV;                        // soft edges
    float along = pow(1.0 - vT, 1.6);                    // fades toward the tail
    vec3 c = mix(edge, core, smoothstep(0.35, 1.0, across) * (1.0 - vT * 0.7));
    gl_FragColor = vec4(c * across * along * vI * opacity, 1.0);
  }`;

export class ThrustTrail {
  constructor(scene, { core, edge, max = 48 }) {
    this.max = max;
    this.pts = [];   // { p, v, age, life, w, i }
    const n = max * 2;
    this.pos = new Float32Array(n * 3);
    this.aT = new Float32Array(n);
    this.aV = new Float32Array(n);
    this.aI = new Float32Array(n);
    for (let i = 0; i < max; i++) { this.aV[i * 2] = -1; this.aV[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aT', new THREE.BufferAttribute(this.aT, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aV', new THREE.BufferAttribute(this.aV, 1));
    geo.setAttribute('aI', new THREE.BufferAttribute(this.aI, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { core: { value: new THREE.Color(core) }, edge: { value: new THREE.Color(edge) }, opacity: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this._s = new THREE.Vector3(); this._t = new THREE.Vector3(); this._c = new THREE.Vector3();
  }

  setColors(core, edge) { this.mat.uniforms.core.value.setHex(core); this.mat.uniforms.edge.value.setHex(edge); }

  // Drop a new point at the nozzle (world position), moving at vel, lasting life seconds
  emit(pos, vel, life, width, intensity) {
    let pt;
    if (this.pts.length >= this.max) pt = this.pts.pop();
    else pt = { p: new THREE.Vector3(), v: new THREE.Vector3() };
    pt.p.copy(pos); pt.v.copy(vel); pt.age = 0; pt.life = life; pt.w = width; pt.i = intensity;
    this.pts.unshift(pt);
  }

  // Age and move the points, then rebuild the ribbon facing the camera
  update(dt, camPos) {
    for (const pt of this.pts) { pt.age += dt; pt.p.addScaledVector(pt.v, dt); }
    while (this.pts.length && this.pts[this.pts.length - 1].age >= this.pts[this.pts.length - 1].life) this.pts.pop();
    const n = this.pts.length;
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    const { pos, aT, aI } = this;
    for (let i = 0; i < this.max; i++) {
      const pt = this.pts[Math.min(i, n - 1)];
      const prev = this.pts[Math.max(0, Math.min(i, n - 1) - 1)], next = this.pts[Math.min(n - 1, i + 1)];
      // direction along the ribbon, and across it (facing the camera)
      this._t.subVectors(next.p, prev.p);
      if (this._t.lengthSq() < 1e-8) this._t.set(0, 1, 0);
      this._c.subVectors(camPos, pt.p);
      this._s.crossVectors(this._t, this._c);
      const l = this._s.length();
      if (l < 1e-6) this._s.set(1, 0, 0); else this._s.multiplyScalar(1 / l);
      const t = Math.min(1, pt.age / pt.life);
      const w = pt.w * (1 - t * 0.6) * (i >= n ? 0 : 1);    // thins toward the tail; unused slots collapse
      const k = i * 6;
      pos[k] = pt.p.x - this._s.x * w; pos[k + 1] = pt.p.y - this._s.y * w; pos[k + 2] = pt.p.z - this._s.z * w;
      pos[k + 3] = pt.p.x + this._s.x * w; pos[k + 4] = pt.p.y + this._s.y * w; pos[k + 5] = pt.p.z + this._s.z * w;
      aT[i * 2] = aT[i * 2 + 1] = i >= n ? 1 : t;
      aI[i * 2] = aI[i * 2 + 1] = i >= n ? 0 : pt.i;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aT.needsUpdate = true; g.attributes.aI.needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
