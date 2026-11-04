// Режим «за курсором»: человечек тянется к игрушке, которую водит курсор.
//
// Цель - точка в мире. Далеко - он поворачивается к ней и идёт (очень далеко - бежит); если
// цель низко у пола - ползёт к ней на четвереньках. Рядом - достаёт рукой (IK): высоко над
// головой - подпрыгивает с поднятыми руками, по пояс - приседает, у самого пола - встаёт на
// четвереньки и тянется вниз. Смена поведения - с плавным переходом и с запасом по порогам,
// чтобы на границе не дёргался туда-сюда.
//
// Позы движений берутся из тех же движений (moves.js), только корпус ставится в мир:
// положение pos и направление yaw, шаг вперёд - со скоростью движения, поэтому стопы не
// скользят по полу.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vec.js'), require('../body/skeleton.js'), require('./kinematics.js'), require('./anim.js'), require('./moves.js'), require('./ik.js'));
  else (root.GB = root.GB || {}).Follow = factory(root.GB.Vec, root.GB.Skeleton, root.GB.Kin, root.GB.Anim, root.GB.Moves, root.GB.IK);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S, K, A, Moves, IK) {
  'use strict';

  const MV = {};
  for (const id of ['walk', 'run', 'crawl', 'squat', 'jump']) MV[id] = A.compile(Moves.MOVES.find((m) => m.id === id));

  const C = Object.freeze({
    REACH: 0.55,       // ближе - тянется рукой, дальше - идёт
    HYST: 0.15,        // запас порогов
    RUN: 2.5,          // дальше - бежит
    LOW: 0.45,         // ниже - ползёт / на четвереньках
    SQUAT: 0.95,       // ниже - приседает
    JUMP: 2.05,        // выше - прыгает
    TURN: 220,         // поворот, градусов в секунду
    FACE: 35,          // идёт, только если смотрит на цель точнее
    FADE: 0.35,        // переход между поведениями, с
    MIN_HOLD: 0.3,     // поведение держится не меньше, с
  });

  function create() {
    return { pos: [0, 0], yaw: 0, mode: 'stand', hold: 0, phase: 0, from: null, fade: C.FADE, last: null, t: 0 };
  }

  const wrap = V.wrapDeg;

  /** Куда смотреть и насколько далеко цель (по полу, от таза). */
  function relation(st, target) {
    const dx = target[0] - st.pos[0], dz = target[2] - st.pos[1];
    return { d: Math.hypot(dx, dz), bearing: Math.atan2(dx, dz) / V.DEG };
  }

  /** Какое поведение нужно (с запасом, чтобы не дёргаться на границе). */
  function choose(st, target) {
    const { d } = relation(st, target);
    const h = target[1];
    const m = st.mode;
    const near = d < C.REACH + (['stand', 'reach', 'squat', 'kneel', 'jump'].includes(m) ? C.HYST : 0);
    const low = h < C.LOW + (['crawl', 'kneel'].includes(m) ? C.HYST : 0);
    if (!near) {
      if (low) return 'crawl';
      return d > C.RUN + (m === 'run' ? -C.HYST : C.HYST) ? 'run' : 'walk';
    }
    if (low) return 'kneel';
    if (h > C.JUMP + (m === 'jump' ? -C.HYST : 0)) return 'jump';
    if (h < C.SQUAT + (m === 'squat' ? C.HYST : 0)) return 'squat';
    return 'reach';
  }

  /** Поза движения в своих осях -> в мир: повернуть на yaw и поставить в pos. */
  function place(p, st) {
    const q = K.clone(p);
    const c = Math.cos(st.yaw * V.DEG), s = Math.sin(st.yaw * V.DEG);
    const [x, y, z] = p.root.pos;
    q.root.pos = [st.pos[0] + x * c + z * s, y, st.pos[1] - x * s + z * c];
    q.root.rot[0] = p.root.rot[0] + st.yaw;
    return q;
  }

  /** Своя (не мировая) поза поведения в текущей фазе. */
  function basePose(st, target) {
    switch (st.mode) {
      case 'walk': case 'run': case 'crawl': case 'jump':
        return A.sample(MV[st.mode], st.phase);
      case 'squat': {
        // глубина приседа - по высоте цели: чем ниже, тем глубже (фаза спуска 0..0.45)
        const k = Math.min(1, Math.max(0, (C.SQUAT - target[1]) / (C.SQUAT - C.LOW)));
        return A.sample(MV.squat, 0.12 + 0.33 * k);
      }
      case 'kneel':
        return A.sample(MV.crawl, 0.0);
      default:
        return K.restPose();
    }
  }

  /** Достать цель ближней рукой (IK), если поведение - тянуться. */
  function reach(p, st, target) {
    if (!['reach', 'squat', 'kneel', 'jump'].includes(st.mode)) return p;
    // рука со стороны цели: в своих осях человечка левая - +x
    const c = Math.cos(st.yaw * V.DEG), s = Math.sin(st.yaw * V.DEG);
    const lx = (target[0] - st.pos[0]) * c - (target[2] - st.pos[1]) * s;
    const hand = lx >= 0 ? 'hand_L' : 'hand_R';
    if (st.mode === 'jump') {
      // в прыжке обе руки вверх к цели - отдельной IK не нужно, дотягивается сам прыжок
      return p;
    }
    return IK.drag(p, hand, target, 30).pose;
  }

  /**
   * Шаг: сдвинуть человечка за целью на dt секунд. Возвращает позу в мире.
   */
  function step(st, target, dt) {
    st.t += dt;
    st.hold += dt;
    const want = choose(st, target);
    if (want !== st.mode && st.hold >= C.MIN_HOLD) {
      st.from = st.last;
      st.fade = 0;
      st.mode = want;
      st.hold = 0;
      // своя фаза у каждого движения: начинаем с начала цикла
      st.phase = want === 'jump' ? 0.15 : 0;
    }
    const { bearing } = relation(st, target);
    const turn = wrap(bearing - st.yaw);
    const moving = ['walk', 'run', 'crawl'].includes(st.mode);
    // поворот к цели: на ходу и стоя (в прыжке и на четвереньках не крутится)
    if (st.mode !== 'jump' && st.mode !== 'kneel') st.yaw = wrap(st.yaw + Math.max(-C.TURN * dt, Math.min(C.TURN * dt, turn)));
    if (moving) {
      const mv = MV[st.mode];
      // идёт, только когда смотрит на цель; на месте перебирает ногами медленно
      const go = Math.abs(turn) < C.FACE ? 1 : 0.3;
      st.phase = (st.phase + (dt * go) / mv.dur) % 1;
      const v = mv.speed * go;
      st.pos[0] += Math.sin(st.yaw * V.DEG) * v * dt;
      st.pos[1] += Math.cos(st.yaw * V.DEG) * v * dt;
    } else if (st.mode === 'jump') {
      st.phase = (st.phase + dt / MV.jump.dur) % 1;
    }
    let p = place(basePose(st, target), st);
    p = reach(p, st, target);
    st.fade = Math.min(C.FADE, st.fade + dt);
    if (st.from && st.fade < C.FADE) {
      const w = st.fade / C.FADE;
      p = K.blend(st.from, p, w * w * (3 - 2 * w));
      const low = K.lowest(K.fk(p));
      if (low < 0) p.root.pos[1] -= low;
    }
    st.last = K.clone(p);
    return p;
  }

  return { C, MV, create, choose, step, relation };
});
