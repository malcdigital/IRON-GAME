import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';

// The coastal city around the play area (the key art): the sea, the land and its beaches, palms,
// the monorail train, boats, island villages, distant mountains and cloud banks. All looks; the
// solid things (buildings, track, bridge) are colliders drawn by WorldView.
// Colours and amounts: CONFIG.world.

let seed = 1234;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const D2R = Math.PI / 180;

export class CityScenery {
  constructor(scene, world, renderer) {
    this.scene = scene;
    this.world = world;
    this.range = world.range;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sunDir = renderer.sunDir;
    this.palmSpots = [];
    this.buildSea();
    this.buildLand(this.range.coast, true);
    for (const i of this.range.islands) this.buildLand(i.outline, false, i);
    this.buildMountains();
    this.buildClouds();
    this.buildTrain();
    this.buildBoats();
    this.buildWaterfalls();
  }

  // Waterfalls spilling off the terraced cliffs: a stream across the top, then a sheet of water
  // down each step, foam where it lands and mist rising off the sea at the bottom
  buildWaterfalls() {
    const C = this.range.cliffs, sea = this.range.seaLevel;
    if (!C) return;
    this.fallMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, flow: { value: 1 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float time;
        varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          // streaks pouring down (v runs along the flow), fraying at the edges
          float s = n(vec2(vUv.x * 14.0, vUv.y * 2.0 + time * 3.2)) * 0.6 + n(vec2(vUv.x * 33.0, vUv.y * 5.0 + time * 5.5)) * 0.4;
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 col = mix(vec3(0.55, 0.85, 0.9), vec3(1.0), smoothstep(0.35, 0.8, s));
          float a = edge * (0.55 + 0.45 * s);
          gl_FragColor = vec4(col, a * 0.9);
        }`,
    });
    const foamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: this.fallMat.uniforms.time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float time; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
          float churn = n(p * 6.0 + vec2(time * 1.3, -time)) * 0.6 + n(p * 13.0 - time * 2.0) * 0.4;
          float a = (1.0 - smoothstep(0.3, 1.0, r)) * (0.5 + 0.5 * churn);
          gl_FragColor = vec4(vec3(1.0), a * 0.85);
        }`,
    });
    const mistMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: this.fallMat.uniforms.time },
      vertexShader: `
        uniform float time; attribute float aPh; varying vec2 vUv; varying float vA;
        void main(){
          vUv = uv;
          float t = fract(time * 0.12 + aPh);
          vec4 c = modelViewMatrix * vec4(0.0, t * 14.0, 0.0, 1.0);
          float s = 8.0 + t * 16.0;
          c.xy += position.xy * s;
          vA = sin(t * 3.1416);
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: 'varying vec2 vUv; varying float vA; void main(){ float r = length(vUv - 0.5) * 2.0; if (r > 1.0) discard; gl_FragColor = vec4(vec3(1.0), pow(1.0 - r, 2.0) * vA * 0.35); }',
    });
    const quad = (pts) => {   // four corners, uv x across / y down the flow
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      return g;
    };
    for (const f of C.falls) {
      const seg = C.edges.find((e) => f.z <= e.z0 && f.z > e.z1);
      if (!seg) continue;
      const row = seg.row, w = f.width / 2, z = f.z, top = row.length - 1;
      // the stream across the top terrace to its edge
      this.group.add(new THREE.Mesh(quad([[C.inner - 6, row[top][1] + 0.6, z - w], [C.inner - 6, row[top][1] + 0.6, z + w], [row[top][0], row[top][1] + 0.6, z + w], [row[top][0], row[top][1] + 0.6, z - w]]), this.fallMat));
      for (let k = top; k >= 0; k--) {
        const [ex, h] = row[k], below = k > 0 ? row[k - 1][1] + 0.6 : sea;
        const x = ex - 0.6;
        // the sheet pouring down this step's face
        this.group.add(new THREE.Mesh(quad([[x, h + 0.6, z - w], [x, h + 0.6, z + w], [x - 1.5, below, z + w * 1.15], [x - 1.5, below, z - w * 1.15]]), this.fallMat));
        // where it lands: foam, then (above the sea) running across the next step down
        const foam = new THREE.Mesh(new THREE.PlaneGeometry(f.width * 2.2, f.width * 2.2), foamMat);
        foam.rotation.x = -Math.PI / 2; foam.position.set(x - 3, below + 0.05, z);
        this.group.add(foam);
        if (k > 0) {
          const nx = row[k - 1][0];
          this.group.add(new THREE.Mesh(quad([[x - 1.5, below, z - w], [x - 1.5, below, z + w], [nx, below, z + w], [nx, below, z - w]]), this.fallMat));
        } else {
          // mist rising off the sea at the bottom
          const n = 10;
          for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mistMat.clone());
            m.material.uniforms = { time: this.fallMat.uniforms.time };
            m.geometry.setAttribute('aPh', new THREE.Float32BufferAttribute([i / n, i / n, i / n, i / n], 1));
            m.position.set(x - 4 - Math.random() * 8, sea, z + (Math.random() - 0.5) * f.width * 1.5);
            m.frustumCulled = false;
            this.group.add(m);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- sea
  buildSea() {
    const W = CONFIG.world, sea = this.range.seaLevel;
    // where the shore is: a picture of the land seen from above, blurred (wide: shallows; tight: foam)
    const rect = W.shoreRect;   // [x0, z0, width, depth]
    const N = 1024, mk = (blur) => {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
      g.filter = `blur(${blur}px)`;
      g.fillStyle = '#fff';
      for (const P of [this.range.coast, ...this.range.islands.map((i) => i.outline)]) {
        g.beginPath();
        P.forEach(([x, z], k) => { const u = ((x - rect[0]) / rect[2]) * N, v = ((z - rect[1]) / rect[3]) * N; if (k) g.lineTo(u, v); else g.moveTo(u, v); });
        g.closePath(); g.fill();
      }
      return g.getImageData(0, 0, N, N).data;
    };
    const wide = mk(26), tight = mk(3);
    const data = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { data[i * 4] = wide[i * 4]; data[i * 4 + 1] = tight[i * 4]; data[i * 4 + 3] = 255; }
    const shore = new THREE.DataTexture(data, N, N);
    shore.magFilter = shore.minFilter = THREE.LinearFilter;
    shore.needsUpdate = true;
    const art = CONFIG.art;
    this.seaMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, shore: { value: shore }, rect: { value: new THREE.Vector4(...rect) },
        deep: { value: new THREE.Color(W.seaDeep) }, shallow: { value: new THREE.Color(W.seaShallow) }, foam: { value: new THREE.Color(W.foam) },
        sky: { value: new THREE.Color(W.seaSky) }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color(art.sky.sun) },
        haze: { value: new THREE.Color(art.haze) }, hazeFar: { value: art.hazeFar },
      },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float time, hazeFar; uniform sampler2D shore; uniform vec4 rect;
        uniform vec3 deep, shallow, foam, sky, sunDir, sunCol, haze;
        varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float waves(vec2 p){
          return n(p * 0.08 + vec2(time * 0.05, time * 0.03)) * 1.0 + n(p * 0.21 - vec2(time * 0.09, -time * 0.06)) * 0.45
               + n(p * 0.55 + vec2(-time * 0.2, time * 0.15)) * 0.18 + n(p * 1.3 + vec2(time * 0.4, time * 0.3)) * 0.06;
        }
        void main(){
          vec2 uv = (vW.xz - rect.xy) / rect.zw;
          vec2 sh = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(shore, uv).rg : vec2(0.0);
          float e = 0.6, hc = waves(vW.xz);
          vec3 N = normalize(vec3(-(waves(vW.xz + vec2(e, 0.0)) - hc) / e * 1.6, 1.0, -(waves(vW.xz + vec2(0.0, e)) - hc) / e * 1.6));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          vec3 col = mix(deep, shallow, smoothstep(0.02, 0.85, sh.r));
          col = mix(col, sky, 0.15 + fres * 0.55);
          vec3 R = reflect(-V, N);
          float s = max(dot(R, sunDir), 0.0);
          col += sunCol * (pow(s, 400.0) * 4.0 + pow(s, 40.0) * 0.35);
          // foam: the line where the sea meets the shore, frothing
          float edge = smoothstep(0.08, 0.5, sh.g) * (1.0 - smoothstep(0.55, 0.95, sh.g));
          float froth = smoothstep(0.35, 0.75, n(vW.xz * 0.35 + vec2(time * 0.6, 0.0)) * 0.7 + n(vW.xz * 1.1 - time * 0.8) * 0.5);
          col = mix(col, foam, edge * (0.45 + 0.55 * froth));
          float d = length(cameraPosition.xz - vW.xz);
          col = mix(col, haze, smoothstep(hazeFar * 0.25, hazeFar * 1.6, d) * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), this.seaMat);
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.y = sea;
    seaMesh.frustumCulled = false;
    seaMesh.renderOrder = -0.5;
    this.group.add(seaMesh);
  }

  // ---------------------------------------------------------------- land
  // One piece of land: its ground (paving or grass), a sandy beach round it and (the city) a seawall
  buildLand(P, city, isl = null) {
    const W = CONFIG.world, sea = this.range.seaLevel;
    const shape = (pts) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const flat = (pts, y, mat) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape(pts)), mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    // beach: the outline pushed outward
    const out = offsetOutline(P, W.beachWidth, this.world);
    flat(out, sea + 0.25, new THREE.MeshStandardMaterial({ color: W.sand, roughness: 1 }));
    const groundMat = new THREE.MeshStandardMaterial({ map: city || isl?.skyline ? pavingTexture(W.paving) : null, color: city || isl?.skyline ? 0xffffff : W.grass, roughness: 0.95 });
    if (groundMat.map) groundMat.map.repeat.set(1 / 8, 1 / 8);
    const g = flat(P, 0, groundMat);
    g.position.y = 0.002;
    // the seawall: a low pale stone wall dropping from the promenade to the beach
    const pos = [];
    for (let i = 0; i < P.length; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length];
      pos.push(x0, 0.01, z0, x1, 0.01, z1, x1, sea + 0.2, z1, x0, 0.01, z0, x1, sea + 0.2, z1, x0, sea + 0.2, z0);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.computeVertexNormals();
    this.group.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: W.seawall, roughness: 0.9, side: THREE.DoubleSide })));
    // palms along the shore (a promenade)
    const inner = offsetOutline(P, -6, this.world);
    let acc = 0;
    for (let i = 0; i < inner.length; i++) {
      const [x0, z0] = inner[i], [x1, z1] = inner[(i + 1) % inner.length];
      acc += Math.hypot(x1 - x0, z1 - z0);
      if (acc > W.shorePalmEvery) { acc = 0; this.palmSpots.push([x0, 0, z0, 0.8 + rand() * 0.5]); }
    }
    if (isl && !isl.skyline && !isl.headland) this.buildIsland(isl);
  }

  // An island out in the bay: a green hill with a little pastel village and palms
  buildIsland(isl) {
    const W = CONFIG.world, [cx, cz] = isl.center, r = isl.radius;
    const hill = new THREE.ConeGeometry(r * 0.75, r * 0.55, 18, 6);
    const p = hill.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = 1 + (rand() - 0.5) * 0.25;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y + (rand() - 0.5) * r * 0.04);
    }
    hill.computeVertexNormals();
    const hm = new THREE.Mesh(hill, new THREE.MeshStandardMaterial({ color: W.hill, roughness: 1, flatShading: true }));
    hm.position.set(cx, r * 0.27 - 2, cz);
    hm.scale.y = 0.55;
    this.group.add(hm);
    // village: little pastel houses round the hill's foot, terraced up it a bit
    const houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), isl.houses);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (let k = 0; k < isl.houses; k++) {
      const a = rand() * Math.PI * 2, rr = r * (0.45 + rand() * 0.4), hh = 6 + rand() * 10;
      const lift = Math.max(0, (0.8 - rr / r) * r * 0.5) * 0.6;
      m.compose(new THREE.Vector3(cx + Math.cos(a) * rr, lift + hh / 2, cz + Math.sin(a) * rr), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 3), new THREE.Vector3(8 + rand() * 8, hh, 8 + rand() * 8));
      houses.setMatrixAt(k, m);
      houses.setColorAt(k, c.setHex(W.pastels[k % W.pastels.length]));
    }
    houses.castShadow = true;
    this.group.add(houses);
    for (let k = 0; k < 14; k++) { const a = rand() * Math.PI * 2, rr = r * (0.55 + rand() * 0.35); this.palmSpots.push([cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr, 1 + rand() * 0.6]); }
  }

  // ---------------------------------------------------------------- distance
  // A ring of hazy mountains on the horizon (bigger toward the north-west, like the art)
  buildMountains() {
    const W = CONFIG.world;
    const geo = new THREE.ConeGeometry(1, 1, 7, 3);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ fog: false }), W.mountains);
    const m = new THREE.Matrix4(), c = new THREE.Color(), far = new THREE.Color(W.mountainFar), near = new THREE.Color(W.mountainNear);
    for (let i = 0; i < W.mountains; i++) {
      const a = (i / W.mountains) * Math.PI * 2 + rand() * 0.1;
      const big = 0.55 + 0.45 * Math.max(0, Math.cos(a - 2.3));   // (the high range to one side)
      const r = 4200 + rand() * 1400, h = (180 + rand() * 420) * big, w = 500 + rand() * 700;
      m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 20, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6), new THREE.Vector3(w, h, w * (0.6 + rand() * 0.5)));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.copy(near).lerp(far, (r - 4200) / 1400));
    }
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  // Low banks of puffy clouds round the horizon, lit warm on the sun side
  buildClouds() {
    const W = CONFIG.world, n = W.cloudPuffs;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { lit: { value: new THREE.Color(W.cloudLit) }, shade: { value: new THREE.Color(W.cloudShade) }, sunDir: { value: this.sunDir } },
      vertexShader: `
        varying vec2 vUv; varying float vSun;
        uniform vec3 sunDir;
        void main() {
          vUv = uv;
          vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = length(instanceMatrix[0].xyz);
          c.xy += position.xy * vec2(s, s * 0.62);
          vec3 wpos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vSun = max(0.0, dot(normalize(vec3(wpos.x, 0.0, wpos.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))));
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: `
        uniform vec3 lit, shade;
        varying vec2 vUv; varying float vSun;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = dot(p, p);
          if (r > 1.0) discard;
          float a = pow(1.0 - r, 1.5);
          vec3 c = mix(shade, lit, smoothstep(-0.6, 0.8, p.y) * (0.55 + 0.45 * vSun));
          gl_FragColor = vec4(c, a * 0.9);
        }`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let i = 0;
    while (i < n) {
      const a = rand() * Math.PI * 2, r = 1500 + rand() * 1600, y = 70 + rand() * 160, puffs = 6 + Math.floor(rand() * 8);
      for (let k = 0; k < puffs && i < n; k++, i++) {
        const s = 90 + rand() * 180;
        m.compose(new THREE.Vector3(Math.cos(a) * r + (rand() - 0.5) * 260, y + (rand() - 0.3) * 50, Math.sin(a) * r + (rand() - 0.5) * 260), q, new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(i, m);
      }
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  // ---------------------------------------------------------------- life
  // The monorail train running up and down its track
  buildTrain() {
    const M = this.range.monorail, W = CONFIG.world;
    if (!M) return;
    this.train = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.4, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x3d6f9a, emissive: 0x6fa4d4, emissiveIntensity: 0.35, roughness: 0.2 });
    const stripe = new THREE.MeshStandardMaterial({ color: W.trainStripe, roughness: 0.5 });
    for (let k = 0; k < W.trainCars; k++) {
      const car = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 11, 4, 10), body);
      b.rotation.x = Math.PI / 2; b.scale.set(1, 1, 0.95);
      const w = new THREE.Mesh(new THREE.BoxGeometry(3.06, 0.9, 11), glass); w.position.y = 0.35;
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.08, 0.25, 12), stripe); s.position.y = -0.45;
      car.add(b, w, s);
      car.position.z = -k * 14.5;
      b.castShadow = true;
      this.train.add(car);
    }
    this.train.position.set(M.x, M.top + 1.6, M.z0);
    this.group.add(this.train);
  }

  // Boats sailing loops round the bay, each with a white wake
  buildBoats() {
    const W = CONFIG.world, n = W.boats;
    const hullGeo = new THREE.BoxGeometry(1, 1, 1);
    const hp = hullGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) if (hp.getZ(i) < 0) { hp.setX(i, hp.getX(i) * 0.35); if (hp.getY(i) < 0) hp.setZ(i, hp.getZ(i) * 0.6); }   // (a pointed bow)
    hullGeo.computeVertexNormals();
    this.hulls = new THREE.InstancedMesh(hullGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }), n);
    this.cabins = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xf8f6f2, roughness: 0.5 }), n);
    const wakeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * (1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0)); gl_FragColor = vec4(vec3(1.0), a * 0.55); }`,
    });
    const wg = new THREE.PlaneGeometry(1, 1); wg.rotateX(-Math.PI / 2); wg.translate(0, 0, 0.5);
    this.wakes = new THREE.InstancedMesh(wg, wakeMat, n);
    this.boatList = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // a loop out in open water
      let cx, cz, tries = 0;
      do { const a = rand() * Math.PI * 2, r = 350 + rand() * 1500; cx = Math.cos(a) * r + 250; cz = Math.sin(a) * r - 500; tries++; } while (tries < 40 && (this.world.onLand(cx, cz) || this.nearLand(cx, cz, 140)));
      const big = rand() < 0.3;
      this.boatList.push({ cx, cz, r: 40 + rand() * 120, a: rand() * Math.PI * 2, w: (rand() < 0.5 ? -1 : 1) * (5 + rand() * 7), len: big ? 22 : 9 + rand() * 5 });
      this.hulls.setColorAt(i, c.setHex(rand() < 0.5 ? 0xffffff : W.boatColors[i % W.boatColors.length]));
    }
    for (const mesh of [this.hulls, this.cabins, this.wakes]) { mesh.frustumCulled = false; this.group.add(mesh); }
    this.hulls.castShadow = true;
  }

  nearLand(x, z, d) {
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (this.world.onLand(x + Math.cos(a) * d, z + Math.sin(a) * d)) return true; }
    return false;
  }

  // Palms everywhere they've been asked for (shore, islands, streets, rooftops): one instanced mesh
  buildPalms(extra = []) {
    const spots = [...this.palmSpots, ...extra];
    const mesh = new THREE.InstancedMesh(palmGeometry(), [
      new THREE.MeshStandardMaterial({ color: 0x9a7b5c, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: CONFIG.world.palmLeaf, roughness: 0.8, side: THREE.DoubleSide }),
    ], spots.length);
    const m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, y, z, s], i) => {
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, rand() * Math.PI * 2), new THREE.Vector3(s, s * (0.85 + rand() * 0.35), s));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  update(dt, time) {
    this.seaMat.uniforms.time.value = time;
    if (this.fallMat) this.fallMat.uniforms.time.value = time;
    // the train: up the track and back, slowing into each end
    const M = this.range.monorail, W = CONFIG.world;
    if (this.train) {
      const len = Math.abs(M.z1 - M.z0) - W.trainCars * 14.5, period = (len / W.trainSpeed) * 2 + 8;
      const u = (time % period) / period;
      const leg = u < 0.5 ? u * 2 : 2 - u * 2;   // 0 -> 1 -> 0
      const e = leg < 0.5 ? 2 * leg * leg : 1 - 2 * (1 - leg) * (1 - leg);
      this.train.position.z = M.z0 - 4 - e * len;
    }
    // boats round their loops
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sea = this.range.seaLevel;
    this.boatList?.forEach((b, i) => {
      b.a += (b.w / b.r) * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const heading = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w));
      q.setFromAxisAngle(up, heading + Math.PI);
      const bob = Math.sin(time * 1.7 + i) * 0.15;
      m.compose(new THREE.Vector3(x, sea + 0.6 + bob, z), q, new THREE.Vector3(b.len * 0.32, 1.6, b.len)); this.hulls.setMatrixAt(i, m);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      m.compose(new THREE.Vector3(x - fwd.x * b.len * 0.12, sea + 1.9 + bob, z - fwd.z * b.len * 0.12), q, new THREE.Vector3(b.len * 0.22, 1.4, b.len * 0.35)); this.cabins.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x + fwd.x * b.len * 0.45, sea + 0.05, z + fwd.z * b.len * 0.45), q, new THREE.Vector3(b.len * 0.8, 1, b.len * 4)); this.wakes.setMatrixAt(i, m);
    });
    if (this.hulls) for (const mesh of [this.hulls, this.cabins, this.wakes]) mesh.instanceMatrix.needsUpdate = true;
  }
}

// The outline P pushed out (d > 0) or in (d < 0) by d metres
function offsetOutline(P, d, world) {
  const n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = P[(i - 1 + n) % n], [bx, bz] = P[(i + 1) % n], [x, z] = P[i];
    let nx = bz - az, nz = -(bx - ax);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    // (point the normal outward: a step along it should leave the shape)
    if (inside(P, x + nx * 1.5, z + nz * 1.5)) { nx = -nx; nz = -nz; }
    out.push([x + nx * d, z + nz * d]);
  }
  return out;
}
function inside(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// Light warm paving stones, a little worn (repeats every 8 m)
function pavingTexture(col) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const base = new THREE.Color(col);
  g.fillStyle = `#${base.getHexString()}`; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const k = 0.94 + Math.random() * 0.1, cc = base.clone().multiplyScalar(k);
    g.fillStyle = `#${cc.getHexString()}`;
    g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
  }
  g.globalAlpha = 0.05;
  for (let i = 0; i < 1500; i++) { g.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A palm: a gently curved trunk and a crown of drooping fronds (two parts: trunk, leaves)
function palmGeometry() {
  const parts = [], H = 8, bend = 0.9;
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, H, 6, 10, true);
  trunk.translate(0, H / 2, 0);
  const tp = trunk.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) / H; tp.setX(i, tp.getX(i) + bend * y * y); }
  parts.push(trunk);
  const pos = [], idx = [];
  const fronds = 9, segs = 7, L = 3.4;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const base = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const s = k / segs, w = 0.55 * Math.sin(Math.PI * Math.min(1, s * 1.15)) + 0.05;
      const x = bend + dx * s * L, z = dz * s * L, y = H + 0.5 * s - 1.9 * s * s;
      pos.push(x + px * w, y - 0.1 * s, z + pz * w, x - px * w, y - 0.1 * s, z - pz * w);
      if (k) { const b = base + (k - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaves.setIndex(idx);
  leaves.computeVertexNormals();
  // one geometry, two groups (trunk, leaves)
  const g = new THREE.BufferGeometry();
  const tIdx = trunk.index.array, tPos = trunk.attributes.position.array, lPos = leaves.attributes.position.array;
  const allPos = new Float32Array(tPos.length + lPos.length); allPos.set(tPos); allPos.set(lPos, tPos.length);
  const off = tPos.length / 3, allIdx = [...tIdx, ...leaves.index.array].map((v, i) => (i >= tIdx.length ? v + off : v));
  g.setAttribute('position', new THREE.BufferAttribute(allPos, 3));
  g.setIndex(allIdx);
  g.computeVertexNormals();
  g.addGroup(0, tIdx.length, 0);
  g.addGroup(tIdx.length, leaves.index.count, 1);
  return g;
}
