// The file list: layout engine (8 view modes + groups), virtualized rendering,
// selection (click / modifiers / marquee / keyboard / type-ahead), inline rename, info tips.
import { state, on, emit, activeTab, saveSettings } from './state.js';
import { $, h, esc, formatDate, formatKB, formatSize, typeName, dirname, category, THUMB_CATS, INVALID_NAME_CHARS, splitExt, clamp } from './util.js';
import { iconFor, glyph, LINK_OVERLAY } from './icons.js';
import { groupsFor, setView, isTrash, displayName, applySort } from './nav.js';
import { showMenu } from './menu.js';
import { showTip, hideTip } from './tooltip.js';
import * as actions from './actions.js';
import * as dnd from './dnd.js';

const api = window.api;
const viewport = $('#viewport');
const canvas = $('#canvas');

export const MODES = [
  { id: 'xl', label: 'Extra large icons', glyph: 'vXL', key: 'Ctrl+Shift+1' },
  { id: 'large', label: 'Large icons', glyph: 'vLarge', key: 'Ctrl+Shift+2' },
  { id: 'medium', label: 'Medium icons', glyph: 'vMedium', key: 'Ctrl+Shift+3' },
  { id: 'small', label: 'Small icons', glyph: 'vSmall', key: 'Ctrl+Shift+4' },
  { id: 'list', label: 'List', glyph: 'vList', key: 'Ctrl+Shift+5' },
  { id: 'details', label: 'Details', glyph: 'vDetails', key: 'Ctrl+Shift+6' },
  { id: 'tiles', label: 'Tiles', glyph: 'vTiles', key: 'Ctrl+Shift+7' },
  { id: 'content', label: 'Content', glyph: 'vContent', key: 'Ctrl+Shift+8' },
];

export const COLUMNS = {
  name: { label: 'Name', min: 120 },
  modified: { label: 'Date modified', min: 60, firstDir: -1 },
  type: { label: 'Type', min: 60 },
  size: { label: 'Size', min: 50, firstDir: -1 },
  created: { label: 'Date created', min: 60, firstDir: -1 },
  folder: { label: 'Folder', min: 80 },
};

function metrics(mode) {
  const c = state.settings.compact;
  switch (mode) {
    case 'xl':
      return { kind: 'grid', w: 276, h: 300, icon: 256 };
    case 'large':
      return { kind: 'grid', w: 118, h: c ? 134 : 146, icon: 96 };
    case 'medium':
      return { kind: 'grid', w: 90, h: c ? 90 : 100, icon: 48 };
    case 'small':
      return { kind: 'grid', w: 236, h: c ? 22 : 28, icon: 16 };
    case 'tiles':
      return { kind: 'grid', w: 292, h: c ? 64 : 76, icon: 48 };
    case 'list':
      return { kind: 'list', w: 280, h: c ? 22 : 28, icon: 16 };
    case 'content':
      return { kind: 'rows', h: c ? 56 : 68, icon: 48 };
    default:
      return { kind: 'details', h: c ? 24 : 32, icon: 16, header: c ? 26 : 32 };
  }
}

const PAD = 12;
const GROUP_H = 40;

let tab = null;
let L = null; // current layout
const nodes = new Map();
let headerEl = null;
let emptyEl = null;

// ---------------- columns ----------------

export function visibleColumns(t = tab) {
  const vis = state.settings.columnsVisible || ['name', 'modified', 'type', 'size'];
  const cols = [...vis];
  if (t?.loc.type === 'search' && !cols.includes('folder')) cols.splice(1, 0, 'folder');
  return cols.map((key) => ({ key, width: state.settings.columns[key] || 150 }));
}

// ---------------- layout ----------------

function computeLayout() {
  const mode = tab.view.mode;
  const m = metrics(mode);
  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;
  const out = { mode, m, entries: [], order: [], rect: new Map(), totalW: vw, totalH: 0, headerH: 0, cols: 1, rowsPerCol: 1 };
  const groups = m.kind === 'list' ? null : groupsFor(tab);
  const sections = groups || [{ key: null, items: tab.items }];

  if (m.kind === 'details') {
    const cols = visibleColumns();
    const colsW = cols.reduce((s, c) => s + c.width, 0);
    out.columns = cols;
    out.headerH = m.header;
    out.totalW = Math.max(vw, PAD + colsW + PAD);
    let y = m.header + 2;
    for (const s of sections) {
      if (s.key != null) {
        const collapsed = tab.collapsed.has(s.key);
        out.entries.push({ kind: 'group', key: s.key, label: s.label, count: s.items.length, collapsed, x: PAD, y, w: Math.max(colsW, vw - PAD * 2), h: GROUP_H });
        y += GROUP_H;
        if (collapsed) continue;
      }
      for (const e of s.items) {
        const r = { kind: 'item', e, x: PAD, y, w: colsW, h: m.h };
        out.entries.push(r);
        out.order.push(e);
        out.rect.set(e.path, r);
        y += m.h;
      }
    }
    out.totalH = y + 12;
  } else if (m.kind === 'grid') {
    const avail = Math.max(m.w, vw - PAD * 2);
    const cols = Math.max(1, Math.floor(avail / m.w));
    out.cols = cols;
    let y = 6;
    for (const s of sections) {
      if (s.key != null) {
        const collapsed = tab.collapsed.has(s.key);
        out.entries.push({ kind: 'group', key: s.key, label: s.label, count: s.items.length, collapsed, x: PAD, y, w: avail, h: GROUP_H });
        y += GROUP_H;
        if (collapsed) continue;
      }
      s.items.forEach((e, i) => {
        const r = { kind: 'item', e, x: PAD + (i % cols) * m.w, y: y + Math.floor(i / cols) * m.h, w: m.w, h: m.h };
        out.entries.push(r);
        out.order.push(e);
        out.rect.set(e.path, r);
      });
      y += Math.ceil(s.items.length / cols) * m.h + (s.key != null ? 8 : 0);
    }
    out.totalH = y + 12;
  } else if (m.kind === 'list') {
    const rows = Math.max(1, Math.floor((vh - 12 - 14) / m.h));
    out.rowsPerCol = rows;
    tab.items.forEach((e, i) => {
      const r = { kind: 'item', e, x: PAD + Math.floor(i / rows) * m.w, y: 6 + (i % rows) * m.h, w: m.w - 8, h: m.h };
      out.entries.push(r);
      out.order.push(e);
      out.rect.set(e.path, r);
    });
    out.totalW = Math.max(vw, PAD * 2 + Math.ceil(tab.items.length / rows) * m.w);
    out.totalH = vh - 14;
  } else {
    // content rows
    const w = Math.max(400, vw - PAD * 2);
    let y = 4;
    for (const s of sections) {
      if (s.key != null) {
        const collapsed = tab.collapsed.has(s.key);
        out.entries.push({ kind: 'group', key: s.key, label: s.label, count: s.items.length, collapsed, x: PAD, y, w, h: GROUP_H });
        y += GROUP_H;
        if (collapsed) continue;
      }
      for (const e of s.items) {
        const r = { kind: 'item', e, x: PAD, y, w, h: m.h };
        out.entries.push(r);
        out.order.push(e);
        out.rect.set(e.path, r);
        y += m.h;
      }
    }
    out.totalW = Math.max(vw, w + PAD * 2);
    out.totalH = y + 12;
  }
  return out;
}

// ---------------- rendering ----------------

export function displayLabel(e) {
  if (state.settings.showExtensions || e.isDir || !e.ext) return e.name;
  return splitExt(e.name)[0];
}

const thumbCache = new Map();
const thumbQueue = [];
let thumbActive = 0;

function thumbKey(e, size) {
  return `${e.path}|${e.mtime}|${size}`;
}

function pumpThumbs() {
  while (thumbActive < 4 && thumbQueue.length) {
    const job = thumbQueue.pop(); // newest first: what's on screen now
    if (thumbCache.has(job.key)) continue;
    thumbActive++;
    api.thumbnail(job.e.path, job.size).then((url) => {
      thumbActive--;
      thumbCache.set(job.key, url || null);
      if (url) {
        const node = nodes.get(job.e.path);
        const ico = node?.querySelector('.ico');
        if (ico && ico.dataset.thumb === job.key) setThumb(ico, url, job.e);
      }
      pumpThumbs();
    });
  }
}

function setThumb(ico, url, e) {
  ico.innerHTML = `<img class="thumb" draggable="false" src="${url}">${e.isLink ? LINK_OVERLAY(Math.min(32, ico.clientWidth / 2)) : ''}`;
}

function iconHTML(e, size) {
  let html = iconFor(e, size);
  if (e.isLink) html += LINK_OVERLAY(Math.max(10, Math.round(size / 2.2)));
  return html;
}

function buildIco(e, size, allowThumb) {
  const ico = h('div', { class: 'ico', style: { width: `${size}px`, height: `${size}px` } });
  const cat = category(e);
  if (allowThumb && size >= 32 && THUMB_CATS.has(cat)) {
    const px = Math.round(size * (window.devicePixelRatio || 1));
    const key = thumbKey(e, px);
    ico.dataset.thumb = key;
    const cached = thumbCache.get(key);
    if (cached) {
      setThumb(ico, cached, e);
      return ico;
    }
    if (!thumbCache.has(key)) thumbQueue.push({ key, e, size: px });
  }
  ico.innerHTML = iconHTML(e, size);
  return ico;
}

const chk = () => h('span', { class: 'chk', html: glyph('check', 12, 1.6) });

function buildItem(r) {
  const e = r.e;
  const mode = L.mode;
  const m = L.m;
  let el;
  if (m.kind === 'details') {
    el = h('div', { class: 'item row' });
    for (const c of L.columns) {
      let cell;
      if (c.key === 'name') {
        cell = h('div', { class: 'c name' }, state.settings.checkboxes ? chk() : null, buildIco(e, 16, false), h('span', { class: 'label', text: displayLabel(e) }));
      } else {
        let text = '';
        if (c.key === 'modified') text = formatDate(e.mtime);
        else if (c.key === 'created') text = formatDate(e.ctime);
        else if (c.key === 'type') text = typeName(e);
        else if (c.key === 'size') text = e.isDir ? '' : formatKB(e.size);
        else if (c.key === 'folder') text = `${displayName(dirname(e.path))} (${dirname(e.path)})`;
        cell = h('div', { class: `c ${c.key}`, text });
      }
      el.append(cell);
    }
  } else if (mode === 'small' || mode === 'list') {
    el = h('div', { class: 'item inline' }, state.settings.checkboxes ? chk() : null, buildIco(e, 16, false), h('span', { class: 'label', text: displayLabel(e) }));
  } else if (mode === 'tiles') {
    el = h(
      'div',
      { class: 'item htile' },
      state.settings.checkboxes ? chk() : null,
      buildIco(e, 48, true),
      h('div', { class: 'meta' }, h('span', { class: 'label', text: displayLabel(e) }), h('span', { class: 'sub', text: typeName(e) }), e.isDir ? null : h('span', { class: 'sub', text: formatSize(e.size) })),
    );
  } else if (mode === 'content') {
    el = h(
      'div',
      { class: 'item crow' },
      buildIco(e, state.settings.compact ? 32 : 48, true),
      h('div', { class: 'meta' }, h('span', { class: 'label', text: displayLabel(e) }), h('span', { class: 'sub', text: tab.loc.type === 'search' ? dirname(e.path) : typeName(e) })),
      h(
        'div',
        { class: 'side' },
        h('span', { class: 'sub', html: `<span class="k">Date modified:</span> ${esc(formatDate(e.mtime))}` }),
        e.isDir ? null : h('span', { class: 'sub', html: `<span class="k">Size:</span> ${esc(formatSize(e.size))}` }),
      ),
    );
  } else {
    el = h('div', { class: 'item vtile' }, state.settings.checkboxes ? chk() : null, buildIco(e, m.icon, true), h('span', { class: 'label', text: displayLabel(e) }));
  }
  el.dataset.path = e.path;
  el.draggable = true;
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  if (m.kind === 'grid' && m.icon > 16) el.style.minHeight = `${r.h - 4}px`;
  else el.style.height = `${r.h}px`;
  if (e.hidden) el.classList.add('hidden-item');
  applyClasses(el, e.path);
  return el;
}

function buildGroup(r) {
  const el = h(
    'div',
    { class: `group-header${r.collapsed ? ' collapsed' : ''}` },
    h('span', { class: 'gchev', html: glyph('chevD', 12) }),
    h('span', { text: r.label }),
    h('span', { class: 'gcount', text: `(${r.count})` }),
    h('span', { class: 'gline' }),
  );
  el.dataset.group = r.key;
  Object.assign(el.style, { left: `${r.x}px`, top: `${r.y + 6}px`, width: `${r.w}px`, height: `${r.h - 10}px` });
  return el;
}

function applyClasses(el, path) {
  el.classList.toggle('selected', tab.selection.has(path));
  el.classList.toggle('focused', tab.focus === path);
  el.classList.toggle('cut', state.clipboard.cut && state.clipboard.set?.has(path));
}

function buildHeader() {
  headerEl?.remove();
  headerEl = null;
  if (L.m.kind !== 'details') return;
  headerEl = h('div', { class: 'dheader' });
  headerEl.style.width = `${L.totalW}px`;
  for (const c of L.columns) {
    const col = h('div', { class: `dcol ${c.key}` }, h('span', { text: COLUMNS[c.key].label }));
    if (tab.view.sortKey === c.key) col.append(h('span', { class: 'sort-arrow', html: glyph(tab.view.sortDir > 0 ? 'sortUp' : 'sortDown', 12) }));
    const grip = h('div', { class: 'grip' });
    col.append(grip);
    col.addEventListener('click', (ev) => {
      if (ev.target === grip) return;
      const cur = tab.view;
      const dir = cur.sortKey === c.key ? -cur.sortDir : COLUMNS[c.key].firstDir || 1;
      setView(tab, { sortKey: c.key, sortDir: dir });
    });
    grip.addEventListener('mousedown', (ev) => startColumnResize(ev, c.key));
    grip.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      autoFitColumn(c.key);
    });
    headerEl.append(col);
  }
  headerEl.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const vis = state.settings.columnsVisible || ['name', 'modified', 'type', 'size'];
    showMenu(
      { x: ev.clientX, y: ev.clientY },
      [
        { label: 'Size column to fit', click: () => autoFitColumn(L.columns[0].key) },
        { label: 'Size all columns to fit', click: () => L.columns.forEach((c) => autoFitColumn(c.key)) },
        { separator: true },
        ...Object.entries(COLUMNS)
          .filter(([k]) => k !== 'folder')
          .map(([k, c]) => ({
            label: c.label,
            checked: vis.includes(k),
            disabled: k === 'name',
            click: () => {
              const next = vis.includes(k) ? vis.filter((x) => x !== k) : Object.keys(COLUMNS).filter((x) => x === k || vis.includes(x));
              saveSettings({ columnsVisible: next });
              renderView();
            },
          })),
      ],
    );
  });
  canvas.prepend(headerEl);
}

function startColumnResize(ev, key) {
  ev.preventDefault();
  ev.stopPropagation();
  const startX = ev.clientX;
  const startW = state.settings.columns[key];
  const min = COLUMNS[key].min;
  const move = (e) => {
    state.settings.columns[key] = Math.max(min, startW + e.clientX - startX);
    relayoutKeepScroll();
  };
  const up = () => {
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
    saveSettings({ columns: { ...state.settings.columns } });
  };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
}

function autoFitColumn(key) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
  let max = ctx.measureText(COLUMNS[key].label).width + 30;
  for (const e of tab.items.slice(0, 3000)) {
    let t = '';
    if (key === 'name') t = displayLabel(e);
    else if (key === 'modified') t = formatDate(e.mtime);
    else if (key === 'created') t = formatDate(e.ctime);
    else if (key === 'type') t = typeName(e);
    else if (key === 'size') t = e.isDir ? '' : formatKB(e.size);
    else if (key === 'folder') t = dirname(e.path);
    max = Math.max(max, ctx.measureText(t).width + (key === 'name' ? 52 : 28));
  }
  state.settings.columns[key] = Math.ceil(Math.min(max, 900));
  saveSettings({ columns: { ...state.settings.columns } });
  relayoutKeepScroll();
}

function setColsVar() {
  if (L.columns) canvas.style.setProperty('--cols', L.columns.map((c) => `${c.width}px`).join(' '));
}

function relayoutKeepScroll() {
  L = computeLayout();
  setColsVar();
  canvas.style.width = `${L.totalW}px`;
  canvas.style.height = `${L.totalH}px`;
  if (headerEl) headerEl.style.width = `${L.totalW}px`;
  for (const [, n] of nodes) n.remove();
  nodes.clear();
  paint();
}

export function renderView() {
  tab = activeTab();
  if (!tab || (tab.loc.type !== 'folder' && tab.loc.type !== 'search')) return;
  document.body.classList.toggle('checkboxes', !!state.settings.checkboxes);
  L = computeLayout();
  setColsVar();
  for (const [, n] of nodes) n.remove();
  nodes.clear();
  emptyEl?.remove();
  emptyEl = null;
  canvas.querySelectorAll('.list-error').forEach((x) => x.remove());
  canvas.style.width = `${L.totalW}px`;
  canvas.style.height = `${L.totalH}px`;
  buildHeader();
  if (tab.error) {
    canvas.append(errorBlock(tab));
  } else if (!tab.items.length && !tab.loading) {
    let msg = 'This folder is empty.';
    if (tab.loc.type === 'search') msg = tab.searching ? 'Searching...' : 'No items match your search.';
    emptyEl = h('div', { class: 'empty-text', text: msg });
    canvas.append(emptyEl);
  }
  paint();
}

function errorBlock(t) {
  const err = t.error;
  const trash = isTrash(t.loc);
  let title = 'Location is not available';
  let text = `${t.loc.path} is not accessible.\n\n${err.message || ''}`;
  if (err.code === 'EACCES' || err.code === 'EPERM') {
    title = "You don't currently have permission to access this folder.";
    text = trash
      ? 'macOS protects the Trash. Give this app (or your terminal) Full Disk Access in System Settings › Privacy & Security, or open it in Finder.'
      : 'macOS denied access to this folder. You may need to grant access in System Settings › Privacy & Security.';
  } else if (err.code === 'ENOENT') {
    text = `${t.loc.path} could not be found. It may have been moved or deleted.`;
  }
  const box = h('div', { class: 'list-error' }, h('div', { class: 'err-title', text: title }), h('div', { text, style: { whiteSpace: 'pre-line', maxWidth: '460px' } }));
  if (err.code === 'EACCES' || err.code === 'EPERM') box.append(h('button', { class: 'btn', text: 'Open in Finder', onclick: () => api.open(t.loc.path) }));
  return box;
}

let paintQueued = false;
function schedulePaint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    paint();
  });
}

function paint() {
  if (!L) return;
  const top = viewport.scrollTop - 300;
  const bottom = viewport.scrollTop + viewport.clientHeight + 300;
  const left = viewport.scrollLeft - 300;
  const right = viewport.scrollLeft + viewport.clientWidth + 300;
  const want = new Set();
  for (const r of L.entries) {
    if (r.y + r.h < top || r.y > bottom || r.x + r.w < left || r.x > right) continue;
    const key = r.kind === 'item' ? r.e.path : `g:${r.key}`;
    want.add(key);
    if (!nodes.has(key)) {
      const n = r.kind === 'item' ? buildItem(r) : buildGroup(r);
      nodes.set(key, n);
      canvas.append(n);
    }
  }
  for (const [k, n] of nodes) {
    if (!want.has(k)) {
      n.remove();
      nodes.delete(k);
    }
  }
  pumpThumbs();
}

export function updateClasses() {
  if (!L || !tab) return;
  for (const [k, n] of nodes) if (!k.startsWith('g:')) applyClasses(n, k);
}

// ---------------- selection helpers ----------------

function setSel(paths, focus = tab.focus, anchor = tab.anchor) {
  tab.selection = new Set(paths);
  tab.focus = focus;
  tab.anchor = anchor;
  emit('selection', tab);
}

export function setSelection(paths, focus) {
  tab = activeTab();
  setSel(paths, focus ?? paths[0] ?? null, focus ?? paths[0] ?? null);
}

export function selectAll() {
  tab = activeTab();
  setSel(tab.items.map((e) => e.path));
}
export function selectNone() {
  tab = activeTab();
  setSel([]);
}
export function invertSelection() {
  tab = activeTab();
  setSel(tab.items.filter((e) => !tab.selection.has(e.path)).map((e) => e.path));
}

function rangePaths(a, b) {
  const order = L.order;
  const ia = order.findIndex((e) => e.path === a);
  const ib = order.findIndex((e) => e.path === b);
  if (ia < 0 || ib < 0) return [b];
  const [s, t] = ia < ib ? [ia, ib] : [ib, ia];
  return order.slice(s, t + 1).map((e) => e.path);
}

export function scrollToPath(path) {
  const r = L?.rect.get(path);
  if (!r) return;
  const topLimit = viewport.scrollTop + L.headerH;
  if (r.y < topLimit) viewport.scrollTop = r.y - L.headerH - 4;
  else if (r.y + r.h > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = r.y + r.h - viewport.clientHeight + 4;
  if (r.x < viewport.scrollLeft) viewport.scrollLeft = r.x - PAD;
  else if (r.x + r.w > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = r.x + r.w - viewport.clientWidth + PAD;
}

export function focusView() {
  const t = activeTab();
  if (t && (t.loc.type === 'folder' || t.loc.type === 'search')) viewport.focus({ preventScroll: true });
  else $('#page').focus({ preventScroll: true });
}

// ---------------- mouse ----------------

let pending = null; // deferred single-select on mouseup
let renameTimer = null;
let marquee = null;

function itemAt(target) {
  const el = target.closest?.('.item');
  if (!el || !el.dataset.path) return null;
  return el;
}

function entryOf(path) {
  return L?.rect.get(path)?.e || tab.items.find((e) => e.path === path);
}

viewport.addEventListener('mousedown', (ev) => {
  tab = activeTab();
  if (!L) return;
  hideTip();
  if (ev.target.closest('.dheader') || ev.target.closest('.rename-box')) return;
  if (state.renaming) commitRenameNow();
  const mod = ev.metaKey || (ev.ctrlKey && ev.button === 0 && !isMacCtrlClick(ev));
  const itemEl = itemAt(ev.target);
  const groupEl = ev.target.closest('.group-header');
  clearTimeout(renameTimer);

  if (groupEl && ev.button === 0) {
    const key = groupEl.dataset.group;
    if (ev.detail === 1) {
      if (tab.collapsed.has(key)) tab.collapsed.delete(key);
      else tab.collapsed.add(key);
      renderView();
    }
    return;
  }

  if (itemEl) {
    const path = itemEl.dataset.path;
    if (ev.target.closest('.chk') && ev.button === 0) {
      const s = new Set(tab.selection);
      s.has(path) ? s.delete(path) : s.add(path);
      setSel([...s], path, path);
      ev.preventDefault();
      return;
    }
    if (ev.button === 2 || (ev.button === 0 && ev.ctrlKey && isMacCtrlClick(ev))) {
      if (!tab.selection.has(path)) setSel([path], path, path);
      else setSel([...tab.selection], path, tab.anchor);
      return;
    }
    if (ev.button !== 0) return;
    if (ev.shiftKey) {
      const anchor = tab.anchor && L.rect.has(tab.anchor) ? tab.anchor : path;
      const range = rangePaths(anchor, path);
      setSel(mod ? [...new Set([...tab.selection, ...range])] : range, path, anchor);
    } else if (mod) {
      const s = new Set(tab.selection);
      s.has(path) ? s.delete(path) : s.add(path);
      setSel([...s], path, path);
    } else if (tab.selection.has(path)) {
      pending = { path, wasOnly: tab.selection.size === 1, onLabel: !!ev.target.closest('.label'), detail: ev.detail };
    } else {
      setSel([path], path, path);
    }
    return;
  }

  // Empty space
  if (ev.button === 2) {
    if (!mod) setSel([], null, tab.anchor);
    return;
  }
  if (ev.button !== 0) return;
  if (ev.target !== viewport && ev.target !== canvas && !ev.target.closest('.empty-text')) return;
  ev.preventDefault();
  viewport.focus({ preventScroll: true });
  startMarquee(ev, mod || ev.shiftKey);
});

function isMacCtrlClick(ev) {
  // On macOS a Ctrl+click is a right click
  return ev.ctrlKey && !ev.metaKey && navigator.platform.startsWith('Mac');
}

addEventListener('mouseup', (ev) => {
  if (!pending) return;
  const p = pending;
  pending = null;
  if (ev.button !== 0) return;
  const itemEl = itemAt(ev.target);
  if (!itemEl || itemEl.dataset.path !== p.path) return;
  setSel([p.path], p.path, p.path);
  // Slow second click on the name of the only selected item → rename
  if (p.wasOnly && p.onLabel && p.detail === 1 && !isTrash(tab.loc)) {
    renameTimer = setTimeout(() => startRename(p.path), 650);
  }
});

viewport.addEventListener('dblclick', (ev) => {
  clearTimeout(renameTimer);
  const itemEl = itemAt(ev.target);
  if (!itemEl) return;
  const e = entryOf(itemEl.dataset.path);
  if (!e) return;
  if ((ev.metaKey || ev.ctrlKey) && e.isDir) actions.openInNewWindow(e.path);
  else actions.openEntries([e]);
});

viewport.addEventListener('auxclick', (ev) => {
  if (ev.button !== 1) return;
  const itemEl = itemAt(ev.target);
  if (!itemEl) return;
  const e = entryOf(itemEl.dataset.path);
  if (e?.isDir) actions.openInNewTab(e.path, false);
});

viewport.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (ev.target.closest('.dheader')) return;
  const itemEl = itemAt(ev.target);
  if (itemEl) actions.itemMenu({ x: ev.clientX, y: ev.clientY });
  else actions.backgroundMenu({ x: ev.clientX, y: ev.clientY });
});

viewport.addEventListener('dragstart', (ev) => {
  pending = null;
  clearTimeout(renameTimer);
  const itemEl = itemAt(ev.target);
  if (!itemEl) return ev.preventDefault();
  const path = itemEl.dataset.path;
  if (!tab.selection.has(path)) setSel([path], path, path);
  const entries = tab.items.filter((e) => tab.selection.has(e.path));
  dnd.beginDrag(ev, entries);
});

// ---------------- marquee ----------------

function canvasPoint(ev) {
  const r = viewport.getBoundingClientRect();
  return { x: ev.clientX - r.left + viewport.scrollLeft, y: ev.clientY - r.top + viewport.scrollTop };
}

function startMarquee(ev, additive) {
  const start = canvasPoint(ev);
  const base = additive ? new Set(tab.selection) : new Set();
  if (!additive) setSel([], null, null);
  let last = ev;
  let el = null;
  let moved = false;
  const update = () => {
    const p = canvasPoint(last);
    const x1 = Math.min(start.x, p.x);
    const y1 = Math.min(start.y, p.y);
    const x2 = Math.max(start.x, p.x);
    const y2 = Math.max(start.y, p.y);
    if (!moved && Math.abs(p.x - start.x) + Math.abs(p.y - start.y) < 4) return;
    moved = true;
    if (!el) {
      el = h('div', { id: 'marquee' });
      canvas.append(el);
    }
    Object.assign(el.style, { left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
    const sel = new Set(base);
    let focus = null;
    for (const e of L.order) {
      const r = L.rect.get(e.path);
      // In details view only the name column counts as the hit area
      const rw = L.m.kind === 'details' ? Math.min(r.w, L.columns[0].width) : r.w;
      const hit = r.x < x2 && r.x + rw > x1 && r.y < y2 && r.y + r.h > y1;
      if (hit) {
        if (base.has(e.path)) sel.delete(e.path);
        else sel.add(e.path);
        focus = e.path;
      }
    }
    const changed = sel.size !== tab.selection.size || [...sel].some((p) => !tab.selection.has(p));
    if (changed) setSel([...sel], focus || tab.focus, tab.anchor);
  };
  const scroller = setInterval(() => {
    const r = viewport.getBoundingClientRect();
    let dy = 0;
    let dx = 0;
    if (last.clientY < r.top + L.headerH + 10) dy = -Math.max(4, (r.top + L.headerH + 10 - last.clientY) / 2);
    if (last.clientY > r.bottom - 10) dy = Math.max(4, (last.clientY - r.bottom + 10) / 2);
    if (last.clientX < r.left + 10) dx = -8;
    if (last.clientX > r.right - 10) dx = 8;
    if (dx || dy) {
      viewport.scrollTop += dy;
      viewport.scrollLeft += dx;
      update();
    }
  }, 30);
  const move = (e) => {
    last = e;
    update();
  };
  const up = () => {
    clearInterval(scroller);
    el?.remove();
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
  };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
}

// ---------------- info tips ----------------

let tipTimer = null;
let tipFor = null;
viewport.addEventListener('mouseover', (ev) => {
  const itemEl = itemAt(ev.target);
  const path = itemEl?.dataset.path || null;
  if (path === tipFor) return;
  tipFor = path;
  clearTimeout(tipTimer);
  hideTip();
  if (!path) return;
  tipTimer = setTimeout(() => {
    const e = entryOf(path);
    if (!e || state.renaming || document.querySelector('.menu')) return;
    let text = e.isDir ? `Date created: ${formatDate(e.ctime)}` : `Type: ${typeName(e)}\nSize: ${formatSize(e.size)}\nDate modified: ${formatDate(e.mtime)}`;
    if (tab.loc.type === 'search') text = `${text}\nLocation: ${dirname(e.path)}`;
    const r = itemEl.getBoundingClientRect();
    if (lastMouse.y) showTip(text, lastMouse.x + 2, Math.min(r.bottom + 4, lastMouse.y + 20));
    else showTip(text, r.left + 24, r.bottom + 4);
  }, 1100);
});
const lastMouse = { x: 0, y: 0 };
viewport.addEventListener('mousemove', (ev) => {
  lastMouse.x = ev.clientX;
  lastMouse.y = ev.clientY;
});
viewport.addEventListener('mouseleave', () => {
  tipFor = null;
  clearTimeout(tipTimer);
  hideTip();
});

// ---------------- keyboard ----------------

let typeBuf = '';
let typeTimer = null;

function moveTarget(key) {
  const order = L.order;
  if (!order.length) return null;
  const cur = tab.focus && L.rect.has(tab.focus) ? tab.focus : null;
  if (!cur) return order[0].path;
  const idx = order.findIndex((e) => e.path === cur);
  const r = L.rect.get(cur);
  const kind = L.m.kind;
  const pageRows = Math.max(1, Math.floor((viewport.clientHeight - L.headerH) / L.m.h) - 1);
  const at = (i) => order[clamp(i, 0, order.length - 1)].path;
  if (key === 'Home') return order[0].path;
  if (key === 'End') return order[order.length - 1].path;
  if (kind === 'details' || kind === 'rows') {
    if (key === 'ArrowDown') return at(idx + 1);
    if (key === 'ArrowUp') return at(idx - 1);
    if (key === 'PageDown') return at(idx + pageRows);
    if (key === 'PageUp') return at(idx - pageRows);
    return null;
  }
  if (kind === 'list') {
    const rows = L.rowsPerCol;
    if (key === 'ArrowDown') return at(idx + 1);
    if (key === 'ArrowUp') return at(idx - 1);
    if (key === 'ArrowRight' || key === 'PageDown') return at(idx + rows);
    if (key === 'ArrowLeft' || key === 'PageUp') return at(idx - rows);
    return null;
  }
  // grid: left/right walk the order, up/down pick the nearest item in the adjacent row
  if (key === 'ArrowRight') return at(idx + 1);
  if (key === 'ArrowLeft') return at(idx - 1);
  const dir = key === 'ArrowDown' || key === 'PageDown' ? 1 : key === 'ArrowUp' || key === 'PageUp' ? -1 : 0;
  if (!dir) return null;
  const steps = key.startsWith('Page') ? pageRows : 1;
  let curR = r;
  let best = cur;
  for (let s = 0; s < steps; s++) {
    let candY = null;
    for (const e of order) {
      const rr = L.rect.get(e.path);
      if (dir > 0 ? rr.y > curR.y : rr.y < curR.y) {
        if (candY == null || (dir > 0 ? rr.y < candY : rr.y > candY)) candY = rr.y;
      }
    }
    if (candY == null) break;
    let pick = null;
    let bestD = Infinity;
    for (const e of order) {
      const rr = L.rect.get(e.path);
      if (rr.y !== candY) continue;
      const d = Math.abs(rr.x - curR.x);
      if (d < bestD) {
        bestD = d;
        pick = e.path;
      }
    }
    if (!pick) break;
    best = pick;
    curR = L.rect.get(pick);
  }
  return best;
}

viewport.addEventListener('keydown', (ev) => {
  if (ev.target !== viewport) return;
  tab = activeTab();
  if (!L) return;
  const mod = ev.metaKey || ev.ctrlKey;
  const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  if (navKeys.includes(ev.key) && !ev.altKey) {
    // Cmd+Up / Cmd+Down are handled globally (Finder habits)
    if (ev.metaKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) return;
    ev.preventDefault();
    if (L.m.kind === 'details' && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      viewport.scrollLeft += ev.key === 'ArrowLeft' ? -40 : 40;
      return;
    }
    const target = moveTarget(ev.key);
    if (!target) return;
    if (ev.shiftKey) {
      const anchor = tab.anchor && L.rect.has(tab.anchor) ? tab.anchor : tab.focus || target;
      const range = rangePaths(anchor, target);
      setSel(mod ? [...new Set([...tab.selection, ...range])] : range, target, anchor);
    } else if (mod) {
      tab.focus = target;
      updateClasses();
    } else {
      setSel([target], target, target);
    }
    scrollToPath(target);
    return;
  }
  if (ev.key === ' ' && mod && tab.focus) {
    ev.preventDefault();
    const s = new Set(tab.selection);
    s.has(tab.focus) ? s.delete(tab.focus) : s.add(tab.focus);
    setSel([...s], tab.focus, tab.focus);
    return;
  }
  if (ev.key === 'Enter' && !ev.altKey) {
    ev.preventDefault();
    const sel = tab.items.filter((e) => tab.selection.has(e.path));
    if (sel.length) actions.openEntries(sel);
    return;
  }
  // Type-ahead
  if (ev.key.length === 1 && !mod && !ev.altKey && ev.key !== ' ') {
    ev.preventDefault();
    clearTimeout(typeTimer);
    typeTimer = setTimeout(() => (typeBuf = ''), 1000);
    const repeat = typeBuf.length === 1 && typeBuf === ev.key.toLowerCase();
    typeBuf = repeat ? typeBuf : typeBuf + ev.key.toLowerCase();
    const order = L.order;
    const start = Math.max(0, order.findIndex((e) => e.path === tab.focus));
    const offset = typeBuf.length === 1 ? 1 : 0;
    for (let k = 0; k < order.length; k++) {
      const e = order[(start + offset + k) % order.length];
      if (displayLabel(e).toLowerCase().startsWith(typeBuf)) {
        setSel([e.path], e.path, e.path);
        scrollToPath(e.path);
        break;
      }
    }
  }
});

// ---------------- Ctrl + wheel / pinch to change view ----------------

const WHEEL_ORDER = ['details', 'list', 'small', 'medium', 'large', 'xl'];
let wheelAcc = 0;
viewport.addEventListener(
  'wheel',
  (ev) => {
    hideTip();
    if (!(ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    wheelAcc += ev.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    const dir = wheelAcc < 0 ? 1 : -1;
    wheelAcc = 0;
    let i = WHEEL_ORDER.indexOf(tab.view.mode);
    if (i < 0) i = 0;
    const next = WHEEL_ORDER[clamp(i + dir, 0, WHEEL_ORDER.length - 1)];
    if (next !== tab.view.mode) setView(tab, { mode: next });
  },
  { passive: false },
);

viewport.addEventListener('scroll', () => {
  if (tab) tab.scroll = { top: viewport.scrollTop, left: viewport.scrollLeft };
  schedulePaint();
});

let lastSize = '';
new ResizeObserver(() => requestAnimationFrame(onViewportResize)).observe(viewport);
function onViewportResize() {
  const size = `${viewport.clientWidth}x${viewport.clientHeight}`;
  if (size === lastSize) return;
  const widthChanged = lastSize.split('x')[0] !== String(viewport.clientWidth);
  lastSize = size;
  if (!L) return;
  if (widthChanged || L.m.kind === 'list') relayoutKeepScroll();
  else schedulePaint();
}

// ---------------- inline rename ----------------

let renameBox = null;
let renameCommit = null;

export function startRename(path) {
  tab = activeTab();
  if (!L || !L.rect.has(path)) return;
  const e = entryOf(path);
  if (!e) return;
  hideTip();
  setSel([path], path, path);
  scrollToPath(path);
  paint();
  const node = nodes.get(path);
  const label = node?.querySelector('.label');
  if (!label) return;
  state.renaming = path;
  const hideExt = !state.settings.showExtensions && !e.isDir && e.ext;
  const [base, ext] = splitExt(e.name);
  const value = hideExt ? base : e.name;
  const vertical = node.classList.contains('vtile');
  const box = h(vertical ? 'textarea' : 'input', { class: 'rename-box', spellcheck: 'false' });
  box.value = value;
  const cr = canvas.getBoundingClientRect();
  const lr = label.getBoundingClientRect();
  const nr = node.getBoundingClientRect();
  const x = lr.left - cr.left - 3;
  const y = lr.top - cr.top - 2;
  if (vertical) {
    Object.assign(box.style, { left: `${nr.left - cr.left + 2}px`, top: `${y}px`, width: `${nr.width - 4}px` });
  } else {
    const maxW = L.m.kind === 'details' ? L.columns[0].width - (lr.left - nr.left) : nr.right - lr.left;
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.height = `${lr.height + 4}px`;
    box.dataset.maxw = String(Math.max(80, maxW + 40));
  }
  canvas.append(box);
  renameBox = box;
  const autosize = () => {
    if (vertical) {
      box.style.height = 'auto';
      box.style.height = `${box.scrollHeight + 2}px`;
    } else {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = getComputedStyle(box).font;
      box.style.width = `${Math.min(Number(box.dataset.maxw), Math.max(60, ctx.measureText(box.value).width + 20))}px`;
    }
  };
  autosize();
  label.style.visibility = 'hidden';
  box.focus();
  // Select the name without its extension (folders: everything)
  const selEnd = e.isDir || hideExt ? value.length : splitExt(value)[0].length;
  box.setSelectionRange(0, selEnd || value.length);

  let done = false;
  const finish = async (commit, next = 0) => {
    if (done) return;
    done = true;
    renameCommit = null;
    const newVal = box.value.replace(/[\r\n]/g, '').trim().replace(/[. ]+$/, '');
    box.remove();
    renameBox = null;
    label.style.visibility = '';
    let newPath = path;
    if (commit && newVal && newVal !== value) {
      const finalName = hideExt ? newVal + ext : newVal;
      const res = await actions.renameEntry(e, finalName);
      if (res) newPath = res;
    }
    state.renaming = null;
    viewport.focus({ preventScroll: true });
    if (next) {
      const order = L.order;
      const idx = order.findIndex((x) => x.path === newPath);
      const target = order[idx + next];
      if (target) setTimeout(() => startRename(target.path), 30);
    }
  };
  renameCommit = () => finish(true);
  box.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      ev.preventDefault();
      finish(true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      finish(false);
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      finish(true, ev.shiftKey ? -1 : 1);
    } else if ((ev.metaKey || ev.ctrlKey) && ['c', 'v', 'x', 'a', 'z'].includes(ev.key.toLowerCase())) {
      ev.preventDefault();
      const map = { c: 'copy', v: 'paste', x: 'cut', a: 'selectAll', z: ev.shiftKey ? 'redo' : 'undo' };
      api.edit(map[ev.key.toLowerCase()]);
    }
  });
  box.addEventListener('beforeinput', (ev) => {
    if (ev.data && INVALID_NAME_CHARS.test(ev.data)) {
      ev.preventDefault();
      balloon(box, 'A file name can\'t contain any of the following characters:\n\\ / : * ? " < > |');
    }
  });
  box.addEventListener('input', () => {
    if (INVALID_NAME_CHARS.test(box.value)) {
      box.value = box.value.replace(/[\\/:*?"<>|]/g, '');
      balloon(box, 'A file name can\'t contain any of the following characters:\n\\ / : * ? " < > |');
    }
    autosize();
  });
  box.addEventListener('blur', () => setTimeout(() => finish(true), 0));
  box.addEventListener('mousedown', (ev) => ev.stopPropagation());
}

export function commitRenameNow() {
  renameCommit?.();
}

let balloonEl = null;
function balloon(anchor, text) {
  balloonEl?.remove();
  const r = anchor.getBoundingClientRect();
  balloonEl = h('div', { class: 'balloon', style: { left: `${r.left}px`, top: `${r.bottom + 10}px`, whiteSpace: 'pre-line' }, text });
  document.body.append(balloonEl);
  const el = balloonEl;
  setTimeout(() => el.remove(), 5000);
}

// ---------------- wiring ----------------

export function currentLayout() {
  return L;
}

export function restoreScroll(t) {
  viewport.scrollTop = t.scroll?.top || 0;
  viewport.scrollLeft = t.scroll?.left || 0;
}

export function init() {
  on('items', (t) => {
    if (t.id !== state.activeId) return;
    const sameTab = tab?.id === t.id;
    renderView();
    if (!sameTab) restoreScroll(t);
  });
  on('view', (t) => t.id === state.activeId && renderView());
  on('location', (t) => {
    if (t.id !== state.activeId) return;
    tab = t;
    renameBox?.remove();
    renameBox = null;
    state.renaming = null;
    renderView();
    restoreScroll(t);
  });
  on('selection', (t) => t.id === state.activeId && updateClasses());
  on('clipboard', () => updateClasses());
  on('settings', (patch) => {
    if (['showHidden', 'showExtensions', 'compact', 'checkboxes', 'columnsVisible'].some((k) => k in patch)) {
      for (const t of state.tabs) if (t.loc.type === 'folder' || t.loc.type === 'search') applySort(t);
      renderView();
    }
  });
  on('tab-activated', (t) => {
    tab = t;
    renderView();
    restoreScroll(t);
  });
}
