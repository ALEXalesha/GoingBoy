// Законы своей позы: IK достаёт цель или ближайшую точку, не выворачивает суставы, не трогает
// чужие суставы, не уводит в пол.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');
const IK = load('core/ik.js');
const L = load('core/limb.js');

const NAMES = Object.keys(IK.HANDLES);

/** Случайная поза цепочки ручки в пределах (остальное - стойка). */
function chainPose(name, r, base = K.restPose()) {
  const p = K.clone(base);
  for (const i of IK.HANDLES[name].dofs) { const d = S.DOFS[i]; p.a[i] = d.min + r() * (d.max - d.min); }
  return p;
}

test('достижимая цель: IK доходит до неё ближе 1 см почти всегда, суставы в пределах', () => {
  const r = rng(SEED + 40);
  let ok = 0, n = 0;
  for (const name of NAMES) {
    for (let k = 0; k < 60; k++) {
      const goalPose = chainPose(name, r);
      const target = IK.effector(goalPose, name);
      if (target[1] < IK.FLOOR[name]) continue;
      const res = IK.drag(K.restPose(), name, target);
      n++;
      if (res.dist < 0.01) ok++;
      assert.deepEqual(K.violations(res.pose), [], `${name}: выворот`);
    }
  }
  assert.ok(ok / n >= 0.95, `дошёл в ${ok} из ${n}`);
});

test('недостижимая цель: рука вытягивается к ней - ближайшая точка, не хуже начала', () => {
  const r = rng(SEED + 41);
  for (const name of ['hand_L', 'hand_R']) {
    const sh = S.BONE['upperarm_' + name.slice(-1)].index;
    for (let k = 0; k < 30; k++) {
      const dir = V.norm([(r() - 0.5) * 1.2 + (name === 'hand_L' ? 0.5 : -0.5), r() * 0.8 - 0.1, r() * 0.8 + 0.4]);
      const start = K.restPose();
      const base = K.fk(start).pos[sh];
      const target = V.add(base, V.scale(dir, 1.6 + r()));
      const before = V.dist(IK.effector(start, name), target);
      const res = IK.drag(start, name, target);
      assert.ok(res.dist <= before + 1e-9, 'хуже, чем было');
      // кисть вытянута к цели: от плеча до неё почти вся длина руки (плечо+предплечье+8 см кисти)
      const reach = V.dist(K.fk(res.pose).pos[sh], IK.effector(res.pose, name));
      assert.ok(reach > 0.30 + 0.26 + 0.08 - 0.03, `рука не вытянута: ${reach.toFixed(3)}`);
      assert.deepEqual(K.violations(res.pose), []);
    }
  }
});

test('IK двигает только свою цепочку и не тащит ручку в пол', () => {
  const r = rng(SEED + 42);
  for (const name of NAMES) {
    const start = K.restPose();
    const target = [r() - 0.5, -0.3, r() - 0.5];
    const res = IK.drag(start, name, target);
    assert.ok(res.target[1] >= IK.FLOOR[name], 'цель поднята на пол');
    S.DOFS.forEach((d, i) => {
      if (!IK.HANDLES[name].dofs.includes(i)) assert.equal(res.pose.a[i], start.a[i], `${name} тронул ${d.key}`);
    });
    assert.ok(IK.effector(res.pose, name)[1] >= IK.FLOOR[name] - 0.01, 'ручка не в полу');
  }
});

test('нога IK = аналитическая постановка ноги: та же точка голеностопа достигается', () => {
  const r = rng(SEED + 43);
  for (let k = 0; k < 40; k++) {
    const p = K.restPose();
    const ankle = [0.09 + (r() - 0.5) * 0.3, 0.25 + r() * 0.4, (r() - 0.5) * 0.5];
    const err = L.reach(p, 'leg_L', ankle);
    if (err > 1e-6 || K.violations(p).length) continue;
    const target = K.point(K.fk(p), S.BONE.foot_L.index, [0, -0.04, 0.05]);
    const res = IK.drag(K.restPose(), 'foot_L', target);
    assert.ok(res.dist < 0.01, `не дошёл: ${res.dist}`);
  }
});

test('пока руки хватает, корпус почти не гнётся: сначала тянется сама рука', () => {
  const r = rng(SEED + 44);
  const spine = ['lumbar.flex', 'lumbar.lat', 'thoracic.flex', 'thoracic.lat'].map((k) => S.DOF[k]);
  let calm = 0, n = 0;
  for (const name of ['hand_L', 'hand_R']) {
    const s = name.slice(-1);
    for (let k = 0; k < 60; k++) {
      // цель - куда кисть достаёт одной рукой (позвоночник и ключица в покое)
      const p = K.restPose();
      for (const key of [`shoulder_${s}.flex`, `shoulder_${s}.abd`, `elbow_${s}.flex`]) { const d = S.DOFS[S.DOF[key]]; p.a[S.DOF[key]] = d.min + r() * (d.max - d.min) * 0.8; }
      const target = IK.effector(p, name);
      if (target[1] < 0.2) continue;
      const res = IK.drag(K.restPose(), name, target);
      n++;
      if (res.dist < 0.01 && spine.every((i) => Math.abs(res.pose.a[i]) < 6)) calm++;
    }
  }
  assert.ok(calm / n >= 0.85, `корпус спокоен в ${calm} из ${n}`);
});
