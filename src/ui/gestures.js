// Reads one left/right control (Q/E, or the right stick) and works out which move you meant
// before anything happens:
//   tap         -> roll + juke     (decided once the double-tap window passes)
//   hold        -> corkscrew       (decided once held past holdTime; no juke)
//   double-tap  -> hard turn       (decided on the second press)
export class TapHoldGesture {
  constructor(cfg) {
    this.cfg = cfg;
    this.state = 'idle';
    this.dir = 0;
    this.t = 0;
    this.hold = 0;
  }

  // value: -1, 0 or +1. Returns { tap, double } (each a direction or 0); this.hold is the held direction.
  update(dt, value) {
    const c = this.cfg, out = { tap: 0, double: 0 };
    this.t += dt;
    switch (this.state) {
      case 'idle':
        if (value !== 0) { this.state = 'pressed'; this.dir = value; this.t = 0; }
        break;
      case 'pressed':
        if (value === 0) { this.state = 'released'; this.t = 0; }
        else if (this.t > c.holdTime) { this.state = 'holding'; }
        break;
      case 'holding':
        if (value !== this.dir) { this.state = value === 0 ? 'idle' : 'pressed'; this.dir = value || this.dir; this.t = 0; }
        break;
      case 'released':
        if (value === this.dir) { out.double = this.dir; this.state = 'second'; }
        else if (value !== 0) { out.tap = this.dir; this.state = 'pressed'; this.dir = value; this.t = 0; }
        else if (this.t > c.doubleWindow) { out.tap = this.dir; this.state = 'idle'; }
        break;
      case 'second':
        if (value === 0) this.state = 'idle';
        break;
    }
    this.hold = this.state === 'holding' ? this.dir : 0;
    return out;
  }
}
