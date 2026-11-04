// Законы страницы в настоящем браузере (headless Chromium, без захвата мыши).
'use strict';
const { test, expect } = require('@playwright/test');
const { open, freeze, overlap } = require('./helpers');

const MOVES = ['walk', 'run', 'jump', 'crawl', 'climb', 'swim', 'squat', 'pushup', 'pullup', 'lunge', 'kick', 'throw', 'flip', 'dance'];

test('страница: открывается без ошибок, все движения и своя поза играют', async ({ page }) => {
  const errors = await open(page);
  for (const id of [...MOVES, 'pose', 'follow']) {
    const ok = await page.evaluate((m) => {
      GB.app.setMove(m);
      for (let i = 0; i < 20; i++) GB.app.tick(1 / 30);
      const p = GB.app.pose();
      return GB.app.state().move === m && p.a.every(Number.isFinite) && p.root.pos.every(Number.isFinite);
    }, id);
    expect(ok, id).toBe(true);
  }
  expect(errors).toEqual([]);
  await expect(page.locator('#moves button')).toHaveCount(16);
});

test('слои: кожа, мышцы, кости переключаются кнопками; пустой сцены не бывает', async ({ page }) => {
  await open(page);
  const layers = () => page.evaluate(() => GB.app.state().layers);
  await page.click('#layers [data-layer="skin"]');
  expect((await layers()).skin).toBe(true);
  await page.click('#layers [data-layer="muscles"]');
  await page.click('#layers [data-layer="bones"]');
  expect(await layers()).toEqual({ skin: true, muscles: false, bones: false });
  await page.click('#layers [data-layer="skin"]');
  expect((await layers()).skin, 'выключить всё нельзя').toBe(true);
  await expect(page.locator('#layers [data-layer="skin"]')).toHaveClass(/on/);
});

test('подсветка в окне - та же, что считает ядро (не наугад)', async ({ page }) => {
  await open(page);
  await freeze(page, 'pushup', 0.5);
  const r = await page.evaluate(() => {
    const mv = GB.Anim.compile(GB.Moves.MOVES.find((m) => m.id === 'pushup'));
    const an = GB.Load.analyzeAt((t) => GB.Anim.at(mv, t), 0.5 * mv.dur);
    return { win: [...GB.app.analysis().act], core: [...an.act], tri: GB.app.activation('triceps_L'), bic: GB.app.activation('biceps_L') };
  });
  r.win.forEach((a, i) => expect(Math.abs(a - r.core[i])).toBeLessThan(1e-9));
  expect(r.tri).toBeGreaterThan(0.3);
  expect(r.bic).toBeLessThan(0.02);
  // в списке «Сейчас работают» первым стоит трицепс или грудная
  await expect(page.locator('#top-list li').first()).toContainText(/Трицепс|грудная/);
});

const VIEWS = [{ width: 1280, height: 760 }, { width: 900, height: 700 }, { width: 375, height: 720 }];
for (const v of VIEWS) {
  test(`подписи ${v.width}×${v.height}: не налезают друг на друга и на тело, не выходят из окна`, async ({ page }) => {
    await page.setViewportSize(v);
    await open(page);
    for (const [id, ph] of [['walk', 0.2], ['squat', 0.5], ['pushup', 0.5], ['pullup', 0.4], ['kick', 0.4], ['flip', 0.5], ['dance', 0.25]]) {
      await freeze(page, id, ph);
      // плюс подпись под мышью: наводим на середину бедра
      await page.evaluate(() => GB.app.setHover({ kind: 'muscle', id: 'vasti_L' }));
      const { labels, body, view, placed } = await page.evaluate(() => ({ labels: GB.app.labelRects(), body: GB.app.bodyRects(), view: GB.app.view(), placed: GB.app.placed() }));
      expect(labels.length, `${id}: нет подписей`).toBeGreaterThan(0);
      // тело целиком в окне (камера отходит для высокого тела)
      const all = body.reduce((m, r) => ({ x0: Math.min(m.x0, r.x), y0: Math.min(m.y0, r.y), x1: Math.max(m.x1, r.x + r.w), y1: Math.max(m.y1, r.y + r.h) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
      expect(all.x0 >= 0 && all.y0 >= 0 && all.x1 <= view.w && all.y1 <= view.h, `${id}: тело не влезает ${JSON.stringify(all)}`).toBe(true);
      // нарисована ровно там и такого размера, как разложена (иначе раскладка врёт)
      for (const a of labels) {
        const q = placed.find((x) => x.id === a.id);
        expect(q, `${id}: ${a.id} не из раскладки`).toBeTruthy();
        expect(Math.abs(a.x - q.x) + Math.abs(a.y - q.y) + Math.abs(a.w - q.w) + Math.abs(a.h - q.h), `${id}: ${a.id} нарисована не как разложена`).toBeLessThan(1.5);
      }
      for (const a of labels) {
        expect(a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= view.w + 0.5 && a.y + a.h <= view.h + 0.5, `${id}: ${a.id} за окном`).toBe(true);
        for (const b of labels) if (a !== b) expect(overlap(a, b), `${id}: ${a.id} на ${b.id}`).toBe(false);
        for (const r of body) expect(overlap(a, r), `${id}: ${a.id} на теле`).toBe(false);
      }
    }
  });
}

test('наведение: мышца - название и что делает; сустав - углы', async ({ page }) => {
  await open(page);
  await freeze(page, 'squat', 0.5);
  const p = await page.evaluate(() => {
    const f = GB.app.frameF();
    const pose = GB.app.pose();
    const pp = { root: pose.root, a: Float64Array.from(pose.a) };
    const pts = GB.Load.musclePath(pp, f, GB.Muscles.MUSCLES[GB.Muscles.MUSCLE.vasti_L]);
    return GB.app.screenOf(pts[Math.floor(pts.length / 2)]);
  });
  await page.mouse.move(p[0], p[1]);
  await expect(page.locator('.label[data-id="hover"]')).toBeVisible();
  await expect(page.locator('#info-title')).not.toHaveText('Наведите на мышцу, кость или сустав');
  const j = await page.evaluate(() => GB.app.screenOf(GB.app.frameF().pos[GB.Skeleton.BONE.shin_L.index]));
  await page.mouse.move(j[0], j[1]);
  await expect(page.locator('#info-title')).toHaveText(/Колено \(левый\)/);
  await expect(page.locator('#info-does')).toContainText(/сгибание \d+°/);
});

test('своя поза: тянем кисть мышью - она идёт за мышью, суставы в пределах, ничего в полу', async ({ page }) => {
  const errors = await open(page);
  await page.click('#moves [data-move="pose"]');
  await expect(page.locator('#pose-bar')).toBeVisible();
  const before = await page.evaluate(() => GB.app.effector('hand_L'));
  const s = await page.evaluate(() => GB.app.screenOf(GB.app.effector('hand_L')));
  await page.mouse.move(s[0], s[1]);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(s[0] - 6 * k, s[1] - 14 * k);
  await page.mouse.up();
  const r = await page.evaluate(() => {
    const p = GB.app.pose();
    const pose = { root: p.root, a: Float64Array.from(p.a) };
    return { after: GB.app.effector('hand_L'), bad: GB.Kin.violations(pose), low: GB.Kin.lowest(GB.Kin.fk(pose)), screen: GB.app.screenOf(GB.app.effector('hand_L')) };
  });
  expect(r.after[1] - before[1], 'кисть поднялась').toBeGreaterThan(0.15);
  expect(Math.hypot(r.screen[0] - (s[0] - 60), r.screen[1] - (s[1] - 140)), 'кисть под мышью').toBeLessThan(25);
  expect(r.bad).toEqual([]);
  expect(r.low).toBeGreaterThan(-0.005);
  // долгое перетаскивание не копит в памяти нагрузку каждой промежуточной позы
  const size0 = await page.evaluate(() => GB.app.cacheSize());
  const h = await page.evaluate(() => GB.app.screenOf(GB.app.effector('hand_R')));
  await page.mouse.move(h[0], h[1]);
  await page.mouse.down();
  for (let k = 1; k <= 40; k++) { await page.mouse.move(h[0] + 3 * k, h[1] - 3 * k); await page.evaluate(() => GB.app.tick(0)); }
  await page.mouse.up();
  expect(await page.evaluate(() => GB.app.cacheSize())).toBeLessThanOrEqual(size0 + 1);
  await page.click('#pose-reset');
  const reset = await page.evaluate(() => { GB.app.tick(0); return GB.app.pose().a.every((x) => x === 0); });
  expect(reset).toBe(true);
  expect(errors).toEqual([]);
});

test('камера: тянем фон - поворот; колесо - ближе; двойной щелчок - на место', async ({ page }) => {
  await open(page);
  const box = await page.locator('#view').boundingBox();
  const c0 = await page.evaluate(() => GB.app.camera());
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 60, { steps: 5 });
  await page.mouse.up();
  const c1 = await page.evaluate(() => GB.app.camera());
  expect(Math.abs(c1.az - c0.az)).toBeGreaterThan(0.3);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  const c2 = await page.evaluate(() => GB.app.camera());
  expect(c2.dist).toBeLessThan(c1.dist);
  await page.mouse.dblclick(box.x + 40, box.y + 40);
  const c3 = await page.evaluate(() => GB.app.camera());
  expect(c3.az).toBeCloseTo(0.6, 5);
  // высокое тело (вис на перекладине) - камера отходит, чтобы оно влезало
  const far = async (m) => { await freeze(page, m, 0.1); return page.evaluate(() => { const c = GB.app.camera(); return c.eff; }); };
  const walk = await far('walk'), hang = await far('pullup');
  expect(hang).toBeGreaterThan(walk * 1.15);
});

test('пауза, скорость, перемотка, клавиши', async ({ page }) => {
  await open(page);
  await page.evaluate(() => GB.app.setMove('walk'));
  await page.click('#play');
  const t0 = await page.evaluate(() => { GB.app.tick(0.5); return GB.app.state().time; });
  const t1 = await page.evaluate(() => { GB.app.tick(0.5); return GB.app.state().time; });
  expect(t1).toBe(t0);
  await page.click('#play');
  await page.click('#speed [data-speed="0.25"]');
  const d = await page.evaluate(() => { const a = GB.app.state().time; GB.app.tick(0.04); return GB.app.state().time - a; });
  expect(d).toBeCloseTo(0.01, 6);
  await page.locator('#scrub').fill('500');
  const st = await page.evaluate(() => GB.app.state());
  expect(st.paused).toBe(true);
  expect(st.time).toBeCloseTo(0.55, 3);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => GB.app.state().time)).toBeCloseTo(0.55 + 1 / 60, 3);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => GB.app.state().paused)).toBe(false);
});

test('язык: RU/EN переключается и запоминается', async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle(/как движется тело/);
  await page.click('#lang [data-lang="en"]');
  await expect(page).toHaveTitle(/how the body moves/);
  await expect(page.locator('#moves [data-move="squat"]')).toHaveText('Squat');
  await page.reload();
  await page.waitForFunction(() => window.GB && GB.app);
  await expect(page.locator('#moves [data-move="squat"]')).toHaveText('Squat');
});

test('темы: пять, запоминаются; снимки тёмной и светлой различаются', async ({ page }, info) => {
  await open(page);
  await freeze(page, 'squat', 0.5);
  const ids = await page.locator('#theme option').evaluateAll((o) => o.map((x) => x.value));
  expect(ids).toEqual(['glass', 'formal', 'light', 'night', 'warm']);
  const lum = async () => page.evaluate(() => {
    GB.app.tick(0);
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(document.getElementById('view'), 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3]) { s += 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; n++; } }
    const bg = getComputedStyle(document.body).backgroundColor;
    return { scene: n ? s / n : 0, bg };
  });
  const dark = await lum();
  await page.screenshot({ path: info.outputPath('theme-glass.png') });
  await page.selectOption('#theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const light = await lum();
  await page.screenshot({ path: info.outputPath('theme-light.png') });
  expect(light.scene, 'светлая сцена светлее').toBeGreaterThan(dark.scene + 20);
  expect(light.bg).not.toBe(dark.bg);
  for (const id of ['formal', 'night', 'warm', 'glass']) {
    await page.selectOption('#theme', id);
    if (id === 'glass') await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
    else await expect(page.locator('html')).toHaveAttribute('data-theme', id);
  }
  await page.selectOption('#theme', 'night');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
});

test('узкое окно 360×640: нет прокрутки вбок, кнопки на экране, сведения по кнопке i', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(360);
  for (const sel of ['#play', '#layers', '#extras', '#theme', '#lang']) {
    const b = await page.locator(sel).boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= 360 && b.y + b.height <= 640, sel).toBe(true);
  }
  const canvas = await page.locator('#view').boundingBox();
  expect(canvas.height).toBeGreaterThan(320);
  // шапка с меню движений - одна строка с прокруткой, а не стопка кнопок
  const top = await page.locator('#top').boundingBox();
  expect(top.height).toBeLessThanOrEqual(100);
  await page.click('#panel-toggle');
  await expect(page.locator('#panel')).toHaveClass(/open/);
});

test('Хаб: сообщение о теме оболочки ставит светлую тему', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.postMessage({ mix: 'theme', theme: 'light' }, '*'));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => window.postMessage({ mix: 'theme', theme: 'dark' }, '*'));
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('предметы: мяч у удара и броска, перекладина у подтягивания', async ({ page }) => {
  await open(page);
  const vis = (m, ph) => page.evaluate(([mm, p]) => { GB.app.setMove(mm); GB.app.setPaused(true); GB.app.setPhase(p); return { ball: GB.app.ballVisible(), bar: GB.app.barVisible() }; }, [m, ph]);
  expect(await vis('kick', 0.2)).toEqual({ ball: true, bar: false });
  expect(await vis('throw', 0.3)).toEqual({ ball: true, bar: false });
  expect(await vis('pullup', 0.3)).toEqual({ ball: false, bar: true });
  expect(await vis('walk', 0.3)).toEqual({ ball: false, bar: false });
  const env = (m) => page.evaluate((mm) => { GB.app.setMove(mm); GB.app.tick(0); return { ladder: GB.app.ladderVisible(), water: GB.app.waterVisible() }; }, m);
  expect(await env('climb')).toEqual({ ladder: true, water: false });
  expect(await env('swim')).toEqual({ ladder: false, water: true });
  expect(await env('walk')).toEqual({ ladder: false, water: false });
});

test('без WebGL: понятное сообщение вместо падения', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'ru-RU' });
  const page = await ctx.newPage();
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(require('./helpers').URL);
  await expect(page.locator('#no-webgl')).toContainText('WebGL');
  expect(await page.evaluate(() => GB.app.state().error)).toBe('webgl');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('за курсором: игрушка под курсором, человечек идёт к ней, к низкой ползёт', async ({ page }) => {
  const errors = await open(page);
  await page.click('#moves [data-move="follow"]');
  await expect(page.locator('#follow-bar')).toBeVisible();
  const box = await page.locator('#view').boundingBox();
  // курсор у правого края сцены, на высоте груди
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.45);
  const toy = await page.evaluate(() => GB.app.toy());
  const scr = await page.evaluate((t) => GB.app.screenOf(t), toy);
  expect(Math.hypot(scr[0] - (box.x + box.width * 0.9), scr[1] - (box.y + box.height * 0.45)), 'игрушка под курсором').toBeLessThan(3);
  const dist = () => page.evaluate(() => { const f = GB.app.follow(), t = GB.app.toy(); return Math.hypot(f.pos[0] - t[0], f.pos[1] - t[2]); });
  const d0 = await dist();
  await page.evaluate(() => { for (let i = 0; i < 90; i++) GB.app.tick(1 / 30); });
  expect(await dist(), 'подошёл к игрушке').toBeLessThan(Math.max(0.75, d0 - 0.5));
  // игрушка у самого пола и подальше - ползёт или на четвереньках
  await page.evaluate(() => { const f = GB.app.follow(); GB.app.setToy([f.pos[0] + 2.5, 0.15, f.pos[1]]); for (let i = 0; i < 60; i++) GB.app.tick(1 / 30); });
  expect(['crawl', 'kneel']).toContain((await page.evaluate(() => GB.app.follow())).mode);
  // и назад к обычным движениям
  await page.click('#moves [data-move="walk"]');
  await expect(page.locator('#follow-bar')).toBeHidden();
  expect(errors).toEqual([]);
});
