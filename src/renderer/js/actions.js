// Every user-facing command: open, clipboard, transfers, delete, rename, new items,
// undo/redo, pinning, archives — plus the item / background context menus.
import { state, emit, activeTab, saveSettings, selectedEntries, pushUndo } from './state.js';
import { basename, dirname, splitExt, category, isInside } from './util.js';
import { glyph, NEW_ICON } from './icons.js';
import { navigate, folder, reload, setView, isTrash, refreshAffected, displayName, createTab, HOME } from './nav.js';
import { showMenu } from './menu.js';
import { confirm, alert, properties as propsDialog, conflictDialog, trackJob, folderOptions } from './dialogs.js';
import * as fv from './fileview.js';

const api = window.api;
const MAC = navigator.platform.startsWith('Mac');
export const K = (s) => (MAC ? s.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : s);

function currentDir(tab = activeTab()) {
  return tab.loc.type === 'folder' ? tab.loc.path : null;
}

export function canModifyHere(tab = activeTab()) {
  return tab.loc.type === 'folder' && !tab.error && !isTrash(tab.loc);
}

// ---------------- open ----------------

export function addRecent(path) {
  const recent = [{ path, time: Date.now() }, ...state.settings.recent.filter((r) => r.path !== path)].slice(0, 30);
  saveSettings({ recent });
}

export async function openPath(path) {
  const err = await api.open(path);
  if (err) {
    alert('File Explorer', `${basename(path)}\n\n${err}`);
    return;
  }
  addRecent(path);
}

export async function openEntries(entries, tab = activeTab()) {
  const dirs = entries.filter((e) => e.isDir);
  const files = entries.filter((e) => !e.isDir);
  if (dirs.length) {
    navigate(tab, folder(dirs[0].path));
    for (const d of dirs.slice(1)) openInNewTab(d.path, false);
  }
  for (const f of files.slice(0, 15)) openPath(f.path);
}

export function openInNewTab(path, activate = true) {
  import('./tabs.js').then((t) => t.addTab(path ? folder(path) : null, activate));
}

export function openInNewWindow(path) {
  api.newWindow(path || '');
}

export function openFileLocation(path) {
  navigate(activeTab(), folder(dirname(path)), { select: [path] });
}

// ---------------- clipboard ----------------

export async function setClipboard(entries, cut) {
  if (!entries.length) return;
  const paths = entries.map((e) => e.path);
  state.clipboard = { paths, cut, set: new Set(paths) };
  await api.clipWriteFiles(paths);
  emit('clipboard');
}

export const copy = () => setClipboard(selectedEntries(), false);
export const cut = () => setClipboard(selectedEntries().filter(() => canModifyHere()), true);

async function clipboardPaths() {
  const sys = await api.clipReadFiles();
  const mine = state.clipboard.paths;
  const same = sys.length === mine.length && sys.every((p) => state.clipboard.set?.has(p));
  if (mine.length && (same || !sys.length)) return { paths: mine, cut: state.clipboard.cut };
  return { paths: sys, cut: false };
}

export async function hasClipboardFiles() {
  if (state.clipboard.paths.length) return true;
  return (await api.clipReadFiles()).length > 0;
}

export async function paste(destDir = currentDir()) {
  if (!destDir || isTrash(folder(destDir))) return;
  const { paths, cut: isCut } = await clipboardPaths();
  if (!paths.length) return;
  const ok = await transfer(paths, destDir, isCut ? 'move' : 'copy');
  if (ok && isCut) {
    state.clipboard = { paths: [], cut: false, set: new Set() };
    emit('clipboard');
  }
}

// ---------------- copy / move ----------------

export async function transfer(paths, destDir, op = 'copy') {
  const plan = await api.planTransfer({ op, sources: paths, destDir });
  if (plan.error) {
    await alert('Interrupted Action', plan.error);
    return false;
  }
  if (!plan.items.length) return false;
  let items = plan.items.map((it) => ({ ...it }));
  if (plan.conflicts.length) {
    const res = await conflictDialog({ op, total: plan.items.length, fromDir: dirname(paths[0]), toDir: destDir, conflicts: plan.conflicts });
    if (!res) return false;
    const conflictSrc = new Set(plan.conflicts.map((c) => c.src));
    items = items.map((it) => {
      if (!conflictSrc.has(it.src)) return it;
      if (res.mode === 'decide') return { ...it, mode: res.perFile.get(it.src) || 'skip' };
      return { ...it, mode: res.mode };
    });
    if (items.every((it) => it.mode === 'skip')) return false;
  }
  const jobId = await api.transfer({ op, items });
  const result = await trackJob(jobId, { op, count: items.filter((i) => i.mode !== 'skip').length, from: dirname(paths[0]), to: destDir });

  const affected = new Set([destDir, ...paths.map(dirname)]);
  const newPaths = op === 'move' ? result.moved.map((m) => m[1]) : result.created;
  // Select the new items if we're looking at the destination
  const tab = activeTab();
  if (tab.loc.type === 'folder' && tab.loc.path === destDir) {
    affected.delete(destDir);
    await reload(tab, { select: newPaths.length ? newPaths : null });
  }
  refreshAffected([...affected]);

  if (op === 'move' && result.moved.length) pushUndo({ type: 'move', label: 'Move', pairs: result.moved });
  if (op === 'copy' && result.created.length) pushUndo({ type: 'copy', label: 'Copy', paths: result.created });
  if (result.errors.length) {
    await alert(op === 'move' ? 'Move Item' : 'Copy Item', `${result.errors.length} item(s) could not be ${op === 'move' ? 'moved' : 'copied'}.\n\n${result.errors.slice(0, 5).map((e) => `${basename(e.path)}: ${e.message}`).join('\n')}`);
  }
  return !result.cancelled;
}

// ---------------- delete ----------------

export async function deleteSelected(permanent = false) {
  const tab = activeTab();
  const entries = selectedEntries(tab);
  if (!entries.length || tab.loc.type === 'home' || tab.loc.type === 'thispc') return;
  if (isTrash(tab.loc)) permanent = true;
  if (permanent) {
    const one = entries.length === 1 ? entries[0] : null;
    const ok = await confirm({
      title: one ? (one.isDir ? 'Delete Folder' : 'Delete File') : 'Delete Multiple Items',
      text: one ? `Are you sure you want to permanently delete this ${one.isDir ? 'folder' : 'file'}?` : `Are you sure you want to permanently delete these ${entries.length} items?`,
      entry: one,
      buttons: [
        { label: 'Yes', value: true, primary: true },
        { label: 'No', value: false },
      ],
      cancelValue: false,
    });
    if (!ok) return;
  }
  // Where should focus land afterwards? The item after the last deleted one.
  const order = fv.currentLayout()?.order || tab.items;
  const lastIdx = Math.max(...entries.map((e) => order.findIndex((o) => o.path === e.path)));
  const doomed = new Set(entries.map((e) => e.path));
  const next = order.slice(lastIdx + 1).find((e) => !doomed.has(e.path)) || [...order].reverse().find((e) => !doomed.has(e.path));

  const paths = entries.map((e) => e.path);
  const res = permanent ? await api.deletePermanent(paths) : await api.trash(paths);
  await reload(tab, { select: next ? [next.path] : null });
  refreshAffected([...new Set(paths.map(dirname))]);
  if (res.failed?.length) {
    await alert(permanent ? 'Delete File' : 'Delete File', `Some items couldn't be deleted.\n\n${res.failed.slice(0, 5).map((f) => `${basename(f.path)}: ${f.message}`).join('\n')}`);
  }
}

// ---------------- rename ----------------

async function uniqueSibling(dir, name, isDir) {
  const [base, ext] = isDir ? [name, ''] : splitExt(name);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!(await api.exists(`${dir}/${candidate}`))) return candidate;
  }
  return null;
}

export async function renameEntry(entry, newName) {
  const dir = dirname(entry.path);
  if (!entry.isDir && splitExt(entry.name)[1].toLowerCase() !== splitExt(newName)[1].toLowerCase() && splitExt(entry.name)[1]) {
    const ok = await confirm({
      title: 'Rename',
      text: 'If you change a file name extension, the file might become unusable.\n\nAre you sure you want to change it?',
      html: 'If you change a file name extension, the file might become unusable.<br><br>Are you sure you want to change it?',
      buttons: [
        { label: 'Yes', value: true, primary: true },
        { label: 'No', value: false },
      ],
      cancelValue: false,
    });
    if (!ok) return null;
  }
  let res = await api.rename(entry.path, newName);
  if (res.error === 'EEXIST') {
    const alt = await uniqueSibling(dir, newName, entry.isDir);
    const ok = await confirm({
      title: entry.isDir ? 'Rename Folder' : 'Rename File',
      html: `There is already a ${entry.isDir ? 'folder' : 'file'} with the same name in this location.<br><br>Do you want to rename "${newName}" to "${alt}"?`,
      buttons: [
        { label: 'Yes', value: true, primary: true },
        { label: 'No', value: false },
      ],
      cancelValue: false,
    });
    if (!ok || !alt) return null;
    res = await api.rename(entry.path, alt);
  }
  if (res.error) {
    await alert(entry.isDir ? 'Rename Folder' : 'Rename File', res.message || 'The item could not be renamed.');
    return null;
  }
  pushUndo({ type: 'rename', label: 'Rename', from: entry.path, to: res.path });
  const tab = activeTab();
  if (tab.loc.type === 'folder' && tab.loc.path === dir) await reload(tab, { select: [res.path] });
  else if (tab.loc.type === 'search') {
    const e = tab.entries.find((x) => x.path === entry.path);
    if (e) {
      e.path = res.path;
      e.name = basename(res.path);
    }
    const { applySort } = await import('./nav.js');
    applySort(tab);
    tab.selection = new Set([res.path]);
    emit('items', tab);
  }
  // Rename inside pinned folders / open tabs
  if (state.settings.pinned.includes(entry.path)) saveSettings({ pinned: state.settings.pinned.map((p) => (p === entry.path ? res.path : p)) });
  for (const t of state.tabs) {
    if (t.loc.type === 'folder' && isInside(t.loc.path, entry.path)) {
      navigate(t, folder(res.path + t.loc.path.slice(entry.path.length)), { replace: true });
    }
  }
  emit('tree-changed', dir);
  return res.path;
}

export function renameSelected() {
  const tab = activeTab();
  const sel = selectedEntries(tab);
  if (!sel.length || !canModifyHere(tab) && tab.loc.type !== 'search') return;
  if (sel.length === 1) fv.startRename(sel[0].path);
  else batchRename(sel);
}

// Windows renames a multi-selection to "Name (1)", "Name (2)"...
async function batchRename(entries) {
  const first = entries[0];
  fv.setSelection([first.path], first.path);
  fv.startRename(first.path);
  const off = setInterval(async () => {
    if (state.renaming) return;
    clearInterval(off);
    const tab = activeTab();
    const renamed = tab.items.find((e) => e.path === tab.focus);
    if (!renamed || renamed.path === first.path) return;
    const [base] = splitExt(renamed.name);
    const finalBase = base.replace(/ \(1\)$/, '');
    const out = [];
    let n = 1;
    if (!/ \(1\)$/.test(base)) {
      const r = await api.rename(renamed.path, `${finalBase} (1)${renamed.ext && !renamed.isDir ? '.' + renamed.ext : ''}`);
      if (r.path) out.push(r.path);
    } else out.push(renamed.path);
    for (const e of entries.slice(1)) {
      n++;
      const ext = e.isDir ? '' : splitExt(e.name)[1];
      let name = `${finalBase} (${n})${ext}`;
      const r = await api.rename(e.path, name);
      if (r.path) out.push(r.path);
    }
    await reload(tab, { select: out });
  }, 150);
}

// ---------------- new items ----------------

export async function newFolder() {
  const tab = activeTab();
  const dir = currentDir(tab);
  if (!dir || !canModifyHere(tab)) return;
  try {
    const p = await api.mkdir(dir, 'New folder');
    pushUndo({ type: 'create', label: 'New', paths: [p] });
    await reload(tab, { select: [p] });
    emit('tree-changed', dir);
    fv.startRename(p);
  } catch (e) {
    alert('New Folder', e.message);
  }
}

const NEW_KINDS = {
  txt: ['New Text Document', '.txt', ''],
  rtf: ['New Rich Text Document', '.rtf', '{\\rtf1\\ansi\n}'],
  md: ['New Markdown Document', '.md', ''],
  zip: ['New Compressed (zipped) Folder', '.zip', 'PK\u0005\u0006' + '\u0000'.repeat(18)],
};

export async function newFile(kind) {
  const tab = activeTab();
  const dir = currentDir(tab);
  if (!dir || !canModifyHere(tab)) return;
  const [base, ext, content] = NEW_KINDS[kind];
  try {
    const p = await api.newFile(dir, base, ext, content);
    pushUndo({ type: 'create', label: 'New', paths: [p] });
    await reload(tab, { select: [p] });
    fv.startRename(p);
  } catch (e) {
    alert('New', e.message);
  }
}

// ---------------- misc commands ----------------

export function copyPath(entries = selectedEntries()) {
  const tab = activeTab();
  const paths = entries.length ? entries.map((e) => e.path) : tab.loc.type === 'folder' ? [tab.loc.path] : [];
  if (paths.length) api.clipWriteText(paths.map((p) => `"${p}"`).join('\n'));
}

export async function showProperties(entries = selectedEntries()) {
  const tab = activeTab();
  if (!entries.length && tab.loc.type === 'folder') {
    const e = await api.stat(tab.loc.path);
    if (e) entries = [e];
  }
  if (entries.length) propsDialog(entries);
}

export function isPinned(path) {
  return state.settings.pinned.includes(path);
}

export function togglePin(path) {
  const pinned = isPinned(path) ? state.settings.pinned.filter((p) => p !== path) : [...state.settings.pinned, path];
  saveSettings({ pinned });
}

export async function compress(entries = selectedEntries()) {
  if (!entries.length) return;
  const res = await api.compress(entries.map((e) => e.path));
  if (res.error) return alert('Compressed (zipped) Folders Error', res.error);
  pushUndo({ type: 'create', label: 'New', paths: [res.path] });
  const tab = activeTab();
  if (tab.loc.type === 'folder' && tab.loc.path === dirname(res.path)) {
    await reload(tab, { select: [res.path] });
    fv.startRename(res.path);
  }
}

export async function extract(entry) {
  const res = await api.extract(entry.path);
  if (res.error) return alert('Compressed (zipped) Folders Error', res.error);
  pushUndo({ type: 'create', label: 'New', paths: [res.path] });
  const tab = activeTab();
  if (tab.loc.type === 'folder' && tab.loc.path === dirname(res.path)) await reload(tab, { select: [res.path] });
}

export async function emptyTrash() {
  const ok = await confirm({
    title: 'Delete Multiple Items',
    text: 'Are you sure you want to permanently delete all of the items in the Recycle Bin?',
    buttons: [
      { label: 'Yes', value: true, primary: true },
      { label: 'No', value: false },
    ],
    cancelValue: false,
  });
  if (!ok) return;
  const res = await api.emptyTrash();
  if (res.error) alert('Recycle Bin', res.error);
  const tab = activeTab();
  if (isTrash(tab.loc)) reload(tab);
}

export function openTerminal(path) {
  const tab = activeTab();
  const dir = path || currentDir(tab) || state.paths.home;
  api.openTerminal(dir);
}

export function share(entries, x, y) {
  if (entries.length) api.share(entries.map((e) => e.path), x, y);
}

// ---------------- undo / redo ----------------

async function runMove(pairs) {
  const items = [];
  for (const [src, dest] of pairs) {
    const st = await api.stat(src);
    if (st) items.push({ src, dest, isDir: st.isDir || st.isPackage });
  }
  if (!items.length) return [];
  const id = await api.transfer({ op: 'move', items });
  const r = await trackJob(id, { op: 'move', count: items.length, from: dirname(items[0].src), to: dirname(items[0].dest) });
  return r.moved;
}

export function undoLabel() {
  const u = state.undo[state.undo.length - 1];
  return u ? `Undo ${u.label}` : 'Undo';
}
export function redoLabel() {
  const r = state.redo[state.redo.length - 1];
  return r ? `Redo ${r.label}` : 'Redo';
}

export async function undo() {
  const u = state.undo.pop();
  if (!u) return;
  const dirs = new Set();
  if (u.type === 'rename') {
    const r = await api.rename(u.to, basename(u.from));
    if (!r.error) state.redo.push(u);
    dirs.add(dirname(u.from));
  } else if (u.type === 'move') {
    const back = await runMove(u.pairs.map(([a, b]) => [b, a]));
    if (back.length) state.redo.push(u);
    u.pairs.forEach(([a, b]) => (dirs.add(dirname(a)), dirs.add(dirname(b))));
  } else if (u.type === 'copy' || u.type === 'create') {
    const ok = await confirm({
      title: u.type === 'copy' ? 'Undo Copy' : 'Undo New',
      text: `Are you sure you want to move ${u.paths.length === 1 ? `"${basename(u.paths[0])}"` : `these ${u.paths.length} items`} to the Recycle Bin?`,
      buttons: [
        { label: 'Yes', value: true, primary: true },
        { label: 'No', value: false },
      ],
      cancelValue: false,
    });
    if (!ok) {
      state.undo.push(u);
      return;
    }
    await api.trash(u.paths);
    u.paths.forEach((p) => dirs.add(dirname(p)));
  }
  emit('undo');
  refreshAffected([...dirs]);
}

export async function redo() {
  const r = state.redo.pop();
  if (!r) return;
  const dirs = new Set();
  if (r.type === 'rename') {
    const res = await api.rename(r.from, basename(r.to));
    if (!res.error) state.undo.push(r);
    dirs.add(dirname(r.from));
  } else if (r.type === 'move') {
    const moved = await runMove(r.pairs);
    if (moved.length) state.undo.push(r);
    r.pairs.forEach(([a, b]) => (dirs.add(dirname(a)), dirs.add(dirname(b))));
  }
  emit('undo');
  refreshAffected([...dirs]);
}

// ---------------- shared menus ----------------

export function viewItems(tab = activeTab()) {
  return [
    ...fv.MODES.map((m) => ({ label: m.label, icon: glyph(m.glyph), key: K(m.key), radio: tab.view.mode === m.id, click: () => setView(tab, { mode: m.id }) })),
    { separator: true },
    { label: 'Compact view', icon: glyph('compact'), checked: !!state.settings.compact, click: () => saveSettings({ compact: !state.settings.compact }) },
    {
      label: 'Show',
      icon: glyph('previewPane'),
      submenu: () => [
        { label: 'Navigation pane', icon: glyph('navPane'), checked: state.settings.showNav !== false, click: () => saveSettings({ showNav: state.settings.showNav === false }) },
        { label: 'Details pane', icon: glyph('detailsPane'), checked: state.settings.pane === 'details', key: K('Alt+Shift+P'), click: () => togglePane('details') },
        { label: 'Preview pane', icon: glyph('previewPane'), checked: state.settings.pane === 'preview', key: K('Alt+P'), click: () => togglePane('preview') },
        { separator: true },
        { label: 'Item check boxes', icon: glyph('check'), checked: !!state.settings.checkboxes, click: () => saveSettings({ checkboxes: !state.settings.checkboxes }) },
        { label: 'File name extensions', checked: !!state.settings.showExtensions, click: () => saveSettings({ showExtensions: !state.settings.showExtensions }) },
        { label: 'Hidden items', checked: !!state.settings.showHidden, click: () => saveSettings({ showHidden: !state.settings.showHidden }) },
      ],
    },
  ];
}

export function togglePane(which) {
  saveSettings({ pane: state.settings.pane === which ? null : which });
}

const SORT_KEYS = [
  ['name', 'Name'],
  ['modified', 'Date modified'],
  ['type', 'Type'],
  ['size', 'Size'],
  ['created', 'Date created'],
];

export function sortItems(tab = activeTab()) {
  const keys = tab.loc.type === 'search' ? [...SORT_KEYS, ['folder', 'Folder']] : SORT_KEYS;
  return [
    ...keys.map(([k, label]) => ({ label, radio: tab.view.sortKey === k, click: () => setView(tab, { sortKey: k }) })),
    { separator: true },
    { label: 'Ascending', radio: tab.view.sortDir > 0, click: () => setView(tab, { sortDir: 1 }) },
    { label: 'Descending', radio: tab.view.sortDir < 0, click: () => setView(tab, { sortDir: -1 }) },
    { separator: true },
    { label: 'Group by', icon: glyph('group'), submenu: () => groupItems(tab) },
  ];
}

export function groupItems(tab = activeTab()) {
  return [
    ...SORT_KEYS.map(([k, label]) => ({ label, radio: tab.view.groupBy === k, click: () => setView(tab, { groupBy: k }) })),
    { separator: true },
    { label: '(None)', radio: !tab.view.groupBy || tab.view.groupBy === 'none', click: () => setView(tab, { groupBy: 'none' }) },
  ];
}

export function newItems() {
  const ok = canModifyHere();
  return [
    { label: 'Folder', icon: glyph('newFolder'), key: K('Ctrl+Shift+N'), disabled: !ok, click: newFolder },
    { separator: true },
    { label: 'Text Document', icon: glyph('newFile'), disabled: !ok, click: () => newFile('txt') },
    { label: 'Rich Text Document', icon: glyph('newFile'), disabled: !ok, click: () => newFile('rtf') },
    { label: 'Markdown Document', icon: glyph('newFile'), disabled: !ok, click: () => newFile('md') },
    { label: 'Compressed (zipped) Folder', icon: glyph('compress'), disabled: !ok, click: () => newFile('zip') },
  ];
}

export function moreItems() {
  const tab = activeTab();
  const sel = selectedEntries(tab);
  const isFolderView = tab.loc.type === 'folder' || tab.loc.type === 'search';
  return [
    { label: undoLabel(), icon: glyph('undo'), key: K('Ctrl+Z'), disabled: !state.undo.length, click: undo },
    { label: redoLabel(), icon: glyph('redo'), key: K('Ctrl+Y'), disabled: !state.redo.length, click: redo },
    { separator: true },
    tab.loc.type === 'folder'
      ? { label: isPinned(tab.loc.path) ? 'Unpin from Quick access' : 'Pin to Quick access', icon: glyph(isPinned(tab.loc.path) ? 'unpin' : 'pin'), click: () => togglePin(tab.loc.path) }
      : null,
    { label: 'Select all', icon: glyph('selectAll'), key: K('Ctrl+A'), disabled: !isFolderView, click: fv.selectAll },
    { label: 'Select none', icon: glyph('selectNone'), disabled: !isFolderView || !sel.length, click: fv.selectNone },
    { label: 'Invert selection', icon: glyph('invert'), disabled: !isFolderView, click: fv.invertSelection },
    { separator: true },
    { label: 'Copy path', icon: glyph('copyPath'), key: K('Ctrl+Shift+C'), disabled: tab.loc.type !== 'folder' && !sel.length, click: () => copyPath() },
    { label: 'Open in Terminal', icon: glyph('terminal'), disabled: tab.loc.type !== 'folder', click: () => openTerminal() },
    { label: 'Properties', icon: glyph('properties'), key: K('Alt+Enter'), disabled: tab.loc.type !== 'folder' && !sel.length, click: () => showProperties() },
    { label: 'Options', icon: glyph('options'), click: folderOptions },
  ];
}

export async function itemMenu(pos) {
  const tab = activeTab();
  const sel = selectedEntries(tab);
  if (!sel.length) return;
  const one = sel.length === 1 ? sel[0] : null;
  const trash = isTrash(tab.loc);
  const modifiable = tab.loc.type === 'search' || canModifyHere(tab);
  const top = [
    { icon: glyph('cut'), tip: `Cut (${K('Ctrl+X')})`, disabled: !modifiable, click: cut },
    { icon: glyph('copy'), tip: `Copy (${K('Ctrl+C')})`, click: copy },
    { icon: glyph('rename'), tip: 'Rename (F2)', disabled: !modifiable, click: renameSelected },
    { icon: glyph('share'), tip: 'Share', click: () => share(sel, pos.x, pos.y) },
    { icon: glyph('delete'), tip: `Delete (${trash ? 'permanently' : 'Delete'})`, click: () => deleteSelected() },
  ];
  const zip = one && one.ext === 'zip';
  const items = [
    { label: 'Open', icon: glyph('open'), key: 'Enter', click: () => openEntries(sel) },
    one?.isDir ? { label: 'Open in new tab', icon: glyph('newTab'), click: () => openInNewTab(one.path) } : null,
    one?.isDir ? { label: 'Open in new window', icon: glyph('newWindow'), click: () => openInNewWindow(one.path) } : null,
    one && !one.isDir
      ? {
          label: 'Open with',
          icon: glyph('openWith'),
          submenu: [
            { label: 'Default app', icon: glyph('open'), click: () => openPath(one.path) },
            { separator: true },
            { label: 'Choose another app', click: () => api.openWith(one.path) },
          ],
        }
      : null,
    tab.loc.type === 'search' && one ? { label: 'Open file location', icon: glyph('open'), click: () => openFileLocation(one.path) } : null,
    one?.isDir ? { label: isPinned(one.path) ? 'Unpin from Quick access' : 'Pin to Quick access', icon: glyph(isPinned(one.path) ? 'unpin' : 'pin'), click: () => togglePin(one.path) } : null,
    { separator: true },
    zip ? { label: 'Extract All...', icon: glyph('extract'), click: () => extract(one) } : null,
    !trash ? { label: 'Compress to', icon: glyph('compress'), submenu: [{ label: 'ZIP File', icon: glyph('compress'), click: () => compress(sel) }] } : null,
    { label: 'Copy as path', icon: glyph('copyPath'), key: K('Ctrl+Shift+C'), click: () => copyPath(sel) },
    { label: 'Properties', icon: glyph('properties'), key: K('Alt+Enter'), click: () => showProperties(sel) },
    { separator: true },
    one?.isDir ? { label: 'Open in Terminal', icon: glyph('terminal'), click: () => openTerminal(one.path) } : null,
    { label: 'Show in Finder', icon: glyph('finder'), click: () => api.reveal(sel[0].path) },
    trash ? { label: 'Delete permanently', icon: glyph('delete'), click: () => deleteSelected(true) } : null,
  ];
  showMenu(pos, items, { top, keyboard: pos.keyboard });
}

export async function backgroundMenu(pos) {
  const tab = activeTab();
  const hasClip = await hasClipboardFiles();
  const trash = isTrash(tab.loc);
  const ok = canModifyHere(tab);
  const items = [
    { label: 'View', icon: glyph('view'), submenu: () => viewItems(tab) },
    { label: 'Sort by', icon: glyph('sort'), submenu: () => sortItems(tab) },
    { label: 'Group by', icon: glyph('group'), submenu: () => groupItems(tab) },
    { separator: true },
    { label: undoLabel(), icon: glyph('undo'), key: K('Ctrl+Z'), disabled: !state.undo.length, click: undo },
    state.redo.length ? { label: redoLabel(), icon: glyph('redo'), key: K('Ctrl+Y'), click: redo } : null,
    { separator: true },
    ok ? { label: 'Paste', icon: glyph('paste'), key: K('Ctrl+V'), disabled: !hasClip, click: () => paste() } : null,
    ok ? { label: 'New', icon: NEW_ICON, submenu: newItems } : null,
    trash ? { label: 'Empty Recycle Bin', icon: glyph('emptyBin'), click: emptyTrash } : null,
    { separator: true },
    tab.loc.type === 'folder' ? { label: 'Properties', icon: glyph('properties'), key: K('Alt+Enter'), click: () => showProperties([]) } : null,
    { separator: true },
    tab.loc.type === 'folder' ? { label: 'Open in Terminal', icon: glyph('terminal'), click: () => openTerminal() } : null,
    tab.loc.type === 'folder' ? { label: 'Show in Finder', icon: glyph('finder'), click: () => api.open(tab.loc.path) } : null,
  ];
  // Drop leading/trailing/duplicate separators
  const clean = [];
  for (const it of items.filter(Boolean)) {
    if (it.separator && (!clean.length || clean[clean.length - 1].separator)) continue;
    clean.push(it);
  }
  while (clean.length && clean[clean.length - 1].separator) clean.pop();
  showMenu(pos, clean, { keyboard: pos.keyboard });
}

export { HOME, createTab, displayName };
