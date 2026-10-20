// All tuning numbers live here. Change how the game feels without touching logic.
// Body frame: +Y is up (head), -Z is forward, +X is the suit's right.

export const CONFIG = {
  physics: {
    dt: 1 / 120,            // fixed simulation step (seconds)
    maxStepsPerFrame: 10,
    gravity: 9.81,
    airDrag: 0,             // isotropic drag (unused: see aero below)
    angularDamping: 1.5,    // 1/s
    restitution: 0.1,
    friction: 0.8,
  },

  pilot: {
    mass: 75,
    // inertia = total mass * factor, per axis (x = pitch, y = yaw, z = roll)
    inertiaFactors: [0.3, 0.06, 0.32],
    feetHeight: 1.03,       // distance from center of mass to the soles
  },

  // Where parts attach on the pilot. Thrust is applied at `pos`.
  // The back jet's thrust line is set close to the center of mass, like a real jetpack.
  mounts: {
    back:  { pos: [0, 0.2, 0.03] },
    handL: { pos: [-0.55, -0.02, -0.2] },
    handR: { pos: [0.55, -0.02, -0.2] },
    bootL: { pos: [-0.15, -0.98, 0.02] },
    bootR: { pos: [0.15, -0.98, 0.02] },
  },

  // Collision shape: spheres in the body frame. `zone` is the component that takes the hit.
  collision: {
    spheres: [
      { id: 'head',  zone: 'helmet', pos: [0, 0.68, 0],          r: 0.2 },
      { id: 'torso', zone: 'chest',  pos: [0, 0.18, 0],          r: 0.3 },
      { id: 'hips',  zone: 'chest',  pos: [0, -0.3, 0],          r: 0.24 },
      { id: 'pack',  zone: 'back',   pos: [0, 0.25, 0.28],       r: 0.2 },
      { id: 'handL', zone: 'handL',  pos: [-0.55, -0.02, -0.2],  r: 0.12 },
      { id: 'handR', zone: 'handR',  pos: [0.55, -0.02, -0.2],   r: 0.12 },
      { id: 'footL', zone: 'bootL',  pos: [-0.15, -0.88, 0.04],  r: 0.15, foot: true },
      { id: 'footR', zone: 'bootR',  pos: [0.15, -0.88, 0.04],   r: 0.15, foot: true },
    ],
  },

  // Air: the body is treated as three flat plates. Flying head-first is slick,
  // belly-first catches lots of air (that's what gives lift and braking).
  aero: {
    plates: [0.8, 0.11, 4],  // N per (m/s)^2 against air hitting the side, head, belly/back
    steerPerV2: 0.2,           // at speed the pilot steers with arms and legs (N·m per (m/s)^2)
    steerMax: 1500,
    smoothing: 0.1,            // seconds, for the flight assist's lift estimate
  },

  // Flight mode: fast, nose-first, banked turns. Hover modes are separate.
  flight: {
    minSpeed: 24, cruiseSpeed: 58, boostSpeed: 95,  // m/s targets (thrust and drag decide what you really get)
    throttleRamp: 0.6,
    speedGain: 0.8,
    turnRate: 1.6, pitchRate: 1.4,  // rad/s
    turnGain: 3,
    maxG: 4, boostMaxG: 6,
    maxLeadDeg: 35,                 // how far the aim can get ahead of where you're actually going
    rollTime: 0.6, dodgeAccel: 16, rollMaxRate: 14,  // barrel roll
    flipTime: 0.9, flipMaxG: 10, flipMaxRate: 4.5,  // 180° reverse
    attitudeGain: 1.8,
    autoExitSpeed: 4,               // touching down slower than this drops back to hover
    autoLevel: 0.7,                 // how fast the path levels out when you let go of up/down (1/s)
    groundAvoid: { height: 10, pitch: 0.25, lookahead: 1.3 },  // near the ground without diving: nose comes up on its own
    verticalMaxG: 2.5,              // height-keeping gets its own budget so turns don't drag you down
  },

  // Launch burst: entering flight mode dumps a stored charge into the thrusters.
  // Works from the ground too (rocket takeoff). Recharges over a few seconds.
  launch: { time: 1.5, thrustMult: 3, kick: 18, recharge: 5, groundPitch: 0.6, gyroMult: 6, maxAccelG: 2 },

  // Thermal limiter: instead of cutting out at 100%, thrusters and the core
  // taper their output as they get hot, so you sink gently rather than drop.
  thermalLimiter: { enabled: true, start: 74, end: 92, floor: 0.2 },

  boost: { thrustMult: 1.45, heatMult: 1.7 },

  // Assisted flight: the suit holds altitude, levels itself and brakes when you let go.
  assist: {
    maxSpeed: 14, boostSpeed: 26,
    climbRate: 5, boostClimbRate: 9,
    maxTiltDeg: 28, boostTiltDeg: 45,
    velGain: 1.5, climbGain: 2.5,
    yawRate: 1.9,
  },

  // Manual flight: keys set rotation rates, throttle stays where you leave it.
  manual: { pitchRate: 2.4, rollRate: 2.8, yawRate: 2.0, rateGain: 9, throttleRamp: 0.7 },

  attitude: { kp: 26, kd: 8.5, maxRate: 2.5 },  // scaled by the helmet's assist quality; maxRate caps spin speed (rad/s)

  // Thrust mixing weights: [Fx, Fy, Fz, Tx, Ty, Tz]. Higher = matters more.
  allocation: { weights: [0.002, 1, 0.002, 25, 25, 25], sweeps: 12 },

  stance: { uprightGain: 40, damping: 10, minUp: 0.55 },  // legs keep you upright when standing

  heat: { overheatAt: 100, restartBelow: 55, wearAbove: 92, wearRate: 3, passiveCool: 2 },

  damage: {
    safeImpactSpeed: 5.5,   // m/s; slower hits do nothing
    impactScale: 4, impactExp: 1.35,
    minEfficiency: 0.4,     // a thruster at 1 hp still gives 40%
    sputterBelow: 0.3,      // below 30% condition thrusters cut out at random
  },

  recover: { delay: 1.6 },

  chase: { startRadius: 40, tagRadius: 16, tagTime: 4, loseDistance: 450, minSpeed: 18, maxSpeed: 72, catchUpGain: 0.6 },  // seconds lying still before the pilot stands back up

  cargo: { grabRange: 2.4, holdOffset: [0, -0.35, -0.65], radius: 0.42 },

  camera: {
    smoothing: 6,
    flight: { distance: 7.5, height: 1.8, lookAhead: 14, bankFollow: 0.3, smoothing: 8 },
    fov: { base: 65, perSpeed: 0.32, max: 95, startSpeed: 15 },
    modes: [
      { name: 'Chase', offset: [0, 2.2, 7],  look: [0, 0.6, 0] },
      { name: 'Far',   offset: [0, 5, 17],   look: [0, 1, 0] },
      { name: 'Side',  offset: [9, 1.8, 0.5], look: [0, 0.4, 0] },
    ],
  },

  // Key bindings. Values are KeyboardEvent.code names.
  keys: {
    axes: {
      forward: ['KeyW', 'ArrowUp'],
      back: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      yawLeft: ['KeyQ'],
      yawRight: ['KeyE'],
      up: ['Space'],
      down: ['KeyC', 'ControlLeft'],
      boost: ['ShiftLeft', 'ShiftRight'],
    },
    actions: {
      mode: ['KeyM'],
      flight: ['KeyF'],
      flip: ['KeyX'],
      grab: ['KeyG'],
      reset: ['KeyR'],
      workshop: ['KeyB'],
      camera: ['KeyV'],
      help: ['KeyH'],
    },

    // PS5 DualSense (any controller with the standard layout works).
    // Button numbers follow the browser's standard gamepad layout:
    // 0 Cross, 1 Circle, 2 Square, 3 Triangle, 4 L1, 5 R1, 6 L2, 7 R2,
    // 8 Create, 9 Options, 10 L3, 11 R3, 12-15 D-pad up/down/left/right, 16 PS, 17 touchpad.
    gamepad: {
      deadzone: 0.15,
      rollFlick: 0.75,        // right stick pushed this far sideways in flight = barrel roll
      invertFlightY: false,   // true: pull the stick back to dive
      sticks: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
      analog: { up: 7, down: 6 },       // R2 climb / throttle up, L2 descend / throttle down
      hold: { boost: 5 },               // R1 boost / afterburner
      actions: {
        flight: 0,    // Cross
        flip: 1,      // Circle
        grab: 2,      // Square
        camera: 3,    // Triangle
        mode: 4,      // L1
        help: 8,      // Create
        workshop: 9,  // Options
        reset: 17,    // Touchpad press
      },
      menu: { select: 0, back: 1, up: 12, down: 13 },
      rumble: true,
    },
  },
};
