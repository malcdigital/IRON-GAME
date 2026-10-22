import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { hazardTexture, padTexture, sheetMetalTexture } from './textures.js';
import { CityScenery } from './CityScenery.js';
import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';

// Draws the world: the solid things from World data (buildings, towers, the monorail track, the
// bridge, the skyline across the bay), the rings, and the coastal city scenery around it all.
// Pastel coastal city at sunset (CONFIG.world).

let seed = 99;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const SOLID = { wall: 0xe9d8c2, block: 0xe2cdb6, junk: 0x9a6a46, pillar: 0xe4d2bb, rail: 0xf3efe8, railPillar: 0xe7ddd0, bridgeDeck: 0xece4d8, bridgePier: 0xd6c6b0, bridgePylon: 0xf6f1e8 };

export class WorldView {
  constructor(scene, world, renderer) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.scenery = new CityScenery(scene, world, renderer);
    this.roofPalms = [];
    this.buildPad();
    this.merge = { facade: [[], [], [], []], cap: [], garden: [], room: [], cliff: [], cliffTop: [], deck: [], mech: [], panel: [], glass: [], beacon: [] };
    this.buildBoxes();
    this.buildMerged();
    this.buildStreets();
    this.buildPark();
    this.buildStreetPalms();
    this.scenery.buildPalms(this.roofPalms);
    this.buildRings();
  }

  buildPad() {
    const pad = this.world.workshopPad;
    const padMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.radius * 2, pad.radius * 2),
      new THREE.MeshStandardMaterial({ map: padTexture('W'), roughness: 0.8 }),
    );
    padMesh.rotation.x = -Math.PI / 2;
    padMesh.position.copy(pad.pos).setY(0.03);
    padMesh.receiveShadow = true;
    this.group.add(padMesh);
  }

  buildBoxes() {
    const W = CONFIG.world;
    const metal = sheetMetalTexture();
    let bIndex = 0;
    let padLetter = 'A'.charCodeAt(0);
    for (const c of this.world.colliders) {
      const size = new THREE.Vector3().subVectors(c.max, c.min);
      let mat;
      if (c.kind === 'building' || c.kind === 'skyline') {
        // (merged into a few big meshes: see buildMerged)
        const variant = c.kind === 'skyline' ? 3 : bIndex % 3;
        const col = c.kind === 'skyline' ? (rand() < 0.5 ? 0xf4f1ee : W.pastels[bIndex % W.pastels.length]) : W.pastels[(bIndex * 7 + Math.floor(rand() * 3)) % W.pastels.length];
        this.merge.facade[variant].push(worldBox(size, c.center, col, variant === 3 ? 8 : 6, 4));
        bIndex++;
        this.roof(c);
        if (c.kind === 'skyline' && c.spire) this.spire(c, size);
        continue;
      }
      if (c.kind === 'cliff') {
        // sandstone terraces (merged): warm rock faces, green on top
        const k = c.tier, warm = new THREE.Color(0xf0c79a).lerp(new THREE.Color(0xf6dcb8), k / 4).multiplyScalar(1.05 + rand() * 0.15);
        this.merge.cliff.push(worldBox(size, c.center, warm.getHex(), 10, 7));
        this.merge.cliffTop.push(worldBox(new THREE.Vector3(size.x + 0.4, 0.6, size.z + 0.02), new THREE.Vector3(c.center.x, c.max.y + 0.2, c.center.z), 0x6fa25a));
        for (let n = 0; n < 2; n++) if (rand() < 0.55) this.roofPalms.push([c.min.x + 3 + rand() * 6, c.max.y + 0.5, c.min.z + rand() * size.z, 0.8 + rand() * 0.5]);
        continue;
      }
      if (c.kind === 'tower') {
        // the landing towers: pastel stucco with windows (some lit warm)
        const f = this.towerFacade ??= facadeTextures(0);
        const map = f.map.clone(), em = f.lit.clone();
        for (const t of [map, em]) { t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(Math.max(size.x, size.z) / 6)), Math.max(1, Math.round(size.y / 4))); }
        mat = new THREE.MeshStandardMaterial({
          map, emissiveMap: em, emissive: 0xffc68a, emissiveIntensity: 0.9,
          color: c.kind === 'skyline' ? (rand() < 0.5 ? 0xf4f1ee : W.pastels[bIndex % W.pastels.length]) : W.pastels[bIndex % W.pastels.length],
          roughness: c.kind === 'skyline' ? 0.35 : 0.85, metalness: c.kind === 'skyline' ? 0.25 : 0,
        });
        bIndex++;
      } else if (c.kind === 'shed') {
        const tex = metal.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(size.x, size.z) / 4, size.y / 4);
        mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xe8eef2, roughness: 0.6, metalness: 0.3 });
      } else {
        mat = new THREE.MeshStandardMaterial({ color: SOLID[c.kind] ?? 0xddd2c2, roughness: 0.85 });
      }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
      mesh.position.copy(c.center);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);

      if (c.kind === 'pillar' || c.kind === 'block') this.roof(c);   // (a proper rooftop up there too)
      if (c.kind === 'bridgeDeck') this.bridgeDetail(c, size);
      if (c.kind === 'bridgePylon') this.cables(c);
      if (c.pad) {
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(size.x * 0.96, size.z * 0.96),
          new THREE.MeshStandardMaterial({ map: padTexture(String.fromCharCode(padLetter++)), roughness: 0.8 }),
        );
        top.rotation.x = -Math.PI / 2;
        top.position.set(c.center.x, c.max.y + 0.02, c.center.z);
        top.receiveShadow = true;
        this.group.add(top);
      }
      if (c.kind === 'tower') {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(size.x + 0.05, 0.6, size.z + 0.05),
          new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 }),
        );
        band.position.set(c.center.x, c.max.y - 0.5, c.center.z);
        this.group.add(band);
      }
    }
  }

  // All the buildings in a handful of meshes (one per facade style), and their roofs
  buildMerged() {
    const facades = [0, 1, 2, 3].map((v) => facadeTextures(v % 3, v === 3));
    this.merge.facade.forEach((list, v) => {
      if (!list.length) return;
      const f = facades[v];
      const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.lit, emissive: 0xffc68a, emissiveIntensity: 0.9, vertexColors: true, roughness: v === 3 ? 0.35 : 0.85, metalness: v === 3 ? 0.25 : 0 });
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    });
    if (this.merge.cliff.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.merge.cliff), new THREE.MeshStandardMaterial({ map: rockTexture(), vertexColors: true, roughness: 0.95, emissive: 0x3a2414, emissiveIntensity: 0.35 }));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    for (const [k, rough] of [['cap', 0.8], ['garden', 1], ['room', 0.8], ['cliffTop', 1]]) {
      if (!this.merge[k].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(this.merge[k]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough }));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // rooftops: the membrane, the machinery, solar panels, skylights and the red lights on the masts
    const roofMats = {
      deck: new THREE.MeshStandardMaterial({ map: roofTexture(), vertexColors: true, roughness: 0.95 }),
      mech: new THREE.MeshStandardMaterial({ map: grilleTexture(), vertexColors: true, roughness: 0.55, metalness: 0.35 }),
      panel: new THREE.MeshStandardMaterial({ map: solarTexture(), vertexColors: true, roughness: 0.25, metalness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.4, emissive: 0x8fb6d8, emissiveIntensity: 0.15 }),
      beacon: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xff2a1a, emissiveIntensity: 2.2 }),
    };
    for (const [k, mat] of Object.entries(roofMats)) {
      if (!this.merge[k].length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(this.merge[k]), mat);
      mesh.castShadow = k !== 'deck' && k !== 'beacon';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Streets: asphalt under each city block with a pale sidewalk round the block (and the same
  // for the downtown grid)
  buildStreets() {
    const range = this.world.range, asphalt = [], walk = [];
    const add = (x, z, pitch, block) => {
      // (heights spaced a few cm apart so the layers never flicker through each other far away)
      asphalt.push(worldBox(new THREE.Vector3(pitch, 0.035, pitch), new THREE.Vector3(x, 0.0175, z), 0x5d5a63));
      walk.push(worldBox(new THREE.Vector3(block + 4, 0.08, block + 4), new THREE.Vector3(x, 0.04, z), 0xe6dccd));
    };
    for (const [x, z] of range.cityCells ?? []) add(x, z, range.cityGrid.pitch, range.cityGrid.block);
    const blds = this.world.colliders.filter((c) => c.id?.startsWith('bld-'));
    for (const c of blds) add(c.center.x, c.center.z, 40, 24);
    for (const [list, rough] of [[asphalt, 0.95], [walk, 0.9]]) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough }));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // The missile range: a big green park with the pillars standing in it like monuments
  buildPark() {
    const P = this.world.range.park;
    if (!P) return;
    const g = new THREE.Mesh(new THREE.CircleGeometry(P.radius, 64), new THREE.MeshStandardMaterial({ color: CONFIG.world.grass, roughness: 1 }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(P.center[0], 0.03, P.center[1]);
    g.receiveShadow = true;
    this.group.add(g);
    for (let k = 0; k < 40; k++) { const a = rand() * Math.PI * 2, r = 30 + rand() * (P.radius - 40); this.roofPalms.push([P.center[0] + Math.cos(a) * r, 0, P.center[1] + Math.sin(a) * r, 0.9 + rand() * 0.5]); }
  }

  // A rooftop: drawn from the world's roof layout (src/world/roofs.js), which the physics shares
  roof(c) {
    if (!c.roof) return;
    const M = this.merge, V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    for (const q of c.roof.pieces) {
      const list = M[q.list];
      if (q.t === 'box') list.push(worldBox(V(q.s), V(q.p), q.col, q.uw, q.uh));
      else if (q.t === 'cyl') list.push(worldCyl(q.r, q.h, V(q.p), q.col, q.seg));
      else if (q.t === 'cone') list.push(worldCone(q.r, q.h, V(q.p), q.col));
      else if (q.t === 'sphere') list.push(worldSphere(q.r, V(q.p), q.col));
      else if (q.t === 'panel') list.push(colorize(new THREE.BoxGeometry(q.s[0], q.s[1], q.s[2]).rotateX(q.tilt).translate(q.p[0], q.p[1], q.p[2]), q.col));
    }
    for (const pl of c.roof.palms) this.roofPalms.push(pl);
  }

  spire(c, size) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(Math.min(size.x, size.z) * 0.18, size.y * 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xf7f4ef, roughness: 0.3, metalness: 0.4 }));
    s.position.set(c.center.x, c.max.y + size.y * 0.125, c.center.z);
    this.group.add(s);
  }

  // The bridge deck: railings along both sides and a line of lamps
  bridgeDetail(c, size) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.6 });
    for (const dx of [-size.x / 2 + 0.3, size.x / 2 - 0.3]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, size.z), mat);
      rail.position.set(c.center.x + dx, c.max.y + 0.6, c.center.z);
      this.group.add(rail);
    }
  }

  // Cables fanning from a bridge pylon down to the deck
  cables(c) {
    const bridge = this.world.range.bridge, pts = [];
    const top = new THREE.Vector3(c.center.x, c.max.y - 4, c.center.z);
    for (let k = 1; k <= 8; k++) for (const s of [-1, 1]) pts.push(top.x, top.y, top.z, top.x, bridge.deck + 1.5, top.z + s * k * 22);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })));
  }

  // Palms down both sides of the downtown streets, on the corners of the city blocks, and round
  // the plaza at the workshop
  buildStreetPalms() {
    const W = CONFIG.world, range = this.world.range;
    const blds = this.world.colliders.filter((c) => c.id?.startsWith('bld-'));
    if (blds.length) {
      const xs = [...new Set(blds.map((c) => Math.round(c.center.x)))].sort((a, b) => a - b);
      const zs = blds.map((c) => c.center.z), zMin = Math.min(...zs) - 20, zMax = Math.max(...zs) + 20;
      for (let i = 0; i < xs.length - 1; i++) {
        const street = (xs[i] + xs[i + 1]) / 2;
        for (let z = zMax; z > zMin; z -= W.streetPalmEvery) for (const s of [-1, 1]) this.roofPalms.push([street + s * 6.2, 0, z + (s > 0 ? W.streetPalmEvery / 2 : 0), 0.85 + rand() * 0.3]);
      }
    }
    const g = range.cityGrid;
    for (const [x, z] of range.cityCells ?? []) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      if (rand() < 0.5) continue;
      const px = x + a * (g.block / 2 + 3), pz = z + b * (g.block / 2 + 3);
      if (this.world.onLand(px, pz)) this.roofPalms.push([px, 0, pz, 0.8 + rand() * 0.4]);
    }
    // the plaza: a palm-lined boulevard from the workshop toward downtown, with lawns either side
    for (let z = -30; z > -320; z -= 22) for (const x of [-11, 11]) this.roofPalms.push([x, 0, z, 1 + rand() * 0.2]);
    const lawn = new THREE.MeshStandardMaterial({ color: W.grass, roughness: 1 });
    for (const [x, z, w, d] of [[-48, -120, 50, 150], [48, -120, 50, 150], [-48, -270, 50, 100], [48, -270, 50, 100], [-55, 30, 40, 40], [55, 30, 40, 40]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lawn);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.receiveShadow = true;
      this.group.add(m);
    }
  }

  buildRings() {
    this.ringMeshes = this.world.rings.map((r) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.4 });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(r.radius, 0.16, 8, 40), mat);
      mesh.position.copy(r.center);
      // Torus faces +Z by default; turn it to face along the path
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.normal);
      this.group.add(mesh);
      return mesh;
    });
  }

  // Highlight the next ring; move the sea, train and boats
  update(course, time, dt = 0.016) {
    this.scenery.update(dt, time);
    this.ringMeshes.forEach((m, i) => {
      const isNext = i === course.next;
      const done = course.running && i < course.next;
      m.material.color.setHex(done ? 0x55606b : isNext ? 0xffd27a : 0xf0a830);
      m.material.emissiveIntensity = isNext ? 0.8 + Math.sin(time * 6) * 0.3 : done ? 0 : 0.2;
      m.scale.setScalar(isNext ? 1 + Math.sin(time * 4) * 0.03 : 1);
    });
  }
}

// Facade textures: pale wall (tinted by the building colour) with rows of windows, and a matching
// glow map where some windows are lit warm (the sun is going down). glass: the skyline's curtain walls.
function facadeTextures(variant, glass = false) {
  const W = 64, H = 64;
  const c = document.createElement('canvas'), l = document.createElement('canvas');
  c.width = l.width = W; c.height = l.height = H;
  const g = c.getContext('2d'), gl = l.getContext('2d');
  g.fillStyle = glass ? '#c9d8e4' : '#ffffff'; g.fillRect(0, 0, W, H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);
  const cols = glass ? 4 : [2, 3, 2][variant], rows = glass ? 4 : 2;
  const cw = W / cols, rh = H / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const wx = x * cw + (glass ? 1 : cw * 0.22), wy = y * rh + (glass ? 1 : rh * 0.25), ww = glass ? cw - 2 : cw * 0.56, wh = glass ? rh - 2 : rh * 0.5;
    g.fillStyle = glass ? (Math.random() < 0.5 ? '#7fa3c2' : '#9cb8cf') : '#6e8fae';
    g.fillRect(wx, wy, ww, wh);
    if (!glass) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(wx, wy + wh, ww, 2); }   // (sill)
    if (Math.random() < CONFIG.world.litWindows) { gl.fillStyle = Math.random() < 0.5 ? '#ffcf8a' : '#ffb766'; gl.fillRect(wx, wy, ww, wh); }
  }
  if (!glass && variant === 1) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, H / 2 - 2, W, 3); }   // (a ledge)
  const map = new THREE.CanvasTexture(c), lit = new THREE.CanvasTexture(l);
  for (const t of [map, lit]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; }
  return { map, lit };
}

// A box as geometry placed in the world, with its colour in the vertex colours and its texture
// tiling by size (a texture repeat every uw metres across and uh up), ready to merge
function colorize(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}
const worldCyl = (r, h, center, color, seg = 10) => colorize(new THREE.CylinderGeometry(r, r, h, seg).translate(center.x, center.y, center.z), color);
const worldCone = (r, h, center, color) => colorize(new THREE.ConeGeometry(r, h, 14).translate(center.x, center.y, center.z), color);
const worldSphere = (r, center, color) => colorize(new THREE.SphereGeometry(r, 8, 6).translate(center.x, center.y, center.z), color);

// Roof membrane: pale with seam lines, soft stains and the odd drain (tinted by the roof's colour)
function roofTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {   // (fine grit)
    const v = 200 + Math.random() * 55;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  for (let i = 0; i < 9; i++) {   // (stains)
    const x = Math.random() * 256, y = Math.random() * 256, r = 15 + Math.random() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(120,110,100,0.12)'); gr.addColorStop(1, 'rgba(120,110,100,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(110,105,100,0.35)'; g.lineWidth = 2;   // (membrane seams)
  for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  for (let x = 0; x <= 256; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.fillStyle = 'rgba(60,60,65,0.6)'; g.beginPath(); g.arc(190, 160, 5, 0, Math.PI * 2); g.fill();   // (drain)
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Machinery: horizontal louvres / grille lines
function grilleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(90,95,105,0.35)';
  for (let y = 4; y < 64; y += 6) g.fillRect(4, y, 56, 2);
  g.strokeStyle = 'rgba(80,85,95,0.5)'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Solar panel: dark blue cells with silver lines
function solarTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#1d2c52'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = 'rgba(200,210,230,0.55)'; g.lineWidth = 1;
  for (let x = 0; x <= 128; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); }
  for (let y = 0; y <= 32; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function worldBox(size, center, color, uw = 6, uh = 4) {
  const g = new THREE.BoxGeometry(size.x, size.y, size.z);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const across = ax > 0.5 ? size.z : size.x, up = ay > 0.5 ? size.z : size.y;
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(across / uw)), uv.getY(i) * Math.max(1, Math.round(up / (ay > 0.5 ? uw : uh))));
  }
  g.translate(center.x, center.y, center.z);
  const c = new THREE.Color(color), cols = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// Sandstone: horizontal strata with streaks and pockets (tinted by the cliff's colour)
function rockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4 + Math.random() * 10) {
    g.fillStyle = `rgba(150, 95, 60, ${0.04 + Math.random() * 0.08})`;
    g.fillRect(0, y, 128, 2 + Math.random() * 4);
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(90, 60, 40, ${0.05 + Math.random() * 0.1})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 6 + Math.random() * 20);
  }
  for (let i = 0; i < 25; i++) {
    g.fillStyle = `rgba(80, 120, 60, ${0.15 + Math.random() * 0.2})`;   // (plants growing in the cracks)
    g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
