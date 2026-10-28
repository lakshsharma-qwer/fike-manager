// Title bar: tabs (new / close / reorder / tear-off / context menu) and caption buttons.
import { state, on, emit, activeTab } from './state.js';
import { $, h } from './util.js';
import { glyph, CAPTION } from './icons.js';
import { createTab, locTitle, locIcon, reload, locKey } from './nav.js';
import { showMenu } from './menu.js';
import { K } from './actions.js';

const api = window.api;
const strip = $('#tabstrip');

export function addTab(loc = null, activate = true) {
  const tab = createTab(loc);
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  state.tabs.splice(idx + 1, 0, tab);
  if (activate || !state.activeId) activateTab(tab.id);
  else render();
  return tab;
}

export function activateTab(id) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  const changed = state.activeId !== id;
  state.activeId = id;
  render();
  if (!changed) return;
  emit('tab-activated', tab);
  if (tab.loc.type === 'folder') {
    api.watch(tab.loc.path);
    // Pick up any changes that happened while the tab was in the background
    reload(tab);
  } else api.watch(null);
}

export function closeTab(id) {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  if (state.tabs.length === 1) {
    api.windowControl('close');
    return;
  }
  const [tab] = state.tabs.splice(idx, 1);
  if (tab.searchId) api.cancelSearch(tab.searchId);
  if (state.activeId === id) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    state.activeId = null;
    activateTab(next.id);
  } else render();
}

export function cycleTab(dir) {
  const idx = state.tabs.findIndex((t) => t.id === state.activeId);
  const next = state.tabs[(idx + dir + state.tabs.length) % state.tabs.length];
  activateTab(next.id);
}

export function selectTabIndex(n) {
  const tab = n === 9 ? state.tabs[state.tabs.length - 1] : state.tabs[n - 1];
  if (tab) activateTab(tab.id);
}

function locArg(loc) {
  if (loc.type === 'thispc') return 'shell:thispc';
  if (loc.type === 'home') return 'shell:home';
  return loc.path;
}

function moveToNewWindow(id) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  api.newWindow(locArg(tab.loc.type === 'search' ? { type: 'folder', path: tab.loc.path } : tab.loc));
  closeTab(id);
}

function tabMenu(tab, pos) {
  const idx = state.tabs.indexOf(tab);
  showMenu(pos, [
    { label: 'New tab', icon: glyph('plus'), key: K('Ctrl+T'), click: () => addTab() },
    { separator: true },
    { label: 'Close tab', icon: glyph('close'), key: K('Ctrl+W'), click: () => closeTab(tab.id) },
    { label: 'Close other tabs', disabled: state.tabs.length < 2, click: () => state.tabs.filter((t) => t !== tab).forEach((t) => closeTab(t.id)) },
    { label: 'Close tabs to the right', disabled: idx === state.tabs.length - 1, click: () => state.tabs.slice(idx + 1).forEach((t) => closeTab(t.id)) },
    { separator: true },
    { label: 'Duplicate tab', icon: glyph('copy'), click: () => addTab(tab.loc.type === 'search' ? { type: 'folder', path: tab.loc.path } : tab.loc) },
    { label: 'Move tab to new window', icon: glyph('newWindow'), click: () => moveToNewWindow(tab.id) },
  ]);
}

let dragId = null;

export function render() {
  const frag = document.createDocumentFragment();
  for (const tab of state.tabs) {
    const title = tab.loc.type === 'search' ? `Search Results in ${locTitle({ type: 'folder', path: tab.loc.path })}` : locTitle(tab.loc);
    const el = h(
      'div',
      { class: `tab${tab.id === state.activeId ? ' active' : ''}`, draggable: 'true', title: '' },
      h('span', { class: 'tab-icon', html: locIcon(tab.loc) }),
      h('span', { class: 'tab-title', text: title }),
      h('button', { class: 'tab-close', html: glyph('closeSm', 14), 'data-tip': `Close tab (${K('Ctrl+W')})` }),
    );
    el.dataset.tabId = String(tab.id);
    el.dataset.tip = title;
    frag.append(el);
  }
  const plus = h('button', { id: 'new-tab', html: glyph('plus', 14), 'data-tip': `Add new tab (${K('Ctrl+T')})` });
  plus.addEventListener('click', () => addTab());
  frag.append(plus);
  strip.replaceChildren(frag);
  const t = activeTab();
  if (t) document.title = `${locTitle(t.loc)} - File Explorer`;
}

function initCaption() {
  for (const b of document.querySelectorAll('.cap-btn[data-cap]')) {
    b.innerHTML = CAPTION[b.dataset.cap];
    b.addEventListener('click', () => api.windowControl(b.dataset.cap));
  }
  const setMax = ({ maximized, fullscreen }) => {
    const b = $('.cap-btn[data-cap="maximize"]');
    b.innerHTML = maximized || fullscreen ? CAPTION.restore : CAPTION.maximize;
    b.setAttribute('aria-label', maximized ? 'Restore Down' : 'Maximize');
    b.dataset.tip = maximized || fullscreen ? 'Restore Down' : 'Maximize';
  };
  $('.cap-btn[data-cap="minimize"]').dataset.tip = 'Minimize';
  $('.cap-btn[data-cap="close"]').dataset.tip = 'Close';
  api.on('window-state', setMax);
  api.windowState().then(setMax);
  $('#titlebar .drag-space').addEventListener('dblclick', () => api.windowControl('maximize'));
}

export function initTabs() {
  initCaption();
  strip.addEventListener('mousedown', (ev) => {
    const el = ev.target.closest('.tab');
    if (!el || ev.target.closest('.tab-close')) return;
    if (ev.button === 0) activateTab(Number(el.dataset.tabId));
  });
  strip.addEventListener('click', (ev) => {
    const close = ev.target.closest('.tab-close');
    if (close) closeTab(Number(close.closest('.tab').dataset.tabId));
  });
  strip.addEventListener('auxclick', (ev) => {
    const el = ev.target.closest('.tab');
    if (el && ev.button === 1) closeTab(Number(el.dataset.tabId));
  });
  strip.addEventListener('dblclick', (ev) => {
    if (!ev.target.closest('.tab') && !ev.target.closest('#new-tab')) addTab();
  });
  strip.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const el = ev.target.closest('.tab');
    const tab = el && state.tabs.find((t) => String(t.id) === el.dataset.tabId);
    if (tab) tabMenu(tab, { x: ev.clientX, y: ev.clientY });
  });

  // Reorder by dragging; drop outside the window to tear the tab off
  strip.addEventListener('dragstart', (ev) => {
    const el = ev.target.closest('.tab');
    if (!el) return;
    dragId = Number(el.dataset.tabId);
    ev.dataTransfer.setData('application/x-explorer-tab', String(dragId));
    ev.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  strip.addEventListener('dragover', (ev) => {
    if (dragId == null) return;
    ev.preventDefault();
    const el = ev.target.closest('.tab');
    if (!el || Number(el.dataset.tabId) === dragId) return;
    const from = state.tabs.findIndex((t) => t.id === dragId);
    const to = state.tabs.findIndex((t) => String(t.id) === el.dataset.tabId);
    const r = el.getBoundingClientRect();
    const after = ev.clientX > r.left + r.width / 2;
    if ((after && to === from - 1) || (!after && to === from + 1)) return;
    const [moved] = state.tabs.splice(from, 1);
    const target = state.tabs.findIndex((t) => String(t.id) === el.dataset.tabId);
    state.tabs.splice(after ? target + 1 : target, 0, moved);
    render();
    strip.querySelector(`.tab[data-tab-id="${dragId}"]`)?.classList.add('dragging');
  });
  strip.addEventListener('drop', (ev) => {
    if (dragId != null) ev.preventDefault();
  });
  strip.addEventListener('dragend', (ev) => {
    const id = dragId;
    dragId = null;
    render();
    const outside = ev.clientX < 0 || ev.clientY < 0 || ev.clientX > innerWidth || ev.clientY > innerHeight;
    if (outside && ev.dataTransfer.dropEffect === 'none' && state.tabs.length > 1) moveToNewWindow(id);
  });

  on('location', render);
  on('loading', render);
}

export { locKey };
