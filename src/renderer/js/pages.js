// The Home page (Quick access + Recent) and This PC (folders + drives).
import { state, on, activeTab, saveSettings, emit } from './state.js';
import { $, h, esc, basename, dirname, formatDate, formatSize } from './util.js';
import { folderSVG, fileSVG, navSVG, driveSVG, glyph } from './icons.js';
import { navigate, folder, displayName, placeIcon } from './nav.js';
import { showMenu } from './menu.js';
import * as actions from './actions.js';

const api = window.api;
const page = $('#page');
const viewport = $('#viewport');
const collapsed = new Set();
let selected = null; // { el, kind, path }
export const pageInfo = { count: 0 };

function section(id, title, body) {
  const sec = h('div', { class: `sec${collapsed.has(id) ? ' collapsed' : ''}` });
  const head = h('button', { class: 'sec-head', html: `<span class="gchev">${glyph('chevD', 12)}</span><span>${esc(title)}</span>` });
  head.addEventListener('click', () => {
    collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id);
    sec.classList.toggle('collapsed');
  });
  sec.append(head, h('div', { class: 'sec-body' }, body));
  return sec;
}

function select(el) {
  page.querySelectorAll('.selected').forEach((x) => x.classList.remove('selected'));
  selected = el ? { el, kind: el.dataset.kind, path: el.dataset.path } : null;
  el?.classList.add('selected');
  emit('page-selection', selected);
}

export function pageSelection() {
  return selected;
}

function folderTileIcon(path) {
  const special = placeIcon(path, 20);
  const isPlain = special.includes('fg'); // plain folder icon
  return `<div style="position:relative;width:40px;height:40px">${folderSVG(40, { open: true })}${isPlain ? '' : `<div style="position:absolute;right:-2px;bottom:0">${special}</div>`}</div>`;
}

function tile(path, sub, extra = '') {
  const el = h('div', { class: 'qa-tile pg-item', tabindex: '-1', html: `${folderTileIcon(path)}<div class="meta"><div class="name">${esc(displayName(path))}</div><div class="sub">${sub}${extra}</div></div>` });
  el.dataset.path = path;
  el.dataset.kind = 'folder';
  return el;
}

async function renderHome() {
  const pinned = [];
  for (const p of state.settings.pinned) if (await api.exists(p)) pinned.push(p);
  const grid = h('div', { class: 'qa-grid' });
  for (const p of pinned) grid.append(tile(p, esc(p.startsWith(state.paths.home) ? 'Stored locally' : dirname(p)), ` ${glyph('pin', 12)}`));
  if (!pinned.length) grid.append(h('div', { class: 'rec-empty', text: 'Pin folders here to get to them quickly.' }));

  const recentEntries = [];
  for (const r of state.settings.recent) {
    const e = await api.stat(r.path);
    if (e) recentEntries.push({ ...e, accessed: r.time });
  }
  const table = h('div', { class: 'rec-table' }, h('div', { class: 'rec-head' }, h('div', { text: 'Name' }), h('div', { text: 'Date accessed' }), h('div', { text: 'File location' })));
  for (const e of recentEntries) {
    const row = h(
      'div',
      { class: 'rec-row pg-item', tabindex: '-1' },
      h('div', { class: 'rname', html: `${fileSVG(e, 16)}<span>${esc(e.name)}</span>` }),
      h('div', { text: formatDate(e.accessed) }),
      h('div', { text: dirname(e.path) }),
    );
    row.dataset.path = e.path;
    row.dataset.kind = e.isDir ? 'folder' : 'file';
    row.draggable = true;
    table.append(row);
  }
  if (!recentEntries.length) table.append(h('div', { class: 'rec-empty', text: "After you've opened some files, we'll show the most recent ones here." }));

  page.replaceChildren(section('qa', 'Quick access', grid), section('recent', 'Recent', table));
  pageInfo.count = pinned.length + recentEntries.length;
  emit('page-rendered');
}

async function renderThisPC() {
  const p = state.paths;
  const folders = [p.home, p.desktop, p.documents, p.downloads, p.music, p.pictures, p.videos];
  if (p.icloud) folders.push(p.icloud);
  const fgrid = h('div', { class: 'qa-grid' });
  for (const f of folders) if (await api.exists(f)) fgrid.append(tile(f, f === p.home ? 'Your home folder' : 'Stored locally'));

  const vols = await api.volumes();
  state.volumes = vols;
  const dgrid = h('div', { class: 'drives-grid' });
  for (const v of vols) {
    const used = v.total ? 1 - v.free / v.total : 0;
    const el = h('div', {
      class: 'drive-tile pg-item',
      tabindex: '-1',
      html: `${driveSVG(48, { removable: !v.isRoot })}<div class="meta"><div class="name">${esc(v.name)}${v.isRoot ? ' (/)' : ''}</div>
        <div class="drive-bar${used > 0.9 ? ' full' : ''}"><div style="width:${(used * 100).toFixed(1)}%"></div></div>
        <div class="sub">${v.total ? `${formatSize(v.free)} free of ${formatSize(v.total)}` : ''}</div></div>`,
    });
    el.dataset.path = v.path;
    el.dataset.kind = 'drive';
    dgrid.append(el);
  }
  page.replaceChildren(section('folders', 'Folders', fgrid), section('drives', 'Devices and drives', dgrid));
  pageInfo.count = fgrid.children.length + vols.length;
  emit('page-rendered');
}

export async function renderPage() {
  const tab = activeTab();
  const isPage = tab.loc.type === 'home' || tab.loc.type === 'thispc';
  page.classList.toggle('hidden', !isPage);
  viewport.classList.toggle('hidden', isPage);
  if (!isPage) return;
  selected = null;
  if (tab.loc.type === 'home') await renderHome();
  else await renderThisPC();
}

function itemMenu(el, pos) {
  const path = el.dataset.path;
  const kind = el.dataset.kind;
  const isFolder = kind === 'folder' || kind === 'drive';
  const pinned = actions.isPinned(path);
  const inRecent = el.classList.contains('rec-row');
  const items = [
    { label: 'Open', icon: glyph('open'), click: () => openItem(el) },
    isFolder ? { label: 'Open in new tab', icon: glyph('newTab'), click: () => actions.openInNewTab(path) } : null,
    isFolder ? { label: 'Open in new window', icon: glyph('newWindow'), click: () => actions.openInNewWindow(path) } : null,
    inRecent ? { label: 'Open file location', icon: glyph('open'), click: () => navigate(activeTab(), folder(dirname(path)), { select: [path] }) } : null,
    isFolder && kind !== 'drive' ? { label: pinned ? 'Unpin from Quick access' : 'Pin to Quick access', icon: glyph(pinned ? 'unpin' : 'pin'), click: () => actions.togglePin(path) } : null,
    inRecent ? { label: 'Remove from Recent', icon: glyph('close'), click: () => saveSettings({ recent: state.settings.recent.filter((r) => r.path !== path) }) } : null,
    { separator: true },
    { label: 'Copy as path', icon: glyph('copyPath'), click: () => api.clipWriteText(`"${path}"`) },
    {
      label: 'Properties',
      icon: glyph('properties'),
      click: async () => {
        const e = await api.stat(path);
        if (e) actions.showProperties([e]);
      },
    },
    { separator: true },
    isFolder ? { label: 'Open in Terminal', icon: glyph('terminal'), click: () => actions.openTerminal(path) } : null,
    { label: 'Show in Finder', icon: glyph('finder'), click: () => api.reveal(path) },
  ];
  showMenu(pos, items, {
    top: [
      { icon: glyph('copy'), tip: 'Copy', click: async () => actions.setClipboard([await api.stat(path)].filter(Boolean), false) },
      { icon: glyph('share'), tip: 'Share', click: () => api.share([path], pos.x, pos.y) },
    ],
    keyboard: pos.keyboard,
  });
}

function openItem(el) {
  const path = el.dataset.path;
  if (el.dataset.kind === 'file') actions.openPath(path);
  else navigate(activeTab(), folder(path));
}

export function initPages() {
  page.addEventListener('mousedown', (ev) => {
    const el = ev.target.closest('.pg-item');
    if (el || !ev.target.closest('.sec-head')) select(el);
    if (!el) page.focus({ preventScroll: true });
  });
  page.addEventListener('dblclick', (ev) => {
    const el = ev.target.closest('.pg-item');
    if (el) openItem(el);
  });
  page.addEventListener('auxclick', (ev) => {
    const el = ev.target.closest('.pg-item');
    if (ev.button === 1 && el && el.dataset.kind !== 'file') actions.openInNewTab(el.dataset.path, false);
  });
  page.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const el = ev.target.closest('.pg-item');
    if (el) {
      select(el);
      itemMenu(el, { x: ev.clientX, y: ev.clientY });
    }
  });
  page.addEventListener('dragstart', async (ev) => {
    const el = ev.target.closest('.pg-item');
    if (!el) return;
    const e = await api.stat(el.dataset.path);
    const { beginDragPaths } = await import('./dnd.js');
    if (e) beginDragPaths(ev, [e]);
  });
  page.addEventListener('keydown', (ev) => {
    const items = [...page.querySelectorAll('.sec:not(.collapsed) .pg-item')];
    if (!items.length) return;
    const idx = selected ? items.indexOf(selected.el) : -1;
    let next = null;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = items[Math.min(items.length - 1, idx + 1)];
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = items[Math.max(0, idx - 1)];
    else if (ev.key === 'Home') next = items[0];
    else if (ev.key === 'End') next = items[items.length - 1];
    else if (ev.key === 'Enter' && selected) {
      ev.preventDefault();
      return openItem(selected.el);
    } else if ((ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) && selected) {
      ev.preventDefault();
      const r = selected.el.getBoundingClientRect();
      return itemMenu(selected.el, { x: r.left + 20, y: r.bottom - 4, keyboard: true });
    }
    if (next) {
      ev.preventDefault();
      select(next);
      next.scrollIntoView({ block: 'nearest' });
    }
  });
  on('location', (t) => t.id === state.activeId && renderPage());
  on('tab-activated', () => renderPage());
  on('settings', (patch) => {
    const t = activeTab();
    if (t?.loc.type === 'home' && ('pinned' in patch || 'recent' in patch)) renderHome();
  });
}

export { navSVG };
