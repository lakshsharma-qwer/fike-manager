// Right-hand Preview pane (Alt+P) and Details pane (Alt+Shift+P).
import { state, on, activeTab, selectedEntries } from './state.js';
import { $, h, esc, formatSize, formatDate, typeName, dirname, category, fileUrl, debounce, TEXT_PREVIEW_CATS } from './util.js';
import { fileSVG, glyph } from './icons.js';
import { locTitle, locIcon } from './nav.js';
import * as actions from './actions.js';

const api = window.api;
const pane = $('#pane');
const main = $('#main');
let renderSeq = 0;

const NATIVE_IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif']);
const NATIVE_VIDEO = new Set(['mp4', 'mov', 'webm', 'm4v']);
const NATIVE_AUDIO = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);

function msg(text) {
  return h('div', { class: 'pane-preview' }, h('div', { class: 'pane-msg', text }));
}

async function renderPreview(seq) {
  const sel = selectedEntries();
  if (sel.length !== 1) return msg(sel.length ? 'Select a single file to preview.' : 'Select a file to preview.');
  const e = sel[0];
  if (e.isDir) return msg('No preview available.');
  const cat = category(e);
  const box = h('div', { class: 'pane-preview' });
  if (cat === 'image' && NATIVE_IMG.has(e.ext)) {
    box.append(h('img', { src: fileUrl(e.path), draggable: 'false' }));
    return box;
  }
  if (cat === 'video' && NATIVE_VIDEO.has(e.ext)) {
    box.append(h('video', { src: fileUrl(e.path), controls: true }));
    return box;
  }
  if (cat === 'audio' && NATIVE_AUDIO.has(e.ext)) {
    box.append(h('audio', { src: fileUrl(e.path), controls: true }));
    return box;
  }
  if (cat === 'pdf') {
    box.style.padding = '0';
    box.append(h('iframe', { src: `${fileUrl(e.path)}#toolbar=0&navpanes=0` }));
    return box;
  }
  if (TEXT_PREVIEW_CATS.has(cat) || (cat === 'generic' && e.size < 2 * 1024 * 1024)) {
    const res = await api.readText(e.path);
    if (seq !== renderSeq) return null;
    if (res.text != null) {
      box.style.alignItems = 'stretch';
      box.append(h('pre', { text: res.text + (res.truncated ? '\n…' : '') }));
      return box;
    }
  }
  // Fall back to a Quick Look rendering (Office docs, HEIC, PSD, Pages, ...)
  const url = await api.thumbnail(e.path, 800);
  if (seq !== renderSeq) return null;
  if (url && ['image', 'doc', 'sheet', 'slides', 'video', 'pdf'].includes(cat)) {
    box.append(h('img', { src: url, draggable: 'false' }));
    return box;
  }
  return msg('No preview available.');
}

function prop(k, v) {
  return h('div', { class: 'pd-prop' }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v }));
}

async function renderDetails(seq) {
  const tab = activeTab();
  const sel = selectedEntries(tab);
  const wrap = h('div', { class: 'pane-details' });
  if (!sel.length) {
    wrap.append(h('div', { class: 'pd-thumb', html: locIcon(tab.loc, 96) }));
    wrap.append(h('div', { class: 'pd-name', text: locTitle(tab.loc) }));
    if (tab.loc.type === 'folder' || tab.loc.type === 'search') {
      const visible = tab.items.length;
      wrap.append(h('div', { class: 'pd-props' }, prop('Items', `${visible} item${visible === 1 ? '' : 's'}`), tab.loc.type === 'folder' ? prop('Location', tab.loc.path) : null));
    } else {
      wrap.append(h('div', { class: 'pane-msg', style: { textAlign: 'left' }, text: 'Select a single file to get more info and share your content.' }));
    }
    return wrap;
  }
  if (sel.length > 1) {
    const files = sel.filter((e) => !e.isDir);
    wrap.append(h('div', { class: 'pd-thumb', html: fileSVG(sel[0], 96) }));
    wrap.append(h('div', { class: 'pd-name', text: `${sel.length} items selected` }));
    wrap.append(
      h(
        'div',
        { class: 'pd-props' },
        files.length ? prop('Total file size', formatSize(files.reduce((s, e) => s + e.size, 0))) : null,
        prop('Contains', `${files.length} files, ${sel.length - files.length} folders`),
        prop('Location', [...new Set(sel.map((e) => dirname(e.path)))].length === 1 ? dirname(sel[0].path) : 'Various locations'),
      ),
    );
    return wrap;
  }
  const e = sel[0];
  const thumb = h('div', { class: 'pd-thumb', html: fileSVG(e, 128) });
  wrap.append(thumb);
  if (!e.isDir) {
    api.thumbnail(e.path, 400).then((url) => {
      if (url && seq === renderSeq && ['image', 'video', 'pdf', 'doc', 'sheet', 'slides'].includes(category(e))) thumb.innerHTML = `<img src="${url}" draggable="false">`;
    });
  }
  wrap.append(h('div', { class: 'pd-name', text: e.name }));
  const actionsRow = h('div', { class: 'pd-actions' });
  if (!e.isDir) {
    const share = h('button', { class: 'cmd', html: `${glyph('share')}<span>Share</span>` });
    share.addEventListener('click', () => {
      const r = share.getBoundingClientRect();
      actions.share([e], r.left, r.bottom);
    });
    actionsRow.append(share);
  }
  const open = h('button', { class: 'cmd', html: `${glyph('open')}<span>Open</span>` });
  open.addEventListener('click', () => actions.openEntries([e]));
  actionsRow.append(open);
  wrap.append(actionsRow);
  wrap.append(h('div', { class: 'pd-section', text: 'Properties' }));
  const props = h('div', { class: 'pd-props' });
  props.append(prop('Type', typeName(e)));
  if (!e.isDir) props.append(prop('Size', formatSize(e.size)));
  props.append(prop('File location', dirname(e.path)));
  props.append(prop('Date modified', formatDate(e.mtime)));
  props.append(prop('Date created', formatDate(e.ctime)));
  if (category(e) === 'image' && NATIVE_IMG.has(e.ext)) {
    const img = new Image();
    img.onload = () => {
      if (seq === renderSeq) props.append(prop('Dimensions', `${img.naturalWidth} x ${img.naturalHeight}`));
    };
    img.src = fileUrl(e.path);
  }
  wrap.append(props);
  return wrap;
}

async function render() {
  const which = state.settings.pane;
  main.classList.toggle('with-pane', !!which);
  if (!which || !activeTab()) {
    pane.replaceChildren();
    return;
  }
  const seq = ++renderSeq;
  const content = which === 'preview' ? await renderPreview(seq) : await renderDetails(seq);
  if (content && seq === renderSeq) pane.replaceChildren(content);
}

const renderSoon = debounce(render, 120);

export function initPanes() {
  on('selection', (t) => t.id === state.activeId && renderSoon());
  on('location', (t) => t.id === state.activeId && renderSoon());
  on('tab-activated', renderSoon);
  on('settings', (p) => 'pane' in p && render());
  render();
}

export { esc };
