// 宣传片录制：后台 Chrome（Metal 显卡）逐帧渲染 promo.html → 帧 + 离线音轨 → ffmpeg 加字幕合成 mp4
// 用法：python3 tools/promo/make_page.py && node tools/promo/record.mjs promo/pacific-dogfight-promo.mp4
//       PREVIEW=2,7,12 只渲染这些秒数的静帧到 /tmp/pdpromo/preview
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const outFile = path.resolve(root, process.argv[2] || 'promo/pacific-dogfight-promo.mp4');
const preview = process.env.PREVIEW ? process.env.PREVIEW.split(',').map(Number) : null;
const work = '/tmp/pdpromo';
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'frames'), { recursive: true }); fs.mkdirSync(path.join(work, 'preview'), { recursive: true });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const port = 9371;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, '--window-size=1920,1080', `--user-data-dir=${work}/profile`, 'about:blank']);
for (let k = 0; k < 40; k++) { try { await fetch(`http://127.0.0.1:${port}/json`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') console.log('EXC', m.params.exceptionDetails.exception?.description?.slice(0, 400));
  if (m.method === 'Runtime.consoleAPICalled') console.log('LOG', m.params.args.map((a) => a.value).join(' ').slice(0, 300));
  if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }))?.result?.value;
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file://' + path.join(root, 'promo.html') });
for (let i = 0; i < 400 && !(await evaluate('window.PROMO_READY === true')); i++) await new Promise((r) => setTimeout(r, 500));
const len = await evaluate('window.PROMO_LEN');
const frames = Math.round(len * 30), t0 = Date.now();
console.log('length', len, 's', frames, 'frames');
const want = preview ? new Set(preview.map((s) => Math.round(s * 30))) : null;
const last = preview ? Math.max(...want) : frames - 1;
for (let f = 0; f <= last; f++) {
  const url = await evaluate('demoStep()');
  if (!url) { console.log('EMPTY FRAME', f); chrome.kill(); process.exit(1); }
  const buf = Buffer.from(url.split(',')[1], 'base64');
  if (preview) { if (want.has(f)) fs.writeFileSync(path.join(work, 'preview', `pv_${(f / 30).toFixed(1)}.jpg`), buf); }
  else fs.writeFileSync(path.join(work, 'frames', `f${String(f).padStart(5, '0')}.jpg`), buf);
  if (f % 150 === 0) console.log(`frame ${f}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
if (preview) { console.log('preview done'); chrome.kill(); ws.close(); process.exit(0); }
const wav = await evaluate('renderAudio()', true);
fs.writeFileSync(path.join(work, 'audio.wav'), Buffer.from(wav, 'base64'));
chrome.kill();
// 字幕：片名、四句卖点、片尾（文字写文件，避免符号被 ffmpeg 误解析）
const heiti = '/System/Library/Fonts/STHeiti Medium.ttc', song = '/System/Library/Fonts/Supplemental/Songti.ttc';
const T = (name, text) => { fs.writeFileSync(path.join(work, name + '.txt'), text); return path.join(work, name + '.txt'); };
const fadeA = (a, b) => `alpha='if(lt(t,${a}),0,if(lt(t,${a + 0.5}),(t-${a})/0.5,if(lt(t,${b - 0.5}),1,if(lt(t,${b}),(${b}-t)/0.5,0))))'`;
const cap = (name, text, a, b) => `drawtext=fontfile='${heiti}':textfile=${T(name, text)}:fontcolor=white:fontsize=40:x=110:y=h-170:shadowcolor=black@0.6:shadowx=2:shadowy=2:${fadeA(a, b)}`;
const E = len;
const vf = [
  `drawtext=fontfile='${song}':textfile=${T('t1', '太 平 洋 空 战')}:fontcolor=0xF2D9A0:fontsize=110:x=(w-text_w)/2:y=h*0.36:shadowcolor=black@0.5:shadowx=3:shadowy=3:${fadeA(0.6, 4.6)}`,
  `drawtext=fontfile='${heiti}':textfile=${T('t2', 'PACIFIC  DOGFIGHT')}:fontcolor=white@0.85:fontsize=34:x=(w-text_w)/2:y=h*0.36+140:${fadeA(1.0, 4.6)}`,
  cap('c1', '11 款现代战机  ·  真实模型', 9.4, 13.6),
  cap('c2', '真实飞行物理  ·  2.25 马赫', 14.4, 17.6),
  cap('c3', '机炮  ·  追踪导弹  ·  热诱弹', 18.6, 30.4),
  cap('c4', '福特号航母  ·  弹射起飞', 35.4, 39.6),
  cap('c5', '动态天气  ·  暴风雨  ·  夜战', 40.4, 50.4),
  `drawtext=fontfile='${song}':textfile=${T('e1', '太 平 洋 空 战')}:fontcolor=0xF2D9A0:fontsize=96:x=(w-text_w)/2:y=h*0.34:shadowcolor=black@0.5:shadowx=3:shadowy=3:${fadeA(E - 4.4, E + 1)}`,
  `drawtext=fontfile='${heiti}':textfile=${T('e2', '浏览器打开即玩  ·  hejun-coderlife.github.io/pacific-dogfight')}:fontcolor=white@0.9:fontsize=34:x=(w-text_w)/2:y=h*0.34+130:${fadeA(E - 3.9, E + 1)}`,
  `drawtext=fontfile='${heiti}':textfile=${T('e3', '机模 bohmerang / outpiston / waelXcm（Sketchfab）  ·  音效 freesound / Kenney CC0')}:fontcolor=white@0.55:fontsize=20:x=(w-text_w)/2:y=h-50:${fadeA(E - 3.9, E + 1)}`,
  'fade=t=in:st=0:d=0.8', `fade=t=out:st=${E - 0.8}:d=0.8`,
].join(',');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(work, 'frames', 'f%05d.jpg'), '-i', path.join(work, 'audio.wav'),
  '-vf', vf, '-af', `afade=t=in:st=0:d=0.8,afade=t=out:st=${E - 1.2}:d=1.2`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', outFile]);
console.log('done', outFile, ((Date.now() - t0) / 1000).toFixed(0), 's');
ws.close(); process.exit(0);   // 显式退出：WebSocket 不关进程会一直挂着
