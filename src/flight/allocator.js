// Thrust allocation: decide how hard each thruster fires so that, together,
// they produce the force and torque the flight controller asked for.
//
// cols[i]  = 6 numbers [Fx, Fy, Fz, Tx, Ty, Tz] that thruster i makes at full throttle
// target   = the 6 numbers we want
// weights  = how much each of the 6 matters
// u        = throttles 0..1 (updated in place, reused as a warm start next frame)
//
// Solved with coordinate descent on a weighted least-squares problem, clamped to 0..1.
// Works for any number and layout of thrusters, so new parts need no code changes.

const residual = new Float64Array(6);

export function allocate(cols, target, weights, u, sweeps = 12) {
  const n = cols.length;
  for (let k = 0; k < 6; k++) {
    let s = -target[k];
    for (let i = 0; i < n; i++) s += cols[i][k] * u[i];
    residual[k] = s;
  }

  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (let i = 0; i < n; i++) {
      const col = cols[i];
      let h = 0, g = 0;
      for (let k = 0; k < 6; k++) {
        h += weights[k] * col[k] * col[k];
        g += weights[k] * col[k] * residual[k];
      }
      if (h < 1e-9) { u[i] = 0; continue; }
      const next = Math.min(1, Math.max(0, u[i] - g / h));
      const du = next - u[i];
      if (du !== 0) {
        for (let k = 0; k < 6; k++) residual[k] += col[k] * du;
        u[i] = next;
      }
    }
  }
  return u;
}
