# Suit 2 clean-up (how assets/suit2* were made)

1. Rebuild a .gltf from assets/suit2.json (+ bin parts, textures).
2. `npx @gltf-transform/cli@4 weld` then `simplify --ratio 0.25 --error 0.0008` (624k -> ~163k triangles).
3. Remove tiny loose pieces (< 30 triangles) of the ivory, navy and orange parts (stray flakes at plate edges).
4. `smooth.py 10`: Taubin-smooth the open edges of the plates (straightens the saw-tooth edges without shrinking).
5. `python3 tools/pack_split.py smooth.glb assets/suit2`.

In the game, `suitModel.colorLock` keeps each part its own colour (the parts share one texture that
bleeds specks of other colours), and `suitModel.tint` lifts the navy.
