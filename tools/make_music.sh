#!/bin/bash
# 开始界面音乐 + 切换飞机音效 → assets/music.js（base64，双击打开 file:// 也能用）
#   菜单音乐：source/music/epic_main_menu_cleytonkauffman.wav（Cleyton Kauffman「Epic Main Menu Theme ~ Loop」，OpenGameArt，CC0，34.9 秒无缝循环）
#   切换飞机：source/sfx/flyby.mp3 最响的那 2.8 秒（战机呼啸掠过）
set -e
cd "$(dirname "$0")/.."
O=build/music; mkdir -p $O
ffmpeg -loglevel error -y -i source/music/epic_main_menu_cleytonkauffman.wav -af "volume=-3dB" -ac 2 -ar 44100 -b:a 160k $O/menu.mp3
ffmpeg -loglevel error -y -i source/sfx/flyby.mp3 -af "atrim=3.0:5.8,asetpts=PTS-STARTPTS,afade=t=in:d=0.35,afade=t=out:st=2.0:d=0.8,loudnorm=I=-14" -ac 1 -ar 44100 -b:a 96k $O/switch.mp3
python3 - <<'PY'
import base64, json, os
d = {k: base64.b64encode(open(f'build/music/{k}.mp3', 'rb').read()).decode() for k in ['menu', 'switch']}
open('assets/music.js', 'w').write('window.MUSICDATA = ' + json.dumps(d) + ';\n')
print('assets/music.js', round(os.path.getsize('assets/music.js') / 1e6, 2), 'MB')
PY
