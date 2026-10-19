import { events } from '../core/events.js';

// Controller input through the browser Gamepad API (PS5 DualSense, Xbox, etc.).
// Fills the same axes and actions as the keyboard, so the game doesn't care which you use.
export class GamepadInput {
  constructor(map) {
    this.map = map;
    this.index = null;
    this.prev = [];
    this.menuRepeat = 0;
    this.supported = typeof navigator.getGamepads === 'function';
    this.axes = { forward: 0, strafe: 0, yaw: 0, roll: 0, up: 0, down: 0, boost: false };

    window.addEventListener('gamepadconnected', (e) => {
      this.index = e.gamepad.index;
      events.emit('gamepad:connected', { id: e.gamepad.id });
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) {
        this.index = null;
        events.emit('gamepad:disconnected');
      }
    });
  }

  get connected() { return this.pad() != null; }

  pad() {
    if (!this.supported) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch { this.supported = false; return null; }
    if (this.index != null && pads[this.index]) return pads[this.index];
    // Some browsers only report a pad after a button press; pick the first one we see
    for (const p of pads) {
      if (p && p.connected) {
        this.index = p.index;
        events.emit('gamepad:connected', { id: p.id });
        return p;
      }
    }
    return null;
  }

  dz(v) {
    const d = this.map.deadzone;
    if (Math.abs(v) < d) return 0;
    return Math.sign(v) * (Math.abs(v) - d) / (1 - d);
  }

  // Read the controller. `flying` changes what the sticks do; `menu` turns buttons into menu moves.
  poll(dt, { flying, menu }, queue) {
    const p = this.pad();
    const a = this.axes;
    a.forward = a.strafe = a.yaw = a.roll = a.up = a.down = 0;
    a.boost = false;
    if (!p) return;

    const m = this.map;
    const btn = (i) => p.buttons[i] ?? { pressed: false, value: 0 };
    const pressed = (i) => btn(i).pressed && !this.prev[i];

    if (menu) {
      if (pressed(m.actions.workshop)) queue.push('workshop');
      if (pressed(m.menu.select)) queue.push('ui:select');
      if (pressed(m.menu.back)) queue.push('ui:back');
      // D-pad or left stick moves through the list, with key-repeat when held
      const y = this.dz(p.axes[m.sticks.moveY] ?? 0);
      const dir = btn(m.menu.down).pressed || y > 0.5 ? 1 : btn(m.menu.up).pressed || y < -0.5 ? -1 : 0;
      this.menuRepeat -= dt;
      if (dir === 0) this.menuRepeat = 0;
      else if (this.menuRepeat <= 0) {
        queue.push(dir > 0 ? 'ui:next' : 'ui:prev');
        this.menuRepeat = this.menuRepeat < 0 ? 0.12 : 0.3;
      }
    } else {
      for (const [action, i] of Object.entries(m.actions)) if (pressed(i)) queue.push(action);

      const lx = this.dz(p.axes[m.sticks.moveX] ?? 0);
      const ly = this.dz(p.axes[m.sticks.moveY] ?? 0);
      const rx = this.dz(p.axes[m.sticks.lookX] ?? 0);
      a.strafe = lx;
      a.forward = -ly;                       // stick up = forward / dive
      if (flying && m.invertFlightY) a.forward = ly;
      a.yaw = -rx;                           // hover: right stick turns
      a.roll = Math.abs(rx) > m.rollFlick ? -Math.sign(rx) : 0;  // flight: flick to barrel roll
      a.up = btn(m.analog.up).value;
      a.down = btn(m.analog.down).value;
      a.boost = btn(m.hold.boost).pressed;
    }
    this.prev = p.buttons.map((b) => b.pressed);
  }

  rumble(strong, weak, ms) {
    if (!this.map.rumble) return;
    const p = this.pad();
    try {
      p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    } catch { /* not supported */ }
  }
}
