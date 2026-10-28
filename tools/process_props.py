# Blender 后台：航母 / 轰炸机 → 去起落架、按真实尺寸缩放、机头(舰首)朝 three.js 的 +Z → glb + 俯视检查图
import bpy, sys, os, math, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
root, out = args[0], args[1]
# 名称: (真实尺寸 m, 按哪条轴量: 'long' 最长边 / 'span' 横向, 修正偏航角°)
PROPS = {'CVN-78': (337, 'long', float(args[2]) if len(args) > 2 else 0), 'B-2': (52.4, 'long', float(args[3]) if len(args) > 3 else 0)}
def bounds(objs):
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    return (mathutils.Vector([min(p[i] for p in pts) for i in range(3)]), mathutils.Vector([max(p[i] for p in pts) for i in range(3)]))
for name, (size, axis, fix) in PROPS.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, name, 'model.glb'))
    for o in bpy.data.objects: o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    for o in [o for o in bpy.data.objects if any(m and m.name.startswith('LG-') for m in o.data.materials)]: bpy.data.objects.remove(o)   # B-2 起落架
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    mn, mx = bounds(meshes); ext = mx - mn
    k = size / max(ext.x, ext.y); c = (mn + mx) / 2
    # 长轴转到 Y，再按人工核对的角度修正，原点在包围盒中心（航母放在吃水线附近：底部下沉 1/3）
    yaw = (math.pi / 2 if ext.x > ext.y else 0) + math.radians(fix)
    M = mathutils.Matrix.Rotation(yaw, 4, 'Z') @ mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(-c)
    for o in meshes: o.data.transform(M); o.matrix_world = mathutils.Matrix.Identity(4); o.data.update()
    bpy.context.view_layer.update()
    nb, xb = bounds(meshes)
    print(f'@@ {name}: tris={sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)} size={[round(v, 1) for v in (xb - nb)]} zmin={nb.z:.1f} zmax={xb.z:.1f}')
    for img in bpy.data.images:
        if img.size[0] > 2048: img.scale(2048, int(img.size[1] * 2048 / img.size[0]))
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.color_type = 'TEXTURE'
    scn.render.resolution_x, scn.render.resolution_y = 600, 600
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam); scn.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.1
    cam.location = (0, 0.01, 500); cam.rotation_euler = mathutils.Vector((0, -0.01, -500)).to_track_quat('-Z', 'Y').to_euler()
    scn.render.filepath = os.path.join(out, f'check_{name}_top.png'); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{name}.glb'), export_format='GLB', export_yup=True,
                              export_image_format='JPEG', export_jpeg_quality=85, export_apply=True)
