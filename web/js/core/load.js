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

  return { NM, CROSS, paths, musclePath, pathLength, momentArms };
});
