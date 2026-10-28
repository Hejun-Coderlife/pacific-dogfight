# Blender 后台：去起落架 → 统一成米、机头朝 three.js 的 +Z → 渲染检查图 → 导出 glb
# 用法: Blender -b -P process_models.py -- <models_dir> <out_dir> [机型...]
import bpy, sys, os, math, mathutils
args = sys.argv[sys.argv.index('--') + 1:]
root, out, only = args[0], args[1], args[2:]
LENGTH = {'F-22': 18.9, 'Su-57': 20.1, 'F-35': 15.7, 'F-15E': 19.4, 'F-16': 15.0, 'FA-18F': 18.3, 'F-14': 19.1,
          'MiG-29': 17.3, 'MiG-35': 17.3, 'Rafale': 15.3, 'F-117': 20.1}
os.makedirs(out, exist_ok=True)

def bounds(objs):
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    return (mathutils.Vector([min(p[i] for p in pts) for i in range(3)]), mathutils.Vector([max(p[i] for p in pts) for i in range(3)]))

for name in sorted(os.listdir(root)):
    if only and name not in only: continue
    if name not in LENGTH: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, name, 'model.glb'))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    # 全部烘焙成世界坐标下的独立网格，方便统一处理
    for o in bpy.data.objects: o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o.type != 'MESH']: bpy.data.objects.remove(o)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    def extent(o):
        a, b = bounds([o]); return (b - a).length
    main = max(meshes, key=extent)   # 机身主体 = 包围盒最大的（起落架面数可能比机身还多）
    mn, mx = bounds([main]); L = max(mx.x - mn.x, mx.y - mn.y)
    removed = []
    for o in meshes:
        if o is main: continue
        omn, omx = bounds([o]); mats = ' '.join(m.name.lower() for m in o.data.materials if m)
        gear = omn.z < mn.z - 0.03 * L                       # 伸到机腹以下的：起落架
        light = 'light' in mats and len(o.data.polygons) < 100   # 着陆灯小面片
        if gear or light: removed.append(o.name); bpy.data.objects.remove(o)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    mn, mx = bounds(meshes)
    longX = (mx.x - mn.x) >= (mx.y - mn.y)
    # 机头方向：机身长轴上，座舱（玻璃）所在的一端
    glass = [o for o in meshes if any(m and 'glass' in m.name.lower() for m in o.data.materials) and len(o.data.polygons) > 50]
    ax = 0 if longX else 1
    c = (mn + mx) / 2
    if glass:
        canopy = max(glass, key=lambda o: len(o.data.polygons))   # 座舱盖 = 面数最多的玻璃件（航行灯罩也叫 Glass）
        gmn, gmx = bounds([canopy]); noseSign = 1 if (gmn[ax] + gmx[ax]) / 2 > c[ax] else -1
    else: noseSign = 1
    s = LENGTH[name] / (mx[ax] - mn[ax])
    # 目标：Blender 中机头朝 -Y（导出 glTF 后即 three.js 的 +Z），Z 朝上，原点在包围盒中心
    yaw = {(0, 1): -math.pi / 2, (0, -1): math.pi / 2, (1, 1): math.pi, (1, -1): 0}[(ax, noseSign)]
    M = mathutils.Matrix.Rotation(yaw, 4, 'Z') @ mathutils.Matrix.Scale(s, 4) @ mathutils.Matrix.Translation(-c)
    for o in meshes: o.data.transform(M); o.matrix_world = mathutils.Matrix.Identity(4); o.data.update()
    bpy.context.view_layer.update()
    # 按俯视检查图人工核对过的修正角：让机头最终朝 -Y
    FIX = {'F-14': 90, 'F-117': 0}.get(name, 180)
    R = mathutils.Matrix.Rotation(math.radians(FIX), 4, 'Z')
    for o in meshes: o.data.transform(R); o.data.update()
    bpy.context.view_layer.update()
    mn, mx = bounds(meshes); k = LENGTH[name] / (mx.y - mn.y); c = (mn + mx) / 2
    S = mathutils.Matrix.Scale(k, 4) @ mathutils.Matrix.Translation(-c)
    for o in meshes: o.data.transform(S); o.data.update()
    bpy.context.view_layer.update()
    tris = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)
    # 太重的模型减面
    if tris > 90000:
        for o in meshes:
            if len(o.data.polygons) > 2000:
                d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = 90000 / tris
                bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='dec')
    # 贴图上限 2048，过大的缩小
    for img in bpy.data.images:
        if img.size[0] > 2048 or img.size[1] > 2048:
            k = 2048 / max(img.size); img.scale(int(img.size[0] * k), int(img.size[1] * k))
    bpy.context.view_layer.update()
    tris2 = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
    nb, xb = bounds([o for o in bpy.data.objects if o.type == 'MESH'])
    print(f'@@ {name}: removed={removed} tris {tris}->{tris2} size={[round(v, 2) for v in (xb - nb)]}')

    # 检查图：斜下方 + 侧上方
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'; scn.display.shading.light = 'STUDIO'; scn.display.shading.color_type = 'TEXTURE'
    scn.render.resolution_x, scn.render.resolution_y = 800, 450
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam); scn.camera = cam
    cam.data.lens = 50
    for tag, pos in [('below', (-20, -24, -13)), ('above', (24, -18, 13)), ('top', (0, 0.01, 40))]:
        cam.location = pos
        d = -mathutils.Vector(pos); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = os.path.join(out, f'check_{name}_{tag}.png'); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{name}.glb'), export_format='GLB', export_yup=True,
                              export_image_format='JPEG', export_jpeg_quality=88, export_apply=True)
