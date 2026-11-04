// Законы страницы: только headless Chromium, один исполнитель, вывод во временной папке.
// GB_WEB - другая папка web/ (tools/mutate.js гоняет законы на испорченных копиях).
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/web',
  workers: 1,
  fullyParallel: true,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'goingboy-playwright'),
  use: {
    headless: true,
    viewport: { width: 1280, height: 760 },
    locale: 'ru-RU',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
