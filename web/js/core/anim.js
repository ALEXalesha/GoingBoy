// Анимация: движение из ключевых кадров -> поза в любой момент времени.
//
// Движение описывается ключами по фазе 0..1 (см. moves.js). Каждый канал (угол сустава или
// корпус) интерполируется отдельно монотонным кубическим сплайном (PCHIP): кривая проходит
// через ключи и не выскакивает за их значения, поэтому если ключи в пределах сустава, то и все
// кадры между ними тоже. Обычный сплайн Катмулла-Рома так не умеет - колено, выпрямленное
// в ключе до 0, между ключами прогибалось бы назад.
//
// После углов корпус ставится на место:
//   ground - самая низкая точка опорных костей касается пола (по умолчанию подошвы);
//   flights - в полёте центр масс летит по параболе с g = 9.81 между отрывом и приземлением;
//   hang - хват на перекладине: кисти держат её, тело висит;
//   level - тангаж корпуса подбирается так, чтобы две группы опор (кисти и носки) были на полу;
//   pin - кисти стоят на месте по горизонтали (отжимание: тело качается вокруг них);
//   каналы foot_L.x/z/lift/heel/yaw - стопа стоит в заданной точке, ногу ставит limb.js.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vec.js'), require('../body/skeleton.js'), require('./kinematics.js'), require('./limb.js'));
  else (root.GB = root.GB || {}).Anim = factory(root.GB.Vec, root.GB.Skeleton, root.GB.Kin, root.GB.Limb);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (V, S, K, L) {
  'use strict';

  const G = 9.81;
  const ROOT_CH = ['root.x', 'root.y', 'root.z', 'root.yaw', 'root.pitch', 'root.roll'];
  const FOOT_CH = /^foot_[LR]\.(x|z|lift|heel|yaw)$/;
  const known = (key) => ROOT_CH.includes(key) || FOOT_CH.test(key) || key in S.DOF;

  /** Наклоны PCHIP (Фрич - Бутленд) во внутренних узлах; на краях массива - 0. */
  function pchipSlopes(t, y) {
    const n = t.length, m = new Array(n).fill(0);
    for (let k = 1; k < n - 1; k++) {
      const h0 = t[k] - t[k - 1], h1 = t[k + 1] - t[k];
      const d0 = (y[k] - y[k - 1]) / h0, d1 = (y[k + 1] - y[k]) / h1;
      m[k] = d0 * d1 > 0 ? 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1) : 0;
    }
    return m;
  }

  function hermite(t0, t1, y0, y1, m0, m1, t) {
    const h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1;
  }

  /** Периодический канал: узлы на [0, 1), значение через период больше на drift. */
  function makeChannel(knots, drift) {
    const n = knots.length;
    const t = [], y = [];
    for (let r = -1; r <= 1; r++) for (const [kt, ky] of knots) { t.push(kt + r); y.push(ky + r * drift); }
    return { t, y, m: pchipSlopes(t, y), n };
  }

  function evalChannel(c, ph) {
    // ph в [0, 1): ищем отрезок среди средней копии узлов (индексы n .. 2n)
    let i = c.n - 1;
    while (i + 1 < c.t.length - 1 && c.t[i + 1] <= ph) i++;
    return hermite(c.t[i], c.t[i + 1], c.y[i], c.y[i + 1], c.m[i], c.m[i + 1], ph);
  }

  /** Отражение одного канала: имя на другой стороне и множитель. */
  function mirrorChannel(key) {
    if (key === 'root.x' || key === 'root.yaw' || key === 'root.roll') return [key, -1];
    if (key.startsWith('root.')) return [key, 1];
    if (FOOT_CH.test(key)) {
      const other = key.replace(/^foot_L/, 'foot_X').replace(/^foot_R/, 'foot_L').replace(/^foot_X/, 'foot_R');
      return [other, /\.(x|yaw)$/.test(key) ? -1 : 1];
    }
    return [S.mirrorKey(key), S.mirrorSign(key)];
  }

  /**
   * Собрать движение: ключи -> каналы. Ключ: { t, j: { 'knee_L.flex': 40, 'root.pitch': -10 } }.
   * half: ключи описывают полцикла [0, 0.5), вторая половина - зеркало (ходьба, бег).
   */
  function compile(def) {
    let keys = def.keys.map((k) => ({ t: k.t, j: { ...k.j } }));
    let flights = (def.flights || []).map((f) => f.slice());
    if (def.half) {
      const mirrored = keys.map((k) => {
        const j = {};
        for (const [key, v] of Object.entries(k.j)) { const [mk, s] = mirrorChannel(key); j[mk] = v * s; }
        return { t: k.t + 0.5, j };
      });
      keys = keys.concat(mirrored);
      flights = flights.concat(flights.map(([a, b]) => [a + 0.5, b + 0.5]));
    }
    keys.sort((a, b) => a.t - b.t);
    const names = new Set();
    for (const k of keys) for (const key of Object.keys(k.j)) {
      if (!known(key)) throw new Error(`${def.id}: нет канала ${key}`);
      names.add(key);
    }
    const channels = {};
    for (const key of names) {
      const knots = keys.filter((k) => key in k.j).map((k) => [k.t, k.j[key]]);
      const drift = (def.turn && def.turn[key]) || 0;
      channels[key] = makeChannel(knots, drift);
    }
    const base = {};
    for (const [key, v] of Object.entries(def.base || {})) {
      if (!known(key)) throw new Error(`${def.id}: нет канала ${key}`);
      base[key] = v;
    }
    const ground = def.ground === 'none' ? null
      : (def.ground || ['foot_L', 'toes_L', 'foot_R', 'toes_R']).map((n) => S.BONE[n].index);
    const level = def.level ? def.level.map((g) => g.map((n) => S.BONE[n].index)) : null;
    const hang = def.hang ? { bar: def.hang.bar.slice(), grip: def.hang.grip.map((n) => S.BONE[n].index) } : null;
    const pin = def.pin ? { at: def.pin.at.slice(), bones: def.pin.bones.map((n) => S.BONE[n].index) } : null;
    const feet = ['L', 'R'].filter((s) => `foot_${s}.x` in channels || `foot_${s}.x` in base);
    return { id: def.id, dur: def.dur, speed: def.speed || 0, def, channels, base, ground, level, hang, pin, feet, flights, cache: {} };
  }

  /** Значение канала в фазе ph (из ключей, из base или dflt). */
  function channel(mv, key, ph, dflt = 0) {
    return mv.channels[key] ? evalChannel(mv.channels[key], ((ph % 1) + 1) % 1) : key in mv.base ? mv.base[key] : dflt;
  }

  /** Углы и корпус по каналам, без постановки на пол. */
  function rawPose(mv, ph) {
    const val = (key, dflt) => channel(mv, key, ph, dflt);
    const p = K.restPose();
    for (let i = 0; i < K.ND; i++) p.a[i] = val(S.DOFS[i].key, 0);
    p.root.pos = [val('root.x', 0), val('root.y', S.BONES[0].offset[1]), val('root.z', 0)];
    p.root.rot = [val('root.yaw', 0), val('root.pitch', 0), val('root.roll', 0)];
    for (const s of mv.feet) {
      L.plantFoot(p, s, val(`foot_${s}.x`, 0), val(`foot_${s}.z`, 0), val(`foot_${s}.heel`, 0), val(`foot_${s}.yaw`, 0), val(`foot_${s}.lift`, 0));
    }
    return p;
  }

  /** Середина группы точек захвата (кисть: 8 см от запястья). */
  function gripMid(f, bones) {
    const pts = bones.map((b) => K.point(f, b, [0, -0.08, 0]));
    return V.scale(pts.reduce((a, g) => V.add(a, g), [0, 0, 0]), 1 / pts.length);
  }

  /** Вис: тело поворачивается (тангаж), пока центр масс не окажется точно под хватом. */
  function solveHang(p, grip) {
    const off = (pitch) => {
      const q = K.clone(p); q.root.rot[1] = pitch;
      const f = K.fk(q);
      return K.com(f)[2] - gripMid(f, grip)[2];
    };
    let lo = p.root.rot[1] - 45, hi = p.root.rot[1] + 45, flo = off(lo);
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2, fm = off(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    p.root.rot[1] = (lo + hi) / 2;
  }

  /** Подобрать тангаж так, чтобы низ двух групп опор был на одной высоте. */
  function solveLevel(p, groups) {
    const diff = (pitch) => {
      const q = K.clone(p); q.root.rot[1] = pitch;
      const f = K.fk(q);
      return K.lowest(f, groups[0]) - K.lowest(f, groups[1]);
    };
    let lo = p.root.rot[1] - 40, hi = p.root.rot[1] + 40;
    let flo = diff(lo);
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2, fm = diff(mid);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    p.root.rot[1] = (lo + hi) / 2;
  }

  /** Поза, стоящая на полу (или висящая на перекладине) - без учёта полёта. */
  function supported(mv, ph) {
    const p = rawPose(mv, ph);
    if (mv.level) solveLevel(p, mv.level);
    if (mv.hang) {
      solveHang(p, mv.hang.grip);
      p.root.pos = V.add(p.root.pos, V.sub(mv.hang.bar, gripMid(K.fk(p), mv.hang.grip)));
    } else {
      if (mv.pin) {
        const m = gripMid(K.fk(p), mv.pin.bones);
        p.root.pos[0] += mv.pin.at[0] - m[0];
        p.root.pos[2] += mv.pin.at[1] - m[2];
      }
      if (mv.ground) p.root.pos[1] -= K.lowest(K.fk(p), mv.ground);
    }
    return p;
  }

  function flightAt(mv, ph) {
    for (const f of mv.flights) {
      const a = f[0], b = f[1];
      if (ph > a && ph < b) return f;
      if (ph + 1 > a && ph + 1 < b) return [a - 1, b - 1];
    }
    return null;
  }

  function comY(mv, ph) {
    const key = ph.toFixed(9);
    if (!(key in mv.cache)) mv.cache[key] = K.com(K.fk(supported(mv, ((ph % 1) + 1) % 1)))[1];
    return mv.cache[key];
  }

  /** Поза движения в фазе ph (0..1). */
  function sample(mv, ph) {
    ph = ((ph % 1) + 1) % 1;
    const p = supported(mv, ph);
    const fl = flightAt(mv, ph);
    if (fl) {
      const [a, b] = fl;
      const s = (ph - a) / (b - a);
      const c0 = comY(mv, a), c1 = comY(mv, b);
      const ta = (ph - a) * mv.dur, tb = (b - ph) * mv.dur;
      const target = c0 + (c1 - c0) * s + 0.5 * G * ta * tb;
      p.root.pos[1] += target - K.com(K.fk(p))[1];
    }
    return p;
  }

  /** Поза в момент времени (секунды от начала движения). */
  const at = (mv, time) => sample(mv, time / mv.dur);

  // ---------- проигрыватель: текущее движение, скорость, пауза, плавный переход ----------
  const FADE = 0.4; // секунды перехода между движениями
  const smooth = (x) => x * x * (3 - 2 * x);

  function createPlayer() {
    return { mv: null, still: null, time: 0, speed: 1, paused: false, from: null, fade: FADE };
  }

  /** Поза проигрывателя сейчас (с переходом от прошлой позы). */
  function current(pl) {
    const p = pl.mv ? at(pl.mv, pl.time) : K.clone(pl.still || K.restPose());
    if (!pl.from || pl.fade >= FADE) return p;
    const q = K.blend(pl.from, p, smooth(pl.fade / FADE));
    // смесь двух поз, стоящих на полу, может чуть уйти под пол - приподнимаем
    const low = K.lowest(K.fk(q));
    if (low < 0) q.root.pos[1] -= low;
    return q;
  }

  /** Включить движение (или неподвижную позу: still) с переходом от того, что сейчас. */
  function play(pl, mv, still) {
    pl.from = pl.mv || pl.still ? current(pl) : null;
    pl.fade = pl.from ? 0 : FADE;
    pl.mv = mv || null;
    pl.still = mv ? null : (still ? K.clone(still) : K.restPose());
    pl.time = 0;
  }

  function step(pl, dt) {
    if (pl.paused) return;
    const d = dt * pl.speed;
    pl.time += d;
    pl.fade = Math.min(FADE, pl.fade + d);
  }

  return { G, FADE, gripMid, channel, compile, sample, at, rawPose, pchipSlopes, hermite, makeChannel, evalChannel, flightAt,
    createPlayer, current, play, step };
});
