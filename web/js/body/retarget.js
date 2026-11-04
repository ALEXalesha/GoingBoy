// Пересадка позы на чужой скелет (модель из Blender, .glb) с теми же именами костей.
//
// У нашего скелета в покое все кости повёрнуты как мир (поворот единичный), поэтому мировой
// поворот кости R из kinematics.fk - это и есть её поворот ОТ ПОЗЫ ПОКОЯ. У кости в .glb в покое
// свой мировой поворот Q0 (Blender направляет ось Y вдоль кости, крен любой). Тогда в позе её
// мировой поворот Q = R · Q0, а локальный (то, что пишется в кость three.js) -
// conj(Q родителя) · Q. Позы покоя должны совпадать по форме: стоя, руки вдоль тела
// (договор - docs/body-model.md).
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/vec.js'), require('./skeleton.js'));
  else (root.GB = root.GB || {}).Retarget = factory(root.GB.Vec, root.GB.Skeleton);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S) {
  'use strict';

  /**
   * restWorld: { имя кости: мировой поворот покоя в .glb [x, y, z, w] }, f: kinematics.fk(поза).
   * Возвращает { имя: локальный поворот для кости .glb } и положение корня (таза).
   */
  function retarget(restWorld, f) {
    const world = {};
    const local = {};
    for (const b of S.BONES) {
      const q0 = restWorld[b.name];
      if (!q0) throw new Error('в модели нет кости ' + b.name);
      world[b.name] = V.qNorm(V.qMul(f.rot[b.index], q0));
      local[b.name] = b.parent ? V.qNorm(V.qMul(V.qConj(world[b.parent]), world[b.name])) : world[b.name];
    }
    return { local, rootPos: f.pos[0].slice() };
  }

  /** Скелет для выгрузки: имя, родитель, начало и конец кости в покое (мир, метры, Y вверх). */
  function describe() {
    const head = [];
    for (const b of S.BONES) head[b.index] = b.parent ? V.add(head[S.BONE[b.parent].index], b.offset) : b.offset.slice();
    return S.BONES.map((b) => ({ name: b.name, parent: b.parent, head: head[b.index], tail: V.add(head[b.index], b.tail) }));
  }

  return { retarget, describe };
});
