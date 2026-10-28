// The Windows 11 command bar (replaces the old Ribbon). Contents depend on the location
// and selection: New, clipboard + item commands, Sort, View, contextual tools, "See more".
import { state, on, activeTab, selectedEntries } from './state.js';
import { $, h } from './util.js';
import { glyph, NEW_ICON } from './icons.js';
import { isTrash, search } from './nav.js';
import { showMenu } from './menu.js';
import * as actions from './actions.js';

const api = window.api;
const bar = $('#commandbar');
let clipAvailable = false;

async function refreshClip() {
  const had = clipAvailable;
  clipAvailable = await actions.hasClipboardFiles();
  if (had !== clipAvailable) render();
}

function btn({ icon, label, tip, disabled, click, dropdown, cls = '', on: isOn }) {
  const b = h('button', { class: `cmd ${cls}${isOn ? ' on' : ''}`, disabled: disabled || null, 'data-tip': tip || null });
  b.innerHTML = `${icon || ''}${label ? `<span>${label}</span>` : ''}${dropdown ? `<span class="chev">${glyph('chevD', 12)}</span>` : ''}`;
  if (dropdown) {
    b.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || b.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (b.classList.contains('open')) return;
      b.classList.add('open');
      showMenu({ anchor: b.getBoundingClientRect() }, dropdown(), { onClose: () => b.classList.remove('open'), alignRight: cls.includes('right') });
    });
  } else if (click) {
    b.addEventListener('click', (e) => click(e, b));
  }
  return b;
}

const sep = () => h('div', { class: 'cmd-sep' });

export function render() {
  const tab = activeTab();
  if (!tab) return;
  const sel = selectedEntries(tab);
  const loc = tab.loc;
  const trash = isTrash(loc);
  const inFolder = loc.type === 'folder' && !tab.error;
  const modifiable = (inFolder && !trash) || loc.type === 'search';
  const K = actions.K;
  const items = [];

  if (loc.type === 'search') {
    items.push(btn({ icon: glyph('closeSearch'), label: 'Close search', click: () => ((document.getElementById('search-input').value = ''), search(tab, '')) }));
    items.push(sep());
  } else if (trash) {
    items.push(btn({ icon: glyph('emptyBin'), label: 'Empty Recycle Bin', click: actions.emptyTrash }));
    items.push(sep());
  } else {
    items.push(btn({ icon: NEW_ICON, label: 'New', cls: 'primary-new', disabled: !actions.canModifyHere(tab), dropdown: actions.newItems }));
    items.push(sep());
  }

  if (!trash) {
    items.push(btn({ icon: glyph('cut'), tip: `Cut (${K('Ctrl+X')})`, disabled: !sel.length || !modifiable, click: actions.cut }));
    items.push(btn({ icon: glyph('copy'), tip: `Copy (${K('Ctrl+C')})`, disabled: !sel.length, click: actions.copy }));
    items.push(btn({ icon: glyph('paste'), tip: `Paste (${K('Ctrl+V')})`, disabled: !clipAvailable || !actions.canModifyHere(tab), click: () => actions.paste() }));
    items.push(btn({ icon: glyph('rename'), tip: 'Rename (F2)', disabled: !sel.length || !modifiable, click: actions.renameSelected }));
    items.push(
      btn({
        icon: glyph('share'),
        tip: 'Share',
        disabled: !sel.length || sel.some((e) => e.isDir),
        click: (e, b) => {
          const r = b.getBoundingClientRect();
          actions.share(sel, r.left, r.bottom);
        },
      }),
    );
  }
  items.push(btn({ icon: glyph('delete'), tip: trash ? 'Delete permanently' : `Delete (Delete)`, label: trash ? 'Delete' : '', disabled: !sel.length || !(modifiable || trash), click: () => actions.deleteSelected() }));
  items.push(sep());

  const isList = loc.type === 'folder' || loc.type === 'search';
  items.push(btn({ icon: glyph('sort'), label: 'Sort', disabled: !isList, dropdown: () => actions.sortItems(tab) }));
  items.push(btn({ icon: glyph(viewGlyph(tab)), label: 'View', disabled: !isList, dropdown: () => actions.viewItems(tab) }));

  // Contextual tools
  const one = sel.length === 1 ? sel[0] : null;
  if (one && one.ext === 'zip') {
    items.push(sep());
    items.push(btn({ icon: glyph('extract'), label: 'Extract all', click: () => actions.extract(one) }));
  }
  if (one && !one.isDir && ['png', 'jpg', 'jpeg', 'heic', 'gif', 'webp'].includes(one.ext)) {
    items.push(sep());
    items.push(btn({ icon: glyph('open'), label: 'Open', click: () => actions.openPath(one.path) }));
  }

  items.push(sep());
  items.push(btn({ icon: glyph('more'), tip: 'See more', dropdown: actions.moreItems }));
  items.push(h('div', { class: 'cmd-spacer' }));
  items.push(btn({ icon: glyph('detailsPane'), label: 'Details', tip: `Show the details pane (${K('Alt+Shift+P')})`, on: state.settings.pane === 'details', click: () => actions.togglePane('details') }));
  bar.replaceChildren(...items);
}

function viewGlyph(tab) {
  const map = { xl: 'vXL', large: 'vLarge', medium: 'vMedium', small: 'vSmall', list: 'vList', details: 'vDetails', tiles: 'vTiles', content: 'vContent' };
  return map[tab.view?.mode] || 'view';
}

export function initCommandBar() {
  on('selection', (t) => t.id === state.activeId && render());
  on('location', (t) => t.id === state.activeId && render());
  on('tab-activated', render);
  on('view', render);
  on('settings', render);
  on('undo', render);
  on('clipboard', refreshClip);
  on('items', (t) => t.id === state.activeId && render());
  api.on('window-focus', (f) => f && refreshClip());
  refreshClip();
  render();
}
