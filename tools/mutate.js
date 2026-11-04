// Проверка проверок: каждое правило по очереди ломается в копии web/ (или electron/), и законы
// обязаны это заметить («мутант убит»). Исходники не меняются.
//
//   node tools/mutate.js                 все мутанты
//   GB_MUT=glow node tools/mutate.js     только те, чьё имя подходит под регулярку
//   node tools/mutate.js --check         только проверить, что каждая поломка находится
//
// Сначала должны быть зелёными сами законы (npm test, npm run test:web): иначе упавший закон
// «убьёт» мутанта и без поломки.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// file - от корня (web/... или electron/...), from -> to - поломка (from ровно один раз),
// unit - имя закона node:test (регулярка), web - имя закона Playwright (-g)
const MUTANTS = [
  // ---------- подсветка мышц ----------
  { id: 'glow-random', file: 'web/js/core/load.js', from: '    for (let mi = 0; mi < NM; mi++) per[mi] = Math.min(1, Math.max(0, per[mi]));', to: '    for (let mi = 0; mi < NM; mi++) per[mi] = Math.random();', unit: 'подсветка согласована' },
  { id: 'glow-antagonist', file: 'web/js/core/load.js', from: 'const ag = list.filter(([, k]) => k * t > 0);', to: 'const ag = list.filter(([, k]) => k !== 0);', unit: 'подсветка согласована' },
  { id: 'glow-undriven', file: 'web/js/core/load.js', from: 'if (!M.DRIVEN[i] || Math.abs(t) < TAU_MIN) return;', to: 'if (Math.abs(t) < TAU_MIN) return;', unit: 'подсветка согласована|эталонные позы|в стойке' },
  { id: 'floor-pulls', file: 'web/js/core/load.js', from: 'const bad = idx.filter((k) => list[k].floor && out[k][1] < 0);', to: 'const bad = [];', unit: 'пол только толкает|стойка без движения' },
  { id: 'no-moment-balance', file: 'web/js/core/load.js', from: 'const forces = contactForces(list, Rsum, com, Mc);', to: 'const forces = contactForces(list, Rsum, com);', unit: 'уравновешивают' },
  { id: 'bar-is-point', file: 'web/js/core/load.js', from: 'if (Math.hypot(g[1] - env.bar[1], g[2] - env.bar[2]) < BAR_TOL)', to: 'if (V.dist(g, env.bar) < BAR_TOL)', unit: 'вис на перекладине' },
  { id: 'state-swapped', file: 'web/js/core/load.js', from: "if (vel < -0.01) return 'shorten';", to: "if (vel > 0.01) return 'shorten';", unit: 'что мышца делает' },
  // ---------- мышцы ----------
  { id: 'biceps-extends', file: 'web/js/body/muscles.js', from: "{ id: 'biceps', group: 'arm', fmax: 800, act: { 'elbow.flex': 1 },", to: "{ id: 'biceps', group: 'arm', fmax: 800, act: { 'elbow.flex': -1 },", unit: 'действие мышцы из подписи|описание мышцы' },
  { id: 'no-wrap', file: 'web/js/core/load.js', from: '      if (d < e.r) out.push(V.add(X, V.scale(n, e.r - d)));', to: '', unit: 'действие мышцы из подписи' },
  { id: 'wrap-shortest-arc', file: 'web/js/core/load.js', from: 'return V.qRot(V.qMul(f.rot[S.PARENT[e.bone]], K.localRot(p, e.bone, 0.5)), e.dir);', to: 'return V.qRot(V.qMul(f.rot[S.PARENT[e.bone]], V.qSlerp(V.QI, K.localRot(p, e.bone), 0.5)), e.dir);', unit: 'действие мышцы из подписи' },
  { id: 'right-muscle-not-mirrored', file: 'web/js/body/muscles.js', from: 'const sx = side === \'L\' ? 1 : -1;', to: 'const sx = 1;', unit: 'мышцы: 25 на сторону' },
  { id: 'desc-lies', file: 'web/js/core/i18n.js', from: "biceps: [['Бицепс плеча', 'сгибает локоть']", to: "biceps: [['Бицепс плеча', 'разгибает локоть']", unit: 'описание мышцы' },
  // ---------- скелет и кинематика ----------
  { id: 'mirror-signs-same', file: 'web/js/body/skeleton.js', from: "dofs: j.dofs.map(([n, ax, s, lo, hi]) => [n, ax, ax === 'x' ? s : -s, lo, hi]),", to: 'dofs: j.dofs.map(([n, ax, s, lo, hi]) => [n, ax, s, lo, hi]),', unit: 'зеркало|знаки углов' },
  { id: 'bones-stretch', file: 'web/js/core/kinematics.js', from: 'pos[b] = V.add(pos[par], V.qRot(rot[par], S.BONES[b].offset));', to: 'pos[b] = V.add(pos[par], V.scale(V.qRot(rot[par], S.BONES[b].offset), 1 + 0.002 * p.a[0]));', unit: 'длины костей|длины' },
  { id: 'knee-hyperextends', file: 'web/js/body/skeleton.js', from: "['flex', 'x', 1, 0, 145]", to: "['flex', 'x', 1, -15, 145]", unit: 'пределы' },
  { id: 'blend-long-arc', file: 'web/js/core/kinematics.js', from: 'q.root.rot = p0.root.rot.map((r, k) => r + V.wrapDeg(p1.root.rot[k] - r) * w);', to: 'q.root.rot = p0.root.rot.map((r, k) => r + (p1.root.rot[k] - r) * w);', unit: 'смешивание' },
  // ---------- анимация ----------
  { id: 'spline-overshoots', file: 'web/js/core/anim.js', from: 'm[k] = d0 * d1 > 0 ? 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1) : 0;', to: 'm[k] = (y[k + 1] - y[k - 1]) / (h0 + h1);', unit: 'сплайн|пределах' },
  { id: 'no-ground', file: 'web/js/core/anim.js', from: '      if (mv.ground) p.root.pos[1] -= K.lowest(K.fk(p), mv.ground);', to: '', unit: 'под пол' },
  { id: 'flight-no-hump', file: 'web/js/core/anim.js', from: 'const target = V.add(V.lerp(c0, c1, s), [0, 0.5 * G * ta * tb, 0]);', to: 'const target = V.lerp(c0, c1, s);', unit: 'парабол' },
  { id: 'hang-no-balance', file: 'web/js/core/anim.js', from: '      solveHang(p, mv.hang.grip);\n', to: '', unit: 'держат опору' },
  { id: 'pushup-no-level', file: 'web/js/core/anim.js', from: '    if (mv.level) solveLevel(p, mv.level);', to: '', unit: 'все опоры на полу' },
  { id: 'hands-slide', file: 'web/js/core/anim.js', from: '        p.root.pos[2] += mv.pin.at[1] - m[2];', to: '', unit: 'держат опору' },
  { id: 'transition-under-floor', file: 'web/js/core/anim.js', from: '    if (low < 0) q.root.pos[1] -= low;', to: '', unit: 'переходы' },
  { id: 'pause-ignored', file: 'web/js/core/anim.js', from: '    if (pl.paused) return;', to: '', unit: 'проигрыватель' },
  { id: 'foot-yaw-ignored', file: 'web/js/core/limb.js', from: 'for (let it = 0; it < 12 && Math.abs(m) > 1e-5; it++) {', to: 'for (let it = 0; it < 0; it++) {', unit: 'не скользит' },
  { id: 'walk-no-pelvis-tilt', file: 'web/js/core/moves.js', from: "base: { ...ARMS, 'root.pitch': 10, 'lumbar.flex': -7, 'neck.flex': -3 },", to: "base: { ...ARMS, 'root.pitch': 0, 'lumbar.flex': 3, 'neck.flex': -3 },", unit: 'опорной фазе' },
  { id: 'squat-hips-forward', file: 'web/js/core/moves.js', from: "{ t: 0.45, j: both({ 'root.y': 0.56, 'root.z': -0.26,", to: "{ t: 0.45, j: both({ 'root.y': 0.56, 'root.z': -0.05,", unit: 'равновесие|пределах' },
  // ---------- IK ----------
  { id: 'ik-no-limits', file: 'web/js/core/ik.js', from: 'p.a[i] = Math.min(d.max, Math.max(d.min, p.a[i] + Math.max(-15, Math.min(15, step))));', to: 'p.a[i] = p.a[i] + Math.max(-15, Math.min(15, step));', unit: 'достижимая цель|недостижимая' },
  { id: 'ik-into-floor', file: 'web/js/core/ik.js', from: 'const goal = [target[0], Math.max(FLOOR[name], target[1]), target[2]];', to: 'const goal = target.slice();', unit: 'не тащит ручку в пол' },
  { id: 'ik-no-limb-start', file: 'web/js/core/ik.js', from: '      starts.push(K.clampPose(q));', to: '', unit: 'достижимая цель|аналитическая' },
  { id: 'ik-one-branch', file: 'web/js/core/ik.js', from: 'for (const branch of [0, 1]) {', to: 'for (const branch of [0]) {', unit: 'корпус почти не гнётся' },
  { id: 'ik-effort-ignored', file: 'web/js/core/ik.js', from: '(Math.abs(r.dist - res.dist) <= 1e-3 && r.effort < res.effort)', to: 'false', unit: 'корпус почти не гнётся' },
  { id: 'ik-no-damping', file: 'web/js/core/ik.js', from: '      for (let r = 0; r < 3; r++) JW[r][r] += lambda * lambda;', to: '', unit: 'достижимая цель|недостижимая|аналитическая' },
  // ---------- подписи ----------
  { id: 'labels-overlap', file: 'web/js/core/labels.js', from: '    for (let i = 1; i < list.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + list[i - 1].h + SPACE);', to: '', unit: 'подписи: 2000' },
  { id: 'labels-on-body', file: 'web/js/core/labels.js', from: 'const fitL = l.w <= roomL, fitR = l.w <= roomR;', to: 'const fitL = true, fitR = true;', unit: 'подписи: 2000' },
  { id: 'labels-band-break', file: 'web/js/core/labels.js', from: "if (l.w > x1 - x0 || y + l.h > y1) { left.push(l); continue; }", to: "if (l.w > x1 - x0 || y + l.h > y1) { left.push(l); break; }", unit: 'высокая подпись' },
  { id: 'labels-one-band', file: 'web/js/core/labels.js', from: 'for (const bandArea of order) {', to: 'for (const bandArea of order.slice(0, 1)) {', unit: 'полосу снизу' },
  { id: 'labels-drop-important', file: 'web/js/core/labels.js', from: 'if (l.priority < list[worst].priority) worst = i;', to: 'if (l.priority > list[worst].priority) worst = i;', unit: 'наименее важные' },
  // ---------- окно программы ----------
  { id: 'window-off-screen', file: 'electron/window-state.js', from: 'const ny = Math.max(best.y, Math.min(y, best.y + best.height - height));', to: 'const ny = y;', unit: 'окно:' },
  // ---------- страница ----------
  { id: 'page-stale-glow', file: 'web/js/app/app.js', from: "const key = mv.id + ':' + bin;", to: "const key = 'x';", web: 'подсветка в окне' },
  { id: 'page-labels-at-anchor', file: 'web/js/app/app.js', from: "els[k].style.left = p.x + 'px';", to: "els[k].style.left = it.anchor[0] + 'px';", web: 'подписи 1280' },
  { id: 'page-camera-no-fit', file: 'web/js/app/app.js', from: '    cam.fit += (Math.max(1, (hi - Math.min(0, lo)) / 1.85) - cam.fit) * k;', to: '', web: 'камера' },
  { id: 'page-theme-not-saved', file: 'web/js/app/app.js', from: "$('theme').onchange = (e) => { settings.theme = e.target.value; persist(); applyTheme(); };", to: "$('theme').onchange = (e) => { settings.theme = e.target.value; applyTheme(); };", web: 'темы' },
  { id: 'page-layers-empty', file: 'web/js/app/app.js', from: '    if (!settings.layers.skin && !settings.layers.muscles && !settings.layers.bones) settings.layers.skin = true; // пустая сцена ни к чему\n', to: '', web: 'слои' },
  { id: 'page-drag-offset', file: 'web/js/app/app.js', from: 'custom = IK.drag(custom, drag.name, [p.x, p.y, p.z]).pose;', to: 'custom = IK.drag(custom, drag.name, [p.x, p.y - 0.25, p.z]).pose;', web: 'своя поза' },
  { id: 'page-hub-ignored', file: 'web/js/app/app.js', from: "    if (e.data && e.data.mix === 'theme')", to: '    if (false)', web: 'Хаб' },
  { id: 'page-lang-title', file: 'web/js/app/app.js', from: "    document.title = I.t('title');\n", to: '', web: 'язык' },
  { id: 'page-scrub-ignored', file: 'web/js/app/app.js', from: '    player.time = (Number(scrub.value) / 1000) * player.mv.dur;', to: '', web: 'пауза, скорость' },
  { id: 'page-narrow-menu', file: 'web/css/style.css', from: '  #moves { order: 3; flex-basis: 100%; flex-wrap: nowrap; overflow-x: auto;', to: '  #moves { order: 3; flex-basis: 100%; flex-wrap: wrap;', web: 'узкое окно' },
  { id: 'page-pose-cache-grows', file: 'web/js/app/app.js', from: 'if (!poseAn || poseAn.version !== customVersion) poseAn =', to: 'if (!poseAn || poseAn.version !== customVersion) cache.set(customVersion, 1), poseAn =', web: 'своя поза' },
  { id: 'page-no-webgl-crash', file: 'web/js/app/app.js', from: "    GB.app = { state: () => ({ error: 'webgl' }) };\n    return;", to: '    throw e;', web: 'без WebGL' },
  { id: 'page-kick-ball-hidden', file: 'web/js/app/app.js', from: '      ball.visible = ph < pr.hit + 0.3 || ph > 0.95;', to: '      ball.visible = false;', web: 'предметы' },
  { id: 'page-bar-hidden', file: 'web/js/app/app.js', from: '    barGroup.visible = !!(mv && mv.hang);', to: '    barGroup.visible = false;', web: 'предметы' },
];

function run(m, dir) {
  const env = { ...process.env, GB_WEB: path.join(dir, 'web'), GB_ELECTRON: path.join(dir, 'electron') };
  let r;
  if (m.unit) {
    const files = fs.readdirSync(path.join(ROOT, 'tests', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('tests', 'unit', f));
    r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern', m.unit, ...files], { cwd: ROOT, env, encoding: 'utf8', timeout: 900000 });
  } else {
    const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
    r = spawnSync(process.execPath, [cli, 'test', '-g', m.web, '--workers=1', '--reporter=line', '--retries=0'], { cwd: ROOT, env, encoding: 'utf8', timeout: 1200000 });
  }
  return r.status;
}

if (process.argv.includes('--check')) {
  let bad = 0;
  for (const m of MUTANTS) {
    const n = fs.readFileSync(path.join(ROOT, m.file), 'utf8').split(m.from).length - 1;
    if (n !== 1) { bad++; console.log(`${m.id}: найдено ${n}`); }
  }
  console.log(`мутантов ${MUTANTS.length}, не на месте ${bad}`);
  process.exit(bad ? 1 : 0);
}

const filter = process.env.GB_MUT ? new RegExp(process.env.GB_MUT) : null;
const list = MUTANTS.filter((m) => !filter || filter.test(m.id));
const rows = [];
let bad = 0;
for (const m of list) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goingboy-mut-'));
  try {
    fs.cpSync(path.join(ROOT, 'web'), path.join(dir, 'web'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'electron'), path.join(dir, 'electron'), { recursive: true });
    const file = path.join(dir, m.file);
    const text = fs.readFileSync(file, 'utf8');
    const n = text.split(m.from).length - 1;
    if (n !== 1) { rows.push([m.id, `НЕ НАЙДЕНО (${n})`]); bad++; console.log(rows[rows.length - 1].join(': ')); continue; }
    fs.writeFileSync(file, text.replace(m.from, m.to));
    const t0 = Date.now();
    const status = run(m, dir);
    const killed = status !== 0;
    if (!killed) bad++;
    rows.push([m.id, `${killed ? 'убит' : 'ВЫЖИЛ'} (${m.unit ? 'node' : 'страница'}, ${Math.round((Date.now() - t0) / 1000)} с)`]);
    console.log(rows[rows.length - 1].join(': '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nмутантов ${list.length}, убито ${list.length - bad}`);
for (const [id, res] of rows) if (!/^убит/.test(res)) console.log('  ' + id + ': ' + res);
process.exit(bad ? 1 : 0);
