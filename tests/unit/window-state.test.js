// Законы места окна программы: что бы ни лежало в файле, окно открывается видимым и за
// него можно взяться; восстановленное восстанавливается без изменений.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, rng, SEED } = require('./helpers');

const W = require(path.join(ROOT, 'electron', 'window-state.js'));
const OPTS = { width: 1280, height: 780, minWidth: 360, minHeight: 480 };
const SCREENS = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1280, height: 984 }];

test('окно: мусор в файле - размер по умолчанию', () => {
  for (const bad of [null, undefined, 42, 'x', {}, { width: 'a' }, { width: NaN, height: 5 }, []]) {
    assert.deepEqual(W.restore(bad, SCREENS, OPTS), { width: 1280, height: 780, maximized: false });
  }
});

test('окно: случайные сохранения - заголовок на экране, размер в пределах', () => {
  const r = rng(SEED + 60);
  for (let n = 0; n < 3000; n++) {
    const saved = { x: (r() - 0.3) * 5000, y: (r() - 0.3) * 3000, width: r() * 4000, height: r() * 3000, maximized: r() < 0.2 };
    const out = W.restore(saved, SCREENS, OPTS);
    assert.ok(out.width >= OPTS.minWidth && out.height >= OPTS.minHeight);
    if (out.x === undefined) continue;
    const grip = { x: out.x, y: out.y, width: out.width, height: W.GRIP_HEIGHT };
    const visible = SCREENS.some((s) => out.x >= s.x && out.y >= s.y && out.x + out.width <= s.x + s.width + 1e-9 && grip.y + grip.height <= s.y + s.height);
    assert.ok(visible, JSON.stringify({ saved, out }));
    // восстановленное восстанавливается без изменений
    assert.deepEqual(W.restore({ ...out }, SCREENS, OPTS), out);
  }
});

test('окно: без экранов и без места - по умолчанию; запись и чтение файла', () => {
  assert.deepEqual(W.restore({ x: 10, y: 10, width: 800, height: 600 }, [], OPTS), { width: 800, height: 600, maximized: false });
  assert.deepEqual(W.restore({ width: 800, height: 600 }, 'bad', OPTS), { width: 800, height: 600, maximized: false });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-win-'));
  const file = path.join(dir, 'a', 'state.json');
  assert.equal(W.load(file), null);
  assert.equal(W.save(file, { x: 1, y: 2, width: 3, height: 4, maximized: false }), true);
  assert.deepEqual(W.load(file), { x: 1, y: 2, width: 3, height: 4, maximized: false });
  fs.writeFileSync(file, '{обрезано');
  assert.equal(W.load(file), null);
  assert.equal(W.save(path.join(file, 'нельзя'), {}), false);
  fs.rmSync(dir, { recursive: true, force: true });
  const fake = { getNormalBounds: () => ({ x: 5, y: 6, width: 700, height: 500 }), isMaximized: () => true };
  assert.deepEqual(W.capture(fake), { x: 5, y: 6, width: 700, height: 500, maximized: true });
  const plain = { getBounds: () => ({ x: 1, y: 1, width: 9, height: 9 }), isMaximized: () => false };
  assert.equal(W.capture(plain).width, 9);
});
