// Русский и английский: интерфейс, движения, мышцы (название и что делает), кости, суставы.
// Язык по умолчанию - язык браузера (ru, если он русский, иначе en); выбор запоминается.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.GB = root.GB || {}).I18n = factory();
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UI = {
    title: ['GoingBoy - как движется тело', 'GoingBoy - how the body moves'],
    app: ['GoingBoy', 'GoingBoy'],
    g_locomotion: ['Передвижение', 'Moving'],
    g_exercise: ['Упражнения', 'Exercises'],
    g_sport: ['Спорт и танец', 'Sport and dance'],
    g_pose: ['Своя поза', 'Your pose'],
    walk: ['Ходьба', 'Walk'], run: ['Бег', 'Run'], jump: ['Прыжок', 'Jump'],
    squat: ['Присед', 'Squat'], pushup: ['Отжимание', 'Push-up'], pullup: ['Подтягивание', 'Pull-up'], lunge: ['Выпад', 'Lunge'],
    kick: ['Удар по мячу', 'Kick'], throw: ['Бросок', 'Throw'], flip: ['Сальто назад', 'Back flip'], dance: ['Танец', 'Dance'],
    pose: ['Своя поза', 'Your pose'],
    pose_hint: ['Тяните за шарики на кистях, стопах и голове - тело подстроится', 'Drag the balls on the hands, feet and head - the body follows'],
    pose_reset: ['Сбросить позу', 'Reset pose'],
    layers: ['Слои', 'Layers'], skin: ['Кожа', 'Skin'], muscles: ['Мышцы', 'Muscles'], bones: ['Кости', 'Bones'],
    labels: ['Подписи', 'Labels'], angles: ['Углы', 'Angles'],
    play: ['Пуск', 'Play'], pause: ['Пауза', 'Pause'], speed: ['Скорость', 'Speed'],
    camera_reset: ['Камера заново', 'Reset camera'],
    camera_hint: ['Камера: тяните фон мышью, колесо - ближе/дальше', 'Camera: drag the background, wheel to zoom'],
    theme: ['Тема', 'Theme'], lang: ['Язык', 'Language'],
    th_glass: ['Стеклянная', 'Glass'], th_formal: ['Строгая', 'Formal'], th_light: ['Светлая', 'Light'], th_night: ['Ночная', 'Night'], th_warm: ['Тёплая', 'Warm'],
    load: ['Нагрузка', 'Load'], work: ['Работа', 'Work'],
    st_rest: ['отдыхает', 'at rest'], st_shorten: ['работает, сокращаясь', 'working, shortening'],
    st_hold: ['держит', 'holding'], st_brake: ['тормозит, удлиняясь', 'braking, lengthening'],
    side_L: ['левая', 'left'], side_R: ['правая', 'right'], side_Lm: ['левый', 'left'], side_Rm: ['правый', 'right'],
    angle: ['Угол', 'Angle'], torque: ['Момент', 'Torque'],
    joint_angles: ['Углы суставов', 'Joint angles'],
    top_muscles: ['Сейчас работают', 'Working now'],
    nothing: ['почти ничего - стоит свободно', 'almost nothing - standing at ease'],
    hover_hint: ['Наведите на мышцу, кость или сустав', 'Point at a muscle, bone or joint'],
    how_title: ['Как читать', 'How to read'],
    how_text: ['Красный - мышца нужна суставу прямо сейчас: чем краснее, тем больше доля её силы. Подсветка считается из веса, инерции и опор, а не наугад.',
      'Red means the joint needs this muscle right now: the redder, the larger the share of its strength. The glow is computed from weight, inertia and support, not at random.'],
    fps: ['к/с', 'fps'],
    floor_force: ['Опора', 'Support'],
    newton: ['Н', 'N'], nm: ['Н·м', 'N·m'],
  };

  // Мышцы: название и что делает (то же, что объявлено в body/muscles.js - act)
  const MUSCLES = {
    gluteus_max: [['Большая ягодичная', 'разгибает бедро: встать из приседа, толкнуть тело вверх'], ['Gluteus maximus', 'extends the hip: rising from a squat, pushing the body up']],
    gluteus_med: [['Средняя ягодичная', 'отводит бедро и держит таз ровно, когда стоишь на одной ноге'], ['Gluteus medius', 'abducts the hip and keeps the pelvis level on one leg']],
    iliopsoas: [['Подвздошно-поясничная', 'сгибает бедро: поднимает колено вперёд'], ['Iliopsoas', 'flexes the hip: lifts the knee forward']],
    adductors: [['Приводящие бедра', 'приводят бедро к середине, помогают на опоре'], ['Hip adductors', 'pull the thigh to the midline, help in stance']],
    rectus_fem: [['Прямая мышца бедра', 'разгибает колено и сгибает бедро (до 100°)'], ['Rectus femoris', 'extends the knee and flexes the hip (up to 100°)']],
    vasti: [['Широкие мышцы бедра', 'часть четырёхглавой: разгибают колено'], ['Vastus muscles', 'part of the quadriceps: extend the knee']],
    hamstrings: [['Задняя поверхность бедра', 'сгибают колено и разгибают бедро'], ['Hamstrings', 'flex the knee and extend the hip']],
    gastrocnemius: [['Икроножная', 'поднимает пятку (подошвенное сгибание), помогает сгибать колено'], ['Gastrocnemius', 'raises the heel (plantar flexion), helps flex the knee']],
    soleus: [['Камбаловидная', 'поднимает пятку, держит голень, когда стоишь'], ['Soleus', 'raises the heel, steadies the shin when standing']],
    tibialis_ant: [['Передняя большеберцовая', 'поднимает носок (тыльное сгибание), поворачивает стопу внутрь'], ['Tibialis anterior', 'lifts the toes (dorsiflexion), turns the sole inward']],
    rectus_abd: [['Прямая мышца живота', 'сгибает туловище вперёд'], ['Rectus abdominis', 'flexes the trunk forward']],
    oblique_ext: [['Наружная косая живота', 'наклоняет туловище в свою сторону и поворачивает в другую'], ['External oblique', 'bends the trunk to its side and turns it to the other side']],
    erector: [['Выпрямитель спины', 'разгибает спину, держит её прямой в наклоне'], ['Erector spinae', 'extends the back, keeps it straight when leaning']],
    pectoralis: [['Большая грудная', 'приводит руку к телу (до 85° отведения) и поворачивает её внутрь'], ['Pectoralis major', 'pulls the arm to the body (up to 85° abduction) and turns it inward']],
    latissimus: [['Широчайшая спины', 'опускает поднятую руку вниз и назад, приводит её к телу'], ['Latissimus dorsi', 'pulls a raised arm down and back, brings it to the body']],
    deltoid_ant: [['Передняя дельта', 'поднимает руку вперёд (до 105°)'], ['Anterior deltoid', 'raises the arm forward (up to 105°)']],
    deltoid_mid: [['Средняя дельта', 'поднимает руку в сторону'], ['Middle deltoid', 'raises the arm to the side']],
    deltoid_post: [['Задняя дельта', 'отводит руку назад'], ['Posterior deltoid', 'moves the arm back']],
    trapezius: [['Верх трапециевидной', 'поднимает плечевой пояс'], ['Upper trapezius', 'raises the shoulder girdle']],
    biceps: [['Бицепс плеча', 'сгибает локоть'], ['Biceps', 'flexes the elbow']],
    triceps: [['Трицепс плеча', 'разгибает локоть'], ['Triceps', 'extends the elbow']],
    wrist_flex: [['Сгибатели кисти', 'сгибают кисть к ладони'], ['Wrist flexors', 'bend the hand toward the palm']],
    wrist_ext: [['Разгибатели кисти', 'разгибают кисть'], ['Wrist extensors', 'bend the hand back']],
    scm: [['Грудино-ключично-сосцевидная', 'наклоняет голову вперёд и поворачивает в другую сторону'], ['Sternocleidomastoid', 'bends the head forward and turns it to the other side']],
    splenius: [['Ременная мышца', 'запрокидывает голову, держит её'], ['Splenius', 'tilts the head back, holds it up']],
  };

  const BONES = {
    pelvis: [['Таз', 'опора туловища, к нему крепятся ноги'], ['Pelvis', 'base of the trunk, the legs attach to it']],
    spine: [['Поясничный отдел позвоночника', 'гнётся и немного поворачивается'], ['Lumbar spine', 'bends and turns a little']],
    chest: [['Грудная клетка', 'грудной отдел позвоночника и рёбра'], ['Rib cage', 'thoracic spine and ribs']],
    neck: [['Шея', 'шейный отдел позвоночника'], ['Neck', 'cervical spine']],
    head: [['Голова', 'череп'], ['Head', 'skull']],
    clavicle: [['Ключица и лопатка', 'плечевой пояс: на нём держится рука'], ['Clavicle and scapula', 'shoulder girdle that carries the arm']],
    upperarm: [['Плечевая кость', 'кость плеча'], ['Humerus', 'upper arm bone']],
    forearm: [['Кости предплечья', 'лучевая и локтевая'], ['Forearm bones', 'radius and ulna']],
    hand: [['Кисть', 'кости запястья, пясти и пальцев'], ['Hand', 'wrist, palm and finger bones']],
    thigh: [['Бедренная кость', 'самая длинная кость тела'], ['Femur', 'the longest bone of the body']],
    shin: [['Кости голени', 'большеберцовая и малоберцовая'], ['Shin bones', 'tibia and fibula']],
    foot: [['Стопа', 'предплюсна и плюсна'], ['Foot', 'tarsus and metatarsus']],
    toes: [['Пальцы стопы', 'фаланги'], ['Toes', 'phalanges']],
  };

  const JOINTS = {
    lumbar: [['Поясница', 'Lower back']], thoracic: [['Грудной отдел', 'Thoracic spine']], neck: [['Шея', 'Neck']], atlas: [['Кивок головы', 'Head nod']],
    sc: [['Плечевой пояс', 'Shoulder girdle']], shoulder: [['Плечевой сустав', 'Shoulder']], elbow: [['Локоть', 'Elbow']], wrist: [['Запястье', 'Wrist']],
    hip: [['Тазобедренный сустав', 'Hip']], knee: [['Колено', 'Knee']], ankle: [['Голеностоп', 'Ankle']], toe: [['Пальцы стопы', 'Toe joints']],
  };

  const DOFS = {
    flex: ['сгибание', 'flexion'], abd: ['отведение', 'abduction'], rot: ['поворот внутрь', 'internal rotation'],
    lat: ['наклон влево', 'left bend'], pron: ['пронация', 'pronation'], dev: ['отведение к большому пальцу', 'radial deviation'],
    dorsi: ['тыльное сгибание', 'dorsiflexion'], inv: ['инверсия', 'inversion'], ext: ['разгибание', 'extension'],
    elev: ['подъём', 'elevation'], protr: ['вынос вперёд', 'protraction'],
  };

  const LANGS = ['ru', 'en'];
  const state = { lang: 'ru' };
  const ix = () => (state.lang === 'en' ? 1 : 0);

  function setLang(l) { state.lang = LANGS.includes(l) ? l : 'ru'; return state.lang; }
  /** Язык по строке браузера: русский - ru, всё остальное - en. */
  const detect = (navLang) => (/^ru\b/i.test(navLang || '') ? 'ru' : 'en');

  function t(key) {
    const v = UI[key];
    if (!v) throw new Error('нет строки ' + key);
    return v[ix()];
  }

  const sideOf = (id) => (/_L$/.test(id) ? 'L' : /_R$/.test(id) ? 'R' : '');
  const baseOf = (id) => id.replace(/_[LR]$/, '');

  /** Мышца по id (gluteus_max_L): { name, does }. */
  function muscle(id) {
    const [name, does] = MUSCLES[baseOf(id)][ix()];
    const s = sideOf(id);
    return { name: s ? `${name} (${t('side_' + s)})` : name, does };
  }

  function bone(id) {
    const [name, does] = BONES[baseOf(id)][ix()];
    const s = sideOf(id);
    return { name: s ? `${name} (${t('side_' + s)})` : name, does };
  }

  function joint(id) {
    const name = JOINTS[baseOf(id)][0][ix()];
    const s = sideOf(id);
    return s ? `${name} (${t('side_' + s + 'm')})` : name;
  }

  const dof = (name) => DOFS[name][ix()];

  return { UI, MUSCLES, BONES, JOINTS, DOFS, LANGS, state, setLang, detect, t, muscle, bone, joint, dof };
});
