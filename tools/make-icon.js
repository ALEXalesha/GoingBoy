// Значок программы и страницы: человечек в шаге на градиентном квадрате. Рисуется SVG,
// снимается Playwright в PNG; ICO - тот же PNG внутри (так умеют Windows Vista и новее).
//   node tools/make-icon.js   -> assets/icon.png (256), assets/icon.ico, web/favicon.png (64)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8def"/><stop offset="1" stop-color="#9d5bef"/></linearGradient></defs>
<rect x="8" y="8" width="240" height="240" rx="56" fill="url(#g)"/>
<g stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none">
<circle cx="140" cy="52" r="20" fill="#fff" stroke="none"/>
<path d="M132 84 L118 140"/><path d="M118 140 L150 172 L142 214"/><path d="M118 140 L96 180 L66 196"/>
<path d="M130 92 L162 118 L188 108"/><path d="M128 94 L98 116 L84 144"/>
</g>
<path d="M150 172 L142 214" stroke="#ff4a4a" stroke-width="18" stroke-linecap="round"/>
</svg>`;

function ico(png) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(0, 6); head.writeUInt8(0, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 256, height: 256 } });
  await p.setContent(`<body style="margin:0;background:transparent">${SVG}</body>`);
  const big = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 256, height: 256 } });
  await p.setViewportSize({ width: 64, height: 64 });
  await p.setContent(`<body style="margin:0;background:transparent">${SVG.replace('width="256" height="256"', 'width="64" height="64"')}</body>`);
  const small = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 64, height: 64 } });
  await b.close();
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.png'), big);
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.ico'), ico(big));
  fs.writeFileSync(path.join(ROOT, 'web', 'favicon.png'), small);
  console.log('ok', big.length, small.length);
})();
