import sys, json; sys.path.insert(0,'.')
from common import *
import numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath('suit_v2.glb'))
me=[o for o in bpy.data.objects if o.type=='MESH'][0]
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
mw=me.matrix_world
co=np.array([list(mw@v.co) for v in me.data.vertices])
key=np.round(co/2e-4).astype(np.int64)
_,weld=np.unique(key,axis=0,return_inverse=True); weld=weld.ravel()
edges=np.array([list(e.vertices) for e in me.data.edges])
gw={}
for side in ['Left','Right']:
    g=me.vertex_groups[side+'Hand'].index
    w=np.zeros(len(co))
    for v in me.data.vertices:
        for x in v.groups:
            if x.group==g: w[v.index]=x.weight
    gw[side]=w
np.savez('mesh.npz',co=co,weld=weld,edges=edges,wL=gw['Left'],wR=gw['Right'],
  wristL=np.array(arm.matrix_world@arm.data.bones['LeftHand'].head_local),wristR=np.array(arm.matrix_world@arm.data.bones['RightHand'].head_local),
  elbowL=np.array(arm.matrix_world@arm.data.bones['LeftForeArm'].head_local),elbowR=np.array(arm.matrix_world@arm.data.bones['RightForeArm'].head_local))
print('welded verts',weld.max()+1)
