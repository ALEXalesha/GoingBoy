// МОДЕЛЬ ТЕЛА, часть 3: вид для three.js, построенный кодом. Гладкий манекен из капсул кожи,
// упрощённые кости, суставы шариками и мышцы цветными лентами-веретёнами.
//
// Договор вида (его же должна выполнить будущая модель из Blender, body/glb.js):
//   create(THREE) -> view
//   view.root                     - Object3D, добавить в сцену
//   view.update(f, paths, act)    - мировые положения/повороты костей (kinematics.fk),
//                                   точки лент мышц (load.paths) и активации 0..1
//   view.setLayers({ skin, muscles, bones })
//   view.setColors(scene)         - цвета темы (core/themes.js)
//   view.setHover(info | null)    - подсветить мышцу/кость/сустав под мышью
//   view.pickables                - меши для луча мыши, userData: { kind, id }
//   view.boneNodes                - Object3D по костям (по именам скелета)
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./skeleton.js'), require('./muscles.js'));
  else (root.GB = root.GB || {}).BodyView = factory(root.GB.Skeleton, root.GB.Muscles);
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function (S, M) {
  'use strict';

  // Цвета групп мышц в покое (без красного: красный - это работа)
  const GROUP_COLOR = { hip: 0xa98be0, thigh: 0x6fa8e8, shin: 0x52c4b4, trunk: 0xd9b48a, shoulder: 0x8cc77a, arm: 0xe8cf63, neck: 0xd79ac0 };
  const WORK = 0xff2a2a;
  const ALONG = 14;  // точек вдоль ленты
  const AROUND = 7;  // точек по кругу сечения

  /** Толщина ленты по силе мышцы (м): сильная мышца - толще. */
  const thickness = (fmax) => 0.011 + Math.sqrt(fmax) * 0.0007;

  /** Точки по ломаной, сглаженной Катмуллом-Ромом, - равномерно по параметру. */
  function smoothPath(pts, n) {
    const out = [];
    const seg = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * seg;
      const k = Math.min(seg - 1, Math.floor(u)), t = u - k;
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(seg, k + 2)];
      const t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
    return out;
  }

  function create(THREE) {
    const root = new THREE.Group();
    root.name = 'body';
    const pickables = [];
    const mat = {
      skin: new THREE.MeshStandardMaterial({ color: 0xd9d4ec, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 1 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.7 }),
      joint: new THREE.MeshStandardMaterial({ color: 0x8fb4ff, roughness: 0.4, emissive: 0x000000 }),
      hover: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4a6cff, emissiveIntensity: 0.6 }),
    };

    // ---------- кости: узел на кость, кожа и кость - его дети в осях кости ----------
    const boneNodes = {};
    const skinMeshes = [], boneMeshes = [], jointMeshes = [];
    const up = new THREE.Vector3(0, 1, 0);
    function capsule(a, b, r, material, parent) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const len = A.distanceTo(B);
      const g = new THREE.CapsuleGeometry(r, Math.max(1e-4, len), 6, 14);
      const m = new THREE.Mesh(g, material);
      m.position.copy(A).add(B).multiplyScalar(0.5);
      if (len > 1e-6) m.quaternion.setFromUnitVectors(up, B.clone().sub(A).normalize());
      parent.add(m);
      return m;
    }
    for (const b of S.BONES) {
      const node = new THREE.Group();
      node.name = b.name;
      root.add(node);
      boneNodes[b.name] = node;
      for (const [a, c, r] of b.caps) {
        const m = capsule(a, c, r, mat.skin, node);
        m.userData = { kind: 'skin', id: b.name };
        m.renderOrder = 2;
        skinMeshes.push(m);
      }
      const len = Math.hypot(...b.tail);
      const br = Math.max(0.008, Math.min(0.022, len * 0.07));
      const bm = capsule([0, 0, 0], b.tail, br, mat.bone, node);
      bm.userData = { kind: 'bone', id: b.name };
      boneMeshes.push(bm);
      pickables.push(bm);
      if (S.BONE_DOFS[b.index].length) {
        const j = S.JOINTS.find((x) => x.bone === b.index);
        const jm = new THREE.Mesh(new THREE.SphereGeometry(br * 1.5 + 0.006, 14, 10), mat.joint);
        jm.userData = { kind: 'joint', id: j.id };
        node.add(jm);
        jointMeshes.push(jm);
        pickables.push(jm);
      }
    }

    // ---------- мышцы: веретено вдоль сглаженного пути ----------
    const muscles = M.MUSCLES.map((m) => {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(ALONG * AROUND * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const idx = [];
      for (let i = 0; i < ALONG - 1; i++) {
        for (let k = 0; k < AROUND; k++) {
          const a = i * AROUND + k, b = i * AROUND + ((k + 1) % AROUND), c = a + AROUND, d = b + AROUND;
          idx.push(a, c, b, b, c, d);
        }
      }
      g.setIndex(idx);
      const material = new THREE.MeshStandardMaterial({ color: GROUP_COLOR[m.group], roughness: 0.45, metalness: 0.0, emissive: 0x000000 });
      const mesh = new THREE.Mesh(g, material);
      mesh.frustumCulled = false;
      mesh.userData = { kind: 'muscle', id: m.id };
      root.add(mesh);
      pickables.push(mesh);
      return { mesh, pos, r: thickness(m.fmax), base: new THREE.Color(GROUP_COLOR[m.group]) };
    });

    const tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), tan = new THREE.Vector3();
    const work = new THREE.Color(WORK);
    const layers = { skin: false, muscles: true, bones: true };
    let hovered = null;

    function update(f, paths, act) {
      for (const b of S.BONES) {
        const n = boneNodes[b.name];
        n.position.set(...f.pos[b.index]);
        n.quaternion.set(...f.rot[b.index]);
      }
      if (!layers.muscles) return;
      muscles.forEach((m, mi) => {
        const pts = smoothPath(paths[mi], ALONG);
        let prevN = null;
        for (let i = 0; i < ALONG; i++) {
          const a = pts[Math.max(0, i - 1)], c = pts[Math.min(ALONG - 1, i + 1)];
          tan.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize();
          // поперечные оси: продолжаем прошлую нормаль, чтобы лента не перекручивалась
          if (!prevN) { nrm.set(0, 0, 1); if (Math.abs(tan.dot(nrm)) > 0.9) nrm.set(1, 0, 0); }
          else nrm.copy(prevN);
          nrm.sub(tmp.copy(tan).multiplyScalar(tan.dot(nrm))).normalize();
          bin.crossVectors(tan, nrm);
          prevN = nrm.clone();
          const s = i / (ALONG - 1);
          const r = m.r * (0.25 + 0.75 * Math.sin(Math.PI * s));
          for (let k = 0; k < AROUND; k++) {
            const ang = (k / AROUND) * Math.PI * 2;
            // сечение - чуть приплюснутый эллипс: лента, а не трубка
            const cx = Math.cos(ang) * r, cy = Math.sin(ang) * r * 0.6;
            const o = (i * AROUND + k) * 3;
            m.pos[o] = pts[i][0] + nrm.x * cx + bin.x * cy;
            m.pos[o + 1] = pts[i][1] + nrm.y * cx + bin.y * cy;
            m.pos[o + 2] = pts[i][2] + nrm.z * cx + bin.z * cy;
          }
        }
        const g = m.mesh.geometry;
        g.attributes.position.needsUpdate = true;
        g.computeVertexNormals();
        g.computeBoundingSphere();
        const a = Math.min(1, Math.max(0, act ? act[mi] : 0));
        const k = Math.pow(a, 0.7);
        m.mesh.material.color.copy(m.base).lerp(work, k);
        m.mesh.material.emissive.copy(work).multiplyScalar(k * 0.45);
        if (hovered && hovered.kind === 'muscle' && hovered.id === M.MUSCLES[mi].id) m.mesh.material.emissive.setRGB(0.25, 0.35, 1);
      });
    }

    function applyLayers() {
      const inner = layers.muscles || layers.bones;
      for (const m of skinMeshes) m.visible = layers.skin;
      mat.skin.opacity = inner ? 0.22 : 1;
      mat.skin.depthWrite = !inner;
      for (const m of boneMeshes) m.visible = layers.bones;
      for (const m of jointMeshes) m.visible = layers.bones || layers.muscles || layers.skin;
      for (const m of muscles) m.mesh.visible = layers.muscles;
      // на голой коже луч мыши ловит кожу (кости под ней не видны)
      for (const m of skinMeshes) {
        const at = pickables.indexOf(m);
        if (layers.skin && !inner && at < 0) pickables.push(m);
        if ((!layers.skin || inner) && at >= 0) pickables.splice(at, 1);
      }
    }

    function setLayers(l) { Object.assign(layers, l); applyLayers(); }

    function setColors(sc) {
      mat.skin.color.setHex(sc.skin);
      mat.bone.color.setHex(sc.bone);
      mat.joint.color.setHex(sc.joint);
    }

    function setHover(info) {
      hovered = info;
      for (const m of boneMeshes) m.material = info && info.kind !== 'muscle' && info.id === m.userData.id && info.kind === 'bone' ? mat.hover : mat.bone;
      for (const m of jointMeshes) m.material = info && info.kind === 'joint' && info.id === m.userData.id ? mat.hover : mat.joint;
    }

    applyLayers();
    return { root, update, setLayers, setColors, setHover, pickables, boneNodes, layers, muscles };
  }

  return { create, smoothPath, thickness, GROUP_COLOR };
});
