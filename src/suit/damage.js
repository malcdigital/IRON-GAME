import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';

// Lower a component's condition. Emits 'damaged' and 'destroyed' events.
export function damageComponent(suit, comp, amount, source = 'impact') {
  if (!comp || comp.hp <= 0 || amount <= 0) return 0;
  const before = comp.hp;
  comp.hp = Math.max(0, comp.hp - amount);
  if (comp.hp === 0) events.emit('destroyed', { comp, source });
  else if (source === 'impact' && amount >= 3) events.emit('damaged', { comp, amount });
  return before - comp.hp;
}

// A hit to a body zone. Chest armor protects the torso; the core sits behind it.
export function applyZoneDamage(suit, zone, amount) {
  if (zone === 'chest') {
    const chest = suit.get('chest');
    const armor = suit.armor();
    if (chest.hp > 0) {
      damageComponent(suit, chest, amount / armor);
      damageComponent(suit, suit.core, (amount * 0.15) / armor);
    } else {
      damageComponent(suit, suit.core, amount);
    }
    return;
  }
  damageComponent(suit, suit.get(zone), amount);
}

export function impactDamage(speed) {
  const d = CONFIG.damage;
  if (speed <= d.safeImpactSpeed) return 0;
  return Math.pow(speed - d.safeImpactSpeed, d.impactExp) * d.impactScale;
}

// How well a thruster works at its current condition (0..1)
export function efficiency(suit, comp) {
  if (comp.hp <= 0) return 0;
  const min = CONFIG.damage.minEfficiency;
  return min + (1 - min) * suit.ratio(comp);
}

// Work out how much thrust each thruster can give right now.
export function updateThrusterAvailability(suit, boost, dt) {
  const d = CONFIG.damage;
  for (const t of suit.thrusters) {
    // Badly damaged thrusters cut out at random
    const r = suit.ratio(t);
    t.sputterTimer -= dt;
    if (t.sputterTimer <= 0) {
      t.sputterTimer = 0.12 + Math.random() * 0.2;
      t.sputterOff = r < d.sputterBelow && Math.random() < 0.6 * (1 - r / d.sputterBelow);
    }
    if (t.overheated || t.hp <= 0 || t.sputterOff) {
      t.available = 0;
      continue;
    }
    t.available = t.thruster.maxThrust * efficiency(suit, t) * (boost ? CONFIG.boost.thrustMult : 1);
  }
}
