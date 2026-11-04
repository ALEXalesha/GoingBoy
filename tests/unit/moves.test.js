// Законы движений: на ВСЕХ кадрах ВСЕХ движений углы в пределах суставов, кости не
// растягиваются, ничего не уходит под пол, опора стоит на полу, в полёте центр масс летит
// по параболе, кадры идут без рывков, переходы между движениями тоже чистые.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');
const A = load('core/anim.js');
const { MOVES } = load('core/moves.js');

const N = 240;               // кадров на цикл
const compiled = MOVES.map((m) => A.compile(m));
const frames = new Map(compiled.map((mv) => [mv.id, Array.from({ length: N }, (_, i) => A.sample(mv, i / N))]));
const REST = K.boneLengths(K.fk(K.restPose()));
const L = load('core/limb.js');

/** Выпуклая оболочка точек [x, z] (Эндрю). */
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Расстояние точки внутрь многоугольника (минус - снаружи). */
function inside(poly, q) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
    m = Math.min(m, ((q[0] - a[0]) * ez - (q[1] - a[1]) * ex) / -l);
  }
  return m;
}

test('движения: есть все, у каждого своё имя', () => {
  const ids = MOVES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['walk', 'run', 'jump', 'squat', 'pushup', 'pullup', 'lunge', 'kick', 'throw', 'flip', 'dance']) assert.ok(ids.includes(id), id);
});

for (const mv of compiled) {
  const poses = frames.get(mv.id);

  test(`${mv.id}: углы суставов в анатомических пределах на всех кадрах`, () => {
    const bad = [];
    poses.forEach((p, i) => { for (const v of K.violations(p, 1e-6)) bad.push(`кадр ${i}: ${v.key} = ${v.value.toFixed(2)} (${v.min}..${v.max})`); });
    assert.deepEqual(bad.slice(0, 5), []);
  });

  test(`${mv.id}: длины костей не меняются`, () => {
    for (const p of poses) K.boneLengths(K.fk(p)).forEach((l, i) => assert.ok(Math.abs(l - REST[i]) < 1e-9));
  });

  test(`${mv.id}: ничего не уходит под пол, опора стоит на полу`, () => {
    poses.forEach((p, i) => {
      const f = K.fk(p);
      const low = K.lowest(f);
      assert.ok(low >= -0.005, `кадр ${i}: тело на ${low.toFixed(3)} м под полом`);
      if (mv.ground && !mv.hang && !A.flightAt(mv, i / N)) {
        assert.ok(Math.abs(K.lowest(f, mv.ground)) < 1e-6, `кадр ${i}: опора не на полу`);
      }
    });
  });

  test(`${mv.id}: кадры без рывков, цикл замыкается`, () => {
    const dt = mv.dur / N;
    for (let i = 0; i < N; i++) {
      const a = poses[i], b = poses[(i + 1) % N];
      for (let d = 0; d < K.ND; d++) {
        const w = Math.abs(b.a[d] - a.a[d]) / dt;
        assert.ok(w < 1500, `кадр ${i}: ${S.DOFS[d].key} ${w.toFixed(0)} град/с`);
      }
      const v = V.dist(a.root.pos, b.root.pos) / dt;
      assert.ok(v < 8, `кадр ${i}: таз ${v.toFixed(2)} м/с`);
      for (let k = 0; k < 3; k++) {
        const w = Math.abs(V.wrapDeg(b.root.rot[k] - a.root.rot[k])) / dt;
        assert.ok(w < 1500, `кадр ${i}: корпус ${w.toFixed(0)} град/с`);
      }
    }
  });

  if (mv.def.stance) {
    test(`${mv.id}: в опорной фазе стопа стоит на полу`, () => {
      const windows = mv.def.stance.flatMap(([side, a, b]) => (mv.def.half ? [[side, a, b], [side === 'L' ? 'R' : 'L', a + 0.5, b + 0.5]] : [[side, a, b]]));
      for (const [side, a, b] of windows) {
        const bones = [S.BONE['foot_' + side].index, S.BONE['toes_' + side].index];
        for (let ph = a; ph <= b + 1e-9; ph += 0.01) {
          const low = K.lowest(K.fk(A.sample(mv, ph)), bones);
          assert.ok(low < 0.02, `фаза ${ph.toFixed(2)}: стопа ${side} в ${(low * 100).toFixed(1)} см над полом`);
        }
      }
    });
  }

  if (mv.def.swing) {
    test(`${mv.id}: маховая стопа не цепляет пол`, () => {
      const windows = mv.def.swing.flatMap(([side, a, b]) => (mv.def.half ? [[side, a, b], [side === 'L' ? 'R' : 'L', a + 0.5, b + 0.5]] : [[side, a, b]]));
      for (const [side, a, b] of windows) {
        const bones = [S.BONE['foot_' + side].index, S.BONE['toes_' + side].index];
        for (let ph = a; ph <= b + 1e-9; ph += 0.01) {
          const low = K.lowest(K.fk(A.sample(mv, ph)), bones);
          assert.ok(low > 0.01, `фаза ${ph.toFixed(2)}: маховая стопа ${side} в ${(low * 100).toFixed(1)} см над полом`);
        }
      }
    });
  }

  if (mv.feet.length) {
    test(`${mv.id}: стопа стоит там, где задано, и не скользит`, () => {
      poses.forEach((p, i) => {
        const f = K.fk(p);
        for (const side of mv.feet) {
          const ball = f.pos[S.BONE['toes_' + side].index];
          const ph = i / N;
          if (A.channel(mv, `foot_${side}.ik`, ph, 1) < 1) continue; // нога идёт по углам (замах)
          const want = [A.channel(mv, `foot_${side}.x`, ph), L.BALL_H + A.channel(mv, `foot_${side}.lift`, ph), A.channel(mv, `foot_${side}.z`, ph)];
          assert.ok(V.dist(ball, want) < 0.002, `кадр ${i}: стопа ${side} ушла на ${V.dist(ball, want).toFixed(3)} м`);
        }
      });
    });
  }

  if (mv.pin || mv.hang) {
    test(`${mv.id}: кисти держат опору (перекладину или пол) на месте`, () => {
      const grip = (mv.pin || mv.hang).bones || mv.hang.grip;
      poses.forEach((p, i) => {
        const f = K.fk(p);
        const m = A.gripMid(f, grip);
        if (mv.hang) {
          assert.ok(V.dist(m, mv.hang.bar) < 1e-3, `кадр ${i}: хват мимо перекладины`);
          assert.ok(Math.abs(K.com(f)[2] - mv.hang.bar[2]) < 0.01, `кадр ${i}: центр масс не под перекладиной`);
        } else {
          assert.ok(Math.hypot(m[0] - mv.pin.at[0], m[2] - mv.pin.at[1]) < 1e-3, `кадр ${i}: кисти скользят`);
        }
      });
    });
  }

  if (mv.def.balance) {
    test(`${mv.id}: равновесие - центр масс над площадью опоры`, () => {
      poses.forEach((p, i) => {
        const f = K.fk(p);
        const pts = [];
        for (const c of K.capsules(f)) {
          for (const e of [c.a, c.b]) if (e[1] - c.r < 0.01) for (const [dx, dz] of [[c.r, 0], [-c.r, 0], [0, c.r], [0, -c.r]]) pts.push([e[0] + dx, e[2] + dz]);
        }
        const c = K.com(f);
        const d = inside(hull(pts), [c[0], c[2]]);
        assert.ok(d > 0.01, `кадр ${i}: центр масс ${(-d * 100).toFixed(1)} см за краем опоры`);
      });
    });
  }

  if (mv.flights.length) {
    test(`${mv.id}: в полёте центр масс летит по параболе (ускорение -g)`, () => {
      const h = 0.002;
      const comY = (ph) => K.com(K.fk(A.sample(mv, ph)))[1];
      for (const [a, b] of mv.flights) {
        for (let s = 0.1; s < 0.95; s += 0.1) {
          const ph = a + (b - a) * s;
          const acc = (comY(ph + h) - 2 * comY(ph) + comY(ph - h)) / (h * mv.dur) ** 2;
          assert.ok(Math.abs(acc + A.G) < 0.05, `фаза ${ph.toFixed(3)}: ускорение ${acc.toFixed(2)}`);
        }
        // отрыв без рывка: вертикальная скорость до и после почти одна, и после отрыва тело идёт вверх
        const d = 0.004, T = d * mv.dur;
        const before = (comY(a) - comY(a - d)) / T, after = (comY(a + d) - comY(a)) / T;
        assert.ok(after > 0, `после отрыва вниз: ${after.toFixed(2)} м/с`);
        assert.ok(Math.abs(after - before) < 0.8, `рывок при отрыве: ${before.toFixed(2)} -> ${after.toFixed(2)} м/с`);
        // по горизонтали в полёте скорость постоянна
        const comX = (ph) => K.com(K.fk(A.sample(mv, ph)));
        const v1 = V.sub(comX(a + (b - a) * 0.3), comX(a + (b - a) * 0.2)), v2 = V.sub(comX(a + (b - a) * 0.8), comX(a + (b - a) * 0.7));
        assert.ok(Math.abs(v1[0] - v2[0]) < 1e-6 && Math.abs(v1[2] - v2[2]) < 1e-6, 'горизонтальная скорость в полёте меняется');
      }
    });
  }
}

test('переходы между любыми движениями: в пределах, над полом, кости целы', () => {
  const r = rng(SEED + 10);
  for (const a of compiled) {
    for (const b of compiled) {
      const pl = A.createPlayer();
      A.play(pl, a);
      A.step(pl, r() * a.dur * 2);
      A.play(pl, b);
      for (let t = 0; t <= A.FADE + 0.05; t += 0.02) {
        const p = A.current(pl);
        assert.deepEqual(K.violations(p), [], `${a.id} -> ${b.id}`);
        const low = K.lowest(K.fk(p));
        assert.ok(low >= -0.005, `${a.id} -> ${b.id}: ${low}`);
        K.boneLengths(K.fk(p)).forEach((l, i) => assert.ok(Math.abs(l - REST[i]) < 1e-9));
        A.step(pl, 0.02);
      }
    }
  }
});

test('проигрыватель: пауза держит кадр, скорость растягивает время, неподвижная поза', () => {
  const pl = A.createPlayer();
  assert.deepEqual(K.violations(A.current(pl)), []);
  A.play(pl, compiled[0]);
  A.step(pl, 1);
  pl.paused = true;
  const t = pl.time;
  A.step(pl, 5);
  assert.equal(pl.time, t);
  pl.paused = false; pl.speed = 0.25;
  A.step(pl, 1);
  assert.ok(Math.abs(pl.time - t - 0.25) < 1e-12);
  pl.speed = 1;
  const still = K.poseFrom({ j: { 'knee_L.flex': 40 } });
  A.play(pl, null, still);
  A.step(pl, 1);
  assert.equal(K.get(A.current(pl), 'knee_L.flex'), 40);
  A.play(pl, null);
  A.step(pl, 1);
  assert.equal(K.get(A.current(pl), 'knee_L.flex'), 0);
});

test('сплайн: монотонный - между ключами не выходит за их значения', () => {
  const r = rng(SEED + 11);
  for (let n = 0; n < 200; n++) {
    const k = 3 + Math.floor(r() * 6);
    const ts = Array.from({ length: k }, () => r()).sort();
    const knots = ts.map((t) => [t, Math.round(r() * 100)]);
    const c = A.makeChannel(knots, 0);
    for (let i = 0; i < 200; i++) {
      const ph = i / 200;
      const v = A.evalChannel(c, ph);
      // соседние ключи по кругу
      let j = knots.findIndex(([t]) => t > ph);
      const nxt = j < 0 ? knots[0] : knots[j];
      const prv = j <= 0 ? knots[knots.length - 1] : knots[j - 1];
      assert.ok(v >= Math.min(prv[1], nxt[1]) - 1e-9 && v <= Math.max(prv[1], nxt[1]) + 1e-9, `${v} вне ${prv[1]}..${nxt[1]}`);
    }
    for (const [t, y] of knots) assert.ok(Math.abs(A.evalChannel(c, t) - y) < 1e-9, 'проходит через ключ');
  }
});

test('описание движения с ошибкой в имени канала не принимается', () => {
  assert.throws(() => A.compile({ id: 'x', dur: 1, keys: [{ t: 0, j: { 'knee_X.flex': 1 } }] }));
  assert.throws(() => A.compile({ id: 'x', dur: 1, base: { 'elbow.bend': 1 }, keys: [{ t: 0, j: {} }] }));
});
