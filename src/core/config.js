// All tuning numbers live here. Change how the game feels without touching logic.
// Body frame: +Y is up (head), -Z is forward, +X is the suit's right.

export const CONFIG = {
  // Building tools: the Camera Studio (K) and Pose Studio (P). Set false for the finished game.
  devTools: true,

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
    idleThrust: 0.35,          // the jets always burn at least this (× your weight) in flight
    overspeedBrakeG: 1.5,      // faster than the target speed (after a launch): shed it at up to this many g
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
    boosted: 1.15,     // hold boost while launching: a launch this much stronger (same 1.5 s)
    rampTime: 0.7,     // the kick and the thruster boost build up smoothly over this long (s)
    // The launch sequence (set it in the Pose Studio's Launch tab): from the ground, crouch until
    // jumpAt s, jump (jumpSpeed m/s, jumpAngleDeg above level, toward where you face), thrusters fire
    // at fireAt s. In the air: fire at airFireAt s.
    // Launching from a hover: the nose tips from startDeg over into a dive at diveDeg (diveTime s),
    // then pulls out to level flight (pullTime s)
    air: { startDeg: 25, diveDeg: -18, diveTime: 1.0, pullTime: 1.5,
      rampTime: 0.25, kickMult: 3.6,   // explosive: the thrust and kick hit almost at once (kick x3.6)
      // the blast as it fires: flames flare to flame x their length, the camera is knocked back
      // (camBack of its distance) and widens fov degrees, with a sharp shake; all fading over time s
      blast: { time: 0.6, flame: 2.6, camBack: 0.3, fov: 12, shake: 0.09 },
      // charged up first (hold L1 + R1 in the air, then launch): kick x kick, blast effects x blast
      charged: { kick: 1.5, blast: 1.6 },
      // relaunching while still braking into a hover (leaning back): tuck and backflip into flight
      // position (time s), then the burst
      flip: { time: 0.6 } },   // (rampTime: the thrust spools up more gently than a ground launch)
    seq: { jumpAt: 0.35, fireAt: 0.55, jumpSpeed: 8, jumpAngleDeg: 17, airFireAt: 0.3,
      tipRate: 14 },   // during the jump the thrusters are off and the body tips forward (up to tipRate rad/s) to line up with it
    chargeReady: 0.2,   // crouched this long (s) holding L1 + R1? launch skips the wind-up
    // Climb-out after launching from the ground: nose starts pitchDeg up, eases to levelDeg over time s
    climb: { pitchDeg: 28, levelDeg: 4, time: 1.4, alignTime: 0.8 },
    // Boosted takeoff (hold boost as you launch from the ground): jump nearly straight up, then fly
    // this curve (height y against distance forward x, metres; from art/burst_curve.pdf) toward
    // where you face, speeding up to speed m/s over rampTime s, body lined up with the path.
    burst: {
      jumpAngleDeg: 88, speed: 108, rampTime: 0.6, velGain: 10, posGain: 25, turnRate: 20,
      rolls: 3, rollFrom: 8, rollTo: 148, rollEase: 0.2,   // barrel rolls, from rollFrom to rollTo metres along the path (it's about 150 m long); rollEase: share spent spinning up / down   // gains: how tightly it holds the path; turnRate: body turn (rad/s)
      curve: [
        { x: 0, y: 0, in: [0, -13.68564], out: [0, 92.17321] },
        { x: 100, y: 50, in: [-88.11446, -2.798209], out: [36.23938, 1.150837] },
      ],
    } },   // alignTime: s the body is held lined up with the path

  // Thermal limiter: instead of cutting out at 100%, thrusters and the core
  // taper their output as they get hot, so you sink gently rather than drop.
  thermalLimiter: { enabled: true, start: 74, end: 92, floor: 0.2 },

  boost: { thrustMult: 2.2, heatMult: 1.7, powerMult: 2 },   // boost overclocks the core (powerMult) for ~40% more top speed

  // Assisted flight: the suit holds altitude, levels itself and brakes when you let go.
  assist: {
    maxSpeed: 22, boostSpeed: 30,
    climbRate: 18, boostClimbRate: 25, descendRate: 24,
    settleRoom: 0.35, settleSpeed: 1.2,   // floating within settleRoom m of the ground, nothing pressed: sink onto your feet at settleSpeed m/s
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
    walkSpeed: 2.25, runSpeed: 6,   // on the ground the stick walks (boost = run)
    // On foot (walking / running about on roofs and the ground): walking off a ledge drops you with
    // the jets off (press climb to fire them); walking into a ledge climbs it.
    //   stepDown: drops up to this (m) are just a step down; stepUp: ledges up to this you step up
    //   onto; mantleMax: ledges up to this above your feet you climb (mantle); reach: how far ahead
    //   (m from your middle) a ledge is found; inset: how far onto the top you end up;
    //   stepTime / mantleTime (+ mantlePerM per metre of height): how long it takes (s)
    //   jetMax: higher ledges (up to this) he reaches with a burst from the boot and hand jets, then
    //   pulls over (jetTime + jetPerM per metre); overshoot: how far above the top the arc peaks (m)
    //   heroFromM: walking off a drop at least this high (m) ends in the superhero landing
    onFoot: { stepDown: 0.5, stepUp: 0.5, mantleMax: 2.2, reach: 0.8, inset: 0.5, stepTime: 0.14, mantleTime: 0.18, mantlePerM: 0.1,
              jetMax: 6, jetTime: 0.4, jetPerM: 0.07, heroFromM: 6, overshoot: { step: 0.03, climb: 0.12, jet: 0.4 } },
    // leaving flight: an aggressive brake to a hover. The body swings back leanDeg past upright into
    // the wind (turnGain: how hard it whips round), hands and boots fire forward, height is held
    // (holdGain); slows at up to maxG g. fx: flame flare, camera shake and fov squeeze as it hits.
    exitBrake: { time: 1.1, gain: 6, maxG: 5, leanDeg: 40, turnGain: 4, holdGain: 5, whipRate: 10, whipGain: 14,   // whipRate: top swing speed (rad/s)
      fx: { time: 0.5, flame: 1.9, shake: 0.07, fov: 7 } },
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

  // Lying on the ground (after a crash): after delay s he gets up with a matching clip (art/locomotion):
  // on his back, or face down (a quick one at random, or the slow one after a knockout harder than
  // slowAbove m/s). head: where the clip's head points at its start (x, z in the suit's frame), so the
  // clip lines up with how he's really lying; speed: playback speed; time: the clip's length (s).
  recover: { delay: 0.8, slowAbove: 28,
    // hitting the ground knocked out: he keeps his momentum along the ground, slowing at decel m/s²
    // (below minSpeed m/s he just settles). Moving across his body: a log roll (radius: how thick he
    // is); along it: a tumble head over heels (tumbleRadius; halfLength: half his height, how high
    // he swings up going over). Whole turns only, so he ends the way he landed. blendIn s to ease in
    // from how he hit; minTime s at the least.
    roll: { decel: 12, minSpeed: 3, radius: 0.22, rollRadius: 0.5, tumbleRadius: 0.55,   // (rollRadius: distance per log-roll turn ÷ 2π)
      halfLength: 0.85, blendIn: 0.15, minTime: 0.35,
      maxTumbleTurns: 2, maxRollTurns: 3 },   // most flips / rolls after a crash; the rest of the speed is a skid along the ground
    clips: {
      back: { name: 'getUpBack', head: [0.21, 0.98], speed: 2.2, time: 8.27 },
      front: [{ name: 'getUpFront', head: [-0.46, -0.89], speed: 1.1, time: 2.33 }, { name: 'getUpFront2', head: [0.81, -0.4], speed: 1.1, time: 1.67 }],
      frontSlow: { name: 'getUpFrontSlow', head: [0.09, -1.0], speed: 2.5, time: 11.4 },
    } },

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
    style: 'realistic',             // (split-suit test: show the suit's own textures and materials) suit shading: 'paint' (painterly anime), 'anime' (soft, warm rim light), 'toon' (hard bands) or 'realistic'
    // Painterly anime suit (art.style 'paint'): map = the repainted colours with ink lines;
    // lit / shade = light colour where the sun hits / in shadow; step, soft = where the shadow edge
    // falls (0..1) and how soft it is; ambient = fill-light tint; spec, specSize = painted highlight
    // strength and how tight it is (closer to 1 = smaller); normal = panel-detail depth;
    // outline = ink line round the silhouette (width in m)
    paint: { map: 'assets/suit_paint.jpg', normalMap: 'assets/suit_paint_nrm.jpg', lit: 0xfff3e2, shade: 0x8a80c4, step: 0.5, soft: 0.12,
             ambient: 0xb4b0d8, spec: 0.22, specSize: 0.94, normal: 0.55,
             outline: { width: 0.006, color: 0x1c1828 } },
    exposure: 1.25,
    sunElevation: 14, sunAzimuth: 35,   // low sun (degrees above the horizon; direction round from -Z)
    sunColor: 0xffc994, sunIntensity: 3.2,
    skyLight: 0xc6b8ec, groundLight: 0x6fa8a4, ambient: 1.4,   // lavender above, teal bounce below
    haze: 0xe6c4c4, hazeNear: 160, hazeFar: 2600,                 // distance haze (warm lavender-pink)
    sky: { top: 0x3c4a8c, mid: 0x8f80c0, horizon: 0xffbe7a, below: 0x7d9ab0, sun: 0xffd9a0,
           cloudLit: 0xffd2a8, cloudShade: 0x6b5f8f },
    bloom: { strength: 0.35, radius: 0.5, threshold: 0.93 },    // glow on bright things
    grade: { warm: 0xffeedd, cool: 0xd2dcf4, saturation: 1.12, vignette: 0.15 },
    rim: { color: 0xffa860, strength: 0.45, power: 3.2 },        // warm edge light on the suit
    // Thrust streaks: each nozzle leaves a glowing ribbon. life = how long a bit of it lasts (s);
    // it drifts out of the nozzle at exhaustSpeed (m/s) plus carry × the suit's own speed
    // Thruster looks (src/render/ThrusterFx.js). Flame colours down the jet: hot (at the nozzle) ->
    // mid -> cool (tip); boost* when boosting. diamonds: shock-diamond brightness, diamondCount: how
    // many down the flame. flicker: length pulse (0..1), wobble: sideways wobble (flame widths).
    // boostLength: how much longer the flames get when boosting. haze: shimmer strength, length (m).
    thrusters: {
      hot: 0xfffbe8, mid: 0xffc04a, cool: 0xff5a1e, root: 0x8f7bff,   // (root: the blue-violet right at the nozzle)
      idleFlame: 0.3,   // in flight the back and hand flames never look smaller than this throttle
      baseLength: 0.32, baseWidth: 0.55, glowSize: 0.22, glow: 0.9,   // the hot base cone (share of the flame) and the nozzle glow boostHot: 0xdff4ff, boostMid: 0x4aa8ff, boostCool: 0x2f3cff,
      diamonds: 0.9, diamondCount: 4, flicker: 0.12, wobble: 0.025, boostLength: 0.7, boostRate: 4,
      trailBoostCore: 0xeaf8ff, trailBoostEdge: 0x4f8dff,
      embers: { enabled: false, rate: 22, hoverRate: 8, boostRate: 3, speed: 9, spread: 2.5, life: 0.45, size: 0.05, gravity: 5, drag: 2.5, brightness: 1.4, hot: 0xffe9a0, cool: 0xff3a10, boost: 0xa8e4ff },
      smoke: { washRate: 26, washRange: 3.5, washSpeed: 4, flightRate: 3, spread: 1.2, life: 1.6, size: 0.45, rise: 0.6, drag: 1.6, opacity: 0.32, color: 0xb7aaa6 },
      ring: { radius: 2.6, time: 0.35, drift: -6, opacity: 0.8 },
      haze: { strength: 0.175, length: 0.9 },
    },
    // thrust trails: at most life / hoverLife s long, and never longer than length / hoverLength /
    // boostLength m (so they're the same size at any speed)
    trail: { life: 0.28, hoverLife: 0.22, length: 0.9, hoverLength: 0.3, boostLength: 1.25, exhaustSpeed: 9, carry: 0.15, width: 0.1, boostWidth: 0.15, max: 140,
      core: 0xfff3d2, edge: 0xff7a2e, ionCore: 0xe2f8ff, ionEdge: 0x3fb0ff, flameScale: 0.38 },
  },
  // The coastal city (src/render/CityScenery.js, WorldView.js): colours and how much of everything
  world: {
    seaDeep: 0x1f6f9a, seaShallow: 0x46d3d0, foam: 0xf4fbfa, seaSky: 0x9fc6e0,
    shoreRect: [-1700, -2500, 3600, 3400],   // the area the shallows / foam are worked out over (x, z, width, depth)
    sand: 0xf1dfc0, paving: 0xe9dccb, grass: 0x7fae6a, hill: 0x6e9d5c, seawall: 0xdcccb6, beachWidth: 16,
    pastels: [0xf6e7d4, 0xf3c6ba, 0xcde9dc, 0xf7d7b2, 0xe8e0f2, 0xfbf4e6, 0xc6dfec, 0xf4d3d9],
    palmLeaf: 0x3e8c4a, shorePalmEvery: 26, streetPalmEvery: 24, roofPalms: 0.45,
    mountains: 70, mountainNear: 0x9aa6c8, mountainFar: 0xb9b7d3,
    cloudPuffs: 150, cloudLit: 0xfff1e2, cloudShade: 0xc9b6cf,
    trainCars: 5, trainSpeed: 28, trainStripe: 0xf28a3c,
    boats: 22, boatColors: [0xf28a3c, 0x3c7bd1, 0xe85a5a],
    litWindows: 0.18,   // share of windows lit warm at sunset
  },

  suitStyle: 'model',
  // 'model': the 3D model made from the character sheet (falls back to 'hero' if it can't load)
  // Body language for the 3D suit (poses themselves are in src/render/SuitPoses.js)
  // Ground movement from the Mixamo clips (src/render/Locomotion.js). Speeds in m/s, turn in rad/s:
  // moving blends in from moveFrom to moveFull, walk -> run from runFrom to runFull, stepping on the
  // spot while turning from turnFrom to turnFull. cadence: steps faster (>1) or slower than the ground.
  locomotion: { enabled: true, url: 'assets/locomotion.json', smooth: 10, moveFrom: 0.15, moveFull: 0.9,
    runFrom: 3.2, runFull: 5.5, turnFrom: 0.4, turnFull: 1.5, cadence: 1 },

  pose: {
    blendRate: 5,                   // how quickly it moves into a new pose
    leanRate: 9, leanPerMs: 1.2, leanMax: 18,     // hover: degrees of lean per m/s of movement (up to leanMax)
    turnRate: 5, turnPerMs2: 0.5, turnMax: 25,    // flight turns: degrees of lean into the turn per m/s² of turning
    // landing hard (falling faster than heroFrom m/s, or any drop with the thrusters cut): the
    // superhero landing (pose 'land'), held heroHold s (no walking off), standing up over heroRise s
    landing: { heroFrom: 7, heroHold: 0.55, heroRise: 0.6, dropSpeed: 6,
      // the hit: camera shake (m) and dip, fov squeeze (deg), all fading over shakeTime s; a
      // hitStop s freeze-frame (full at fullSpeed m/s); rumble on the controller
      shake: 0.2, dip: 0.35, fov: 6, shakeTime: 0.6, hitStop: 0.07, fullSpeed: 20,
      // dust cloud: puffs (count), speed out along the ground (m/s), rise (m/s), drag, size (m) and
      // how much it grows, life (s), opacity, colour; the shockwave ring's radius (m) and time (s)
      dust: { puffs: 130, speed: 16, rise: 2.4, drag: 2.2, size: 1.0, grow: 3.6, life: 2.6, opacity: 0.55, color: 0xd9bfa3, ringRadius: 11, ringTime: 0.5 },
      // cracks in the ground: count, length (m), width (m), chance to fork per step, how jagged,
      // how fast they shoot out (s), how long they glow hot (s), stay (s) then fade (s), the dark
      // scorch's radius (m), how many sets at once, colours
      cracks: { count: 9, length: 4.5, width: 0.13, forks: 0.14, jag: 0.6, growTime: 0.18, coolTime: 0.7, stay: 8, fade: 2,
        crater: 1.4, max: 4, color: 0x17110c, rim: 0xb8a088, glow: 0xff7a2a } },
    landSpeedFull: 10, landTime: 0.45, crouchDeg: 35,   // landing crouch: full at this fall speed, back up in landTime s
    stepsPerMeter: 0.9, walkSwing: 28,            // walking legs
    limits: true,                   // keep every joint within real human ranges (SuitPoses.js LIMITS)
    groundRoom: 0.25,
    // Subtle touches: dive/climb pose at this nose angle (degrees), leg springs (how fast they swing
    // back and how little they're damped: lower damping = more wiggle), now-and-then leg shifts (every
    // fidgetEvery s, about fidgetDeg degrees), airflow flutter, breathing, glances
    subtle: { tremble: 1.6,   // charged-up crouch (L1 + R1): size of the tensed tremble (degrees)
      spinFling: 32, spinLag: 14,   // boosted takeoff rolls: how far the spin throws the limbs out / how far they trail (degrees)
      pitchFullDeg: 50, legSpring: 14, legDamping: 0.38, fidgetEvery: [2.5, 6], fidgetDeg: 4, flutterDeg: 4, breathPeriod: 3.4, breathDeg: 1.6, glanceDeg: 7 },
    // Moments: hop-off-the-ground length, post-knockout recovery length (s), head shake
    moments: { leanWindow: 3, leanPush: 1,   // mid-air launch: how long the lean-into-flight blend runs (s), how hard the arms sweep back
      hopTime: 0.35, recoverTime: 1.6, shakeDeg: 28 },
    // Flight body language, from the physics. amount scales it all (0 = off).
    flight: {
      amount: 1,
      react: 6,                     // how quickly it reacts
      pullFull: 35,                 // g toward the back in a turn (m/s²) for the full arch-and-lag
      latFull: 20,                  // sideways push (m/s²) for the full leg swing
      rollFull: 10,                 // roll speed (rad/s) for the full tuck
      rollAccFull: 40,              // roll speed-up (rad/s²) for the full arm fling
    },
    // Hover body language, from the physics. amount scales it all (1 = as tuned, 0 = off).
    hover: {
      amount: 1.3,
      react: 8,                     // how quickly it reacts (higher = snappier)
      tiltMax: 32,                  // most the body tilts (degrees)
      pushPerMs2: 1.4,              // extra tilt per m/s² of speeding up or braking
      legTrail: 1.6, armSweep: 1.7, // how far legs trail and arms sweep back behind, × the tilt
      armSweepBack: 1.4,            // moving backwards: how far the arms reach out in front, × the tilt (the torso itself stays straight)
      pushTwist: -60,               // moving backwards: forearm turn (degrees) that faces the palms forward
      pushFullDeg: 12,              // moving backwards: tilt (degrees) at which the palms are fully turned forward, pushing
      sideHips: 0.12, sideTrail: 0.45, sideStraight: 1.2,   // moving sideways: pelvis tilt, legs swinging out at the hip joints, how much the knees straighten
      twistPerRads: 14, twistMax: 25,   // turning: chest twist per rad/s of turn (degrees)
      climbFull: 10,                // climb / drop speed (m/s) for the full arms-and-legs reaction
      intentShare: 0.6,             // how much pressing climb / descend leans into the pose before the speed builds
      vertSpring: 12,               // how quickly the climb / drop / idle poses ease into each other (higher = snappier)
      climbArmIn: 4,                // climbing: how far the arms draw in from the idle hover spread (degrees; they stay clear of the sides)
    },               // counts as standing when the feet are within this of the ground (m)
  },
  suitModel: {
    backVent: [0.01, -0.012, 0.17],   // the back thruster: the black vent between the shoulder blades (x either side, up, back; m from the upper chest bone)
    url: 'assets/suit2.json', height: 1.9,   // split, textured suit (test copy; the original is assets/suit.json)
    feetY: -1.03, turn: Math.PI,
    tint: { Undersuit_Navy: [3, 2.9, 4] },
    // each part keeps its own colour (stray specks of other colours in the shared texture are ignored);
    // lo..hi = how much of the texture's light and dark shading still shows
    colorLock: { lo: 0.82, hi: 1.08, mats: { Armor_Ivory: 0xf3e7dc, Undersuit_Navy: 0x121c2a, Accent_Orange: 0xf36b2d } },   // colour boost per material (r, g, b; 1 = as painted): the undersuit reads navy, not black
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
      hover:  { distance: 4.2, orbit: 0, height: 30, shoulder: 0,   lookUp: 1,    lookAhead: 0,    fov: 90, bank: 0,    lag: 6, shake: 0 },
      flight: { distance: 2.2, orbit: 0, height: 18, shoulder: 0.1, lookUp: -3,   lookAhead: 20.5, fov: 60, bank: 0,    lag: 7, shake: 0 },
      boost:  { distance: 6.2, orbit: 0, height: 12, shoulder: 0,   lookUp: -1.4, lookAhead: 20,   fov: 74, bank: 0.35, lag: 5, shake: 0.03 },
      charge: { distance: 2.8, orbit: 0, height: 38, shoulder: 0,   lookUp: 0.6,  lookAhead: 0,    fov: 68, bank: 0,    lag: 8, shake: 0 },   // L1 + R1 crouch on the ground
    },
    // Charging up (L1 + R1 crouch on the ground): its own shot (shots.charge, set it in the Camera
    // Studio), eased in and out over blendTime s, plus a small tense shake (m)
    charge: { blendTime: 0.35, shake: 0.00625, spring: 7 },
    // Boosted takeoff: the camera pulls back this much further (m), widens the view by fovMult (0.5 = +50%),
    // and keeps the horizon level, until returnAt of the way along the curve (0.5 = halfway), then eases back.
    // spring: how quickly it eases in and out.
    burst: { distance: 7.8, fovMult: 0.5, spring: 6, returnAt: 0.5 },   // (7.8 on top of the 2.2 m flight shot = 10 m away)
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

  // Crashes: a hit harder than knockSpeed (m/s) knocks the pilot out. Thrusters cut, no control, the
  // suit tumbles and falls on its own physics, then reboots into hover. Above braceSpeed the suit
  // braces when it will hit something within braceTime seconds.
  crash: { knockSpeed: 14, stunMin: 0.5, stunPerMs: 0.02, stunMax: 1.5, braceSpeed: 12, braceTime: 0.45,
    tumble: 0.09,     // spin from an off-centre hit: rad/s per m/s of impact speed
    // Coming round in the air (more than rescueMinRoom m up): the recovery flip (below) while the jets
    // burn to slow the fall to rescueSinkSpeed (up to rescueBrakeAccel m/s² extra); below
    // rescueAbortRoom the normal hover takes over.
    rescueMinRoom: 5, rescueAbortRoom: 2.5, rescueTurnGain: 2.5, rescueFacedDeg: 20, rescueOrientMax: 1.2, rescueSpin: 7,
    rescueSinkSpeed: 1.5, rescueBrakeAccel: 34,
    keepFlightSpeed: 18,   // knocked out in flight but still moving faster than this (m/s, sideways)? come round straight back into flight
    // knocked out in the air: he turns onto his back (pose 'knocked': knees up, arms reaching up)
    // at up to settleRate rad/s, limbs a little loose (limp 0..1). Coming round: tuck (tuckTime s),
    // then a backflip (and twist to face the way you're going) back upright over flipTime s
    recovery: { settleRate: 5, settleGain: 7, limp: 0.3, tuckTime: 0.12, flipTime: 0.5,   // (the arms throw out and the jets drive the flip round)
      pop: 3.5,   // upward kick (m/s) as the flip starts
      // after the flip: a tightrope wobble to steady himself (sway side to side rollDeg, rock
      // pitchDeg, at freq per second, dying away over steadyTime s), arms out wide for balance
      steadyTime: 1.3, rollDeg: 20, pitchDeg: 7, freq: 1.5 },
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
      cut: ['KeyZ'],             // hover: hold to cut the thrusters and drop (or double-tap C: stays cut until C / Space)
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
      poses: ['KeyP'],
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
      hover: { up: 5, down: 4, boost: 7 },   // hover: R1 climb, L1 descend (double-tap L1: cut thrusters, stays cut until L1 / R1), R2 boost
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
