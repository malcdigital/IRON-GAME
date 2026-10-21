import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// Dust kicked up by a hard landing: soft puffs that billow out along the ground and rise a
// little as they spread, slow down and fade, plus a pale shockwave ring racing outward.
// The puffs are drawn as soft round points (no texture), so it stays cheap.

const MAX = 160;

const VERT = `
  attribute float aSize; attribute float aAlpha;
  varying float vAlpha;
  uniform float scale;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform vec3 color;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    float soft = (1.0 - r) * (1.0 - r);
    // a little shading: lighter on top, like sunlit dust
    vec3 c = color * (0.85 + 0.25 * (1.0 - gl_PointCoord.y));
    gl_FragColor = vec4(c, soft * vAlpha);
  }`;

export class DustCloud {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.age = new Float32Array(MAX).fill(1e9);
    this.life = new Float32Array(MAX).fill(1);
    this.grow = new Float32Array(MAX);
    this.base = new Float32Array(MAX);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      uniforms: { color: { value: new THREE.Color(CONFIG.pose.landing.dust.color) }, scale: { value: 600 } },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // shockwave ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({
      color: 0xfff1d8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
    this.ringT = null;
  }

  // A landing at `point` (on the ground), `power` 0..1 for how hard
  burst(point, power = 1) {
    const D = CONFIG.pose.landing.dust, n = Math.round(D.puffs * (0.5 + 0.5 * power));
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
      const a = Math.random() * Math.PI * 2, sp = D.speed * (0.45 + Math.random() * 0.75) * (0.6 + 0.4 * power);
      const r0 = 0.2 + Math.random() * 0.4;
      this.pos[i * 3] = point.x + Math.cos(a) * r0; this.pos[i * 3 + 1] = point.y + 0.1 + Math.random() * 0.25; this.pos[i * 3 + 2] = point.z + Math.sin(a) * r0;
      this.vel[i * 3] = Math.cos(a) * sp; this.vel[i * 3 + 1] = D.rise * (0.3 + Math.random() * 0.9); this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.age[i] = 0; this.life[i] = D.life * (0.6 + Math.random() * 0.6);
      this.base[i] = D.size * (0.5 + Math.random() * 0.6); this.grow[i] = D.size * D.grow * (0.6 + Math.random() * 0.8);
    }
    this.ring.position.set(point.x, point.y + 0.05, point.z);
    this.ringT = 0; this.ringPower = power;
  }

  update(dt, camera, viewHeight) {
    // (points sized in metres: scale by how many pixels a metre covers at 1 m away)
    if (camera) this.mat.uniforms.scale.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const D = CONFIG.pose.landing.dust, drag = Math.exp(-D.drag * dt);
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.age[i] += dt;
      const u = this.age[i] / this.life[i];
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag; this.vel[i * 3 + 1] *= Math.exp(-1.5 * dt);
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.base[i] + this.grow[i] * (1 - (1 - u) * (1 - u));
      this.alpha[i] = D.opacity * Math.min(1, u * 8) * (1 - u) * (1 - u);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
    // the ring: races out and fades
    if (this.ringT != null) {
      this.ringT += dt;
      const u = this.ringT / D.ringTime;
      if (u >= 1) { this.ringT = null; this.ring.visible = false; }
      else {
        const r = D.ringRadius * (1 - (1 - u) ** 3) * (0.6 + 0.4 * this.ringPower) + 0.3;
        this.ring.scale.set(r, r, r);
        this.ring.material.opacity = 0.55 * (1 - u) * (1 - u);
        this.ring.visible = true;
      }
    }
  }
}
