// Reads one left/right control (Q/E, or the right stick). Acts on the press straight away,
// then refines as more is known:
//   press       -> roll starts immediately
//   quick tap   -> adds the juke sidestep (on release, still inside the roll)
//   hold        -> roll keeps going (corkscrew), no sidestep
//   second tap  -> hard turn (cancels the roll)
export class TapHoldGesture {
  constructor(cfg) {
    this.cfg = cfg;
    this.state = 'idle';
    this.dir = 0;
    this.t = 0;
    this.hold = 0;
  }

  // value: -1, 0 or +1. Returns { press, tap, double } (each a direction or 0).
  update(dt, value) {
    const c = this.cfg, out = { press: 0, tap: 0, double: 0 };
    this.t += dt;
    const startPress = () => { this.state = 'pressed'; this.dir = value; this.t = 0; out.press = value; };
    switch (this.state) {
      case 'idle':
        if (value !== 0) startPress();
        break;
      case 'pressed':
        if (value === 0) {
          if (this.t <= c.tapMax) { out.tap = this.dir; this.state = 'released'; this.t = 0; } else this.state = 'idle';
        } else if (value !== this.dir) startPress();
        else if (this.t > c.holdTime) this.state = 'holding';
        break;
      case 'holding':
        if (value === 0) this.state = 'idle';
        else if (value !== this.dir) startPress();
        break;
      case 'released':
        if (value === this.dir) { out.double = this.dir; this.state = 'second'; }
        else if (value !== 0) startPress();
        else if (this.t > c.doubleWindow) this.state = 'idle';
        break;
      case 'second':
        if (value === 0) this.state = 'idle';
        break;
    }
    this.hold = this.state === 'holding' ? this.dir : 0;
    return out;
  }
}
