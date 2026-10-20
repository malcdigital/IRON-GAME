import sys, json; sys.path.insert(0,'.')
from common import *
import numpy as np
from mathutils import Quaternion
CURL=float(sys.argv[-1])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath('suit_v2.glb'))
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
me=[o for o in bpy.data.objects if o.type=='MESH'][0]
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
B=json.load(open('fbuild.json')); weld=np.load('mesh.npz')['weld']
inv=arm.matrix_world.inverted()
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='EDIT')
eb=arm.data.edit_bones
for s,side in (('L','Left'),('R','Right')):
    bones=B[s]['bones']; hand=eb[side+'Hand']
    wrist=arm.matrix_world@hand.head
    n=Vector(bones['Index'][0])-Vector(bones['Pinky'][0]); m=Vector(bones['Middle'][0])-wrist
    palm=n.cross(m).normalized()
    if s=='R': palm=-palm   # mirror so both curl the same way
    for fn,pts in bones.items():
        prev=hand
        for j in range(3):
            b=eb.new(f'{side}Hand{fn}{j+1}')
            b.head=inv@Vector(pts[j]); b.tail=inv@Vector(pts[j+1])
            b.parent=prev; b.use_connect=(j>0)
            b.align_roll(inv.to_3x3()@palm)
            prev=b
bpy.ops.object.mode_set(mode='OBJECT')
# weights
groups={}
for s,side in (('L','Left'),('R','Right')):
    hg=me.vertex_groups[side+'Hand']
    for fn in B[s]['bones']:
        for j in range(3): groups[f'{side}Hand{fn}{j+1}']=me.vertex_groups.new(name=f'{side}Hand{fn}{j+1}')
    W=B[s]['weights']
    for v in me.data.vertices:
        key=str(int(weld[v.index]))
        if key not in W: continue
        info=W[key]
        hw=0
        for x in v.groups:
            if x.group==hg.index: hw=x.weight
        if hw<=0: continue
        hg.add([v.index], hw*info['hand'], 'REPLACE')
        for j in range(3):
            if info['w'][j]>0: groups[f"{side}Hand{info['f']}{j+1}"].add([v.index], hw*info['w'][j], 'REPLACE')
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('suit_fingers.blend'))
# test pose: curl every finger joint about its local X
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='POSE')
for pb in arm.pose.bones:
    if 'Hand' in pb.name and pb.name[-1] in '123':
        pb.rotation_mode='QUATERNION'; pb.rotation_quaternion=Quaternion((1,0,0),math.radians(CURL*(0.6 if 'Thumb' in pb.name else 1)))
bpy.ops.object.mode_set(mode='OBJECT')
hw=arm.matrix_world@arm.data.bones['RightHand'].head_local
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=16; sc.render.resolution_x=sc.render.resolution_y=420
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.8,0.8,0.8,1)
cam=bpy.data.cameras.new('c'); cam.lens=85; co=bpy.data.objects.new('cam',cam); sc.collection.objects.link(co); sc.camera=co
c=hw+Vector((-0.04,0,-0.08))
for nm,d in (('front',(0,-1,0)),('side',(-1,-0.3,0))):
    co.location=c+Vector(d)*0.75; co.rotation_euler=(c-co.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=os.path.abspath(f'curl{int(CURL)}_{nm}.png'); bpy.ops.render.render(write_still=True)
