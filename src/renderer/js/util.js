// Small DOM + formatting helpers shared by every module.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function basename(p) {
  if (p === '/') return '/';
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1];
}

export function dirname(p) {
  const trimmed = p.replace(/\/+$/, '');
  const i = trimmed.lastIndexOf('/');
  if (i <= 0) return '/';
  return trimmed.slice(0, i);
}

export function join(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

export function isInside(child, parent) {
  if (parent === '/') return child.startsWith('/');
  return child === parent || child.startsWith(parent + '/');
}

export function volumeOf(p) {
  const m = p.match(/^\/Volumes\/[^/]+/);
  return m ? m[0] : '/';
}

export function fileUrl(p) {
  return 'file://' + p.split('/').map(encodeURIComponent).join('/');
}

export function splitExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

// "12,345 KB" — the Details view always uses rounded-up kilobytes
export function formatKB(bytes) {
  if (bytes == null) return '';
  const kb = bytes === 0 ? 0 : Math.ceil(bytes / 1024);
  return `${kb.toLocaleString()} KB`;
}

// "4.51 MB" — three significant digits, truncated like Windows does
export function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const f = Math.pow(10, d);
  return `${(Math.floor(v * f) / f).toFixed(d)} ${units[u]}`;
}

export function formatSizeFull(bytes) {
  if (bytes < 1024) return `${bytes.toLocaleString()} bytes`;
  return `${formatSize(bytes)} (${bytes.toLocaleString()} bytes)`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const longDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatDate(ms) {
  if (!ms) return '';
  return dateFmt.format(new Date(ms));
}

export function formatDateLong(ms) {
  if (!ms) return '';
  return longDateFmt.format(new Date(ms));
}

const TYPE_NAMES = {
  txt: 'Text Document',
  log: 'Text Document',
  rtf: 'Rich Text Format',
  md: 'Markdown File',
  pdf: 'PDF Document',
  doc: 'Microsoft Word 97 - 2003 Document',
  docx: 'Microsoft Word Document',
  xls: 'Microsoft Excel 97-2003 Worksheet',
  xlsx: 'Microsoft Excel Worksheet',
  csv: 'Microsoft Excel Comma Separated Values File',
  ppt: 'Microsoft PowerPoint 97-2003 Presentation',
  pptx: 'Microsoft PowerPoint Presentation',
  pages: 'Pages Document',
  numbers: 'Numbers Spreadsheet',
  key: 'Keynote Presentation',
  zip: 'Compressed (zipped) Folder',
  '7z': '7Z Archive',
  rar: 'RAR Archive',
  tar: 'TAR Archive',
  gz: 'GZ Archive',
  png: 'PNG File',
  jpg: 'JPG File',
  jpeg: 'JPEG File',
  gif: 'GIF File',
  bmp: 'BMP File',
  webp: 'WEBP File',
  heic: 'HEIC File',
  svg: 'SVG Document',
  ico: 'ICO File',
  tiff: 'TIFF File',
  psd: 'PSD File',
  mp4: 'MP4 File',
  mov: 'MOV File',
  mkv: 'MKV File',
  avi: 'AVI File',
  webm: 'WEBM File',
  mp3: 'MP3 File',
  wav: 'WAV File',
  m4a: 'M4A File',
  flac: 'FLAC File',
  aac: 'AAC File',
  html: 'HTML Document',
  htm: 'HTML Document',
  css: 'Cascading Style Sheet Document',
  js: 'JavaScript File',
  mjs: 'JavaScript File',
  ts: 'TypeScript File',
  tsx: 'TypeScript JSX File',
  jsx: 'JavaScript JSX File',
  json: 'JSON File',
  xml: 'XML Document',
  yml: 'YAML File',
  yaml: 'YAML File',
  py: 'Python File',
  java: 'Java Source File',
  c: 'C Source File',
  cpp: 'C++ Source File',
  h: 'C Header File',
  swift: 'Swift Source File',
  go: 'Go Source File',
  rs: 'Rust Source File',
  sh: 'Shell Script',
  app: 'Application',
  exe: 'Application',
  dmg: 'Disk Image File',
  iso: 'Disc Image File',
  pkg: 'Installer Package',
  ttf: 'TrueType font file',
  otf: 'OpenType font file',
  ics: 'iCalendar File',
  vcf: 'vCard File',
};

export function typeName(e) {
  if (e.isDir) return 'File folder';
  if (TYPE_NAMES[e.ext]) return TYPE_NAMES[e.ext];
  return e.ext ? `${e.ext.toUpperCase()} File` : 'File';
}

const CATS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'heic', 'heif', 'svg', 'ico', 'tif', 'tiff', 'psd', 'raw', 'cr2', 'nef', 'avif'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg'],
  audio: ['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg', 'wma', 'aiff', 'aif'],
  pdf: ['pdf'],
  doc: ['doc', 'docx', 'rtf', 'odt', 'pages'],
  sheet: ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
  slides: ['ppt', 'pptx', 'odp', 'key'],
  archive: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'],
  code: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'html', 'htm', 'css', 'scss', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'go', 'rs', 'rb', 'php', 'sh', 'zsh', 'xml', 'yml', 'yaml', 'toml', 'sql', 'kt', 'lua', 'vue', 'svelte'],
  text: ['txt', 'md', 'log', 'ini', 'cfg', 'conf', 'env'],
  app: ['app', 'exe', 'msi', 'command', 'bat'],
  disk: ['dmg', 'iso', 'img', 'pkg', 'mpkg'],
  font: ['ttf', 'otf', 'woff', 'woff2'],
};
const CAT_BY_EXT = {};
for (const [cat, list] of Object.entries(CATS)) for (const x of list) CAT_BY_EXT[x] = cat;

export function category(e) {
  if (e.isDir) return 'folder';
  return CAT_BY_EXT[e.ext] || 'generic';
}

export const THUMB_CATS = new Set(['image', 'video', 'pdf']);
export const TEXT_PREVIEW_CATS = new Set(['code', 'text']);

export function debounce(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export const INVALID_NAME_CHARS = /[\\/:*?"<>|]/;
