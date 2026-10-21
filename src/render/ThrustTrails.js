import * as THREE from '../lib/three.js';

// Glowing thrust streaks: each nozzle leaves a ribbon of light behind it.
// Each frame the nozzle drops points (several between frames when it's moving fast, so the
// streak is continuous); the points drift away along the exhaust and fade out. The ribbon is
// drawn through them on a smooth curve, always turns its flat side to the camera, and is shaded
// like a jet of fire: a white-hot filament down the middle, colour cooling toward the tail,
// turbulent streaks flowing along it, and edges that break up into wisps as it dies away.

const VERT = `
  attribute float aT;   // 0 at the nozzle, 1 at the tail
  attribute float aV;   // -1..1 across the ribbon
  attribute float aI;   // brightness of this point
  attribute float aU;   // metres along the streak from the nozzle
  varying float vT; varying float vV; varying float vI; varying float vU;
  void main() { vT = aT; vV = aV; vI = aI; vU = aU; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
  #define GLOW 2.2
  uniform vec3 core; uniform vec3 edge; uniform float opacity; uniform float time; uniform float seed;
  varying float vT; varying float vV; varying float vI; varying float vU;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return 0.5 * n(p) + 0.27 * n(p * 2.3 + 7.1) + 0.15 * n(p * 5.1 + 3.7) + 0.08 * n(p * 11.3 + 1.9); }
  void main() {
    // the ribbon is drawn GLOW times wider than the jet: the outside is a soft glow around it
    float a = abs(vV) * GLOW;
    float halo = exp(-abs(vV) * abs(vV) * 7.0) * 0.22 * (1.0 - vT);
    // turbulence flowing back along the jet: streaky (stretched along it)
    vec2 q = vec2(vU * 7.0 - time * 14.0, vV * 2.2 + seed);
    // curling turbulence: the noise is pushed around by more noise
    vec2 warp = vec2(fbm(q * 0.8 + vec2(time * 2.0, 0.0)), fbm(q * 0.8 + vec2(5.2, -time * 2.0)));
    float turb = fbm(q + warp * 1.6);
    float streak = fbm(vec2(vU * 2.5 - time * 9.0, vV * 6.0 + seed * 1.7) + warp * 0.8);
    // the edge wanders with the turbulence and frays toward the tail
    float width = 1.0 - 0.35 * vT * (turb - 0.2);
    float body = 1.0 - smoothstep(0.55 * width, 1.0 * width, a);
    float fray = smoothstep(vT * 0.85 - 0.1, vT * 0.85 + 0.25, turb + 0.15);
    // white-hot filament down the middle, strongest near the nozzle
    float fil = exp(-a * a * 18.0) * (1.0 - smoothstep(0.0, 0.7, vT));
    // colour: core -> edge colour -> dull red as it cools
    vec3 c = mix(core, edge, smoothstep(0.0, 0.55, vT + a * 0.35));
    c = mix(c, edge * vec3(0.7, 0.25, 0.12), smoothstep(0.5, 1.0, vT));
    c += core * fil * 1.4;
    c *= 0.75 + 0.5 * streak;
    float along = pow(1.0 - vT, 1.3);
    vec3 glow = edge * halo * (0.6 + 0.4 * turb);
    gl_FragColor = vec4((c * body * fray + glow) * along * vI * opacity, 1.0);
  }`;

const SUB = 8;   // smooth-curve samples per stretch between two points
const GLOW = 2.2;   // the ribbon is this much wider than the jet itself (the rest is soft glow)

export class ThrustTrail {
  constructor(scene, { core, edge, max = 48 }) {
    this.max = max;
    this.maxLen = Infinity;   // longest the streak may be (m): trimmed beyond it
    this.spacing = 0.015;     // at most this far between points (m): fills the gaps when moving fast
    this.pts = [];   // { p, v, age, life, w, i, d }
    this.prevNozzle = null;
    const verts = (max - 1) * SUB + 1, n = verts * 2;
    this.verts = verts;
    this.pos = new Float32Array(n * 3);
    this.aT = new Float32Array(n);
    this.aV = new Float32Array(n);
    this.aI = new Float32Array(n);
    this.aU = new Float32Array(n);
    for (let i = 0; i < verts; i++) { this.aV[i * 2] = -1; this.aV[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < verts - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aT', new THREE.BufferAttribute(this.aT, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aV', new THREE.BufferAttribute(this.aV, 1));
    geo.setAttribute('aI', new THREE.BufferAttribute(this.aI, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aU', new THREE.BufferAttribute(this.aU, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { core: { value: new THREE.Color(core) }, edge: { value: new THREE.Color(edge) }, opacity: { value: 1 }, time: { value: 0 }, seed: { value: Math.random() * 50 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this._s = new THREE.Vector3(); this._t = new THREE.Vector3(); this._c = new THREE.Vector3(); this._p = new THREE.Vector3();
    this.samples = Array.from({ length: verts }, () => ({ p: new THREE.Vector3(), t: 0, w: 0, i: 0, u: 0 }));
  }

  setColors(core, edge) { this.mat.uniforms.core.value.setHex(core); this.mat.uniforms.edge.value.setHex(edge); }

  // Drop points at the nozzle (world position), moving at vel, lasting life seconds. If the nozzle
  // moved a long way since last frame (dt s ago), points are filled in along the way.
  emit(pos, vel, life, width, intensity, dt = 0) {
    const prev = this.prevNozzle;
    let steps = 1;
    if (prev && dt > 0) steps = Math.min(40, Math.max(1, Math.ceil(prev.distanceTo(pos) / this.spacing)));
    for (let k = steps - 1; k >= 0; k--) {
      const f = k / steps;   // (0 = now, toward 1 = back along the way it came)
      let pt;
      if (this.pts.length >= this.max) pt = this.pts.pop();
      else pt = { p: new THREE.Vector3(), v: new THREE.Vector3() };
      pt.p.copy(pos);
      if (prev && k > 0) pt.p.lerp(prev, f).addScaledVector(vel, f * dt);   // (that much older: it has drifted)
      pt.v.copy(vel); pt.age = f * dt; pt.life = life; pt.w = width; pt.i = intensity;
      this.pts.unshift(pt);
    }
    (this.prevNozzle ??= new THREE.Vector3()).copy(pos);
  }

  // Nothing emitted this frame (the flame is off): the next emit starts fresh
  rest() { this.prevNozzle = null; }

  // Age and move the points, then rebuild the ribbon facing the camera
  update(dt, camPos, time = 0) {
    this.mat.uniforms.time.value = time;
    for (const pt of this.pts) { pt.age += dt; pt.p.addScaledVector(pt.v, dt); }
    while (this.pts.length && this.pts[this.pts.length - 1].age >= this.pts[this.pts.length - 1].life) this.pts.pop();
    // trim to maxLen metres along the streak (the last point is pulled in to land exactly on it)
    let run = 0;
    if (this.pts[0]) this.pts[0].d = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const seg = this.pts[i].p.distanceTo(this.pts[i - 1].p);
      if (run + seg > this.maxLen) {
        this.pts[i].p.lerpVectors(this.pts[i - 1].p, this.pts[i].p, Math.max(0, (this.maxLen - run) / Math.max(1e-6, seg)));
        this.pts[i].d = this.maxLen;
        this.pts.length = i + 1;
        break;
      }
      run += seg;
      this.pts[i].d = run;
    }
    const n = this.pts.length;
    this.mesh.visible = n >= 2;
    if (n < 2) return;
    // smooth curve through the points (Catmull-Rom), SUB samples per stretch
    const S = this.samples, len = Number.isFinite(this.maxLen) ? this.maxLen : Infinity;
    let m = 0;
    for (let i = 0; i < n - 1; i++) {
      const p0 = this.pts[Math.max(0, i - 1)], p1 = this.pts[i], p2 = this.pts[i + 1], p3 = this.pts[Math.min(n - 1, i + 2)];
      for (let k = 0; k < SUB; k++) {
        const s = k / SUB, s2 = s * s, s3 = s2 * s, o = S[m++];
        o.p.set(0, 0, 0)
          .addScaledVector(p0.p, -0.5 * s3 + s2 - 0.5 * s)
          .addScaledVector(p1.p, 1.5 * s3 - 2.5 * s2 + 1)
          .addScaledVector(p2.p, -1.5 * s3 + 2 * s2 + 0.5 * s)
          .addScaledVector(p3.p, 0.5 * s3 - 0.5 * s2);
        const lerp = (a, b) => a + (b - a) * s;
        const age = lerp(p1.age / p1.life, p2.age / p2.life), du = lerp(p1.d ?? 0, p2.d ?? 0);
        o.t = Math.min(1, Math.max(age, len < Infinity ? du / len : 0));
        o.u = du; o.w = lerp(p1.w, p2.w); o.i = lerp(p1.i, p2.i);
      }
    }
    { const last = this.pts[n - 1], o = S[m++]; o.p.copy(last.p); o.t = 1; o.u = last.d ?? 0; o.w = last.w; o.i = last.i; }
    const { pos, aT, aI, aU } = this;
    for (let i = 0; i < this.verts; i++) {
      const used = i < m, o = S[Math.min(i, m - 1)];
      const prev = S[Math.max(0, Math.min(i, m - 1) - 1)], next = S[Math.min(m - 1, i + 1)];
      // direction along the ribbon, and across it (facing the camera)
      this._t.subVectors(next.p, prev.p);
      if (this._t.lengthSq() < 1e-10) this._t.set(0, 1, 0);
      this._c.subVectors(camPos, o.p);
      this._s.crossVectors(this._t, this._c);
      const l = this._s.length();
      if (l < 1e-6) this._s.set(1, 0, 0); else this._s.multiplyScalar(1 / l);
      // swells just behind the nozzle, then thins to a point
      const shape = Math.min(1, 0.55 + o.t * 3) * (1 - o.t * 0.75);
      const w = used ? o.w * shape * GLOW : 0;
      const k = i * 6;
      pos[k] = o.p.x - this._s.x * w; pos[k + 1] = o.p.y - this._s.y * w; pos[k + 2] = o.p.z - this._s.z * w;
      pos[k + 3] = o.p.x + this._s.x * w; pos[k + 4] = o.p.y + this._s.y * w; pos[k + 5] = o.p.z + this._s.z * w;
      aT[i * 2] = aT[i * 2 + 1] = used ? o.t : 1;
      aI[i * 2] = aI[i * 2 + 1] = used ? o.i : 0;
      aU[i * 2] = aU[i * 2 + 1] = o.u;
    }
    const g = this.mesh.geometry;
    for (const a of ['position', 'aT', 'aI', 'aU']) g.attributes[a].needsUpdate = true;
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
