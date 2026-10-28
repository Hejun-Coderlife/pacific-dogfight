# index.html + director.js → promo.html（放项目根目录，素材相对路径照常可用；已 gitignore）
import os
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s = open(os.path.join(root, 'index.html')).read()
d = open(os.path.join(root, 'tools/promo/director.js')).read()
assert '/*SELFTEST*/' in s
open(os.path.join(root, 'promo.html'), 'w').write(s.replace('/*SELFTEST*/', d))
print('promo.html ok')
