# Samples the Mixamo locomotion clips (art/locomotion/*.fbx) into assets/locomotion.json.
# For each frame it records the direction each body bone points (from its joint to the next joint),
# in the character's own frame (three.js axes: +Y up, -Z forward, +X right). The game feeds these
# straight into the suit's poser as bone aims, so the clips work on our differently built skeleton.
# Run (Blender's Python, from a directory without other .py files):
#   python -c "import bpy, sys; sys.argv=['x', '<fbx dir>', '<out.json>']; exec(open('<this file>').read())"
import bpy, sys, os, json, math
from mathutils import Vector

SRC, OUT = sys.argv[-2], sys.argv[-1]
M = 'mixamorig:'
# our bone <- (mixamo joint, mixamo joint it points at)
MAP = {
    'Spine02': ('Spine', 'Spine1'), 'Spine01': ('Spine1', 'Spine2'), 'Spine': ('Spine2', 'Neck'),
    'neck': ('Neck', 'Head'), 'Head': ('Head', 'HeadTop_End'),
}
for s in ('Left', 'Right'):
    MAP.update({
        f'{s}Shoulder': (f'{s}Shoulder', f'{s}Arm'), f'{s}Arm': (f'{s}Arm', f'{s}ForeArm'),
        f'{s}ForeArm': (f'{s}ForeArm', f'{s}Hand'), f'{s}Hand': (f'{s}Hand', f'{s}HandMiddle1'),
        f'{s}UpLeg': (f'{s}UpLeg', f'{s}Leg'), f'{s}Leg': (f'{s}Leg', f'{s}Foot'),
        f'{s}Foot': (f'{s}Foot', f'{s}ToeBase'),
    })
BONES = list(MAP)
# clip name in the game <- file, frames per second to keep, does it loop, remove the body's turning
CLIPS = {
    'idle': ('idle.fbx', 15, True, False),
    'walk': ('walking.fbx', 30, True, False),
    'run': ('standard run.fbx', 30, True, False),
    'strafeWalkL': ('left strafe walking.fbx', 30, True, False),
    'strafeWalkR': ('right strafe walking.fbx', 30, True, False),
    'strafeRunL': ('left strafe.fbx', 30, True, False),
    'strafeRunR': ('right strafe.fbx', 30, True, False),
    'turnL': ('left turn 90.fbx', 30, False, True),
    'turnR': ('right turn 90.fbx', 30, False, True),
    'jump': ('jump.fbx', 30, False, False),
}

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes, bpy.data.materials):
        for x in list(coll): coll.remove(x)

def to3(v):   # Blender (character faces -Y, +Z up) -> three.js suit frame (faces -Z, +Y up)
    return (-v.x, v.z, v.y)

out = {'bones': BONES, 'clips': {}}
for name, (file, fps, loop, unturn) in CLIPS.items():
    clear()
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, file))
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    src_fps = bpy.context.scene.render.fps
    pb = arm.pose.bones
    step = src_fps / fps
    data, hips = [], []
    n = int((f1 - f0) / step) + (0 if loop else 1)   # (a loop's last frame repeats its first)
    yaw0 = None
    for i in range(n):
        bpy.context.scene.frame_set(int(round(f0 + i * step)))
        W = arm.matrix_world
        hp = W @ pb[M + 'Hips'].head
        hips.append((hp.x, hp.y, hp.z))
        rot = 0.0
        if unturn:
            # how far the hips have turned since the start, taken off so the clip turns on the spot
            ax = (W.to_3x3() @ (pb[M + 'Hips'].matrix.to_3x3() @ Vector((1, 0, 0))))
            yaw = math.atan2(ax.y, ax.x)
            if yaw0 is None: yaw0 = yaw
            rot = -(yaw - yaw0)
        c, s = math.cos(rot), math.sin(rot)
        for b in BONES:
            a, t = MAP[b]
            d = (W @ pb[M + t].head) - (W @ pb[M + a].head)
            d = Vector((d.x * c - d.y * s, d.x * s + d.y * c, d.z)).normalized()
            data.extend(round(x, 3) for x in to3(d))
    # speed of travel over the clip (m/s): the root motion the game replaces with its own movement
    dist = math.hypot(hips[-1][0] - hips[0][0], hips[-1][1] - hips[0][1])
    dur = (f1 - f0) / src_fps
    out['clips'][name] = {'fps': fps, 'frames': n, 'loop': loop, 'speed': round(dist / dur, 3), 'duration': round(dur, 3), 'dirs': data}
    print(name, n, 'frames', round(dur, 2), 's', round(dist / dur, 2), 'm/s')
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT))
