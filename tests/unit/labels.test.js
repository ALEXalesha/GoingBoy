// Законы подписей: не налезают друг на друга и на тело, не выходят за окно, выноски не
// перекрещиваются (порядок по высоте сохранён), при достатке места видны все.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, rng, SEED } = require('./helpers');

const Lb = load('core/labels.js');

function scene(r, w, h, nLabels) {
  const cx = w / 2 + (r() - 0.5) * w * 0.2, bw = 80 + r() * 160, bh = h * (0.5 + r() * 0.4);
  const body = [];
  for (let i = 0; i < 20; i++) {
    const rw = 10 + r() * 40, rh = 10 + r() * 60;
    body.push({ x: cx - bw / 2 + r() * (bw - rw), y: h / 2 - bh / 2 + r() * (bh - rh), w: rw, h: rh });
  }
  const B = Lb.bounds(body);
  const labels = Array.from({ length: nLabels }, (_, i) => ({
    id: 'l' + i, anchor: [B.x + r() * B.w, B.y + r() * B.h], w: 60 + r() * 100, h: 18 + r() * 24, priority: r(),
  }));
  return { view: { w, h }, body, labels };
}

function check(view, body, out, tag) {
  for (const a of out) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= view.w + 1e-9 && a.y + a.h <= view.h + 1e-9, `${tag}: ${a.id} за окном`);
    for (const r of body) assert.ok(!Lb.overlap(a, r), `${tag}: ${a.id} на теле`);
    for (const b of out) if (a !== b) assert.ok(!Lb.overlap(a, b), `${tag}: ${a.id} на ${b.id}`);
  }
  for (const side of ['left', 'right']) {
    const col = out.filter((l) => l.side === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) assert.ok(col[i - 1].anchor[1] <= col[i].anchor[1] + 1e-9, `${tag}: выноски перекрещиваются`);
  }
}

test('подписи: 2000 случайных сцен - не налезают, не на теле, в окне, выноски не перекрещиваются', () => {
  const r = rng(SEED + 50);
  for (let n = 0; n < 2000; n++) {
    const w = 320 + r() * 1600, h = 400 + r() * 700;
    const { view, body, labels } = scene(r, w, h, 1 + Math.floor(r() * 14));
    check(view, body, Lb.layout(view, body, labels), `сцена ${n}`);
  }
});

test('подписи: в широком окне видны все, каждая - со своей стороны тела', () => {
  const r = rng(SEED + 51);
  for (let n = 0; n < 300; n++) {
    const { view, body, labels } = scene(r, 1600, 1000, 1 + Math.floor(r() * 8));
    const out = Lb.layout(view, body, labels);
    assert.equal(out.length, labels.length, `сцена ${n}`);
    const B = Lb.bounds(body), mid = B.x + B.w / 2;
    for (const l of out) assert.equal(l.side, l.anchor[0] <= mid ? 'left' : 'right');
  }
});

test('подписи: когда места мало, уходят наименее важные', () => {
  const view = { w: 1000, h: 200 };
  const body = [{ x: 450, y: 20, w: 100, h: 160 }];
  const labels = Array.from({ length: 12 }, (_, i) => ({ id: 'l' + i, anchor: [470, 30 + i * 10], w: 100, h: 30, priority: i }));
  const out = Lb.layout(view, body, labels);
  check(view, body, out, 'тесно');
  const kept = out.map((l) => l.priority).sort((a, b) => a - b);
  const dropped = labels.filter((l) => !out.find((o) => o.id === l.id)).map((l) => l.priority);
  assert.ok(dropped.length > 0 && Math.max(...dropped) < Math.min(...kept), 'ушли не самые неважные');
});

test('подписи: узкое окно - полосой над или под телом, без тела - вокруг центра', () => {
  const view = { w: 360, h: 800 };
  const body = [{ x: 60, y: 300, w: 240, h: 450 }];
  const labels = [{ id: 'a', anchor: [100, 400], w: 150, h: 30, priority: 1 }, { id: 'b', anchor: [200, 500], w: 150, h: 30, priority: 2 }];
  const out = Lb.layout(view, body, labels);
  check(view, body, out, 'узко');
  assert.equal(out.length, 2);
  assert.ok(out.every((l) => l.side === 'band' && l.y + l.h <= 300));
  const low = Lb.layout({ w: 360, h: 800 }, [{ x: 60, y: 40, w: 240, h: 450 }], labels);
  assert.ok(low.every((l) => l.y >= 490));
  assert.equal(Lb.layout(view, [], labels).length, 2);
  assert.equal(Lb.bounds([]), null);
});
