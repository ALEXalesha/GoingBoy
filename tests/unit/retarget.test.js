// Законы пересадки позы на модель из Blender: при любых осях покоя костей .glb пересаженная
// поза кладёт каждую кость туда же, куда наш скелет; описание скелета совпадает с покоем.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, randomPose, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');
const R = load('body/retarget.js');

test('пересадка: кости .glb с любыми осями покоя ложатся как наш скелет', () => {
  const r = rng(SEED + 70);
  const rnd = () => V.qNorm([r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5]);
  for (let n = 0; n < 100; n++) {
    const rest = {};
    for (const b of S.BONES) rest[b.name] = rnd();
    // кость .glb: конец в её собственных осях = наш конец, повёрнутый в оси покоя модели
    const tailLocal = {};
    for (const b of S.BONES) tailLocal[b.name] = V.qRot(V.qConj(rest[b.name]), b.tail);
    const p = randomPose(K, S, r);
    const f = K.fk(p);
    const { local, rootPos } = R.retarget(rest, f);
    // собираем мир .glb из локальных поворотов, как это сделает three.js
    const W = {};
    for (const b of S.BONES) W[b.name] = b.parent ? V.qMul(W[b.parent], local[b.name]) : local[b.name];
    for (const b of S.BONES) {
      const ours = V.qRot(f.rot[b.index], b.tail), theirs = V.qRot(W[b.name], tailLocal[b.name]);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(ours[k] - theirs[k]) < 1e-9, b.name);
    }
    assert.deepEqual(rootPos, f.pos[0]);
  }
  assert.throws(() => R.retarget({}, K.fk(K.restPose())), /нет кости/);
});

test('описание скелета: начала и концы костей = стойка из кинематики', () => {
  const d = R.describe();
  const f = K.fk(K.restPose());
  assert.equal(d.length, S.BONES.length);
  for (const b of d) {
    const i = S.BONE[b.name].index;
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(b.head[k] - f.pos[i][k]) < 1e-12);
      assert.ok(Math.abs(b.tail[k] - K.tail(f, i)[k]) < 1e-12);
    }
  }
});
