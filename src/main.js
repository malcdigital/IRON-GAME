// Wires everything together. Each system lives in its own module; this file only connects them.
import { CONFIG } from './core/config.js';
import { events } from './core/events.js';
import { storage } from './core/storage.js';
import { STARTER_LOADOUT, validLoadout } from './data/parts.js';
import { Game } from './game/Game.js';
import { Renderer } from './render/Renderer.js';
import { WorldView } from './render/WorldView.js';
import { SuitView } from './render/SuitView.js';
import { CargoView } from './render/CargoView.js';
import { Effects } from './render/Effects.js';
import { CameraRig } from './render/CameraRig.js';
import { SpeedLines } from './render/SpeedLines.js';
import { VaporTrails } from './render/VaporTrails.js';
import { MissileView } from './render/MissileView.js';
import { ChaseView } from './render/ChaseView.js';
import { Hud } from './ui/Hud.js';
import { Workshop } from './ui/Workshop.js';
import { Input } from './ui/Input.js';
import { ThreatMarkers } from './ui/ThreatMarkers.js';
import { prompts } from './ui/prompts.js';

function start(hotData) {
  const loadout = validLoadout(hotData?.loadout ?? storage.get('loadout') ?? STARTER_LOADOUT);
  const game = new Game(loadout);

  const renderer = new Renderer(document.getElementById('viewport'));
  const worldView = new WorldView(renderer.scene, game.world);
  const suitView = new SuitView(renderer.scene);
  suitView.build(game.suit);
  const cargoView = new CargoView(renderer.scene, game.cargo);
  const effects = new Effects(renderer.scene);
  const cam = new CameraRig(renderer.camera);
  const speedLines = new SpeedLines(renderer.scene);
  const vapor = new VaporTrails(renderer.scene);
  const missileView = new MissileView(renderer.scene, game.missiles);
  const chaseView = new ChaseView(renderer.scene, game.chase);

  const hud = new Hud(document);
  hud.buildSystems(game.suit);
  const workshop = new Workshop(document.getElementById('workshop'));
  const input = new Input(window, CONFIG.keys);
  const threats = new ThreatMarkers(document.getElementById('hud'));
  prompts.apply(document);

  let started = false;
  let paused = true;

  const startEl = document.getElementById('start');
  document.getElementById('btn-start').addEventListener('click', () => {
    startEl.hidden = true;
    hud.show();
    started = true;
    paused = false;
    document.activeElement?.blur();
  });
  document.getElementById('btn-workshop').addEventListener('click', () => toggleWorkshop());
  document.getElementById('btn-help').addEventListener('click', () => hud.toggleHelp());
  document.getElementById('btn-reset').addEventListener('click', () => { document.activeElement?.blur(); handleAction('reset'); });

  function toggleWorkshop() {
    if (!started) return;
    if (workshop.isOpen) workshop.close();
    else { paused = true; input.enabled = false; workshop.open(game.suit.loadout); }
  }

  events.on('workshop:close', () => { paused = false; input.enabled = true; });
  events.on('workshop:apply', (lo) => {
    game.setLoadout(lo);
    suitView.build(game.suit);
    hud.buildSystems(game.suit);
    storage.set('loadout', game.suit.loadout);
    cam.snap();
    workshop.close();
    hud.toast('New build on the pad. Hold {up} to lift off.');
  });
  events.on('crash', ({ speed }) => input.gamepad.rumble(Math.min(1, speed / 20), Math.min(1, speed / 12), 120 + speed * 8));
  events.on('overheat', () => input.gamepad.rumble(0.2, 0.6, 250));
  events.on('missile:hit', ({ pos }) => { effects.burst(pos, 40, 10); input.gamepad.rumble(1, 1, 500); });
  events.on('missile:dodged', ({ pos }) => effects.burst(pos, 25, 8));
  events.on('missile:launch', () => input.gamepad.rumble(0.1, 0.4, 200));
  events.on('launch', () => input.gamepad.rumble(0.7, 1, 450));
  events.on('maneuver', () => input.gamepad.rumble(0, 0.35, 140));
  events.on('gamepad:connected', () => {
    prompts.set('gamepad');
    hud.toast('Controller connected. Press {help} for the button map.', 'good');
    document.body.classList.add('has-gamepad');
  });
  events.on('gamepad:disconnected', () => { prompts.set('keyboard'); hud.toast('Controller disconnected'); });
  events.on('impact', ({ point, speed }) => effects.burst(point, Math.min(40, Math.round(speed * 3)), Math.min(8, speed * 0.6)));

  // Menu navigation with a controller (start screen and workshop)
  function menuRoot() {
    if (!started) return startEl;
    if (workshop.isOpen) return document.getElementById('workshop');
    return null;
  }
  function handleMenu(a) {
    const root = menuRoot();
    if (!root) return;
    const items = [...root.querySelectorAll('input[type="radio"], button')].filter((el) => el.offsetParent !== null || el.type === 'radio');
    let i = items.indexOf(document.activeElement);
    if (a === 'ui:next' || a === 'ui:prev') {
      const n = items.length;
      i = i < 0 ? 0 : (i + (a === 'ui:next' ? 1 : -1) + n) % n;
      items[i]?.focus();
      (items[i]?.closest('label') ?? items[i])?.scrollIntoView({ block: 'nearest' });
    } else if (a === 'ui:select') {
      const el = i >= 0 ? items[i] : !started ? document.getElementById('btn-start') : null;
      el?.click();
    } else if (a === 'ui:back' && workshop.isOpen) {
      workshop.close();
    }
  }

  function handleAction(a) {
    if (a.startsWith('ui:')) return handleMenu(a);
    if (a === 'workshop') return toggleWorkshop();
    if (!started || paused) return;
    if (a === 'camera') return hud.toast(`Camera: ${cam.cycle()}`);
    if (a === 'help') return hud.toggleHelp();
    game.handleAction(a);
    if (a === 'reset') cam.snap();
  }

  // Debug hook for automated tests: open the page with ?debug
  if (location.search.includes('debug')) window.__scrapjack = { game, cam, hud, CONFIG };

  // Keep the build when the page is updated while open
  window.claude?.hot?.snapshot?.(() => ({ loadout: game.suit.loadout }));

  const fixed = CONFIG.physics.dt;
  let last = performance.now(), acc = 0, clockTime = 0;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clockTime += dt;

    input.poll(dt, { flying: game.controller.flying, menu: !started || workshop.isOpen });
    for (const a of input.consumeActions()) handleAction(a);
    const axes = input.axes();

    if (!paused) {
      acc += dt;
      let steps = 0;
      while (acc >= fixed && steps < CONFIG.physics.maxStepsPerFrame) {
        game.step(fixed, axes);
        acc -= fixed;
        steps++;
      }
      if (steps === CONFIG.physics.maxStepsPerFrame) acc = 0;
      effects.emitFromDamage(game.suit, game.body, dt);
    }

    suitView.update(game, (axes.boost || game.launchT > 0) && !paused, clockTime);
    cargoView.update(clockTime);
    worldView.update(game.course, clockTime);
    effects.update(dt);
    speedLines.update(game.body, dt);
    vapor.update(game, dt);
    missileView.update(dt, clockTime);
    chaseView.update(dt, clockTime);
    cam.update(game, dt);
    renderer.follow(game.body.pos);
    renderer.render();
    if (started) {
      hud.update(game.telemetry(), clockTime);
      threats.update(renderer.camera, game.missiles.missiles, game.body.pos);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function boot(data) {
  try {
    start(data ?? {});
  } catch (err) {
    console.error(err);
    const msg = document.getElementById('start-error');
    msg.hidden = false;
    msg.textContent = `The game couldn’t start: ${err.message}. It needs a browser with WebGL turned on.`;
  }
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
