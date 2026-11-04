// Окно GoingBoy: сцена three.js, панель, наведение, своя поза мышью, подписи.
// Всё, что решает, ЧТО показать (поза, нагрузка, подсветка, раскладка подписей), считает ядро
// (js/core, js/body); здесь только рисование и ввод.
(function () {
  'use strict';
  const GB = window.GB;
  const { Vec: V, Skeleton: S, Muscles: M, Kin: K, Anim: A, IK, Load: Ld, Labels: Lb, I18n: I, Themes: T, BodyView } = GB;
  const THREE = window.THREE;
  const $ = (id) => document.getElementById(id);

  // ---------------- настройки (переживают перезапуск) ----------------
  const STORE = 'goingboy:settings';
  const DEFAULTS = { theme: 'glass', lang: null, layers: { skin: false, muscles: true, bones: true }, labels: true, angles: true, speed: 1, move: 'walk' };
  const settings = (() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { saved = {}; }
    const s = { ...DEFAULTS, ...saved, layers: { ...DEFAULTS.layers, ...(saved.layers || {}) } };
    if (!T.IDS.includes(s.theme)) s.theme = 'glass';
    if (!I.LANGS.includes(s.lang)) s.lang = I.detect(navigator.language);
    if (![0.1, 0.25, 0.5, 1].includes(s.speed)) s.speed = 1;
    return s;
  })();
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* без хранилища - не беда */ } };

  // ---------------- движения и проигрыватель ----------------
  const MOVES = GB.Moves.MOVES.map((m) => A.compile(m));
  const MOVE = Object.fromEntries(MOVES.map((m) => [m.id, m]));
  const player = A.createPlayer();
  player.speed = settings.speed;
  let mode = 'move';                 // 'move' | 'pose'
  let custom = K.restPose();         // своя поза
  let customVersion = 0;

  // ---------------- three.js ----------------
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2.5, 5, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1.5, near: 0.5, far: 15 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xaabbff, 0.5);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2a2440, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const GRID_CELL = 0.25;
  let grid = null;
  function makeGrid(color) {
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = new THREE.GridHelper(12, 48, color, color);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    grid.position.y = 0.001;
    scene.add(grid);
  }

  const body = BodyView.create(THREE);
  scene.add(body.root);
  body.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  // предметы: мяч и перекладина
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 }));
  ball.castShadow = true;
  scene.add(ball);
  const barGroup = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 0.7, roughness: 0.3 });
  const barMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 16), steel);
  barMesh.rotation.z = Math.PI / 2;
  barGroup.add(barMesh);
  for (const x of [-0.65, 0.65]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 12), steel);
    post.position.x = x;
    post.userData.post = true;
    barGroup.add(post);
  }
  scene.add(barGroup);

  // дуги углов на суставах
  const ARC_JOINTS = ['knee_L', 'knee_R', 'elbow_L', 'elbow_R', 'hip_L', 'hip_R', 'shoulder_L', 'shoulder_R'];
  const arcMat = new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.95, depthTest: false });
  const arcs = ARC_JOINTS.map(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
    const line = new THREE.Line(g, arcMat);
    line.renderOrder = 5;
    line.frustumCulled = false;
    scene.add(line);
    return line;
  });

  // ручки своей позы
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x4ad6ff, emissive: 0x0a5a7a, transparent: true, opacity: 0.85, depthTest: false });
  const handles = Object.keys(IK.HANDLES).map((name) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), handleMat);
    m.userData = { handle: name };
    m.renderOrder = 6;
    m.visible = false;
    scene.add(m);
    return m;
  });

  // ---------------- камера: вращение вокруг тела ----------------
  const cam = { az: 0.6, el: 0.12, dist: 3.3, target: new THREE.Vector3(0, 0.95, 0) };
  const CAM0 = { az: 0.6, el: 0.12, dist: 3.3 };
  function placeCamera() {
    cam.el = Math.max(-0.2, Math.min(1.35, cam.el));
    cam.dist = Math.max(1.4, Math.min(9, cam.dist));
    const c = Math.cos(cam.el);
    // в узком (книжном) окне камера отходит, чтобы тело влезало по ширине
    const d = cam.dist * Math.max(1, 0.95 / camera.aspect);
    camera.position.set(cam.target.x + d * c * Math.sin(cam.az), cam.target.y + d * Math.sin(cam.el), cam.target.z + d * c * Math.cos(cam.az));
    camera.lookAt(cam.target);
  }

  // ---------------- нагрузка: кэш по фазе цикла ----------------
  const BINS = 240;
  const cache = new Map();
  function analysisFor(pose) {
    if (mode === 'pose') {
      const key = 'pose:' + customVersion;
      if (!cache.has(key)) cache.set(key, Ld.analyze({ prev: custom, pose: custom, next: custom, h: 0.03 }));
      return cache.get(key);
    }
    const mv = player.mv;
    const bin = ((Math.round((player.time / mv.dur) * BINS) % BINS) + BINS) % BINS;
    const key = mv.id + ':' + bin;
    if (!cache.has(key)) {
      cache.set(key, Ld.analyzeAt((t) => A.at(mv, t), (bin / BINS) * mv.dur, 0.03, { bar: mv.hang && mv.hang.bar }));
    }
    void pose;
    return cache.get(key);
  }

  // ---------------- текст ----------------
  function applyLang() {
    I.setLang(settings.lang);
    document.documentElement.lang = settings.lang;
    document.title = I.t('title');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = I.t(el.dataset.i18n);
    for (const b of document.querySelectorAll('#lang button')) b.classList.toggle('on', b.dataset.lang === settings.lang);
    buildMoves();
    buildThemes();
    updatePlay();
    lastInfo = null;
  }

  function buildMoves() {
    const nav = $('moves');
    nav.textContent = '';
    const groups = [...new Set(MOVES.map((m) => m.def.group))];
    for (const g of groups) {
      const box = document.createElement('div');
      box.className = 'group';
      const cap = document.createElement('span');
      cap.textContent = I.t('g_' + g);
      box.appendChild(cap);
      for (const mv of MOVES.filter((m) => m.def.group === g)) box.appendChild(moveButton(mv.id));
      nav.appendChild(box);
    }
    const box = document.createElement('div');
    box.className = 'group';
    box.appendChild(moveButton('pose'));
    nav.appendChild(box);
  }
  function moveButton(id) {
    const b = document.createElement('button');
    b.dataset.move = id;
    b.textContent = I.t(id);
    b.classList.toggle('on', current() === id);
    b.onclick = () => setMove(id);
    return b;
  }
  const current = () => (mode === 'pose' ? 'pose' : player.mv ? player.mv.id : null);

  function buildThemes() {
    const sel = $('theme');
    sel.textContent = '';
    for (const t of T.THEMES) {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = I.t('th_' + t.id);
      sel.appendChild(o);
    }
    sel.value = settings.theme;
  }

  // ---------------- тема ----------------
  function applyTheme() {
    const th = T.get(settings.theme);
    if (th.id === 'glass') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th.id);
    floorMat.color.setHex(th.scene.floor);
    makeGrid(th.scene.grid);
    hemi.intensity = th.scene.ambient + 0.1;
    body.setColors(th.scene);
    arcMat.color.setHex(th.dark ? 0xffd34d : 0xb36b00);
    $('theme').value = th.id;
  }

  // ---------------- управление ----------------
  function setMove(id) {
    if (id === 'pose') {
      if (mode !== 'pose') custom = K.clone(A.current(player));
      // своя поза стоит на полу
      custom.root.pos[1] -= K.lowest(K.fk(custom));
      customVersion++;
      mode = 'pose';
    } else {
      if (!MOVE[id]) return;
      if (mode === 'pose') { A.play(player, null, custom); }
      mode = 'move';
      A.play(player, MOVE[id]);
      settings.move = id;
      persist();
    }
    for (const b of document.querySelectorAll('#moves button')) b.classList.toggle('on', b.dataset.move === id);
    $('pose-bar').hidden = mode !== 'pose';
    for (const h of handles) h.visible = mode === 'pose';
    updatePlay();
  }

  function updatePlay() {
    const b = $('play');
    b.textContent = player.paused ? '▶ ' + I.t('play') : '❚❚ ' + I.t('pause');
    b.disabled = mode === 'pose';
    for (const x of document.querySelectorAll('#speed button')) x.classList.toggle('on', Number(x.dataset.speed) === player.speed);
  }
  function setPaused(p) { player.paused = p; updatePlay(); }
  function setSpeed(s) { player.speed = s; settings.speed = s; persist(); updatePlay(); }

  function setLayers(l) {
    Object.assign(settings.layers, l);
    if (!settings.layers.skin && !settings.layers.muscles && !settings.layers.bones) settings.layers.skin = true; // пустая сцена ни к чему
    body.setLayers(settings.layers);
    for (const b of document.querySelectorAll('#layers button')) b.classList.toggle('on', !!settings.layers[b.dataset.layer]);
    persist();
  }
  function setExtra(name, v) {
    settings[name] = v;
    for (const b of document.querySelectorAll('#extras button')) b.classList.toggle('on', !!settings[b.dataset.extra]);
    persist();
  }

  $('play').onclick = () => setPaused(!player.paused);
  for (const b of document.querySelectorAll('#speed button')) b.onclick = () => setSpeed(Number(b.dataset.speed));
  for (const b of document.querySelectorAll('#layers button')) b.onclick = () => setLayers({ [b.dataset.layer]: !settings.layers[b.dataset.layer] });
  for (const b of document.querySelectorAll('#extras button')) b.onclick = () => setExtra(b.dataset.extra, !settings[b.dataset.extra]);
  for (const b of document.querySelectorAll('#lang button')) b.onclick = () => { settings.lang = b.dataset.lang; persist(); applyLang(); };
  $('theme').onchange = (e) => { settings.theme = e.target.value; persist(); applyTheme(); };
  $('cam-reset').onclick = () => Object.assign(cam, CAM0);
  $('pose-reset').onclick = () => { custom = K.restPose(); customVersion++; };
  $('panel-toggle').onclick = () => $('panel').classList.toggle('open');
  const scrub = $('scrub');
  scrub.addEventListener('input', () => {
    if (mode !== 'move' || !player.mv) return;
    setPaused(true);
    player.time = (Number(scrub.value) / 1000) * player.mv.dur;
    player.fade = A.FADE;
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { e.preventDefault(); setPaused(!player.paused); }
    if (player.paused && player.mv && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
      player.time += (e.code === 'ArrowRight' ? 1 : -1) / 60;
      player.fade = A.FADE;
    }
  });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  // Хаб присылает тему оболочки: светлая - светлая, тёмная - своя тёмная
  window.addEventListener('message', (e) => {
    if (e.data && e.data.mix === 'theme') { settings.theme = e.data.theme === 'light' ? 'light' : (T.get(settings.theme).dark ? settings.theme : 'glass'); applyTheme(); }
  });

  // ---------------- мышь: камера, наведение, ручки ----------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hover = null;      // { kind, id }
  let drag = null;       // { type: 'orbit'|'handle', ... }
  const pointers = new Map();
  function toNdc(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pick(x, y) {
    toNdc(x, y);
    const hits = ray.intersectObjects(body.pickables.filter((o) => o.visible && isShown(o)), false);
    if (!hits.length) return null;
    // сустав важнее мышцы, мышца важнее кости
    const rank = { joint: 0, muscle: 1, bone: 2, skin: 3 };
    hits.sort((a, b) => (rank[a.object.userData.kind] - rank[b.object.userData.kind]) || (a.distance - b.distance));
    const near = hits[0].distance;
    const best = hits.filter((h) => h.distance < near + 0.08).sort((a, b) => rank[a.object.userData.kind] - rank[b.object.userData.kind])[0];
    return { kind: best.object.userData.kind, id: best.object.userData.id };
  }
  function isShown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  function pickHandle(x, y) {
    if (mode !== 'pose') return null;
    toNdc(x, y);
    const hit = ray.intersectObjects(handles, false)[0];
    return hit ? hit.object.userData.handle : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const h = pickHandle(e.clientX, e.clientY);
    if (h) {
      const pos = new THREE.Vector3(...IK.effector(custom, h));
      const normal = camera.getWorldDirection(new THREE.Vector3()).negate();
      drag = { type: 'handle', name: h, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pos) };
    } else {
      drag = { type: 'orbit', x: e.clientX, y: e.clientY };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (prev) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && prev) {
      // два пальца - приближение
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag && drag.pinch) cam.dist *= drag.pinch / Math.max(1, d);
      drag = { type: 'pinch', pinch: d };
      return;
    }
    if (drag && drag.type === 'orbit') {
      cam.az -= (e.clientX - drag.x) * 0.008;
      cam.el += (e.clientY - drag.y) * 0.006;
      drag.x = e.clientX; drag.y = e.clientY;
      return;
    }
    if (drag && drag.type === 'handle') {
      toNdc(e.clientX, e.clientY);
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(drag.plane, p)) {
        custom = IK.drag(custom, drag.name, [p.x, p.y, p.z]).pose;
        customVersion++;
      }
      return;
    }
    const info = pick(e.clientX, e.clientY);
    if (JSON.stringify(info) !== JSON.stringify(hover)) { hover = info; body.setHover(hover); }
    canvas.style.cursor = pickHandle(e.clientX, e.clientY) ? 'grab' : info ? 'help' : 'default';
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); if (!pointers.size) drag = null; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; body.setHover(null); } });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });
  canvas.addEventListener('dblclick', () => Object.assign(cam, CAM0));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------- экран: проекции ----------------
  function sizeOf() {
    const r = canvas.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  }
  const v3 = new THREE.Vector3();
  function toScreen(p) {
    const { w, h } = sizeOf();
    v3.set(p[0], p[1], p[2]).project(camera);
    return [(v3.x + 1) / 2 * w, (1 - v3.y) / 2 * h, v3.z];
  }
  /** Прямоугольники тела на экране: проекции капсул кожи (с запасом в радиус). */
  function bodyRects(f) {
    const { h } = sizeOf();
    const focal = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    return K.capsules(f).map((c) => {
      const a = toScreen(c.a), b = toScreen(c.b);
      const da = camera.position.distanceTo(v3.set(...c.a)), db = camera.position.distanceTo(v3.set(...c.b));
      const ra = (c.r * focal) / da + 2, rb = (c.r * focal) / db + 2;
      const x0 = Math.min(a[0] - ra, b[0] - rb), x1 = Math.max(a[0] + ra, b[0] + rb);
      const y0 = Math.min(a[1] - ra, b[1] - rb), y1 = Math.max(a[1] + ra, b[1] + rb);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    });
  }

  // ---------------- подписи и панель ----------------
  const labelsBox = $('labels'), leaders = $('leaders');
  let lastLabels = [], lastBody = [], lastInfo = null;
  const pct = (a) => Math.round(a * 100) + '%';
  const deg = (v) => Math.round(v) + '°';
  function stateText(an, mi) { return I.t('st_' + Ld.state(an.act[mi], an.vel[mi])); }

  function describe(info, an, f) {
    if (!info) return null;
    if (info.kind === 'muscle') {
      const mi = M.MUSCLE[info.id];
      const m = I.muscle(info.id);
      const mid = Ld.musclePath(currentPose, f, M.MUSCLES[mi]);
      return { title: m.name, does: m.does, line: `${stateText(an, mi)} · ${I.t('load')} ${pct(an.act[mi])}`, act: an.act[mi], anchor: mid[Math.floor(mid.length / 2)] };
    }
    if (info.kind === 'joint') {
      const j = S.JOINT[info.id];
      const parts = j.dofs.map((d) => `${I.dof(d.name)} ${deg(K.get(currentPose, info.id + '.' + d.name))}`);
      const tq = j.dofs.map((d) => Math.abs(an.tau[S.DOF[info.id + '.' + d.name]])).reduce((a, b) => Math.max(a, b), 0);
      return { title: I.joint(info.id), does: parts.join(', '), line: `${I.t('torque')} ${Math.round(tq)} ${I.t('nm')}`, act: null, anchor: f.pos[j.bone] };
    }
    const b = S.BONE[info.id];
    const bi = I.bone(info.id);
    return { title: bi.name, does: bi.does, line: '', act: null, anchor: V.lerp(f.pos[b.index], K.tail(f, b.index), 0.5) };
  }

  function renderLabels(f, an) {
    const view = sizeOf();
    const items = [];
    const hov = describe(hover, an, f);
    if (hov) items.push({ id: 'hover', priority: 10, anchor: toScreen(hov.anchor), html: `<b>${hov.title}</b><span class="does">${hov.does}</span>${hov.line ? `<br>${hov.line}` : ''}` });
    if (settings.labels && settings.layers.muscles) {
      const top = [...an.act].map((a, mi) => [a, mi]).filter(([a]) => a > 0.15).sort((a, b) => b[0] - a[0]).slice(0, 6);
      for (const [a, mi] of top) {
        if (hover && hover.kind === 'muscle' && M.MUSCLES[mi].id === hover.id) continue;
        const pts = Ld.musclePath(currentPose, f, M.MUSCLES[mi]);
        items.push({ id: M.MUSCLES[mi].id, priority: a, anchor: toScreen(pts[Math.floor(pts.length / 2)]), html: `${I.muscle(M.MUSCLES[mi].id).name} <span class="pct">${pct(a)}</span>` });
      }
    }
    // размеры подписей - по самим элементам
    labelsBox.textContent = '';
    const els = items.map((it) => {
      const el = document.createElement('div');
      el.className = 'label';
      el.dataset.id = it.id;
      el.innerHTML = it.html;
      labelsBox.appendChild(el);
      it.w = el.offsetWidth; it.h = el.offsetHeight;
      return el;
    });
    lastBody = bodyRects(f);
    const placed = Lb.layout(view, lastBody, items.map((it) => ({ id: it.id, anchor: [it.anchor[0], it.anchor[1]], w: it.w, h: it.h, priority: it.priority })));
    let svg = '';
    items.forEach((it, k) => {
      const p = placed.find((q) => q.id === it.id);
      if (!p) { els[k].remove(); return; }
      els[k].style.left = p.x + 'px';
      els[k].style.top = p.y + 'px';
      const ex = p.side === 'left' ? p.x + p.w : p.side === 'right' ? p.x : p.x + p.w / 2;
      const ey = p.side === 'band' ? (p.y < it.anchor[1] ? p.y + p.h : p.y) : p.y + p.h / 2;
      svg += `<line x1="${ex}" y1="${ey}" x2="${it.anchor[0]}" y2="${it.anchor[1]}"/><circle cx="${it.anchor[0]}" cy="${it.anchor[1]}" r="2.5"/>`;
    });
    leaders.innerHTML = svg;
    lastLabels = placed;
  }

  function renderPanel(an, f) {
    const info = describe(hover, an, f);
    const key = JSON.stringify(hover) + settings.lang;
    if (key !== lastInfo) {
      lastInfo = key;
      $('info-title').textContent = info ? info.title : I.t('hover_hint');
      $('info-does').textContent = info ? info.does : '';
    }
    const meter = $('info-meter');
    meter.hidden = !(info && info.act !== null);
    if (info && info.act !== null) {
      meter.querySelector('i').style.width = pct(info.act);
      meter.querySelector('span').textContent = info.line;
    } else if (info && info.line) {
      $('info-does').textContent = info.does + ' · ' + info.line;
    }
    const top = [...an.act].map((a, mi) => [a, mi]).filter(([a]) => a > 0.05).sort((a, b) => b[0] - a[0]).slice(0, 8);
    $('top-list').innerHTML = top.length
      ? top.map(([a, mi]) => `<li>${I.muscle(M.MUSCLES[mi].id).name} <span class="pct">${pct(a)}</span></li>`).join('')
      : `<li>${I.t('nothing')}</li>`;
    const rows = [['hip', 'flex'], ['knee', 'flex'], ['ankle', 'dorsi'], ['shoulder', 'flex'], ['elbow', 'flex']];
    $('angles').innerHTML = `<tr><th></th><th>${I.t('side_Lm')}</th><th>${I.t('side_Rm')}</th></tr>` + rows.map(([j, d]) =>
      `<tr><td>${I.joint(j + '_L').replace(/ \(.*\)$/, '')}: ${I.dof(d)}</td><td>${deg(K.get(currentPose, `${j}_L.${d}`))}</td><td>${deg(K.get(currentPose, `${j}_R.${d}`))}</td></tr>`).join('') +
      `<tr><td>${I.joint('lumbar')}: ${I.dof('flex')}</td><td colspan="2">${deg(K.get(currentPose, 'lumbar.flex'))}</td></tr>`;
  }

  // ---------------- предметы ----------------
  function updateProps(pose, f) {
    const mv = mode === 'move' ? player.mv : null;
    barGroup.visible = !!(mv && mv.hang);
    if (barGroup.visible) {
      const [x, y, z] = mv.hang.bar;
      barGroup.position.set(x, y, z);
      for (const c of barGroup.children) if (c.userData.post) { c.scale.y = y; c.position.y = -y / 2; }
    }
    const pr = mv && mv.def.props && mv.def.props.ball;
    ball.visible = !!pr;
    if (!pr) return;
    const ph = ((player.time / mv.dur) % 1 + 1) % 1;
    if (pr.hit !== undefined) {
      // удар: мяч лежит у носка в момент удара, после удара летит
      if (!mv.cache.ball) {
        const fh = K.fk(A.sample(mv, pr.hit));
        const toe = K.point(fh, S.BONE.toes_R.index, [0, -0.01, 0.06]);
        mv.cache.ball = [toe[0], 0.11, toe[2] + 0.1];
      }
      const rest = mv.cache.ball;
      if (ph < pr.hit) ball.position.set(...rest);
      else {
        const t = (ph - pr.hit) * mv.dur;
        ball.position.set(rest[0], 0.11 + 4 * t - 4.9 * t * t, rest[2] + 9 * t);
        if (ball.position.y < 0.11) ball.position.y = 0.11;
      }
      ball.visible = ph < pr.hit + 0.3 || ph > 0.95;
      if (ph > 0.95) ball.position.set(...rest);
    } else {
      // бросок: мяч в кисти до выпуска, потом летит со скоростью кисти
      const grip = (pp) => K.point(K.fk(pp), S.BONE[pr.hand].index, [0, -0.1, 0.03]);
      if (ph < pr.release || ph > 0.9) ball.position.set(...grip(pose));
      else {
        if (!mv.cache.throwV) {
          const h = 0.01;
          mv.cache.throwP = grip(A.sample(mv, pr.release));
          mv.cache.throwV = V.scale(V.sub(grip(A.sample(mv, pr.release + h)), grip(A.sample(mv, pr.release - h))), 1 / (2 * h * mv.dur));
        }
        const t = (ph - pr.release) * mv.dur;
        const p = V.add(mv.cache.throwP, V.add(V.scale(mv.cache.throwV, t), [0, -4.9 * t * t, 0]));
        ball.position.set(p[0], Math.max(0.11, p[1]), p[2]);
      }
      ball.visible = ph < pr.release + 0.3 || ph > 0.9;
    }
    void f;
  }

  function updateArcs(pose, f) {
    arcs.forEach((line, k) => {
      line.visible = settings.angles;
      if (!line.visible) return;
      const j = S.JOINT[ARC_JOINTS[k]];
      const b = j.bone, par = S.PARENT[b];
      const dir = V.norm(S.BONES[b].tail);
      const u = V.qRot(f.rot[par], dir), w = V.qRot(f.rot[b], dir);
      const c = f.pos[b];
      const arr = line.geometry.attributes.position.array;
      for (let i = 0; i < 18; i++) {
        const s = i / 17;
        const v = V.norm(V.lerp(u, w, s));
        arr[i * 3] = c[0] + v[0] * 0.075; arr[i * 3 + 1] = c[1] + v[1] * 0.075; arr[i * 3 + 2] = c[2] + v[2] * 0.075;
      }
      line.geometry.attributes.position.needsUpdate = true;
    });
  }

  // ---------------- кадр ----------------
  let currentPose = K.restPose();
  let currentAn = null, currentF = null;
  let last = performance.now(), frames = 0, fpsT = 0, fps = 0;
  function resize() {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    frames++; fpsT += dt;
    if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    tick(dt);
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    if (mode === 'move') A.step(player, dt);
    const pose = mode === 'pose' ? custom : A.current(player);
    currentPose = pose;
    const f = K.fk(pose);
    currentF = f;
    const an = analysisFor(pose);
    currentAn = an;
    body.update(f, Ld.paths(pose, f), an.act);
    updateProps(pose, f);
    updateArcs(pose, f);
    if (mode === 'pose') handles.forEach((h) => h.position.set(...IK.effector(custom, h.userData.handle)));
    // камера мягко следует за тазом (по горизонтали) и за центром масс по высоте
    const c = K.com(f);
    cam.target.x += (c[0] - cam.target.x) * Math.min(1, dt * 3);
    cam.target.z += (c[2] - cam.target.z) * Math.min(1, dt * 3);
    cam.target.y += (Math.max(0.6, Math.min(1.5, c[1])) - cam.target.y) * Math.min(1, dt * 2);
    placeCamera();
    // беговая дорожка: пол едет под ногами со скоростью движения
    if (grid) grid.position.z = mode === 'move' && player.mv && player.mv.speed ? -((player.time * player.mv.speed) % GRID_CELL) : 0;
    if (mode === 'move' && player.mv && document.activeElement !== scrub) scrub.value = String(Math.round((((player.time / player.mv.dur) % 1) + 1) % 1 * 1000));
    renderer.render(scene, camera);
    renderLabels(f, an);
    renderPanel(an, f);
  }

  // ---------------- запуск ----------------
  applyTheme();
  applyLang();
  setLayers({});
  setExtra('labels', settings.labels);
  setExtra('angles', settings.angles);
  resize();
  setMove(MOVE[settings.move] ? settings.move : 'walk');
  player.fade = A.FADE;
  placeCamera();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

  // ---------------- для тестов (Playwright) ----------------
  GB.app = {
    settings, player, MOVES: MOVES.map((m) => m.id),
    state: () => ({ move: current(), mode, time: player.time, paused: player.paused, speed: player.speed, layers: { ...settings.layers }, theme: settings.theme, lang: settings.lang, fps, labels: settings.labels, angles: settings.angles }),
    setMove, setPaused, setSpeed, setLayers, setExtra,
    setTheme: (id) => { settings.theme = id; persist(); applyTheme(); },
    setLang: (l) => { settings.lang = l; persist(); applyLang(); },
    setPhase: (ph) => { player.time = ph * player.mv.dur; player.fade = A.FADE; tick(0); },
    setCamera: (o) => { Object.assign(cam, o); tick(0); },
    hoverAt: (x, y) => { hover = pick(x, y); body.setHover(hover); tick(0); return hover; },
    setHover: (h) => { hover = h; body.setHover(h); tick(0); },
    tick: (dt = 0) => tick(dt),
    labelRects: () => [...labelsBox.querySelectorAll('.label')].map((el) => ({ id: el.dataset.id, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })),
    bodyRects: () => lastBody,
    placed: () => lastLabels,
    view: sizeOf,
    screenOf: (p) => { const s = toScreen(p); const r = canvas.getBoundingClientRect(); return [s[0] + r.left, s[1] + r.top]; },
    effector: (name) => IK.effector(mode === 'pose' ? custom : currentPose, name),
    pose: () => ({ root: currentPose.root, a: [...currentPose.a] }),
    analysis: () => currentAn,
    activation: (id) => currentAn.act[M.MUSCLE[id]],
    frameF: () => currentF,
    ballVisible: () => ball.visible,
    barVisible: () => barGroup.visible,
  };
})();
