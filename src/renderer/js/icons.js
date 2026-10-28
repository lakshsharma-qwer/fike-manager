// Hand-drawn SVG icons in a Windows 11 inspired style.
// Colorful icons for files / folders / navigation, monoline glyphs for commands.
import { category } from './util.js';

let gid = 0;
const uid = (p) => `${p}${++gid}`;

// ---------------- folders ----------------

export function folderSVG(size = 16, { zip = false, open = false } = {}) {
  const g1 = uid('fg');
  const zipper = zip
    ? `<rect x="21" y="16" width="6" height="26" fill="#6b6b6b"/><path d="M21 19h6M21 23h6M21 27h6M21 31h6M21 35h6" stroke="#bdbdbd" stroke-width="1.4"/><rect x="20" y="36" width="8" height="5" rx="1" fill="#4a4a4a"/>`
    : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs><linearGradient id="${g1}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd970"/><stop offset="1" stop-color="#ffbf38"/></linearGradient></defs>
  <path d="M4 11.5A3.5 3.5 0 0 1 7.5 8h11.2a3 3 0 0 1 2.1.9l3.3 3.1H40.5A3.5 3.5 0 0 1 44 15.5V37.5A3.5 3.5 0 0 1 40.5 41H7.5A3.5 3.5 0 0 1 4 37.5Z" fill="#e9a823"/>
  ${open ? '<rect x="8" y="13" width="32" height="20" rx="1.5" fill="#fff" stroke="#d8d8d8" stroke-width=".8"/>' : ''}
  <path d="M4 18.5A3.5 3.5 0 0 1 7.5 15H40.5A3.5 3.5 0 0 1 44 18.5V37.5A3.5 3.5 0 0 1 40.5 41H7.5A3.5 3.5 0 0 1 4 37.5Z" fill="url(#${g1})"/>
  <path d="M4.6 17.2A3.4 3.4 0 0 1 7.5 15.6H40.5a3.4 3.4 0 0 1 2.9 1.6" fill="none" stroke="#fff3c9" stroke-opacity=".8" stroke-width="1"/>
  ${zipper}
</svg>`;
}

// ---------------- files ----------------

const PAGE = (stroke = '#a3a3a3') =>
  `<path d="M11 4.5h17.5L39.5 15.5V41.5a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" fill="#fff" stroke="${stroke}" stroke-width="1.1"/>
   <path d="M28.5 4.5V13.5a2 2 0 0 0 2 2H39.5" fill="#f1f1f1" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round"/>`;

function badge(color, label) {
  return `<rect x="4" y="24" width="24" height="14" rx="2" fill="${color}"/>
  <text x="16" y="34.2" font-family="Segoe UI, -apple-system, Helvetica, Arial" font-size="${label.length > 3 ? 7 : 8.5}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`;
}

function lines(color = '#c4c4c4', y0 = 20, n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<rect x="15" y="${y0 + i * 3.6}" width="${i % 3 === 2 ? 12 : 19}" height="1.6" rx=".8" fill="${color}"/>`;
  return s;
}

const FILE_GLYPHS = {
  generic: () => PAGE(),
  text: () => PAGE() + lines(),
  code: () => PAGE() + `<path d="M19 25l-5 4.5 5 4.5M29 25l5 4.5-5 4.5M26 22.5l-4 14" fill="none" stroke="#2a7bd6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  image: () => {
    const g = uid('ig');
    return (
      PAGE() +
      `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb8f5"/><stop offset="1" stop-color="#2d8ae0"/></linearGradient></defs>
      <rect x="13" y="20" width="22" height="17" rx="1.5" fill="url(#${g})"/>
      <circle cx="29.5" cy="24.5" r="2.2" fill="#ffe27a"/>
      <path d="M13 34l6.5-7 5 5 3-3 7.5 7.5V35.5a1.5 1.5 0 0 1-1.5 1.5H14.5A1.5 1.5 0 0 1 13 35.5Z" fill="#3fa34d"/>`
    );
  },
  video: () =>
    PAGE() +
    `<rect x="13" y="21" width="22" height="16" rx="2" fill="#5b3fb0"/>
     <path d="M21.5 25v8l7-4Z" fill="#fff"/>`,
  audio: () => PAGE() + `<path d="M21 34.5V23l10-2.5v11.5" fill="none" stroke="#e8590c" stroke-width="2"/><circle cx="18.5" cy="34.5" r="3" fill="#e8590c"/><circle cx="28.5" cy="32" r="3" fill="#e8590c"/>`,
  pdf: () => PAGE() + lines('#d4d4d4', 18, 4) + badge('#d93025', 'PDF'),
  doc: () => PAGE() + lines('#c9d6ea', 18, 6) + badge('#185abd', 'DOC'),
  sheet: () => PAGE() + `<path d="M15 19h19v16H15ZM15 24.3h19M15 29.6h19M21.3 19v16M27.6 19v16" fill="none" stroke="#8cc29e" stroke-width="1"/>` + badge('#107c41', 'XLS'),
  slides: () => PAGE() + `<rect x="16" y="19" width="17" height="11" rx="1" fill="#f6c8b6"/>` + badge('#c43e1c', 'PPT'),
  app: () =>
    `<rect x="6" y="9" width="36" height="30" rx="3" fill="#e9eef5" stroke="#8aa4c4" stroke-width="1.1"/>
     <path d="M6 12a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v3H6Z" fill="#3a7bd5"/>
     <rect x="11" y="20" width="12" height="13" rx="1.5" fill="#7fb2f0"/>
     <rect x="26" y="20" width="11" height="2.2" rx="1" fill="#a8bbd4"/><rect x="26" y="25" width="11" height="2.2" rx="1" fill="#a8bbd4"/><rect x="26" y="30" width="7" height="2.2" rx="1" fill="#a8bbd4"/>`,
  disk: () =>
    `<rect x="7" y="14" width="34" height="22" rx="4" fill="#d9dde3" stroke="#8e96a3" stroke-width="1.1"/>
     <rect x="11" y="28" width="26" height="4" rx="2" fill="#aeb5c0"/><circle cx="35" cy="20" r="1.8" fill="#3ac25a"/>`,
  font: () => PAGE() + `<text x="24" y="36" font-family="Georgia, serif" font-size="17" font-weight="700" fill="#444" text-anchor="middle">A</text>`,
};

export function fileSVG(entry, size = 16) {
  const cat = category(entry);
  if (cat === 'folder') return folderSVG(size);
  if (cat === 'archive' && entry.ext === 'zip') return folderSVG(size, { zip: true });
  if (cat === 'archive') return `<svg width="${size}" height="${size}" viewBox="0 0 48 48">${PAGE()}<rect x="21" y="5" width="6" height="30" fill="#7a7a7a"/><path d="M21 8h6M21 12h6M21 16h6M21 20h6M21 24h6M21 28h6" stroke="#cfcfcf" stroke-width="1.4"/><rect x="19.5" y="31" width="9" height="7" rx="1.5" fill="#4d4d4d"/></svg>`;
  const draw = FILE_GLYPHS[cat] || FILE_GLYPHS.generic;
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48">${draw()}</svg>`;
}

export function iconFor(entry, size = 16) {
  return fileSVG(entry, size);
}

export const LINK_OVERLAY = (size) =>
  `<svg class="overlay" width="${size}" height="${size}" viewBox="0 0 16 16"><rect x=".5" y="8.5" width="7" height="7" fill="#fff" stroke="#888"/><path d="M2.5 13.5c0-2.5 1.5-3.5 3.5-3.5M4.5 8.8 6.2 10 4.8 11.6" fill="none" stroke="#1f6fd1" stroke-width="1.2"/></svg>`;

// ---------------- drives / places ----------------

export function driveSVG(size = 48, { removable = false } = {}) {
  const g = uid('dg');
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f5f8"/><stop offset="1" stop-color="#c9ced6"/></linearGradient></defs>
  <path d="M8 20 12 10h24l4 10Z" fill="#e1e5ea" stroke="#9aa3ae" stroke-width="1"/>
  <rect x="6" y="20" width="36" height="16" rx="2.5" fill="url(#${g})" stroke="#8a93a0" stroke-width="1"/>
  <rect x="10" y="30" width="22" height="2" rx="1" fill="#9aa3ae"/>
  <circle cx="36.5" cy="31" r="1.8" fill="${removable ? '#f5a623' : '#3ac25a'}"/>
</svg>`;
}

const NAV = {
  home: `<path d="M2 7.2 8 2.2l6 5V14a.5.5 0 0 1-.5.5H10V10H6v4.5H2.5A.5.5 0 0 1 2 14Z" fill="#f2b33d" stroke="#b9831c" stroke-width=".8" stroke-linejoin="round"/><path d="M6 10h4v4.5H6Z" fill="#7a5a12"/><path d="M1 7.8 8 2l7 5.8" fill="none" stroke="#c0392b" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`,
  gallery: `<rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="#46a4f0"/><circle cx="11" cy="6" r="1.4" fill="#ffe27a"/><path d="M1.5 11.5 5.5 7.5l3 3 2-2 4 4V11.5a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5Z" fill="#36a852"/>`,
  cloud: `<path d="M4.5 13A3.5 3.5 0 0 1 4 6.05 4.5 4.5 0 0 1 12.6 6.6 3.2 3.2 0 0 1 12 13Z" fill="#3b9cf0"/>`,
  desktop: `<rect x="1.5" y="2.5" width="13" height="9" rx="1" fill="#2fa3e0"/><rect x="2.5" y="3.5" width="11" height="7" fill="#7fd0f7"/><path d="M6 14h4M8 11.5V14" stroke="#1d6fa5" stroke-width="1.4" stroke-linecap="round"/>`,
  downloads: `<path d="M8 1.8v9M4.2 7.2 8 11l3.8-3.8" fill="none" stroke="#14a33f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 14h11" stroke="#14a33f" stroke-width="1.8" stroke-linecap="round"/>`,
  documents: `<path d="M3.5 1.5h6l3 3v10h-9Z" fill="#fff" stroke="#6b7c93" stroke-width="1"/><path d="M5.5 7h5M5.5 9h5M5.5 11h3.5" stroke="#6b7c93" stroke-width=".9"/><path d="M9.5 1.5v3h3" fill="#d8dee7" stroke="#6b7c93" stroke-width=".9"/>`,
  pictures: `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="#2d8ae0"/><circle cx="11" cy="5.5" r="1.3" fill="#ffe27a"/><path d="M1.5 12 6 7.5l3.2 3.2 1.8-1.8 3.5 3.5v.1a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5Z" fill="#a9dcff"/>`,
  music: `<path d="M6 12.5V3.5l7-1.5v9" fill="none" stroke="#e8590c" stroke-width="1.6"/><circle cx="4.3" cy="12.5" r="2.2" fill="#e8590c"/><circle cx="11.3" cy="11" r="2.2" fill="#e8590c"/>`,
  videos: `<rect x="1.5" y="3" width="13" height="10" rx="1.5" fill="#7b4fd6"/><path d="M6.5 5.8v4.4L10.3 8Z" fill="#fff"/><path d="M1.5 5h1.5M1.5 8h1.5M1.5 11h1.5M13 5h1.5M13 8h1.5M13 11h1.5" stroke="#c9b6f5" stroke-width="1"/>`,
  thispc: `<rect x="1.5" y="2" width="13" height="9.5" rx="1" fill="#3c4a5c"/><rect x="2.5" y="3" width="11" height="7.5" fill="#3aa0f0"/><path d="M5 14h6M8 11.5V14" stroke="#3c4a5c" stroke-width="1.4" stroke-linecap="round"/>`,
  network: `<rect x="4.5" y="1.5" width="7" height="5.5" rx=".8" fill="#3aa0f0" stroke="#2a5d8f" stroke-width=".8"/><path d="M8 7v3M2.5 13h11M8 10v3" stroke="#2a5d8f" stroke-width="1.2"/><rect x="6.5" y="9.5" width="3" height="2" fill="#2a5d8f"/>`,
  trash: `<path d="M3.5 4.5h9l-.9 9.4a1 1 0 0 1-1 .9H5.4a1 1 0 0 1-1-.9Z" fill="#dfe8f2" stroke="#6b7c93" stroke-width="1"/><path d="M2.5 4.5h11M6.2 4.5V2.8h3.6v1.7" fill="none" stroke="#6b7c93" stroke-width="1.1"/><path d="M6.5 7v5M9.5 7v5" stroke="#9aaabd" stroke-width=".9"/>`,
  user: `<circle cx="8" cy="5.2" r="3" fill="#f0b45a"/><path d="M2.5 14.5c.4-3 2.7-4.8 5.5-4.8s5.1 1.8 5.5 4.8" fill="#3a8be0"/>`,
  drive: `<rect x="1.5" y="6" width="13" height="6" rx="1" fill="#d9dde3" stroke="#7f8896" stroke-width=".9"/><path d="M2.6 6 4.3 2.5h7.4L13.4 6" fill="#e9ecf0" stroke="#7f8896" stroke-width=".9"/><circle cx="12" cy="9" r=".9" fill="#2fb44d"/>`,
  search: `<circle cx="9.5" cy="6.5" r="4" fill="none" stroke="#3a7bd5" stroke-width="1.5"/><path d="M6.6 9.4 2 14" stroke="#3a7bd5" stroke-width="1.8" stroke-linecap="round"/>`,
};

export function navSVG(name, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16">${NAV[name] || NAV.drive}</svg>`;
}

// ---------------- monoline command glyphs ----------------

const G = {
  back: 'M13.5 8h-11M6.5 4 2.5 8l4 4',
  forward: 'M2.5 8h11M9.5 4l4 4-4 4',
  up: 'M8 13.5v-11M4 6.5l4-4 4 4',
  refresh: 'M13.2 7.5A5.2 5.2 0 1 1 11.6 4.2M13 1.8v3.3H9.7',
  chevR: 'M6 3.5 10.5 8 6 12.5',
  chevL: 'M10 3.5 5.5 8 10 12.5',
  chevD: 'M3.5 6 8 10.5 12.5 6',
  chevU: 'M3.5 10 8 5.5 12.5 10',
  sortUp: 'M4 9.5 8 5.8l4 3.7',
  sortDown: 'M4 6.5 8 10.2l4-3.7',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  closeSm: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  plus: 'M8 2.5v11M2.5 8h11',
  minus: 'M3 8h10',
  cut: 'M5.5 9.5 12 1.5M10.5 9.5 4 1.5M7.2 11.2a2.3 2.3 0 1 1-3.2-2 2.3 2.3 0 0 1 3.2 2ZM12.3 11.2a2.3 2.3 0 1 1-3.2-2 2.3 2.3 0 0 1 3.2 2Z',
  copy: 'M5.5 4.5V3a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 13.5 3v7a1.5 1.5 0 0 1-1.5 1.5h-1.5M3.5 4.5h5A1.5 1.5 0 0 1 10 6v7a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 2 13V6a1.5 1.5 0 0 1 1.5-1.5Z',
  paste: 'M5.5 2.5H4A1.5 1.5 0 0 0 2.5 4v8.5A1.5 1.5 0 0 0 4 14h2.5M10.5 2.5H12A1.5 1.5 0 0 1 13.5 4v2M6 1.5h4v2.2H6ZM8.5 7.5h5v7h-5Z',
  rename: 'M2 4.5h7M2 11.5h7M1.5 4.5v7M12 2v12M10.5 2h3M10.5 14h3',
  share: 'M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12.5V6A1.5 1.5 0 0 1 4 4.5h3',
  delete: 'M2 4h12M6 4V2.5h4V4M3.5 4l.8 9.6a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L12.5 4M6.5 6.5v5M9.5 6.5v5',
  sort: 'M4.5 13.5v-11M2 5l2.5-2.5L7 5M11.5 2.5v11M9 11l2.5 2.5L14 11',
  view: 'M2 2.5h5v5H2ZM9 2.5h5v5H9ZM2 9.5h5v5H2ZM9 9.5h5v5H9Z',
  more: 'M3 8h.01M8 8h.01M13 8h.01',
  detailsPane: 'M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM9.5 2.5v11M11 5.5h2M11 8h2',
  previewPane: 'M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM9.5 2.5v11',
  navPane: 'M2.5 2.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM6 2.5v11',
  pin: 'M10 1.5 14.5 6M11.8 3.3 8.3 6.2 4.6 5.6 3.2 7l5.8 5.8 1.4-1.4-.6-3.7 2.9-3.5M6 10l-4.5 4.5',
  unpin: 'M10 1.5 14.5 6M11.8 3.3 8.3 6.2 4.6 5.6 3.2 7l5.8 5.8 1.4-1.4-.6-3.7 2.9-3.5M6 10l-4.5 4.5M1.5 1.5l13 13',
  check: 'M3 8.5l3.2 3.2L13 4.8',
  undo: 'M5.5 3.5 2.5 6.5l3 3M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7',
  redo: 'M10.5 3.5l3 3-3 3M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3',
  selectAll: 'M2 2h2M6 2h4M12 2h2v2M14 6v4M14 12v2h-2M10 14H6M4 14H2v-2M2 10V6M2 4V2M5 8l2 2 4-4',
  selectNone: 'M2 2h2M6 2h4M12 2h2v2M14 6v4M14 12v2h-2M10 14H6M4 14H2v-2M2 10V6M2 4V2',
  invert: 'M2 2h12v12H2ZM2 14 14 2',
  properties: 'M2.5 2.5h11v11h-11ZM5 5.5h6M5 8h6M5 10.5h4',
  options: 'M2 4h7M12 4h2M2 12h2M7 12h7M10.5 2.5v3M5.5 10.5v3',
  terminal: 'M2 2.5h12a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5ZM4 6l2.5 2L4 10M8 10.5h4',
  newTab: 'M2.5 5.5V3.5a1 1 0 0 1 1-1h4.5l1.5 2h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8M1.5 11.5h6M4.5 8.5v6',
  newWindow: 'M5 2.5h8.5a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1ZM4 5.5h10.5M2 5v8.5a1 1 0 0 0 1 1h8.5',
  open: 'M2 4.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V6a1.5 1.5 0 0 0-1.5-1.5H8L6.5 2.5h-3A1.5 1.5 0 0 0 2 4Z',
  openWith: 'M2.5 2.5h4v4h-4ZM9.5 2.5h4v4h-4ZM2.5 9.5h4v4h-4ZM11.5 9v5M9 11.5h5',
  compress: 'M3 1.5h7l3 3v10H3ZM7.5 1.5v2M7.5 4.5v2M7.5 7.5v2M6.5 10h2v2h-2Z',
  extract: 'M2 5.5V12a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 14 12V6.5A1.5 1.5 0 0 0 12.5 5H8L6.5 3h-3A1.5 1.5 0 0 0 2 4.5ZM8 12V7.5M6 9.5l2-2 2 2',
  copyPath: 'M6.5 9.5 9.5 6.5M7 4.5l1.5-1.5a2.5 2.5 0 0 1 3.5 3.5L10.5 8M9 11.5 7.5 13A2.5 2.5 0 0 1 4 9.5L5.5 8',
  filter: 'M2 2.5h12L9.5 8.2v4.8l-3 1.5V8.2Z',
  group: 'M2 3h12M2 6.5h12M5 10h9M5 13.5h9M2 10v3.5',
  compact: 'M2 3h12M2 6h12M2 9h12M2 12h12',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z',
  info: 'M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13ZM8 7v4.5M8 4.8v.2',
  emptyBin: 'M2 4h12M6 4V2.5h4V4M3.5 4l.8 9.6a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L12.5 4M6 7l4 4M10 7l-4 4',
  restore: 'M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3',
  search: 'M9.5 11a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM6.3 9.7 2 14',
  closeSearch: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  history: 'M3.5 6 8 10.5 12.5 6',
  newFolder: 'M2 4.5V12a1.5 1.5 0 0 0 1.5 1.5H8M14 8V6a1.5 1.5 0 0 0-1.5-1.5H8L6.5 2.5h-3A1.5 1.5 0 0 0 2 4ZM12 10v5M9.5 12.5h5',
  newFile: 'M9.5 1.5h-5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8M9.5 1.5l3.5 3.5v3.5M9.5 1.5V5h3.5M12 10v5M9.5 12.5h5',
  shortcut: 'M2.5 2.5h11v11h-11ZM6 10.5c0-2.5 1.5-4 4-4M8 4.5l2 2-2 2',
  finder: 'M2.5 2.5h11v11h-11ZM8 2.5v11M5 6v1M11 6v1M5 10.5c1.5 1.2 4.5 1.2 6 0',
  // view modes
  vXL: 'M2 2h12v12H2Z',
  vLarge: 'M2 2h5v5H2ZM9 2h5v5H9ZM2 9h5v5H2ZM9 9h5v5H9Z',
  vMedium: 'M2 2h3v3H2ZM6.5 2h3v3h-3ZM11 2h3v3h-3ZM2 6.5h3v3H2ZM6.5 6.5h3v3h-3ZM11 6.5h3v3h-3ZM2 11h3v3H2ZM6.5 11h3v3h-3ZM11 11h3v3h-3Z',
  vSmall: 'M2 3h2v2H2ZM6 4h8M2 7h2v2H2ZM6 8h8M2 11h2v2H2ZM6 12h8',
  vList: 'M2 3h1.5v1.5H2ZM5 3.8h3.5M2 7.2h1.5v1.5H2ZM5 8h3.5M2 11.5h1.5V13H2ZM5 12.2h3.5M10 3h1.5v1.5H10ZM13 3.8h1M10 7.2h1.5v1.5H10ZM13 8h1',
  vDetails: 'M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12M6 2v12',
  vTiles: 'M2 2.5h4v4H2ZM7.5 3.5h6M7.5 5.5h4M2 9.5h4v4H2ZM7.5 10.5h6M7.5 12.5h4',
  vContent: 'M2 2.5h3v3H2ZM6.5 3h7.5M6.5 5h5M2 10.5h3v3H2ZM6.5 11h7.5M6.5 13h5M2 8h12',
};

export function glyph(name, size = 16, sw = 1) {
  const d = G[name];
  if (!d) return '';
  const extra = name === 'more' ? ' stroke-width="2.2" stroke-linecap="round"' : ` stroke-width="${sw}"`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor"${extra} stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

// Windows-style caption glyphs (10px, crisp)
export const CAPTION = {
  minimize: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" stroke-width="1"/></svg>',
  maximize: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
  restore:
    '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1"><rect x=".5" y="2.5" width="7" height="7" rx="1"/><path d="M2.5 2.5V1.6A1.1 1.1 0 0 1 3.6.5h4.8A1.1 1.1 0 0 1 9.5 1.6v4.8a1.1 1.1 0 0 1-1.1 1.1h-.9"/></svg>',
  close: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5.5l9 9M9.5.5l-9 9" stroke="currentColor" stroke-width="1"/></svg>',
};

// The blue "New" plus inside a circle
export const NEW_ICON = `<svg class="plus" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v6M5 8h6"/></svg>`;
