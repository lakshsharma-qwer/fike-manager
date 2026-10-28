const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, Menu, nativeImage, nativeTheme, screen, ShareMenu } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const fsops = require('./fsops');

app.setName('File Explorer');

const windows = new Set();

function createWindow(location) {
  if (process.env.EXPLORER_DEBUG) console.log('createWindow', location);
  const settings = store.get();
  let bounds = settings.windowBounds;
  // Fall back to a sensible size if saved bounds are off-screen
  if (bounds) {
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return bounds.x < a.x + a.width && bounds.x + bounds.width > a.x && bounds.y < a.y + a.height && bounds.y + bounds.height > a.y;
    });
    if (!visible) bounds = null;
  }
  // Cascade additional windows
  if (bounds && windows.size > 0) bounds = { ...bounds, x: bounds.x + 26 * windows.size, y: bounds.y + 26 * windows.size };

  const win = new BrowserWindow({
    width: bounds?.width || 1180,
    height: bounds?.height || 720,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 520,
    minHeight: 360,
    frame: false,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true, // built-in PDF viewer for the preview pane
    },
  });
  windows.add(win);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
    query: { loc: location || '' },
  });

  win.once('ready-to-show', () => win.show());

  const sendState = () => {
    if (!win.isDestroyed()) win.webContents.send('window-state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  win.on('focus', () => !win.isDestroyed() && win.webContents.send('window-focus', true));
  win.on('blur', () => !win.isDestroyed() && win.webContents.send('window-focus', false));

  win.on('close', () => {
    if (!win.isMaximized() && !win.isFullScreen()) store.set({ windowBounds: win.getBounds() });
  });
  const wcId = win.webContents.id;
  win.on('closed', () => {
    fsops.unwatch(wcId);
    windows.delete(win);
  });

  win.webContents.on('console-message', (e) => {
    if (process.env.EXPLORER_DEBUG) console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`);
  });

  // Never let the page navigate away (e.g. a file dropped on a non-target area)
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.EXPLORER_SHOT) {
    win.webContents.once('did-finish-load', () => {
      // Optional script to drive the UI before the screenshot (development aid)
      if (process.env.EXPLORER_EVAL) {
        const code = fs.readFileSync(process.env.EXPLORER_EVAL, 'utf8');
        setTimeout(() => win.webContents.executeJavaScript(code).catch((e) => console.log('eval error', e)), 1500);
      }
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.EXPLORER_SHOT, img.toPNG());
        app.exit(0);
      }, Number(process.env.EXPLORER_SHOT_DELAY || 2500));
    });
  }
  return win;
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          // Shortcut handled in the renderer so Ctrl+N works too
          accelerator: 'CmdOrCtrl+N',
          registerAccelerator: false,
          click: () => createWindow(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen', accelerator: 'F11', registerAccelerator: false }],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------- clipboard (interoperable with Finder) ----------------

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeFilesToClipboard(paths) {
  const plist =
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><array>' +
    paths.map((p) => `<string>${escapeXml(p)}</string>`).join('') +
    '</array></plist>';
  clipboard.clear();
  clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf8'));
  clipboard.writeText(paths.join('\n'));
}

function readFilesFromClipboard() {
  try {
    const plist = clipboard.read('NSFilenamesPboardType');
    if (plist) {
      const out = [];
      const re = /<string>([\s\S]*?)<\/string>/g;
      let m;
      while ((m = re.exec(plist))) {
        out.push(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      }
      if (out.length) return out;
    }
  } catch {}
  try {
    const url = clipboard.read('public.file-url');
    if (url && url.startsWith('file://')) return [decodeURIComponent(new URL(url).pathname)];
  } catch {}
  return [];
}

// ---------------- IPC ----------------

function senderWin(e) {
  return BrowserWindow.fromWebContents(e.sender);
}

function sendTo(wc) {
  return (channel, payload) => {
    if (!wc.isDestroyed()) wc.send(channel, payload);
  };
}

const sizeJobs = new Map();

function registerIpc() {
  const h = (name, fn) => ipcMain.handle(name, (e, ...args) => fn(e, ...args));

  h('settings:get', () => store.get());
  h('settings:set', (e, patch) => store.set(patch));
  h('paths', () => fsops.specialPaths());
  h('platform', () => process.platform);

  h('fs:list', (e, dir) => fsops.listDir(dir));
  h('fs:subdirs', (e, dir, hidden) => fsops.listSubdirs(dir, hidden));
  h('fs:stat', (e, p) => fsops.stat(p));
  h('fs:exists', (e, p) => fsops.exists(p));
  h('fs:volumes', () => fsops.volumes());
  h('fs:mkdir', (e, dir, base) => fsops.mkdirUnique(dir, base));
  h('fs:newfile', (e, dir, base, ext) => fsops.newFile(dir, base, ext));
  h('fs:rename', async (e, p, name) => {
    try {
      return { path: await fsops.rename(p, name) };
    } catch (err) {
      return { error: err.code || 'ERR', message: err.message };
    }
  });
  h('fs:trash', (e, paths) => fsops.trash(paths));
  h('fs:delete', (e, paths) => fsops.deletePermanent(paths));
  h('fs:plan', (e, args) => fsops.planTransfer(args));
  h('fs:transfer', (e, args) => fsops.runTransfer(sendTo(e.sender), args));
  h('fs:job', (e, id, action) => fsops.controlJob(id, action));
  h('fs:search', (e, args) => fsops.startSearch(sendTo(e.sender), args));
  h('fs:search-cancel', (e, id) => fsops.cancelSearch(id));
  h('fs:thumb', (e, p, size) => fsops.thumbnail(p, size));
  h('fs:text', (e, p) => fsops.readTextPreview(p).catch((err) => ({ error: err.message })));
  h('fs:compress', async (e, paths) => {
    try {
      return { path: await fsops.compress(paths) };
    } catch (err) {
      return { error: err.message };
    }
  });
  h('fs:extract', async (e, p) => {
    try {
      return { path: await fsops.extract(p) };
    } catch (err) {
      return { error: err.message };
    }
  });
  h('fs:watch', (e, dir) => fsops.watch(e.sender.id, dir, sendTo(e.sender)));
  h('fs:empty-trash', async () => {
    try {
      await fsops.emptyTrash();
      return {};
    } catch (err) {
      return { error: err.message };
    }
  });
  h('fs:size-start', (e, id, paths) => {
    const signal = { cancelled: false };
    sizeJobs.set(id, signal);
    const send = sendTo(e.sender);
    (async () => {
      const total = { size: 0, files: 0, folders: 0 };
      for (const p of paths) {
        const base = { ...total };
        const r = await fsops.walkSize(p, (part) => send('size-progress', { id, size: base.size + part.size, files: base.files + part.files, folders: base.folders + part.folders }), signal);
        total.size += r.size;
        total.files += r.files;
        total.folders += r.folders;
      }
      sizeJobs.delete(id);
      send('size-progress', { id, ...total, done: true });
    })();
  });
  h('fs:size-cancel', (e, id) => {
    const s = sizeJobs.get(id);
    if (s) s.cancelled = true;
  });

  h('shell:open', async (e, p) => {
    const err = await shell.openPath(p);
    return err || null;
  });
  h('shell:reveal', (e, p) => shell.showItemInFolder(p));
  h('shell:terminal', (e, dir) => fsops.run('open', ['-a', 'Terminal', dir]).catch(() => {}));
  h('shell:open-with', async (e, p) => {
    const r = await dialog.showOpenDialog(senderWin(e), {
      title: 'Open with',
      defaultPath: '/Applications',
      buttonLabel: 'Open',
      properties: ['openFile', 'treatPackageAsDirectory'],
      filters: [{ name: 'Applications', extensions: ['app'] }],
    });
    if (r.canceled || !r.filePaths[0]) return;
    await fsops.run('open', ['-a', r.filePaths[0], p]).catch(() => {});
  });
  h('shell:share', (e, paths, x, y) => {
    const menu = new ShareMenu({ filePaths: paths });
    menu.popup({ window: senderWin(e), x: Math.round(x), y: Math.round(y) });
  });

  h('clip:write-files', (e, paths) => writeFilesToClipboard(paths));
  h('clip:read-files', () => readFilesFromClipboard());
  h('clip:write-text', (e, text) => clipboard.writeText(text));

  h('edit', (e, cmd) => {
    const wc = e.sender;
    if (typeof wc[cmd] === 'function' && ['copy', 'cut', 'paste', 'selectAll', 'undo', 'redo'].includes(cmd)) wc[cmd]();
  });

  ipcMain.on('drag-start', (e, paths, iconDataUrl) => {
    let icon = nativeImage.createFromDataURL(iconDataUrl || '');
    if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, '..', 'renderer', 'assets', 'drag.png'));
    e.sender.startDrag({ file: paths[0], files: paths, icon });
  });

  h('win:new', (e, loc) => {
    createWindow(loc);
  });
  h('win:control', (e, action) => {
    const win = senderWin(e);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') {
      if (win.isFullScreen()) win.setFullScreen(false);
      else if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    if (action === 'close') win.close();
    if (action === 'fullscreen') win.setFullScreen(!win.isFullScreen());
  });
  h('win:state', (e) => {
    const win = senderWin(e);
    return { maximized: win?.isMaximized(), fullscreen: win?.isFullScreen(), focused: win?.isFocused() };
  });
}

app.whenReady().then(() => {
  store.load();
  buildMenu();
  registerIpc();
  createWindow(process.env.EXPLORER_START || '');
  app.on('activate', () => {
    if (windows.size === 0) createWindow();
  });
});

app.on('before-quit', () => store.flush());
app.on('window-all-closed', () => {
  store.flush();
  if (process.env.EXPLORER_SHOT) app.quit();
});
