// Снимки для README: docs/screens/*.png и короткая гифка движения docs/screens/squat.gif.
//   node tools/screenshots.js          (гифке нужен ffmpeg)
// Кадры детерминированы: движение на паузе, фаза задаётся явно, камера доезжает до места.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const URL = 'file://' + path.join(ROOT, 'web', 'index.html');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function page(browser, { w = 1280, h = 760, lang = 'ru', theme = 'glass', layers = { skin: false, muscles: true, bones: true } } = {}) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(URL);
  await p.evaluate(([l, t, ly]) => { localStorage.clear(); localStorage.setItem('goingboy:settings', JSON.stringify({ lang: l, theme: t, layers: ly })); }, [lang, theme, layers]);
  await p.reload();
  await p.waitForFunction(() => window.GB && GB.app);
  return p;
}

async function freeze(p, move, ph, extra) {
  await p.evaluate(([m, x, e]) => {
    GB.app.setMove(m); GB.app.setPaused(true); GB.app.player.fade = 1; GB.app.setPhase(x);
    if (e) (0, eval)(e);
    for (let i = 0; i < 14; i++) GB.app.tick(0.25);
  }, [move, ph, extra || '']);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ARGS });
  const shots = [
    { file: 'walk-en.png', opt: { lang: 'en' }, move: 'walk', ph: 0.12 },
    { file: 'walk-ru.png', opt: { lang: 'ru' }, move: 'walk', ph: 0.12 },
    { file: 'squat-hover.png', opt: { layers: { skin: true, muscles: true, bones: false } }, move: 'squat', ph: 0.5, extra: "GB.app.setHover({ kind: 'muscle', id: 'vasti_L' })" },
    { file: 'pullup-light.png', opt: { theme: 'light' }, move: 'pullup', ph: 0.42 },
    { file: 'pushup-warm.png', opt: { theme: 'warm' }, move: 'pushup', ph: 0.5, extra: 'GB.app.setCamera({ az: 1.25, el: 0.25 })' },
    { file: 'flip-night.png', opt: { theme: 'night' }, move: 'flip', ph: 0.43, extra: 'GB.app.setCamera({ az: 1.5 })' },
    { file: 'kick-formal.png', opt: { theme: 'formal', layers: { skin: false, muscles: true, bones: true } }, move: 'kick', ph: 0.37, extra: 'GB.app.setCamera({ az: 1.1 })' },
  ];
  for (const s of shots) {
    const p = await page(b, s.opt);
    await freeze(p, s.move, s.ph, s.extra);
    await p.screenshot({ path: path.join(OUT, s.file) });
    await p.close();
    console.log(s.file);
  }
  // своя поза: кисть поднята мышью (тем же IK, что и ручки), только кожа
  {
    const p = await page(b, { layers: { skin: true, muscles: false, bones: false } });
    await p.evaluate(() => { GB.app.setMove('pose'); });
    await p.click('#pose-reset');
    const s = await p.evaluate(() => GB.app.screenOf(GB.app.effector('hand_R')));
    await p.mouse.move(s[0], s[1]);
    await p.mouse.down();
    for (let k = 1; k <= 12; k++) await p.mouse.move(s[0] - 4 * k, s[1] - 22 * k);
    await p.mouse.up();
    await p.mouse.move(5, 300);
    await p.evaluate(() => { for (let i = 0; i < 6; i++) GB.app.tick(0.25); });
    await p.screenshot({ path: path.join(OUT, 'pose.png') });
    await p.close();
    console.log('pose.png');
  }
  // телефон
  {
    const p = await page(b, { w: 390, h: 780 });
    await freeze(p, 'dance', 0.25);
    await p.screenshot({ path: path.join(OUT, 'phone.png') });
    await p.close();
    console.log('phone.png');
  }
  // гифка: присед за один цикл, 30 кадров
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-gif-'));
    const p = await page(b, { w: 760, h: 620, layers: { skin: true, muscles: true, bones: true } });
    await p.evaluate(() => { GB.app.setExtra('labels', false); });
    await freeze(p, 'squat', 0);
    const box = await p.locator('#view').boundingBox();
    const N = 30;
    for (let i = 0; i < N; i++) {
      await p.evaluate((x) => { GB.app.setPhase(x); }, i / N);
      await p.screenshot({ path: path.join(dir, `f${String(i).padStart(3, '0')}.png`), clip: { x: box.x + 60, y: box.y, width: Math.min(420, box.width - 60), height: box.height } });
    }
    await p.close();
    const gif = path.join(OUT, 'squat.gif');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', path.join(dir, 'f%03d.png'),
      '-vf', 'scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', gif]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('squat.gif', fs.statSync(gif).size);
  }
  await b.close();
})();
