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

  /** Уложить подписи в полосу [y0, y1] по ширине окна слева направо по порядку якорей. */
  function band(items, x0, x1, y0, y1) {
    const list = items.slice().sort((a, b) => b.priority - a.priority);
    const out = [];
    let x = x0, y = y0, rowH = 0;
    for (const l of list) {
      if (l.w > x1 - x0) continue;
      if (x + l.w > x1) { x = x0; y += rowH + SPACE; rowH = 0; }
      if (y + l.h > y1) break;
      out.push({ ...l, x, y, side: 'band' });
      x += l.w + SPACE; rowH = Math.max(rowH, l.h);
    }
    return out;
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
      // по бокам места нет: полоса над телом, если там больше места, иначе под ним;
      // столбики тогда не заходят на высоту полосы
      const above = B.y - GAP - MARGIN, below = view.h - MARGIN - (B.y + B.h + GAP);
      const placed = above >= below
        ? band(rest, MARGIN, view.w - MARGIN, MARGIN, B.y - GAP)
        : band(rest, MARGIN, view.w - MARGIN, B.y + B.h + GAP, view.h - MARGIN);
      out.push(...placed);
      if (placed.length) {
        if (above >= below) colTop = Math.max(...placed.map((l) => l.y + l.h)) + SPACE;
        else colBottom = Math.min(...placed.map((l) => l.y)) - SPACE;
      }
    }
    for (const l of stack(left, colTop, colBottom)) out.push({ ...l, x: B.x - GAP - l.w, side: 'left' });
    for (const l of stack(right, colTop, colBottom)) out.push({ ...l, x: B.x + B.w + GAP, side: 'right' });
    return out.map(({ id, x, y, w, h, side, anchor, priority }) => ({ id, x, y, w, h, side, anchor, priority }));
  }

  return { GAP, MARGIN, SPACE, overlap, bounds, layout };
});
