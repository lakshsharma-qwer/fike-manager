// Global app state + a tiny event bus.

export const state = {
  settings: null,
  paths: null,
  tabs: [],
  activeId: null,
  clipboard: { paths: [], cut: false },
  undo: [],
  redo: [],
  volumes: [],
  windowFocused: true,
  renaming: null,
};

const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}

export function emit(evt, data) {
  const set = listeners.get(evt);
  if (set) for (const fn of [...set]) fn(data);
}

export function activeTab() {
  return state.tabs.find((t) => t.id === state.activeId) || state.tabs[0];
}

export function saveSettings(patch) {
  Object.assign(state.settings, patch);
  window.api.settings.set(patch);
  emit('settings', patch);
}

export function selectedEntries(tab = activeTab()) {
  if (!tab) return [];
  return tab.items.filter((e) => tab.selection.has(e.path));
}

export function pushUndo(record) {
  state.undo.push(record);
  if (state.undo.length > 50) state.undo.shift();
  state.redo = [];
  emit('undo');
}
