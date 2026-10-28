// Windows 11 style context menus and flyouts (with submenus + keyboard support).
import { h } from './util.js';
import { glyph } from './icons.js';

let root = null; // the open root menu instance

class Menu {
  constructor({ items, top, parent = null, className = '', onClose }) {
    // Drop empty entries and leading / trailing / doubled separators
    const clean = [];
    for (const it of items.filter(Boolean)) {
      if (it.separator && (!clean.length || clean[clean.length - 1].separator)) continue;
      clean.push(it);
    }
    while (clean.length && clean[clean.length - 1].separator) clean.pop();
    this.items = clean;
    this.top = top;
    this.parent = parent;
    this.child = null;
    this.active = -1;
    this.onClose = onClose;
    this.el = h('div', { class: `menu ${className}`, tabindex: '-1', role: 'menu' });
    this.rows = [];
    this.build();
  }

  build() {
    if (this.top?.length) {
      const bar = h('div', { class: 'menu-top' });
      for (const t of this.top) {
        const b = h('button', { html: t.icon, 'data-tip': t.tip, disabled: t.disabled || null });
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (t.disabled) return;
          closeAll();
          t.click?.();
        });
        bar.append(b);
      }
      this.el.append(bar);
    }
    const hasChecks = this.items.some((i) => i.checked !== undefined || i.radio !== undefined);
    const hasIcons = this.items.some((i) => i.icon);
    this.items.forEach((it, idx) => {
      if (it.separator) {
        this.el.append(h('div', { class: 'menu-sep' }));
        this.rows.push(null);
        return;
      }
      if (it.header) {
        this.el.append(h('div', { class: 'menu-header', text: it.header }));
        this.rows.push(null);
        return;
      }
      const row = h('div', { class: `menu-item${it.disabled ? ' disabled' : ''}`, role: 'menuitem' });
      if (hasChecks) {
        let mark = '';
        if (it.radio) mark = '<div class="radio-dot"></div>';
        else if (it.checked) mark = glyph('check', 14);
        row.append(h('span', { class: 'mi-check', html: mark }));
      }
      if (hasIcons) row.append(h('span', { class: 'mi-icon', html: it.icon || '' }));
      const label = h('span', { class: 'mi-label' });
      if (it.html) label.innerHTML = it.html;
      else label.textContent = it.label;
      row.append(label);
      if (it.key) row.append(h('span', { class: 'mi-key', text: it.key }));
      if (it.submenu) row.append(h('span', { class: 'mi-sub', html: glyph('chevR', 12) }));
      row.addEventListener('mouseenter', () => this.setActive(idx, true));
      row.addEventListener('mousedown', (e) => e.preventDefault());
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activate(idx);
      });
      this.el.append(row);
      this.rows.push(row);
    });
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  selectable(i) {
    const it = this.items[i];
    return it && !it.separator && !it.header && !it.disabled;
  }

  setActive(idx, fromMouse = false) {
    if (this.active >= 0 && this.rows[this.active]) this.rows[this.active].classList.remove('active');
    this.active = idx;
    const row = this.rows[idx];
    if (row) {
      row.classList.add('active');
      row.scrollIntoView({ block: 'nearest' });
    }
    clearTimeout(this.subTimer);
    const it = this.items[idx];
    if (this.child && this.child.ownerIndex !== idx) this.closeChild();
    if (fromMouse && it?.submenu && !it.disabled && !this.child) {
      this.subTimer = setTimeout(() => this.openSub(idx), 220);
    }
  }

  openSub(idx) {
    const it = this.items[idx];
    if (!it?.submenu || it.disabled) return;
    if (this.child?.ownerIndex === idx) return;
    this.closeChild();
    const items = typeof it.submenu === 'function' ? it.submenu() : it.submenu;
    const child = new Menu({ items, parent: this, className: it.subClass || '' });
    child.ownerIndex = idx;
    this.child = child;
    document.body.append(child.el);
    const r = this.rows[idx].getBoundingClientRect();
    placeAt(child.el, r.right + 2, r.top - 5, { flipX: r.left - 2 });
  }

  closeChild() {
    if (this.child) {
      this.child.destroy();
      this.child = null;
    }
  }

  activate(idx) {
    const it = this.items[idx];
    if (!it || it.disabled) return;
    if (it.submenu) {
      this.openSub(idx);
      this.child?.focusFirst();
      return;
    }
    closeAll();
    it.click?.();
  }

  focusFirst() {
    this.el.focus();
    const i = this.items.findIndex((_, k) => this.selectable(k));
    if (i >= 0) this.setActive(i);
  }

  move(dir) {
    const n = this.items.length;
    let i = this.active;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (this.selectable(i)) return this.setActive(i);
    }
  }

  onKey(e) {
    e.stopPropagation();
    if (e.key === 'ArrowDown') this.move(1);
    else if (e.key === 'ArrowUp') this.move(-1);
    else if (e.key === 'ArrowRight') {
      if (this.items[this.active]?.submenu) {
        this.openSub(this.active);
        this.child?.focusFirst();
      }
    } else if (e.key === 'ArrowLeft' || (e.key === 'Escape' && this.parent)) {
      if (this.parent) {
        const p = this.parent;
        p.closeChild();
        p.el.focus();
      } else if (e.key === 'Escape') closeAll();
    } else if (e.key === 'Escape') closeAll();
    else if (e.key === 'Enter' || e.key === ' ') {
      if (this.active >= 0) this.activate(this.active);
    } else if (e.key.length === 1) {
      // First-letter access
      const ch = e.key.toLowerCase();
      const i = this.items.findIndex((it, k) => this.selectable(k) && (it.label || '').toLowerCase().startsWith(ch));
      if (i >= 0) this.activate(i);
    } else return;
    e.preventDefault();
  }

  destroy() {
    this.closeChild();
    clearTimeout(this.subTimer);
    this.el.remove();
  }
}

function placeAt(el, x, y, { flipX = null, flipY = null } = {}) {
  el.style.left = '0px';
  el.style.top = '0px';
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (left + r.width > vw - 4) left = flipX != null ? flipX - r.width : vw - r.width - 4;
  if (top + r.height > vh - 4) {
    if (flipY != null && flipY - r.height >= 4) {
      top = flipY - r.height;
      el.classList.add('up');
    } else top = Math.max(4, vh - r.height - 4);
  }
  el.style.left = `${Math.max(4, left)}px`;
  el.style.top = `${Math.max(4, top)}px`;
}

function onDocDown(e) {
  if (!root) return;
  if (e.target.closest?.('.menu')) return;
  closeAll();
}

export function closeAll() {
  if (!root) return;
  const r = root;
  root = null;
  r.destroy();
  document.removeEventListener('mousedown', onDocDown, true);
  window.removeEventListener('blur', closeAll);
  window.removeEventListener('resize', closeAll);
  r.onClose?.();
  r.restoreFocus?.focus?.({ preventScroll: true });
}

export function isOpen() {
  return !!root;
}

/**
 * showMenu({ x, y } | { anchor: DOMRect }, items, { top, onClose, className, keyboard })
 */
export function showMenu(pos, items, opts = {}) {
  closeAll();
  const m = new Menu({ items, top: opts.top, className: opts.className || '', onClose: opts.onClose });
  m.restoreFocus = document.activeElement;
  root = m;
  document.body.append(m.el);
  if (pos.anchor) {
    const a = pos.anchor;
    placeAt(m.el, opts.alignRight ? a.right - m.el.offsetWidth : a.left, a.bottom + 2, { flipY: a.top - 2 });
  } else {
    placeAt(m.el, pos.x, pos.y, { flipX: pos.x, flipY: pos.y });
  }
  m.el.focus({ preventScroll: true });
  if (opts.keyboard) m.focusFirst();
  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true);
    window.addEventListener('blur', closeAll);
    window.addEventListener('resize', closeAll);
  });
  return m;
}
