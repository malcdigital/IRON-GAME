import * as THREE from '../lib/three.js';

// Procedural textures drawn on a canvas, so the game ships with no image files.

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

// Cracked concrete with painted 4 m grid lines
export function concreteTexture(repeat) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#8b8577';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 110 + Math.random() * 50;
      g.fillStyle = `rgba(${v},${v - 4},${v - 14},0.35)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(60,55,48,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(240,168,48,0.55)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
  }, repeat);
}

// Yellow/black hazard stripes
export function hazardTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#1d1d1b';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8a623';
    for (let i = -s; i < s * 2; i += 32) {
      g.beginPath();
      g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s);
      g.closePath(); g.fill();
    }
  });
}

// Landing pad: hazard border, circle and a letter
export function padTexture(letter) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#3a3a36';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#e8a623';
    for (let i = -s; i < s * 2; i += 24) {
      g.save();
      g.beginPath(); g.rect(0, 0, s, s); g.rect(18, 18, s - 36, s - 36); g.clip('evenodd');
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 12, 0); g.lineTo(i + 12 - s, s); g.lineTo(i - s, s); g.fill();
      g.restore();
    }
    g.strokeStyle = '#ece6d6';
    g.lineWidth = 8;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ece6d6';
    g.font = `bold ${s * 0.3}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, s / 2, s / 2 + 4);
  });
}

// Office-block windows: lit and dark panes on a concrete face
export function windowsTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#6d6f6c';
    g.fillRect(0, 0, s, s);
    const n = 4, cell = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const lit = Math.random() < 0.12;
        g.fillStyle = lit ? '#c8ab76' : `rgb(${40 + Math.random() * 20},${52 + Math.random() * 20},${62 + Math.random() * 20})`;
        g.fillRect(i * cell + 5, j * cell + 6, cell - 10, cell - 12);
      }
    }
  });
}

// Corrugated sheet metal for the workshop walls
export function sheetMetalTexture() {
  return canvasTexture(128, (g, s) => {
    for (let x = 0; x < s; x++) {
      const v = 95 + Math.sin((x / s) * Math.PI * 16) * 22;
      g.fillStyle = `rgb(${v},${v + 6},${v + 8})`;
      g.fillRect(x, 0, 1, s);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(120,70,40,${Math.random() * 0.25})`;
      g.fillRect(Math.random() * s, Math.random() * s, 6 + Math.random() * 20, 3 + Math.random() * 10);
    }
  });
}
