// The boosted takeoff's flight path: a curve of height (y, m) against distance forward (x, m),
// drawn like an animation spline (keyframes with in/out handles, cubic Bezier between them).
// Made in Curve Forge (art/burst_curve.pdf); the keyframes are in CONFIG.launch.burst.curve.
//
// The curve is sampled once and measured along its length, so the game can ask "where is the
// point d metres along the path, and which way does it head there?"

export class BurstPath {
  constructor(keys, samplesPerSegment = 400) {
    this.pts = [];   // { x, y, d } sampled along the curve; d = distance along it so far (m)
    for (let k = 0; k < keys.length - 1; k++) {
      const a = keys[k], b = keys[k + 1];
      const p0 = [a.x, a.y], p1 = [a.x + a.out[0], a.y + a.out[1]];
      const p2 = [b.x + b.in[0], b.y + b.in[1]], p3 = [b.x, b.y];
      for (let i = k === 0 ? 0 : 1; i <= samplesPerSegment; i++) {
        const u = i / samplesPerSegment, v = 1 - u;
        const A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
        this.pts.push({ x: A * p0[0] + B * p1[0] + C * p2[0] + D * p3[0], y: A * p0[1] + B * p1[1] + C * p2[1] + D * p3[1], d: 0 });
      }
    }
    for (let i = 1; i < this.pts.length; i++) {
      const p = this.pts[i], q = this.pts[i - 1];
      p.d = q.d + Math.hypot(p.x - q.x, p.y - q.y);
    }
    this.length = this.pts[this.pts.length - 1].d;
  }

  // Index of the last sample at or before distance d
  index(d) {
    let lo = 0, hi = this.pts.length - 1;
    if (d <= 0) return 0;
    if (d >= this.length) return hi - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.pts[m].d <= d) lo = m; else hi = m; }
    return lo;
  }

  // Point d metres along the path: { x, y }
  at(d, out = {}) {
    const i = this.index(d), p = this.pts[i], q = this.pts[i + 1];
    const t = q.d > p.d ? Math.min(1, Math.max(0, (d - p.d) / (q.d - p.d))) : 0;
    out.x = p.x + (q.x - p.x) * t; out.y = p.y + (q.y - p.y) * t;
    return out;
  }

  // Climb angle of the path at distance d (radians; +pi/2 = straight up, 0 = level)
  angle(d) {
    const i = this.index(d), p = this.pts[i], q = this.pts[i + 1];
    return Math.atan2(q.y - p.y, q.x - p.x);
  }

  // Distance along the path of the point nearest (x, y)
  nearest(x, y) {
    let best = 0, bd = Infinity;
    for (const p of this.pts) { const e = (p.x - x) ** 2 + (p.y - y) ** 2; if (e < bd) { bd = e; best = p.d; } }
    return best;
  }
}
