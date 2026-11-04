// МОДЕЛЬ ТЕЛА, часть 2: мышцы. Мышца - лента по точкам: начало, точки обхода (чтобы лента
// огибала сустав, а не резала его), прикрепление. Точки заданы в осях костей (начало кости =
// её сустав), поэтому лента сама следует за скелетом в любой позе и для модели из Blender.
//
// act - что мышца делает по учебнику: степень свободы и знак (+1 - тянет угол вверх: сгибает,
// отводит, поворачивает внутрь/влево...). Это же написано в подписи. Закон проверяет, что
// геометрия ленты с этим согласна: плечо мышцы -dL/dθ имеет тот же знак. [знак, от, до] -
// действие верно только в этом диапазоне угла (на краях оно в жизни слабеет или меняется:
// грудная выше 100° отведения сама отводит; передняя дельта выше 130° работает вместе с
// поворотом лопатки, которого в модели нет). Четвёртый элемент - условие на другие углы того
// же сустава: «сгибание плеча» у руки, поднятой в сторону выше 80°, - уже другое движение.
// fmax - наибольшая сила, Н (порядок величин по площади поперечного сечения; округлено).
// Левая сторона пишется один раз, правая - отражением.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./skeleton.js'));
  else (root.GB = root.GB || {}).Muscles = factory(root.GB.Skeleton);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  // group - для цвета ленты; side-free id, к нему добавится _L / _R
  const LEFT = [
    // ---------- бедро и таз ----------
    { id: 'gluteus_max', group: 'hip', fmax: 1600, act: { 'hip.flex': -1 },
      path: [['pelvis', [0.04, -0.02, -0.10]], ['thigh', [0.04, -0.07, -0.07]], ['thigh', [0.02, -0.15, -0.04]]] },
    { id: 'gluteus_med', group: 'hip', fmax: 1300, act: { 'hip.abd': 1 },
      path: [['pelvis', [0.13, 0.05, -0.02]], ['thigh', [0.08, -0.05, 0]]] },
    { id: 'iliopsoas', group: 'hip', fmax: 1000, act: { 'hip.flex': 1 },
      path: [['spine', [0.03, 0.02, 0]], ['pelvis', [0.07, 0.0, 0.065]], ['wrap', 'thigh', [0, 0, 1], 0.05], ['thigh', [-0.015, -0.07, -0.005]]] },
    { id: 'adductors', group: 'hip', fmax: 2000, act: { 'hip.abd': -1 },
      path: [['pelvis', [0.02, -0.08, 0.05]], ['thigh', [-0.02, -0.27, -0.01]]] },
    // ---------- бедро и колено ----------
    { id: 'rectus_fem', group: 'thigh', fmax: 1200, act: { 'hip.flex': [1, -25, 100], 'knee.flex': -1 },
      path: [['pelvis', [0.08, 0.0, 0.065]], ['wrap', 'thigh', [0, 0, 1], 0.06], ['thigh', [0, -0.25, 0.07]], ['wrap', 'shin', [0, 0, 1], 0.06], ['shin', [0, -0.07, 0.045]]] },
    { id: 'vasti', group: 'thigh', fmax: 4500, act: { 'knee.flex': -1 },
      path: [['thigh', [0.02, -0.12, 0.05]], ['thigh', [0, -0.34, 0.065]], ['wrap', 'shin', [0, 0, 1], 0.06], ['shin', [0, -0.07, 0.045]]] },
    { id: 'hamstrings', group: 'thigh', fmax: 2500, act: { 'hip.flex': -1, 'knee.flex': 1 },
      path: [['pelvis', [0.06, -0.11, -0.06]], ['wrap', 'shin', [0, 0, -1], 0.05], ['shin', [0, -0.07, -0.035]]] },
    // ---------- голень и стопа ----------
    { id: 'gastrocnemius', group: 'shin', fmax: 2500, act: { 'knee.flex': [1, 0, 125], 'ankle.dorsi': -1 },
      path: [['thigh', [0, -0.33, -0.05]], ['wrap', 'shin', [0, 0, -1], 0.05], ['shin', [0, -0.15, -0.06]], ['foot', [0, -0.05, -0.06]]] },
    { id: 'soleus', group: 'shin', fmax: 3500, act: { 'ankle.dorsi': -1 },
      path: [['shin', [0, -0.10, -0.04]], ['shin', [0, -0.30, -0.05]], ['foot', [0, -0.05, -0.06]]] },
    { id: 'tibialis_ant', group: 'shin', fmax: 900, act: { 'ankle.dorsi': 1, 'ankle.inv': 1 },
      path: [['shin', [0.015, -0.10, 0.04]], ['shin', [0, -0.38, 0.045]], ['foot', [-0.028, -0.035, 0.06]]] },
    // ---------- туловище ----------
    { id: 'rectus_abd', group: 'trunk', fmax: 600, act: { 'lumbar.flex': 1, 'thoracic.flex': 1 },
      path: [['pelvis', [0.03, -0.08, 0.10]], ['spine', [0.03, 0.10, 0.11]], ['chest', [0.03, 0.06, 0.12]]] },
    { id: 'oblique_ext', group: 'trunk', fmax: 900, act: { 'lumbar.lat': 1, 'lumbar.rot': -1 },
      path: [['chest', [0.12, 0.05, 0.0]], ['spine', [0.11, 0.06, 0.05]], ['pelvis', [0.05, -0.04, 0.10]]] },
    { id: 'erector', group: 'trunk', fmax: 2500, act: { 'lumbar.flex': -1, 'thoracic.flex': -1 },
      path: [['pelvis', [0.03, 0.02, -0.08]], ['spine', [0.03, 0.12, -0.09]], ['chest', [0.03, 0.18, -0.09]]] },
    // ---------- плечевой пояс и плечо ----------
    { id: 'pectoralis', group: 'shoulder', fmax: 1000, act: { 'shoulder.abd': [-1, -30, 85], 'shoulder.rot': 1 },
      path: [['chest', [0.03, 0.12, 0.12]], ['wrap', 'upperarm', [0, 0, 1], 0.05], ['upperarm', [0.02, -0.08, 0.035]]] },
    { id: 'latissimus', group: 'shoulder', fmax: 1100, act: { 'shoulder.flex': [-1, -20, 180, { 'shoulder.abd': [-30, 80] }], 'shoulder.abd': [-1, -10, 180] },
      path: [['spine', [0.05, 0.05, -0.09]], ['wrap', 'upperarm', [0.3, -0.8, -0.5], 0.11], ['upperarm', [-0.01, -0.07, 0.015]]] },
    { id: 'deltoid_ant', group: 'shoulder', fmax: 600, act: { 'shoulder.flex': [1, -60, 105, { 'shoulder.abd': [-30, 80] }] },
      path: [['clavicle', [0.13, 0.05, 0.02]], ['wrap', 'upperarm', [0, 0, 1], 0.05], ['upperarm', [0.02, -0.14, 0.025]]] },
    { id: 'deltoid_mid', group: 'shoulder', fmax: 1100, act: { 'shoulder.abd': 1 },
      path: [['clavicle', [0.17, 0.035, -0.03]], ['wrap', 'upperarm', [1, 0, 0], 0.055], ['upperarm', [0.03, -0.14, 0]]] },
    { id: 'deltoid_post', group: 'shoulder', fmax: 500, act: { 'shoulder.flex': [-1, -60, 150, { 'shoulder.abd': [-30, 80] }] },
      path: [['chest', [0.13, 0.18, -0.08]], ['wrap', 'upperarm', [0, 0, -1], 0.05], ['upperarm', [0.02, -0.14, -0.025]]] },
    { id: 'trapezius', group: 'shoulder', fmax: 800, act: { 'sc.elev': 1 },
      path: [['neck', [0.02, 0.06, -0.03]], ['clavicle', [0.15, 0.03, -0.035]]] },
    // ---------- локоть и кисть ----------
    { id: 'biceps', group: 'arm', fmax: 800, act: { 'elbow.flex': 1 },
      path: [['clavicle', [0.14, -0.02, 0.01]], ['wrap', 'upperarm', [0, 0, 1], 0.045], ['wrap', 'forearm', [0, 0, 1], 0.035], ['forearm', [0, -0.05, 0.015]]] },
    { id: 'triceps', group: 'arm', fmax: 1500, act: { 'elbow.flex': -1 },
      path: [['clavicle', [0.15, -0.05, -0.08]], ['wrap', 'upperarm', [0, 0, -1], 0.045], ['upperarm', [0, -0.27, -0.045]], ['forearm', [0, 0.01, -0.03]]] },
    { id: 'wrist_flex', group: 'arm', fmax: 600, act: { 'wrist.flex': 1 },
      path: [['upperarm', [-0.035, -0.29, 0]], ['forearm', [-0.025, -0.20, 0]], ['hand', [-0.015, -0.05, 0]]] },
    { id: 'wrist_ext', group: 'arm', fmax: 400, act: { 'wrist.flex': -1 },
      path: [['upperarm', [0.035, -0.29, 0]], ['forearm', [0.025, -0.20, 0]], ['hand', [0.015, -0.05, 0]]] },
    // ---------- шея ----------
    { id: 'scm', group: 'neck', fmax: 300, act: { 'neck.flex': 1, 'neck.rot': -1 },
      path: [['chest', [0.02, 0.22, 0.07]], ['head', [0.05, 0.06, -0.02]]] },
    { id: 'splenius', group: 'neck', fmax: 400, act: { 'neck.flex': -1 },
      path: [['chest', [0.02, 0.20, -0.07]], ['head', [0.03, 0.08, -0.08]]] },
  ];

  const SIDE_BONES = ['thigh', 'shin', 'foot', 'toes', 'clavicle', 'upperarm', 'forearm', 'hand'];
  const SIDE_JOINTS = ['hip', 'knee', 'ankle', 'toe', 'sc', 'shoulder', 'elbow', 'wrist'];

  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

  function build(m, side) {
    const sx = side === 'L' ? 1 : -1;
    const bone = (n) => S.BONE[SIDE_BONES.includes(n) ? `${n}_${side}` : n].index;
    const act = {};
    for (const [k, v] of Object.entries(m.act)) {
      const [j, d] = k.split('.');
      const key = SIDE_JOINTS.includes(j) ? `${j}_${side}.${d}` : `${j}.${d}`;
      const [sign, lo, hi, cond] = Array.isArray(v) ? v : [v, -Infinity, Infinity, null];
      const when = {};
      for (const [ck, cr] of Object.entries(cond || {})) when[S.DOF[`${ck.split('.')[0]}_${side}.${ck.split('.')[1]}`]] = cr;
      // центральные суставы: правая мышца наклоняет и поворачивает в другую сторону
      act[key] = Object.freeze({ sign: SIDE_JOINTS.includes(j) ? sign : sign * (side === 'R' ? S.mirrorSign(key) : 1), lo, hi, when: Object.freeze(when) });
    }
    return Object.freeze({
      id: `${m.id}_${side}`, base: m.id, side, group: m.group, fmax: m.fmax,
      act: Object.freeze(act),
      path: Object.freeze(m.path.map((e) => Object.freeze(e[0] === 'wrap'
        ? { wrap: true, bone: bone(e[1]), dir: Object.freeze(unit([e[2][0] * sx, e[2][1], e[2][2]])), r: e[3] }
        : { bone: bone(e[0]), at: Object.freeze([e[1][0] * sx, e[1][1], e[1][2]]) }))),
    });
  }

  // Степени свободы, момент которых раздаётся мышцам модели. Остальные (пронация, отклонения
  // кисти, инверсия стопы, пальцы, повороты бедра и плеча вокруг оси, вынос ключицы) держат
  // мышцы и связки, которых в модели нет, - их момент не зажигает чужие мышцы.
  const DRIVEN = S.DOFS.map((d) => /\.(flex|abd|dorsi|elev)$/.test(d.key) || /^(lumbar|thoracic|neck)\.(lat|rot)$/.test(d.key));

  /** Верно ли объявленное действие в позе p (угол в диапазоне и условия на соседние углы). */
  function claimHolds(claim, p, dof) {
    if (p.a[dof] < claim.lo || p.a[dof] > claim.hi) return false;
    for (const [i, [lo, hi]] of Object.entries(claim.when)) if (p.a[i] < lo || p.a[i] > hi) return false;
    return true;
  }

  const MUSCLES = Object.freeze([...LEFT.map((m) => build(m, 'L')), ...LEFT.map((m) => build(m, 'R'))]);
  const MUSCLE = {};
  MUSCLES.forEach((m, i) => { MUSCLE[m.id] = i; });
  const GROUPS = Object.freeze(['hip', 'thigh', 'shin', 'trunk', 'shoulder', 'arm', 'neck']);

  return Object.freeze({ MUSCLES, MUSCLE, GROUPS, DRIVEN, claimHolds, BASES: Object.freeze(LEFT.map((m) => m.id)) });
});
