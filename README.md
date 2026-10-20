# Scrapjack: test range prototype

A browser prototype for a build-your-own power suit game. It uses physics-based flight, modular parts, heat, and damage that lands on the part that got hit.

## Run it locally
ES modules need a local web server (opening the file directly won't work):

```
npx http-server . -p 8080
```
Then open http://localhost:8080. Add `?debug` to expose `window.__scrapjack` for testing.

## How the code is organized
Each system lives in its own file. Systems talk through a small event bus instead of importing each other, so you can swap one out without touching the rest.

| Folder | What's in it | Change it when you want to… |
|---|---|---|
| `src/core/config.js` | Every tuning number and key binding | Change how flying feels, damage, heat, controls |
| `src/data/parts.js` | The parts catalog (pure data) | Add a new helmet, boot, jet, etc. |
| `src/data/range.js` | Test range layout: towers, rings, crates | Move things around, add a course |
| `src/physics/` | Rigid body and collisions | Rarely |
| `src/flight/controller.js` | Turns keys into "wanted force and spin" (assist + manual modes) | Add a flight mode |
| `src/flight/jetFlight.js` | Fast flight mode: banked turns, barrel rolls, flip-and-burn | Tune maneuvers, add new ones |
| `src/physics/aero.js` | Air on the body: drag, lift, braking | Change how slippery or floaty flight is |
| `src/flight/thrustMixer.js` + `allocator.js` | Splits the work between whatever thrusters exist, including swivelling nozzles | Rarely: it handles any thruster layout |
| `src/suit/` | Suit built from a loadout, heat, damage | Add new part effects |
| `src/world/` | Ring course timer, cargo, drone chase | Add missions (rescue, hacking…) |
| `src/game/Game.js` | The simulation step. No rendering, no DOM | Add new systems to the update |
| `src/render/` | Three.js visuals only | Replace box models with real art |
| `src/ui/` | HUD, workshop, keyboard + PS5 controller input (`GamepadInput.js`) | Add new screens, change controller layout (mapping is in `config.js`) |
| `src/lib/three.js` | The one place Three.js is loaded | Upgrade Three.js |

### Rules that keep changes cheap
- **Data, not code.** New parts and levels are entries in `data/`, not new logic.
- **Simulation separate from visuals.** `game/`, `physics/`, `flight/` and `suit/` never touch the screen. That makes them easy to test, and easy to port to Godot later.
- **Thrusters do all the moving.** The controller only says what it *wants*. Damaged or overheated thrusters automatically change how the suit flies, with no special cases.

## Adding a part (example)
Add this to `PARTS` in `src/data/parts.js`:

```js
boots_rocket: {
  slot: 'boots', name: 'Rocket Boots', tier: 3, mass: 20,
  thrusters: boots({ thrust: 1100, powerPerN: 0.05, heatRate: 60, cool: 60, hp: 70 }),
  blurb: 'Huge push, huge heat.',
  visual: { shape: 'ion', color: 0x903020 },
},
```
It shows up in the workshop, flies, heats and takes damage automatically.

## Ideas for next steps
- Hacking: scan and take over drones or turrets (new `world/hacking.js` + HUD layer)
- Rescue missions: carry people out of a burning building, catch a falling lift
- Part progression: unlock parts by salvaging them on missions
- Port the simulation to Godot once the flight feel is right
