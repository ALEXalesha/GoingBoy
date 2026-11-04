// Законы мышц: геометрия лент согласна с тем, что про мышцу написано.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, randomPose, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');
const M = load('body/muscles.js');
const Ld = load('core/load.js');
const A = load('core/anim.js');
const { MOVES } = load('core/moves.js');

test('мышцы: 25 на сторону, у каждой есть действие и сила, левая и правая зеркальны', () => {
  assert.equal(M.MUSCLES.length, 50);
  for (const m of M.MUSCLES) {
    assert.ok(m.fmax > 0 && Object.keys(m.act).length > 0, m.id);
    for (const k of Object.keys(m.act)) assert.ok(k in S.DOF, `${m.id}: ${k}`);
  }
  const f = K.fk(K.restPose());
  const P = Ld.paths(K.restPose(), f);
  for (const m of M.MUSCLES.filter((x) => x.side === 'L')) {
    const r = M.MUSCLE[m.base + '_R'];
    P[M.MUSCLE[m.id]].forEach((q, k) => {
      const w = P[r][k];
      assert.ok(Math.abs(q[0] + w[0]) < 1e-9 && Math.abs(q[1] - w[1]) < 1e-9 && Math.abs(q[2] - w[2]) < 1e-9, m.id);
    });
  }
});

test('мышцы: лента пересекает каждый сустав, который объявлен в действии', () => {
  M.MUSCLES.forEach((m, mi) => {
    for (const k of Object.keys(m.act)) assert.ok(Ld.CROSS[mi].includes(S.DOF[k]), `${m.id} не пересекает ${k}`);
  });
});

test('плечо мышцы = -dL/dθ: совпадает с конечной разностью длины ленты', () => {
  const r = rng(SEED + 20);
  for (let n = 0; n < 40; n++) {
    const p = randomPose(K, S, r, 0.7);
    const arms = Ld.momentArms(p);
    const L0 = Ld.paths(p).map(Ld.pathLength);
    for (let mi = 0; mi < Ld.NM; mi += 3) {
      for (const { dof, r: arm } of arms[mi]) {
        const h = 0.05;
        const q = K.clone(p); q.a[dof] += h;
        const L1 = Ld.pathLength(Ld.paths(q)[mi]);
        // поворот на угол меняет длину на -плечо*угол (с точностью до кривизны)
        const fd = -(L1 - L0[mi]) / (h * V.DEG);
        assert.ok(Math.abs(fd - arm) < Math.max(1e-3, 0.02 * Math.abs(arm)), `${M.MUSCLES[mi].id} ${S.DOFS[dof].key}: ${arm} vs ${fd}`);
      }
    }
  }
});

// Главный закон мышц: знак плеча по объявленному действию верен в стойке и во всех кадрах
// всех движений (где плечо заметно, больше 3 мм) - подпись «сгибает колено» не врёт.
test('действие мышцы из подписи совпадает со знаком её плеча во всех позах движений', () => {
  const poses = [K.restPose()];
  for (const m of MOVES) { const mv = A.compile(m); for (let i = 0; i < 48; i++) poses.push(A.sample(mv, i / 48)); }
  const bad = new Map();
  for (const p of poses) {
    const arms = Ld.momentArms(p);
    M.MUSCLES.forEach((m, mi) => {
      for (const { dof, r } of arms[mi]) {
        const want = m.act[S.DOFS[dof].key];
        if (!want || !M.claimHolds(want, p, dof)) continue;
        if (Math.sign(r) !== want.sign && Math.abs(r) > 0.003) {
          const key = `${m.id} ${S.DOFS[dof].key}`;
          bad.set(key, Math.max(bad.get(key) || 0, Math.abs(r)));
        }
      }
    });
  }
  assert.deepEqual([...bad].map(([k, v]) => `${k} (${(v * 1000).toFixed(0)} мм)`), []);
});

test('в стойке плечи главных действий верного знака и не меньше 1 см', () => {
  const p = K.restPose();
  const arms = Ld.momentArms(p);
  const weak = [];
  M.MUSCLES.forEach((m, mi) => {
    for (const { dof, r } of arms[mi]) {
      const want = m.act[S.DOFS[dof].key];
      if (want && (Math.sign(r) !== want.sign || Math.abs(r) < 0.01)) weak.push(`${m.id} ${S.DOFS[dof].key} ${(r * 1000).toFixed(1)} мм`);
    }
  });
  assert.deepEqual(weak, []);
});
