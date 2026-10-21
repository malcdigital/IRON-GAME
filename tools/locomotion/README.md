# Locomotion clips

`art/locomotion/*.fbx` are the Mixamo Male Locomotion Pack (X Bot rig). `extract_clips.py` samples
them in Blender into `assets/locomotion.json`: per frame, the direction each body bone points, in the
suit's frame. `src/render/Locomotion.js` blends them in the game (walk / run / strafe / turn / idle).

To add a clip: put the FBX in `art/locomotion/`, add a line to `CLIPS` in the script, re-run it.

The getting-up clips (`stand up*.fbx`, `standing up*.fbx`) are marked `'full'`: they also record the hips' turn and height, and are turned to end facing forward. `CONFIG.recover.clips` picks which one plays (on his back / face down).
