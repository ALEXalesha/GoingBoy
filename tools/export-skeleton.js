// Выгрузить скелет GoingBoy для Blender: docs/skeleton.json (имена, родители, начала и концы
// костей в покое, метры, Y вверх, лицом к +Z). Его читает tools/blender/make_armature.py.
//   node tools/export-skeleton.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'web', 'js', 'body', 'retarget.js'));
const S = require(path.join(ROOT, 'web', 'js', 'body', 'skeleton.js'));
const round = (v) => v.map((x) => Math.round(x * 1e4) / 1e4);
const out = {
  units: 'meters', up: '+Y', forward: '+Z', left: '+X', restPose: 'standing, arms down along the body, palms to the thighs',
  bones: R.describe().map((b) => ({ name: b.name, parent: b.parent, head: round(b.head), tail: round(b.tail) })),
  joints: S.JOINTS.map((j) => ({ id: j.id, bone: S.BONES[j.bone].name, dofs: j.dofs.map((d) => ({ name: d.name, axis: d.axis, sign: d.sign, min: d.min, max: d.max })) })),
};
fs.writeFileSync(path.join(ROOT, 'docs', 'skeleton.json'), JSON.stringify(out, null, 1) + '\n');
console.log('docs/skeleton.json', out.bones.length, 'костей');
