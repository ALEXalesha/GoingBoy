// Векторы [x, y, z] и кватернионы [x, y, z, w] - маленькая математика ядра без three.js,
// чтобы законы node:test проверяли ровно тот код, который считает позу в окне.
// Углы снаружи ядра - в градусах, внутри функций - как подписано.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.GB = root.GB || {}).Vec = factory();
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEG = Math.PI / 180;

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  function norm(a) {
    const l = len(a);
    return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
  }

  const QI = Object.freeze([0, 0, 0, 1]);
  const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  /** Поворот на угол (радианы) вокруг единичной оси. */
  function qAxis(axis, rad) {
    const s = Math.sin(rad / 2);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(rad / 2)];
  }

  /** a затем b в собственных осях: точка поворачивается сначала b, потом a (как матрицы A·B). */
  function qMul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  }

  const qConj = (q) => [-q[0], -q[1], -q[2], q[3]];

  function qNorm(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }

  /** Повернуть вектор кватернионом. */
  function qRot(q, v) {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx),
    ];
  }

  /** Угол между двумя поворотами, радианы (0..pi). */
  function qAngle(a, b) {
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, d));
  }

  /** Сферическая интерполяция по короткой дуге. */
  function qSlerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
    if (d > 0.9995) return qNorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
    const th = Math.acos(d), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
  }

  /** Корпус: рысканье Y, потом тангаж X, потом крен Z (градусы) - порядок, в котором удобно писать сальто. */
  function qEulerYXZ(yawDeg, pitchDeg, rollDeg) {
    return qMul(qMul(qAxis(AXES.y, yawDeg * DEG), qAxis(AXES.x, pitchDeg * DEG)), qAxis(AXES.z, rollDeg * DEG));
  }

  /** Повернуть угол (градусы) в -180..180. */
  function wrapDeg(a) {
    let r = ((a + 180) % 360 + 360) % 360 - 180;
    if (r === -180 && a > 0) r = 180;
    return r;
  }

  return {
    DEG, AXES, QI,
    add, sub, scale, dot, cross, len, dist, lerp, norm,
    qAxis, qMul, qConj, qNorm, qRot, qAngle, qSlerp, qEulerYXZ, wrapDeg,
  };
});
