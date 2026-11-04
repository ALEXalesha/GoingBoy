// Законы скелета и прямой кинематики.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, randomPose, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} != ${b}`);

test('скелет: 21 кость, 20 суставов, у каждой правой кости есть левая', () => {
  assert.equal(S.BONES.length, 21);
  assert.equal(S.JOINTS.length, 20);
  for (const b of S.BONES) if (/_R$/.test(b.name)) assert.ok(S.BONE[b.name.replace(/_R$/, '_L')], b.name);
  const mass = S.BONES.reduce((s, b) => s + b.mass, 0);
  near(mass, 1, 1e-9, 'доли массы');
});

test('пределы суставов: минимум меньше максимума, стойка (все нули) допустима', () => {
  for (const d of S.DOFS) {
    assert.ok(d.min < d.max, d.key);
    assert.ok(d.min <= 0 && d.max >= 0, d.key);
  }
  assert.deepEqual(K.violations(K.restPose()), []);
});

test('длины костей: не меняются ни в какой позе (500 случайных поз)', () => {
  const r = rng(SEED);
  const rest = K.boneLengths(K.fk(K.restPose()));
  for (let n = 0; n < 500; n++) {
    const L = K.boneLengths(K.fk(randomPose(K, S, r)));
    L.forEach((l, i) => near(l, rest[i], 1e-9, `кость ${i}, поза ${n}`));
  }
});

test('стойка: рост 1.75, центр масс на 55-58 % роста, подошвы на полу', () => {
  const f = K.fk(K.restPose());
  const top = Math.max(...K.capsules(f).map((c) => Math.max(c.a[1], c.b[1]) + c.r));
  near(top, 1.75, 0.03, 'рост');
  const c = K.com(f);
  assert.ok(c[1] > 0.55 * 1.75 && c[1] < 0.58 * 1.75, 'центр масс ' + c[1]);
  near(K.lowest(f, S.SOLE_BONES), 0, 0.002, 'подошва');
  near(K.lowest(f), 0, 0.002, 'ниже подошвы ничего нет');
});

test('зеркало: отражённая поза даёт отражённое тело, дважды - исходную позу', () => {
  const r = rng(SEED + 1);
  for (let n = 0; n < 200; n++) {
    const p = randomPose(K, S, r);
    const m = K.mirror(p);
    const f = K.fk(p), g = K.fk(m);
    for (const b of S.BONES) {
      const other = S.BONE[b.name.replace(/_L$/, '_X').replace(/_R$/, '_L').replace(/_X$/, '_R')].index;
      const P = f.pos[b.index], T = K.tail(f, b.index);
      const Q = g.pos[other], U = K.tail(g, other);
      near(Q[0], -P[0], 1e-9, b.name + ' x'); near(Q[1], P[1], 1e-9, b.name + ' y'); near(Q[2], P[2], 1e-9, b.name + ' z');
      near(U[0], -T[0], 1e-9, b.name + ' конец x'); near(U[1], T[1], 1e-9, b.name + ' конец y');
    }
    const mm = K.mirror(m);
    p.a.forEach((v, i) => near(mm.a[i], v, 1e-12, S.DOFS[i].key));
  }
});

// Знаки углов анатомические: проверяем, куда уходит конечность при каждом движении.
function moved(key, angle, bone, at = 'tail', base = {}) {
  const p0 = K.poseFrom({ j: base });
  const p1 = K.poseFrom({ j: { ...base, [key]: angle } });
  const f0 = K.fk(p0), f1 = K.fk(p1);
  const b = S.BONE[bone].index;
  const a = at === 'tail' ? K.tail(f0, b) : K.point(f0, b, at);
  const c = at === 'tail' ? K.tail(f1, b) : K.point(f1, b, at);
  return V.sub(c, a);
}

test('знаки углов: сгибание, отведение, повороты двигают части тела куда положено', () => {
  for (const s of ['L', 'R']) {
    const out = s === 'L' ? 1 : -1; // наружу - +x для левой стороны
    assert.ok(moved(`hip_${s}.flex`, 60, `thigh_${s}`)[2] > 0.2, 'сгибание бедра - колено вперёд');
    assert.ok(moved(`hip_${s}.flex`, -20, `thigh_${s}`)[2] < -0.1, 'разгибание бедра - колено назад');
    assert.ok(moved(`hip_${s}.abd`, 40, `thigh_${s}`)[0] * out > 0.2, 'отведение бедра - наружу');
    assert.ok(moved(`knee_${s}.flex`, 90, `shin_${s}`)[2] < -0.3, 'сгибание колена - голень назад');
    assert.ok(moved(`ankle_${s}.dorsi`, 20, `foot_${s}`)[1] > 0.03, 'тыльное сгибание - носок вверх');
    assert.ok(moved(`ankle_${s}.inv`, 25, `foot_${s}`, [0, -0.08, 0.05])[0] * out < -0.01, 'инверсия - подошва внутрь');
    assert.ok(moved(`toe_${s}.ext`, 40, `toes_${s}`)[1] > 0.02, 'разгибание пальцев - вверх');
    assert.ok(moved(`shoulder_${s}.flex`, 90, `upperarm_${s}`)[2] > 0.25, 'сгибание плеча - рука вперёд');
    assert.ok(moved(`shoulder_${s}.abd`, 90, `upperarm_${s}`)[0] * out > 0.25, 'отведение плеча - в сторону');
    assert.ok(moved(`elbow_${s}.flex`, 90, `forearm_${s}`)[2] > 0.2, 'сгибание локтя - кисть вперёд');
    assert.ok(moved(`wrist_${s}.flex`, 60, `hand_${s}`)[0] * out < -0.1, 'сгибание кисти - к ладони (внутрь)');
    assert.ok(moved(`wrist_${s}.dev`, 20, `hand_${s}`)[2] > 0.04, 'лучевое отведение - к большому пальцу (вперёд)');
    assert.ok(moved(`sc_${s}.elev`, 30, `clavicle_${s}`)[1] > 0.05, 'подъём ключицы');
    assert.ok(moved(`sc_${s}.protr`, 20, `clavicle_${s}`)[2] > 0.03, 'ключица вперёд');
    // повороты вокруг длинной оси - при согнутом локте/колене видно, куда уходит кисть/стопа
    assert.ok(moved(`shoulder_${s}.rot`, 45, `forearm_${s}`, 'tail', { [`elbow_${s}.flex`]: 90 })[0] * out < -0.1, 'внутренний поворот плеча - кисть к животу');
    assert.ok(moved(`hip_${s}.rot`, 30, `shin_${s}`, 'tail', { [`knee_${s}.flex`]: 90 })[0] * out > 0.1, 'внутренний поворот бедра - стопа наружу');
    assert.ok(moved(`elbow_${s}.pron`, 60, `hand_${s}`, [-0.02 * out, -0.1, 0])[2] < -0.01, 'пронация - ладонь (внутренняя сторона кисти) уходит назад');
  }
  assert.ok(moved('lumbar.flex', 30, 'head')[2] > 0.2, 'наклон вперёд');
  assert.ok(moved('lumbar.lat', 20, 'head')[0] > 0.15, 'наклон влево');
  assert.ok(moved('thoracic.rot', 30, 'clavicle_L')[2] < -0.05, 'поворот влево - левое плечо назад');
  assert.ok(moved('neck.rot', 45, 'head', [0, 0.1, 0.1])[0] > 0.05, 'поворот головы влево');
  assert.ok(moved('neck.flex', 30, 'head')[2] > 0.05, 'кивок вперёд');
});

test('якобиан совпадает с конечной разностью', () => {
  const r = rng(SEED + 2);
  for (let n = 0; n < 60; n++) {
    const p = randomPose(K, S, r, 0.8);
    const f = K.fk(p);
    const axes = K.dofAxes(p, f);
    for (let i = 0; i < K.ND; i++) {
      const b = Math.floor(r() * K.NB);
      const local = [r() - 0.5, r() - 0.5, r() - 0.5].map((x) => x * 0.2);
      const w = K.point(f, b, local);
      const d = K.dPoint(axes, i, b, w);
      const h = 1e-4;
      const p2 = K.clone(p); p2.a[i] += h / V.DEG;
      const w2 = K.point(K.fk(p2), b, local);
      for (let k = 0; k < 3; k++) near(d[k], (w2[k] - w[k]) / h, 2e-4, `${S.DOFS[i].key} кость ${b}`);
    }
  }
});

test('смешивание: края - сами позы, корпус по короткой дуге, пределы держатся', () => {
  const r = rng(SEED + 3);
  for (let n = 0; n < 100; n++) {
    const a = randomPose(K, S, r), b = randomPose(K, S, r);
    const m0 = K.blend(a, b, 0), m1 = K.blend(a, b, 1);
    a.a.forEach((v, i) => near(m0.a[i], v, 1e-9, 'w=0'));
    b.a.forEach((v, i) => near(m1.a[i], v, 1e-9, 'w=1'));
    for (let k = 0; k < 3; k++) near(V.wrapDeg(m1.root.rot[k] - b.root.rot[k]), 0, 1e-9, 'корпус');
    assert.deepEqual(K.violations(K.blend(a, b, r())), []);
  }
  const a = K.poseFrom({ root: { rot: [0, 350, 0] } }), b = K.poseFrom({ root: { rot: [0, 10, 0] } });
  near(K.blend(a, b, 0.5).root.rot[1], 360, 1e-9, 'через 360, а не назад через 180');
  // вращение вокруг своей оси: лёжа лицом вниз (тангаж 90) +90 кладёт тело на правый бок
  const side = K.fk(K.poseFrom({ root: { pos: [0, 1, 0], rot: [0, 90, 0, 90] } }));
  const sh = V.sub(side.pos[S.BONE.upperarm_L.index], side.pos[S.BONE.upperarm_R.index]);
  assert.ok(sh[1] > 0.3, 'левое плечо вверху');
});

test('пределы: нарушения находятся и обрезаются', () => {
  const p = K.poseFrom({ j: { 'knee_L.flex': -10, 'elbow_R.flex': 170 } });
  assert.deepEqual(K.violations(p).map((v) => v.key).sort(), ['elbow_R.flex', 'knee_L.flex']);
  const c = K.clampPose(p);
  assert.equal(K.get(c, 'knee_L.flex'), 0);
  assert.equal(K.get(c, 'elbow_R.flex'), 150);
  assert.deepEqual(K.violations(c), []);
  assert.throws(() => K.poseFrom({ j: { 'tail.wag': 1 } }));
  assert.equal(K.get(K.set(K.restPose(), 'knee_R.flex', 12), 'knee_R.flex'), 12);
});

test('векторы и кватернионы: поворот сохраняет длину, slerp и угол', () => {
  const r = rng(SEED + 4);
  for (let n = 0; n < 100; n++) {
    const q = V.qNorm([r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5]);
    const v = [r(), r(), r()];
    near(V.len(V.qRot(q, v)), V.len(v), 1e-9, 'длина');
    near(V.qAngle(V.qSlerp(V.QI, q, 0.5), V.QI) * 2, V.qAngle(q, V.QI), 1e-6, 'slerp пополам');
    const back = V.qRot(V.qConj(q), V.qRot(q, v));
    for (let k = 0; k < 3; k++) near(back[k], v[k], 1e-9, 'обратный');
  }
  near(V.qAngle(V.qSlerp(V.QI, V.qAxis([0, 1, 0], 1e-4), 0.5), V.QI), 5e-5, 1e-9, 'малые углы');
  near(V.qAngle(V.qSlerp(V.QI, [0, 0, 0, -1], 0.3), V.QI), 0, 1e-9, 'q и -q - один поворот');
  assert.deepEqual(V.norm([0, 0, 0]), [0, 0, 0]);
  assert.equal(V.wrapDeg(180), 180);
  assert.equal(V.wrapDeg(-180), -180);
  assert.equal(V.wrapDeg(540), 180);
  assert.equal(V.wrapDeg(-190), 170);
  assert.equal(V.dot(V.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]), 1);
});
