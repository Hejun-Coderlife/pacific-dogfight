# Blender 后台：对处理后的航母 glb 做竖直射线采样，得到甲板高度图（游戏坐标：x_t=-x_b, z_t=y_b, y_t=z_b）
import bpy, sys, json, mathutils
src, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
dg = bpy.context.evaluated_depsgraph_get()
STEP, X0, X1, Z0, Z1 = 4, -48, 48, -172, 172
rows = []
for zt in range(Z0, Z1 + 1, STEP):
    row = []
    for xt in range(X0, X1 + 1, STEP):
        ok, loc, *_ = bpy.context.scene.ray_cast(dg, mathutils.Vector((-xt, zt, 200)), mathutils.Vector((0, 0, -1)))
        row.append(round(loc.z, 2) if ok else None)
    rows.append(row)
json.dump({'step': STEP, 'x0': X0, 'z0': Z0, 'nx': len(rows[0]), 'nz': len(rows), 'h': rows}, open(out, 'w'))
flat = [v for r in rows for v in r if v is not None]
import statistics
print('@@ samples', len(flat), 'median', statistics.median(flat), 'max', max(flat), 'min', min(flat))
