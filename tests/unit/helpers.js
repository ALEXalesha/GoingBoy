// Общее для законов: откуда грузить ядро и зерно случайных чисел.
// GB_WEB - другая папка web/ (tools/mutate.js гоняет законы на испорченных копиях).
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WEB = process.env.GB_WEB || path.join(ROOT, 'web');
const load = (rel) => require(path.join(WEB, 'js', rel));

/** Детерминированный генератор: одно зерно - одна и та же последовательность. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Случайная поза в пределах суставов. */
function randomPose(K, S, r, spread = 1) {
  const p = K.restPose();
  S.DOFS.forEach((d, i) => {
    const mid = (d.min + d.max) / 2, half = (d.max - d.min) / 2;
    p.a[i] = mid + (r() * 2 - 1) * half * spread;
  });
  p.root.pos = [r() - 0.5, 0.5 + r(), r() - 0.5];
  p.root.rot = [r() * 360 - 180, r() * 360 - 180, r() * 360 - 180];
  return p;
}

const SEED = Number(process.env.GB_SEED || 20261103);

module.exports = { ROOT, WEB, load, rng, randomPose, SEED };
