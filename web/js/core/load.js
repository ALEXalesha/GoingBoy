// Нагрузка и работа мышц - то, ради чего подсветка не «наугад».
//
// 1. Мышца: длина ленты L по её точкам в мире; плечо по каждой степени свободы r = -dL/dθ
//    (м/рад, точно через якобиан). Знак плеча сам говорит, что мышца делает в этой позе.
// 2. Внешние силы: вес сегментов, их инерция (ускорения - разностью соседних кадров) и опоры
//    (пол, перекладина). Опоры несут вес и инерцию всего тела; сила делится между ними по
//    близости к центру масс.
// 3. Нужный от мышц момент по степени свободы: tau = -Q, где Q - обобщённая сила внешних сил
//    (сумма dP/dθ · F по всем точкам, к которым приложены силы, ниже сустава по цепочке от таза).
// 4. Активация: по каждой степени свободы момент делят мышцы, чьё плечо совпадает с ним по
//    знаку, пропорционально r·Fmax (так сумма квадратов активаций наименьшая). Антагонист в
//    этой степени свободы получает ноль. Активация мышцы - сумма по суставам, не больше 1.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vec.js'), require('../body/skeleton.js'), require('./kinematics.js'), require('../body/muscles.js'));
  else (root.GB = root.GB || {}).Load = factory(root.GB.Vec, root.GB.Skeleton, root.GB.Kin, root.GB.Muscles);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S, K, M) {
  'use strict';

  const NM = M.MUSCLES.length;

  // Какие степени свободы мышца вообще пересекает: часть её точек ниже сустава, часть выше
  const CROSS = M.MUSCLES.map((m) => {
    const bones = m.path.filter((p) => !p.wrap).map((p) => p.bone);
    const out = [];
    S.DOFS.forEach((d, i) => {
      const below = bones.filter((b) => K.inSubtree(d.bone, b)).length;
      if (below > 0 && below < bones.length) out.push(i);
    });
    return out;
  });

  /**
   * Направление огибания: родитель, повёрнутый на половину углов сустава. Половина берётся
   * у каждой степени свободы, а не у итогового поворота - так нет разрыва у 180 градусов.
   */
  function wrapDir(p, f, e) {
    return V.qRot(V.qMul(f.rot[S.PARENT[e.bone]], K.localRot(p, e.bone, 0.5)), e.dir);
  }

  /**
   * Точки ленты одной мышцы в мире. Огибание условное: если прямая между соседними точками
   * проходит от центра сустава дальше радиуса (со стороны огибания), лента идёт прямо и точки
   * огибания нет; иначе ближайшая точка прямой выталкивается на радиус. Длина при этом
   * меняется непрерывно.
   */
  function musclePath(p, f, m) {
    const fixed = m.path.map((e) => (e.wrap ? null : K.point(f, e.bone, e.at)));
    const out = [];
    m.path.forEach((e, k) => {
      if (!e.wrap) { out.push(fixed[k]); return; }
      const A = out[out.length - 1], B = fixed.slice(k + 1).find((x) => x);
      const C = f.pos[e.bone], n = wrapDir(p, f, e);
      const ab = V.sub(B, A);
      const t = Math.max(0, Math.min(1, V.dot(V.sub(C, A), ab) / V.dot(ab, ab)));
      const X = V.add(A, V.scale(ab, t));
      const d = V.dot(V.sub(X, C), n);
      if (d < e.r) out.push(V.add(X, V.scale(n, e.r - d)));
    });
    return out;
  }

  /** Точки лент всех мышц в мире. */
  const paths = (p, f = K.fk(p)) => M.MUSCLES.map((m) => musclePath(p, f, m));

  const pathLength = (pts) => pts.reduce((s, q, k) => (k ? s + V.dist(pts[k - 1], q) : 0), 0);

  const H = 0.25; // шаг разности, градусы

  /**
   * Плечи мышц: arms[m] = [{ dof, r }] по пересекаемым степеням свободы, r в метрах на радиан,
   * знак - в направлении угла (+ - мышца тянет угол вверх). Центральная разность длины ленты.
   */
  function momentArms(p) {
    const arms = M.MUSCLES.map(() => []);
    const byDof = S.DOFS.map(() => []);
    CROSS.forEach((list, mi) => list.forEach((i) => byDof[i].push(mi)));
    byDof.forEach((ms, i) => {
      if (!ms.length) return;
      const q = K.clone(p);
      const qp = K.clone(p); qp.a[i] = p.a[i] + H; const fp = K.fk(qp);
      q.a[i] = p.a[i] - H; const fm = K.fk(q);
      for (const mi of ms) {
        const dL = (pathLength(musclePath(qp, fp, M.MUSCLES[mi])) - pathLength(musclePath(q, fm, M.MUSCLES[mi]))) / (2 * H * V.DEG);
        arms[mi].push({ dof: i, r: -dL });
      }
    });
    return arms;
  }


  // ---------------- опоры и моменты ----------------
  const GRAV = [0, -9.81, 0];
  const FLOOR_TOL = 0.025;   // на сколько над полом кость ещё считается опорой, м
  const BAR_TOL = 0.05;      // хват на перекладине
  const TAU_MIN = 0.5;       // Н·м: меньше - шум, мышцы не зовём

  /**
   * Точки опоры: концы капсул у пола (у стопы - пятка и подушечка отдельно, так опора может
   * перекатываться) и кисти на перекладине. Перекладина - линия вдоль x через env.bar.
   */
  function contacts(f, env = {}) {
    const out = [];
    for (const c of K.capsules(f)) {
      for (const e of [c.a, c.b]) {
        const y = e[1] - c.r;
        if (y < FLOOR_TOL) out.push({ bone: c.bone, point: [e[0], Math.max(0, y), e[2]], floor: true });
      }
    }
    if (env.bar) {
      for (const n of ['hand_L', 'hand_R']) {
        const b = S.BONE[n].index;
        const g = K.point(f, b, [0, -0.08, 0]);
        if (Math.hypot(g[1] - env.bar[1], g[2] - env.bar[2]) < BAR_TOL) out.push({ bone: b, point: g, floor: false });
      }
    }
    return out;
  }

  /** Решить квадратную систему (Гаусс с выбором ведущего). */
  function solve(Am, b) {
    const n = b.length, a = Am.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      [a[c], a[piv]] = [a[piv], a[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const k = a[r][c] / a[c][c];
        for (let q = c; q <= n; q++) a[r][q] -= k * a[c][q];
      }
    }
    return a.map((r, i) => r[n] / r[i]);
  }

  /**
   * Силы опор: наименьшие по сумме квадратов, которые дают телу нужную силу R и нужный
   * момент Mc вокруг центра масс. Пол только толкает: опора, которую тянуло бы вниз,
   * выключается, и остальные пересчитываются.
   */
  function contactForces(list, R, com, Mc = [0, 0, 0]) {
    let on = list.map(() => true);
    for (let round = 0; round <= list.length; round++) {
      const idx = list.map((c, k) => k).filter((k) => on[k]);
      if (!idx.length) return list.map(() => [0, 0, 0]);
      const cols = [];
      for (const k of idx) {
        const r = V.sub(list[k].point, com);
        for (let d = 0; d < 3; d++) {
          const e = [0, 0, 0]; e[d] = 1;
          cols.push([...e, ...V.cross(r, e)]);
        }
      }
      const b = [...R, ...Mc];
      // A A^T x = b, F = A^T x; малая добавка на диагональ: одной опорой момент не создать
      const AAt = [];
      for (let i = 0; i < 6; i++) {
        AAt.push([]);
        for (let j = 0; j < 6; j++) AAt[i].push(cols.reduce((s, col) => s + col[i] * col[j], 0) + (i === j ? (i < 3 ? 1e-9 : 1e-4) : 0));
      }
      const x = solve(AAt, b);
      const out = list.map(() => [0, 0, 0]);
      idx.forEach((k, n) => { out[k] = [0, 1, 2].map((d) => cols[n * 3 + d].reduce((s, v, i) => s + v * x[i], 0)); });
      const bad = idx.filter((k) => list[k].floor && out[k][1] < 0);
      if (!bad.length) return out;
      for (const k of bad) on[k] = false;
    }
    /* c8 ignore next */
    return list.map(() => [0, 0, 0]);
  }

  /**
   * Нагрузка на кадре. prev/pose/next - позы через h секунд (для ускорений), env - { bar }.
   * Возвращает: опоры с силами, нужный момент мышц tau по каждой степени свободы (Н·м),
   * плечи, активацию каждой мышцы 0..1 и скорость изменения длины (м/с, + удлиняется).
   */
  function analyze({ prev, pose, next, h, env }) {
    const fp = K.fk(prev), f = K.fk(pose), fn = K.fk(next);
    const segs = [];
    let M_ = 0, Rsum = [0, 0, 0];
    for (let b = 0; b < S.BONES.length; b++) {
      const m = S.BONES[b].mass * S.MASS;
      if (!m) continue;
      const c = K.segmentCom(f, b);
      const acc = V.scale(V.add(V.sub(K.segmentCom(fn, b), V.scale(c, 2)), K.segmentCom(fp, b)), 1 / (h * h));
      const F = V.scale(V.sub(GRAV, acc), m);              // вес и сила инерции (Даламбер)
      segs.push({ bone: b, point: c, F });
      M_ += m;
      Rsum = V.sub(Rsum, F);                               // опоры должны дать минус сумму
    }
    const com = K.com(f);
    // момент, который опоры должны дать вокруг центра масс: против момента сил веса и инерции
    let Mc = [0, 0, 0];
    for (const sgm of segs) Mc = V.sub(Mc, V.cross(V.sub(sgm.point, com), sgm.F));
    const list = contacts(f, env);
    const forces = contactForces(list, Rsum, com, Mc);
    list.forEach((c, k) => { c.force = forces[k]; });
    const axes = K.dofAxes(pose, f);
    const tau = new Float64Array(K.ND);
    for (let i = 0; i < K.ND; i++) {
      let Q = 0;
      for (const sgm of segs) Q += V.dot(K.dPoint(axes, i, sgm.bone, sgm.point), sgm.F);
      for (const c of list) Q += V.dot(K.dPoint(axes, i, c.bone, c.point), c.force);
      tau[i] = -Q;
    }
    const arms = momentArms(pose);
    const act = activation(tau, arms);
    const Lp = paths(prev, fp).map(pathLength), Ln = paths(next, fn).map(pathLength);
    const vel = Lp.map((l, mi) => (Ln[mi] - l) / (2 * h));
    return { f, com, contacts: list, tau, arms, act, vel, mass: M_ };
  }

  /**
   * Активация: по каждой степени свободы момент делят мышцы того же знака плеча,
   * пропорционально r·Fmax (наименьшая сумма квадратов активаций).
   */
  function activation(tau, arms) {
    const per = new Float64Array(NM);
    const byDof = S.DOFS.map(() => []);
    arms.forEach((list, mi) => list.forEach(({ dof, r }) => byDof[dof].push([mi, r * M.MUSCLES[mi].fmax])));
    byDof.forEach((list, i) => {
      const t = tau[i];
      if (!M.DRIVEN[i] || Math.abs(t) < TAU_MIN) return;
      const ag = list.filter(([, k]) => k * t > 0);
      const den = ag.reduce((s, [, k]) => s + k * k, 0);
      if (!den) return;
      for (const [mi, k] of ag) per[mi] += (t * k) / den;
    });
    for (let mi = 0; mi < NM; mi++) per[mi] = Math.min(1, Math.max(0, per[mi]));
    return per;
  }

  /** Нагрузка в момент t для любой функции позы от времени (движение, переход, своя поза). */
  function analyzeAt(sample, t, h = 0.03, env = {}) {
    return analyze({ prev: sample(t - h), pose: sample(t), next: sample(t + h), h, env });
  }

  /** Что мышца делает сейчас: 'rest' | 'shorten' (работает, сокращаясь) | 'hold' (держит) | 'brake' (тормозит, удлиняясь). */
  function state(act, vel) {
    if (act < 0.05) return 'rest';
    if (vel < -0.01) return 'shorten';
    if (vel > 0.01) return 'brake';
    return 'hold';
  }

  return { NM, CROSS, TAU_MIN, paths, musclePath, pathLength, momentArms, contacts, contactForces, analyze, analyzeAt, activation, state };
});
