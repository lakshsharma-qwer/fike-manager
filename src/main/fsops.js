// All file-system work lives here: listing, searching, copy/move with progress,
// trash, rename, compression, volumes and thumbnails.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { shell, nativeImage } = require('electron');

// Bundles that macOS treats as single documents; we show them as files.
const PACKAGE_EXTS = new Set([
  'app', 'photoslibrary', 'rtfd', 'key', 'pages', 'numbers', 'bundle', 'framework',
  'xcodeproj', 'xcworkspace', 'playground', 'musiclibrary', 'theater', 'pkg', 'mpkg',
]);

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

async function entryFor(dir, name) {
  const full = path.join(dir, name);
  let lst;
  try {
    lst = await fsp.lstat(full);
  } catch {
    return null;
  }
  let st = lst;
  let broken = false;
  if (lst.isSymbolicLink()) {
    try {
      st = await fsp.stat(full);
    } catch {
      broken = true;
    }
  }
  const ext = extOf(name);
  const rawDir = st.isDirectory();
  const isPackage = rawDir && PACKAGE_EXTS.has(ext);
  return {
    name,
    path: full,
    isDir: rawDir && !isPackage,
    isPackage,
    size: rawDir ? 0 : st.size,
    mtime: st.mtimeMs,
    ctime: st.birthtimeMs || st.ctimeMs,
    atime: st.atimeMs,
    ext: rawDir && !isPackage ? '' : ext,
    hidden: name.startsWith('.'),
    isLink: lst.isSymbolicLink(),
    broken,
    readonly: !(st.mode & 0o200),
  };
}

async function listDir(dir) {
  try {
    const names = await fsp.readdir(dir);
    const entries = [];
    const BATCH = 256;
    for (let i = 0; i < names.length; i += BATCH) {
      const part = await Promise.all(names.slice(i, i + BATCH).map((n) => entryFor(dir, n)));
      for (const e of part) if (e) entries.push(e);
    }
    return { path: dir, entries };
  } catch (e) {
    return { path: dir, entries: [], error: { code: e.code, message: e.message } };
  }
}

async function listSubdirs(dir, showHidden) {
  try {
    const items = await fsp.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const d of items) {
      if (!showHidden && d.name.startsWith('.')) continue;
      let isDir = d.isDirectory();
      if (d.isSymbolicLink()) {
        try {
          isDir = (await fsp.stat(path.join(dir, d.name))).isDirectory();
        } catch {
          isDir = false;
        }
      }
      if (isDir && !PACKAGE_EXTS.has(extOf(d.name))) out.push({ name: d.name, path: path.join(dir, d.name) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return out;
  } catch {
    return [];
  }
}

async function stat(p) {
  return entryFor(path.dirname(p), path.basename(p));
}

async function exists(p) {
  try {
    await fsp.lstat(p);
    return true;
  } catch {
    return false;
  }
}

// "name (2).ext", "name (3).ext", ...
async function uniqueName(dir, base, ext) {
  let candidate = base + ext;
  let n = 2;
  while (await exists(path.join(dir, candidate))) {
    candidate = `${base} (${n++})${ext}`;
  }
  return path.join(dir, candidate);
}

function splitName(name, isDir) {
  if (isDir) return [name, ''];
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
}

// Windows-style "file - Copy.txt", "file - Copy (2).txt"
async function copyName(dir, name, isDir) {
  const [base, ext] = splitName(name, isDir);
  let candidate = `${base} - Copy${ext}`;
  let n = 2;
  while (await exists(path.join(dir, candidate))) {
    candidate = `${base} - Copy (${n++})${ext}`;
  }
  return path.join(dir, candidate);
}

async function mkdirUnique(dir, base = 'New folder') {
  const target = await uniqueName(dir, base, '');
  await fsp.mkdir(target);
  return target;
}

async function newFile(dir, base, ext, content = '') {
  const target = await uniqueName(dir, base, ext);
  await fsp.writeFile(target, content, { flag: 'wx' });
  return target;
}

async function rename(oldPath, newName) {
  const target = path.join(path.dirname(oldPath), newName);
  const caseOnly = target.toLowerCase() === oldPath.toLowerCase();
  if (!caseOnly && (await exists(target))) {
    const err = new Error('A file with that name already exists');
    err.code = 'EEXIST';
    throw err;
  }
  await fsp.rename(oldPath, target);
  return target;
}

async function trash(paths) {
  const failed = [];
  for (const p of paths) {
    try {
      await shell.trashItem(p);
    } catch (e) {
      failed.push({ path: p, message: e.message });
    }
  }
  return { failed };
}

async function deletePermanent(paths) {
  const failed = [];
  for (const p of paths) {
    try {
      await fsp.rm(p, { recursive: true, force: true });
    } catch (e) {
      failed.push({ path: p, message: e.message });
    }
  }
  return { failed };
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// For a copy/move, work out each source's destination and which ones clash.
async function planTransfer({ op, sources, destDir }) {
  const items = [];
  const conflicts = [];
  for (const src of sources) {
    const name = path.basename(src);
    const s = await stat(src);
    if (!s) continue;
    if (isInside(destDir, src) && (s.isDir || s.isPackage)) {
      return { error: 'The destination folder is a subfolder of the source folder.' };
    }
    const sameDir = path.resolve(path.dirname(src)) === path.resolve(destDir);
    if (sameDir) {
      if (op === 'move') continue; // nothing to do
      items.push({ src, dest: await copyName(destDir, name, s.isDir || s.isPackage), isDir: s.isDir || s.isPackage });
      continue;
    }
    const dest = path.join(destDir, name);
    const item = { src, dest, isDir: s.isDir || s.isPackage };
    const existing = await stat(dest);
    if (existing) conflicts.push({ ...item, srcInfo: s, destInfo: existing });
    items.push(item);
  }
  return { items, conflicts };
}

async function walkSize(p, onProgress, signal) {
  let size = 0;
  let files = 0;
  let folders = 0;
  const stack = [p];
  let last = Date.now();
  while (stack.length) {
    if (signal?.cancelled) break;
    const cur = stack.pop();
    let st;
    try {
      st = await fsp.lstat(cur);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (cur !== p) folders++;
      let names = [];
      try {
        names = await fsp.readdir(cur);
      } catch {
        continue;
      }
      for (const n of names) stack.push(path.join(cur, n));
    } else {
      files++;
      size += st.size;
    }
    if (onProgress && Date.now() - last > 150) {
      last = Date.now();
      onProgress({ size, files, folders });
    }
  }
  return { size, files, folders };
}

// ---------------- transfer jobs (copy / move with progress) ----------------

const jobs = new Map();
let jobSeq = 0;

function createJob(send) {
  const id = ++jobSeq;
  const job = {
    id,
    cancelled: false,
    paused: false,
    resumeWaiters: [],
    send,
  };
  jobs.set(id, job);
  return job;
}

function controlJob(id, action) {
  const job = jobs.get(id);
  if (!job) return;
  if (action === 'cancel') {
    job.cancelled = true;
    job.paused = false;
  }
  if (action === 'pause') job.paused = true;
  if (action === 'resume') job.paused = false;
  if (!job.paused) {
    job.resumeWaiters.splice(0).forEach((r) => r());
  }
}

function waitIfPaused(job) {
  if (!job.paused) return null;
  return new Promise((r) => job.resumeWaiters.push(r));
}

class Cancelled extends Error {}

async function copyFileWithProgress(job, src, dest, onBytes) {
  const st = await fsp.stat(src);
  await new Promise((resolve, reject) => {
    const rs = fs.createReadStream(src, { highWaterMark: 1024 * 1024 });
    const ws = fs.createWriteStream(dest, { mode: st.mode });
    let failed = false;
    const fail = (e) => {
      if (failed) return;
      failed = true;
      rs.destroy();
      ws.destroy();
      fsp.rm(dest, { force: true }).finally(() => reject(e));
    };
    // Manual flow control (instead of pipe) so Pause really stops the copy
    let draining = false;
    const maybeResume = () => {
      if (failed) return;
      if (job.cancelled) return fail(new Cancelled());
      if (!job.paused && !draining) rs.resume();
    };
    rs.on('data', (chunk) => {
      if (job.cancelled) return fail(new Cancelled());
      onBytes(chunk.length);
      if (!ws.write(chunk)) {
        draining = true;
        rs.pause();
        ws.once('drain', () => {
          draining = false;
          maybeResume();
        });
      }
      const wait = waitIfPaused(job);
      if (wait) {
        rs.pause();
        wait.then(maybeResume);
      }
    });
    rs.on('end', () => ws.end());
    rs.on('error', fail);
    ws.on('error', fail);
    ws.on('finish', resolve);
  });
  try {
    await fsp.utimes(dest, st.atime, st.mtime);
  } catch {}
}

async function copyRecursive(job, src, dest, ctx) {
  if (job.cancelled) throw new Cancelled();
  const wait = waitIfPaused(job);
  if (wait) await wait;
  const lst = await fsp.lstat(src);
  ctx.current = path.basename(src);
  if (lst.isSymbolicLink()) {
    const target = await fsp.readlink(src);
    await fsp.rm(dest, { force: true, recursive: true });
    await fsp.symlink(target, dest);
    ctx.itemDone();
  } else if (lst.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    for (const n of await fsp.readdir(src)) {
      await copyRecursive(job, path.join(src, n), path.join(dest, n), ctx);
    }
    ctx.itemDone();
  } else {
    await copyFileWithProgress(job, src, dest, ctx.addBytes);
    ctx.itemDone();
  }
}

async function countTree(p) {
  const r = await walkSize(p);
  const isDir = await fsp.lstat(p).then((s) => s.isDirectory()).catch(() => false);
  return { bytes: r.size, items: r.files + r.folders + (isDir ? 1 : 0) };
}

async function runTransfer(send, { op, items }) {
  const job = createJob(send);
  const total = { bytes: 0, items: 0 };
  const result = { created: [], moved: [], errors: [] };

  (async () => {
    send('job-progress', { id: job.id, op, phase: 'counting', totalItems: items.length });
    for (const it of items) {
      const c = await countTree(it.src);
      total.bytes += c.bytes;
      total.items += c.items;
    }
    const start = Date.now();
    let bytesDone = 0;
    let itemsDone = 0;
    let lastSent = 0;
    const ctx = {
      current: '',
      addBytes: (n) => {
        bytesDone += n;
        tick();
      },
      itemDone: () => {
        itemsDone++;
        tick();
      },
    };
    const tick = (force) => {
      const now = Date.now();
      if (!force && now - lastSent < 100) return;
      lastSent = now;
      const elapsed = Math.max(0.001, (now - start) / 1000);
      send('job-progress', {
        id: job.id,
        op,
        phase: 'running',
        bytesDone,
        totalBytes: total.bytes,
        itemsDone,
        totalItems: total.items,
        current: ctx.current,
        speed: bytesDone / elapsed,
        paused: job.paused,
      });
    };

    for (const it of items) {
      if (job.cancelled) break;
      try {
        if (it.mode === 'skip') continue;
        let dest = it.dest;
        if (it.mode === 'keepboth') {
          const [base, ext] = splitName(path.basename(dest), it.isDir);
          dest = await uniqueName(path.dirname(dest), base, ext);
        }
        const replacing = it.mode === 'replace' && (await exists(dest));
        if (op === 'move') {
          let renamed = false;
          if (!replacing || !it.isDir) {
            try {
              await fsp.rename(it.src, dest);
              renamed = true;
              const c = await countTree(dest).catch(() => ({ bytes: 0, items: 1 }));
              bytesDone += c.bytes;
              itemsDone += c.items;
              tick(true);
            } catch (e) {
              if (e.code !== 'EXDEV' && e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') throw e;
            }
          }
          if (!renamed) {
            if (replacing && !it.isDir) await fsp.rm(dest, { force: true });
            await copyRecursive(job, it.src, dest, ctx);
            await fsp.rm(it.src, { recursive: true, force: true });
          }
          result.moved.push([it.src, dest]);
        } else {
          if (replacing && !it.isDir) await fsp.rm(dest, { force: true });
          await copyRecursive(job, it.src, dest, ctx);
          // Only report the top-level path as "created" when it didn't exist before
          if (!replacing) result.created.push(dest);
        }
      } catch (e) {
        if (e instanceof Cancelled) break;
        result.errors.push({ path: it.src, message: e.message });
      }
    }
    tick(true);
    jobs.delete(job.id);
    send('job-done', { id: job.id, op, cancelled: job.cancelled, ...result });
  })();

  return job.id;
}

// ---------------- search ----------------

const searches = new Map();

function makeMatcher(query) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const exts = [];
  const words = [];
  for (const t of tokens) {
    const m = t.match(/^ext:\.?(.+)$/i);
    if (m) exts.push(m[1].toLowerCase());
    else words.push(t.toLowerCase());
  }
  const regs = words.map((w) => {
    if (w.includes('*') || w.includes('?')) {
      const re = w.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      return new RegExp(`^${re}$`, 'i');
    }
    return null;
  });
  return (name) => {
    const lower = name.toLowerCase();
    if (exts.length && !exts.includes(extOf(name))) return false;
    return words.every((w, i) => (regs[i] ? regs[i].test(name) : lower.includes(w)));
  };
}

function startSearch(send, { id, root, query, showHidden }) {
  const state = { cancelled: false };
  searches.set(id, state);
  const match = makeMatcher(query);
  const LIMIT = 20000;
  (async () => {
    const queue = [root];
    let batch = [];
    let found = 0;
    let last = Date.now();
    const flushBatch = () => {
      if (batch.length) send('search-results', { id, entries: batch });
      batch = [];
      last = Date.now();
    };
    while (queue.length && !state.cancelled && found < LIMIT) {
      const dir = queue.shift();
      let names;
      try {
        names = await fsp.readdir(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (state.cancelled) break;
        if (!showHidden && name.startsWith('.')) continue;
        const isMatch = match(name);
        const e = await entryFor(dir, name);
        if (!e) continue;
        if (isMatch) {
          batch.push(e);
          found++;
        }
        if (e.isDir && !e.isLink) queue.push(e.path);
      }
      if (Date.now() - last > 120) flushBatch();
    }
    flushBatch();
    searches.delete(id);
    send('search-done', { id, cancelled: state.cancelled, limited: found >= LIMIT });
  })();
}

function cancelSearch(id) {
  const s = searches.get(id);
  if (s) s.cancelled = true;
}

// ---------------- volumes ----------------

async function volumes() {
  const out = [];
  const seen = new Set();
  let names = [];
  try {
    names = await fsp.readdir('/Volumes');
  } catch {}
  const candidates = names.map((n) => ({ name: n, path: path.join('/Volumes', n) }));
  for (const c of candidates) {
    let real;
    try {
      real = await fsp.realpath(c.path);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    const info = { name: c.name, path: real === '/' ? '/' : c.path, isRoot: real === '/' };
    try {
      const s = await fsp.statfs(info.path);
      info.total = s.blocks * s.bsize;
      info.free = s.bavail * s.bsize;
    } catch {}
    out.push(info);
  }
  if (!seen.has('/')) {
    const s = await fsp.statfs('/').catch(() => null);
    out.unshift({ name: 'Macintosh HD', path: '/', isRoot: true, total: s ? s.blocks * s.bsize : 0, free: s ? s.bavail * s.bsize : 0 });
  }
  out.sort((a, b) => (b.isRoot ? 1 : 0) - (a.isRoot ? 1 : 0));
  return out;
}

// ---------------- thumbnails / previews ----------------

async function thumbnail(p, size) {
  try {
    const img = await nativeImage.createThumbnailFromPath(p, { width: size, height: size });
    if (img.isEmpty()) return null;
    return img.toDataURL();
  } catch {
    return null;
  }
}

async function readTextPreview(p, max = 128 * 1024) {
  const fh = await fsp.open(p, 'r');
  try {
    const buf = Buffer.alloc(max);
    const { bytesRead } = await fh.read(buf, 0, max, 0);
    const slice = buf.subarray(0, bytesRead);
    // Treat content with NUL bytes as binary
    if (slice.includes(0)) return { binary: true };
    return { text: slice.toString('utf8'), truncated: bytesRead === max };
  } finally {
    await fh.close();
  }
}

// ---------------- archives ----------------

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 16, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function compress(paths) {
  const dir = path.dirname(paths[0]);
  const [base] = splitName(path.basename(paths[0]), false);
  const target = await uniqueName(dir, base, '.zip');
  if (paths.length === 1) {
    await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', paths[0], target]);
  } else {
    await run('zip', ['-r', '-y', '-q', target, ...paths.map((p) => path.basename(p))], { cwd: dir });
  }
  return target;
}

async function extract(zipPath) {
  const dir = path.dirname(zipPath);
  const [base] = splitName(path.basename(zipPath), false);
  const target = await uniqueName(dir, base, '');
  await fsp.mkdir(target);
  await run('ditto', ['-x', '-k', zipPath, target]);
  return target;
}

// ---------------- misc ----------------

const watchers = new Map(); // webContents id -> { watcher, path }

function watch(wcId, dir, send) {
  unwatch(wcId);
  if (!dir) return;
  try {
    let timer = null;
    const watcher = fs.watch(dir, { persistent: false }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => send('dir-changed', dir), 200);
    });
    watcher.on('error', () => {});
    watchers.set(wcId, { watcher, path: dir });
  } catch {}
}

function unwatch(wcId) {
  const w = watchers.get(wcId);
  if (w) {
    w.watcher.close();
    watchers.delete(wcId);
  }
}

function specialPaths() {
  const home = os.homedir();
  const icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  return {
    home,
    trash: path.join(home, '.Trash'),
    icloud: fs.existsSync(icloud) ? icloud : null,
    desktop: path.join(home, 'Desktop'),
    downloads: path.join(home, 'Downloads'),
    documents: path.join(home, 'Documents'),
    pictures: path.join(home, 'Pictures'),
    music: path.join(home, 'Music'),
    videos: path.join(home, 'Movies'),
    username: os.userInfo().username,
  };
}

async function emptyTrash() {
  await run('osascript', ['-e', 'tell application "Finder" to empty trash']);
}

module.exports = {
  listDir,
  listSubdirs,
  stat,
  exists,
  mkdirUnique,
  newFile,
  rename,
  trash,
  deletePermanent,
  planTransfer,
  runTransfer,
  controlJob,
  walkSize,
  startSearch,
  cancelSearch,
  volumes,
  thumbnail,
  readTextPreview,
  compress,
  extract,
  watch,
  unwatch,
  specialPaths,
  emptyTrash,
  run,
};
