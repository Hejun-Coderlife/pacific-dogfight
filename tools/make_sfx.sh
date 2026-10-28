#!/bin/bash
# source/sfx（freesound CC0 + Kenney CC0）→ build/sfx/*.mp3（剪辑/无缝循环/响度统一）→ assets/sfx.js（base64）
set -e
cd "$(dirname "$0")/.."
S=source/sfx; O=build/sfx; mkdir -p $O
enc() { ffmpeg -loglevel error -y "$@" -ac 1 -ar 44100 -b:a 96k; }
# 无缝循环：取 [t0, t0+L+X]，尾部 X 秒交叉淡化进开头
loop() { local in=$1 t0=$2 L=$3 X=$4 out=$5 gain=${6:-0}
  enc -i "$in" -filter_complex "[0]atrim=$t0:$(echo "$t0+$L+$X"|bc),asetpts=PTS-STARTPTS,volume=${gain}dB,asplit=3[a][b][c];\
[a]atrim=0:$X,asetpts=PTS-STARTPTS,afade=t=in:d=$X[head];[b]atrim=$L:$(echo "$L+$X"|bc),asetpts=PTS-STARTPTS,afade=t=out:d=$X[tail];\
[c]atrim=$X:$L,asetpts=PTS-STARTPTS[body];[tail][head]amix=inputs=2:normalize=0[mix];[mix][body]concat=n=2:v=0:a=1" $O/$out.mp3; }
clip() { local in=$1 t0=$2 d=$3 out=$4 gain=${5:-0} fo=${6:-0.3}
  enc -i "$in" -af "atrim=$t0:$(echo "0$t0+$d"|bc|sed "s#^\.#0.#"),asetpts=PTS-STARTPTS,volume=${gain}dB,afade=t=out:st=$(echo "$d-$fo"|bc|sed "s#^\.#0.#"):d=$fo" $O/$out.mp3; }
loop $S/afterburner1.mp3 1.0 4.0 0.6 engine 6
loop $S/afterburner1.mp3 16.0 4.0 0.6 afterburner 0
loop $S/cannon_ciws.mp3 0.2 1.2 0.15 cannon -6
loop $S/missile_warning.mp3 0 1.8 0.1 warning 6
loop $S/rain_thunder.mp3 2 12 1.5 rain 12
clip $S/boom_distant.mp3 0 6 boom_far 0 2
clip $S/boom_low.ogg 0 2 boom_low 4 0.5
clip $S/boom_crunch.ogg 0 0.75 boom_near 0 0.2
clip $S/missile_launch.mp3 0 2.9 missile 6 0.8
clip $S/lock_tone.mp3 0 5 lock 4 0.1
clip $S/thunder.mp3 0.8 10 thunder 4 3
clip $S/flyby.mp3 0 8 flyby 0 1.5
python3 - <<'PY'
import base64, glob, os, json
d = {os.path.basename(f)[:-4]: base64.b64encode(open(f, 'rb').read()).decode() for f in sorted(glob.glob('build/sfx/*.mp3'))}
open('assets/sfx.js', 'w').write('window.SFXDATA = ' + json.dumps(d) + ';\n')
print({k: round(len(v) * 3 / 4 / 1024) for k, v in d.items()}, 'KB; total', round(os.path.getsize('assets/sfx.js') / 1e6, 2), 'MB')
PY
