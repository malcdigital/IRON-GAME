# Finger bones for the suit model

The generated model's skeleton stops at the wrists. These scripts add 3 bones to each finger and
thumb (named like `RightHandIndex1..3`) and bind the finger vertices to them.

Run in order (Blender's Python for the .py files that import bpy; plain Python for the rest):
1. `handgraph.py`  (Blender) welds the mesh and saves its hand vertices/edges to mesh.npz
2. `fingers.py`    finds the finger tips by distance over the surface from the wrist
3. `fregions.py`   colours each finger's region (check the plots)
4. `fbuild.py`     grows the regions to the knuckles, places joints, works out weights
5. `addfingers.py` (Blender) adds the bones and weights, saves suit_fingers.blend
Then export a GLB and pack it with `tools/pack_model.py`.
