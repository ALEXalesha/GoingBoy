// Законы текстов: у каждой мышцы, кости, сустава и движения есть название на обоих языках,
// описание мышцы совпадает с тем, что она делает по модели, темы - пять, как в PaintPro.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

const I = load('core/i18n.js');
const S = load('body/skeleton.js');
const M = load('body/muscles.js');
const T = load('core/themes.js');
const { MOVES } = load('core/moves.js');

test('тексты: всё есть на двух языках и не пустое', () => {
  for (const [k, v] of Object.entries(I.UI)) {
    assert.equal(v.length, 2, k);
    for (const s of v) assert.ok(typeof s === 'string' && s.trim(), k);
  }
  for (const lang of I.LANGS) {
    I.setLang(lang);
    for (const m of MOVES) assert.ok(I.t(m.id));
    for (const g of new Set(MOVES.map((m) => m.group))) assert.ok(I.t('g_' + g));
    for (const m of M.MUSCLES) { const x = I.muscle(m.id); assert.ok(x.name && x.does, m.id); }
    for (const b of S.BONES) { const x = I.bone(b.name); assert.ok(x.name && x.does, b.name); }
    for (const j of S.JOINTS) assert.ok(I.joint(j.id), j.id);
    for (const d of S.DOFS) assert.ok(I.dof(d.name), d.key);
    for (const t of T.THEMES) assert.ok(I.t('th_' + t.id));
  }
  I.setLang('ru');
});

test('тексты: правая и левая различаются, неизвестный язык - русский, язык браузера', () => {
  I.setLang('ru');
  assert.notEqual(I.muscle('biceps_L').name, I.muscle('biceps_R').name);
  assert.match(I.muscle('biceps_L').name, /левая/);
  assert.match(I.joint('knee_R'), /правый/);
  assert.equal(I.joint('neck'), 'Шея');
  assert.equal(I.bone('pelvis').name, 'Таз');
  assert.equal(I.setLang('de'), 'ru');
  assert.equal(I.detect('ru-RU'), 'ru');
  assert.equal(I.detect('en-US'), 'en');
  assert.equal(I.detect(undefined), 'en');
  assert.throws(() => I.t('нет-такой'));
  I.setLang('en');
  assert.equal(I.t('walk'), 'Walk');
  I.setLang('ru');
});

// Описание мышцы - не выдумка: каждое действие из модели упомянуто в русском описании.
test('описание мышцы называет те действия, что объявлены в модели', () => {
  const WORDS = {
    'hip.flex': [/сгибает бедро|поднимает колено/, /разгиба[а-я]+ бедро/], 'hip.abd': [/отводит бедро/, /привод[а-я]+ бедро/],
    'knee.flex': [/сгиба[а-я]+ колено/, /разгиба[а-я]+ колено/], 'ankle.dorsi': [/поднимает носок/, /поднимает пятку/], 'ankle.inv': [/внутрь/, /наружу/],
    'lumbar.flex': [/сгибает туловище/, /разгибает спину/], 'thoracic.flex': [/сгибает туловище/, /разгибает спину/],
    'lumbar.lat': [/наклоняет туловище в свою сторону/, /./], 'lumbar.rot': [/./, /поворачивает в другую/],
    'shoulder.flex': [/вперёд/, /назад/], 'shoulder.abd': [/в сторону/, /к телу/], 'shoulder.rot': [/внутрь/, /наружу/],
    'sc.elev': [/поднимает плечевой пояс/, /опускает/], 'elbow.flex': [/сгибает локоть/, /разгибает локоть/],
    'wrist.flex': [/сгибают кисть/, /разгибают кисть/], 'neck.flex': [/вперёд/, /запрокидывает/], 'neck.rot': [/./, /в другую сторону/],
  };
  I.setLang('ru');
  for (const m of M.MUSCLES.filter((x) => x.side === 'L')) {
    const does = I.muscle(m.id).does;
    for (const [key, claim] of Object.entries(m.act)) {
      const general = key.replace(/_[LR]\./, '.');
      const re = WORDS[general][claim.sign > 0 ? 0 : 1];
      assert.match(does, re, `${m.id}: «${does}» не говорит про ${general} ${claim.sign > 0 ? '+' : '-'}`);
    }
  }
});

test('темы: пять, неизвестная - стеклянная', () => {
  assert.deepEqual(T.IDS, ['glass', 'formal', 'light', 'night', 'warm']);
  assert.equal(T.get('nope').id, 'glass');
  assert.equal(T.get('light').dark, false);
});
