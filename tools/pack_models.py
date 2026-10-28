# build/models/*.glb → assets/models/<机型>.js（base64 挂到 window.JETDATA，双击 file:// 也能加载）
import base64, glob, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for f in sorted(glob.glob(os.path.join(root, 'build/models/*.glb'))):
    name = os.path.basename(f)[:-4]
    b64 = base64.b64encode(open(f, 'rb').read()).decode()
    out = os.path.join(root, 'assets/models', name + '.js')
    open(out, 'w').write(f'(window.JETDATA = window.JETDATA || {{}})["{name}"] = "{b64}";\n')
    print(name, round(os.path.getsize(out) / 1e6, 1), 'MB')
