// Пороги покрытия по ВЕТВЯМ (c8): ядро (скелет, движения, IK, нагрузка) >= 90 %, весь код без
// окон >= 80 %. Окно (js/app, body/procedural.js, electron/main.js) проверяют законы Playwright.
//   npm run coverage   (c8 собирает coverage/coverage-summary.json, этот скрипт сверяет пороги)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const sum = JSON.parse(fs.readFileSync(path.join(ROOT, 'coverage', 'coverage-summary.json'), 'utf8'));
const CORE = ['body/skeleton.js', 'body/muscles.js', 'core/kinematics.js', 'core/anim.js', 'core/moves.js', 'core/limb.js', 'core/ik.js', 'core/load.js', 'body/retarget.js'];
const files = Object.keys(sum).filter((k) => k !== 'total');
const group = (list) => {
  let covered = 0, total = 0;
  for (const f of list) { covered += sum[f].branches.covered; total += sum[f].branches.total; }
  return total ? (100 * covered) / total : 100;
};
const core = files.filter((f) => CORE.some((c) => f.replace(/\\/g, '/').endsWith('web/js/' + c)));
const missing = CORE.filter((c) => !core.some((f) => f.replace(/\\/g, '/').endsWith('web/js/' + c)));
const coreB = group(core), allB = group(files);
console.log(`ветви: ядро ${coreB.toFixed(1)} % (порог 90), весь код без окон ${allB.toFixed(1)} % (порог 80)`);
let bad = 0;
if (missing.length) { console.log('нет в отчёте:', missing.join(', ')); bad++; }
if (coreB < 90) bad++;
if (allB < 80) bad++;
process.exit(bad ? 1 : 0);
