import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';
import { damageComponent } from './damage.js';

// Heat builds with use and bleeds off faster the hotter a part is.
// At 100% a part shuts down until it cools. Running very hot wears parts out.
function stepHeat(suit, comp, gain, coolMult, dt) {
  const h = CONFIG.heat;
  const cool = comp.cool * coolMult * (comp.heat / 100) + h.passiveCool;
  comp.heat = Math.min(120, Math.max(0, comp.heat + (gain - cool) * dt));

  if (!comp.overheated && comp.heat >= h.overheatAt) {
    comp.overheated = true;
    events.emit('overheat', comp);
  } else if (comp.overheated && comp.heat <= h.restartBelow) {
    comp.overheated = false;
    events.emit('restart', comp);
  }
  if (comp.heat > h.wearAbove) damageComponent(suit, comp, h.wearRate * dt, 'heat');
}

export function updateHeat(suit, dt, boost) {
  const coolMult = suit.coolMult();
  const boostMult = boost ? CONFIG.boost.heatMult : 1;
  for (const t of suit.thrusters) {
    stepHeat(suit, t, t.throttle * t.heatRate * boostMult, coolMult, dt);
  }
  const core = suit.core;
  const load = suit.powerDraw / core.part.power;
  stepHeat(suit, core, load * core.heatRate, coolMult, dt);
}
