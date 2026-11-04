// Настоящая программа Electron (GB_TEST=1 - окно не показывается). Запуск, движения,
// и 20 запусков подряд без роста памяти.
'use strict';
const path = require('path');
const { test, expect, _electron: electron } = require('@playwright/test');

const ROOT = path.join(__dirname, '..', '..');
const ARGS = [ROOT, '--no-sandbox'];

async function launch() {
  const app = await electron.launch({ args: ARGS, env: { ...process.env, GB_TEST: '1' } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForFunction(() => window.GB && window.GB.app);
  return { app, win, errors };
}

test('программа: открывается, показывает GoingBoy, играет все движения без ошибок', async () => {
  const { app, win, errors } = await launch();
  await expect(win).toHaveTitle(/GoingBoy/);
  const moves = await win.evaluate(() => GB.app.MOVES);
  expect(moves.length).toBe(11);
  for (const m of [...moves, 'pose']) {
    const ok = await win.evaluate((id) => { GB.app.setMove(id); for (let i = 0; i < 10; i++) GB.app.tick(1 / 30); return GB.app.state().move === id; }, m);
    expect(ok, m).toBe(true);
  }
  // окно не уводит со страницы и не открывает новых окон
  await win.evaluate(() => { window.open('https://example.com'); location.href = 'https://example.com'; });
  await win.waitForTimeout(300);
  expect(await win.evaluate(() => location.protocol)).toBe('file:');
  expect(app.windows().length).toBe(1);
  const info = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), focusable: w.isFocusable(), menu: w.isMenuBarVisible() }; });
  expect(info).toEqual({ visible: false, focusable: false, menu: false });
  expect(errors).toEqual([]);
  await app.close();
});

test('20 запусков подряд: память не растёт', async () => {
  const mem = [];
  for (let i = 0; i < 20; i++) {
    const { app, win, errors } = await launch();
    await win.evaluate(() => { GB.app.setMove('squat'); for (let k = 0; k < 30; k++) GB.app.tick(1 / 30); });
    const kb = await app.evaluate(({ app: a }) => a.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0));
    mem.push(kb);
    expect(errors).toEqual([]);
    await app.close();
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const first = avg(mem.slice(0, 5)), lastAvg = avg(mem.slice(-5));
  console.log('память, МБ:', mem.map((k) => Math.round(k / 1024)).join(' '));
  expect(lastAvg).toBeLessThan(first * 1.25);
});
