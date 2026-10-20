# Removes the back thruster pods (and their fused mounts) from the refined suit, for the no-pods design.
# Run with Blender's Python from a folder holding common.py and suit_refined.blend.
import sys; sys.path.insert(0,'.')
from common import *
bpy.ops.wm.open_mainfile(filepath=os.path.abspath('suit_refined.blend'))
me=[o for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('pod')][0]
mw=me.matrix_world
def kill(c):
    ax=abs(c.x)
    if c.z>1.12 and 0.05<ax<0.33 and c.y>0.035: return True
    if c.z>1.47 and 0.12<ax<0.32 and c.y>-0.06: return True
    if c.z>1.33 and 0.12<ax<0.21 and c.y>-0.05: return True
    return False
bm=bmesh.new(); bm.from_mesh(me.data)
k=[f for f in bm.faces if kill(mw@f.calc_center_median())]
print('kill',len(k))
bmesh.ops.delete(bm,geom=k,context='FACES'); bm.to_mesh(me.data); bm.free()
for o in list(bpy.data.objects):
    if o.name.startswith('pod'): bpy.data.objects.remove(o)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('suit_nopods.blend'))
render('cut4', {'back': (math.pi, 0.2, 2.6),'back34': (math.pi * 0.78, 0.35, 2.6), 'side': (math.pi / 2, 0.1, 3.0)})
