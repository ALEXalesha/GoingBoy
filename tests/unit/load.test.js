// Законы нагрузки и подсветки. Главный: мышца горит, только когда она помогает суставу,
// которому сейчас нужен момент её знака (сгибатель - когда сустав надо сгибать против
// нагрузки), а сустав под заметной нагрузкой всегда держит хотя бы одна мышца.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, SEED } = require('./helpers');

const V = load('core/vec.js');
const S = load('body/skeleton.js');
const K = load('core/kinematics.js');
const M = load('body/muscles.js');
const Ld = load('core/load.js');
const A = load('core/anim.js');
const { MOVES } = load('core/moves.js');

const W = S.MASS * 9.81;
const compiled = MOVES.map((m) => A.compile(m));
const at = (id, ph) => {
  const mv = compiled.find((m) => m.id === id);
  return Ld.analyzeAt((t) => A.at(mv, t), ph * mv.dur, 0.03, A.envAt(mv, ph));
};
const act = (r, id) => r.act[M.MUSCLE[id]];
const still = (p) => Ld.analyze({ prev: p, pose: p, next: p, h: 0.03 });

test('стойка без движения: опоры несут ровно вес, моменты вокруг центра масс уравновешены', () => {
  const r = still(K.restPose());
  const F = r.contacts.reduce((s, c) => V.add(s, c.force), [0, 0, 0]);
  assert.ok(Math.abs(F[1] - W) < 1e-3 && Math.abs(F[0]) < 1e-3 && Math.abs(F[2]) < 1e-3, `опоры ${F}`);
  let Mo = [0, 0, 0];
  for (const c of r.contacts) Mo = V.add(Mo, V.cross(V.sub(c.point, r.com), c.force));
  assert.ok(V.len(Mo) < 0.5, 'момент опор ' + V.len(Mo));
  for (const c of r.contacts) assert.ok(c.force[1] >= 0, 'пол только толкает');
  // в стойке мышцы почти отдыхают
  assert.ok(Math.max(...r.act) < 0.15, 'в стойке что-то горит: ' + Math.max(...r.act));
});

test('опоры: на одной ноге вся сила на ней, у отжимания руки несут больше ног (рычаг)', () => {
  const p = K.poseFrom({ j: { 'hip_R.flex': 60, 'knee_R.flex': 90 } });
  p.root.pos[1] -= K.lowest(K.fk(p));
  const r = still(p);
  const right = r.contacts.filter((c) => /_R$/.test(S.BONES[c.bone].name)).length;
  assert.equal(right, 0, 'правая нога поднята');
  const push = at('pushup', 0.05);
  const sum = (re) => push.contacts.filter((c) => re.test(S.BONES[c.bone].name)).reduce((s, c) => s + c.force[1], 0);
  const hands = sum(/^hand/), feet = sum(/^(foot|toes)/);
  assert.ok(hands > feet * 1.3, `руки ${hands.toFixed(0)} Н, ноги ${feet.toFixed(0)} Н`);
  assert.ok(Math.abs(hands + feet - W) < 0.15 * W, 'всего примерно вес');
});

test('вис на перекладине: держат только кисти, вместе - вес тела', () => {
  const r = at('pullup', 0.05);
  assert.ok(r.contacts.length >= 2 && r.contacts.every((c) => !c.floor), 'только перекладина');
  const F = r.contacts.reduce((s, c) => s + c.force[1], 0);
  assert.ok(Math.abs(F - W) < 0.1 * W, 'сила хвата ' + F);
});

// Главный закон подсветки - на каждом кадре каждого движения.
test('подсветка согласована с моментом в суставе на всех кадрах всех движений', () => {
  const bad = [];
  for (const mv of compiled) {
    for (let i = 0; i < 24; i++) {
      const ph = i / 24;
      const r = Ld.analyzeAt((t) => A.at(mv, t), ph * mv.dur, 0.03, A.envAt(mv, ph));
      // 1) горящая мышца помогает хотя бы одному суставу, которому нужен момент её знака
      r.act.forEach((a, mi) => {
        if (a <= 0.05) return;
        const helps = r.arms[mi].some(({ dof, r: arm }) => M.DRIVEN[dof] && arm * r.tau[dof] > 0 && Math.abs(r.tau[dof]) >= Ld.TAU_MIN);
        if (!helps) bad.push(`${mv.id}@${i}: ${M.MUSCLES[mi].id} горит, но никому не помогает`);
      });
      // 2) сустав под нагрузкой держит хотя бы одна мышца нужного знака
      for (let d = 0; d < K.ND; d++) {
        if (!M.DRIVEN[d] || Math.abs(r.tau[d]) < 5) continue;
        const ag = r.arms.flatMap((list, mi) => list.filter((x) => x.dof === d && x.r * r.tau[d] > 0).map(() => mi));
        if (ag.length && !ag.some((mi) => r.act[mi] > 0.01)) bad.push(`${mv.id}@${i}: ${S.DOFS[d].key} под нагрузкой, мышцы не горят`);
      }
      // 3) односуставной антагонист при заметном моменте не горит
      for (let d = 0; d < K.ND; d++) {
        if (!M.DRIVEN[d] || Math.abs(r.tau[d]) < 5) continue;
        r.arms.forEach((list, mi) => {
          if (list.length !== 1 || list[0].dof !== d) return;
          if (list[0].r * r.tau[d] < 0 && r.act[mi] > 0.01) bad.push(`${mv.id}@${i}: антагонист ${M.MUSCLES[mi].id} горит`);
        });
      }
    }
  }
  assert.deepEqual(bad.slice(0, 8), []);
});

// Эталонные позы: то, что знает любой тренер.
test('эталонные позы: горят те мышцы, что работают в этом упражнении', () => {
  const lit = (r, id) => act(r, id + '_L') > 0.1 && act(r, id + '_R') > 0.1;
  const dark = (r, id) => act(r, id + '_L') < 0.02 && act(r, id + '_R') < 0.02;
  const squat = at('squat', 0.5);
  assert.ok(lit(squat, 'vasti'), 'присед: четырёхглавая');
  assert.ok(lit(squat, 'gluteus_max') || lit(squat, 'hamstrings'), 'присед: разгибатели бедра');
  assert.ok(dark(squat, 'triceps'), 'присед: трицепс отдыхает');
  const push = at('pushup', 0.5);
  assert.ok(lit(push, 'triceps') && lit(push, 'pectoralis'), 'отжимание: трицепс и грудная');
  assert.ok(dark(push, 'biceps'), 'отжимание: бицепс отдыхает');
  const pull = at('pullup', 0.35);
  assert.ok(lit(pull, 'latissimus') && lit(pull, 'biceps'), 'подтягивание: широчайшая и бицепс');
  assert.ok(dark(pull, 'deltoid_ant') && dark(pull, 'vasti'), 'подтягивание: передняя дельта и бёдра отдыхают');
  const jump = at('jump', 0.4);
  assert.ok(lit(jump, 'soleus') || lit(jump, 'gastrocnemius'), 'толчок прыжка: икры');
  assert.ok(lit(jump, 'vasti'), 'толчок прыжка: четырёхглавая');
  const lunge = at('lunge', 0.5);
  assert.ok(act(lunge, 'gluteus_max_L') > 0.1 || act(lunge, 'hamstrings_L') > 0.1, 'выпад: разгибатели бедра передней ноги');
  assert.ok(act(lunge, 'vasti_L') > 0.1 && act(lunge, 'vasti_R') > 0.1, 'выпад: четырёхглавые обеих ног');
});

test('что мышца делает: сокращается, держит, тормозит или отдыхает', () => {
  assert.equal(Ld.state(0, -1), 'rest');
  assert.equal(Ld.state(0.5, -0.1), 'shorten');
  assert.equal(Ld.state(0.5, 0.1), 'brake');
  assert.equal(Ld.state(0.5, 0), 'hold');
  // подъём из приседа - четырёхглавая сокращается, спуск - тормозит
  const up = at('squat', 0.7), down = at('squat', 0.3);
  assert.equal(Ld.state(act(up, 'vasti_L'), up.vel[M.MUSCLE.vasti_L]), 'shorten');
  assert.equal(Ld.state(act(down, 'vasti_L'), down.vel[M.MUSCLE.vasti_L]), 'brake');
});

test('без опор (полёт) силы опор нулевые; случайные стойки - пол только толкает', () => {
  const r = rng(SEED + 30);
  for (let n = 0; n < 50; n++) {
    const p = K.poseFrom({ j: { 'hip_L.flex': r() * 60, 'knee_L.flex': r() * 60, 'hip_R.flex': r() * 60 - 20, 'lumbar.flex': r() * 30 } });
    p.root.pos[1] -= K.lowest(K.fk(p));
    for (const c of still(p).contacts) assert.ok(c.force[1] >= -1e-9);
  }
  const p = K.restPose(); p.root.pos[1] = 2;
  const fl = still(p);
  assert.equal(fl.contacts.length, 0);
  assert.deepEqual(Ld.contactForces([], [0, 100, 0], [0, 1, 0]), []);
});

test('опоры уравновешивают и силы, и моменты веса и инерции (резкий мах руками стоя)', () => {
  const base = K.poseFrom({ j: { 'hip_L.abd': 6, 'hip_R.abd': 6 } });
  base.root.pos[1] -= K.lowest(K.fk(base));
  const swing = (deg) => { const p = K.clone(base); for (const s of ['L', 'R']) K.set(p, `shoulder_${s}.flex`, 60 + deg); return p; };
  const h = 0.03;
  // руки разгоняются вперёд-вверх: угловое ускорение ~40 рад/с² (резкий, но живой мах)
  const r = Ld.analyze({ prev: swing(-4), pose: swing(0), next: swing(6), h });
  assert.ok(r.contacts.length >= 4, 'стоит на двух стопах');
  // сумма сил и моментов (вокруг центра масс) опор и сил тяжести с инерцией = 0
  const f = r.f;
  const fp = K.fk(swing(-4)), fn = K.fk(swing(6));
  let F = [0, 0, 0], Mo = [0, 0, 0];
  for (let b = 0; b < S.BONES.length; b++) {
    const m = S.BONES[b].mass * S.MASS;
    if (!m) continue;
    const c = K.segmentCom(f, b);
    const acc = V.scale(V.add(V.sub(K.segmentCom(fn, b), V.scale(c, 2)), K.segmentCom(fp, b)), 1 / (h * h));
    const Fi = V.scale(V.sub([0, -9.81, 0], acc), m);
    F = V.add(F, Fi);
    Mo = V.add(Mo, V.cross(V.sub(c, r.com), Fi));
  }
  const inertia = V.len(Mo);
  assert.ok(inertia > 5, 'мах должен требовать заметного момента: ' + inertia);
  for (const c of r.contacts) { F = V.add(F, c.force); Mo = V.add(Mo, V.cross(V.sub(c.point, r.com), c.force)); }
  assert.ok(V.len(F) < 1, 'силы не уравновешены: ' + V.len(F));
  assert.ok(V.len(Mo) < 1, 'моменты не уравновешены: ' + V.len(Mo).toFixed(2) + ' Н·м');
});

// Плавание: вода держит и тормозит, а гребок толкает - по физике.
test('кроль: гребок под водой, пронос над водой', () => {
  const mv = compiled.find((m) => m.id === 'swim');
  const level = A.envAt(mv, 0).water.level;
  const hand = (ph) => K.point(K.fk(A.sample(mv, ph)), S.BONE.hand_L.index, A.GRIP);
  for (let ph = 0.15; ph <= 0.45; ph += 0.02) assert.ok(hand(ph)[1] < level, `гребок над водой в фазе ${ph.toFixed(2)}`);
  let top = -Infinity;
  for (let ph = 0.6; ph <= 0.9; ph += 0.02) top = Math.max(top, hand(ph)[1]);
  assert.ok(top > level + 0.05, `пронос не поднимается над водой: ${(top - level).toFixed(3)}`);
});

test('кроль: вода держит тело, гребок даёт тягу вперёд, в гребке горит широчайшая', () => {
  const mv = compiled.find((m) => m.id === 'swim');
  // гребок левой: сила воды на кисть и предплечье направлена вперёд (+z)
  let thrust = 0;
  for (let ph = 0.2; ph <= 0.42; ph += 0.02) {
    const r = Ld.analyzeAt((t) => A.at(mv, t), ph * mv.dur, 0.03, A.envAt(mv, ph));
    assert.equal(r.contacts.length, 0, 'в воде опор нет');
    for (const sgm of r.segs) if (['hand_L', 'forearm_L'].includes(S.BONES[sgm.bone].name)) {
      const m = S.BONES[sgm.bone].mass * S.MASS;
      // сила воды = полная сила минус вес и инерция; проще - сравнить с тем же кадром без воды
      thrust += sgm.F[2];
      void m;
    }
  }
  const dry = (() => {
    let z = 0;
    for (let ph = 0.2; ph <= 0.42; ph += 0.02) {
      const r = Ld.analyzeAt((t) => A.at(mv, t), ph * mv.dur, 0.03, {});
      for (const sgm of r.segs) if (['hand_L', 'forearm_L'].includes(S.BONES[sgm.bone].name)) z += sgm.F[2];
    }
    return z;
  })();
  assert.ok(thrust - dry > 20, `тяга гребка ${(thrust - dry).toFixed(1)} Н`);
  const mid = at('swim', 0.32);
  assert.ok(act(mid, 'latissimus_L') > 0.1, 'в гребке горит широчайшая: ' + act(mid, 'latissimus_L'));
  // неподвижное тело в воде: выталкивание держит вес, мышцам почти нечего делать
  const p = K.poseFrom({ root: { pos: [0, 0.97, 0], rot: [0, 90, 0] } });
  const still = Ld.analyze({ prev: p, pose: p, next: p, h: 0.03, env: { water: { level: 1.2, flow: 0 }, floor: false } });
  assert.ok(Math.max(...still.act) < 0.05, 'лежит на воде без усилия');
});

test('лазанье: кисти держат перекладины, стопы на них давят и несут часть веса', () => {
  const mv = compiled.find((m) => m.id === 'climb');
  for (const ph of [0.05, 0.3, 0.55, 0.8]) {
    const r = Ld.analyzeAt((t) => A.at(mv, t), ph * mv.dur, 0.03, A.envAt(mv, ph));
    const feet = r.contacts.filter((c) => /^(foot|toes)/.test(S.BONES[c.bone].name));
    const hands = r.contacts.filter((c) => /^hand/.test(S.BONES[c.bone].name));
    assert.ok(hands.length >= 1 && feet.length >= 1, `фаза ${ph}: опоры ${hands.length} кисти, ${feet.length} стопы`);
    const footLoad = feet.reduce((s, c) => s + c.force[1], 0);
    assert.ok(footLoad > 0.2 * W, `фаза ${ph}: стопы несут ${footLoad.toFixed(0)} Н`);
    for (const c of feet) assert.ok(c.force[1] >= -1e-9, 'стопа только давит');
    assert.ok(r.contacts.every((c) => c.point[1] > 0.3), 'пола на лестнице нет');
  }
});

test('мышца не горит из-за плеча меньше 3 мм: такое плечо не даёт заметного момента', () => {
  const bad = [];
  for (const mv of compiled) {
    for (let i = 0; i < 24; i++) {
      const ph = i / 24;
      const r = Ld.analyzeAt((t) => A.at(mv, t), ph * mv.dur, 0.03, A.envAt(mv, ph));
      r.act.forEach((a, mi) => {
        if (a <= 0.05) return;
        const real = r.arms[mi].some(({ dof, r: arm }) => M.DRIVEN[dof] && arm * r.tau[dof] > 0 && Math.abs(arm) >= Ld.ARM_MIN && Math.abs(r.tau[dof]) >= Ld.TAU_MIN);
        if (!real) bad.push(`${mv.id}@${i}: ${M.MUSCLES[mi].id} ${Math.round(a * 100)}%`);
      });
    }
  }
  assert.deepEqual(bad.slice(0, 6), []);
});
