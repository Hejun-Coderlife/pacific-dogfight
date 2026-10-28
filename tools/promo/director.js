// ===== 宣传片导演剧本：注入到 index.html 的 /*SELFTEST*/ 位置（在 boot() 里、模型加载完之后执行） =====
{
  const FPS = 30, DT = 1 / FPS;
  renderer.setAnimationLoop(null);   // 不要游戏主循环，逐帧由录制脚本驱动
  for (const id of ['hud', 'ui', 'start', 'credit', 'gfx', 'result']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const L = document.getElementById('loading'); if (L) L.remove();
  renderer.setPixelRatio(1); renderer.setSize(1920, 1080); composer.setSize(1920, 1080); bloom.setSize(960, 540);
  camera.aspect = 1920 / 1080; camera.fov = 45; camera.near = 1; camera.updateProjectionMatrix();
  await Promise.all(['Su-57', 'MiG-29', 'FA-18F', 'F-16', 'F-14', 'F-35'].map(loadJet)); populateDeck();

  // ---- 音频事件（离线合成用）----
  const EV = [];
  let videoT = 0;
  const camAt = () => camera.position.clone();
  const ev = (k, gain = 1, p = null, rate = 1) => EV.push({ t: videoT, k, gain, p: p ? p.clone() : null, c: camAt(), rate });
  sfxBoom = (p, k) => ev(p.distanceTo(camera.position) < 700 ? 'boom_near' : 'boom_far', k, p);
  sfxLaunch = () => ev('missile', 1, missiles.length ? missiles[missiles.length - 1].pos : null);
  sfxHit = () => {}; sfxHurt = () => {}; sfxFlare = () => ev('boom_near', 0.15); sfxTouchdown = () => {}; sfxGun = () => {};
  showMsg = () => {}; showWarn = () => {}; hitMark = () => {};
  const beds = [];   // 每个镜头的环境声：{t0, t1, engine, ab, rain, cannon:[[t0,t1]]}

  // ---- 场景工具 ----
  const keep = new Set();
  function clearAll() {
    camera.near = 1; camera.updateProjectionMatrix();
    for (let i = aircraft.length - 1; i >= 0; i--) { const a = aircraft[i]; scene.remove(a.mesh); if (a !== player) aircraft.splice(i, 1); }
    for (const m of missiles) scene.remove(m.mesh);
    missiles.length = 0; flares.length = 0; for (const b of bullets) b.life = 0;
    for (const d of debris) scene.remove(d.obj); debris.length = 0;
    smokeFx.clear(); glowFx.clear();   // 上个镜头的烟和火光不能留到下个镜头
    M.bomber = null;
  }
  function mk(type, isPlayer = false) {
    const ac = isPlayer ? player : new Aircraft(false);
    ac.reset(V3().set(0, 3000, 0), V3().set(0, 0, 1), 250, type);
    ac.scripted = true; ac.prey = null; ac.firing = false;
    if (!isPlayer) aircraft.push(ac); else if (!aircraft.includes(player)) aircraft.push(player);
    if (isPlayer) scene.add(ac.mesh);
    return ac;
  }
  // 按轨迹函数摆飞机：速度/加速度用中心差分，坡度 = 升力方向（侧向加速度 + 重力）
  const _x = V3(), _y = V3(), _z = V3(), _m4 = new THREE.Matrix4();
  function fly(ac, fn, t, thr = 0.85) {
    const h = 0.05, p0 = fn(t - h), p1 = fn(t), p2 = fn(t + h);
    const v = p2.clone().sub(p0).divideScalar(2 * h), a = p2.clone().add(p0).sub(p1.clone().multiplyScalar(2)).divideScalar(h * h);
    if (v.lengthSq() < 0.01) v.set(0, 0, 0.1).applyQuaternion(ac.st.q);   // 静止时保持原朝向
    _z.copy(v).normalize();
    const lift = a.clone().addScaledVector(UP, 9.81); lift.addScaledVector(_z, -lift.dot(_z));
    _y.copy(lift).normalize(); _x.crossVectors(_y, _z).normalize(); _y.crossVectors(_z, _x);
    _m4.makeBasis(_x, _y, _z); ac.st.q.setFromRotationMatrix(_m4);
    ac.st.pos.copy(p1); ac.st.vel.copy(v); ac.st.V = v.length(); ac.st.g = lift.length() / 9.81; ac.st.thr = thr;
    ac.accEst.copy(a);
  }
  function look(from, at) { camera.position.copy(from); camera.lookAt(at); }
  // 机位按世界坐标摆（不跟着机身倾斜）：back 后方距离，up 上方，side 右侧（+右 -左）
  function chase(ac, back, up, side) {
    const f = ac.st.vel.clone().setY(0).normalize(), r = V3().crossVectors(f, UP).normalize();
    return ac.st.pos.clone().addScaledVector(f, -back).addScaledVector(UP, up).addScaledVector(r, side);
  }
  WEATHER.night.exp = 0.75;   // 宣传片里夜色压暗一点
  function fov(f) { if (camera.fov !== f) { camera.fov = f; camera.updateProjectionMatrix(); } }
  const lerpV = (a, b, k) => a.clone().lerp(b, k);
  const ease = (k) => k * k * (3 - 2 * k);

  // 公共的世界推进：脚本飞机由 fly() 摆位，其余（被击落的残骸）走正常物理
  function world(dt) {
    gameTime += dt;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n; i++) for (const ac of aircraft) if (ac.alive && !ac.scripted) physicsStep(ac, dt / n);
    for (const ac of aircraft) {
      if (!ac.alive) continue;
      ac.mesh.position.copy(ac.st.pos); ac.mesh.quaternion.copy(ac.st.q); ac.mesh.updateMatrixWorld();
      fireGuns(ac, dt); aircraftFx(ac, dt);
    }
    updateBullets(dt); updateDebris(dt); updateMissiles(dt); updateFlares(dt);
    flash.intensity *= Math.exp(-dt * 9);
  }
  function render(dt) {
    smokeFx.flush(); glowFx.flush();
    water.position.x = camera.position.x; water.position.z = camera.position.z;
    cloudMat.uniforms.uCam.value.copy(camera.position); sky.position.copy(camera.position);
    tickIslands(camera.position); tickIslands(camera.position); tickIslands(camera.position); tickIslands(camera.position);
    aimShadow(player.st.pos);
    updateWeather(dt);
    water.material.uniforms.time.value += dt * 0.8;
    updateGodRays();
    composer.render();
  }
  const killed = (ac) => { ac.scripted = false; ac.lastAttacker = player; };

  // ---- 镜头表 ----
  const ISL = HOME_ISLANDS[0];   // (700, 4700) r1600 的大火山岛
  const S = [];
  const shot = (dur, setup, update) => S.push({ dur, setup, update });

  // 1 黄昏海面，贴水飞向逆光火山岛（片名）
  shot(5, () => { clearAll(); applyWeather('clear'); updateIslands(V3().set(1500, 0, 0), true); fov(42); beds.push({ k: 'calm' }); }, (t) => {
    const k = t / 5;
    look(V3().set(1300 - 120 * k, 9 + 22 * ease(k), -1800 + 380 * t), V3().set(ISL.x, 260, ISL.z));
  });
  // 2 F-22 超低空开加力掠过镜头
  let A, B, C2;
  shot(4, () => { clearAll(); A = mk('F-22', true); fov(40); }, (t) => {
    const path = (u) => V3().set(1440 + 12 * u, 22 + 1.5 * u, -700 + 340 * u);
    fly(A, path, t, 1);
    const cam = V3().set(1478, 6, 0);
    look(cam, lerpV(A.st.pos, A.st.pos.clone().addScaledVector(A.st.vel, 0.25), 0.5));
    if (Math.abs(t - 2.05) < DT / 2) ev('flyby', 1.2, A.st.pos);
  });
  // 3 侧面跟拍：F-22 在群岛上空缓转
  shot(5, () => { clearAll(); applyWeather('dusk'); A = mk('F-22', true); fov(38); }, (t) => {
    const R = 5200, w = 230 / R, c = V3().set(ISL.x - R + 900, 0, ISL.z - 600);
    const path = (u) => V3().set(c.x + R * Math.cos(w * u + 0.2), 1150 + 25 * Math.sin(u * 0.25), c.z + R * Math.sin(w * u + 0.2));
    fly(A, path, t, 0.8);
    const k = ease(t / 5);
    look(chase(A, THREE.MathUtils.lerp(30, -12, k), 7 + 4 * k, -42), A.st.pos.clone().addScaledVector(A.st.vel, 0.02));
  });
  // 4 敌机 Su-57 大坡度转弯掠过镜头，翼尖拉出水汽
  shot(4, () => { clearAll(); B = mk('Su-57'); fov(36); }, (t) => {
    const c = V3().set(-3000, 1400, 2500), R = 650;
    const path = (u) => V3().set(c.x + R * Math.cos(-1.2 + u * 0.42), c.y - 30 * u, c.z + R * Math.sin(-1.2 + u * 0.42));
    fly(B, path, t, 1);
    const cam = path(2.2).add(V3().set(0, 0, 0)).addScaledVector(path(2.2).sub(c).normalize(), 70).add(V3().set(0, 18, 0));
    look(cam, B.st.pos);
    if (Math.abs(t - 1.9) < DT / 2) ev('flyby', 1.0, B.st.pos, 1.05);
  });
  // 5 咬尾机炮：曳光弹命中、起火、空中解体
  shot(7, () => {
    clearAll(); A = mk('F-22', true); B = mk('Su-57'); fov(44);
    beds.push({ k: 'fight' });
  }, (t) => {
    const R = 3200, w = 245 / R, c = V3().set(-6000, 1800, -2000);
    const pathB = (u) => V3().set(c.x + R * Math.cos(w * u), c.y + 60 * Math.sin(u * 0.18), c.z + R * Math.sin(w * u));
    const pathA = (u) => pathB(u - 1.25).add(V3().set(0, -8, 0));
    if (B.scripted) fly(B, pathB, t, 1);
    fly(A, (u) => pathA(u), t, 1);
    // 让 F-22 的炮线指向提前量点（瞄准辅助接管弹道）
    leadAim.ok = B.alive && !B.doomed; leadAim.target = B; leadAim.dist = A.st.pos.distanceTo(B.st.pos);
    A.firing = (t > 1.2 && t < 2.6) || (t > 3.4 && t < 5.2);
    if (t > 3.6 && !B.onFire) B.onFire = true;
    if (t > 5.4 && !B.exploded) { killed(B); B.hp.fuse = 0; explodeAir(B); }
    look(chase(A, 32, 9, 7), lerpV(A.st.pos, B.st.pos, 0.3));
  });
  // 5b 座舱视角：从驾驶员眼睛看出去，仪表板 + HUD 框，前方敌机在群岛上空转弯
  shot(4, () => { clearAll(); A = mk('F-22', true); B = mk('Su-57'); fov(66); camera.near = 0.1; camera.updateProjectionMatrix(); }, (t) => {
    // 背着太阳朝 +X 平飞、轻微蛇行（坡度约 5°），岛在右前方
    const pathB = (u) => V3().set(ISL.x - 1500 + 240 * u, 900 + 3 * Math.sin(u * 0.25), ISL.z + 250 + 15 * Math.sin(u * 0.25));
    fly(B, pathB, t, 1); fly(A, (u) => pathB(u - 0.75).add(V3().set(0, 10, 0)), t, 0.95);
    A.mesh.position.copy(A.st.pos); A.mesh.quaternion.copy(A.st.q); A.mesh.updateMatrixWorld(true);
    camera.position.copy(A.mesh.localToWorld(eyePos('F-22').clone()));
    camera.quaternion.copy(A.st.q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI)); setCanopyHidden(A, true);
    leadAim.ok = true; leadAim.target = B; leadAim.dist = A.st.pos.distanceTo(B.st.pos);
    A.firing = t > 2.4 && t < 3.4;
  });
  // 6 导弹视角：发射 → 敌机放诱饵 → 命中慢镜头
  let MS = null, slow = 1;
  shot(6, () => {
    clearAll(); applyWeather('clear'); A = mk('F-22', true); B = mk('MiG-29'); fov(50); MS = null; slow = 1;
  }, (t) => {
    const sim = t;
    const pathB = (u) => V3().set(4000 + 250 * u, 2100 + 40 * Math.sin(u * 0.2), -9000 + 60 * u + 20 * u * u);
    const pathA = (u) => V3().set(4000 + 250 * u - 2600, 2050, -9000 + 60 * u - 300);
    if (B.scripted) fly(B, pathB, sim, 1);
    fly(A, pathA, sim, 1);
    if (t > 0.5 && !MS) { lock.target = B; lock.t = 1; launchMissile(player, B); MS = missiles[missiles.length - 1]; }
    if (t > 2.0 && B.flares === 30) { dropFlares(B); if (MS) MS.target = B; }
    if (MS && !missiles.includes(MS)) MS = null;
    if (MS) {
      const d = MS.pos.distanceTo(B.st.pos);
      slow = d < 350 ? 0.25 : 1;
      // 侧面跟拍：导弹侧影、尾焰和身后拖出的烟迹都在画面里
      const mv = MS.vel.clone().normalize(), side = V3().crossVectors(mv, UP).normalize();
      look(MS.pos.clone().addScaledVector(side, 9).addScaledVector(UP, 1.8).addScaledVector(mv, -3), MS.pos.clone().addScaledVector(mv, 7));
    } else if (t <= 0.5) {
      const f = V3().set(0, 0, 1).applyQuaternion(A.st.q);
      look(A.st.pos.clone().addScaledVector(f, -22).addScaledVector(UP, 5), A.st.pos.clone().addScaledVector(f, 60));
    } else {
      look(camera.position.clone(), B.st.pos);
      if (B.alive && !B.doomed && t > 1) { killed(B); }
    }
    if (MS === null && t > 1 && !B.exploded) { killed(B); B.hp.fuse = 0; explodeAir(B); }
  });
  // 7 燃烧残骸坠海
  shot(4, () => {
    clearAll(); B = mk('MiG-29'); fov(40);
    B.onFire = true; B.lost.wingL = true; B.engineDead = true; B.hp.wingL = 0;
  }, (t) => {
    const p0 = V3().set(2600, 260, 6200), dir = V3().set(0.3, -0.55, 1).normalize();
    const path = (u) => p0.clone().addScaledVector(dir, 210 * u).add(V3().set(Math.sin(u * 5) * 6, 0, 0));
    if (B.alive) {
      fly(B, path, t, 0);
      B.st.q.multiply(new THREE.Quaternion().setFromAxisAngle(V3().set(0, 0, 1), t * 2.2));   // 断翼后打转
      if (B.st.pos.y < 2) { B.scripted = false; hitGround(B); }
    }
    look(V3().set(2700 + 330, 24, 6200 + 340), path(Math.min(t, 1.5)).lerp(V3().set(2600 + 110, 0, 6600), ease(Math.min(1, t / 2.2))));
  });
  // 8 航母弹射起飞
  shot(5, () => {
    clearAll(); playerType = 'FA-18F'; A = mk('FA-18F', true); fov(46);
    beds.push({ k: 'deck' });
  }, (t) => {
    const fwd = CARRIER_FWD();
    const sAt = (u) => { const s = u < 1 ? 0 : Math.min(2.6, u - 1); return 4 * s * s * 0.5 * 34 / 4 + (u > 3.6 ? (u - 3.6) * 92 : 0); };   // 1 秒后弹射，2.6 秒加速到约 90 m/s
    const path = (u) => { const s = sAt(u); const p = carrierWorld(4, 30 + s, DECK_Y() + 2.0 + (u > 3.6 ? (u - 3.6) ** 2 * 6 : 0), V3()); return p; };
    fly(A, path, Math.max(t, 0.06), t > 1 ? 1 : 0.6);
    if (t < 1.05) { A.st.q.setFromUnitVectors(V3().set(0, 0, 1), fwd); }
    setGear(A, t < 4.2);
    if (Math.abs(t - 1.0) < DT / 2) ev('missile', 0.6, A.st.pos, 0.5);
    look(carrierWorld(-16, 98, DECK_Y() + 3, V3()), A.st.pos.clone().addScaledVector(fwd, 6));
  });
  // 9 暴风雨：贴着海面仰拍，F-22 冲向地平线上那座巨大的积雨云，闪电劈下
  const BOLTS = [[0.9, 9000, 7000], [2.7, 7600, 2300], [4.5, 10500, 9000]];   // 近处一道要吓人
  shot(6, () => { clearAll(); applyWeather('storm'); A = mk('F-22', true); fov(52); nextBolt = 99; }, (t) => {
    const dir = V3().set(0.62, 0, 0.79).normalize(), side = V3().crossVectors(dir, UP).normalize();
    const base = V3().set(-9000, 0, 3000);
    const path = (u) => base.clone().addScaledVector(dir, 250 * u).addScaledVector(side, 20 * Math.sin(u * 0.6)).add(V3().set(0, 330 + 15 * Math.sin(u * 0.3), 0));
    fly(A, path, t, 0.95);
    A.st.q.multiply(new THREE.Quaternion().setFromAxisAngle(V3().set(0, 0, 1), 0.03 * Math.sin(t * 7)));   // 乱流颠簸
    nextBolt = 99;
    for (const [bt, fwd, lat] of BOLTS) if (Math.abs(t - bt) < DT / 2) {
      const cp = camera.position; triggerLightning(V3().set(cp.x + dir.x * lat + side.x * (fwd - 9000) * 0.3, 0, cp.z + dir.z * lat + side.z * (fwd - 9000) * 0.3));
      ev('thunder', fwd < 5000 ? 1.4 : 0.9, null); ev('boom_low', fwd < 5000 ? 1.2 : 0.6, null, 0.6);
    }
    look(A.st.pos.clone().addScaledVector(dir, -48 + 3 * t).addScaledVector(side, -16).add(V3().set(0, -7, 0)), A.st.pos.clone().addScaledVector(dir, 600).add(V3().set(0, 260, 0)));
  });
  // 10 夜晚：镜头望向月亮，两架战机拖着加力火焰从月下掠过，海面上是月光带
  let NC, ND;
  shot(5, () => {
    clearAll(); applyWeather('night'); A = mk('F-22', true); B = mk('Su-57'); fov(44);
    const md = moonDir().clone().setY(0).normalize();
    NC = V3().set(9000, 45, -3000); ND = md;
  }, (t) => {
    const side = V3().crossVectors(ND, UP).normalize();   // 从左往右横穿画面
    const base = NC.clone().addScaledVector(ND, 150);
    const pathA = (u) => base.clone().addScaledVector(side, -330 + 150 * u).add(V3().set(0, 70 + 6 * u, 0));
    const pathB = (u) => base.clone().addScaledVector(ND, 30).addScaledVector(side, -365 + 150 * u).add(V3().set(0, 58 + 6 * u, 0));
    fly(A, pathA, t, 1); fly(B, pathB, t, 1);
    look(NC, NC.clone().addScaledVector(ND, 500).addScaledVector(side, 40 * (t - 2.2)).add(V3().set(0, 190, 0)));
    if (Math.abs(t - 1.6) < DT / 2) ev('flyby', 1.0, A.st.pos, 0.9);
  });
  // 11 蓝天里拉起远去（片尾）
  shot(5, () => {
    clearAll(); applyWeather('dusk'); A = mk('F-22', true); fov(40);
    beds.push({ k: 'calm' });
  }, (t) => {
    const sun = V3().set(Math.sin(8 / 57.3), 0, Math.cos(8 / 57.3));
    const p0 = V3().set(0, 600, -2000);
    // 从镜头后上方掠过，然后拉起冲向夕阳
    const path = (u) => p0.clone().addScaledVector(sun, 190 * u - 120).add(V3().set(0, 16 + (u > 1.2 ? (u - 1.2) ** 2 * 18 : 0), 0));
    fly(A, path, t, 1);
    const cam = p0.clone().add(V3().set(10, -8, 0));
    look(cam, cam.clone().addScaledVector(sun, 600).add(V3().set(0, 75, 0)));   // 镜头固定望向夕阳，飞机从头顶掠过入画
    if (Math.abs(t - 0.5) < DT / 2) ev('flyby', 1.2, A.st.pos, 0.95);
  });

  // ---- 录制接口 ----
  let frame = 0, cur = -1, shotT = 0;
  const starts = []; { let acc = 0; for (const s of S) { starts.push(acc); acc += s.dur; } window.PROMO_LEN = acc; }
  window.PROMO_CUTS = starts;
  window.demoSetup = () => true;
  window.demoStep = () => {
    videoT = frame / FPS;
    let i = starts.length - 1; while (i > 0 && starts[i] > videoT) i--;
    if (i !== cur) { cur = i; shotT = 0; slow = 1; S[i].setup(); S[i].update(0, DT); updateIslands(camera.position, true); }
    S[i].update(shotT, DT);
    const sdt = DT * (cur === 6 ? slow : 1);
    world(sdt);
    S[i].update(shotT, 0);   // 物理推进后再摆一次镜头，避免相机落后一帧
    render(DT);
    if (player.firing) EV.push({ t: videoT, k: 'cannonframe' });
    shotT += sdt; frame++;
    return renderer.domElement.toDataURL('image/jpeg', 0.93);
  };
  // ---- 离线混音：真实录音 + 合成低音铺底 + 转场鼓点 ----
  window.renderAudio = async () => {
    const len = window.PROMO_LEN, SR = 44100, ctx = new OfflineAudioContext(2, SR * len, SR);
    const buf = {};
    for (const [k, b64] of Object.entries(window.SFXDATA)) {
      const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      buf[k] = await ctx.decodeAudioData(u8.buffer);
    }
    // 压缩 + 限幅：最响的爆炸也不削波
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;
    const mast = ctx.createGain(); mast.gain.value = 0.8; lim.connect(mast); mast.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 4; comp.connect(lim);
    const bus = ctx.createGain(); bus.gain.value = 0.42; bus.connect(comp);
    const play = (k, t, gain, lp = 20000, rate = 1, dur) => {
      if (!buf[k] || t >= len) return;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf[k]; s.playbackRate.value = rate; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(bus); s.start(Math.max(0, t)); if (dur) s.stop(t + dur);
    };
    const loop = (k, t0, t1, gain, rate = 1, lp = 20000) => {
      if (!buf[k]) return;
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = buf[k]; s.loop = true; s.playbackRate.value = rate; f.type = 'lowpass'; f.frequency.value = lp;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.3); g.gain.setValueAtTime(gain, Math.max(t0 + 0.3, t1 - 0.3)); g.gain.linearRampToValueAtTime(0, t1);
      s.connect(f); f.connect(g); g.connect(bus); s.start(t0); s.stop(t1);
    };
    // 低音铺底：两组失谐锯齿波 + 慢速滤波扫动，片头渐强、片尾收
    const pad = (freq, t0, t1, gain) => {
      for (const det of [-7, 0, 7]) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det; f.type = 'lowpass'; f.frequency.setValueAtTime(300, t0); f.frequency.linearRampToValueAtTime(900, (t0 + t1) / 2); f.frequency.linearRampToValueAtTime(350, t1);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 1.5); g.gain.setValueAtTime(gain, t1 - 1.5); g.gain.linearRampToValueAtTime(0, t1);
        o.connect(f); f.connect(g); g.connect(bus); o.start(t0); o.stop(t1);
      }
    };
    const cuts = window.PROMO_CUTS;
    const chord = [55, 55, 43.65, 49, 55, 55, 41.2, 49, 55, 36.7, 43.65, 55];   // 每个镜头一个低音根音
    cuts.forEach((c, i) => { const e = i + 1 < cuts.length ? cuts[i + 1] : len; pad(chord[i % chord.length], Math.max(0, c - 0.8), Math.min(len, e + 0.8), 0.05); pad(chord[i % chord.length] * 1.5, Math.max(0, c - 0.8), Math.min(len, e + 0.8), 0.025); });
    // 转场鼓点
    cuts.forEach((c, i) => { if (i > 0) play('boom_low', c, 0.9, 500, 0.8); });
    play('boom_low', 0.05, 0.6, 400, 0.7);
    // 环境声：发动机 / 加力 / 雨 / 机炮
    for (let i = 0; i < cuts.length; i++) {
      const t0 = cuts[i], t1 = i + 1 < cuts.length ? cuts[i + 1] : len;
      if (i === 0) continue;
      loop('engine', t0, t1, i === 5 ? 0.7 : i === 10 ? 0.25 : 0.45, 1.1, i === 5 ? 2500 : 6000);
      if ([1, 3, 4, 6, 10, 11].includes(i)) loop('afterburner', t0, t1, 0.55);
      if (i === 9) { loop('rain', t0, t1, 0.9); }
    }
    // 机炮：把连续开火的帧合并成区间
    const cf = EV.filter((e) => e.k === 'cannonframe').map((e) => e.t);
    let s0 = null, prev = null;
    for (const t of [...cf, 1e9]) { if (s0 === null) s0 = t; else if (t - prev > 0.1) { loop('cannon', s0, prev + 0.1, 0.75); s0 = t; } prev = t; }
    // 事件：按相机距离衰减、按声速延迟
    for (const e of EV) {
      if (e.k === 'cannonframe') continue;
      const d = e.p ? e.p.distanceTo(e.c) : 0, delay = Math.min(1.5, d / 340);
      const g = e.gain * (e.k === 'flyby' ? 1 : 1.6 / (1 + d / 500));
      play(e.k, e.t + (e.k === 'flyby' ? -0.9 : delay), Math.min(1.5, g), e.k === 'boom_far' ? Math.max(700, 5000 - d * 0.5) : 20000, e.rate);
      if (e.k === 'boom_near' && e.gain > 0.5) play('boom_low', e.t + delay, Math.min(1.2, g), 900, 0.9);
    }
    // 雷声：和闪电对齐（闪电时刻记录在 EV 里没有，这里按暴风雨镜头固定几下）
    const rendered = await ctx.startRendering();
    // 编码 16 位 WAV
    const n = rendered.length, ch = [rendered.getChannelData(0), rendered.getChannelData(1)];
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
    out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) out.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
    const bytes = new Uint8Array(out.buffer); let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  window.PROMO_READY = true;
}
