import * as THREE from '../lib/three.js';

const SKY_TOP = 0x3f5466;
const SKY_HORIZON = 0xd8b08a;

// Owns the WebGL renderer, scene, lights and camera.
export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY_HORIZON, 120, 750);
    this.scene.background = new THREE.Color(SKY_HORIZON);
    this.addSky();

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2000);

    const hemi = new THREE.HemisphereLight(0xdfe6ea, 0x5a4a3a, 1.1);
    this.scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xffe0b5, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.sunOffset = new THREE.Vector3(40, 70, 25);
    this.scene.add(this.sun, this.sun.target);

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  addSky() {
    const geo = new THREE.SphereGeometry(800, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(SKY_TOP) }, horizon: { value: new THREE.Color(SKY_HORIZON) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float t = pow(clamp(vP.y,0.0,1.0),0.55); gl_FragColor = vec4(mix(horizon, top, t),1.0); }',
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Keep the shadow box and sky centered on the player
  follow(pos) {
    this.sun.position.copy(pos).add(this.sunOffset);
    this.sun.target.position.copy(pos);
    this.sky.position.copy(this.camera.position);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
