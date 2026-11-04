// Своя поза мышью: тянешь кисть, стопу или голову - тело подстраивается.
//
// Обратная кинематика методом наименьших квадратов с затуханием (DLS): шаг углов
// dθ = Wᵀ Jᵀ (J W Jᵀ + λ² I)⁻¹ e по цепочке от захваченной точки к тазу; после каждого шага
// углы обрезаются пределами суставов, поэтому колено и локоть никогда не выворачиваются.
// Позвоночник и ключица в цепочке с меньшим весом: сначала тянется сама рука, корпус
// помогает, когда руки не хватает. Цель ниже пола поднимается на пол. Если цель не достать,
// конечность вытягивается к ней - ближайшая достижимая точка.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vec.js'), require('../body/skeleton.js'), require('./kinematics.js'), require('./limb.js'));
  else (root.GB = root.GB || {}).IK = factory(root.GB.Vec, root.GB.Skeleton, root.GB.Kin, root.GB.Limb);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S, K, L) {
  'use strict';

  // Ручки, за которые можно тянуть: кость, точка на ней, суставы цепочки и их вес
  const SPINE = { lumbar: 0.03, thoracic: 0.05 };
  const HANDLES = {};
  for (const s of ['L', 'R']) {
    HANDLES['hand_' + s] = { bone: 'hand_' + s, at: [0, -0.08, 0], limb: 'arm_' + s, joints: { [`elbow_${s}`]: 1, [`shoulder_${s}`]: 1, [`sc_${s}`]: 0.1, ...SPINE } };
    HANDLES['foot_' + s] = { bone: 'foot_' + s, at: [0, -0.04, 0.05], limb: 'leg_' + s, joints: { [`knee_${s}`]: 1, [`hip_${s}`]: 1, [`ankle_${s}`]: 0.2 } };
  }
  HANDLES.head = { bone: 'head', at: [0, 0.1, 0.02], joints: { neck: 1, atlas: 0.5, ...SPINE } };
  for (const h of Object.values(HANDLES)) {
    h.boneIndex = S.BONE[h.bone].index;
    h.dofs = [];
    h.w = [];
    S.DOFS.forEach((d, i) => { if (d.joint in h.joints && !/\.(rot|pron|inv|dev|protr)$/.test(d.key)) { h.dofs.push(i); h.w.push(h.joints[d.joint]); } });
  }

  function solve3(A, b) {
    const [a, c, d] = A;
    const det = a[0] * (c[1] * d[2] - c[2] * d[1]) - a[1] * (c[0] * d[2] - c[2] * d[0]) + a[2] * (c[0] * d[1] - c[1] * d[0]);
    const inv = [
      [(c[1] * d[2] - c[2] * d[1]) / det, (a[2] * d[1] - a[1] * d[2]) / det, (a[1] * c[2] - a[2] * c[1]) / det],
      [(c[2] * d[0] - c[0] * d[2]) / det, (a[0] * d[2] - a[2] * d[0]) / det, (a[2] * c[0] - a[0] * c[2]) / det],
      [(c[0] * d[1] - c[1] * d[0]) / det, (a[1] * d[0] - a[0] * d[1]) / det, (a[0] * c[1] - a[1] * c[0]) / det],
    ];
    return inv.map((row) => row[0] * b[0] + row[1] * b[1] + row[2] * b[2]);
  }

  /** Где сейчас точка ручки. */
  const effector = (p, name) => K.point(K.fk(p), HANDLES[name].boneIndex, HANDLES[name].at);

  /** Наименьшая высота цели над полом: точку ручки нельзя утащить в пол. */
  const FLOOR = { foot_L: 0.045, foot_R: 0.045, hand_L: 0.03, hand_R: 0.03, head: 0.1 };

  /**
   * Потянуть ручку name к точке target. Возвращает { pose, dist, target }: новую позу (исходная
   * не меняется), сколько осталось до цели и саму цель (после подъёма на пол).
   */
  function drag(p0, name, target, iters = 80) {
    const h = HANDLES[name];
    const goal = [target[0], Math.max(FLOOR[name], target[1]), target[2]];
    const starts = [K.clone(p0)];
    if (h.limb) {
      // второй старт: конечность поставлена аналитически (limb.js), дальше уточняет DLS
      // (ручка дальше конца цепочки - на кисти/стопе; несколько повторов, пока направление
      // кисти после постановки не перестанет меняться)
      for (const branch of [0, 1]) {
        const q = K.clone(p0);
        for (let k = 0; k < 4; k++) {
          const f = K.fk(q);
          const end = f.pos[L.CHAINS[h.limb].end];
          L.reach(q, h.limb, V.sub(goal, V.sub(K.point(f, h.boneIndex, h.at), end)), branch);
        }
        starts.push(K.clampPose(q));
      }
    }
    // из стартов - ближайший к цели; если оба дошли - тот, что меньше тронул корпус
    // (изменение углов, взвешенное обратно весу сустава)
    const effort = (q) => h.dofs.reduce((s, i, k) => s + ((q.a[i] - p0.a[i]) ** 2) / h.w[k], 0);
    let res = null;
    for (const st of starts) {
      const r = dls(st, h, name, goal, iters);
      r.effort = effort(r.pose);
      if (!res || r.dist < res.dist - 1e-3 || (Math.abs(r.dist - res.dist) <= 1e-3 && r.effort < res.effort)) res = r;
    }
    return { pose: res.pose, dist: res.dist, target: goal };
  }

  function dls(p, h, name, goal, iters) {
    let lambda = 0.05;
    let best = { a: Float64Array.from(p.a), d: V.dist(effector(p, name), goal) };
    for (let it = 0; it < iters && best.d > 5e-4; it++) {
      const f = K.fk(p);
      const e = V.sub(goal, K.point(f, h.boneIndex, h.at));
      const axes = K.dofAxes(p, f);
      const world = K.point(f, h.boneIndex, h.at);
      const J = h.dofs.map((i) => K.dPoint(axes, i, h.boneIndex, world)); // столбцы, м/рад
      const JW = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      J.forEach((c, k) => { for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) JW[r][q] += c[r] * c[q] * h.w[k]; });
      for (let r = 0; r < 3; r++) JW[r][r] += lambda * lambda;
      const x = solve3(JW, e);
      J.forEach((c, k) => {
        const i = h.dofs[k], d = S.DOFS[i];
        const step = (h.w[k] * V.dot(c, x)) / V.DEG;
        p.a[i] = Math.min(d.max, Math.max(d.min, p.a[i] + Math.max(-15, Math.min(15, step))));
      });
      const dNow = V.dist(effector(p, name), goal);
      if (dNow < best.d) { best = { a: Float64Array.from(p.a), d: dNow }; lambda = Math.max(0.01, lambda * 0.7); }
      else { p.a.set(best.a); lambda *= 2; }
    }
    p.a.set(best.a);
    return { pose: p, dist: best.d };
  }

  return { HANDLES, FLOOR, effector, drag };
});
