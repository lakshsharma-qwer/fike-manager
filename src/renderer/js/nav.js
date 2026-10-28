// Locations, history, loading folder contents, sorting, grouping and search.
import { state, emit, activeTab, saveSettings } from './state.js';
import { basename, dirname, collator, typeName, isInside } from './util.js';
import { navSVG, folderSVG } from './icons.js';

const api = window.api;
let tabSeq = 0;

// ---------------- locations ----------------

export const HOME = { type: 'home' };
export const THISPC = { type: 'thispc' };

export function folder(path) {
  return { type: 'folder', path };
}

export function locKey(loc) {
  if (!loc) return '';
  if (loc.type === 'folder') return loc.path;
  if (loc.type === 'search') return `search:${loc.path}?${loc.query}`;
  return `shell:${loc.type}`;
}

export function sameLoc(a, b) {
  return locKey(a) === locKey(b);
}

export function parseLoc(str) {
  if (!str || str === 'shell:home') return null;
  if (str === 'shell:thispc') return THISPC;
  return folder(str);
}

export function specialName(path) {
  const p = state.paths;
  if (!p) return null;
  if (path === p.trash) return 'Recycle Bin';
  if (path === p.icloud) return 'iCloud Drive';
  if (path === '/') {
    const root = state.volumes.find((v) => v.isRoot);
    return root ? root.name : 'Macintosh HD';
  }
  const vol = state.volumes.find((v) => v.path === path);
  if (vol) return vol.name;
  return null;
}

export function displayName(path) {
  return specialName(path) || basename(path);
}

export function locTitle(loc) {
  if (!loc) return '';
  if (loc.type === 'home') return 'Home';
  if (loc.type === 'thispc') return 'This PC';
  if (loc.type === 'search') return `${loc.query} - Search Results in ${displayName(loc.path)}`;
  return displayName(loc.path);
}

export function placeIcon(path, size = 16) {
  const p = state.paths;
  if (!p) return folderSVG(size);
  const map = {
    [p.desktop]: 'desktop',
    [p.downloads]: 'downloads',
    [p.documents]: 'documents',
    [p.pictures]: 'pictures',
    [p.music]: 'music',
    [p.videos]: 'videos',
    [p.trash]: 'trash',
    [p.home]: 'user',
  };
  if (p.icloud) map[p.icloud] = 'cloud';
  if (map[path]) return navSVG(map[path], size);
  if (path === '/' || state.volumes.some((v) => v.path === path)) return navSVG('drive', size);
  return folderSVG(size);
}

export function locIcon(loc, size = 16) {
  if (!loc) return '';
  if (loc.type === 'home') return navSVG('home', size);
  if (loc.type === 'thispc') return navSVG('thispc', size);
  if (loc.type === 'search') return navSVG('search', size);
  return placeIcon(loc.path, size);
}

export function isTrash(loc) {
  return loc?.type === 'folder' && loc.path === state.paths.trash;
}

// ---------------- tabs ----------------

export function createTab(loc) {
  const tab = {
    id: ++tabSeq,
    loc: null,
    history: [],
    hIndex: -1,
    entries: [],
    items: [],
    view: null,
    selection: new Set(),
    focus: null,
    anchor: null,
    scroll: { top: 0, left: 0 },
    loading: false,
    error: null,
    searchId: null,
    searching: false,
    collapsed: new Set(),
    loadSeq: 0,
  };
  navigate(tab, loc || defaultLocation());
  return tab;
}

export function defaultLocation() {
  return state.settings.openTo === 'thispc' ? THISPC : HOME;
}

// ---------------- view settings ----------------

const DEFAULT_VIEW = { mode: 'details', sortKey: 'name', sortDir: 1, groupBy: 'none' };

function defaultViewFor(loc) {
  const p = state.paths;
  if (loc.type === 'search') return { ...DEFAULT_VIEW, sortKey: 'name' };
  if (loc.type === 'folder') {
    if (loc.path === p.downloads) return { mode: 'details', sortKey: 'modified', sortDir: -1, groupBy: 'modified' };
    if (loc.path === p.pictures || loc.path === p.videos) return { ...DEFAULT_VIEW, mode: 'large' };
  }
  return { ...DEFAULT_VIEW };
}

function viewKey(loc) {
  return loc.type === 'search' ? 'search:' : loc.path;
}

export function viewFor(loc) {
  const saved = state.settings.views[viewKey(loc)];
  return { ...defaultViewFor(loc), ...(saved || {}) };
}

export function setView(tab, patch) {
  tab.view = { ...tab.view, ...patch };
  if (tab.loc.type === 'folder' || tab.loc.type === 'search') {
    const views = { ...state.settings.views, [viewKey(tab.loc)]: tab.view };
    saveSettings({ views });
  }
  applySort(tab);
  emit('items', tab);
  emit('view', tab);
}

// ---------------- navigation ----------------

export async function navigate(tab, loc, { push = true, select = null, replace = false } = {}) {
  if (tab.searchId) {
    api.cancelSearch(tab.searchId);
    tab.searchId = null;
    tab.searching = false;
  }
  // Remember where we were scrolled
  if (tab.loc && tab.history[tab.hIndex]) tab.history[tab.hIndex].scroll = { ...tab.scroll };

  if (replace && tab.hIndex >= 0) {
    tab.history[tab.hIndex] = { loc };
  } else if (push) {
    const cur = tab.history[tab.hIndex];
    if (!cur || !sameLoc(cur.loc, loc)) {
      tab.history = tab.history.slice(0, tab.hIndex + 1);
      tab.history.push({ loc });
      tab.hIndex = tab.history.length - 1;
    }
  }
  tab.loc = loc;
  tab.view = viewFor(loc);
  tab.selection = new Set();
  tab.focus = null;
  tab.anchor = null;
  tab.collapsed = new Set();
  tab.scroll = tab.history[tab.hIndex]?.scroll || { top: 0, left: 0 };
  tab.entries = [];
  tab.items = [];
  tab.error = null;
  emit('location', tab);
  await load(tab, { select });
}

export async function load(tab, { select = null, keepSelection = false } = {}) {
  const loc = tab.loc;
  const seq = ++tab.loadSeq;
  if (loc.type === 'folder') {
    tab.loading = true;
    emit('loading', tab);
    const res = await api.list(loc.path);
    if (seq !== tab.loadSeq) return;
    tab.loading = false;
    tab.error = res.error || null;
    tab.entries = res.entries;
    if (tab.id === state.activeId) api.watch(loc.path);
  } else if (loc.type === 'search') {
    startSearchFor(tab);
  } else {
    tab.entries = [];
    if (tab.id === state.activeId) api.watch(null);
  }
  const prevSel = tab.selection;
  applySort(tab);
  if (select) {
    const want = new Set([].concat(select));
    tab.selection = new Set(tab.items.filter((e) => want.has(e.path)).map((e) => e.path));
    tab.focus = [...tab.selection][0] || null;
    tab.anchor = tab.focus;
  } else if (keepSelection) {
    const valid = new Set(tab.items.map((e) => e.path));
    tab.selection = new Set([...prevSel].filter((p) => valid.has(p)));
    if (tab.focus && !valid.has(tab.focus)) tab.focus = null;
  }
  emit('loading', tab);
  emit('items', tab);
  emit('selection', tab);
}

export function reload(tab = activeTab(), opts = {}) {
  if (tab.loc.type === 'search') return load(tab);
  return load(tab, { keepSelection: true, ...opts });
}

export function canBack(tab) {
  return tab.hIndex > 0;
}
export function canForward(tab) {
  return tab.hIndex < tab.history.length - 1;
}
export function parentOf(loc) {
  if (loc.type === 'folder' || loc.type === 'search') {
    if (loc.type === 'search') return folder(loc.path);
    if (loc.path === '/') return THISPC;
    if (state.volumes.some((v) => v.path === loc.path)) return THISPC;
    return folder(dirname(loc.path));
  }
  if (loc.type === 'thispc') return null;
  return null;
}

export function goHistory(tab, index) {
  if (index < 0 || index >= tab.history.length) return;
  const from = tab.loc;
  if (tab.history[tab.hIndex]) tab.history[tab.hIndex].scroll = { ...tab.scroll };
  tab.hIndex = index;
  // When going back to a parent, select the folder we came out of (like Windows)
  const target = tab.history[index].loc;
  let select = null;
  if (from?.type === 'folder' && target.type === 'folder' && dirname(from.path) === target.path) select = from.path;
  return navigate(tab, target, { push: false, select });
}

export function goBack(tab = activeTab()) {
  if (canBack(tab)) return goHistory(tab, tab.hIndex - 1);
}
export function goForward(tab = activeTab()) {
  if (canForward(tab)) return goHistory(tab, tab.hIndex + 1);
}
export function goUp(tab = activeTab()) {
  const p = parentOf(tab.loc);
  if (!p) return;
  const select = tab.loc.type === 'folder' ? tab.loc.path : null;
  return navigate(tab, p, { select });
}

// ---------------- sorting & grouping ----------------

export function applySort(tab) {
  const { sortKey, sortDir } = tab.view;
  const showHidden = state.settings.showHidden;
  let list = showHidden ? tab.entries.slice() : tab.entries.filter((e) => !e.hidden);

  const byName = (a, b) => collator.compare(a.name, b.name);
  const keyCmp = {
    name: byName,
    modified: (a, b) => a.mtime - b.mtime || byName(a, b),
    created: (a, b) => a.ctime - b.ctime || byName(a, b),
    type: (a, b) => collator.compare(typeName(a), typeName(b)) || byName(a, b),
    size: (a, b) => a.size - b.size || byName(a, b),
    folder: (a, b) => collator.compare(dirname(a.path), dirname(b.path)) || byName(a, b),
  }[sortKey] || byName;

  // Folders stay together for name/type/size; date sorts interleave them like Explorer
  const foldersFirst = !['modified', 'created'].includes(sortKey);
  list.sort((a, b) => {
    if (foldersFirst && a.isDir !== b.isDir) return (a.isDir ? -1 : 1) * sortDir;
    return keyCmp(a, b) * sortDir;
  });
  tab.items = list;
}

const DAY = 86400000;

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dateGroup(ms) {
  const now = Date.now();
  const today = startOfDay(now);
  const d = new Date(now);
  const weekStart = today - ((d.getDay() + 6) % 7) * DAY; // Monday
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const yearStart = new Date(d.getFullYear(), 0, 1).getTime();
  if (ms >= today + DAY) return [0, 'In the future'];
  if (ms >= today) return [1, 'Today'];
  if (ms >= today - DAY) return [2, 'Yesterday'];
  if (ms >= weekStart) return [3, 'Earlier this week'];
  if (ms >= weekStart - 7 * DAY) return [4, 'Last week'];
  if (ms >= monthStart) return [5, 'Earlier this month'];
  if (ms >= lastMonthStart) return [6, 'Last month'];
  if (ms >= yearStart) return [7, 'Earlier this year'];
  return [8, 'A long time ago'];
}

function sizeGroup(e) {
  if (e.isDir) return [0, 'Unspecified'];
  const s = e.size;
  const KB = 1024;
  const MB = KB * 1024;
  if (s === 0) return [1, 'Empty (0 KB)'];
  if (s < 16 * KB) return [2, 'Tiny (0 - 16 KB)'];
  if (s < MB) return [3, 'Small (16 KB - 1 MB)'];
  if (s < 128 * MB) return [4, 'Medium (1 - 128 MB)'];
  if (s < 1024 * MB) return [5, 'Large (128 MB - 1 GB)'];
  if (s < 4096 * MB) return [6, 'Huge (1 - 4 GB)'];
  return [7, 'Gigantic (> 4 GB)'];
}

function nameGroup(e) {
  const c = e.name.trim()[0]?.toUpperCase() || '';
  if (/[0-9]/.test(c)) return [0, '0 - 9'];
  if (c >= 'A' && c <= 'H') return [1, 'A - H'];
  if (c >= 'I' && c <= 'P') return [2, 'I - P'];
  if (c >= 'Q' && c <= 'Z') return [3, 'Q - Z'];
  return [4, 'Other'];
}

// Returns [{ key, label, items }] in display order, or null when not grouping
export function groupsFor(tab) {
  const g = tab.view.groupBy;
  if (!g || g === 'none') return null;
  const fn = {
    modified: (e) => dateGroup(e.mtime),
    created: (e) => dateGroup(e.ctime),
    type: (e) => [typeName(e), typeName(e)],
    size: sizeGroup,
    name: nameGroup,
  }[g];
  if (!fn) return null;
  const map = new Map();
  for (const e of tab.items) {
    const [order, label] = fn(e);
    if (!map.has(label)) map.set(label, { key: label, label, order, items: [] });
    map.get(label).items.push(e);
  }
  const groups = [...map.values()];
  groups.sort((a, b) => (typeof a.order === 'string' ? collator.compare(a.order, b.order) : a.order - b.order));
  return groups;
}

// ---------------- search ----------------

let searchSeq = 0;

export function search(tab, query) {
  query = query.trim();
  const root = tab.loc.type === 'search' ? tab.loc.path : tab.loc.type === 'folder' ? tab.loc.path : state.paths.home;
  if (!query) {
    if (tab.loc.type === 'search') return navigate(tab, folder(root), { replace: true });
    return;
  }
  const loc = { type: 'search', path: root, query };
  return navigate(tab, loc, { replace: tab.loc.type === 'search' });
}

function startSearchFor(tab) {
  const id = `s${++searchSeq}`;
  tab.searchId = id;
  tab.searching = true;
  tab.entries = [];
  api.search({ id, root: tab.loc.path, query: tab.loc.query, showHidden: state.settings.showHidden });
}

export function initSearchListeners() {
  api.on('search-results', ({ id, entries }) => {
    const tab = state.tabs.find((t) => t.searchId === id);
    if (!tab) return;
    tab.entries.push(...entries);
    applySort(tab);
    emit('items', tab);
  });
  api.on('search-done', ({ id }) => {
    const tab = state.tabs.find((t) => t.searchId === id);
    if (!tab) return;
    tab.searching = false;
    emit('loading', tab);
    emit('items', tab);
  });
  api.on('dir-changed', (dir) => {
    for (const tab of state.tabs) {
      if (tab.loc.type === 'folder' && tab.loc.path === dir && !state.renaming) reload(tab);
    }
  });
}

// Every tab showing a path inside `dir` should be refreshed after a file op
export function refreshAffected(dirs) {
  const set = new Set(dirs);
  for (const tab of state.tabs) {
    if (tab.loc.type === 'folder' && set.has(tab.loc.path)) reload(tab);
    else if (tab.loc.type === 'search' && [...set].some((d) => isInside(d, tab.loc.path))) {
      // Search results are a snapshot; just drop entries that no longer exist.
    }
  }
}
