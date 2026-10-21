import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// Cracks in the ground from a hard landing: jagged lines that shoot out from the impact point
// (with forks), over a dark scorched patch, then fade away after a while. Each landing builds
// its own flat mesh lying just above the surface; old ones are reused.

const VERT = `
  attribute float aDist; attribute float aEdge;
  varying float vDist; varying float vEdge;
  void main() { vDist = aDist; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
  uniform float grow; uniform float opacity; uniform float heat; uniform vec3 color; uniform vec3 glow; uniform vec3 rim;
  varying float vDist; varying float vEdge;
  void main() {
    if (vDist > grow) discard;
    float edge = 1.0 - abs(vEdge);
    // fresh cracks glow hot near the tip as they open, then go dark
    float hot = max(smoothstep(grow - 0.3, grow, vDist), 0.5 * (1.0 - vDist)) * heat;
    // dark gap in the middle, pale chipped edges either side (so it reads on dark ground too)
    vec3 c = mix(rim, color, smoothstep(0.35, 0.7, edge));
    c = mix(c, glow, hot * smoothstep(0.3, 0.8, edge));
    gl_FragColor = vec4(c, opacity * (0.75 + 0.25 * edge) * (1.0 - 0.3 * vDist));
  }`;
const CRATER_FRAG = `
  uniform float opacity; uniform vec3 color; uniform vec3 rim;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    // dark crushed centre, a pale ring of dust around it
    vec3 c = mix(color, rim, smoothstep(0.25, 0.6, r));
    float a = mix(0.85, 0.45, smoothstep(0.25, 0.6, r)) * (1.0 - smoothstep(0.7, 1.0, r));
    gl_FragColor = vec4(c, opacity * a);
  }`;
const CRATER_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class GroundCracks {
  constructor(scene) {
    this.scene = scene;
    this.decals = [];
  }

  // A landing at `point` (on the ground), `power` 0..1+ for how hard
  burst(point, power = 1) {
    const C = CONFIG.pose.landing.cracks;
    let d = this.decals.find((x) => x.t > C.stay + C.fade);
    if (!d && this.decals.length < C.max) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        uniforms: { grow: { value: 0 }, opacity: { value: 1 }, heat: { value: 1 }, color: { value: new THREE.Color(C.color) }, glow: { value: new THREE.Color(C.glow) }, rim: { value: new THREE.Color(C.rim) } },
      });
      const crater = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader: CRATER_VERT, fragmentShader: CRATER_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        uniforms: { opacity: { value: 1 }, color: { value: new THREE.Color(C.color) }, rim: { value: new THREE.Color(C.rim) } },
      }));
      crater.rotation.x = -Math.PI / 2;
      d = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), mat), crater, t: 0 };
      d.mesh.frustumCulled = false;
      this.scene.add(d.mesh, crater);
      this.decals.push(d);
    }
    if (!d) d = this.decals.reduce((a, b) => (a.t > b.t ? a : b));   // (all in use: reuse the oldest)
    d.mesh.geometry.dispose();
    d.mesh.geometry = this.build(power);
    d.mesh.position.set(point.x, point.y + 0.03, point.z);
    d.crater.position.set(point.x, point.y + 0.025, point.z);
    const cr = C.crater * (0.6 + 0.4 * Math.min(1.3, power));
    d.crater.scale.set(cr * 2, cr * 2, 1);
    d.t = 0;
  }

  // Jagged cracks radiating out, with forks; widest at the centre, thinning to a point
  build(power) {
    const C = CONFIG.pose.landing.cracks, pos = [], dist = [], edge = [], idx = [];
    const maxLen = C.length * (0.55 + 0.45 * Math.min(1.3, power));
    const crack = (x, z, ang, len, w0, d0) => {
      let px = x, pz = z, a = ang, done = 0;
      const steps = Math.max(3, Math.round(len / 0.35));
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps, w = w0 * (1 - u) + 0.006;
        // across the crack
        const nx = -Math.sin(a), nz = Math.cos(a);
        const base = pos.length / 3;
        pos.push(px + nx * w, 0, pz + nz * w, px - nx * w, 0, pz - nz * w);
        const dd = (d0 + done) / maxLen;
        dist.push(dd, dd); edge.push(1, -1);
        if (prev != null) idx.push(prev, prev + 1, base, prev + 1, base + 1, base);
        prev = base;
        if (i === steps) break;
        // fork now and then
        if (i > 0 && Math.random() < C.forks && len - done > 0.6) crack(px, pz, a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6), (len - done) * (0.35 + Math.random() * 0.35), w * 0.7, d0 + done);
        const seg = len / steps;
        a += (Math.random() - 0.5) * C.jag;
        px += Math.cos(a) * seg; pz += Math.sin(a) * seg; done += seg;
      }
    };
    const n = Math.round(C.count * (0.7 + 0.3 * Math.min(1.3, power)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      crack(Math.cos(a) * 0.15, Math.sin(a) * 0.15, a, maxLen * (0.45 + Math.random() * 0.55), C.width, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(idx);
    return g;
  }

  update(dt) {
    const C = CONFIG.pose.landing.cracks;
    for (const d of this.decals) {
      d.t += dt;
      const fade = d.t < C.stay ? 1 : Math.max(0, 1 - (d.t - C.stay) / C.fade);
      d.mesh.material.uniforms.grow.value = Math.min(1, d.t / C.growTime);
      d.mesh.material.uniforms.opacity.value = fade;
      d.mesh.material.uniforms.heat.value = Math.max(0, 1 - d.t / C.coolTime);
      d.crater.material.uniforms.opacity.value = fade * Math.min(1, d.t / 0.08);
      d.mesh.visible = d.crater.visible = fade > 0;
    }
  }
}
