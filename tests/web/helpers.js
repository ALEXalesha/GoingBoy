// Общее для законов страницы: открыть страницу (из GB_WEB, если задана), собрать ошибки.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const WEB = process.env.GB_WEB || path.join(__dirname, '..', '..', 'web');
const URL = pathToFileURL(path.join(WEB, 'index.html')).href;

/** Открыть страницу с чистыми настройками; вернуть массив ошибок консоли (пополняется). */
async function open(page, { lang = 'ru', settings = null } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // чистые настройки: открыть, записать, перезагрузить (без скрипта на каждую загрузку -
  // иначе перезагрузка в самом тесте снова сбрасывала бы настройки)
  await page.goto(URL);
  await page.evaluate(([s, l]) => { localStorage.clear(); localStorage.setItem('goingboy:settings', JSON.stringify({ lang: l, ...(s || {}) })); }, [settings, lang]);
  await page.reload();
  await page.waitForFunction(() => window.GB && window.GB.app && window.GB.app.state().fps >= 0);
  return errors;
}

/** Остановить на фазе движения и перерисовать. */
async function freeze(page, move, phase) {
  // на паузе время стоит, а камера плавно доезжает до тела - даём ей доехать
  await page.evaluate(([m, ph]) => { GB.app.setMove(m); GB.app.setPaused(true); GB.app.player.fade = 1; GB.app.setPhase(ph); for (let i = 0; i < 12; i++) GB.app.tick(0.25); }, [move, phase]);
}

const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

module.exports = { WEB, URL, open, freeze, overlap };
