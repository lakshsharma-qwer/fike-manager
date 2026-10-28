// Bootstrap: load settings, wire every module, status bar, splitters, window state.
import { state, on, activeTab, selectedEntries, saveSettings } from './state.js';
import { $, h, formatSize } from './util.js';
import { glyph } from './icons.js';
import { parseLoc, initSearchListeners } from './nav.js';
import { initTooltips } from './tooltip.js';
import * as fv from './fileview.js';
import { initTabs, addTab } from './tabs.js';
import { initAddressBar } from './addressbar.js';
import { initCommandBar } from './commandbar.js';
import { initSidebar } from './sidebar.js';
import { initPages, pageInfo, pageSelection } from './pages.js';
import { initPanes } from './panes.js';
import { initDnd } from './dnd.js';
import { initKeyboard } from './keyboard.js';
import { setView } from './nav.js';

const api = window.api;

// ---------------- status bar ----------------

function renderStatus() {
  const tab = activeTab();
  if (!tab) return;
  const parts = [];
  if (tab.loc.type === 'home' || tab.loc.type === 'thispc') {
    parts.push(`${pageInfo.count} item${pageInfo.count === 1 ? '' : 's'}`);
    if (pageSelection()) parts.push('1 item selected');
  } else {
    const n = tab.items.length;
    parts.push(tab.loading ? 'Working on it...' : `${n.toLocaleString()} item${n === 1 ? '' : 's'}`);
    const sel = selectedEntries(tab);
    if (sel.length) {
      const files = sel.filter((e) => !e.isDir);
      const size = files.reduce((s, e) => s + e.size, 0);
      parts.push(`${sel.length.toLocaleString()} item${sel.length === 1 ? '' : 's'} selected${files.length ? `  ${formatSize(size)}` : ''}`);
    }
    if (tab.searching) parts.push('Searching...');
    if (state.clipboard.cut && state.clipboard.paths.length) parts.push(`${state.clipboard.paths.length} item${state.clipboard.paths.length === 1 ? '' : 's'} cut`);
  }
  $('#status-text').replaceChildren(...parts.map((p) => h('span', { class: 'part', text: p })));
  const mode = tab.view?.mode;
  const isList = tab.loc.type === 'folder' || tab.loc.type === 'search';
  $('#status-details').classList.toggle('on', isList && mode === 'details');
  $('#status-large').classList.toggle('on', isList && mode === 'large');
  $('#status-details').disabled = !isList;
  $('#status-large').disabled = !isList;
}

function initStatus() {
  $('#status-details').innerHTML = glyph('vDetails', 14);
  $('#status-large').innerHTML = glyph('vLarge', 14);
  $('#status-details').addEventListener('click', () => setView(activeTab(), { mode: 'details' }));
  $('#status-large').addEventListener('click', () => setView(activeTab(), { mode: 'large' }));
  for (const evt of ['items', 'selection', 'location', 'loading', 'tab-activated', 'view', 'page-rendered', 'page-selection', 'clipboard']) {
    on(evt, () => requestAnimationFrame(renderStatus));
  }
}

// ---------------- layout: splitters, compact, nav pane ----------------

function applyLayoutSettings() {
  const s = state.settings;
  document.documentElement.style.setProperty('--sidebar-w', `${s.sidebarWidth}px`);
  document.documentElement.style.setProperty('--pane-w', `${s.paneWidth}px`);
  document.body.classList.toggle('compact', !!s.compact);
  $('#main').classList.toggle('no-sidebar', s.showNav === false);
}

function splitter(el, key, min, max, invert) {
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = state.settings[key];
    document.body.style.cursor = 'col-resize';
    const move = (ev) => {
      const dx = (ev.clientX - startX) * (invert ? -1 : 1);
      state.settings[key] = Math.round(Math.max(min, Math.min(max, startW + dx)));
      applyLayoutSettings();
    };
    const up = () => {
      document.body.style.cursor = '';
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
      saveSettings({ [key]: state.settings[key] });
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });
}

// ---------------- boot ----------------

async function boot() {
  const [settings, paths, volumes] = await Promise.all([api.settings.get(), api.paths(), api.volumes()]);
  state.settings = settings;
  state.settings.columns = { name: 300, modified: 170, type: 150, size: 100, created: 170, folder: 260, ...settings.columns };
  state.paths = paths;
  state.volumes = volumes;

  applyLayoutSettings();
  on('settings', applyLayoutSettings);
  splitter($('#sidebar-splitter'), 'sidebarWidth', 120, 520, false);
  splitter($('#pane-splitter'), 'paneWidth', 200, 800, true);

  initTooltips();
  fv.init();
  initSearchListeners();
  initTabs();
  initAddressBar();
  initCommandBar();
  initSidebar();
  initPages();
  initPanes();
  initDnd();
  initKeyboard();
  initStatus();

  api.on('window-focus', (focused) => {
    state.windowFocused = focused;
    document.body.classList.toggle('inactive', !focused);
  });

  // Keep focus in the list after navigating, like Explorer does
  on('location', (t) => {
    if (t.id !== state.activeId) return;
    const a = document.activeElement;
    if (a && (a.id === 'search-input' || a.id === 'address-input' || a.closest?.('#sidebar'))) return;
    setTimeout(() => fv.focusView(), 0);
  });
  on('tab-activated', () => setTimeout(() => fv.focusView(), 0));

  const startLoc = parseLoc(new URLSearchParams(location.search).get('loc'));
  addTab(startLoc, true);
  setTimeout(() => fv.focusView(), 50);
}

boot().catch((e) => {
  console.error(e);
  document.body.append(h('pre', { style: { position: 'fixed', inset: '0', padding: '20px', background: '#fff', color: '#c00', whiteSpace: 'pre-wrap', zIndex: 9999 }, text: `Startup error:\n${e.stack || e}` }));
});
