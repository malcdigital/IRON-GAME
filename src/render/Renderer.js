import * as THREE from '../lib/three.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/GTAOPass.js';
import { CONFIG } from '../core/config.js';
import { HAZE } from './ThrusterFx.js';

// Owns the WebGL renderer, scene, lights and camera.
// The look (CONFIG.art): a painted sunset sky, a low warm sun, lavender haze, glow (bloom)
// on bright things, and a colour grade toward the character sheet's palette.
export class Renderer {
  constructor(container) {
    const art = CONFIG.art;
    this.container = container;
    // graphics quality: 'high' (desktop) or 'low' (phones / tablets: no ambient occlusion, a smaller shadow map)
    const q = CONFIG.graphics?.quality ?? 'auto';
    this.quality = q !== 'auto' ? q : (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900 ? 'low' : 'high');
    const G = CONFIG.graphics?.[this.quality] ?? {};
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = art.exposure;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(art.haze, art.hazeNear, art.hazeFar);
    this.scene.background = new THREE.Color(art.haze);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.5, 9000);   // (far: the mountains on the horizon; near 0.5 m keeps the thin ground layers from flickering far away)

    // Sun direction (shared by the light, the sky's sun disc and its glow)
    const el = THREE.MathUtils.degToRad(art.sunElevation), az = THREE.MathUtils.degToRad(art.sunAzimuth);
    this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    this.addSky();

    // Lavender sky light from above, teal bounce from the sea below
    this.scene.add(new THREE.HemisphereLight(art.skyLight, art.groundLight, art.ambient));
    this.sun = new THREE.DirectionalLight(art.sunColor, art.sunIntensity);
    this.sun.castShadow = true;
    // (a big shadow box round you: the buildings all round cast shadows, not just the nearest few)
    const sm = G.shadowMap ?? 1024, sr = G.shadowRange ?? 30;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -sr; sc.right = sc.top = sr; sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sunOffset = this.sunDir.clone().multiplyScalar(300);
    this.scene.add(this.sun, this.sun.target);

    // Post: bloom (glow) and the colour grade
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Ambient occlusion: soft shade where things meet (walls and the ground, under ledges, round
    // the rooftop clutter). Skips the sky, sea, flames, smoke and anything see-through.
    const AO = art.ao;
    if (AO?.enabled && G.ao !== false) {
      this.ao = new GTAOPass(this.scene, this.camera, 512, 512);
      this.ao.overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          cache.set(o, o.visible);
          const m = o.material;
          if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (m && (m.transparent || m.isShaderMaterial || m.isMeshBasicMaterial))) o.visible = false;
        });
      };
      this.ao.updateGtaoMaterial({ radius: AO.radius, distanceExponent: AO.distanceExponent, thickness: AO.thickness, scale: AO.scale, samples: AO.samples, distanceFallOff: AO.distanceFallOff });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      this.ao.blendIntensity = AO.intensity;
      this.composer.addPass(this.ao);
    }
    this.haze = new ShaderPass(HAZE);   // heat shimmer behind the thrusters (SuitView sets where)
    this.composer.addPass(this.haze);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), art.bloom.strength, art.bloom.radius, art.bloom.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    this.grade.uniforms.warm.value = new THREE.Color(art.grade.warm);
    this.grade.uniforms.cool.value = new THREE.Color(art.grade.cool);
    this.grade.uniforms.saturation.value = art.grade.saturation;
    this.grade.uniforms.vignette.value = art.grade.vignette;
    this.composer.addPass(this.grade);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  // Painted sunset: gradient from deep dusk blue overhead to gold at the horizon, banks of
  // soft clouds lit from the sun's side, a sun disc with a wide glow and faint rays.
  addSky() {
    const art = CONFIG.art.sky;
    const geo = new THREE.SphereGeometry(900, 48, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(art.top) },
        mid: { value: new THREE.Color(art.mid) },
        horizon: { value: new THREE.Color(art.horizon) },
        below: { value: new THREE.Color(art.below) },
        sunCol: { value: new THREE.Color(art.sun) },
        cloudLit: { value: new THREE.Color(art.cloudLit) },
        cloudShade: { value: new THREE.Color(art.cloudShade) },
        sunDir: { value: this.sunDir },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform vec3 top, mid, horizon, below, sunCol, cloudLit, cloudShade, sunDir;
        varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec3 d = normalize(vP);
          float y = d.y;
          vec3 col = y > 0.0 ? mix(horizon, mid, smoothstep(0.0, 0.18, y)) : mix(horizon, below, smoothstep(0.0, -0.08, y));
          col = mix(col, top, smoothstep(0.18, 0.75, y));
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 6.0) * 0.55 + pow(s, 60.0) * 0.8);          // wide glow
          // soft cloud banks, thicker toward the horizon
          if (y > -0.02) {
            vec2 uv = d.xz / (y + 0.18) * 1.6;
            float c = fbm(uv * 1.3 + vec2(3.0, 1.0));
            c = smoothstep(0.48, 0.78, c) * smoothstep(-0.02, 0.12, y) * (1.0 - smoothstep(0.55, 0.95, y));
            float lit = 0.35 + 0.65 * pow(s, 2.0);
            vec3 cc = mix(cloudShade, cloudLit, lit);
            col = mix(col, cc, c * 0.85);
          }
          // faint rays fanning out from the sun
          vec3 r = normalize(d - sunDir * dot(d, sunDir));
          float ray = n(vec2(atan(r.y, r.x) * 9.0, 0.0)) * pow(s, 3.0) * smoothstep(0.0, 0.2, y + 0.05);
          col += sunCol * ray * 0.18;
          col += sunCol * pow(s, 900.0) * 3.0;                                 // sun disc
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    if (this.ao) this.ao.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.haze.uniforms.aspect.value = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Keep the shadow box and sky centered on the player
  follow(pos) {
    // move the shadow box in whole shadow-map texels, so shadow edges don't crawl and flicker as you move
    const sc = this.sun.shadow.camera, texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    if (!this._lb) {
      const f = this.sunDir.clone().negate(), r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      this._lb = { f, r, u: new THREE.Vector3().crossVectors(r, f).normalize(), p: new THREE.Vector3() };
    }
    const { f, r, u, p } = this._lb;
    p.copy(r).multiplyScalar(Math.round(pos.dot(r) / texel) * texel)
      .addScaledVector(u, Math.round(pos.dot(u) / texel) * texel).addScaledVector(f, pos.dot(f));
    this.sun.position.copy(p).add(this.sunOffset);
    this.sun.target.position.copy(p);
    this.sky.position.copy(this.camera.position);
  }

  render() { this.composer.render(); }
}

// Colour grade: a touch more saturation, warm highlights, cool (teal/lavender) shadows, soft vignette
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    warm: { value: new THREE.Color(1, 0.8, 0.6) },
    cool: { value: new THREE.Color(0.5, 0.6, 0.8) },
    saturation: { value: 1.1 },
    vignette: { value: 0.25 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 warm, cool; uniform float saturation, vignette;
    varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c *= mix(cool, warm, smoothstep(0.15, 0.85, l)) * 1.0;
      c = mix(c, c / max(max(cool.r, cool.g), cool.b), 0.0);
      float v = smoothstep(0.85, 0.25, length(vUv - 0.5));
      c *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = vec4(c, t.a);
    }`,
};
