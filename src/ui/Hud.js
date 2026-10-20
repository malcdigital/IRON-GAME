import { events } from '../core/events.js';
import { prompts } from './prompts.js';

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');

function clock(t) {
  if (t == null) return '--:--.-';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

// The helmet display: flight numbers, part status, objectives, warnings and messages.
export class Hud {
  constructor(doc) {
    this.el = doc.getElementById('hud');
    this.readout = doc.getElementById('readout');
    this.systems = doc.getElementById('systems');
    this.objectives = doc.getElementById('objectives');
    this.warnings = doc.getElementById('warnings');
    this.toasts = doc.getElementById('toasts');
    this.help = doc.getElementById('help');
    this.rows = new Map();
    this.lastSlow = 0;
    this.lastWarn = '';
    this.glitchUntil = 0;

    events.on('toast', ({ text, kind }) => this.toast(text, kind));
    events.on('overheat', (c) => this.toast(`${c.label} overheated. Shutting down to cool.`, 'hot'));
    events.on('restart', (c) => this.toast(`${c.label} back online`));
    events.on('destroyed', ({ comp }) => this.toast(`${comp.label} destroyed`, 'hot'));
    events.on('course:start', () => this.toast('Clock started. Follow the bright rings.'));
    events.on('course:finish', ({ time, record }) => this.toast(`Course done in ${clock(time)}${record ? ' · new best' : ''}`, 'good'));
    events.on('chase:start', () => this.toast('The drone is running. Stay close to tag it.', 'hot'));
    events.on('chase:caught', ({ time, record }) => this.toast(`Drone caught in ${clock(time)}${record ? ' · new best' : ''}`, 'good'));
    events.on('chase:lost', () => this.toast('Lost the drone. It went back to its start point.'));
    events.on('missile:hit', ({ damage }) => this.toast(`Missile hit (${Math.round(damage)} damage)`, 'hot'));
    events.on('missile:dodged', () => this.toast('Missile dodged', 'good'));
    events.on('missile:decoyed', () => this.toast('Missile took the flare', 'good'));
    events.on('flares', ({ left }) => this.toast(`Flares out (${left} left)`));
    events.on('cargo:delivered', ({ crate }) => this.toast(`${crate.name} delivered to Tower A`, 'good'));
  }

  show() { this.el.hidden = false; }

  toggleHelp(force) {
    this.help.hidden = force != null ? !force : !this.help.hidden;
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = prompts.format(text);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  buildSystems(suit) {
    this.systems.innerHTML = `
      <div class="sys-head"><span>System</span><span>Thrust</span><span>Heat</span><span>Condition</span></div>`;
    this.rows.clear();
    for (const c of suit.list) {
      const row = document.createElement('div');
      row.className = 'sys-row';
      row.innerHTML = `
        <span class="sys-name">${c.label}</span>
        <span class="meter thr">${c.thruster ? '<i></i>' : '<em>–</em>'}</span>
        <span class="meter heat"><i></i></span>
        <span class="meter hp"><i></i></span>`;
      this.systems.appendChild(row);
      this.rows.set(c.id, {
        row,
        thr: row.querySelector('.thr i'),
        heat: row.querySelector('.heat i'),
        hp: row.querySelector('.hp i'),
      });
    }
  }

  update(t, time) {
    this.updateGlitch(t.glitch, time);
    this.updateWarnings(t);
    if (time - this.lastSlow < 0.08) return;
    this.lastSlow = time;

    const mode = t.mode === 'assist' ? 'Hover · assist'
      : t.mode === 'manual' ? `Hover · manual · ${Math.round(t.throttle * 100)}%`
      : t.carving ? 'Flight · carving' : `Flight · throttle ${Math.round(t.throttle * 100)}%`;
    const twrClass = t.twr < 1 ? 'bad' : t.twr < 1.15 ? 'warn' : '';
    this.readout.innerHTML = `
      <span class="chip ${t.mode}">${mode}</span>
      <dl>
        <div><dt>Alt</dt><dd>${fmt(t.alt)}<small>m</small></dd></div>
        <div><dt>Speed</dt><dd>${Math.round(t.speed * 3.6)}<small>km/h</small></dd></div>
        ${t.mode === 'flight'
          ? `<div><dt>G load</dt><dd class="${t.gLoad > 5 ? 'warn' : ''}">${fmt(t.gLoad)}<small>g</small></dd></div>`
          : `<div><dt>Climb</dt><dd>${t.vs >= 0 ? '+' : ''}${fmt(t.vs)}<small>m/s</small></dd></div>`}
        <div><dt>Thrust / wt</dt><dd class="${twrClass}">${fmt(t.twr, 2)}</dd></div>
        <div><dt>Power</dt><dd class="${t.powerLimited ? 'warn' : ''}">${Math.round(t.powerDraw)}<small>/${Math.round(t.powerOut)} kW</small></dd></div>
        <div><dt>Juke</dt><dd class="pips">${'●'.repeat(Math.floor(t.evadeCharge))}<span>${'○'.repeat(3 - Math.floor(t.evadeCharge))}</span></dd></div>
        <div><dt>Flares</dt><dd class="${t.flares === 0 ? 'bad' : ''}">${t.flares}</dd></div>
        <div><dt>Burst</dt><dd class="${t.launching ? 'warn' : t.launchCharge >= 1 ? 'good' : ''}">${t.launching ? 'Go!' : t.launchCharge >= 1 ? 'Ready' : `${Math.round(t.launchCharge * 100)}%`}</dd></div>
      </dl>`;

    for (const c of t.components) {
      const r = this.rows.get(c.id);
      if (!r) continue;
      if (r.thr) r.thr.style.width = `${Math.round(c.throttle * 100)}%`;
      const heat = Math.min(100, c.heat);
      r.heat.style.width = `${heat}%`;
      r.heat.dataset.level = c.overheated ? 'over' : heat > 80 ? 'hot' : heat > 55 ? 'warm' : 'ok';
      const hp = (c.hp / c.maxHp) * 100;
      r.hp.style.width = `${hp}%`;
      r.hp.dataset.level = hp <= 0 ? 'dead' : hp < 30 ? 'low' : hp < 65 ? 'mid' : 'ok';
      r.row.classList.toggle('offline', c.overheated || c.hp <= 0);
    }

    const co = t.course;
    const cg = t.cargo;
    const crates = cg.crates.map((c) => `<li class="${c.delivered ? 'done' : ''}">${c.name} <small>${c.mass} kg</small></li>`).join('');
    const cargoLine = cg.held
      ? `Carrying <b>${cg.held.name}</b>. Press ${prompts.kbd('grab')} to drop.`
      : cg.inRange ? `Press ${prompts.kbd('grab')} to pick up ${cg.inRange}` : `Fly next to a crate and press ${prompts.kbd('grab')}`;
    const ms = t.missiles;
    const evasionBody = ms.inZone || ms.fired > 0
      ? `<p>${ms.inZone ? '<b>In the zone.</b> Launchers are live.' : 'Outside the zone.'}</p>
         <p>Dodged ${ms.dodged} · Hit ${ms.hits}</p>`
      : `<p>Fly east to the red ring (${Math.round(ms.zoneDistance)} m). Missiles fire while you're airborne inside.</p>`;
    const ch = t.chase;
    const chaseBody = ch.state === 'running'
      ? `<p class="big">${clock(ch.elapsed)}</p>
         <p>Drone ${Math.round(ch.distance)} m away${ch.distance < 16 ? ' · <b>tagging</b>' : ''}</p>
         <div class="tagbar"><i style="width:${Math.round(ch.progress * 100)}%"></i></div>`
      : ch.state === 'caught'
        ? `<p>Caught in ${clock(ch.elapsed)}</p>`
        : `<p>Fly to the red beacon (${Math.round(ch.distance)} m) to start. Best ${clock(ch.best)}</p>`;
    this.objectives.innerHTML = `
      <section>
        <h3>Evasion range</h3>
        ${evasionBody}
      </section>
      <section>
        <h3>Drone chase</h3>
        ${chaseBody}
      </section>
      <section>
        <h3>Ring course</h3>
        <p class="big">${clock(co.elapsed)}</p>
        <p>${co.running ? `Ring ${co.next + 1} of ${co.total}` : 'Fly through ring 1 to start'} · Best ${clock(co.best)}</p>
      </section>
      <section>
        <h3>Lift test · Tower A pad</h3>
        <ul>${crates}</ul>
        <p>${cargoLine}</p>
      </section>
      ${t.atWorkshop ? `<p class="note">On the workshop pad. Press ${prompts.kbd('workshop')} to swap parts.</p>` : ''}`;
  }

  updateWarnings(t) {
    const list = [];
    for (const c of t.components) {
      if (c.hp <= 0) list.push([`${c.label} destroyed`, 'bad']);
      else if (c.overheated) list.push([`${c.label} overheated`, 'bad']);
      else if (c.heat > 85) list.push([`${c.label} hot`, 'warn']);
    }
    if (t.missiles.incoming > 0) {
      const lt = t.missiles.lockTime;
      list.unshift([`Missile${t.missiles.incoming > 1 ? 's' : ''} incoming${Number.isFinite(lt) ? ` · ${lt.toFixed(1)} s` : ''}`, 'bad']);
    }
    if (t.powerLimited) list.push(['Power limit: core can’t keep up', 'warn']);
    if (t.mode !== 'flight' && t.twr < 1 && t.twr > 0) list.push(['Too heavy to climb', 'bad']);
    const key = list.map((w) => w[0]).join('|');
    if (key === this.lastWarn) return;
    this.lastWarn = key;
    this.warnings.innerHTML = list.slice(0, 4).map(([w, k]) => `<span class="warn-pill ${k}">${w}</span>`).join('');
  }

  // A damaged helmet makes the display flicker and jump
  updateGlitch(level, time) {
    if (level > 0.35 && time > this.glitchUntil && Math.random() < level * 0.05) {
      this.glitchUntil = time + 0.06 + Math.random() * 0.12;
      this.el.style.setProperty('--gx', `${(Math.random() - 0.5) * 14 * level}px`);
      this.el.style.setProperty('--gy', `${(Math.random() - 0.5) * 6 * level}px`);
    }
    this.el.classList.toggle('glitch', time < this.glitchUntil);
  }
}
