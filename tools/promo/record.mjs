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
// 文字卡：用网页排版（Avenir Next 细体、宽字距）截成透明 PNG，再叠到视频上
const cards = [['title', 0.6, 4.8], ['0', 9.4, 13.6], ['1', 14.3, 17.7], ['2', 18.6, 24.6], ['3', 25.4, 28.6], ['4', 29.4, 34.6], ['5', 39.4, 43.6], ['6', 44.4, 54.4], ['end', 55.6, len + 1]];
const chrome2 = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port + 1}`, '--window-size=1920,1080', `--user-data-dir=${work}/profile2`, 'about:blank']);
for (let k = 0; k < 40; k++) { try { await fetch(`http://127.0.0.1:${port + 1}/json`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
const ws2 = new WebSocket((await (await fetch(`http://127.0.0.1:${port + 1}/json`)).json()).find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws2.onopen = r));
let id2 = 0; const pend2 = {};
ws2.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend2[m.id]) { pend2[m.id](m.result); delete pend2[m.id]; } };
const send2 = (method, params = {}) => new Promise((r) => { const i = ++id2; pend2[i] = r; ws2.send(JSON.stringify({ id: i, method, params })); });
await send2('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send2('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [k] of cards) {
  await send2('Page.navigate', { url: 'file://' + path.join(root, 'tools/promo/cards.html') + '?k=' + k });
  for (let i = 0; i < 40; i++) {   // 等这一张真的排好（标题里带上卡名）
    const r = await send2('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    if (r?.result?.value === 'ready:' + k) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  await new Promise((r) => setTimeout(r, 300));
  const shot = await send2('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(work, `card_${k}.png`), Buffer.from(shot.data, 'base64'));
}
ws2.close(); chrome2.kill();
const E = len, inputs = ['-framerate', '30', '-i', path.join(work, 'frames', 'f%05d.jpg'), '-i', path.join(work, 'audio.wav')];
let fc = '', lastV = '0:v';
cards.forEach(([k, a, b], i) => {
  inputs.push('-loop', '1', '-framerate', '30', '-t', String(E), '-i', path.join(work, `card_${k}.png`));
  fc += `[${i + 2}:v]format=rgba,fade=t=in:st=${a}:d=0.7:alpha=1,fade=t=out:st=${Math.min(b, E) - 0.7}:d=0.7:alpha=1[c${i}];[${lastV}][c${i}]overlay=0:0:shortest=1[v${i}];`;
  lastV = `v${i}`;
});
fc += `[${lastV}]fade=t=in:st=0:d=0.8,fade=t=out:st=${E - 0.8}:d=0.8,format=yuv420p[vout]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', fc, '-map', '[vout]', '-map', '1:a',
  '-af', `afade=t=in:st=0:d=0.8,afade=t=out:st=${E - 1.2}:d=1.2`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(E), outFile]);
console.log('done', outFile, ((Date.now() - t0) / 1000).toFixed(0), 's');
ws.close(); process.exit(0);   // 显式退出：WebSocket 不关进程会一直挂着
