// Dialogs: Windows 11 content dialogs, classic Win32 windows (Properties, Folder Options,
// file conflicts) and the copy/move progress window.
import { h, esc, formatSize, formatSizeFull, formatDate, formatDateLong, typeName, dirname, basename, category, fileUrl } from './util.js';
import { fileSVG, glyph, CAPTION } from './icons.js';
import { state, saveSettings } from './state.js';
import { displayName } from './nav.js';

const api = window.api;
const overlay = () => document.getElementById('overlay-root');

let modalDepth = 0;
export function modalOpen() {
  return modalDepth > 0;
}

// ---------------- content dialog ----------------

export function confirm({ title, text, html, entry, buttons, cancelValue = null }) {
  return new Promise((resolve) => {
    modalDepth++;
    const back = h('div', { class: 'modal-backdrop' });
    const body = h('div', { class: 'cd-body' }, h('h2', { class: 'cd-title', text: title }), h('div', { class: 'cd-text', html: html || esc(text || '') }));
    if (entry) {
      const sub = entry.isDir ? `Date created: ${formatDate(entry.ctime)}` : `${typeName(entry)}<br>Size: ${formatSize(entry.size)}<br>Date modified: ${formatDate(entry.mtime)}`;
      body.append(h('div', { class: 'cd-file' }, h('div', { html: fileSVG(entry, 48) }), h('div', { html: `${esc(entry.name)}<div class="sub">${sub}</div>` })));
    }
    const foot = h('div', { class: 'cd-foot' });
    const done = (v) => {
      modalDepth--;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    let primaryBtn = null;
    for (const b of buttons) {
      const btn = h('button', { class: `btn${b.primary ? ' primary' : ''}`, text: b.label, onclick: () => done(b.value) });
      if (b.primary) primaryBtn = btn;
      foot.append(btn);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(cancelValue);
      }
      if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        e.stopPropagation();
        done(buttons.find((b) => b.primary)?.value ?? cancelValue);
      }
    };
    document.addEventListener('keydown', onKey, true);
    back.append(h('div', { class: 'cdialog', role: 'dialog' }, body, foot));
    overlay().append(back);
    (primaryBtn || foot.firstChild).focus();
  });
}

export function alert(title, text) {
  return confirm({ title, text, buttons: [{ label: 'OK', value: true, primary: true }], cancelValue: true });
}

// ---------------- classic window frame ----------------

function classicWindow({ title, icon, width, height, modal = true, onClose }) {
  const win = h('div', { class: 'classic', style: { width: `${width}px`, height: height ? `${height}px` : 'auto' } });
  const closeBtn = h('button', { class: 'cap-btn cap-close', html: CAPTION.close });
  const bar = h('div', { class: 'cw-title' }, icon ? h('span', { html: icon }) : null, h('span', { class: 't', text: title }), closeBtn);
  const body = h('div', { class: 'cw-body' });
  const foot = h('div', { class: 'cw-foot' });
  win.append(bar, body, foot);
  let back = null;
  if (modal) {
    modalDepth++;
    back = h('div', { class: 'modal-backdrop clear' });
    back.append(win);
    overlay().append(back);
    win.style.position = 'fixed';
  } else {
    overlay().append(win);
  }
  // center
  requestAnimationFrame(() => {
    if (!win.dataset.placed) {
      const r = win.getBoundingClientRect();
      win.style.left = `${Math.max(8, (innerWidth - r.width) / 2)}px`;
      win.style.top = `${Math.max(8, (innerHeight - r.height) / 2)}px`;
    }
  });
  // drag by title bar
  bar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const r = win.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    win.dataset.placed = '1';
    win.style.right = 'auto';
    win.style.bottom = 'auto';
    const move = (ev) => {
      win.style.left = `${ev.clientX - dx}px`;
      win.style.top = `${Math.max(0, ev.clientY - dy)}px`;
    };
    const up = () => {
      removeEventListener('mousemove', move);
      removeEventListener('mouseup', up);
    };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });
  const close = () => {
    if (win.dataset.closed) return;
    win.dataset.closed = '1';
    if (modal) modalDepth--;
    (back || win).remove();
    onClose?.();
  };
  closeBtn.addEventListener('click', close);
  return { win, body, foot, close };
}

function tabs(body, names) {
  const bar = h('div', { class: 'tabs' });
  const panels = names.map(() => h('div', { class: 'panel' }));
  names.forEach((n, i) => {
    const b = h('button', { text: n, class: i === 0 ? 'active' : '' });
    b.addEventListener('click', () => {
      bar.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      panels.forEach((p, k) => (p.style.display = k === i ? '' : 'none'));
    });
    bar.append(b);
  });
  panels.forEach((p, k) => (p.style.display = k === 0 ? '' : 'none'));
  body.append(bar, ...panels);
  return panels;
}

const row = (k, v) => h('div', { class: 'prop-row' }, h('div', { text: k }), v instanceof Node ? v : h('div', { class: 'v', text: v ?? '' }));
const sep = () => h('div', { class: 'prop-sep' });

// ---------------- Properties ----------------

let sizeSeq = 0;

export function properties(entries) {
  if (!entries.length) return;
  const single = entries.length === 1 ? entries[0] : null;
  const title = single ? `${single.name} Properties` : `${entries[0].name}, ... Properties`;
  const sizeId = `sz${++sizeSeq}`;
  let off = null;
  const { body, foot, close } = classicWindow({
    title,
    icon: single ? fileSVG(single, 16) : glyph('properties'),
    width: 380,
    height: 500,
    onClose: () => {
      api.sizeCancel(sizeId);
      off?.();
    },
  });
  const [general, details] = tabs(body, ['General', 'Details']);

  const hasDirs = entries.some((e) => e.isDir || e.isPackage);
  const sizeEl = h('div', { class: 'v' });
  const containsEl = h('div', { class: 'v' });
  const fileBytes = entries.filter((e) => !e.isDir && !e.isPackage).reduce((s, e) => s + e.size, 0);
  sizeEl.textContent = formatSizeFull(fileBytes);

  let nameInput = null;
  if (single) {
    nameInput = h('input', { value: single.name, spellcheck: 'false' });
    general.append(h('div', { class: 'prop-head' }, h('div', { html: fileSVG(single, 32) }), nameInput));
    general.append(sep());
    general.append(row('Type:', single.isDir ? 'File folder' : `${typeName(single)}${single.ext ? ` (.${single.ext})` : ''}`));
    general.append(sep());
    general.append(row('Location:', dirname(single.path)));
    general.append(h('div', { class: 'prop-row' }, h('div', { text: 'Size:' }), sizeEl));
    if (single.isDir || single.isPackage) general.append(h('div', { class: 'prop-row' }, h('div', { text: 'Contains:' }), containsEl));
    general.append(sep());
    general.append(row('Created:', formatDateLong(single.ctime)));
    general.append(row('Modified:', formatDateLong(single.mtime)));
    general.append(row('Accessed:', formatDateLong(single.atime)));
  } else {
    const files = entries.filter((e) => !e.isDir).length;
    const folders = entries.length - files;
    const types = new Set(entries.map((e) => typeName(e)));
    general.append(h('div', { class: 'prop-head' }, h('div', { html: fileSVG(entries[0], 32) }), h('div', { text: `${files} Files, ${folders} Folders` })));
    general.append(sep());
    general.append(row('Type:', types.size === 1 ? `All of type ${[...types][0]}` : 'Multiple Types'));
    const dirs = new Set(entries.map((e) => dirname(e.path)));
    general.append(row('Location:', dirs.size === 1 ? `All in ${[...dirs][0]}` : 'Various folders'));
    general.append(h('div', { class: 'prop-row' }, h('div', { text: 'Size:' }), sizeEl));
    if (hasDirs) general.append(h('div', { class: 'prop-row' }, h('div', { text: 'Contains:' }), containsEl));
  }
  general.append(sep());
  const ro = h('input', { type: 'checkbox', disabled: true });
  ro.checked = entries.every((e) => e.readonly);
  const hid = h('input', { type: 'checkbox', disabled: true });
  hid.checked = entries.every((e) => e.hidden);
  general.append(h('div', { class: 'prop-row' }, h('div', { text: 'Attributes:' }), h('div', {}, h('label', { class: 'chk-row' }, ro, 'Read-only'), h('label', { class: 'chk-row' }, hid, 'Hidden'))));

  if (hasDirs) {
    sizeEl.textContent = 'Calculating...';
    off = api.on('size-progress', (p) => {
      if (p.id !== sizeId) return;
      sizeEl.textContent = formatSizeFull(p.size);
      containsEl.textContent = `${p.files.toLocaleString()} Files, ${p.folders.toLocaleString()} Folders`;
    });
    api.sizeStart(sizeId, entries.map((e) => e.path));
  }

  // Details tab
  const table = h('table', { class: 'details-table' }, h('tr', {}, h('th', { text: 'Property' }), h('th', { text: 'Value' })));
  const addRow = (k, v) => table.append(h('tr', {}, h('td', { text: k }), h('td', { text: v ?? '' })));
  const addSection = (k) => table.append(h('tr', { class: 'section' }, h('td', { text: k, colspan: '2' })));
  if (single) {
    addSection('File');
    addRow('Name', single.name);
    addRow('Item type', typeName(single));
    addRow('Folder path', dirname(single.path));
    addRow('Date created', formatDate(single.ctime));
    addRow('Date modified', formatDate(single.mtime));
    if (!single.isDir) addRow('Size', formatSize(single.size));
    addRow('Attributes', `${single.readonly ? 'R' : ''}${single.hidden ? 'H' : ''}${!single.readonly && !single.hidden ? 'A' : ''}`);
    if (category(single) === 'image') {
      const img = new Image();
      img.onload = () => {
        addSection('Image');
        addRow('Dimensions', `${img.naturalWidth} x ${img.naturalHeight}`);
        addRow('Width', `${img.naturalWidth} pixels`);
        addRow('Height', `${img.naturalHeight} pixels`);
      };
      img.src = fileUrl(single.path);
    }
  } else {
    addRow('Items', String(entries.length));
  }
  details.append(table);

  const apply = async () => {
    if (single && nameInput && nameInput.value.trim() && nameInput.value !== single.name) {
      const { renameEntry } = await import('./actions.js');
      await renameEntry(single, nameInput.value.trim());
    }
  };
  const ok = h('button', { class: 'cbtn default', text: 'OK', onclick: async () => (await apply(), close()) });
  const cancel = h('button', { class: 'cbtn', text: 'Cancel', onclick: close });
  const applyBtn = h('button', { class: 'cbtn', text: 'Apply', disabled: true, onclick: async () => (await apply(), (applyBtn.disabled = true)) });
  nameInput?.addEventListener('input', () => (applyBtn.disabled = false));
  foot.append(ok, cancel, applyBtn);
  const onKey = (e) => {
    if (!document.body.contains(foot)) return document.removeEventListener('keydown', onKey, true);
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter') {
      e.stopPropagation();
      ok.click();
    } else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey, true);
  ok.focus();
}

// ---------------- Folder Options ----------------

export function folderOptions() {
  const s = state.settings;
  const { body, foot, close } = classicWindow({ title: 'Folder Options', icon: glyph('options'), width: 400, height: 440 });
  const [general, view] = tabs(body, ['General', 'View']);

  const openTo = h('select', { class: 'csel' }, h('option', { value: 'home', text: 'Home' }), h('option', { value: 'thispc', text: 'This PC' }));
  openTo.value = s.openTo;
  general.append(h('div', { class: 'prop-row', style: { gridTemplateColumns: '170px 1fr', alignItems: 'center' } }, h('div', { text: 'Open File Explorer to:' }), openTo));
  const clearBtn = h('button', { class: 'cbtn', text: 'Clear', onclick: () => saveSettings({ recent: [] }) });
  general.append(
    h('div', { class: 'opt-group' }, h('span', { class: 'legend', text: 'Privacy' }), h('div', { class: 'chk-row' }, 'Clear File Explorer history'), h('div', { style: { marginTop: '6px' } }, clearBtn)),
  );

  const mk = (label, checked) => {
    const c = h('input', { type: 'checkbox' });
    c.checked = checked;
    view.append(h('label', { class: 'chk-row' }, c, label));
    return c;
  };
  view.append(h('div', { style: { marginBottom: '8px', color: 'var(--text-2)' }, text: 'Advanced settings:' }));
  const hidden = mk('Show hidden files, folders, and drives', s.showHidden);
  const hideExt = mk('Hide extensions for known file types', !s.showExtensions);
  const checks = mk('Use check boxes to select items', s.checkboxes);
  const compact = mk('Decrease space between items (compact view)', s.compact);

  const apply = () =>
    saveSettings({
      openTo: openTo.value,
      showHidden: hidden.checked,
      showExtensions: !hideExt.checked,
      checkboxes: checks.checked,
      compact: compact.checked,
    });
  foot.append(
    h('button', { class: 'cbtn default', text: 'OK', onclick: () => (apply(), close()) }),
    h('button', { class: 'cbtn', text: 'Cancel', onclick: close }),
    h('button', { class: 'cbtn', text: 'Apply', onclick: apply }),
  );
}

// ---------------- Replace or Skip ----------------

export function conflictDialog({ op, total, fromDir, toDir, conflicts }) {
  return new Promise((resolve) => {
    const verb = op === 'move' ? 'Moving' : 'Copying';
    let deciding = false;
    const { body, close } = classicWindow({
      title: 'Replace or Skip Files',
      width: 440,
      onClose: () => {
        if (!deciding) resolve(null);
      },
    });
    const n = conflicts.length;
    const finish = (val) => {
      resolve(val);
      close();
    };
    const opt = (icon, label, val) => {
      const b = h('div', { class: 'conflict-opt', html: `${glyph(icon, 20, 1.3)}<span>${label}</span>` });
      b.addEventListener('click', () => (typeof val === 'function' ? val() : finish(val)));
      return b;
    };
    body.append(
      h(
        'div',
        { class: 'conflict-main' },
        h('div', { class: 'from', html: `${verb} ${total} item${total === 1 ? '' : 's'} from <b>${esc(displayName(fromDir))}</b> to <b>${esc(displayName(toDir))}</b>` }),
        h('div', { class: 'headline', text: n === 1 ? `The destination already has a ${conflicts[0].isDir ? 'folder' : 'file'} named "${basename(conflicts[0].dest)}"` : `The destination has ${n} files with the same names` }),
        opt('check', n === 1 ? (conflicts[0].isDir ? 'Merge the folders' : 'Replace the file in the destination') : 'Replace the files in the destination', { mode: 'replace' }),
        opt('redo', n === 1 ? 'Skip this file' : 'Skip these files', { mode: 'skip' }),
        opt('copy', n === 1 ? 'Compare info for both files' : 'Let me decide for each file', () => {
          deciding = true;
          close();
          decideEach({ op, fromDir, toDir, conflicts }).then(resolve);
        }),
      ),
    );
    body.style.padding = '14px 18px 18px';
  });
}

function decideEach({ fromDir, toDir, conflicts }) {
  return new Promise((resolve) => {
    const { body, foot, close } = classicWindow({ title: `${conflicts.length} File Conflict${conflicts.length > 1 ? 's' : ''}`, width: 620, height: 520, onClose: () => resolve(null) });
    body.append(h('div', { style: { fontSize: '15px', margin: '4px 0 6px' }, text: 'Which files do you want to keep?' }));
    body.append(h('div', { style: { color: 'var(--text-2)', marginBottom: '10px' }, text: 'If you select both versions, the copied file will have a number added to its name.' }));
    const list = h('div', { class: 'panel file-conflicts' });
    const leftAll = h('input', { type: 'checkbox' });
    const rightAll = h('input', { type: 'checkbox' });
    list.append(h('div', { class: 'cols' }, h('label', { class: 'colhead' }, leftAll, h('span', { html: `Files from <b>${esc(displayName(fromDir))}</b>` })), h('label', { class: 'colhead' }, rightAll, h('span', { html: `Files already in <b>${esc(displayName(toDir))}</b>` }))));
    const rows = conflicts.map((c) => {
      const l = h('input', { type: 'checkbox' });
      const r = h('input', { type: 'checkbox' });
      const side = (cb, info, newer) =>
        h(
          'label',
          { class: 'fc-side' },
          cb,
          h('div', { html: fileSVG(info, 32) }),
          h('div', { class: 'info', html: `${esc(formatDate(info.mtime))}${newer ? ' <span class="sub">(newer)</span>' : ''}<div class="sub">${info.isDir ? 'Folder' : esc(formatSize(info.size))}</div>` }),
        );
      list.append(
        h('div', { class: 'fc-row' }, h('div', { class: 'fname', text: basename(c.dest) }), h('div', { class: 'cols' }, side(l, c.srcInfo, c.srcInfo.mtime > c.destInfo.mtime), side(r, c.destInfo, c.destInfo.mtime > c.srcInfo.mtime))),
      );
      return { c, l, r };
    });
    leftAll.addEventListener('change', () => rows.forEach((x) => (x.l.checked = leftAll.checked)));
    rightAll.addEventListener('change', () => rows.forEach((x) => (x.r.checked = rightAll.checked)));
    body.append(list);
    let done = false;
    const cont = h('button', {
      class: 'cbtn default',
      text: 'Continue',
      onclick: () => {
        const perFile = new Map();
        for (const { c, l, r } of rows) {
          // Neither checked = skip (Windows asks again; skipping is the safe choice)
          perFile.set(c.src, l.checked && r.checked ? 'keepboth' : l.checked ? 'replace' : 'skip');
        }
        done = true;
        resolve({ mode: 'decide', perFile });
        close();
      },
    });
    foot.append(cont, h('button', { class: 'cbtn', text: 'Cancel', onclick: () => (done ? null : (resolve(null), close())) }));
  });
}

// ---------------- copy / move progress window ----------------

const progress = {
  win: null,
  jobs: new Map(), // id -> { meta, el, data, samples, resolve, shown, expanded }
};

function ensureProgressWindow() {
  if (progress.win) return progress.win;
  const w = classicWindow({
    title: '0% complete',
    width: 440,
    modal: false,
    onClose: () => {
      for (const id of progress.jobs.keys()) api.jobControl(id, 'cancel');
      progress.win = null;
    },
  });
  w.win.classList.add('progress-win');
  w.win.style.left = 'auto';
  w.win.style.top = 'auto';
  w.win.style.right = '24px';
  w.win.style.bottom = '40px';
  w.win.dataset.placed = '1';
  progress.win = w;
  return w;
}

function updateTitle() {
  if (!progress.win) return;
  const t = progress.win.win.querySelector('.cw-title .t');
  const jobs = [...progress.jobs.values()].filter((j) => j.shown);
  if (jobs.length === 1) t.textContent = `${Math.floor(pct(jobs[0].data))}% complete`;
  else t.textContent = `${jobs.length} operations running`;
}

function pct(d) {
  if (!d || !d.totalBytes) return d && d.totalItems ? (100 * (d.itemsDone || 0)) / d.totalItems : 0;
  return Math.min(100, (100 * d.bytesDone) / d.totalBytes);
}

function showJob(job) {
  const w = ensureProgressWindow();
  job.shown = true;
  const { meta } = job;
  const verb = meta.op === 'move' ? 'Moving' : 'Copying';
  const el = h('div', { class: 'pw-job' });
  const desc = h('div', { class: 'pw-desc', html: `${verb} ${meta.count} item${meta.count === 1 ? '' : 's'} from <b>${esc(displayName(meta.from))}</b> to <b>${esc(displayName(meta.to))}</b>` });
  const pctEl = h('div', { class: 'pw-pct', text: '0% complete' });
  const bar = h('div', { class: 'pw-bar' }, h('div', { style: { width: '0%' } }));
  const pause = h('button', { class: 'icon-btn small', html: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="2.5" height="10"/><rect x="9.5" y="3" width="2.5" height="10"/></svg>', 'data-tip': 'Pause' });
  const cancel = h('button', { class: 'icon-btn small', html: glyph('close', 14), 'data-tip': 'Cancel' });
  const graph = h('div', { class: 'pw-graph' }, h('canvas'), h('span', { class: 'speed' }));
  const info = h('div', { class: 'pw-info' });
  const toggle = h('button', { class: 'pw-toggle', html: `${glyph('chevD', 12)}<span>More details</span>` });
  job.expanded = false;
  graph.style.display = 'none';
  info.style.display = 'none';
  toggle.addEventListener('click', () => {
    job.expanded = !job.expanded;
    graph.style.display = info.style.display = job.expanded ? '' : 'none';
    toggle.innerHTML = `${glyph(job.expanded ? 'chevU' : 'chevD', 12)}<span>${job.expanded ? 'Fewer details' : 'More details'}</span>`;
    render(job);
  });
  pause.addEventListener('click', () => {
    job.paused = !job.paused;
    api.jobControl(job.id, job.paused ? 'pause' : 'resume');
    pause.innerHTML = job.paused
      ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5Z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="2.5" height="10"/><rect x="9.5" y="3" width="2.5" height="10"/></svg>';
    bar.classList.toggle('paused', job.paused);
  });
  cancel.addEventListener('click', () => api.jobControl(job.id, 'cancel'));
  el.append(desc, pctEl, h('div', { class: 'pw-row' }, bar, pause, cancel), graph, info, toggle);
  job.el = { root: el, pctEl, bar, graph, info };
  w.body.append(el);
  render(job);
}

function render(job) {
  if (!job.shown) return;
  const d = job.data || {};
  const p = pct(d);
  job.el.pctEl.textContent = d.phase === 'counting' ? 'Calculating...' : `${Math.floor(p)}% complete`;
  job.el.bar.firstChild.style.width = `${p}%`;
  if (d.speed != null && d.phase === 'running') {
    job.samples.push([p, d.speed]);
  }
  if (job.expanded) {
    const remainingBytes = Math.max(0, (d.totalBytes || 0) - (d.bytesDone || 0));
    const secs = d.speed > 0 ? remainingBytes / d.speed : 0;
    job.el.info.innerHTML =
      `<span class="k">Name:</span><span>${esc(d.current || '')}</span>` +
      `<span class="k">Time remaining:</span><span>${d.phase === 'counting' ? 'Calculating...' : formatDuration(secs)}</span>` +
      `<span class="k">Items remaining:</span><span>${Math.max(0, (d.totalItems || 0) - (d.itemsDone || 0)).toLocaleString()} (${formatSize(remainingBytes)})</span>`;
    job.el.graph.querySelector('.speed').textContent = d.speed ? `Speed: ${formatSize(Math.round(d.speed))}/s` : '';
    drawGraph(job.el.graph.querySelector('canvas'), job.samples, p);
  }
  updateTitle();
}

function drawGraph(canvas, samples, p) {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const hgt = canvas.clientHeight;
  if (!w) return;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, hgt);
  // completed area background
  ctx.fillStyle = 'rgba(6,176,37,0.12)';
  ctx.fillRect(0, 0, (w * p) / 100, hgt);
  if (!samples.length) return;
  const max = Math.max(...samples.map((s) => s[1])) * 1.25 || 1;
  ctx.beginPath();
  ctx.moveTo(0, hgt);
  for (const [x, v] of samples) ctx.lineTo((w * x) / 100, hgt - (hgt * v) / max);
  const last = samples[samples.length - 1];
  ctx.lineTo((w * last[0]) / 100, hgt);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,176,37,0.55)';
  ctx.fill();
  // current speed line
  const y = hgt - (hgt * last[1]) / max;
  ctx.strokeStyle = getComputedStyle(document.body).color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + 0.5);
  ctx.lineTo(w, y + 0.5);
  ctx.stroke();
}

function formatDuration(s) {
  if (!isFinite(s) || s <= 0) return 'Calculating...';
  if (s < 60) return `About ${Math.max(1, Math.round(s))} second${Math.round(s) === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  if (m < 60) return `About ${m} minute${m === 1 ? '' : 's'}`;
  const hr = Math.floor(m / 60);
  return `About ${hr} hour${hr === 1 ? '' : 's'} and ${m % 60} minutes`;
}

let progressListening = false;
function listenProgress() {
  if (progressListening) return;
  progressListening = true;
  api.on('job-progress', (d) => {
    const job = progress.jobs.get(d.id);
    if (!job) return;
    job.data = d;
    if (job.shown) render(job);
  });
  api.on('job-done', (d) => {
    const job = progress.jobs.get(d.id);
    if (!job) return;
    clearTimeout(job.timer);
    progress.jobs.delete(d.id);
    if (job.shown) {
      job.el.root.remove();
      if (![...progress.jobs.values()].some((j) => j.shown) && progress.win) {
        const w = progress.win;
        progress.win = null;
        w.close();
      } else updateTitle();
    }
    job.resolve(d);
  });
}

// Track a running transfer; the window only appears for operations that take a while.
export function trackJob(id, meta) {
  listenProgress();
  return new Promise((resolve) => {
    const job = { id, meta, data: null, samples: [], resolve, shown: false };
    progress.jobs.set(id, job);
    job.timer = setTimeout(() => {
      if (progress.jobs.has(id)) showJob(job);
    }, 900);
  });
}

