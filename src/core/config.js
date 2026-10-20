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
    wing: { coeff: 8, base: 0.3, liftToDrag: 5, stallDeg: 35 },  // spread arms and legs as wings
    steerPerV2: 0.2,           // at speed the pilot steers with arms and legs (N·m per (m/s)^2)
    steerMax: 1500,
    smoothing: 0.1,            // seconds, for the flight assist's lift estimate
  },

  // Flight mode: fast, nose-first, banked turns. Hover modes are separate.
  flight: {
    brake: { keep: 0.2, accelG: 2.5 },   // hold L1 / Ctrl: slow to 20% of your speed (never below minSpeed)
    minSpeed: 24, cruiseSpeed: 58, boostSpeed: 133,  // m/s targets (thrust and drag decide what you really get)
    throttleRamp: 0.6,
    speedGain: 0.8,
    turnRate: 2.2, pitchRate: 1.4,  // rad/s
    turnGain: 3,
    maxG: 6, boostMaxG: 7.5,
    // Turning spreads the arms and legs to catch more air (more lift, more drag).
    // Carve = steer + pull back (S / stick down): full spread, much tighter, bleeds speed.
    spread: { turn: 1.8, carve: 3.2, rate: 6 },
    carve: { maxG: 14, turnRate: 3.6, cornerSpeed: 34, maxLeadDeg: 60, turnGain: 4 },
    feedForward: 1, feedForwardFrom: 30, feedForwardFull: 50,  // turn anticipation, faded in by speed (m/s)
    gripLearn: 3,                   // how fast the assist corrects for less grip than expected
    maxAoaDeg: 32,                  // best-grip body angle; beyond this you'd stall
    // Letting go of a turn: the aim follows where you're really heading until the turn stops, then holds
    recoverRate: 12,               // spin rate (rad/s) allowed to right yourself when far off (>90°)
    releaseTime: 0.8, releaseStopDeg: 3, releaseCarry: 0.05,
    maxLeadDeg: 35,                 // how far the aim can get ahead of where you're actually going
    rollTime: 0.4, rollRate: 18, rollLeadDeg: 60, dodgeAccel: 16, rollMaxRate: 26,  // barrel roll: spin rate (rad/s), ~0.4 s per turn
    // Hard turn (double-tap Q/E or the right stick): brake, snap round, burst away
    // waitWindow: if there's no room to turn, hold the turn this long and take it at the first opening
    snap: { waitWindow: 1.5, clearance: 3, checkAfter: 0.4, angleDeg: 90, time: 0.6, cornerFrac: 0.55, exitFrac: 0.85, response: 0.08, maxG: 20, maxGTurn: 16, minSpeed: 15, burstTime: 0.8, holdAfter: 0.6, cooldown: 1.2 },
    flipTime: 0.9, flipMaxG: 10, flipMaxRate: 4.5,  // 180° reverse
    attitudeGain: 3.5,
    autoExitSpeed: 4,               // touching down slower than this drops back to hover
    slowDive: { minDeg: 18, from: 15, full: 40 },  // steepest dive allowed: 18° when slow, full dive by 40 m/s
    autoLevel: 0.7,                 // how fast the path levels out when you let go of up/down (1/s)
    groundAvoid: { height: 10, pitch: 0.25, lookahead: 1.3 },  // near the ground without diving: nose comes up on its own
    verticalMaxG: 2.5,              // height-keeping gets its own budget so turns don't drag you down
  },

  // Obstacle sensor for flight mode: looks ahead, measures what's in the way, steers round it
  avoid: {
    enabled: true,
    // Building correction: bends your path just enough to clear, eased in as you get close
    nudgeMaxDeg: 12,               // never bends more than this; bigger = auto hop / roll instead
    nudgeEnough: 0.6,              // the suit takes time to swing, so past 60% of that it rolls/hops instead
    nudgeTime: 1.2, nudgeFull: 0.5, // starts this many seconds from impact, full size by nudgeFull
    // Auto roll waits until the last moment: it fires when the sidestep would only just make it
    stepMaxAccel: 220,             // hardest sideways push of an auto sidestep (m/s², ~22 g)
    stepLead: 0.12,                // safety margin (s) before the last possible moment
    stepTimeMax: 0.6,              // longest an auto sidestep takes
    stepSettle: 0.25,              // then holds the new line this long (no drift into the next building)
    // Roof edge: a gentle climb at the last moment instead of a hop
    upMaxDeg: 20,                  // most it tilts the path up
    upAccelG: 2,                   // gentle climb (G) used to work out the last moment
    upLead: 0.3,                   // extra seconds of margin for the suit to swing its nose up
    holdReleaseDeg: 40,            // once past the building the correction eases off at this many °/s
    rollLockout: 4,                // after an auto roll, no other auto roll for this many seconds
    rollHeadOn: 0.5,               // auto roll only flying within ~60° of straight at the wall
    streetHold: 1.5,               // ...and for this long after (so crossings don't count as open)
    // Between buildings, after a nudge: straighten along the street and ease toward the middle
    alignTime: 2,                  // keeps at it this long after the last nudge (or until you steer)
    alignMaxDeg: 40,               // only if you're within this of the street's direction
    alignRateDeg: 45,              // how fast it turns you (°/s)
    centerDegPerM: 1.5, centerMaxDeg: 8,   // aim this much toward the middle per metre off-centre
    streetWidth: 22,               // buildings this close on both sides = between buildings: no auto rolls
    lookTime: 2.2, lookExtra: 8,   // how far ahead to look: seconds of travel + metres
    margin: 4,                     // clearance kept from walls and rooftops (m)
    groundMargin: 6,               // never plan a path lower than this above the ground (m)
    urgentTime: 0.7,               // at this many seconds from impact the sensor takes full control
    extraDeg: 4,                   // extra angle beyond the bare minimum
    upBias: 1.15,                  // >1 prefers going round over going over
    stickiness: 0.15,              // keep the chosen side unless another is clearly better (rad)
    pullUpShare: 0.5,              // share of max grip assumed for a pull-up (planning margin)
    reactTime: 0.3,                // seconds of sink allowed for the suit to react
    groundEarly: 2.4,              // start easing the nose up when room < this x needed
    steerBoost: 3,                 // (ground only) how much harder it steers at full urgency
    moveTime: 1.0,                 // seconds from impact when it makes one quick move
    hopMax: 14, hopMaxSpeed: 18,    // hop over a roof edge if it needs at most this many metres (and m/s)
    rollMax: 12,                    // roll-juke past a corner if it needs at most this many metres sideways
    cooldown: 1.0,
    hopTime: 0.25,                 // the hop's push lasts this long
    minSpeed: 5,
  },

  // Launch burst: entering flight mode dumps a stored charge into the thrusters.
  // Works from the ground too (rocket takeoff). Recharges over a few seconds.
  launch: { time: 1.5, thrustMult: 3, kick: 18, recharge: 5, groundPitch: 0.6, gyroMult: 6, maxAccelG: 2,
    boosted: 1.15 },   // hold boost while launching: a launch this much stronger (same 1.5 s)

  // Thermal limiter: instead of cutting out at 100%, thrusters and the core
  // taper their output as they get hot, so you sink gently rather than drop.
  thermalLimiter: { enabled: true, start: 74, end: 92, floor: 0.2 },

  boost: { thrustMult: 2.2, heatMult: 1.7, powerMult: 2 },   // boost overclocks the core (powerMult) for ~40% more top speed

  // Assisted flight: the suit holds altitude, levels itself and brakes when you let go.
  assist: {
    maxSpeed: 22, boostSpeed: 30,
    climbRate: 18, boostClimbRate: 25, descendRate: 24,
    landingBrake: 12,  // fast descents ease off near the ground/roofs so you never hit hard (m/s² planned stop)
    // Vertical steering jets: help reach and hold the climb/descent speed quickly (m/s²)
    vertical: { gain: 5, accel: 16 },
    // Thruster cut-off (hold Z / press L2 all the way): free-fall, then the jets catch you.
    // If the ground (or a roof) is coming up too fast, they fire on their own to save the landing.
    cutoff: { catchAccel: 22, safetyMargin: 1.4, safetyExtra: 3, noDamageTime: 2 },
    // Lift reserve: when you need to stop sinking or climb, briefly draw extra thrust from stored charge
    liftReserve: { thrustMult: 1.5, below: 1.0 },   // kicks in when you're sinking more than 1 m/s slower than wanted
    maxTiltDeg: 28, boostTiltDeg: 45,
    velGain: 1.5, climbGain: 5,
    yawRate: 2.6,       // hover turn speed (rad/s, ~150°/s)
    upright: true,    // slide around without tilting (hold boost to lean in for speed)
    uprightLeanDeg: 6, // tiny lean allowed in upright mode for snappier moves
    boostLeanDeg: 15,  // a little more lean while boosting (looks fast, still upright)
    sideUse: 0.6,     // share of the swivel push the assist may use for sliding (rest keeps you up)
    allowManual: false, // manual hover (tips with the stick, throttle stays put): off; set true to bring back the toggle
    walkSpeed: 3, runSpeed: 6,   // on the ground the stick walks (boost = run)
    exitBrake: { time: 1.2, gain: 3, maxG: 2.5 },          // leaving flight: brake to a hover
    agility: { gain: 4, accel: 22, boostAccel: 28 },       // hover steering jets: how hard they push you toward the stick's speed (m/s²)
  },

  // Manual flight: keys set rotation rates, throttle stays where you leave it.
  manual: { pitchRate: 2.4, rollRate: 2.8, yawRate: 2.0, rateGain: 9, throttleRamp: 0.7 },

  attitude: { kp: 26, kd: 8.5, maxRate: 2.5 },  // scaled by the helmet's assist quality; maxRate caps spin speed (rad/s)

  // Thrust mixing weights: [Fx, Fy, Fz, Tx, Ty, Tz]. Higher = matters more.
  allocation: { weights: [0.002, 1, 0.002, 25, 25, 25], hoverWeights: [1, 6, 1, 25, 25, 25], sweeps: 16 },

  stance: { uprightGain: 40, damping: 10, minUp: 0.55 },  // legs keep you upright when standing

  heat: { overheatAt: 100, restartBelow: 55, wearAbove: 92, wearRate: 3, passiveCool: 2 },

  damage: {
    durability: 2,          // multiplies every part's condition (2 = takes twice the punishment)
    safeImpactSpeed: 5.5,   // m/s; slower hits do nothing
    impactScale: 4, impactExp: 1.35,
    minEfficiency: 0.4,     // a thruster at 1 hp still gives 40%
    sputterBelow: 0.3,      // below 30% condition thrusters cut out at random
  },

  recover: { delay: 1.6 },

  // Evasive moves. Jukes and flares use charges that refill over time.
  evade: {
    charges: 3, rechargeTime: 2,    // juke charges, seconds per charge
    jukeSpeed: 30,                   // sideways shove (m/s)
    hoverJukeScale: 0.8,             // hover sidesteps are a bit gentler
    rollHold: { time: 1.0, kp: 30, kd: 10, maxG: 3 },  // keeps your height through a roll-juke
    jinkTime: 0.6,                  // flight assist lets the shove carry you this long
    jinkBankDeg: 70,                 // the suit snaps into a bank toward the dodge
    jukeSpread: 0.2,                 // the sidestep is spread over this long, alongside the roll
    corkscrew: true,                 // hold Q/E to keep rolling
    flares: 4, flareRecharge: 6, flaresPerShot: 3, flareBurn: 3,
  },

  // Evasion range: launchers fire guided missiles while you're airborne in the red zone.
  missiles: {
    speed: 100, boostTime: 1, maxG: 7, navGain: 5, lead: 0.6,  // faster than you, but turns wider
    seekerUpdate: 0.18,              // the seeker only refreshes this often, so jukes fool it
    fuel: 9, proximity: 4, damage: 60,
    fireInterval: 5, maxAlive: 2, range: 450, minAltitude: 4,
    flareCone: 30, flareChance: 0.4,
  },

  chase: { startRadius: 40, tagRadius: 16, tagTime: 4, loseDistance: 450, minSpeed: 18, maxSpeed: 72, catchUpGain: 0.6 },  // seconds lying still before the pilot stands back up

  cargo: { grabRange: 2.4, holdOffset: [0, -0.35, -0.65], radius: 0.42 },

  // Suit look: 'hero' (the character sheet: ivory, navy, orange) or 'scrap' (each part its own junk colours)
  // Art style: 'toon' (cel shading and ink outlines, like the character sheet) or 'realistic'
  // Look: painted sunset sky, low warm sun, lavender haze, glow and a palette grade (see Renderer)
  art: {
    style: 'anime',                 // suit shading: 'anime' (soft, warm rim light), 'toon' (hard bands) or 'realistic'
    exposure: 1.25,
    sunElevation: 14, sunAzimuth: 35,   // low sun (degrees above the horizon; direction round from -Z)
    sunColor: 0xffc994, sunIntensity: 3.2,
    skyLight: 0xc6b8ec, groundLight: 0x6fa8a4, ambient: 1.4,   // lavender above, teal bounce below
    haze: 0xe6c4c4, hazeNear: 90, hazeFar: 820,                 // distance haze (warm lavender-pink)
    sky: { top: 0x3c4a8c, mid: 0x8f80c0, horizon: 0xffbe7a, below: 0x7d9ab0, sun: 0xffd9a0,
           cloudLit: 0xffd2a8, cloudShade: 0x6b5f8f },
    bloom: { strength: 0.35, radius: 0.5, threshold: 0.93 },    // glow on bright things
    grade: { warm: 0xffeedd, cool: 0xd2dcf4, saturation: 1.12, vignette: 0.15 },
    rim: { color: 0xffa860, strength: 0.45, power: 3.2 },        // warm edge light on the suit
    // Thrust streaks: each nozzle leaves a glowing ribbon. life = how long a bit of it lasts (s);
    // it drifts out of the nozzle at exhaustSpeed (m/s) plus carry × the suit's own speed
    trail: { life: 0.28, hoverLife: 0.22, exhaustSpeed: 9, carry: 0.15, width: 0.1, boostWidth: 0.15, max: 40,
      core: 0xfff3d2, edge: 0xff7a2e, ionCore: 0xe2f8ff, ionEdge: 0x3fb0ff, flameScale: 0.38 },
  },
  suitStyle: 'model',
  // 'model': the 3D model made from the character sheet (falls back to 'hero' if it can't load)
  // Body language for the 3D suit (poses themselves are in src/render/SuitPoses.js)
  pose: {
    blendRate: 5,                   // how quickly it moves into a new pose
    leanRate: 6, leanPerMs: 1.2, leanMax: 18,     // hover: degrees of lean per m/s of movement (up to leanMax)
    turnRate: 5, turnPerMs2: 0.5, turnMax: 25,    // flight turns: degrees of lean into the turn per m/s² of turning
    landSpeedFull: 10, landTime: 0.45, crouchDeg: 35,   // landing crouch: full at this fall speed, back up in landTime s
    stepsPerMeter: 0.9, walkSwing: 28,            // walking legs
    groundRoom: 0.25,               // counts as standing when the feet are within this of the ground (m)
  },
  suitModel: { url: 'assets/suit.json', height: 1.9, feetY: -1.03, turn: Math.PI,
    pods: false,                    // the winged back pods (sheet A has none: a vent between the shoulders instead)
    podMaxDeg: 35, podRate: 8,      // back pods swing toward the thrust direction (up to podMaxDeg; podRate = how quickly)
    toonSteps: [140, 205, 255], toonNormal: 0.6 },   // cel shading (art.style 'toon'): light bands (0-255), panel-line depth

  camera: {
    // One shot per state. Tune them live with the Camera Studio (K) and paste the copied settings here.
    //   distance: metres from the suit       orbit: degrees round the suit (0 = behind, + = to your right)
    //   height: degrees above (- = below)    shoulder: metres to the side (+ = right, over-the-shoulder)
    //   lookUp: aim point above the suit (m) lookAhead: aim point ahead of the suit (m)
    //   fov: field of view (°)               bank: how much the horizon leans with your bank (0-1)
    //   lag: how tightly it follows (higher = tighter)   shake: handheld shake at speed (m)
    shots: {
      hover:  { distance: 4.2, orbit: 0, height: 25, shoulder: 0, lookUp: 1,    lookAhead: 0,    fov: 90, bank: 0,    lag: 6, shake: 0 },
      flight: { distance: 2.2, orbit: 0, height: 18, shoulder: 0, lookUp: -3,   lookAhead: 20.5, fov: 60, bank: 0,    lag: 7, shake: 0 },
      boost:  { distance: 6.2, orbit: 0, height: 12, shoulder: 0, lookUp: -1.4, lookAhead: 20,   fov: 74, bank: 0.35, lag: 5, shake: 0.03 },
    },
    // Moments added on top of the shots
    moments: {
      punch: { distance: 0.25, fov: 8, attack: 0.12, release: 0.7 },   // launch burst: push in 25% (and narrow the view 8°), then ease back
      moveDistance: 0.25,          // turns and barrel rolls: camera backs off 25%...
      hardTurnDistance: 0.5,       // hard turns: backs off 50%...
      hardTurnFov: 0.20,           // ...and widens another 20% (40% in all)
      moveFov: 0.20,               // ...and the view widens 20%
      moveHold: 0.6,               // rolls and hard turns are quick: hold the effect this long after them
      turnShoulder: 0.72,          // slide this far (m) to the side you're turning toward
      zoomSpring: 7, shoulderSpring: 5,   // how quickly those ease in and out (higher = quicker)
    },
    modeBlendTime: 1.2,            // seconds to glide between hover and flight shots
    shotBlendTime: 1.0,            // seconds to glide between flight and boost
    frameSpring: { hover: 10, flight: 5 },   // how quickly the camera swings round to a new heading (higher = snappier)
    wallPad: 0.35, wallMin: 0.6, wallPivotUp: 0.8, wallEaseOut: 3,   // keep the camera out of buildings
    followPitch: 1,                // flight: the camera tilts with dives and climbs (0-1)
    speedFovFrom: 15, speedFovPer: 0.25, speedFovMax: 15,   // wider view at speed (on top of the shot's fov)
    modes: [                       // V cycles these
      { name: 'Cinematic' },
      { name: 'Far', distanceMult: 1.8 },
      { name: 'Side', orbit: 80 },
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
      down: ['KeyC'],
      brake: ['ControlLeft', 'ControlRight'],   // flight: hold to brake
      boost: ['ShiftLeft', 'ShiftRight'],
      cut: ['KeyZ'],             // hover: hold to cut the thrusters and drop (or double-tap C and hold)
    },
    actions: {
      mode: ['KeyM'],
      autosteer: ['KeyT'],
      flare: ['KeyZ'],
      flight: ['KeyF'],
      flip: ['KeyX'],
      grab: ['KeyG'],
      reset: ['KeyR'],
      workshop: ['KeyB'],
      camera: ['KeyV'],
      studio: ['KeyK'],
      help: ['KeyH'],
    },

    // Q/E (and the right stick): tap = roll + juke, hold = corkscrew, double-tap = hard turn
    rollGesture: { tapMax: 0.18, holdTime: 0.2, doubleWindow: 0.22 },  // released within tapMax = juke; held past holdTime = corkscrew; second tap within doubleWindow = hard turn

    // PS5 DualSense (any controller with the standard layout works).
    // Button numbers follow the browser's standard gamepad layout:
    // 0 Cross, 1 Circle, 2 Square, 3 Triangle, 4 L1, 5 R1, 6 L2, 7 R2,
    // 8 Create, 9 Options, 10 L3, 11 R3, 12-15 D-pad up/down/left/right, 16 PS, 17 touchpad.
    gamepad: {
      deadzone: 0.15,
      rollFlick: 0.75,        // right stick pushed this far sideways in flight = barrel roll (hold = corkscrew)
      invertFlightY: false,   // true: pull the stick back to dive
      sticks: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
      analog: { up: 7, down: 6 },       // flight: R2 throttle up, L2 throttle down
      hold: { boost: 5 },               // flight: R1 boost / afterburner
      flightBrake: 4,                   // flight: hold L1 to brake
      hover: { up: 5, down: 4, boost: 7 },   // hover: R1 climb, L1 descend (double-tap L1 and hold: cut thrusters), R2 boost
      doubleTap: 0.3,                   // seconds between taps for the L1 double-tap
      actions: {
        flight: 0,    // Cross
        flip: 1,      // Circle
        grab: 2,      // Square
        camera: 3,    // Triangle
        flare: 13,    // D-pad down: flares (flight)
        help: 8,      // Create
        workshop: 9,  // Options
        reset: 17,    // Touchpad press
        jukeLeft: 14, jukeRight: 15,  // D-pad: roll + juke (hover: sidestep)
        autosteer: 12,                // D-pad up: auto-steer Off / Light / Full
      },
      menu: { select: 0, back: 1, up: 12, down: 13 },
      rumble: true,
    },
  },
};
