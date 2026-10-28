// Tiny JSON settings store kept in the app's userData folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  pinned: null,            // filled on first run with the standard user folders
  recent: [],              // [{ path, time }]
  views: {},               // per-folder view settings: { [path]: { mode, sortKey, sortDir, groupBy } }
  windowBounds: null,
  sidebarWidth: 240,
  paneWidth: 320,
  pane: null,              // null | 'preview' | 'details'
  showHidden: false,
  showExtensions: true,
  compact: false,
  checkboxes: false,
  openTo: 'home',          // 'home' | 'thispc'
  columns: { name: 300, modified: 170, type: 150, size: 100, folder: 260 },
};

let data = null;
let file = null;
let saveTimer = null;

function load() {
  file = path.join(app.getPath('userData'), 'settings.json');
  try {
    data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    data = { ...DEFAULTS };
  }
  if (!data.pinned) {
    const home = app.getPath('home');
    data.pinned = ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Movies']
      .map((n) => path.join(home, n))
      .filter((p) => fs.existsSync(p));
  }
  return data;
}

function get() {
  return data || load();
}

function set(patch) {
  Object.assign(get(), patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
  return data;
}

function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('settings save failed', e);
  }
}

module.exports = { load, get, set, flush };
