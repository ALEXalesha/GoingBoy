// МОДЕЛЬ ТЕЛА, часть 1: скелет. Это единственное описание человека, на которое опирается ядро:
// имена костей, иерархия, позы покоя, суставы с анатомическими пределами, массы сегментов и
// форма кожи капсулами. Модель из Blender (.glb) должна иметь кости с ТЕМИ ЖЕ именами
// (договор - docs/body-model.md); тогда её можно поставить вместо procedural.js, не трогая ядро.
//
// Оси: метры, Y вверх, человек смотрит на +Z, его левая сторона - +X. Поза покоя - стоя,
// руки опущены вдоль тела ладонями к бёдрам. В покое все кости повёрнуты как мир (поворот
// единичный), поэтому углы суставов сразу анатомические: 0 - стойка, сгибание колена 90 -
// колено согнуто под прямым углом.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.GB = root.GB || {}).Skeleton = factory();
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MASS = 70; // кг, всё тело

  // Кости левой стороны пишутся один раз; правые получаются отражением x -> -x.
  // offset - где начинается кость относительно начала родителя (в покое), tail - конец кости
  // относительно её начала, mass - доля массы тела, com - центр масс сегмента,
  // caps - кожа: капсулы [a, b, радиус] в координатах кости.
  const CENTER = [
    { name: 'pelvis', parent: null, offset: [0, 0.95, 0], tail: [0, 0.07, 0], mass: 0.142, com: [0, 0, 0],
      caps: [[[-0.07, -0.01, 0], [0.07, -0.01, 0], 0.11]] },
    { name: 'spine', parent: 'pelvis', offset: [0, 0.07, 0], tail: [0, 0.20, 0], mass: 0.139, com: [0, 0.1, 0],
      caps: [[[0, 0.03, 0], [0, 0.17, 0], 0.105]] },
    { name: 'chest', parent: 'spine', offset: [0, 0.20, 0], tail: [0, 0.23, 0], mass: 0.216, com: [0, 0.12, 0],
      caps: [[[-0.06, 0.05, 0], [0.06, 0.05, 0], 0.115], [[-0.09, 0.15, -0.01], [0.09, 0.15, -0.01], 0.10]] },
    { name: 'neck', parent: 'chest', offset: [0, 0.23, 0], tail: [0, 0.10, 0], mass: 0.010, com: [0, 0.05, 0],
      caps: [[[0, 0, 0], [0, 0.09, 0], 0.05]] },
    { name: 'head', parent: 'neck', offset: [0, 0.10, 0], tail: [0, 0.20, 0], mass: 0.071, com: [0, 0.1, 0.01],
      caps: [[[0, 0.08, 0.01], [0, 0.12, 0], 0.095]] },
  ];
  const LEFT = [
    { name: 'clavicle_L', parent: 'chest', offset: [0.02, 0.17, 0.03], tail: [0.17, 0.02, -0.03], mass: 0, com: [0.08, 0.01, 0],
      caps: [[[0.02, 0, 0], [0.15, 0.02, -0.03], 0.045]] },
    { name: 'upperarm_L', parent: 'clavicle_L', offset: [0.17, 0.02, -0.03], tail: [0, -0.30, 0], mass: 0.028, com: [0, -0.13, 0],
      caps: [[[0, -0.02, 0], [0, -0.28, 0], 0.05]] },
    { name: 'forearm_L', parent: 'upperarm_L', offset: [0, -0.30, 0], tail: [0, -0.26, 0], mass: 0.016, com: [0, -0.11, 0],
      caps: [[[0, -0.02, 0], [0, -0.24, 0], 0.04]] },
    { name: 'hand_L', parent: 'forearm_L', offset: [0, -0.26, 0], tail: [0, -0.18, 0], mass: 0.006, com: [0, -0.07, 0],
      caps: [[[0, -0.02, 0], [0, -0.15, 0.01], 0.03]] },
    { name: 'thigh_L', parent: 'pelvis', offset: [0.09, -0.03, 0], tail: [0, -0.42, 0], mass: 0.100, com: [0, -0.18, 0],
      caps: [[[0, -0.03, 0], [0, -0.39, 0], 0.075]] },
    { name: 'shin_L', parent: 'thigh_L', offset: [0, -0.42, 0], tail: [0, -0.42, 0], mass: 0.0465, com: [0, -0.18, 0],
      caps: [[[0, -0.03, 0], [0, -0.38, 0], 0.055]] },
    { name: 'foot_L', parent: 'shin_L', offset: [0, -0.42, 0], tail: [0, -0.055, 0.14], mass: 0.0145, com: [0, -0.04, 0.05],
      caps: [[[0, -0.045, -0.04], [0, -0.045, 0.13], 0.035]] },
    { name: 'toes_L', parent: 'foot_L', offset: [0, -0.055, 0.14], tail: [0, -0.01, 0.06], mass: 0, com: [0, 0, 0.03],
      caps: [[[0, -0.005, 0.005], [0, -0.01, 0.045], 0.015]] },
  ];

  const mx = (v) => [-v[0], v[1], v[2]];
  function mirrorBone(b) {
    return {
      ...b,
      name: b.name.replace(/_L$/, '_R'),
      parent: b.parent.replace(/_L$/, '_R'),
      offset: mx(b.offset), tail: mx(b.tail), com: mx(b.com),
      caps: b.caps.map(([a, c, r]) => [mx(a), mx(c), r]),
    };
  }

  const BONES = [...CENTER, ...LEFT, ...LEFT.map(mirrorBone)].map((b, i) => Object.freeze({ ...b, index: i }));
  const BONE = {};
  for (const b of BONES) BONE[b.name] = b;
  const PARENT = BONES.map((b) => (b.parent ? BONE[b.parent].index : -1));

  // Суставы. Степени свободы применяются по порядку записи (каждая - в осях после предыдущей).
  // sign переводит анатомический угол в поворот вокруг оси: для левой стороны так, как
  // записано; правая отражается - знаки осей y и z меняются, ось x остаётся.
  // Пределы - градусы, по таблицам подвижности суставов здорового взрослого (округлено).
  const CENTER_JOINTS = [
    { id: 'lumbar', bone: 'spine', dofs: [['flex', 'x', 1, -25, 45], ['lat', 'z', -1, -20, 20], ['rot', 'y', 1, -15, 15]] },
    { id: 'thoracic', bone: 'chest', dofs: [['flex', 'x', 1, -20, 35], ['lat', 'z', -1, -20, 20], ['rot', 'y', 1, -35, 35]] },
    { id: 'neck', bone: 'neck', dofs: [['flex', 'x', 1, -45, 45], ['lat', 'z', -1, -35, 35], ['rot', 'y', 1, -70, 70]] },
    { id: 'atlas', bone: 'head', dofs: [['flex', 'x', 1, -20, 20]] },
  ];
  const LEFT_JOINTS = [
    { id: 'sc_L', bone: 'clavicle_L', dofs: [['elev', 'z', 1, -10, 40], ['protr', 'y', -1, -25, 25]] },
    { id: 'shoulder_L', bone: 'upperarm_L', dofs: [['flex', 'x', -1, -60, 180], ['abd', 'z', 1, -30, 180], ['rot', 'y', -1, -80, 70]] },
    { id: 'elbow_L', bone: 'forearm_L', dofs: [['flex', 'x', -1, 0, 150], ['pron', 'y', -1, -80, 80]] },
    { id: 'wrist_L', bone: 'hand_L', dofs: [['flex', 'z', -1, -70, 80], ['dev', 'x', -1, -30, 20]] },
    { id: 'hip_L', bone: 'thigh_L', dofs: [['flex', 'x', -1, -25, 125], ['abd', 'z', 1, -30, 50], ['rot', 'y', -1, -40, 45]] },
    { id: 'knee_L', bone: 'shin_L', dofs: [['flex', 'x', 1, 0, 145]] },
    { id: 'ankle_L', bone: 'foot_L', dofs: [['dorsi', 'x', -1, -50, 30], ['inv', 'z', -1, -20, 30]] },
    { id: 'toe_L', bone: 'toes_L', dofs: [['ext', 'x', -1, -30, 80]] },
  ];
  function mirrorJoint(j) {
    return {
      id: j.id.replace(/_L$/, '_R'),
      bone: j.bone.replace(/_L$/, '_R'),
      dofs: j.dofs.map(([n, ax, s, lo, hi]) => [n, ax, ax === 'x' ? s : -s, lo, hi]),
    };
  }
  const JOINTS = [...CENTER_JOINTS, ...LEFT_JOINTS, ...LEFT_JOINTS.map(mirrorJoint)].map((j) => Object.freeze({
    id: j.id, bone: BONE[j.bone].index, side: /_L$/.test(j.id) ? 'L' : /_R$/.test(j.id) ? 'R' : '',
    dofs: Object.freeze(j.dofs.map(([name, axis, sign, min, max]) => Object.freeze({ name, axis, sign, min, max }))),
  }));
  const JOINT = {};
  for (const j of JOINTS) JOINT[j.id] = j;

  // Плоский список степеней свободы: поза - это массив углов в этом порядке.
  const DOFS = [];
  for (const j of JOINTS) {
    j.dofs.forEach((d, k) => DOFS.push(Object.freeze({ key: j.id + '.' + d.name, joint: j.id, bone: j.bone, k, ...d })));
  }
  const DOF = {};
  DOFS.forEach((d, i) => { DOF[d.key] = i; });
  // У каждой кости - её степени свободы по порядку (у таза их нет: он свободен целиком)
  const BONE_DOFS = BONES.map(() => []);
  DOFS.forEach((d, i) => BONE_DOFS[d.bone].push(i));

  /** Ключ степени свободы на другой стороне тела ('hip_L.flex' -> 'hip_R.flex'). */
  function mirrorKey(key) {
    if (/_L\./.test(key)) return key.replace('_L.', '_R.');
    if (/_R\./.test(key)) return key.replace('_R.', '_L.');
    return key;
  }
  /** Знак при отражении: боковые наклоны и повороты позвоночника и шеи меняют знак. */
  function mirrorSign(key) {
    return /^(lumbar|thoracic|neck)\.(lat|rot)$/.test(key) ? -1 : 1;
  }

  // Капсулы, которые стоят на полу, когда человек стоит (подошвы)
  const SOLE_BONES = ['foot_L', 'toes_L', 'foot_R', 'toes_R'].map((n) => BONE[n].index);

  return Object.freeze({ MASS, BONES, BONE, PARENT, JOINTS, JOINT, DOFS, DOF, BONE_DOFS, SOLE_BONES, mirrorKey, mirrorSign });
});
