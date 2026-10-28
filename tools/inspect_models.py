# Blender 后台运行：列出每个模型的物体、面数、尺寸、动画
import bpy, sys, os, mathutils
root = sys.argv[sys.argv.index('--') + 1]
for name in sorted(os.listdir(root)):
    path = os.path.join(root, name, 'model.glb')
    if not os.path.exists(path): continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    imgs = [(i.name, i.size[0], i.size[1]) for i in bpy.data.images]
    print(f'##### {name}: meshes={len(meshes)} tris={tris} size={tuple(round(v,2) for v in (mx-mn))} actions={[a.name for a in bpy.data.actions]}')
    print('  images:', imgs[:12], '...' if len(imgs) > 12 else '')
    print('  objects:', sorted(o.name for o in meshes)[:80])
