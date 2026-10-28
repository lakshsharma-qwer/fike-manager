const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  settings: { get: invoke('settings:get'), set: invoke('settings:set') },
  paths: invoke('paths'),

  list: invoke('fs:list'),
  subdirs: invoke('fs:subdirs'),
  stat: invoke('fs:stat'),
  exists: invoke('fs:exists'),
  volumes: invoke('fs:volumes'),
  mkdir: invoke('fs:mkdir'),
  newFile: invoke('fs:newfile'),
  rename: invoke('fs:rename'),
  trash: invoke('fs:trash'),
  deletePermanent: invoke('fs:delete'),
  planTransfer: invoke('fs:plan'),
  transfer: invoke('fs:transfer'),
  jobControl: invoke('fs:job'),
  search: invoke('fs:search'),
  cancelSearch: invoke('fs:search-cancel'),
  thumbnail: invoke('fs:thumb'),
  readText: invoke('fs:text'),
  compress: invoke('fs:compress'),
  extract: invoke('fs:extract'),
  watch: invoke('fs:watch'),
  emptyTrash: invoke('fs:empty-trash'),
  sizeStart: invoke('fs:size-start'),
  sizeCancel: invoke('fs:size-cancel'),

  open: invoke('shell:open'),
  reveal: invoke('shell:reveal'),
  openTerminal: invoke('shell:terminal'),
  openWith: invoke('shell:open-with'),
  share: invoke('shell:share'),

  clipWriteFiles: invoke('clip:write-files'),
  clipReadFiles: invoke('clip:read-files'),
  clipWriteText: invoke('clip:write-text'),
  edit: invoke('edit'),

  startDrag: (paths, icon) => ipcRenderer.send('drag-start', paths, icon),
  pathForFile: (file) => webUtils.getPathForFile(file),

  newWindow: invoke('win:new'),
  windowControl: invoke('win:control'),
  windowState: invoke('win:state'),

  on: (channel, fn) => {
    const allowed = ['job-progress', 'job-done', 'search-results', 'search-done', 'dir-changed', 'size-progress', 'window-state', 'window-focus'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
