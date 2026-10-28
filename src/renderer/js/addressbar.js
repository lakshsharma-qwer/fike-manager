// Address row: back / forward / up / refresh, breadcrumb (with sibling dropdowns),
// editable path with autocomplete, history dropdown and the search box.
import { state, on, activeTab } from './state.js';
import { $, h, esc, basename, dirname, isInside } from './util.js';
import { glyph, navSVG } from './icons.js';
import { navigate, folder, HOME, THISPC, goBack, goForward, goUp, reload, canBack, canForward, parentOf, locIcon, displayName, search, locTitle, goHistory } from './nav.js';
import { showMenu, closeAll } from './menu.js';
import { alert } from './dialogs.js';
import * as actions from './actions.js';

const api = window.api;
const address = $('#address');
const crumbs = $('#breadcrumb');
const input = $('#address-input');
const searchBox = $('#search');
const searchInput = $('#search-input');

// ---------------- breadcrumb ----------------

function segmentsFor(loc) {
  const p = state.paths;
  if (loc.type === 'home') return [{ label: 'Home', loc: HOME }];
  if (loc.type === 'thispc') return [{ label: 'This PC', loc: THISPC }];
  const path = loc.path;
  const segs = [];
  let base;
  if (isInside(path, p.home)) {
    base = p.home;
    segs.push({ label: basename(p.home), loc: folder(p.home) });
  } else {
    segs.push({ label: 'This PC', loc: THISPC });
    const vol = state.volumes.find((v) => v.path !== '/' && isInside(path, v.path));
    base = vol ? vol.path : '/';
    segs.push({ label: displayName(base), loc: folder(base) });
  }
  const rest = path.slice(base === '/' ? 0 : base.length).split('/').filter(Boolean);
  let cur = base === '/' ? '' : base;
  for (const name of rest) {
    cur = `${cur}/${name}`;
    segs.push({ label: displayName(cur), loc: folder(cur) });
  }
  if (loc.type === 'search') segs.push({ label: `Search Results in ${displayName(path)}`, loc, terminal: true });
  return segs;
}

async function siblingMenu(seg, chevEl) {
  chevEl.classList.add('open');
  let items;
  if (seg.loc.type === 'thispc') {
    const vols = state.volumes.length ? state.volumes : await api.volumes();
    items = [{ label: basename(state.paths.home), icon: navSVG('user'), click: () => navigate(activeTab(), folder(state.paths.home)) }, ...vols.map((v) => ({ label: v.name, icon: navSVG('drive'), click: () => navigate(activeTab(), folder(v.path)) }))];
  } else if (seg.loc.type === 'folder') {
    const kids = await api.subdirs(seg.loc.path, state.settings.showHidden);
    const tab = activeTab();
    items = kids.map((k) => {
      const inPath = tab.loc.type !== 'home' && tab.loc.type !== 'thispc' && isInside(tab.loc.path, k.path);
      return { html: inPath ? `<b>${esc(k.name)}</b>` : esc(k.name), label: k.name, icon: locIcon(folder(k.path)), click: () => navigate(activeTab(), folder(k.path)) };
    });
    if (!items.length) items = [{ label: 'No subfolders', disabled: true }];
  } else return;
  showMenu({ anchor: chevEl.getBoundingClientRect() }, items, { className: 'scroll', onClose: () => chevEl.classList.remove('open') });
}

function rootMenu(anchorEl) {
  const p = state.paths;
  const places = [
    ['Home', HOME, navSVG('home')],
    ['This PC', THISPC, navSVG('thispc')],
    [basename(p.home), folder(p.home), navSVG('user')],
    ['Desktop', folder(p.desktop), navSVG('desktop')],
    ['Documents', folder(p.documents), navSVG('documents')],
    ['Downloads', folder(p.downloads), navSVG('downloads')],
    ['Music', folder(p.music), navSVG('music')],
    ['Pictures', folder(p.pictures), navSVG('pictures')],
    ['Movies', folder(p.videos), navSVG('videos')],
    ['Recycle Bin', folder(p.trash), navSVG('trash')],
  ];
  showMenu({ anchor: anchorEl.getBoundingClientRect() }, places.map(([label, loc, icon]) => ({ label, icon, click: () => navigate(activeTab(), loc) })), { className: 'scroll' });
}

export function renderCrumbs() {
  const tab = activeTab();
  if (!tab) return;
  const segs = segmentsFor(tab.loc);
  const frag = document.createDocumentFragment();
  const icon = h('div', { class: 'crumb-icon', html: locIcon(tab.loc.type === 'search' ? folder(tab.loc.path) : tab.loc) });
  frag.append(icon);
  const rootChev = h('div', { class: 'crumb-chev', html: glyph('chevR', 12) });
  rootChev.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    rootMenu(rootChev);
  });
  frag.append(rootChev);
  segs.forEach((seg, i) => {
    const c = h('div', { class: 'crumb', html: `<span>${esc(seg.label)}</span>` });
    if (seg.loc.type === 'folder') c.dataset.path = seg.loc.path;
    c.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      e.preventDefault();
    });
    c.addEventListener('click', (e) => {
      if (e.metaKey && seg.loc.type === 'folder') return actions.openInNewTab(seg.loc.path, false);
      if (!seg.terminal) navigate(activeTab(), seg.loc);
    });
    c.addEventListener('auxclick', (e) => e.button === 1 && seg.loc.type === 'folder' && actions.openInNewTab(seg.loc.path, false));
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showMenu({ x: e.clientX, y: e.clientY }, [
        { label: 'Copy address', icon: glyph('copyPath'), click: () => api.clipWriteText(seg.loc.path || '') , disabled: !seg.loc.path },
        { label: 'Copy address as text', click: () => api.clipWriteText(seg.loc.path || ''), disabled: !seg.loc.path },
        { label: 'Edit address', click: () => beginEdit() },
        { separator: true },
        seg.loc.type === 'folder' ? { label: 'Open in new tab', icon: glyph('newTab'), click: () => actions.openInNewTab(seg.loc.path) } : null,
      ]);
    });
    frag.append(c);
    const last = i === segs.length - 1;
    if (!seg.terminal && (seg.loc.type === 'folder' || seg.loc.type === 'thispc') && !(last && tab.loc.type === 'search')) {
      const chev = h('div', { class: 'crumb-chev', html: glyph('chevR', 12) });
      chev.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        siblingMenu(seg, chev);
      });
      frag.append(chev);
    }
  });
  crumbs.replaceChildren(frag);
  // Collapse leading segments into « when they don't fit
  requestAnimationFrame(() => {
    const items = [...crumbs.querySelectorAll('.crumb')];
    let hidden = 0;
    while (crumbs.scrollWidth > crumbs.clientWidth && hidden < items.length - 1) {
      const c = items[hidden];
      c.style.display = 'none';
      if (c.nextElementSibling?.classList.contains('crumb-chev')) c.nextElementSibling.style.display = 'none';
      hidden++;
    }
    if (hidden) {
      const more = h('div', { class: 'crumb-overflow', html: '«', 'data-tip': 'Show more locations' });
      more.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showMenu(
          { anchor: more.getBoundingClientRect() },
          segs.slice(0, hidden).reverse().map((s) => ({ label: s.label, icon: locIcon(s.loc), click: () => navigate(activeTab(), s.loc) })),
        );
      });
      rootChev.after(more);
    }
  });
}

// ---------------- edit mode ----------------

function pathText(loc) {
  if (loc.type === 'home') return 'Home';
  if (loc.type === 'thispc') return 'This PC';
  return loc.path;
}

export function beginEdit() {
  closeAll();
  const tab = activeTab();
  address.classList.add('editing');
  input.value = pathText(tab.loc.type === 'search' ? folder(tab.loc.path) : tab.loc);
  input.focus();
  input.select();
}

function endEdit() {
  address.classList.remove('editing');
  closeAll();
}

async function commit() {
  let text = input.value.trim();
  endEdit();
  if (!text) return;
  const tab = activeTab();
  const lower = text.toLowerCase();
  if (lower === 'home') return navigate(tab, HOME);
  if (lower === 'this pc' || lower === 'computer') return navigate(tab, THISPC);
  if (['cmd', 'terminal', 'powershell', 'wt', 'zsh', 'bash'].includes(lower)) return actions.openTerminal();
  if (/^https?:\/\//i.test(text)) return api.open(text);
  if (text.startsWith('~')) text = state.paths.home + text.slice(1);
  if (!text.startsWith('/')) {
    const base = tab.loc.type === 'folder' ? tab.loc.path : state.paths.home;
    text = `${base}/${text}`;
  }
  text = text.replace(/\/+$/, '') || '/';
  const e = await api.stat(text);
  if (!e) {
    await alert('File Explorer', `File Explorer can't find '${input.value.trim()}'. Check the spelling and try again.`);
    return;
  }
  if (e.isDir) navigate(tab, folder(text));
  else actions.openPath(text);
}

const suggest = async () => {
  const v = input.value;
  if (!v.includes('/')) return closeAll();
  let full = v.startsWith('~') ? state.paths.home + v.slice(1) : v;
  const dir = full.endsWith('/') ? full.replace(/\/+$/, '') || '/' : dirname(full);
  const prefix = full.endsWith('/') ? '' : basename(full).toLowerCase();
  const kids = await api.subdirs(dir, state.settings.showHidden);
  const matches = kids.filter((k) => k.name.toLowerCase().startsWith(prefix)).slice(0, 12);
  if (!matches.length || !address.classList.contains('editing')) return closeAll();
  const r = address.getBoundingClientRect();
  showMenu(
    { anchor: { left: r.left, right: r.right, top: r.top, bottom: r.bottom - 2 } },
    matches.map((m) => ({ label: m.path, icon: locIcon(folder(m.path)), click: () => navigate(activeTab(), folder(m.path)) })),
    { className: 'suggest scroll', onClose: () => {} },
  );
  // keep typing in the input
  input.focus();
};

let suggestTimer = null;

// ---------------- search box ----------------

let searchTimer = null;

function updateSearchPlaceholder() {
  const tab = activeTab();
  if (!tab) return;
  const name = tab.loc.type === 'folder' || tab.loc.type === 'search' ? displayName(tab.loc.path) : tab.loc.type === 'thispc' ? 'This PC' : 'Home';
  searchInput.placeholder = `Search ${name}`;
  if (document.activeElement !== searchInput) searchInput.value = tab.loc.type === 'search' ? tab.loc.query : '';
  searchBox.classList.toggle('has-text', !!searchInput.value);
}

export function focusSearch() {
  searchInput.focus();
  searchInput.select();
}

function runSearch() {
  clearTimeout(searchTimer);
  const tab = activeTab();
  search(tab, searchInput.value);
}

// ---------------- nav buttons ----------------

function updateButtons() {
  const tab = activeTab();
  if (!tab) return;
  $('#btn-back').disabled = !canBack(tab);
  $('#btn-forward').disabled = !canForward(tab);
  $('#btn-up').disabled = !parentOf(tab.loc);
  const back = tab.history[tab.hIndex - 1];
  const fwd = tab.history[tab.hIndex + 1];
  $('#btn-back').dataset.tip = back ? `Back to ${locTitle(back.loc)} (Alt+Left Arrow)` : 'Back (Alt+Left Arrow)';
  $('#btn-forward').dataset.tip = fwd ? `Forward to ${locTitle(fwd.loc)} (Alt+Right Arrow)` : 'Forward (Alt+Right Arrow)';
  const up = parentOf(tab.loc);
  $('#btn-up').dataset.tip = up ? `Up to "${locTitle(up)}" (Alt+Up Arrow)` : 'Up (Alt+Up Arrow)';
  address.classList.toggle('loading', !!(tab.loading || tab.searching));
}

function historyMenu(anchor, dir) {
  const tab = activeTab();
  const items = [];
  if (dir < 0) for (let i = tab.hIndex - 1; i >= 0 && items.length < 12; i--) items.push(i);
  else for (let i = tab.hIndex + 1; i < tab.history.length && items.length < 12; i++) items.push(i);
  showMenu(
    { anchor: anchor.getBoundingClientRect() },
    items.map((i) => ({ label: locTitle(tab.history[i].loc), icon: locIcon(tab.history[i].loc), click: () => goHistory(tab, i) })),
  );
}

export function initAddressBar() {
  $('#btn-back').innerHTML = glyph('back');
  $('#btn-forward').innerHTML = glyph('forward');
  $('#btn-up').innerHTML = glyph('up');
  $('#btn-refresh').innerHTML = glyph('refresh');
  $('#btn-history').innerHTML = glyph('history', 12);
  $('#search-icon').innerHTML = glyph('search', 14);
  $('#search-clear').innerHTML = glyph('closeSm', 14);

  $('#btn-back').addEventListener('click', () => goBack());
  $('#btn-forward').addEventListener('click', () => goForward());
  $('#btn-up').addEventListener('click', () => goUp());
  $('#btn-refresh').addEventListener('click', () => reload(activeTab()));
  $('#btn-back').addEventListener('contextmenu', (e) => (e.preventDefault(), historyMenu(e.currentTarget, -1)));
  $('#btn-forward').addEventListener('contextmenu', (e) => (e.preventDefault(), historyMenu(e.currentTarget, 1)));

  $('#btn-history').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const seen = new Set();
    const items = [];
    for (const t of state.tabs) {
      for (const hst of [...t.history].reverse()) {
        const k = JSON.stringify(hst.loc);
        if (seen.has(k) || hst.loc.type === 'search') continue;
        seen.add(k);
        items.push({ label: pathText(hst.loc), icon: locIcon(hst.loc), click: () => navigate(activeTab(), hst.loc) });
      }
    }
    showMenu({ anchor: address.getBoundingClientRect() }, items.slice(0, 15), { className: 'scroll' });
  });

  // Click on empty space in the address bar → edit mode
  crumbs.addEventListener('mousedown', (e) => {
    if (e.target === crumbs) {
      e.preventDefault();
      beginEdit();
    }
  });
  address.addEventListener('mousedown', (e) => {
    if (e.target === address) {
      e.preventDefault();
      beginEdit();
    }
  });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      endEdit();
      import('./fileview.js').then((m) => m.focusView());
    } else if (e.key === 'ArrowDown' && document.querySelector('.menu.suggest')) {
      e.preventDefault();
      document.querySelector('.menu.suggest').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      document.querySelector('.menu.suggest')?.focus();
    } else if ((e.metaKey || e.ctrlKey) && ['c', 'v', 'x', 'a', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      api.edit({ c: 'copy', v: 'paste', x: 'cut', a: 'selectAll', z: e.shiftKey ? 'redo' : 'undo' }[e.key.toLowerCase()]);
    }
  });
  input.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(suggest, 150);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== input && !document.querySelector('.menu.suggest:hover')) endEdit();
    }, 150);
  });

  // Search
  searchInput.addEventListener('input', () => {
    searchBox.classList.toggle('has-text', !!searchInput.value);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 500);
  });
  searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (searchInput.value) {
        searchInput.value = '';
        searchBox.classList.remove('has-text');
        runSearch();
      } else import('./fileview.js').then((m) => m.focusView());
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      import('./fileview.js').then((m) => m.focusView());
    } else if ((e.metaKey || e.ctrlKey) && ['c', 'v', 'x', 'a', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      api.edit({ c: 'copy', v: 'paste', x: 'cut', a: 'selectAll', z: e.shiftKey ? 'redo' : 'undo' }[e.key.toLowerCase()]);
    }
  });
  $('#search-clear').addEventListener('click', () => {
    searchInput.value = '';
    searchBox.classList.remove('has-text');
    runSearch();
    searchInput.focus();
  });

  // Resizable search box
  $('#search-splitter').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = searchBox.offsetWidth;
    const move = (ev) => {
      const w = Math.max(140, Math.min(innerWidth * 0.5, startW - (ev.clientX - startX)));
      searchBox.style.width = `${w}px`;
    };
    const up = () => {
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
      renderCrumbs();
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });

  const refresh = () => {
    renderCrumbs();
    updateButtons();
    updateSearchPlaceholder();
  };
  on('location', (t) => t.id === state.activeId && refresh());
  on('tab-activated', refresh);
  on('loading', (t) => t.id === state.activeId && updateButtons());
  let crumbW = 0;
  new ResizeObserver(() => {
    if (address.clientWidth === crumbW) return;
    crumbW = address.clientWidth;
    requestAnimationFrame(renderCrumbs);
  }).observe(address);
}
