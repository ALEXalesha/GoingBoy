// Своя программа GoingBoy: те же файлы web/ в окне Electron (как у RailRunner).
//
// GB_TEST=1 - режим тестов: окно не показывается, не берёт фокус и стоит за экраном; все
// разрешения отклоняются. Тесты гоняют программу через Playwright без единого окна на экране.
'use strict';
const { app, BrowserWindow, Menu, screen, session } = require('electron');
const path = require('path');
const WindowState = require('./window-state');

const TEST = process.env.GB_TEST === '1';
const SIZE = { width: 1280, height: 780, minWidth: 360, minHeight: 480 };
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
let win = null;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(WindowState.load(stateFile()), areas, SIZE);
  win = new BrowserWindow({
    ...(TEST ? { x: -20000, y: -20000 } : placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width,
    height: placed.height,
    minWidth: SIZE.minWidth,
    minHeight: SIZE.minHeight,
    title: 'GoingBoy',
    icon: path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    backgroundColor: '#12101f',
    show: false,
    focusable: !TEST,
    skipTaskbar: TEST,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  if (!TEST) {
    if (placed.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
  }
  const remember = () => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen() && !TEST) WindowState.save(stateFile(), WindowState.capture(win)); };
  for (const event of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(event, remember);
  win.on('close', () => { if (win && !TEST && !win.isFullScreen()) WindowState.save(stateFile(), WindowState.capture(win)); });
  win.on('closed', () => { win = null; });
  // F11 - во весь экран; ссылки не открываются внутри программы; со страницы не уйти
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// Нет видеокарты (виртуальная машина, драйвер в чёрном списке) - WebGL рисует программно
// (SwiftShader), а не отказывает. Чёрный список драйверов не трогаем: плохой драйвер так и
// остаётся выключенным. Это безопасно: программа открывает только свои файлы и никуда не уходит.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => {
    if (!win || TEST) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    // Демке не нужны никакие разрешения: камера, уведомления, захват мыши - всё отклоняется
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
