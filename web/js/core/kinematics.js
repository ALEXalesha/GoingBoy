// Прямая кинематика: углы суставов -> положение и поворот каждой кости в мире.
// Плюс то, что нужно всем остальным частям ядра: якобиан (куда сдвигается точка при повороте
// сустава), центр масс, капсулы кожи в мире, отражение и смешивание поз, проверка пределов.
//
// Поза: { root: { pos: [x, y, z], rot: [рысканье, тангаж, крен, вращение] }, a: Float64Array углов }.
// Вращение - вокруг собственной продольной оси тела (позвоночника), уже после тангажа: так
// лежащий пловец перекатывается с боку на бок.
// root.pos - начало таза в мире, углы - градусы, a[i] - степень свободы Skeleton.DOFS[i].
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vec.js'), require('../body/skeleton.js'));
  else (root.GB = root.GB || {}).Kin = factory(root.GB.Vec, root.GB.Skeleton);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S) {
  'use strict';

  const NB = S.BONES.length;
  const ND = S.DOFS.length;

  function restPose() {
    return { root: { pos: S.BONES[0].offset.slice(), rot: [0, 0, 0, 0] }, a: new Float64Array(ND) };
  }

  function clone(p) {
    return { root: { pos: p.root.pos.slice(), rot: p.root.rot.slice() }, a: Float64Array.from(p.a) };
  }

  /** Поза из записи вида { root: {pos, rot}, j: { 'knee_L.flex': 40 } }; чего нет - 0. */
  function poseFrom(o) {
    const p = restPose();
    if (o && o.root) {
      if (o.root.pos) p.root.pos = o.root.pos.slice();
      if (o.root.rot) p.root.rot = [0, 1, 2, 3].map((k) => o.root.rot[k] || 0);
    }
    if (o && o.j) {
      for (const k of Object.keys(o.j)) {
        if (!(k in S.DOF)) throw new Error('нет такой степени свободы: ' + k);
        p.a[S.DOF[k]] = o.j[k];
      }
    }
    return p;
  }

  const get = (p, key) => p.a[S.DOF[key]];
  function set(p, key, v) { p.a[S.DOF[key]] = v; return p; }

  /** Поворот кости относительно родителя от её степеней свободы (k - доля углов, 1 - целиком). */
  function localRot(p, bone, k = 1) {
    let q = V.QI;
    for (const i of S.BONE_DOFS[bone]) {
      const d = S.DOFS[i];
      q = V.qMul(q, V.qAxis(V.AXES[d.axis], d.sign * p.a[i] * k * V.DEG));
    }
    return q;
  }

  /** Мировые начала костей и их повороты. */
  function fk(p) {
    const pos = new Array(NB), rot = new Array(NB);
    for (let b = 0; b < NB; b++) {
      const par = S.PARENT[b];
      if (par < 0) {
        pos[b] = p.root.pos.slice();
        rot[b] = V.qMul(V.qEulerYXZ(p.root.rot[0], p.root.rot[1], p.root.rot[2]), V.qAxis(V.AXES.y, (p.root.rot[3] || 0) * V.DEG));
      } else {
        pos[b] = V.add(pos[par], V.qRot(rot[par], S.BONES[b].offset));
        rot[b] = V.qMul(rot[par], localRot(p, b));
      }
    }
    return { pos, rot };
  }

  /** Точка, заданная в координатах кости, - в мире. */
  const point = (f, bone, local) => V.add(f.pos[bone], V.qRot(f.rot[bone], local));
  const tail = (f, bone) => point(f, bone, S.BONES[bone].tail);

  // sub[a][b]: кость b лежит в поддереве кости a (включая саму a) - её двигает сустав кости a
  const SUB = S.BONES.map(() => new Uint8Array(NB));
  for (let b = 0; b < NB; b++) for (let a = b; a >= 0; a = S.PARENT[a]) SUB[a][b] = 1;
  const inSubtree = (anc, b) => SUB[anc][b] === 1;

  /**
   * Мировые оси степеней свободы: поворот на 1 радиан вокруг axis с центром pivot.
   * Скорость точки p кости b по степени i: axis × (p - pivot), если b в поддереве кости i.
   */
  function dofAxes(p, f) {
    const out = new Array(ND);
    for (let b = 0; b < NB; b++) {
      const list = S.BONE_DOFS[b];
      if (!list.length) continue;
      let q = f.rot[S.PARENT[b]];
      for (const i of list) {
        const d = S.DOFS[i];
        out[i] = { pivot: f.pos[b], axis: V.scale(V.qRot(q, V.AXES[d.axis]), d.sign), bone: b };
        q = V.qMul(q, V.qAxis(V.AXES[d.axis], d.sign * p.a[i] * V.DEG));
      }
    }
    return out;
  }

  /** Производная мировой точки world (сидит на кости bone) по углу i, м/рад. */
  function dPoint(axes, i, bone, world) {
    const ax = axes[i];
    if (!inSubtree(ax.bone, bone)) return [0, 0, 0];
    return V.cross(ax.axis, V.sub(world, ax.pivot));
  }

  function segmentCom(f, b) { return point(f, b, S.BONES[b].com); }

  /** Центр масс всего тела. */
  function com(f) {
    let c = [0, 0, 0];
    for (let b = 0; b < NB; b++) if (S.BONES[b].mass > 0) c = V.add(c, V.scale(segmentCom(f, b), S.BONES[b].mass));
    return c;
  }

  /** Капсулы кожи в мире: { bone, a, b, r }. */
  function capsules(f) {
    const out = [];
    for (let b = 0; b < NB; b++) for (const [a, c, r] of S.BONES[b].caps) out.push({ bone: b, a: point(f, b, a), b: point(f, b, c), r });
    return out;
  }

  /** Самая низкая точка кожи среди костей bones (все кости, если не задано). */
  function lowest(f, bones) {
    let m = Infinity;
    for (const c of capsules(f)) {
      if (bones && !bones.includes(c.bone)) continue;
      m = Math.min(m, Math.min(c.a[1], c.b[1]) - c.r);
    }
    return m;
  }

  /** Отражение позы слева направо (плоскость x = 0). */
  function mirror(p) {
    const q = restPose();
    q.root.pos = [-p.root.pos[0], p.root.pos[1], p.root.pos[2]];
    q.root.rot = [-p.root.rot[0], p.root.rot[1], -p.root.rot[2], -(p.root.rot[3] || 0)];
    S.DOFS.forEach((d, i) => { q.a[S.DOF[S.mirrorKey(d.key)]] = p.a[i] * S.mirrorSign(d.key); });
    return q;
  }

  /**
   * Смешать две позы: углы суставов - линейно (кости вращаются, а не растягиваются), корпус
   * поворачивается по короткой дуге, чтобы после сальто человек не крутился обратно.
   */
  function blend(p0, p1, w) {
    const q = restPose();
    q.root.pos = V.lerp(p0.root.pos, p1.root.pos, w);
    q.root.rot = [0, 1, 2, 3].map((k) => { const r = p0.root.rot[k] || 0; return r + V.wrapDeg((p1.root.rot[k] || 0) - r) * w; });
    for (let i = 0; i < ND; i++) q.a[i] = p0.a[i] + (p1.a[i] - p0.a[i]) * w;
    return q;
  }

  /** Нарушения пределов суставов: [{ key, value, min, max }]; tol - допуск в градусах. */
  function violations(p, tol = 1e-6) {
    const out = [];
    S.DOFS.forEach((d, i) => {
      const v = p.a[i];
      if (!(v >= d.min - tol && v <= d.max + tol)) out.push({ key: d.key, value: v, min: d.min, max: d.max });
    });
    return out;
  }

  /** Поставить углы в пределы. */
  function clampPose(p) {
    const q = clone(p);
    S.DOFS.forEach((d, i) => { q.a[i] = Math.min(d.max, Math.max(d.min, q.a[i])); });
    return q;
  }

  /** Длины костей: от начала кости до начала каждого ребёнка и до её конца. */
  function boneLengths(f) {
    const out = [];
    for (let b = 1; b < NB; b++) out.push(V.dist(f.pos[S.PARENT[b]], f.pos[b]));
    for (let b = 0; b < NB; b++) out.push(V.dist(f.pos[b], tail(f, b)));
    return out;
  }

  return { NB, ND, restPose, clone, poseFrom, get, set, localRot, fk, point, tail, inSubtree, dofAxes, dPoint,
    segmentCom, com, capsules, lowest, mirror, blend, violations, clampPose, boneLengths };
});
