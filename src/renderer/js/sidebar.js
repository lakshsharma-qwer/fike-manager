// Navigation pane: Home, iCloud, pinned folders, This PC tree (lazy), Recycle Bin.
import { state, on, activeTab, saveSettings } from './state.js';
import { $, h, esc, basename, isInside } from './util.js';
import { navSVG, folderSVG, glyph } from './icons.js';
import { navigate, folder, HOME, THISPC, locKey, placeIcon, displayName } from './nav.js';
import { showMenu } from './menu.js';
import * as actions from './actions.js';

const api = window.api;
const el = $('#sidebar');
const expanded = new Set(); // node ids
const childCache = new Map(); // path -> [{name, path}]
let rows = []; // flat list of rendered nodes, in order

function node(id, label, icon, loc, opts = {}) {
  return { id, label, icon, loc, path: loc?.type === 'folder' ? loc.path : null, depth: 0, expandable: false, ...opts };
}

function treeChildren(n) {
  if (n.id === 'thispc') {
    const vols = state.volumes.map((v) => node(`d:${v.path}`, `${v.name}${v.isRoot ? ' (/)' : ''}`, navSVG('drive'), folder(v.path), { expandable: true }));
    return [node(`f:${state.paths.home}`, basename(state.paths.home), navSVG('user'), folder(state.paths.home), { expandable: true }), ...vols];
  }
  const kids = childCache.get(n.path);
  if (!kids) return null;
  return kids.map((k) => node(`f:${k.path}`, k.name, placeIcon(k.path), folder(k.path), { expandable: true }));
}

async function loadChildren(path) {
  childCache.set(path, await api.subdirs(path, state.settings.showHidden));
}

function topNodes() {
  const p = state.paths;
  const list = [node('home', 'Home', navSVG('home'), HOME)];
  if (p.icloud) list.push(node(`p:${p.icloud}`, 'iCloud Drive', navSVG('cloud'), folder(p.icloud), { expandable: true, treeId: `f:${p.icloud}` }));
  list.push({ sep: true });
  for (const path of state.settings.pinned) {
    list.push(node(`pin:${path}`, displayName(path), placeIcon(path), folder(path), { pinned: true, expandable: true, treeId: `pin:${path}` }));
  }
  list.push({ sep: true });
  list.push(node('thispc', 'This PC', navSVG('thispc'), THISPC, { expandable: true }));
  list.push(node('trash', 'Recycle Bin', navSVG('trash'), folder(p.trash)));
  return list;
}

function flatten(nodes, depth, out) {
  for (const n of nodes) {
    if (n.sep) {
      out.push(n);
      continue;
    }
    n.depth = depth;
    out.push(n);
    if (n.expandable && expanded.has(n.id)) {
      const kids = treeChildren(n);
      if (kids) flatten(kids, depth + 1, out);
    }
  }
  return out;
}

export function render() {
  if (!state.paths) return;
  rows = flatten(topNodes(), 0, []);
  const tab = activeTab();
  const cur = tab ? locKey(tab.loc.type === 'search' ? folder(tab.loc.path) : tab.loc) : '';
  let selectedDone = false;
  const frag = document.createDocumentFragment();
  rows.forEach((n, i) => {
    if (n.sep) return frag.append(h('div', { class: 'nav-sep' }));
    const isSel = !selectedDone && locKey(n.loc) === cur;
    if (isSel) selectedDone = true;
    let hasKids = n.expandable;
    if (n.path && childCache.has(n.path) && childCache.get(n.path).length === 0) hasKids = false;
    const chev = h('span', { class: `nav-chev${hasKids ? ' has' : ''}${expanded.has(n.id) ? ' expanded' : ''}`, html: hasKids ? glyph('chevR', 12) : '' });
    const row = h(
      'div',
      { class: `nav-node${isSel ? ' selected' : ''}`, style: { paddingLeft: `${4 + n.depth * 16}px` }, tabindex: '-1' },
      chev,
      h('span', { class: 'nav-icon', html: n.icon }),
      h('span', { class: 'nav-label', text: n.label }),
      n.pinned ? h('span', { class: 'nav-pin', html: glyph('pin', 14) }) : null,
    );
    row.dataset.idx = i;
    if (n.path) row.dataset.path = n.path;
    if (n.path) row.draggable = true;
    frag.append(row);
  });
  el.replaceChildren(frag);
}

async function toggle(n, force) {
  const open = force ?? !expanded.has(n.id);
  if (open) {
    if (n.path && !childCache.has(n.path)) await loadChildren(n.path);
    if (n.id === 'thispc' && !state.volumes.length) state.volumes = await api.volumes();
    expanded.add(n.id);
  } else expanded.delete(n.id);
  render();
}

// Expand the This PC tree down to the current folder (Ctrl+Shift+E)
export async function expandToCurrent() {
  const tab = activeTab();
  if (tab.loc.type !== 'folder') return;
  const target = tab.loc.path;
  const home = state.paths.home;
  let chain = [];
  expanded.add('thispc');
  if (isInside(target, home)) {
    chain = [home];
    let rest = target.slice(home.length).split('/').filter(Boolean);
    let cur = home;
    for (const seg of rest.slice(0, -1)) chain.push((cur = `${cur}/${seg}`));
    for (const p of chain) {
      if (!childCache.has(p)) await loadChildren(p);
      expanded.add(`f:${p}`);
    }
  } else {
    const vol = state.volumes.find((v) => isInside(target, v.path) && v.path !== '/') || state.volumes.find((v) => v.isRoot);
    if (!vol) return;
    if (!childCache.has(vol.path)) await loadChildren(vol.path);
    expanded.add(`d:${vol.path}`);
    let cur = vol.path === '/' ? '' : vol.path;
    const rest = target.slice(cur.length).split('/').filter(Boolean);
    for (const seg of rest.slice(0, -1)) {
      cur = `${cur}/${seg}`;
      if (!childCache.has(cur)) await loadChildren(cur);
      expanded.add(`f:${cur}`);
    }
  }
  render();
}

function rowNode(target) {
  const r = target.closest('.nav-node');
  return r ? { row: r, n: rows[Number(r.dataset.idx)] } : {};
}

function menuFor(n, pos) {
  const isFolder = n.loc?.type === 'folder';
  const items = [
    n.expandable ? { label: expanded.has(n.id) ? 'Collapse' : 'Expand', click: () => toggle(n) } : null,
    { separator: true },
    { label: 'Open in new tab', icon: glyph('newTab'), click: () => actions.openInNewTab(n.path || null) },
    { label: 'Open in new window', icon: glyph('newWindow'), click: () => (n.path ? actions.openInNewWindow(n.path) : api.newWindow(n.id === 'thispc' ? 'shell:thispc' : '')) },
    isFolder && n.id !== 'trash' ? { label: actions.isPinned(n.path) ? 'Unpin from Quick access' : 'Pin to Quick access', icon: glyph(actions.isPinned(n.path) ? 'unpin' : 'pin'), click: () => actions.togglePin(n.path) } : null,
    n.id === 'trash' ? { label: 'Empty Recycle Bin', icon: glyph('emptyBin'), click: actions.emptyTrash } : null,
    { separator: true },
    isFolder ? { label: 'Copy as path', icon: glyph('copyPath'), click: () => api.clipWriteText(`"${n.path}"`) } : null,
    isFolder
      ? {
          label: 'Properties',
          icon: glyph('properties'),
          click: async () => {
            const e = await api.stat(n.path);
            if (e) actions.showProperties([e]);
          },
        }
      : null,
    { separator: true },
    isFolder ? { label: 'Open in Terminal', icon: glyph('terminal'), click: () => actions.openTerminal(n.path) } : null,
    isFolder ? { label: 'Show in Finder', icon: glyph('finder'), click: () => api.open(n.path) } : null,
  ];
  showMenu(pos, items, { keyboard: pos.keyboard });
}

export function initSidebar() {
  el.addEventListener('mousedown', (ev) => {
    const { row, n } = rowNode(ev.target);
    if (!n) return;
    if (ev.button === 0 && ev.target.closest('.nav-chev.has')) {
      ev.preventDefault();
      return;
    }
    if (ev.button === 0 && !(ev.ctrlKey && navigator.platform.startsWith('Mac'))) {
      el.querySelectorAll('.nav-node.selected').forEach((x) => x.classList.remove('selected'));
      row.classList.add('selected');
      if (ev.metaKey) actions.openInNewTab(n.path, false);
      else navigate(activeTab(), n.loc);
    }
  });
  el.addEventListener('click', (ev) => {
    if (!ev.target.closest('.nav-chev.has')) return;
    const { n } = rowNode(ev.target);
    if (n) toggle(n);
  });
  el.addEventListener('dblclick', (ev) => {
    if (ev.target.closest('.nav-chev')) return;
    const { n } = rowNode(ev.target);
    if (n?.expandable) toggle(n);
  });
  el.addEventListener('auxclick', (ev) => {
    if (ev.button !== 1) return;
    const { n } = rowNode(ev.target);
    if (n?.path) actions.openInNewTab(n.path, false);
  });
  el.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const { n } = rowNode(ev.target);
    if (n) menuFor(n, { x: ev.clientX, y: ev.clientY });
  });
  el.addEventListener('dragstart', async (ev) => {
    const { n } = rowNode(ev.target);
    if (!n?.path) return ev.preventDefault();
    const e = await api.stat(n.path);
    const { beginDragPaths } = await import('./dnd.js');
    if (e) beginDragPaths(ev, [e]);
  });
  el.addEventListener('keydown', (ev) => {
    const cur = el.querySelector('.nav-node.selected') || el.querySelector('.nav-node');
    if (!cur) return;
    const all = [...el.querySelectorAll('.nav-node')];
    const i = all.indexOf(cur);
    const n = rows[Number(cur.dataset.idx)];
    let next = null;
    if (ev.key === 'ArrowDown') next = all[i + 1];
    else if (ev.key === 'ArrowUp') next = all[i - 1];
    else if (ev.key === 'ArrowRight' && n.expandable) {
      if (!expanded.has(n.id)) toggle(n, true);
      else next = all[i + 1];
    } else if (ev.key === 'ArrowLeft') {
      if (n.expandable && expanded.has(n.id)) toggle(n, false);
      else {
        for (let k = i - 1; k >= 0; k--) if (rows[Number(all[k].dataset.idx)].depth < n.depth) { next = all[k]; break; }
      }
    } else if (ev.key === '*' || ev.key === '+') {
      if (n.expandable) toggle(n, true);
    } else if (ev.key === '-') {
      if (n.expandable) toggle(n, false);
    } else if (ev.key === 'Enter') {
      navigate(activeTab(), n.loc);
    } else if (ev.key === 'ContextMenu' || (ev.key === 'F10' && ev.shiftKey)) {
      const r = cur.getBoundingClientRect();
      menuFor(n, { x: r.left + 30, y: r.bottom, keyboard: true });
    } else return;
    ev.preventDefault();
    if (next) {
      all.forEach((x) => x.classList.remove('selected'));
      next.classList.add('selected');
      next.scrollIntoView({ block: 'nearest' });
      const nn = rows[Number(next.dataset.idx)];
      clearTimeout(el._navTimer);
      el._navTimer = setTimeout(() => navigate(activeTab(), nn.loc), 350);
    }
  });

  on('location', render);
  on('tab-activated', render);
  on('settings', (patch) => {
    if ('pinned' in patch) render();
    if ('showHidden' in patch) {
      childCache.clear();
      Promise.all([...expanded].filter((id) => id.startsWith('f:') || id.startsWith('d:') || id.startsWith('pin:') || id.startsWith('p:')).map((id) => loadChildren(id.slice(id.indexOf(':') + 1)))).then(render);
    }
  });
  on('tree-changed', async (dir) => {
    if (childCache.has(dir)) {
      await loadChildren(dir);
      render();
    }
  });
  render();
}

export { esc, folderSVG };
