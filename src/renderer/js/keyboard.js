// Global keyboard shortcuts. Windows bindings work with either Ctrl or ⌘, plus a few
// Finder habits (⌘⌫ delete, ⌘[ / ⌘] back/forward, ⌘↑ parent, ⌘↓ open).
import { state, activeTab, selectedEntries, emit } from './state.js';
import { $ } from './util.js';
import { goBack, goForward, goUp, reload, setView } from './nav.js';
import { isOpen as menuOpen } from './menu.js';
import { modalOpen } from './dialogs.js';
import * as actions from './actions.js';
import * as fv from './fileview.js';
import * as tabs from './tabs.js';
import { beginEdit, focusSearch } from './addressbar.js';
import { expandToCurrent } from './sidebar.js';

const api = window.api;

function isEditable(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function contextMenuForFocus() {
  const tab = activeTab();
  if (tab.loc.type !== 'folder' && tab.loc.type !== 'search') return;
  const sel = selectedEntries(tab);
  const L = fv.currentLayout();
  const vp = $('#viewport').getBoundingClientRect();
  if (sel.length && tab.focus && L?.rect.has(tab.focus)) {
    const node = document.querySelector(`#canvas .item[data-path="${CSS.escape(tab.focus)}"]`);
    const r = node ? node.getBoundingClientRect() : vp;
    actions.itemMenu({ x: r.left + 24, y: r.top + r.height - 4, keyboard: true });
  } else {
    actions.backgroundMenu({ x: vp.left + 40, y: vp.top + 40, keyboard: true });
  }
}

function cycleFocus(back) {
  const zones = [$('#sidebar'), activeTab().loc.type === 'home' || activeTab().loc.type === 'thispc' ? $('#page') : $('#viewport'), $('#address-input'), $('#search-input')];
  const cur = zones.findIndex((z) => z.contains(document.activeElement));
  const next = zones[(cur + (back ? -1 : 1) + zones.length) % zones.length];
  if (next.id === 'address-input') beginEdit();
  else next.focus();
}

export function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F6'].includes(e.key)) document.body.classList.add('kbd');
    if (modalOpen() || menuOpen()) return;
    const mod = e.metaKey || e.ctrlKey;
    const code = e.code;
    const target = e.target;

    if (isEditable(target)) {
      if (mod && ['KeyC', 'KeyV', 'KeyX', 'KeyA', 'KeyZ', 'KeyY'].includes(code)) {
        e.preventDefault();
        const cmd = { KeyC: 'copy', KeyV: 'paste', KeyX: 'cut', KeyA: 'selectAll', KeyZ: e.shiftKey ? 'redo' : 'undo', KeyY: 'redo' }[code];
        api.edit(cmd);
      }
      return;
    }

    const tab = activeTab();
    const inList = tab.loc.type === 'folder' || tab.loc.type === 'search';
    const run = (fn) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };

    // ---- tabs & windows
    if (mod && code === 'KeyT' && !e.shiftKey) return run(() => tabs.addTab());
    if (mod && code === 'KeyW') return run(() => tabs.closeTab(state.activeId));
    if (mod && code === 'KeyN' && !e.shiftKey) return run(() => api.newWindow(tab.loc.type === 'folder' ? tab.loc.path : ''));
    if (e.ctrlKey && e.key === 'Tab') return run(() => tabs.cycleTab(e.shiftKey ? -1 : 1));
    if (e.metaKey && e.shiftKey && (e.key === ']' || e.key === '}')) return run(() => tabs.cycleTab(1));
    if (e.metaKey && e.shiftKey && (e.key === '[' || e.key === '{')) return run(() => tabs.cycleTab(-1));
    if (mod && !e.shiftKey && !e.altKey && /^Digit[1-9]$/.test(code)) return run(() => tabs.selectTabIndex(Number(code.slice(5))));

    // ---- views
    if (mod && e.shiftKey && /^Digit[1-8]$/.test(code) && inList) {
      const mode = fv.MODES[Number(code.slice(5)) - 1];
      return run(() => setView(tab, { mode: mode.id }));
    }

    // ---- navigation
    if ((e.altKey && e.key === 'ArrowLeft') || (e.metaKey && e.key === '[')) return run(() => goBack());
    if ((e.altKey && e.key === 'ArrowRight') || (e.metaKey && e.key === ']')) return run(() => goForward());
    if ((e.altKey && e.key === 'ArrowUp') || (e.metaKey && e.key === 'ArrowUp')) return run(() => goUp());
    if (e.metaKey && e.key === 'ArrowDown') {
      const sel = selectedEntries(tab);
      if (sel.length) return run(() => actions.openEntries(sel));
    }
    if (e.key === 'Backspace' && !mod && !e.altKey) return run(() => goBack());
    if (e.key === 'F5' || (mod && code === 'KeyR')) return run(() => reload(tab));
    if (e.key === 'F3' || (mod && (code === 'KeyF' || code === 'KeyE') && !e.shiftKey)) return run(focusSearch);
    if (e.key === 'F4' || (e.altKey && code === 'KeyD') || (mod && code === 'KeyL')) return run(beginEdit);
    if (e.key === 'F6') return run(() => cycleFocus(e.shiftKey));
    if (e.key === 'F11') return run(() => api.windowControl('fullscreen'));
    if (mod && e.shiftKey && code === 'KeyE') return run(expandToCurrent);

    // ---- panes
    if (e.altKey && e.shiftKey && code === 'KeyP') return run(() => actions.togglePane('details'));
    if (e.altKey && !e.shiftKey && code === 'KeyP') return run(() => actions.togglePane('preview'));

    // ---- properties / menus
    if (e.altKey && e.key === 'Enter') return run(() => actions.showProperties());
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') return run(contextMenuForFocus);

    if (!inList) return;

    // ---- file operations
    if (mod && e.shiftKey && code === 'KeyN') return run(actions.newFolder);
    if (mod && e.shiftKey && code === 'KeyC') return run(() => actions.copyPath());
    if (mod && !e.shiftKey && code === 'KeyC') return run(actions.copy);
    if (mod && code === 'KeyX') return run(actions.cut);
    if (mod && code === 'KeyV') return run(() => actions.paste());
    if (mod && code === 'KeyZ' && !e.shiftKey) return run(actions.undo);
    if (mod && (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey))) return run(actions.redo);
    if (mod && code === 'KeyA') return run(fv.selectAll);
    if (e.key === 'F2') return run(actions.renameSelected);
    if (e.key === 'Delete') return run(() => actions.deleteSelected(e.shiftKey));
    if (e.metaKey && e.key === 'Backspace') return run(() => actions.deleteSelected(e.altKey));
    if (e.key === 'Escape' && state.clipboard.cut) {
      state.clipboard = { paths: [], cut: false, set: new Set() };
      return run(() => emit('clipboard'));
    }
  });

  document.addEventListener('mousedown', () => document.body.classList.remove('kbd'));
}
