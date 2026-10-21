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
    # getting up off the ground (whole body: these also record the hips' turn and height)
    'getUpBack': ('stand up.fbx', 15, False, 'full'),          # lying on his back (slow)
    'getUpFront': ('stand up 2.fbx', 30, False, 'full'),       # face down, quick push-up
    'getUpFront2': ('standing up 2.fbx', 30, False, 'full'),   # face down, quick
    'getUpFrontSlow': ('standing up.fbx', 15, False, 'full'),  # face down, slow (a hard knockout)
}

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes, bpy.data.materials):
        for x in list(coll): coll.remove(x)

def to3(v):   # Blender (character faces -Y, +Z up) -> three.js suit frame (faces -Z, +Y up)
    return (-v.x, v.z, v.y)

from mathutils import Matrix
C3 = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0)))   # Blender -> three.js suit frame (a rotation)
REF = None   # the hips' upright rest orientation (from the idle clip's first frame)

out = {'bones': BONES, 'clips': {}}
for name, (file, fps, loop, unturn) in CLIPS.items():
    full = unturn == 'full'
    if full: unturn = False
    clear()
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, file))
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    act = arm.animation_data.action
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    src_fps = bpy.context.scene.render.fps
    pb = arm.pose.bones
    step = src_fps / fps
    data, hips, hq, hy = [], [], [], []
    n = int((f1 - f0) / step) + (0 if loop else 1)   # (a loop's last frame repeats its first)
    yaw0 = None
    if REF is None:
        bpy.context.scene.frame_set(f0)
        REF = (arm.matrix_world.to_3x3() @ pb[M + 'Hips'].matrix.to_3x3()).normalized()
    endRot = 0.0
    if full:
        # turn the whole clip so it ends facing straight ahead (the way the suit faces)
        bpy.context.scene.frame_set(f1)
        fw = arm.matrix_world.to_3x3() @ (pb[M + 'Hips'].matrix.to_3x3() @ Vector((0, 0, 1)))
        endRot = -math.pi / 2 - math.atan2(fw.y, fw.x)
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
        if full: rot = endRot
        c, s = math.cos(rot), math.sin(rot)
        if full:
            Rz = Matrix(((c, -s, 0), (s, c, 0), (0, 0, 1)))
            Rh = (W.to_3x3() @ pb[M + 'Hips'].matrix.to_3x3()).normalized()
            D = C3 @ (Rz @ Rh @ REF.inverted()) @ C3.transposed()
            q = D.to_quaternion()
            hq.extend(round(x, 4) for x in (q.x, q.y, q.z, q.w))
            hy.append(round(hp.z, 3))
        for b in BONES:
            a, t = MAP[b]
            d = (W @ pb[M + t].head) - (W @ pb[M + a].head)
            d = Vector((d.x * c - d.y * s, d.x * s + d.y * c, d.z)).normalized()
            data.extend(round(x, 3) for x in to3(d))
    # speed of travel over the clip (m/s): the root motion the game replaces with its own movement
    dist = math.hypot(hips[-1][0] - hips[0][0], hips[-1][1] - hips[0][1])
    dur = (f1 - f0) / src_fps
    out['clips'][name] = {'fps': fps, 'frames': n, 'loop': loop, 'speed': round(dist / dur, 3), 'duration': round(dur, 3), 'dirs': data}
    if full: out['clips'][name].update({'hipsQ': hq, 'hipsY': hy, 'hipsRest': 1.03})
    print(name, n, 'frames', round(dur, 2), 's', round(dist / dur, 2), 'm/s')
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT))
