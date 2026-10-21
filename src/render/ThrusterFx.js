import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// Thruster looks (CONFIG.art.thrusters):
//  - flameMaterial: the flame cone. White-hot core at the nozzle cooling to orange at the tip
//    (blue-white when boosting), bright shock diamonds pulsing down it, a living flicker and wobble.
//  - Embers: sparks spat out of the nozzles, cooling from yellow to red as they fall.
//  - Smoke: soft grey wisps (the jets washing over the ground in a hover, and a trickle in flight).
//  - ShockRing: the bang of a ring of air when boost kicks in.
//  - HAZE: a screen pass that makes the air shimmer behind each nozzle.

const FLAME_VERT = `
  uniform float time; uniform float seed; uniform float wobble;
  varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vAng;
  void main() {
    vec3 p = position;
    vAng = atan(p.x, p.z);
    float along = clamp(-p.y, 0.0, 1.0);          // 0 at the nozzle, 1 at the tip
    // the flame wobbles, more toward the tip
    float w = wobble * along * along;
    p.x += w * (sin(time * 23.0 + seed + along * 9.0) + 0.5 * sin(time * 37.0 + seed * 1.7 + along * 15.0));
    p.z += w * (cos(time * 19.0 + seed * 2.3 + along * 11.0) + 0.5 * cos(time * 41.0 + seed + along * 13.0));
    vAlong = along;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const FLAME_FRAG = `
  uniform float time; uniform float seed; uniform float intensity; uniform float boost; uniform float core;
  uniform float diamonds; uniform float diamondCount;
  uniform vec3 hot; uniform vec3 mid; uniform vec3 cool; uniform vec3 bHot; uniform vec3 bMid; uniform vec3 bCool;
  varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vAng;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ return 0.5 * n(p) + 0.3 * n(p * 2.2 + 3.1) + 0.2 * n(p * 4.7 + 7.7); }
  void main() {
    float t = vAlong;
    // licking tongues of fire: noise wrapped round the cone and racing down it; the flame
    // breaks up into tongues toward the tip
    vec2 tq = vec2(vAng * 1.2732 + seed, t * 5.0 - time * 11.0);
    float tongue = fbm(tq + vec2(fbm(tq * 0.7 + time), 0.0));
    float tongues = smoothstep(t * 0.95 - 0.15, t * 0.95 + 0.2, tongue + 0.25);
    // facing the camera = looking through the thick of the flame; edges are thin
    float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
    // colour down the flame: white-hot core -> mid -> cool tip (boost: blue-white)
    vec3 h = mix(hot, bHot, boost), m = mix(mid, bMid, boost), c = mix(cool, bCool, boost);
    vec3 col = t < 0.35 ? mix(h, m, smoothstep(0.0, 0.35, t)) : mix(m, c, smoothstep(0.35, 1.0, t));
    float heat = pow(1.0 - t, 1.5) * core;
    col = mix(col, h, heat * face);
    // shock diamonds: bright pinched bands marching down the jet
    float ph = t * diamondCount - time * 1.5;
    float dia = pow(0.5 + 0.5 * cos(ph * 6.2831), 10.0) * smoothstep(0.03, 0.15, t) * (1.0 - smoothstep(0.55, 0.9, t));
    // flicker: brightness shimmering down the length
    float fl = 0.85 + 0.15 * sin(time * 47.0 + seed + t * 21.0) * sin(time * 29.0 + seed * 3.1 - t * 13.0);
    float a = face * (1.0 - smoothstep(0.6, 1.0, t)) * intensity * fl * tongues * (0.8 + 0.4 * tongue);
    col += h * dia * diamonds * face * 1.4;
    gl_FragColor = vec4(col * a, 1.0);
  }`;

export function flameMaterial(inner) {
  const T = CONFIG.art.thrusters;
  return new THREE.ShaderMaterial({
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 }, seed: { value: Math.random() * 100 }, intensity: { value: 1 }, boost: { value: 0 },
      core: { value: inner ? 1 : 0.35 }, wobble: { value: inner ? T.wobble * 0.6 : T.wobble },
      diamonds: { value: inner ? T.diamonds : 0 }, diamondCount: { value: T.diamondCount },
      hot: { value: new THREE.Color(T.hot) }, mid: { value: new THREE.Color(T.mid) }, cool: { value: new THREE.Color(T.cool) },
      bHot: { value: new THREE.Color(T.boostHot) }, bMid: { value: new THREE.Color(T.boostMid) }, bCool: { value: new THREE.Color(T.boostCool) },
    },
  });
}

// Soft round points sized in metres (shared by embers and smoke)
const PUFF_VERT = `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  uniform float scale; uniform float maxPx;
  void main() {
    vAlpha = aAlpha; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(aSize * scale / -mv.z, 1.0, maxPx);
    gl_Position = projectionMatrix * mv;
  }`;
const PUFF_FRAG = `
  uniform float hard;
  varying float vAlpha; varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    if (r > 1.0) discard;
    float soft = mix((1.0 - r) * (1.0 - r), 1.0 - smoothstep(0.3, 1.0, r), hard);
    gl_FragColor = vec4(vColor * (hard > 0.5 ? soft * vAlpha : 1.0), hard > 0.5 ? 1.0 : soft * vAlpha);
  }`;

class Puffs {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.age = new Float32Array(max).fill(1e9); this.life = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 }, hard: { value: additive ? 1 : 0 }, maxPx: { value: additive ? 7 : 300 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p, v, life, s0, s1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    return i;
  }

  step(dt, camera, viewHeight, gravity, drag, shade) {
    if (camera) this.mat.uniforms.scale.value = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const k = Math.exp(-drag * dt);
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.age[i] += dt;
      const u = Math.min(1, this.age[i] / this.life[i]);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + gravity * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * u;
      shade(i, u);
    }
    const g = this.points.geometry;
    for (const a of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[a].needsUpdate = true;
  }
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();

export class Embers extends Puffs {
  constructor(scene) { super(scene, 260, true); this.acc = new Map(); this.bk = new Float32Array(this.max); }

  // Spit sparks from a nozzle: `rate` per second, along `dir` (world, the exhaust), carried by `carry`
  emit(key, pos, dir, carry, rate, dt, boostK) {
    const E = CONFIG.art.thrusters.embers;
    let n = (this.acc.get(key) ?? 0) + rate * dt;
    const v = new THREE.Vector3();
    while (n >= 1) {
      n -= 1;
      const sp = E.speed * (0.5 + Math.random()) * (1 + boostK * 0.6);
      v.copy(dir).multiplyScalar(sp).add(carry);
      v.x += (Math.random() - 0.5) * E.spread; v.y += (Math.random() - 0.5) * E.spread; v.z += (Math.random() - 0.5) * E.spread;
      const i = this.spawn(pos, v, E.life * (0.5 + Math.random()), E.size * (0.7 + Math.random() * 0.6), E.size * 0.2);
      this.bk[i] = boostK;   // (boost sparks burn blue-white)
    }
    this.acc.set(key, n);
  }

  burst(pos, count, speed, boostK = 1) {
    const E = CONFIG.art.thrusters.embers, v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      const i = this.spawn(pos, v, E.life * (0.6 + Math.random()), E.size * 1.2, E.size * 0.2);
      this.bk[i] = boostK;
    }
  }

  update(dt, camera, h) {
    const E = CONFIG.art.thrusters.embers;
    const hot = _c1.set(E.hot), coolC = _c2.set(E.cool), blue = _c3.set(E.boost);
    const tmp = new THREE.Color();
    this.step(dt, camera, h, -E.gravity, E.drag, (i, u) => {
      tmp.copy(hot).lerp(coolC, u).lerp(blue, this.bk[i] * (1 - u) * 0.8);
      const fl = 0.7 + 0.3 * Math.sin(this.age[i] * 60 + i);
      this.col[i * 3] = tmp.r; this.col[i * 3 + 1] = tmp.g; this.col[i * 3 + 2] = tmp.b;
      this.alpha[i] = (1 - u) * fl * E.brightness;
    });
  }
}

export class Smoke extends Puffs {
  constructor(scene) { super(scene, 220, false); this.acc = new Map(); }

  emit(key, pos, vel, rate, dt, size = 1) {
    const S = CONFIG.art.thrusters.smoke;
    let n = (this.acc.get(key) ?? 0) + rate * dt;
    while (n >= 1) {
      n -= 1;
      const v = vel.clone();
      v.x += (Math.random() - 0.5) * S.spread; v.y += Math.random() * S.spread * 0.4; v.z += (Math.random() - 0.5) * S.spread;
      this.spawn(pos, v, S.life * (0.6 + Math.random() * 0.8), S.size * 0.4 * size, S.size * (1.5 + Math.random()) * size);
    }
    this.acc.set(key, n);
  }

  update(dt, camera, h) {
    const S = CONFIG.art.thrusters.smoke, c = _c1.set(S.color);
    this.step(dt, camera, h, S.rise, S.drag, (i, u) => {
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.alpha[i] = S.opacity * Math.min(1, u * 6) * (1 - u) * (1 - u);
    });
  }
}

// The boom of air when boost kicks in: a bright ring that blasts out from the back
export class ShockRing {
  constructor(scene) {
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({
      color: CONFIG.art.thrusters.boostHot, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.t = null;
  }

  fire(pos, dir) {
    this.mesh.position.copy(pos);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.vel = dir.clone();
    this.t = 0;
  }

  update(dt) {
    if (this.t == null) return;
    const R = CONFIG.art.thrusters.ring;
    this.t += dt;
    const u = this.t / R.time;
    if (u >= 1) { this.t = null; this.mesh.visible = false; return; }
    const r = 0.2 + R.radius * (1 - (1 - u) ** 3);
    this.mesh.scale.set(r, r, r);
    this.mesh.position.addScaledVector(this.vel, R.drift * dt);
    this.mesh.material.opacity = R.opacity * (1 - u) * (1 - u);
    this.mesh.visible = true;
  }
}

// Heat haze: the picture is nudged by a moving noise inside a short cone behind each nozzle
// (on screen). Up to 6 nozzles: src[i] = (x, y) at the nozzle, (dx, dy) to the end of the haze;
// amt[i] = strength (0 off).
export const HAZE = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, aspect: { value: 1 },
    src: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
    amt: { value: new Array(6).fill(0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float aspect; uniform vec4 src[6]; uniform float amt[6];
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    void main(){
      vec2 off = vec2(0.0);
      for (int i = 0; i < 6; i++) {
        if (amt[i] <= 0.0) continue;
        vec2 a = src[i].xy, d = src[i].zw;
        float L = length(d * vec2(aspect, 1.0));
        if (L < 1e-4) continue;
        vec2 dir = d / length(d);
        vec2 p = vUv - a;
        float along = dot(p * vec2(aspect, 1.0), normalize(d * vec2(aspect, 1.0))) / L;
        if (along < 0.0 || along > 1.0) continue;
        vec2 perp = p - dir * dot(p, dir);
        float across = length(perp * vec2(aspect, 1.0)) / (L * (0.12 + 0.35 * along));
        float m = (1.0 - smoothstep(0.4, 1.0, across)) * sin(along * 3.1416) * amt[i];
        vec2 q = vec2(dot(p, vec2(-dir.y, dir.x)) * 60.0, along * 10.0 - time * 9.0);
        off += m * (vec2(n(q), n(q + 17.3)) - 0.5);
      }
      gl_FragColor = texture2D(tDiffuse, vUv + off * 0.012);
    }`,
};

// The hot base of a flame: a short bright cone right at the nozzle, pinched into a bell (it flares
// out of the nozzle, narrows, then a bright disc where the jet shocks). Blue-violet right at the
// exit, white-hot, then pale gold; a fine fast shimmer runs over it.
const BASE_VERT = `
  uniform float time; uniform float seed;
  varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vAng;
  void main() {
    vec3 p = position;
    float along = clamp(-p.y, 0.0, 1.0);
    vAng = atan(p.x, p.z);
    // the cone is narrow at its tip; turn it into a bell: out of the nozzle, a waist, a bulge, a point
    float r = (0.85 + 0.35 * sin(along * 3.1416 * 1.6)) / max(0.05, 1.0 - along) * (1.0 - smoothstep(0.75, 1.0, along) * 0.6);
    p.xz *= r;
    vAlong = along;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BASE_FRAG = `
  uniform float time; uniform float seed; uniform float intensity; uniform float boost;
  uniform vec3 hot; uniform vec3 mid; uniform vec3 root; uniform vec3 bHot; uniform vec3 bMid;
  varying float vAlong; varying vec3 vN; varying vec3 vV; varying float vAng;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  void main() {
    float t = vAlong;
    float face = pow(abs(dot(normalize(vN), normalize(vV))), 1.2);
    vec3 H = mix(hot, bHot, boost), M = mix(mid, bMid, boost);
    vec3 col = mix(root, H, smoothstep(0.0, 0.18, t));
    col = mix(col, M, smoothstep(0.55, 1.0, t));
    // fine fast shimmer over the surface
    float sh = n(vec2(vAng * 3.8 + seed, t * 18.0 - time * 38.0)) * n(vec2(vAng * 7.6 - seed, t * 31.0 - time * 55.0));
    // the bright shock disc where the jet pinches, pulsing
    float disc = exp(-pow((t - 0.62) * 9.0, 2.0)) * (0.8 + 0.2 * sin(time * 40.0 + seed));
    float a = face * (1.0 - smoothstep(0.7, 1.0, t)) * intensity * (0.75 + 0.6 * sh) + disc * intensity * 0.9;
    gl_FragColor = vec4(col * a, 1.0);
  }`;

export function baseMaterial() {
  const T = CONFIG.art.thrusters;
  return new THREE.ShaderMaterial({
    vertexShader: BASE_VERT, fragmentShader: BASE_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 }, seed: { value: Math.random() * 100 }, intensity: { value: 1 }, boost: { value: 0 },
      hot: { value: new THREE.Color(T.hot) }, mid: { value: new THREE.Color(T.mid) }, root: { value: new THREE.Color(T.root) },
      bHot: { value: new THREE.Color(T.boostHot) }, bMid: { value: new THREE.Color(T.boostMid) },
    },
  });
}

// A soft glow at the mouth of the nozzle, always facing the camera
const GLOW_VERT = `
  uniform float size;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    c.xy += position.xy * size;
    gl_Position = projectionMatrix * c;
  }`;
const GLOW_FRAG = `
  uniform vec3 color; uniform float intensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;
    float g = exp(-r * r * 9.0) + 0.35 * exp(-r * r * 2.5);
    gl_FragColor = vec4(color * g * intensity, 1.0);
  }`;

export function nozzleGlow() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color(CONFIG.art.thrusters.hot) }, intensity: { value: 1 }, size: { value: 0.2 } },
  }));
  m.frustumCulled = false;
  return m;
}
