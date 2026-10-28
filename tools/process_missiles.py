# Blender 后台：从 bohmerang 导弹合集里抽出 AIM-9 和 R-77，单独居中、按真实长度缩放、弹头朝 -Y（与战机一致，游戏里再转 180°）
import bpy, sys, os, math, mathutils
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
WANT = {'AIM-9': ('AIM-9_Sidewinder', 3.0), 'R-77': ('R-77', 3.6)}
FLIP = {k: v for k, v in (a.split('=') for a in sys.argv[sys.argv.index('--') + 3:])}   # 例：AIM-9=180
for name, (mat, length) in WANT.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    for o in bpy.data.objects: o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or not any(m and m.name == mat for m in o.data.materials): bpy.data.objects.remove(o)
    o = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    pts = [mathutils.Vector(v.co) for v in o.data.vertices]
    mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    ext = mx - mn; ax = max(range(3), key=lambda i: ext[i]); c = (mn + mx) / 2
    # 长轴转到 Y
    R = mathutils.Matrix.Identity(4)
    if ax == 0: R = mathutils.Matrix.Rotation(math.pi / 2, 4, 'Z')
    elif ax == 2: R = mathutils.Matrix.Rotation(math.pi / 2, 4, 'X')
    M = mathutils.Matrix.Rotation(math.radians(float(FLIP.get(name, 0))), 4, 'Z') @ R @ mathutils.Matrix.Scale(length / ext[ax], 4) @ mathutils.Matrix.Translation(-c)
    o.data.transform(M); o.matrix_world = mathutils.Matrix.Identity(4); o.data.update()
    # 判断弹头方向：哪一端截面更细（弹头尖、尾部有翼）——打印两端 10% 内顶点的横向半径
    ys = [v.co.y for v in o.data.vertices]; y0, y1 = min(ys), max(ys); L = y1 - y0
    def rad(lo, hi): r = [math.hypot(v.co.x, v.co.z) for v in o.data.vertices if lo <= v.co.y <= hi]; return max(r) if r else 0
    print(f'@@ {name}: len={L:.2f} r(-Y端)={rad(y0, y0 + 0.1 * L):.3f} r(+Y端)={rad(y1 - 0.1 * L, y1):.3f}')
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{name}.glb'), export_format='GLB', export_yup=True, export_image_format='JPEG', export_apply=True)
