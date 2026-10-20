import { GamepadInput } from './GamepadInput.js';
import { prompts } from './prompts.js';

// All player input. Keyboard and controller both feed the same axes and actions,
// and bindings for both live in config.js.
export class Input {
  constructor(target, bindings) {
    this.bindings = bindings;
    this.held = new Set();
    this.queue = [];
    this.enabled = true;
    this.axesOut = { forward: 0, strafe: 0, yaw: 0, roll: 0, up: 0, down: 0, boost: false };
    this.gamepad = new GamepadInput(bindings.gamepad);
    this.lastDevice = 'keyboard';

    this.actionByCode = new Map();
    for (const [action, codes] of Object.entries(bindings.actions)) {
      for (const code of codes) this.actionByCode.set(code, action);
    }
    const gameCodes = new Set([...Object.values(bindings.axes).flat(), ...this.actionByCode.keys()]);

    // Double-tap detection for jukes
    this.tapAxis = new Map();
    for (const axis of Object.keys(bindings.doubleTap).filter((k) => k !== 'window')) {
      for (const code of bindings.axes[axis]) this.tapAxis.set(code, axis);
    }
    this.lastTap = {};

    target.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      this.lastDevice = 'keyboard';
      prompts.set('keyboard');
      if (gameCodes.has(e.code)) e.preventDefault();
      if (!e.repeat && this.actionByCode.has(e.code)) this.queue.push(this.actionByCode.get(e.code));
      if (!e.repeat && this.tapAxis.has(e.code)) {
        const axis = this.tapAxis.get(e.code), now = performance.now() / 1000, dt = bindings.doubleTap;
        if (now - (this.lastTap[axis] ?? -9) < dt.window) {
          this.queue.push(dt[axis]);
          this.lastTap[axis] = -9;
        } else this.lastTap[axis] = now;
      }
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') prompts.set('keyboard'); });
  }

  // Call once per frame before reading axes or actions
  poll(dt, state) {
    const before = this.queue.length;
    this.gamepad.poll(dt, state, this.queue);
    const g = this.gamepad.axes;
    if (this.queue.length > before || g.forward || g.strafe || g.yaw || g.up || g.down || g.boost) {
      this.lastDevice = 'gamepad';
      prompts.set('gamepad');
    }
  }

  down(name) {
    return this.bindings.axes[name].some((c) => this.held.has(c));
  }

  axes() {
    const a = this.axesOut, d = (n) => (this.down(n) ? 1 : 0), g = this.gamepad.axes;
    // Whichever device pushes harder wins, per axis
    const pick = (k, v) => (Math.abs(v) >= Math.abs(g[k]) ? v : g[k]);
    a.forward = pick('forward', d('forward') - d('back'));
    a.strafe = pick('strafe', d('right') - d('left'));
    const qe = d('yawLeft') - d('yawRight');
    a.yaw = pick('yaw', qe);
    a.roll = qe !== 0 ? qe : g.roll;
    a.up = Math.max(d('up'), g.up);
    a.down = Math.max(d('down'), g.down);
    a.boost = this.down('boost') || g.boost;
    if (!this.enabled) {
      a.forward = a.strafe = a.yaw = a.roll = a.up = a.down = 0;
      a.boost = false;
    }
    return a;
  }

  consumeActions() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

function isTyping(el) {
  return el && (el.tagName === 'INPUT' && el.type === 'text' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
