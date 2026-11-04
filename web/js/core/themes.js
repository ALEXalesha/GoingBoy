// Пять тем, как в PaintPro: стеклянная (по умолчанию), строгая, светлая, ночная, тёплая.
// Цвета интерфейса - CSS-переменные в css/style.css (атрибут data-theme на <html>), цвета
// сцены - здесь: пол, сетка, кожа, кости, суставы. Неизвестная тема - стеклянная.
(function (root, factory) {
  /* c8 ignore start */
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.GB = root.GB || {}).Themes = factory();
  /* c8 ignore stop */
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const THEMES = [
    { id: 'glass', dark: true, scene: { floor: 0x2a2440, grid: 0x6a5fa0, skin: 0xd9d4ec, bone: 0xf1e9d6, joint: 0x8fb4ff, ambient: 0.55 } },
    { id: 'formal', dark: true, scene: { floor: 0x262b35, grid: 0x56627a, skin: 0xcfd5de, bone: 0xece6d8, joint: 0x6f9bd1, ambient: 0.5 } },
    { id: 'light', dark: false, scene: { floor: 0xd9dfe9, grid: 0x9aa6bb, skin: 0xb9c2d3, bone: 0xf6efe0, joint: 0x3a6fd8, ambient: 0.7 } },
    { id: 'night', dark: true, scene: { floor: 0x0d0f15, grid: 0x2b3142, skin: 0x9a9fae, bone: 0xc9c2b2, joint: 0x4668a8, ambient: 0.4 } },
    { id: 'warm', dark: true, scene: { floor: 0x2b2017, grid: 0x7a5a3a, skin: 0xe9d6bd, bone: 0xf5e9d3, joint: 0xd08a3c, ambient: 0.55 } },
  ];
  const IDS = THEMES.map((t) => t.id);
  const get = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

  return { THEMES, IDS, get };
});
