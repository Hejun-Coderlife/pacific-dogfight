# 列出每个模型各物体的材质、面数、包围盒（单位按模型原值），用来找起落架/座舱/飞行员
import bpy, sys, os, mathutils
root, only = sys.argv[sys.argv.index('--') + 1], sys.argv[sys.argv.index('--') + 2:]
for name in sorted(os.listdir(root)):
    if only and name not in only: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, name, 'model.glb'))
    print(f'##### {name}')
    for o in sorted([o for o in bpy.data.objects if o.type == 'MESH'], key=lambda o: o.name):
        pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
        mn = [min(p[i] for p in pts) for i in range(3)]; mx = [max(p[i] for p in pts) for i in range(3)]
        mats = [m.name for m in o.data.materials]
        print(f'  {o.name:12s} tris={sum(len(p.vertices)-2 for p in o.data.polygons):6d} mats={mats} min={[round(v,1) for v in mn]} max={[round(v,1) for v in mx]}')
