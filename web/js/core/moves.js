// Движения ключевыми кадрами. Углы - градусы, анатомические (см. body/skeleton.js):
// сгибание бедра вперёд +, колена +, тыльное сгибание стопы +, сгибание плеча (рука вперёд) +.
// t - фаза цикла 0..1; каждое движение повторяется по кругу.
//
// Кривые ходьбы и бега - по средним данным походки взрослого (сагиттальные углы бедра, колена
// и стопы по фазе шага), округлены; остальное поставлено руками и проверено законами: углы в
// пределах суставов на всех кадрах, ничего не уходит под пол, кости не растягиваются.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.GB = root.GB || {}).Moves = factory();
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Руки чуть отведены, чтобы не проходить сквозь бёдра; голова держит взгляд прямо.
  const ARMS = { 'shoulder_L.abd': 8, 'shoulder_R.abd': 8, 'elbow_L.flex': 12, 'elbow_R.flex': 12 };

  // Сокращение: обе стороны одним значением.
  function both(j) {
    const out = {};
    for (const [k, v] of Object.entries(j)) {
      if (k.includes('_*')) { out[k.replace('_*', '_L')] = v; out[k.replace('_*', '_R')] = v; } else out[k] = v;
    }
    return out;
  }

  const MOVES = [
    // ---------------- ходьба: левая пятка касается пола в t = 0 ----------------
    // Таз наклонён вперёд на 10° (как у идущего человека), поясница это выпрямляет.
    {
      id: 'walk', group: 'locomotion', dur: 1.1, speed: 1.35, half: true, stance: [['L', 0, 0.55]], swing: [['R', 0.1, 0.4]],
      base: { ...ARMS, 'root.pitch': 10, 'lumbar.flex': -7, 'neck.flex': -3 },
      keys: [
        { t: 0.0, j: { 'hip_L.flex': 30, 'knee_L.flex': 5, 'ankle_L.dorsi': 0, 'toe_L.ext': 0,
          'hip_R.flex': -10, 'knee_R.flex': 15, 'ankle_R.dorsi': 0, 'toe_R.ext': 20,
          'shoulder_L.flex': -16, 'shoulder_R.flex': 18, 'elbow_L.flex': 12, 'elbow_R.flex': 28,
          'root.yaw': -5, 'thoracic.rot': 6, 'root.x': 0 } },
        { t: 0.1, j: { 'hip_L.flex': 28, 'knee_L.flex': 18, 'ankle_L.dorsi': -5,
          'hip_R.flex': -5, 'knee_R.flex': 40, 'ankle_R.dorsi': -15, 'toe_R.ext': 30 } },
        { t: 0.2, j: { 'hip_L.flex': 18, 'knee_L.flex': 12, 'ankle_L.dorsi': 3,
          'hip_R.flex': 15, 'knee_R.flex': 62, 'ankle_R.dorsi': 5, 'toe_R.ext': 5 } },
        { t: 0.25, j: { 'root.x': 0.02, 'shoulder_L.flex': 0, 'shoulder_R.flex': 0 } },
        { t: 0.3, j: { 'hip_L.flex': 8, 'knee_L.flex': 4, 'ankle_L.dorsi': 8,
          'hip_R.flex': 28, 'knee_R.flex': 55, 'ankle_R.dorsi': 8, 'toe_R.ext': 0 } },
        { t: 0.35, j: { 'hip_R.flex': 31, 'knee_R.flex': 45, 'ankle_R.dorsi': 10 } },
        { t: 0.4, j: { 'hip_L.flex': -2, 'knee_L.flex': 3, 'ankle_L.dorsi': 10, 'toe_L.ext': 10,
          'hip_R.flex': 32, 'knee_R.flex': 24, 'ankle_R.dorsi': 4 } },
      ],
    },
    // ---------------- бег: опора 0..0.25, полёт 0.25..0.5 ----------------
    {
      id: 'run', group: 'locomotion', dur: 0.7, speed: 3.2, half: true, flights: [[0.25, 0.5]], stance: [['L', 0, 0.25]], swing: [['R', 0.03, 0.45]],
      base: { 'shoulder_L.abd': 10, 'shoulder_R.abd': 10, 'lumbar.flex': 8, 'neck.flex': -8, 'wrist_L.flex': 10, 'wrist_R.flex': 10 },
      keys: [
        { t: 0.0, j: { 'hip_L.flex': 25, 'knee_L.flex': 12, 'ankle_L.dorsi': 0, 'toe_L.ext': 0,
          'hip_R.flex': 8, 'knee_R.flex': 90, 'ankle_R.dorsi': -5, 'toe_R.ext': 0,
          'shoulder_L.flex': -40, 'shoulder_R.flex': 20, 'elbow_L.flex': 75, 'elbow_R.flex': 100,
          'root.yaw': -8, 'thoracic.rot': 10 } },
        { t: 0.08, j: { 'hip_L.flex': 15, 'knee_L.flex': 35, 'ankle_L.dorsi': 15,
          'hip_R.flex': 30, 'knee_R.flex': 112, 'ankle_R.dorsi': 5 } },
        { t: 0.17, j: { 'hip_L.flex': 0, 'knee_L.flex': 28, 'ankle_L.dorsi': 8, 'toe_L.ext': 10,
          'hip_R.flex': 52, 'knee_R.flex': 100, 'ankle_R.dorsi': 10 } },
        { t: 0.25, j: { 'hip_L.flex': -12, 'knee_L.flex': 18, 'ankle_L.dorsi': -18, 'toe_L.ext': 25,
          'hip_R.flex': 58, 'knee_R.flex': 70, 'ankle_R.dorsi': 8 } },
        { t: 0.35, j: { 'hip_L.flex': -8, 'knee_L.flex': 50, 'ankle_L.dorsi': -12, 'toe_L.ext': 5,
          'hip_R.flex': 45, 'knee_R.flex': 30, 'ankle_R.dorsi': 3 } },
        { t: 0.45, j: { 'hip_L.flex': 5, 'knee_L.flex': 80, 'ankle_L.dorsi': -5, 'toe_L.ext': 0,
          'hip_R.flex': 30, 'knee_R.flex': 15, 'ankle_R.dorsi': 0 } },
      ],
    },
    // ---------------- прыжок вверх: присед, толчок, полёт, приземление ----------------
    {
      id: 'jump', group: 'locomotion', dur: 2.4, flights: [[0.415, 0.6]],
      base: { ...ARMS },
      keys: [
        { t: 0.0, j: both({ 'hip_*.flex': 0, 'knee_*.flex': 0, 'ankle_*.dorsi': 0, 'toe_*.ext': 0, 'shoulder_*.flex': 0, 'elbow_*.flex': 12, 'lumbar.flex': 0, 'neck.flex': 0 }) },
        { t: 0.15, j: both({ 'hip_*.flex': 0, 'knee_*.flex': 0, 'ankle_*.dorsi': 0, 'shoulder_*.flex': 0, 'lumbar.flex': 0 }) },
        { t: 0.33, j: both({ 'hip_*.flex': 75, 'knee_*.flex': 95, 'ankle_*.dorsi': 24, 'shoulder_*.flex': -55, 'elbow_*.flex': 10, 'lumbar.flex': 22, 'neck.flex': -20 }) },
        { t: 0.4, j: both({ 'hip_*.flex': 30, 'knee_*.flex': 40, 'ankle_*.dorsi': 5, 'shoulder_*.flex': 60, 'lumbar.flex': 10, 'neck.flex': -8 }) },
        { t: 0.45, j: both({ 'hip_*.flex': -5, 'knee_*.flex': 0, 'ankle_*.dorsi': -40, 'toe_*.ext': 45, 'shoulder_*.flex': 150, 'elbow_*.flex': 15, 'lumbar.flex': -5, 'neck.flex': 0 }) },
        { t: 0.55, j: both({ 'hip_*.flex': 5, 'knee_*.flex': 10, 'ankle_*.dorsi': -35, 'toe_*.ext': 0, 'shoulder_*.flex': 160, 'lumbar.flex': -5 }) },
        { t: 0.65, j: both({ 'hip_*.flex': 20, 'knee_*.flex': 15, 'ankle_*.dorsi': -20, 'toe_*.ext': 10, 'shoulder_*.flex': 60, 'lumbar.flex': 5 }) },
        { t: 0.75, j: both({ 'hip_*.flex': 60, 'knee_*.flex': 75, 'ankle_*.dorsi': 20, 'toe_*.ext': 0, 'shoulder_*.flex': 30, 'elbow_*.flex': 30, 'lumbar.flex': 18, 'neck.flex': -15 }) },
        { t: 0.9, j: both({ 'hip_*.flex': 10, 'knee_*.flex': 10, 'ankle_*.dorsi': 3, 'shoulder_*.flex': 5, 'elbow_*.flex': 15, 'lumbar.flex': 3, 'neck.flex': -2 }) },
      ],
    },
    // ---------------- присед: стопы стоят, таз уходит назад и вниз, руки вперёд для равновесия ----------------
    {
      id: 'squat', group: 'exercise', dur: 3.2, balance: true,
      base: { 'foot_L.x': 0.13, 'foot_L.z': 0.14, 'foot_L.yaw': 12, 'foot_R.x': -0.13, 'foot_R.z': 0.14, 'foot_R.yaw': -12,
        'shoulder_L.abd': 6, 'shoulder_R.abd': 6 },
      keys: [
        { t: 0.0, j: both({ 'root.y': 0.915, 'root.z': 0, 'root.pitch': 0, 'shoulder_*.flex': 0, 'elbow_*.flex': 10, 'lumbar.flex': 0, 'thoracic.flex': 0, 'neck.flex': 0 }) },
        { t: 0.12, j: both({ 'root.y': 0.91, 'root.z': 0, 'root.pitch': 2, 'shoulder_*.flex': 90, 'elbow_*.flex': 5 }) },
        { t: 0.45, j: both({ 'root.y': 0.56, 'root.z': -0.26, 'root.pitch': 33, 'shoulder_*.flex': 100, 'elbow_*.flex': 5, 'lumbar.flex': 8, 'thoracic.flex': 4, 'neck.flex': -28 }) },
        { t: 0.55, j: both({ 'root.y': 0.56, 'root.z': -0.26, 'root.pitch': 33, 'shoulder_*.flex': 100, 'lumbar.flex': 8, 'thoracic.flex': 4, 'neck.flex': -28 }) },
        { t: 0.88, j: both({ 'root.y': 0.91, 'root.z': 0, 'root.pitch': 2, 'shoulder_*.flex': 90, 'elbow_*.flex': 5, 'lumbar.flex': 0, 'thoracic.flex': 0, 'neck.flex': 0 }) },
      ],
    },
    // ---------------- отжимание от пола: на кулаках и носках, тело прямое ----------------
    {
      id: 'pushup', group: 'exercise', dur: 2.6,
      ground: ['hand_L', 'hand_R', 'foot_L', 'toes_L', 'foot_R', 'toes_R'],
      level: [['hand_L', 'hand_R'], ['foot_L', 'toes_L', 'foot_R', 'toes_R']],
      pin: { bones: ['hand_L', 'hand_R'], at: [0, 0.3] },
      support: [['hand_L', 'hand_R'], ['foot_L', 'toes_L', 'foot_R', 'toes_R']],
      base: both({ 'root.pitch': 75, 'toe_*.ext': 55, 'ankle_*.dorsi': 5, 'neck.flex': -15, 'hip_*.abd': 4 }),
      keys: [
        { t: 0.0, j: both({ 'shoulder_*.flex': 78, 'shoulder_*.abd': 12, 'elbow_*.flex': 2, 'shoulder_*.rot': 0 }) },
        { t: 0.1, j: both({ 'shoulder_*.flex': 78, 'shoulder_*.abd': 12, 'elbow_*.flex': 2 }) },
        { t: 0.5, j: both({ 'shoulder_*.flex': 15, 'shoulder_*.abd': 40, 'elbow_*.flex': 95, 'shoulder_*.rot': 20 }) },
        { t: 0.58, j: both({ 'shoulder_*.flex': 15, 'shoulder_*.abd': 40, 'elbow_*.flex': 95, 'shoulder_*.rot': 20 }) },
        { t: 0.9, j: both({ 'shoulder_*.flex': 78, 'shoulder_*.abd': 12, 'elbow_*.flex': 2, 'shoulder_*.rot': 0 }) },
      ],
    },
    // ---------------- подтягивание на перекладине: хват на ширине плеч, подбородок над перекладиной ----------------
    {
      id: 'pullup', group: 'exercise', dur: 3.0, ground: 'none',
      hang: { bar: [0, 2.3, 0], grip: ['hand_L', 'hand_R'] },
      base: both({ 'hip_*.flex': 12, 'knee_*.flex': 35, 'ankle_*.dorsi': -25, 'wrist_*.flex': 0 }),
      keys: [
        { t: 0.0, j: both({ 'shoulder_*.flex': 168, 'shoulder_*.abd': 32, 'elbow_*.flex': 4, 'sc_*.elev': 25, 'neck.flex': -10 }) },
        { t: 0.1, j: both({ 'shoulder_*.flex': 168, 'shoulder_*.abd': 32, 'elbow_*.flex': 4, 'sc_*.elev': 25 }) },
        { t: 0.3, j: both({ 'shoulder_*.flex': 125, 'shoulder_*.abd': 18, 'elbow_*.flex': 70, 'sc_*.elev': 10 }) },
        { t: 0.48, j: both({ 'shoulder_*.flex': 45, 'shoulder_*.abd': 6, 'elbow_*.flex': 140, 'sc_*.elev': -5, 'neck.flex': -20 }) },
        { t: 0.58, j: both({ 'shoulder_*.flex': 45, 'shoulder_*.abd': 6, 'elbow_*.flex': 140, 'sc_*.elev': -5, 'neck.flex': -20 }) },
        { t: 0.85, j: both({ 'shoulder_*.flex': 160, 'shoulder_*.abd': 28, 'elbow_*.flex': 10, 'sc_*.elev': 20, 'neck.flex': -10 }) },
      ],
    },
    // ---------------- выпад на месте: левая нога впереди, правая на носке сзади, таз вниз ----------------
    {
      id: 'lunge', group: 'exercise', dur: 3.0, balance: true,
      base: { 'foot_L.x': 0.11, 'foot_L.z': 0.40, 'foot_R.x': -0.11, 'foot_R.z': -0.36,
        'shoulder_L.abd': 8, 'shoulder_R.abd': 8, 'elbow_L.flex': 15, 'elbow_R.flex': 15 },
      keys: [
        { t: 0.0, j: { 'root.y': 0.845, 'root.z': 0.0, 'foot_R.heel': 45, 'lumbar.flex': 0, 'neck.flex': 0 } },
        { t: 0.1, j: { 'root.y': 0.845, 'root.z': 0.0, 'foot_R.heel': 45 } },
        { t: 0.45, j: { 'root.y': 0.52, 'root.z': 0.04, 'foot_R.heel': 75, 'lumbar.flex': 4, 'neck.flex': -4 } },
        { t: 0.55, j: { 'root.y': 0.52, 'root.z': 0.04, 'foot_R.heel': 75 } },
        { t: 0.9, j: { 'root.y': 0.845, 'root.z': 0.0, 'foot_R.heel': 45, 'lumbar.flex': 0, 'neck.flex': 0 } },
      ],
    },
    // ---------------- удар по мячу правой ногой: левая стоит, правая замах - удар - проводка ----------------
    // В опоре правая стопа стоит по IK (foot_R.ik = 1), в воздухе нога идёт по углам (ik = 0).
    {
      id: 'kick', group: 'sport', dur: 2.4, ground: ['foot_L', 'toes_L'],
      props: { ball: { hit: 0.38 } },
      base: { 'foot_L.x': 0.11, 'foot_L.z': 0.16, 'foot_L.yaw': 8, 'foot_R.x': -0.11, 'foot_R.z': 0.1, 'shoulder_L.abd': 10, 'shoulder_R.abd': 10 },
      keys: [
        { t: 0.0, j: { 'root.y': 0.94, 'root.z': 0, 'root.x': 0, 'foot_R.ik': 1, 'foot_R.lift': 0, 'foot_R.heel': 0, 'hip_R.flex': 7, 'knee_R.flex': 17, 'ankle_R.dorsi': 10, 'toe_R.ext': 0,
          'shoulder_L.abd': 10, 'shoulder_L.flex': 0, 'shoulder_R.flex': 0, 'elbow_L.flex': 12, 'elbow_R.flex': 12, 'thoracic.rot': 0, 'lumbar.flex': 0, 'neck.flex': 0 } },
        { t: 0.14, j: { 'root.y': 0.93, 'root.z': 0, 'root.x': 0.02, 'foot_R.ik': 1, 'foot_R.lift': 0, 'foot_R.heel': 0, 'hip_R.flex': 11, 'knee_R.flex': 25, 'ankle_R.dorsi': 13 } },
        { t: 0.17, j: { 'foot_R.ik': 1, 'foot_R.lift': 0.04, 'foot_R.heel': 20 } },
        { t: 0.2, j: { 'foot_R.ik': 1, 'foot_R.lift': 0.09, 'foot_R.heel': 25 } },
        { t: 0.22, j: { 'foot_R.ik': 0, 'hip_R.flex': 5, 'knee_R.flex': 75, 'ankle_R.dorsi': -5 } },
        { t: 0.28, j: { 'root.y': 0.88, 'root.z': 0.03, 'root.x': 0.05, 'hip_R.flex': -25, 'knee_R.flex': 100, 'ankle_R.dorsi': -35, 'toe_R.ext': 0,
          'shoulder_L.abd': 45, 'shoulder_L.flex': 35, 'shoulder_R.flex': -30, 'elbow_L.flex': 30, 'thoracic.rot': -15, 'lumbar.flex': -6, 'neck.flex': 15 } },
        { t: 0.335, j: { 'root.y': 0.895, 'hip_R.flex': 15, 'knee_R.flex': 100, 'ankle_R.dorsi': -10 } },
        { t: 0.36, j: { 'hip_R.flex': 32, 'knee_R.flex': 85, 'ankle_R.dorsi': -10 } },
        { t: 0.37, j: { 'hip_R.flex': 46, 'knee_R.flex': 60, 'ankle_R.dorsi': -5 } },
        { t: 0.38, j: { 'root.y': 0.895, 'root.z': 0.05, 'root.x': 0.05, 'hip_R.flex': 56, 'knee_R.flex': 38, 'ankle_R.dorsi': -30,
          'shoulder_L.abd': 55, 'shoulder_L.flex': 10, 'shoulder_R.flex': 20, 'thoracic.rot': 12, 'lumbar.flex': 4, 'neck.flex': 25 } },
        { t: 0.48, j: { 'root.y': 0.9, 'root.z': 0.08, 'root.x': 0.04, 'hip_R.flex': 85, 'knee_R.flex': 15, 'ankle_R.dorsi': -30,
          'shoulder_L.abd': 40, 'shoulder_L.flex': -10, 'shoulder_R.flex': 35, 'thoracic.rot': 20, 'lumbar.flex': 10, 'neck.flex': 15 } },
        { t: 0.56, j: { 'hip_R.flex': 50, 'knee_R.flex': 62, 'ankle_R.dorsi': 0 } },
        { t: 0.61, j: { 'hip_R.flex': 36, 'knee_R.flex': 78, 'ankle_R.dorsi': 8 } },
        { t: 0.66, j: { 'root.y': 0.88, 'root.z': 0.05, 'root.x': 0.03, 'hip_R.flex': 30, 'knee_R.flex': 88, 'ankle_R.dorsi': 10,
          'shoulder_L.abd': 20, 'shoulder_L.flex': 0, 'shoulder_R.flex': 5, 'thoracic.rot': 5, 'lumbar.flex': 3, 'neck.flex': 5 } },
        { t: 0.7, j: { 'foot_R.ik': 0, 'hip_R.flex': 22, 'knee_R.flex': 82, 'ankle_R.dorsi': 12 } },
        { t: 0.74, j: { 'foot_R.ik': 1, 'foot_R.lift': 0.1, 'foot_R.heel': 15 } },
        { t: 0.8, j: { 'foot_R.ik': 1, 'foot_R.lift': 0.03, 'foot_R.heel': 8 } },
        { t: 0.84, j: { 'root.y': 0.94, 'root.z': 0, 'root.x': 0, 'foot_R.ik': 1, 'foot_R.lift': 0, 'foot_R.heel': 0, 'hip_R.flex': 7, 'knee_R.flex': 17, 'ankle_R.dorsi': 10,
          'shoulder_L.abd': 10, 'shoulder_L.flex': 0, 'shoulder_R.flex': 0, 'thoracic.rot': 0, 'lumbar.flex': 0, 'neck.flex': 0 } },
      ],
    },
    // ---------------- бросок мяча правой рукой сверху: замах - разгон корпусом - выпуск - проводка ----------------
    {
      id: 'throw', group: 'sport', dur: 2.4,
      props: { ball: { hand: 'hand_R', release: 0.5 } },
      base: { 'foot_L.x': 0.13, 'foot_L.z': 0.38, 'foot_L.yaw': -10, 'foot_R.x': -0.14, 'foot_R.z': -0.16, 'foot_R.yaw': -25, 'wrist_R.flex': 10 },
      keys: [
        { t: 0.0, j: { 'root.y': 0.86, 'root.z': 0.08, 'root.yaw': -10, 'thoracic.rot': -5, 'lumbar.rot': 0, 'lumbar.flex': 0, 'foot_R.heel': 12,
          'shoulder_R.flex': 20, 'shoulder_R.abd': 15, 'shoulder_R.rot': 0, 'elbow_R.flex': 90,
          'shoulder_L.flex': 20, 'shoulder_L.abd': 15, 'elbow_L.flex': 80, 'neck.rot': 5 } },
        { t: 0.12, j: { 'root.y': 0.86, 'root.z': 0.08, 'root.yaw': -10, 'thoracic.rot': -5 } },
        { t: 0.36, j: { 'root.y': 0.84, 'root.z': 0.0, 'root.yaw': -25, 'thoracic.rot': -30, 'lumbar.rot': -10, 'lumbar.flex': -8,
          'shoulder_R.flex': 0, 'shoulder_R.abd': 95, 'shoulder_R.rot': -75, 'elbow_R.flex': 95,
          'shoulder_L.flex': 70, 'shoulder_L.abd': 40, 'elbow_L.flex': 30, 'neck.rot': 30 } },
        { t: 0.5, j: { 'root.y': 0.84, 'root.z': 0.12, 'root.yaw': 10, 'thoracic.rot': 20, 'lumbar.rot': 8, 'lumbar.flex': 12,
          'shoulder_R.flex': 30, 'shoulder_R.abd': 100, 'shoulder_R.rot': 30, 'elbow_R.flex': 25,
          'shoulder_L.flex': 20, 'shoulder_L.abd': 30, 'elbow_L.flex': 70, 'neck.rot': 0 } },
        { t: 0.6, j: { 'root.y': 0.83, 'root.z': 0.16, 'root.yaw': 15, 'thoracic.rot': 28, 'lumbar.rot': 10, 'lumbar.flex': 25, 'foot_R.heel': 35,
          'shoulder_R.flex': 50, 'shoulder_R.abd': 35, 'shoulder_R.rot': 55, 'elbow_R.flex': 30,
          'shoulder_L.flex': 5, 'shoulder_L.abd': 25, 'elbow_L.flex': 80, 'neck.rot': -10 } },
        { t: 0.82, j: { 'root.y': 0.86, 'root.z': 0.08, 'root.yaw': -10, 'thoracic.rot': -5, 'lumbar.rot': 0, 'lumbar.flex': 0, 'foot_R.heel': 12,
          'shoulder_R.flex': 20, 'shoulder_R.abd': 15, 'shoulder_R.rot': 0, 'elbow_R.flex': 90,
          'shoulder_L.flex': 20, 'shoulder_L.abd': 15, 'elbow_L.flex': 80, 'neck.rot': 5 } },
      ],
    },
    // ---------------- сальто назад: присед, мах руками, толчок, группировка, оборот, приземление ----------------
    {
      id: 'flip', group: 'sport', dur: 2.6, flights: [[0.33, 0.58]], turn: { 'root.pitch': -360 },
      base: both({ 'shoulder_*.abd': 10 }),
      keys: [
        { t: 0.0, j: both({ 'root.pitch': 0, 'hip_*.flex': 0, 'knee_*.flex': 0, 'ankle_*.dorsi': 0, 'toe_*.ext': 0, 'shoulder_*.flex': 0, 'elbow_*.flex': 10, 'lumbar.flex': 0, 'neck.flex': 0 }) },
        { t: 0.12, j: both({ 'root.pitch': 0, 'hip_*.flex': 0, 'knee_*.flex': 0, 'ankle_*.dorsi': 0, 'shoulder_*.flex': 0 }) },
        { t: 0.3, j: both({ 'root.pitch': 12, 'hip_*.flex': 70, 'knee_*.flex': 85, 'ankle_*.dorsi': 25, 'shoulder_*.flex': -30, 'elbow_*.flex': 10, 'lumbar.flex': 12, 'neck.flex': 0 }) },
        { t: 0.36, j: both({ 'root.pitch': -10, 'hip_*.flex': -5, 'knee_*.flex': 2, 'ankle_*.dorsi': -40, 'toe_*.ext': 40, 'shoulder_*.flex': 120, 'elbow_*.flex': 10, 'lumbar.flex': -15, 'neck.flex': -30 }) },
        { t: 0.41, j: both({ 'root.pitch': -95, 'hip_*.flex': 90, 'knee_*.flex': 110, 'ankle_*.dorsi': -20, 'toe_*.ext': 0, 'shoulder_*.flex': 60, 'elbow_*.flex': 60, 'lumbar.flex': 25, 'neck.flex': 20 }) },
        { t: 0.46, j: both({ 'root.pitch': -205, 'hip_*.flex': 115, 'knee_*.flex': 135, 'ankle_*.dorsi': -20, 'shoulder_*.flex': 45, 'elbow_*.flex': 80, 'lumbar.flex': 35, 'neck.flex': 35 }) },
        { t: 0.52, j: both({ 'root.pitch': -300, 'hip_*.flex': 70, 'knee_*.flex': 70, 'ankle_*.dorsi': -10, 'shoulder_*.flex': 60, 'elbow_*.flex': 30, 'lumbar.flex': 15, 'neck.flex': 10 }) },
        { t: 0.58, j: both({ 'root.pitch': -342, 'hip_*.flex': 35, 'knee_*.flex': 25, 'ankle_*.dorsi': -5, 'shoulder_*.flex': 90, 'elbow_*.flex': 10, 'lumbar.flex': 5, 'neck.flex': 0 }) },
        { t: 0.66, j: both({ 'root.pitch': -340, 'hip_*.flex': 65, 'knee_*.flex': 80, 'ankle_*.dorsi': 22, 'shoulder_*.flex': 80, 'lumbar.flex': 15, 'neck.flex': -15 }) },
        { t: 0.92, j: both({ 'root.pitch': -360, 'hip_*.flex': 2, 'knee_*.flex': 2, 'ankle_*.dorsi': 0, 'shoulder_*.flex': 5, 'elbow_*.flex': 10, 'lumbar.flex': 0, 'neck.flex': 0 }) },
      ],
    },
    // ---------------- танцевальная связка: шаг-приставка в стороны с волной руками и покачиванием ----------------
    {
      id: 'dance', group: 'sport', dur: 3.2, half: true,
      base: { 'foot_L.z': 0.14, 'foot_R.z': 0.14 },
      keys: [
        { t: 0.0, j: { 'root.x': 0, 'root.y': 0.9, 'root.yaw': 0, 'foot_L.x': 0.2, 'foot_R.x': -0.2, 'foot_L.lift': 0, 'foot_R.lift': 0, 'foot_L.heel': 0, 'foot_R.heel': 0,
          'shoulder_L.abd': 25, 'shoulder_R.abd': 25, 'shoulder_L.flex': 10, 'shoulder_R.flex': 10, 'elbow_L.flex': 70, 'elbow_R.flex': 70,
          'thoracic.lat': 0, 'neck.lat': 0, 'lumbar.rot': 0 } },
        { t: 0.12, j: { 'root.x': 0.11, 'root.y': 0.86, 'root.yaw': 10, 'foot_R.x': -0.06, 'foot_R.lift': 0.07, 'foot_R.heel': 25,
          'shoulder_R.abd': 80, 'elbow_R.flex': 60, 'shoulder_L.abd': 35, 'thoracic.lat': 5, 'lumbar.rot': 6 } },
        { t: 0.25, j: { 'root.x': 0.13, 'root.y': 0.85, 'root.yaw': 15, 'foot_R.x': 0.04, 'foot_R.lift': 0, 'foot_R.heel': 35,
          'shoulder_R.abd': 140, 'shoulder_R.flex': 30, 'elbow_R.flex': 25, 'shoulder_L.abd': 40, 'elbow_L.flex': 95,
          'thoracic.lat': 10, 'neck.lat': 12, 'lumbar.rot': 8 } },
        { t: 0.37, j: { 'root.x': 0.08, 'root.y': 0.87, 'root.yaw': 8, 'foot_R.x': -0.08, 'foot_R.lift': 0.06, 'foot_R.heel': 20,
          'shoulder_R.abd': 90, 'shoulder_R.flex': 20, 'elbow_R.flex': 50, 'thoracic.lat': 4, 'neck.lat': 4, 'lumbar.rot': 3 } },
      ],
    },
    // ---------------- ползанье на четвереньках: кисти и колени, руки и ноги накрест ----------------
    // Голень в опоре лежит на полу: сгибание колена = сгибание бедра - наклон корпуса (~68°) + 90°.
    {
      id: 'crawl', group: 'locomotion', dur: 2.0, speed: 0.3, half: true,
      ground: ['hand_L', 'hand_R', 'shin_L', 'shin_R', 'foot_L', 'toes_L', 'foot_R', 'toes_R'],
      level: [['hand_L', 'hand_R'], ['shin_L', 'shin_R', 'foot_L', 'toes_L', 'foot_R', 'toes_R']],
      support: [['hand_L', 'hand_R'], ['shin_L', 'shin_R']],
      base: { 'root.pitch': 65, 'neck.flex': -40, 'lumbar.flex': 4, 'ankle_L.dorsi': -50, 'ankle_R.dorsi': -50, 'toe_L.ext': -20, 'toe_R.ext': -20,
        'shoulder_L.abd': 6, 'shoulder_R.abd': 6, 'hip_L.abd': 6, 'hip_R.abd': 6 },
      keys: [
        { t: 0.0, j: { 'shoulder_L.flex': 80, 'elbow_L.flex': 0, 'shoulder_R.flex': 52, 'elbow_R.flex': 0,
          'hip_R.flex': 80, 'knee_R.flex': 119, 'hip_L.flex': 50, 'knee_L.flex': 89, 'root.yaw': 3, 'thoracic.rot': -3 } },
        { t: 0.25, j: { 'shoulder_L.flex': 66, 'elbow_L.flex': 0, 'shoulder_R.flex': 66, 'elbow_R.flex': 40,
          'hip_R.flex': 65, 'knee_R.flex': 104, 'hip_L.flex': 68, 'knee_L.flex': 125, 'root.yaw': 0, 'thoracic.rot': 0 } },
      ],
    },
    // ---------------- лазанье по лестнице: кисти и стопы на перекладинах, накрест ----------------
    // Лестница едет вниз (как дорожка у ходьбы): за цикл 2 перекладины по 30 см. Кисть держит
    // перекладину 3/4 цикла и опускается вместе с ней, потом тянется на две выше. Стопа - так же.
    // Ключи на полцикла; правая рука и левая нога - зеркало со сдвигом на полцикла.
    {
      id: 'climb', group: 'locomotion', dur: 2.4, speed: 0, half: true, ground: 'none',
      ladder: { z: 0.35, spacing: 0.3, base: 0, count: 10, climb: 0.6 },
      grips: [['hand_L', 0, 0.74], ['foot_R', 0, 0.74]],
      base: { 'root.y': 1.3, 'root.pitch': 6, 'neck.flex': -15, 'hand_L.x': 0.2, 'hand_R.x': -0.2, 'foot_L.x': 0.12, 'foot_R.x': -0.12, 'foot_L.heel': 8, 'foot_R.heel': 8 },
      keys: [
        { t: 0.0, j: { 'hand_L.y': 2.1, 'hand_L.z': 0.35, 'hand_R.y': 1.8, 'hand_R.z': 0.35,
          'foot_R.lift': 0.92, 'foot_R.z': 0.35, 'foot_L.lift': 0.62, 'foot_L.z': 0.35, 'foot_L.heel': 8, 'foot_R.heel': 8 } },
        { t: 0.125, j: { 'hand_L.y': 2.025, 'hand_R.y': 1.725, 'foot_R.lift': 0.845, 'foot_L.lift': 0.545 } },
        { t: 0.2, j: { 'hand_R.y': 1.68, 'hand_R.z': 0.35, 'foot_L.lift': 0.5, 'foot_L.z': 0.35, 'foot_L.heel': 8 } },
        { t: 0.25, j: { 'hand_L.y': 1.95, 'hand_L.z': 0.35, 'hand_R.y': 1.66, 'hand_R.z': 0.33, 'foot_R.lift': 0.77, 'foot_R.z': 0.35, 'foot_L.lift': 0.49, 'foot_L.z': 0.32, 'foot_L.heel': 18, 'foot_R.heel': 8 } },
        { t: 0.375, j: { 'hand_L.y': 1.875, 'hand_R.y': 1.9, 'hand_R.z': 0.24, 'foot_R.lift': 0.695, 'foot_L.lift': 0.72, 'foot_L.z': 0.2, 'foot_L.heel': 40 } },
      ],
    },
    // ---------------- плавание кролем: лицом вниз у поверхности, гребок - пронос, ноги попеременно ----------------
    // Кисти идут по путям (IK руки): гребок под водой от вытянутой вперёд руки к бедру, пронос
    // над водой с высоким локтем. Левая рука: вход 0, захват 0.15, гребок до 0.45, выход 0.5,
    // пронос до 1. Ключи на полцикла: правая рука - левая со сдвигом 0.5. Ноги - по три удара
    // на цикл, вдох в сторону проносимой руки (то вправо, то влево).
    {
      id: 'swim', group: 'locomotion', dur: 1.6, speed: 1.2, half: true, ground: 'none',
      water: { level: 1.0 },
      base: { 'root.y': 0.97, 'root.pitch': 90, 'neck.flex': -25, 'ankle_L.dorsi': -45, 'ankle_R.dorsi': -45, 'hip_L.abd': 3, 'hip_R.abd': 3 },
      keys: [
        { t: 0.0, j: { 'hand_L.x': 0.2, 'hand_L.y': 0.92, 'hand_L.z': 1.05, 'shoulder_L.rot': 0, 'hand_L.ik': 1,
          'shoulder_L.flex': 151, 'shoulder_L.abd': 1, 'elbow_L.flex': 45,
          'hand_R.x': -0.22, 'hand_R.y': 0.9, 'hand_R.z': -0.12, 'shoulder_R.rot': 20, 'hand_R.ik': 1,
          'shoulder_R.flex': -17, 'shoulder_R.abd': 13, 'elbow_R.flex': 48,
          'root.spin': 0, 'neck.rot': 0,
          'hip_L.flex': 10, 'knee_L.flex': 5, 'hip_R.flex': -10, 'knee_R.flex': 5 } },
        { t: 0.083, j: { 'knee_L.flex': 25, 'knee_R.flex': 25 } },
        { t: 0.05, j: { 'hand_R.ik': 0, 'shoulder_R.flex': -5, 'shoulder_R.abd': 40, 'elbow_R.flex': 75, 'shoulder_R.rot': 30 } },
        { t: 0.15, j: { 'hand_L.x': 0.18, 'hand_L.y': 0.75, 'hand_L.z': 0.95, 'shoulder_L.rot': 30, 'neck.rot': -55 } },
        { t: 0.1667, j: { 'hip_L.flex': -10, 'knee_L.flex': 5, 'hip_R.flex': 10, 'knee_R.flex': 5 } },
        { t: 0.25, j: { 'root.spin': -35, 'hand_L.ik': 1, 'knee_L.flex': 25, 'knee_R.flex': 25 } },
        { t: 0.15, j: { 'shoulder_R.flex': 30, 'shoulder_R.abd': 72, 'elbow_R.flex': 110, 'shoulder_R.rot': 40 } },
        { t: 0.28, j: { 'shoulder_R.flex': 100, 'shoulder_R.abd': 68, 'elbow_R.flex': 100, 'shoulder_R.rot': 30 } },
        { t: 0.3, j: { 'hand_L.x': 0.1, 'hand_L.y': 0.62, 'hand_L.z': 0.55, 'neck.rot': -40 } },
        { t: 0.3333, j: { 'hip_L.flex': 10, 'knee_L.flex': 5, 'hip_R.flex': -10, 'knee_R.flex': 5 } },
        { t: 0.4, j: { 'shoulder_R.flex': 145, 'shoulder_R.abd': 30, 'elbow_R.flex': 55, 'shoulder_R.rot': 10, 'neck.rot': 0 } },
        { t: 0.45, j: { 'hand_R.ik': 0, 'shoulder_R.flex': 151, 'shoulder_R.abd': 2, 'elbow_R.flex': 46, 'hand_L.ik': 1 } },
        { t: 0.417, j: { 'knee_L.flex': 25, 'knee_R.flex': 25 } },
        { t: 0.45, j: { 'hand_L.x': 0.18, 'hand_L.y': 0.75, 'hand_L.z': 0.0, 'shoulder_L.rot': 20 } },
      ],
    },
  ];

  return { MOVES, both };
});
