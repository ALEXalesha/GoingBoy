// Лист поз: каждое движение по 8 кадров сбоку и спереди палочками и капсулами кожи - чтобы
// глазами проверить ключевые кадры без окна и three.js.
//   node tools/pose-sheet.js [движение ...]   -> docs/dev/pose-sheet.html (+ .png, если есть Playwright)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB = process.env.GB_WEB || path.join(ROOT, 'web');
const S = require(path.join(WEB, 'js/body/skeleton.js'));
const K = require(path.join(WEB, 'js/core/kinematics.js'));
const A = require(path.join(WEB, 'js/core/anim.js'));
const { MOVES } = require(path.join(WEB, 'js/core/moves.js'));

const only = process.argv.slice(2);
const list = MOVES.filter((m) => !only.length || only.includes(m.id));
const FR = 8, W = 120, H = 230, SC = 100;

function figure(p, view, ox, oy) {
  const f = K.fk(p);
  const pr = (v) => (view === 'side' ? [ox + W / 2 + v[2] * SC, oy + H - 20 - v[1] * SC] : [ox + W / 2 + v[0] * SC, oy + H - 20 - v[1] * SC]);
  let s = `<line x1="${ox}" y1="${oy + H - 20}" x2="${ox + W}" y2="${oy + H - 20}" stroke="#999"/>`;
  for (const c of K.capsules(f)) {
    const [x1, y1] = pr(c.a), [x2, y2] = pr(c.b);
    const side = /_R$/.test(S.BONES[c.bone].name) ? '#e9b38a' : /_L$/.test(S.BONES[c.bone].name) ? '#8ab8e9' : '#cfcfcf';
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${side}" stroke-opacity="0.55" stroke-width="${2 * c.r * SC}" stroke-linecap="round"/>`;
  }
  for (let b = 1; b < S.BONES.length; b++) {
    const [x1, y1] = pr(f.pos[b]), [x2, y2] = pr(K.tail(f, b));
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="1.5"/>`;
  }
  const c = pr(K.com(f));
  s += `<circle cx="${c[0]}" cy="${c[1]}" r="2.5" fill="red"/>`;
  return s;
}

let body = '';
const rows = list.length * 2;
for (const [r, m] of list.entries()) {
  const mv = A.compile(m);
  for (const [v, view] of ['side', 'front'].entries()) {
    const y = (r * 2 + v) * H;
    body += `<text x="4" y="${y + 14}" font-size="12">${m.id} ${view}</text>`;
    for (let i = 0; i < FR; i++) body += figure(A.sample(mv, i / FR), view, 60 + i * W, y);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${60 + FR * W}" height="${rows * H}" style="background:#fff;font-family:sans-serif">${body}</svg>`;
const out = path.join(ROOT, 'docs', 'dev');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'pose-sheet.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0">${svg}</body>`);
console.log(path.join(out, 'pose-sheet.html'));
try {
  const { chromium } = require('playwright');
  (async () => {
    const b = await chromium.launch();
    const pg = await b.newPage({ viewport: { width: 60 + FR * W, height: rows * H } });
    await pg.goto('file://' + path.join(out, 'pose-sheet.html'));
    await pg.screenshot({ path: path.join(out, 'pose-sheet.png'), fullPage: true });
    await b.close();
    console.log(path.join(out, 'pose-sheet.png'));
  })();
} catch (e) { /* без Playwright - только html */ }
