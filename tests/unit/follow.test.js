// Законы режима «за курсором»: человечек идёт к игрушке, ползёт к низкой, тянется рукой,
// приседает и подпрыгивает - всегда в пределах суставов, над полом, без телепортов.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');
const IK = load('core/ik.js');
const F = load('core/follow.js');

const DT = 1 / 30;
const REST = K.boneLengths(K.fk(K.restPose()));

/** Прогнать: цель - функция времени. Возвращает кадры { p, st, target }. */
function run(target, seconds, st = F.create()) {
  const out = [];
  for (let t = 0; t < seconds; t += DT) {
    const tg = target(t);
    const p = F.step(st, tg, DT);
    out.push({ p, mode: st.mode, target: tg, pos: st.pos.slice() });
  }
  return out;
}

test('за курсором: случайная игрушка 40 с - суставы в пределах, над полом, кости целы, без рывков', () => {
  const r = rng(SEED + 80);
  // игрушка гуляет плавно: случайные точки, между ними - по прямой за 1.5 с
  const pts = Array.from({ length: 30 }, () => [(r() - 0.5) * 6, r() * 2.6, (r() - 0.5) * 6]);
  const target = (t) => { const i = Math.floor(t / 1.5), s = (t / 1.5) - i; return V.lerp(pts[i % 30], pts[(i + 1) % 30], s); };
  const frames = run(target, 40);
  const modes = new Set(frames.map((f) => f.mode));
  for (const m of ['walk', 'crawl', 'reach', 'squat', 'kneel']) assert.ok(modes.has(m), 'не было поведения ' + m);
  let prev = null;
  frames.forEach((fr, i) => {
    assert.deepEqual(K.violations(fr.p, 1e-6).map((v) => v.key), [], `кадр ${i} (${fr.mode})`);
    const f = K.fk(fr.p);
    assert.ok(K.lowest(f) > -0.005, `кадр ${i} (${fr.mode}): под полом ${K.lowest(f)}`);
    K.boneLengths(f).forEach((l, k) => assert.ok(Math.abs(l - REST[k]) < 1e-9));
    if (prev) {
      const v = V.dist(prev.root.pos, fr.p.root.pos) / DT;
      assert.ok(v < 6, `кадр ${i}: таз летит ${v.toFixed(1)} м/с`);
    }
    prev = fr.p;
  });
});

test('за курсором: дальняя игрушка - подходит и останавливается рядом, очень дальняя - бежит', () => {
  const frames = run(() => [0, 1.3, 4], 8);
  assert.ok(frames.some((f) => f.mode === 'walk'));
  const last = frames[frames.length - 1];
  const d = Math.hypot(last.pos[0], last.pos[1] - 4);
  assert.ok(d < F.C.REACH + F.C.HYST, 'не подошёл: ' + d);
  const far = run(() => [6, 1.3, 0], 2);
  assert.ok(far.some((f) => f.mode === 'run'), 'к дальней бежит');
  // поворачивается к игрушке: смотрит на +x
  const st = F.create();
  run(() => [6, 1.3, 0], 2, st);
  assert.ok(Math.abs(V.wrapDeg(st.yaw - 90)) < 10, 'смотрит на цель: ' + st.yaw);
});

test('за курсором: низкая игрушка - ползёт к ней, рядом - на четвереньках тянется вниз', () => {
  const frames = run(() => [0, 0.2, 3], 14);
  assert.ok(frames.slice(10, 60).some((f) => f.mode === 'crawl'), 'ползёт');
  const last = frames[frames.length - 1];
  assert.equal(last.mode, 'kneel');
  assert.ok(last.p.root.pos[1] < 0.6, 'таз низко');
});

test('за курсором: рядом по высоте - достаёт рукой, по пояс - приседает, над головой - прыгает', () => {
  const st = F.create();
  run(() => [0.25, 1.4, 0.4], 2, st);
  assert.equal(st.mode, 'reach');
  const hand = (name) => IK.effector(st.last, name);
  const dh = Math.min(V.dist(hand('hand_L'), [0.25, 1.4, 0.4]), V.dist(hand('hand_R'), [0.25, 1.4, 0.4]));
  assert.ok(dh < 0.05, 'кисть у игрушки: ' + dh);
  const sq = F.create();
  run(() => [0.1, 0.6, 0.4], 2, sq);
  assert.equal(sq.mode, 'squat');
  assert.ok(sq.last.root.pos[1] < 0.8, 'присел');
  const hi = F.create();
  const frames = run(() => [0, 2.5, 0.3], 4, hi);
  assert.ok(frames.some((f) => f.mode === 'jump'));
  const airborne = frames.some((f) => K.lowest(K.fk(f.p)) > 0.05);
  assert.ok(airborne, 'отрывается от пола');
});

test('за курсором: на границе порога не дёргается (запас и выдержка)', () => {
  const st = F.create();
  // игрушка колеблется ровно на границе «приседать / тянуться»
  const frames = run((t) => [0.2, F.C.SQUAT + 0.03 * Math.sin(t * 12), 0.4], 6, st);
  let switches = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i].mode !== frames[i - 1].mode) switches++;
  assert.ok(switches <= 3, 'переключений ' + switches);
});
