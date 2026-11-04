// Конечность из двух звеньев (бедро-голень, плечо-предплечье) точно ставит конец в точку:
// аналитически, без итераций. Нужна движениям, где стопы стоят на месте (присед, выпад,
// удар опорной ногой), и своей позе мышью. Плюс стопа ровно на полу: голеностоп поворачивает
// подошву так, чтобы она смотрела куда нужно.
//
// Если точка дальше длины конечности, конечность выпрямляется и тянется прямо к ней -
// ближайшая достижимая точка. Поворот вокруг длинной оси звена (rot) остаётся, какой был.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vec.js'), require('../body/skeleton.js'), require('./kinematics.js'));
  else (root.GB = root.GB || {}).Limb = factory(root.GB.Vec, root.GB.Skeleton, root.GB.Kin);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S, K) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // Звенья: верхний сустав (flex, abd, rot), нижний (flex), конец - начало следующей кости
  const CHAINS = {};
  for (const s of ['L', 'R']) {
    CHAINS['leg_' + s] = { upper: `hip_${s}`, lower: `knee_${s}`, b1: S.BONE['thigh_' + s].index, b2: S.BONE['shin_' + s].index, end: S.BONE['foot_' + s].index };
    CHAINS['arm_' + s] = { upper: `shoulder_${s}`, lower: `elbow_${s}`, b1: S.BONE['upperarm_' + s].index, b2: S.BONE['forearm_' + s].index, end: S.BONE['hand_' + s].index };
  }
  for (const c of Object.values(CHAINS)) {
    c.L1 = V.len(S.BONES[c.b2].offset);
    c.L2 = V.len(S.BONES[c.end].offset);
    c.flex = S.DOF[c.upper + '.flex']; c.abd = S.DOF[c.upper + '.abd']; c.rot = S.DOF[c.upper + '.rot'];
    c.knee = S.DOF[c.lower + '.flex'];
  }
  const sgn = (i) => S.DOFS[i].sign;

  /**
   * Поставить конец цепочки (голеностоп или запястье) в мировую точку target.
   * Меняет углы позы p на месте; возвращает расстояние от достигнутой точки до цели.
   * branch 1 - вторая ветвь решения (рука поднята в сторону выше 90°).
   */
  function reach(p, name, target, branch = 0) {
    const c = CHAINS[name];
    const f = K.fk(p);
    const par = f.rot[S.PARENT[c.b1]];
    const t = V.qRot(V.qConj(par), V.sub(target, f.pos[c.b1]));
    const dmax = c.L1 + c.L2 - 1e-9, dmin = Math.abs(c.L1 - c.L2) + 1e-6;
    const d = clamp(V.len(t), dmin, dmax);
    const tt = V.scale(V.norm(t), d);
    // нижний сустав: d^2 = L1^2 + L2^2 + 2 L1 L2 cos k
    const k = Math.acos(clamp((d * d - c.L1 * c.L1 - c.L2 * c.L2) / (2 * c.L1 * c.L2), -1, 1));
    const s2 = sgn(c.knee);
    const A = c.L1 + c.L2 * Math.cos(k), B = s2 * c.L2 * Math.sin(k);
    // конец в осях верхнего звена после поворота вокруг длинной оси: Ry(rho) (0, -A, -B)
    const rho = sgn(c.rot) * p.a[c.rot] * V.DEG;
    const ux = -B * Math.sin(rho), uz = -B * Math.cos(rho);
    // Rz(gamma): x = ux cos g + A sin g
    const R = Math.hypot(ux, A), phi = Math.atan2(ux, A);
    const g0 = Math.asin(clamp(tt[0] / R, -1, 1));
    const g = (branch ? Math.PI - g0 : g0) - phi;
    const uy = ux * Math.sin(g) - A * Math.cos(g);
    const b = Math.atan2(tt[2], tt[1]) - Math.atan2(uz, uy);
    p.a[c.knee] = k / V.DEG;
    p.a[c.flex] = V.wrapDeg((b / V.DEG) / sgn(c.flex));
    p.a[c.abd] = V.wrapDeg((g / V.DEG) / sgn(c.abd));
    const got = K.point(K.fk(p), c.end, [0, 0, 0]);
    return V.dist(got, target);
  }

  /**
   * Повернуть стопу так, чтобы подошва смотрела вдоль up (мировой вектор; [0, 1, 0] - ровно на
   * полу). Голеностоп: тыльное сгибание и инверсия.
   */
  function soleUp(p, side, up) {
    const shin = S.BONE['shin_' + side].index;
    const f = K.fk(p);
    const n = V.qRot(V.qConj(f.rot[shin]), V.norm(up));
    const di = S.DOF[`ankle_${side}.dorsi`], ii = S.DOF[`ankle_${side}.inv`];
    const delta = Math.asin(clamp(-n[0], -1, 1));
    const alpha = Math.atan2(n[2], n[1]);
    p.a[di] = alpha / V.DEG / sgn(di);
    p.a[ii] = delta / V.DEG / sgn(ii);
  }

  // Голеностоп относительно подушечки стопы (начала кости пальцев) и её высота в стойке
  const BALL_TO_ANKLE = V.scale(S.BONE.toes_L.offset, -1);
  const BALL_H = K.fk(K.restPose()).pos[S.BONE.toes_L.index][1];

  /**
   * Поставить стопу на пол: подушечка в точке (x, z), пятка приподнята на heel градусов
   * (0 - вся стопа на полу), носок смотрит вдоль рысканья yaw, lift - стопа над полом (шаг).
   * Пальцы остаются параллельны полу.
   */
  function plantFoot(p, side, x, z, heel = 0, yaw = 0, lift = 0) {
    const turn = V.qMul(V.qAxis([0, 1, 0], yaw * V.DEG), V.qAxis([1, 0, 0], heel * V.DEG));
    const ball = [x, BALL_H + lift, z];
    const ankle = V.add(ball, V.qRot(turn, BALL_TO_ANKLE));
    const up = V.qRot(turn, [0, 1, 0]);
    const rot = S.DOF[`hip_${side}.rot`], foot = S.BONE['foot_' + side].index;
    // Носок голеностопом не развернуть - его разворачивает поворот бедра. Шаги Ньютона:
    // поставить конечность, выровнять подошву, посмотреть, куда смотрит носок, довернуть бедро.
    const miss = (r) => {
      p.a[rot] = r;
      reach(p, 'leg_' + side, ankle);
      soleUp(p, side, up);
      const fwd = V.qRot(K.fk(p).rot[foot], [0, 0, 1]);
      return V.wrapDeg(yaw - Math.atan2(fwd[0], fwd[2]) / V.DEG);
    };
    let r = p.a[rot], m = miss(r);
    for (let it = 0; it < 12 && Math.abs(m) > 1e-5; it++) {
      const d = (miss(r + 0.5) - m) / 0.5;
      const stepDeg = Math.abs(d) > 1e-3 ? Math.max(-10, Math.min(10, -m / d)) : 0;
      if (!stepDeg) break;
      r += stepDeg;
      m = miss(r);
    }
    const err = reach(p, 'leg_' + side, ankle);
    soleUp(p, side, up);
    p.a[S.DOF[`toe_${side}.ext`]] = heel;
    return err;
  }

  return { CHAINS, BALL_H, reach, soleUp, plantFoot };
});
