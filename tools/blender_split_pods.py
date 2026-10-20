import sys; sys.path.insert(0,'.')
from blender_common import *
me, arm = load()
bm, isl, cents = islands(me)
# Pod faces: islands behind the upper back, left (+X) and right (-X)
sides = {'L': [], 'R': []}
for comp, c in zip(isl, cents):
    if c.y > 0.06 and c.z > 1.02 and abs(c.x) > 0.05:
        sides['L' if c.x > 0 else 'R'].extend(comp)
bm.free()
def split(faces, name):
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = me; me.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
    fs=set(faces)
    for p in me.data.polygons: p.select = p.index in fs
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
    new=[o for o in bpy.context.selected_objects if o != me][0]
    new.name = name
    return new
# indices shift after the first separate, so separate both at once by pre-marking
allf = set(sides['L']) | set(sides['R'])
pods = split(list(allf), 'pods')
# split pods into left/right by x
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = pods; pods.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
mw = pods.matrix_world
for p in pods.data.polygons: p.select = (mw @ p.center).x > 0
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
podL = [o for o in bpy.context.selected_objects if o != pods][0]; podL.name = 'pod_L'; pods.name = 'pod_R'
spine = arm.data.bones['Spine01']
for pod in (podL, pods):
    # no skinning: the pod is a rigid piece riding on the spine bone
    for m in list(pod.modifiers): pod.modifiers.remove(m)
    pod.vertex_groups.clear()
    # pivot at the base mount: bottom of the pod, at its inner, front edge (against the back)
    ws = [pod.matrix_world @ v.co for v in pod.data.vertices]
    zmin = min(v.z for v in ws); zmax = max(v.z for v in ws)
    low = [v for v in ws if v.z < zmin + (zmax - zmin) * 0.25]
    piv = Vector((sum(v.x for v in low) / len(low), min(v.y for v in ws) + 0.03, zmin + (zmax - zmin) * 0.15))
    bpy.context.scene.cursor.location = piv
    bpy.ops.object.select_all(action='DESELECT'); pod.select_set(True); bpy.context.view_layer.objects.active = pod
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # nozzle marker at the exhaust end (bottom)
    noz = bpy.data.objects.new(pod.name + '_nozzle', None)
    bpy.context.scene.collection.objects.link(noz)
    noz.location = Vector((piv.x, piv.y + 0.02, zmin - 0.02))
    noz.parent = pod; noz.matrix_parent_inverse = pod.matrix_world.inverted()
    # parent to the spine bone, keeping where it is
    mwp = pod.matrix_world.copy()
    pod.parent = arm; pod.parent_type = 'BONE'; pod.parent_bone = 'Spine01'
    pod.matrix_world = mwp
    print(pod.name, 'pivot', [round(x, 3) for x in piv], 'height', round(zmax - zmin, 3), 'faces', len(pod.data.polygons))
print('body faces', len(me.data.polygons))
# textures to 1024 for the browser
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('suit_refined.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.abspath('suit_refined.glb'), export_format='GLB', export_image_format='JPEG', export_animations=False, export_apply=False)
render('pods2', {'back34': (math.pi * 0.78, 0.35, 2.6)})
