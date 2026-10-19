import { events } from '../core/events.js';
import { SLOTS, SLOT_LABELS, STARTER_LOADOUT, partsForSlot } from '../data/parts.js';
import { Suit } from '../suit/Suit.js';

function partStats(p) {
  if (p.thrusters) {
    const t = p.thrusters[0], n = p.thrusters.length;
    return `${n > 1 ? `${n} × ` : ''}${t.thrust} N · heat ${t.heatRate}/s · ${t.hp} hp · ${p.mass} kg`;
  }
  if (p.slot === 'core') return `${p.power} kW output · ${p.hp} hp · ${p.mass} kg`;
  if (p.slot === 'chest') return `Armor ×${p.armor} · cooling ×${p.coolMult} · ${p.hp} hp · ${p.mass} kg`;
  if (p.slot === 'helmet') return `Gyro ${p.gyro} N·m · assist ${Math.round(p.assist * 100)}% · ${p.mass} kg`;
  return `${p.mass} kg`;
}

// Loadout screen. Pick one part per slot and see the numbers change before you fly.
export class Workshop {
  constructor(root) {
    this.root = root;
    this.draft = null;
    root.addEventListener('change', (e) => {
      if (e.target.name?.startsWith('slot-')) {
        this.draft[e.target.name.slice(5)] = e.target.value;
        this.renderSummary();
      }
    });
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'apply') events.emit('workshop:apply', { ...this.draft });
      if (act === 'close') this.close();
      if (act === 'starter') { this.draft = { ...STARTER_LOADOUT }; this.render(); }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  get isOpen() { return !this.root.hidden; }

  open(loadout) {
    this.draft = { ...loadout };
    this.render();
    this.root.hidden = false;
    this.root.querySelector('[data-act="apply"]').focus();
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    events.emit('workshop:close');
  }

  render() {
    const slots = SLOTS.map((slot) => {
      const options = partsForSlot(slot).map((p) => `
        <label class="part">
          <input type="radio" name="slot-${slot}" value="${p.id}" id="part-${p.id}" ${this.draft[slot] === p.id ? 'checked' : ''}>
          <span class="part-body">
            <span class="part-top"><b>${p.name}</b><span class="tier t${p.tier}">Tier ${p.tier}</span></span>
            <span class="part-stats">${partStats(p)}</span>
            <span class="part-blurb">${p.blurb}</span>
          </span>
        </label>`).join('');
      return `<fieldset class="slot"><legend>${SLOT_LABELS[slot]}</legend><div class="part-list">${options}</div></fieldset>`;
    }).join('');

    this.root.innerHTML = `
      <div class="ws-panel" role="dialog" aria-label="Workshop">
        <header class="ws-head">
          <div>
            <h2>Workshop</h2>
            <p>Swap parts, check the numbers, then fly it. Applying a build puts you back on the pad, repaired.</p>
          </div>
          <button class="icon-btn" data-act="close" aria-label="Close workshop">✕</button>
        </header>
        <div class="ws-summary" id="ws-summary"></div>
        <div class="ws-slots">${slots}</div>
        <footer class="ws-foot">
          <button class="btn ghost" data-act="starter">Starter build</button>
          <button class="btn ghost" data-act="close">Cancel</button>
          <button class="btn primary" data-act="apply">Fly this build</button>
        </footer>
      </div>`;
    this.renderSummary();
  }

  renderSummary() {
    const s = Suit.summarize(this.draft);
    const twrPct = Math.min(100, (s.twr / 3.5) * 100);
    const onePct = (1 / 3.5) * 100;
    const powerPct = Math.min(100, (s.powerDemand / s.powerOutput) * 100);
    const verdict = s.twr < 1
      ? ['bad', 'Too heavy. This build can’t leave the ground.']
      : s.twr < 1.2 ? ['warn', 'Barely flies. Expect to run hot.']
      : s.powerDemand > s.powerOutput ? ['warn', 'Thrusters want more power than the core gives. They’ll be held back.']
      : ['good', 'Ready to fly.'];
    this.root.querySelector('#ws-summary').innerHTML = `
      <div class="stat"><span>Weight</span><b>${Math.round(s.mass)} kg</b></div>
      <div class="stat"><span>Max lift</span><b>${Math.round(s.lift)} N</b></div>
      <div class="stat wide">
        <span>Thrust to weight</span><b>${s.twr.toFixed(2)}</b>
        <div class="gauge"><i style="width:${twrPct}%" class="${s.twr < 1 ? 'bad' : ''}"></i><em style="left:${onePct}%"></em></div>
      </div>
      <div class="stat wide">
        <span>Power use at full thrust</span><b>${Math.round(s.powerDemand)} / ${s.powerOutput} kW</b>
        <div class="gauge"><i style="width:${powerPct}%" class="${s.powerDemand > s.powerOutput ? 'warn' : ''}"></i></div>
      </div>
      <div class="stat"><span>Armor</span><b>×${s.armor}</b></div>
      <div class="stat"><span>Cooling</span><b>×${s.coolMult}</b></div>
      <div class="stat"><span>Gyro</span><b>${s.gyro} N·m</b></div>
      <p class="verdict ${verdict[0]}">${verdict[1]}</p>`;
  }
}

