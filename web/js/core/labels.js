// Раскладка подписей: подписи стоят столбиками слева и справа от тела, от каждой - выноска к
// своей точке. Подписи не налезают друг на друга и на тело и не выходят за окно. Если места
// не хватает, сначала уходят подписи с меньшим приоритетом; в узком окне, где по бокам тела
// места нет, подписи встают полосой над телом или под ним.
//
// Всё в пикселях экрана: тело - прямоугольники (проекции капсул кожи), подпись - { id,
// anchor: [x, y], w, h, priority }.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.GB = root.GB || {}).Labels = factory();
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GAP = 12;     // от тела до подписи
  const MARGIN = 8;   // от края окна
  const SPACE = 4;    // между подписями

  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function bounds(rects) {
    if (!rects.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Уложить подписи в столбик высотой [top, bottom] по порядку якорей. Возвращает уложенные
   * (лишние по приоритету отброшены).
   */
  function stack(items, top, bottom) {
    let list = items.slice().sort((a, b) => a.anchor[1] - b.anchor[1]);
    const total = () => list.reduce((s, l) => s + l.h + SPACE, -SPACE);
    while (list.length && total() > bottom - top) {
      let worst = 0;
      list.forEach((l, i) => { if (l.priority < list[worst].priority) worst = i; });
      list.splice(worst, 1);
    }
    const ys = list.map((l) => Math.min(bottom - l.h, Math.max(top, l.anchor[1] - l.h / 2)));
    for (let i = 1; i < list.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + list[i - 1].h + SPACE);
    if (list.length && ys[list.length - 1] + list[list.length - 1].h > bottom) {
      ys[list.length - 1] = bottom - list[list.length - 1].h;
      for (let i = list.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - list[i].h - SPACE);
    }
    return list.map((l, i) => ({ ...l, y: ys[i] }));
  }

  /**
   * Уложить подписи рядами в полосу [y0, y1] по ширине окна: сначала важные. Подпись, которая
   * не влезает, пропускается - остальные всё равно укладываются. Возвращает [уложенные, остаток].
   */
  function band(items, x0, x1, y0, y1) {
    const list = items.slice().sort((a, b) => b.priority - a.priority);
    const out = [], left = [];
    const rows = []; // { y, h, x }
    for (const l of list) {
      let row = rows.find((r) => r.x + l.w <= x1 && l.h <= r.h);
      if (!row) {
        const y = rows.length ? rows[rows.length - 1].y + rows[rows.length - 1].h + SPACE : y0;
        if (l.w > x1 - x0 || y + l.h > y1) { left.push(l); continue; }
        row = { y, h: l.h, x: x0 };
        rows.push(row);
      }
      out.push({ ...l, x: row.x, y: row.y, side: 'band' });
      row.x += l.w + SPACE;
    }
    return [out, left];
  }

  /**
   * Разложить подписи. view: { w, h }, body: прямоугольники тела, labels: подписи.
   * Возвращает [{ id, x, y, w, h, side, anchor }].
   */
  function layout(view, body, labels) {
    const B = bounds(body) || { x: view.w / 2, y: view.h / 2, w: 0, h: 0 };
    const top = MARGIN, bottom = view.h - MARGIN;
    const roomL = B.x - GAP - MARGIN, roomR = view.w - MARGIN - (B.x + B.w + GAP);
    const left = [], right = [], rest = [];
    const mid = B.x + B.w / 2;
    for (const l of labels) {
      const fitL = l.w <= roomL, fitR = l.w <= roomR;
      if (fitL && (l.anchor[0] <= mid || !fitR)) left.push(l);
      else if (fitR) right.push(l);
      else rest.push(l);
    }
    const out = [];
    let colTop = top, colBottom = bottom;
    if (rest.length) {
      // по бокам места нет: полосы над телом и под ним (сначала та, где места больше);
      // столбики тогда не заходят на высоту полос
      const above = { y0: MARGIN, y1: B.y - GAP }, below = { y0: B.y + B.h + GAP, y1: view.h - MARGIN };
      const order = above.y1 - above.y0 >= below.y1 - below.y0 ? [above, below] : [below, above];
      let todo = rest;
      for (const bandArea of order) {
        if (!todo.length || bandArea.y1 <= bandArea.y0) continue;
        const [placed, left] = band(todo, MARGIN, view.w - MARGIN, bandArea.y0, bandArea.y1);
        out.push(...placed);
        todo = left;
        if (!placed.length) continue;
        if (bandArea === above) colTop = Math.max(colTop, Math.max(...placed.map((l) => l.y + l.h)) + SPACE);
        else colBottom = Math.min(colBottom, Math.min(...placed.map((l) => l.y)) - SPACE);
      }
    }
    for (const l of stack(left, colTop, colBottom)) out.push({ ...l, x: B.x - GAP - l.w, side: 'left' });
    for (const l of stack(right, colTop, colBottom)) out.push({ ...l, x: B.x + B.w + GAP, side: 'right' });
    return out.map(({ id, x, y, w, h, side, anchor, priority }) => ({ id, x, y, w, h, side, anchor, priority }));
  }

  return { GAP, MARGIN, SPACE, overlap, bounds, layout };
});
