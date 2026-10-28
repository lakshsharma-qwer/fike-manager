// Drag and drop: native OS drags (works with Finder and other apps), drop targets,
// Windows-style move/copy rules and the "→ Move to Documents" helper tooltip.
import { state, activeTab } from './state.js';
import { h, dirname, isInside, volumeOf, esc } from './util.js';
import { folderSVG, fileSVG } from './icons.js';
import { displayName } from './nav.js';
import { currentLayout } from './fileview.js';
import * as actions from './actions.js';

const api = window.api;
let drag = null; // internal drag: { paths }
let tipEl = null;
let hoverEl = null;
let hoverTimer = null;
let hoverFor = null;
let lastDragEvent = 0;

const imgs = {};
function preload() {
  const mk = (svg) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img;
  };
  imgs.folder = mk(folderSVG(64));
  imgs.file = mk(fileSVG({ isDir: false, ext: '' }, 64));
}

function dragIcon(entries) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  const first = entries[0];
  const img = first?.isDir ? imgs.folder : imgs.file;
  ctx.globalAlpha = 0.85;
  if (entries.length > 1) {
    const back = entries[1]?.isDir ? imgs.folder : imgs.file;
    if (back?.complete) ctx.drawImage(back, 22, 12, 64, 64);
  }
  if (img?.complete && img.naturalWidth) ctx.drawImage(img, 14, 18, 64, 64);
  else {
    ctx.fillStyle = '#ffc83d';
    ctx.fillRect(20, 26, 56, 44);
  }
  ctx.globalAlpha = 1;
  if (entries.length > 1) {
    const text = String(entries.length);
    ctx.font = '600 13px -apple-system, Segoe UI, sans-serif';
    const w = Math.max(22, ctx.measureText(text).width + 12);
    ctx.fillStyle = '#0067c0';
    ctx.beginPath();
    ctx.roundRect(78 - w / 2, 66, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, 78, 81.5);
  }
  return c.toDataURL('image/png');
}

export function beginDrag(ev, entries) {
  ev.preventDefault();
  if (!entries.length) return;
  drag = { paths: entries.map((e) => e.path) };
  lastDragEvent = Date.now();
  api.startDrag(drag.paths, dragIcon(entries));
}

export function beginDragPaths(ev, entries) {
  beginDrag(ev, entries);
}

function endDrag() {
  drag = null;
  setHover(null);
  tipEl?.classList.remove('show');
  clearTimeout(hoverTimer);
  hoverFor = null;
}

// Resolve the folder a drop at this element would go into
function targetFor(el) {
  if (!el?.closest) return null;
  const tab = activeTab();
  const tabEl = el.closest('.tab[data-tab-id]');
  if (tabEl) {
    const t = state.tabs.find((x) => String(x.id) === tabEl.dataset.tabId);
    return t?.loc.type === 'folder' ? { path: t.loc.path, el: tabEl, tabEl } : { el: tabEl, tabEl };
  }
  const nav = el.closest('.nav-node[data-path]');
  if (nav) return { path: nav.dataset.path, el: nav };
  const crumb = el.closest('.crumb[data-path]');
  if (crumb) return { path: crumb.dataset.path, el: crumb };
  const qa = el.closest('.qa-tile[data-path]');
  if (qa) return { path: qa.dataset.path, el: qa };
  if (el.closest('#viewport')) {
    const item = el.closest('.item[data-path]');
    if (item) {
      const entry = currentLayout()?.rect.get(item.dataset.path)?.e;
      if (entry?.isDir) return { path: entry.path, el: item };
    }
    if (tab.loc.type === 'folder' && !tab.error) return { path: tab.loc.path, el: null };
  }
  return null;
}

function decideOp(ev, dest, paths) {
  if (ev.altKey || ev.ctrlKey) return 'copy';
  if (ev.shiftKey || ev.metaKey) return 'move';
  if (!paths) return 'copy'; // external drag: we can't see the source yet
  return paths.every((p) => volumeOf(p) === volumeOf(dest)) ? 'move' : 'copy';
}

function invalid(dest, paths) {
  if (!paths) return false;
  return paths.some((p) => p === dest || isInside(dest, p)) || paths.every((p) => dirname(p) === dest);
}

function setHover(el) {
  if (hoverEl === el) return;
  hoverEl?.classList.remove('drop-target');
  hoverEl = el;
  el?.classList.add('drop-target');
}

function showDragTip(ev, op, dest) {
  if (!tipEl) {
    tipEl = h('div', { id: 'drag-tip' });
    document.body.append(tipEl);
  }
  const arrow = op === 'move' ? '→' : '+';
  tipEl.innerHTML = `<span>${arrow}</span><span>${op === 'move' ? 'Move' : 'Copy'} to <b>${esc(displayName(dest))}</b></span>`;
  tipEl.style.left = `${ev.clientX + 16}px`;
  tipEl.style.top = `${ev.clientY + 22}px`;
  tipEl.classList.add('show');
}

function isTabDrag(ev) {
  return ev.dataTransfer?.types?.includes('application/x-explorer-tab');
}

export function initDnd() {
  preload();

  document.addEventListener('dragover', (ev) => {
    if (isTabDrag(ev)) return;
    ev.preventDefault();
    lastDragEvent = Date.now();
    const t = targetFor(ev.target);
    // Hovering a tab switches to it, like Windows
    if (t?.tabEl) {
      if (hoverFor !== t.tabEl) {
        hoverFor = t.tabEl;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => t.tabEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })), 600);
      }
    } else if (t?.el?.classList.contains('nav-node')) {
      if (hoverFor !== t.el) {
        hoverFor = t.el;
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          const chev = t.el.querySelector('.nav-chev.has:not(.expanded)');
          chev?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }, 1000);
      }
    } else if (hoverFor) {
      hoverFor = null;
      clearTimeout(hoverTimer);
    }
    const paths = drag?.paths || null;
    if (!t?.path || invalid(t.path, paths)) {
      ev.dataTransfer.dropEffect = 'none';
      setHover(null);
      tipEl?.classList.remove('show');
      return;
    }
    const op = decideOp(ev, t.path, paths);
    const allowed = ev.dataTransfer.effectAllowed;
    ev.dataTransfer.dropEffect = op === 'move' && /move|all|uninitialized/i.test(allowed) ? 'move' : 'copy';
    setHover(t.el);
    showDragTip(ev, op, t.path);
  });

  document.addEventListener('dragleave', (ev) => {
    if (!ev.relatedTarget) {
      setHover(null);
      tipEl?.classList.remove('show');
    }
  });

  document.addEventListener('drop', async (ev) => {
    if (isTabDrag(ev)) return;
    ev.preventDefault();
    const t = targetFor(ev.target);
    let paths = [...(ev.dataTransfer.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
    if (!paths.length && drag) paths = drag.paths;
    const internalPaths = drag?.paths || null;
    const op = t?.path ? decideOp(ev, t.path, paths.length ? paths : internalPaths) : null;
    endDrag();
    if (!t?.path || !paths.length || invalid(t.path, paths)) return;
    await actions.transfer(paths, t.path, op);
  });

  // A native drag swallows mouse events; the first one we see afterwards means it ended.
  const clear = () => {
    if (drag && Date.now() - lastDragEvent > 400) endDrag();
  };
  addEventListener('mousemove', clear);
  addEventListener('mousedown', clear);
  addEventListener('keydown', clear);
  document.addEventListener('dragend', clear);
}
