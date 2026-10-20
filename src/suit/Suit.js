import * as THREE from '../lib/three.js';
import { CONFIG } from '../core/config.js';
import { PARTS, SLOTS, validLoadout } from '../data/parts.js';

// Order components appear in the HUD
const ORDER = ['helmet', 'core', 'chest', 'back', 'handL', 'handR', 'bootL', 'bootR'];

const COMPONENT_LABELS = { helmet: 'Helmet', core: 'Power core', chest: 'Chest' };

// A suit is built from a loadout (one part per slot). Each part becomes one or more
// components that track their own condition (hp) and heat.
export class Suit {
  constructor(loadout) {
    this.loadout = validLoadout(loadout);
    this.components = new Map();
    this.thrusters = [];
    this.powerDraw = 0;
    this.time = 0;
    this.build();
  }

  build() {
    this.mass = CONFIG.pilot.mass;
    for (const slot of SLOTS) {
      const partId = this.loadout[slot];
      const part = PARTS[partId];
      this.mass += part.mass;

      if (part.thrusters) {
        for (const t of part.thrusters) {
          const comp = this.addComponent(t.id, t.label, slot, partId, part, t.hp, t.heatRate, t.cool);
          const d = new THREE.Vector3(...t.dir).normalize();
          comp.thruster = {
            pos: new THREE.Vector3(...CONFIG.mounts[t.mount].pos),
            dir: d,
            torque: new THREE.Vector3().crossVectors(new THREE.Vector3(...CONFIG.mounts[t.mount].pos), d),
            maxThrust: t.thrust,
            powerPerN: t.powerPerN,
            gimbal: THREE.MathUtils.degToRad(t.gimbal || 0),
          };
          comp.available = 0;
          comp.sputterTimer = 0;
          comp.sputterOff = false;
          this.thrusters.push(comp);
        }
      } else {
        this.addComponent(slot, COMPONENT_LABELS[slot], slot, partId, part, part.hp, part.heatRate || 0, part.cool || 0);
      }
    }
    this.list = ORDER.map((id) => this.components.get(id)).filter(Boolean);
  }

  addComponent(id, label, slot, partId, part, baseHp, heatRate, cool) {
    const hp = baseHp * CONFIG.damage.durability;
    const comp = {
      id, label, slot, partId, part,
      hp, maxHp: hp, heat: 0, heatRate, cool,
      overheated: false, throttle: 0,
    };
    this.components.set(id, comp);
    return comp;
  }

  get(id) { return this.components.get(id); }

  ratio(comp) { return comp.maxHp > 0 ? comp.hp / comp.maxHp : 0; }

  repair() {
    for (const c of this.components.values()) {
      c.hp = c.maxHp;
      c.heat = 0;
      c.overheated = false;
    }
  }

  // ---- What each part currently contributes (after damage and heat) ----

  get core() { return this.get('core'); }

  powerOutput() {
    const core = this.core;
    if (core.hp <= 0) return core.part.power * 0.25;
    return core.part.power * (0.5 + 0.5 * this.ratio(core)) * (core.overheated ? 0.5 : 1);
  }

  gyroTorque() {
    const h = this.get('helmet');
    return h.part.gyro * (0.3 + 0.7 * this.ratio(h));
  }

  assistGain() {
    const h = this.get('helmet');
    return h.part.assist * (0.6 + 0.4 * this.ratio(h));
  }

  armor() {
    const c = this.get('chest');
    return c.hp > 0 ? c.part.armor : 1;
  }

  coolMult() { return this.get('chest').part.coolMult; }

  // 0 = clear HUD, 1 = badly broken helmet
  hudGlitch() { return 1 - this.ratio(this.get('helmet')); }

  // ---- Static numbers for the workshop ----
  stats() {
    const g = CONFIG.physics.gravity;
    let lift = 0, demand = 0;
    for (const t of this.thrusters) {
      lift += t.thruster.maxThrust * t.thruster.dir.y;
      demand += t.thruster.maxThrust * t.thruster.powerPerN;
    }
    return {
      mass: this.mass,
      lift,
      twr: lift / (this.mass * g),
      powerDemand: demand,
      powerOutput: this.core.part.power,
      armor: this.get('chest').part.armor,
      coolMult: this.coolMult(),
      gyro: this.get('helmet').part.gyro,
    };
  }

  static summarize(loadout) { return new Suit(loadout).stats(); }
}
