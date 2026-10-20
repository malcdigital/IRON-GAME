import bpy, bmesh, math, os
from mathutils import Vector
def load():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath='/tmp/claude-0/-home-user/22622915-d2d5-50f9-85be-8241b9335a7e/scratchpad/model/suit.glb')
    for o in list(bpy.data.objects):
        if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
    me = [o for o in bpy.data.objects if o.type=='MESH'][0]
    arm = [o for o in bpy.data.objects if o.type=='ARMATURE'][0]
    return me, arm
def islands(me):
    bm = bmesh.new(); bm.from_mesh(me.data); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    seen=set(); out=[]
    for f in bm.faces:
        if f.index in seen: continue
        st=[f]; comp=[]; seen.add(f.index)
        while st:
            a=st.pop(); comp.append(a.index)
            for e in a.edges:
                for b in e.link_faces:
                    if b.index not in seen: seen.add(b.index); st.append(b)
        out.append(comp)
    cents=[]
    mw=me.matrix_world
    for comp in out:
        c=Vector(); n=0
        for fi in comp:
            for v in bm.faces[fi].verts: c+=mw@v.co; n+=1
        cents.append(c/n)
    return bm, out, cents
def render(path, views, res=(420,560)):
    sc=bpy.context.scene
    sc.render.engine='CYCLES'; sc.cycles.samples=12; sc.cycles.device='CPU'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent=False
    w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.85,0.82,0.76,1); w.node_tree.nodes['Background'].inputs[1].default_value=1.2
    if 'Sun' not in bpy.data.objects:
        l=bpy.data.lights.new('Sun','SUN'); l.energy=3; lo=bpy.data.objects.new('Sun',l); sc.collection.objects.link(lo); lo.rotation_euler=(0.8,0.2,0.6)
    cam=bpy.data.cameras.new('c'); cam.lens=50; co=bpy.data.objects.new('cam',cam); sc.collection.objects.link(co); sc.camera=co
    target=Vector((0,0,0.95))
    for name,(az,el,dist) in views.items():
        d=Vector((math.sin(az)*math.cos(el), -math.cos(az)*math.cos(el), math.sin(el)))*dist
        co.location=target+d
        co.rotation_euler=(target-co.location).to_track_quat('-Z','Y').to_euler()
        import os; sc.render.filepath=os.path.abspath(f'{path}_{name}.png')
        bpy.ops.render.render(write_still=True)
