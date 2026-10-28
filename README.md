# File Explorer for macOS

A Windows 11 File Explorer clone for macOS, built with Electron. It works on your real files and follows the look and behavior described in [WINDOWS_EXPLORER_REFERENCE.md](WINDOWS_EXPLORER_REFERENCE.md).

## Run

```bash
npm install
npm start
```

## Build a DMG

```bash
npm run dist     # → dist/File Explorer-1.0.0-x64.dmg (Intel) and dist/File Explorer-1.0.0-arm64.dmg (Apple Silicon)
npm run icon     # re-render build/icon.png from build/icon.svg after editing it
```

Ready-made installers are in `DMG Installers/`. Use the Intel DMG on Intel Macs and the Apple Silicon DMG on M-series Macs.

The apps are ad-hoc signed, not signed with an Apple Developer ID. On another Mac, open the app the first time with right-click › **Open**, or run `xattr -cr "/Applications/File Explorer.app"`.

`npm start` unsets `ELECTRON_RUN_AS_NODE`. VS Code's terminal sets that variable, and it stops Electron from starting.

## Features

- **Window**: Windows-style title bar with tabs (new, close, reorder, drag out to a new window, duplicate) and minimize / maximize / close buttons.
- **Address bar**: clickable breadcrumb with sibling-folder dropdowns, long paths collapse into `«`, click empty space to type a path (with autocomplete; `~`, `cmd` and `terminal` are understood), and a history dropdown.
- **Search**: searches the current folder and its subfolders, showing results as they arrive. Supports `*` and `?` wildcards and `ext:pdf`.
- **Command bar**: New ▾, Cut, Copy, Paste, Rename, Share, Delete, Sort ▾, View ▾, "See more" ▾, and a Details toggle. Extra buttons appear when they apply (Extract all, Empty Recycle Bin, Close search).
- **Navigation pane**: Home, iCloud Drive, pinned folders, a This PC tree that loads as you expand it, and the Recycle Bin. Width can be resized.
- **Views**: Extra large / Large / Medium / Small icons, List, Details, Tiles and Content. Each folder remembers its own view. Compact mode, Ctrl/⌘ + mouse wheel or trackpad pinch to resize, and Quick Look thumbnails.
- **Details view**: sort by clicking a column, resize columns (double-click to auto-fit), show or hide columns, and group by date, type, size or name with collapsible groups.
- **Selection**: click, ⌘/Ctrl-click, Shift-click, drag a selection rectangle (scrolls automatically), optional check boxes, arrow keys, and type-ahead.
- **Rename**: rename in place (F2 or a slow second click). Only the name is selected, not the extension. Tab moves to the next file. Invalid characters show a warning balloon. Renaming several files at once gives `Name (1)`, `Name (2)`.
- **File operations**: copy, cut and paste work with Finder's clipboard too. Copies get Windows-style names (`file - Copy (2).txt`). Name clashes open the "Replace or Skip Files" dialog. Longer operations show a progress window with pause, cancel and a speed graph.
- **Drag and drop**: works between folders, tabs, the sidebar, the breadcrumb, Finder and other apps. Same drive moves, a different drive copies. Hold ⌥/Ctrl to force a copy or ⇧/⌘ to force a move.
- **Delete and undo**: Delete moves items to the Trash; Shift+Delete deletes permanently after a confirmation. Undo and redo cover rename, move, copy and new items.
- **Right-click menus**: Windows 11 style with an icon row at the top and submenus for View, Sort, Group, New, Open with and Compress to.
- **Pages**: Home (Quick access and Recent), This PC (folders and drives with usage bars), and the Recycle Bin.
- **Preview and Details panes**: preview images, video, audio, PDFs, text and code, plus Quick Look renderings of Office documents.
- **Dialogs**: Properties (folder size calculated live), Folder Options, and an Open in Terminal command.
- **Appearance**: light and dark themes follow the system. The window looks different when it isn't focused.

## Keyboard shortcuts

Every Windows shortcut works with either Ctrl or ⌘.

| Keys | Action |
|---|---|
| ⌘T / ⌘W / ⌘N | New tab / close tab / new window |
| Ctrl+Tab, ⌘1–9 | Switch tabs |
| ⌘⇧N | New folder |
| F2 | Rename |
| ⌘C / ⌘X / ⌘V / ⌘Z / ⌘Y | Copy / cut / paste / undo / redo |
| Delete or ⌘⌫ (add ⇧ or ⌥ to skip the Trash) | Delete |
| ⌥← / ⌥→ / ⌥↑, ⌘[ / ⌘] / ⌘↑, Backspace | Back / forward / up |
| F3, ⌘F, ⌘E | Search |
| F4, ⌘L, ⌥D | Edit the address |
| F5, ⌘R | Refresh |
| ⌘⇧1–8 | Change view |
| ⌥P / ⌥⇧P | Preview pane / Details pane |
| ⌥Enter | Properties |
| ⇧F10 | Context menu |
| ⌘⇧E | Expand the navigation pane to the current folder |
| F6, F11 | Move focus between areas, full screen |

## Project layout

```
src/main/main.js      window, menu, IPC, clipboard (Finder-compatible), native drag
src/main/fsops.js     listing, search, copy/move jobs with progress, trash, zip, volumes, thumbnails
src/main/store.js     settings (~/Library/Application Support/File Explorer/settings.json)
src/preload.js        the safe bridge the interface uses to reach the main process
src/renderer/js/      UI modules (fileview = virtualized list, actions = commands, ...)
src/renderer/styles/  Fluent design tokens and component styles
```

## Known limitations

- The Recycle Bin is the macOS Trash. Its contents can only be listed if you give the app (or your terminal) Full Disk Access. Restoring items isn't supported, and deleting to the Trash can't be undone.
- The interface uses Segoe UI Variable if it's installed and falls back to the macOS system font.
- There is no Network location, and zip archives can't be browsed like folders (Extract all works).
