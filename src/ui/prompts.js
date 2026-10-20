import { CONFIG } from '../core/config.js';
import { events } from '../core/events.js';

// Button prompts that follow the device in use (keyboard or controller).
// Mark any on-screen hint with data-key="action" and it updates itself;
// use prompts.kbd('action') or prompts.label('action') in code.

const PAD_NAMES = {
  0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3',
  12: 'D-pad ↑', 13: 'D-pad ↓', 14: 'D-pad ←', 15: 'D-pad →', 16: 'PS', 17: 'Touchpad',
};

function keyName(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const special = {
    Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Enter: 'Enter',
  };
  return special[code] ?? code;
}

// Every prompt the game shows. Keyboard labels come from the key bindings, controller labels
// from the gamepad bindings, so remapping in config.js updates the prompts too.
function table() {
  const k = CONFIG.keys, p = k.gamepad;
  const ka = (a) => keyName(k.actions[a]?.[0]);
  const kx = (a) => keyName(k.axes[a]?.[0]);
  const pa = (a) => PAD_NAMES[p.actions[a]];
  return {
    reset: [ka('reset'), pa('reset')],
    help: [ka('help'), pa('help')],
    workshop: [ka('workshop'), pa('workshop')],
    grab: [ka('grab'), pa('grab')],
    camera: [ka('camera'), pa('camera')],
    autosteer: [ka('autosteer'), pa('autosteer')],
    mode: [ka('mode'), pa('mode')],
    flight: [ka('flight'), pa('flight')],
    flip: [ka('flip'), pa('flip')],
    flare: [ka('flare'), pa('mode')],
    up: [kx('up'), PAD_NAMES[p.analog.up]],
    down: [kx('down'), PAD_NAMES[p.analog.down]],
    boost: [kx('boost'), PAD_NAMES[p.hold.boost]],
    move: ['W A S D', 'L stick'],
    turn: [`${kx('yawLeft')} ${kx('yawRight')}`, 'R stick'],
    roll: [`${kx('yawLeft')} ${kx('yawRight')}`, 'R stick flick'],
    juke: [`${kx('yawLeft')} / ${kx('yawRight')}`, 'R stick flick'],
    snap: [`Double-tap ${kx('yawLeft')}/${kx('yawRight')}`, 'Double-flick R stick'],
    carve: [`${kx('left')}/${kx('right')} + ${kx('back')}`, 'L stick sideways + back'],
    start: ['Click', PAD_NAMES[p.menu.select]],
  };
}

export const prompts = {
  device: 'keyboard',

  set(device) {
    if (device === this.device) return;
    this.device = device;
    document.body.classList.toggle('device-gamepad', device === 'gamepad');
    this.apply(document);
    events.emit('device:changed', device);
  },

  label(action) {
    const entry = table()[action];
    if (!entry) return action;
    return this.device === 'gamepad' ? entry[1] : entry[0];
  },

  kbd(action) {
    return `<kbd data-key="${action}">${this.label(action)}</kbd>`;
  },

  // Replace {action} tokens in plain text, e.g. "Hold {up} to lift off"
  format(text) {
    return text.replace(/\{(\w+)\}/g, (_, a) => this.label(a));
  },

  // Update every [data-key] element under root
  apply(root) {
    root.querySelectorAll('[data-key]').forEach((el) => { el.textContent = this.label(el.dataset.key); });
  },
};
