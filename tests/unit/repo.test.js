// Законы репозитория: CI на node 24 с порогом покрытия и мутантами, сборка Pages из web/,
// ничего личного в файлах, страница не тянет ничего из сети.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('CI: node 24, покрытие по ветвям с порогом, мутанты, страница и Electron', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /node-version: "24"/);
  assert.match(ci, /npm run coverage/);
  assert.match(ci, /tools\/mutate\.js/);
  assert.match(ci, /playwright test/);
  assert.match(ci, /playwright\.app\.config\.js/);
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.coverage, /c8/);
  assert.match(pkg.scripts.coverage, /coverage-check/);
  const check = read('tools/coverage-check.js');
  assert.match(check, /coreB < 90/);
  assert.match(check, /allB < 80/);
});

test('Pages: собирается из web/ без сборки', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /cp -r web\/\. _site\//);
  assert.match(pages, /deploy-pages/);
});

test('страница не тянет ничего из сети: все скрипты и стили свои', () => {
  const html = read('web/index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  for (const r of refs) {
    assert.ok(!/^(https?:)?\/\//.test(r), 'из сети: ' + r);
    assert.ok(fs.existsSync(path.join(ROOT, 'web', r)), 'нет файла: ' + r);
  }
});

// Строки собраны из кусков, иначе закон нашёл бы сам себя.
const PATTERNS = [
  new RegExp('C:[\\\\/]+(Dr' + 'ive|Us' + 'ers)', 'i'),
  new RegExp('192\\.' + '168\\.'),
  new RegExp('gm' + 'ail', 'i'),
  new RegExp('k' + 'o-?fi', 'i'),
  new RegExp('gi' + 'tea', 'i'),
];
// Эти файлы были в репозитории до GoingBoy v1 (описание замысла и выкладка) - их не трогаем.
const LEGACY = ['docs/superpowers/specs/2026-10-17-goingboy-design.md', 'tools/publish.conf', 'tools/publish_github.sh'];

test('в файлах репозитория нет личного: путей, адресов, почты, сервисов', () => {
  let files = [];
  try { files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean); } catch (e) { files = []; }
  const found = [];
  for (const f of files) {
    if (f.startsWith('web/vendor/') || LEGACY.includes(f) || f === 'package-lock.json') continue;
    let data;
    try { data = fs.readFileSync(path.join(ROOT, f)); } catch (e) { continue; }
    if (data.subarray(0, 8192).includes(0)) continue;
    const text = data.toString('utf8');
    for (const re of PATTERNS) if (re.test(text)) found.push(`${f}: ${re}`);
  }
  assert.deepEqual(found, []);
});
