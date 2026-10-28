# Windows 11 File Explorer: Complete Reference

A full description of how Windows 11 File Explorer looks, feels and behaves, meant as a spec for building a clone.
Pixel values are approximate (at 100% scaling, 96 DPI) and are a starting point, not exact Microsoft numbers.

---

## 1. Overall feel

- **Calm and light.** Neutral grays, a single accent color (default blue `#0067C0` in light, `#4CC2FF` in dark), and lots of whitespace. Nothing shouts.
- **Fluent Design**, Microsoft's design language: rounded corners (4px on controls, 8px on windows and menus), soft shadows, and **Mica**, a material that faintly tints the window chrome with the desktop wallpaper colors.
- **Two eras in one app.** The top chrome (tabs, address bar, command bar, Home page, context menu) is modern WinUI. Deeper parts (Properties dialog, "Show more options" menu, copy-conflict dialog, Folder Options) are still the older Win32 look. The clash between the two is part of how it feels.
- **Fast and predictable.** Hover states appear right away, there are few animations, and keyboard support is excellent. Power users drive it almost entirely from the keyboard.

---

## 2. Window anatomy (top → bottom)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [📁 Downloads ×] [📁 Documents ×] [+]                     ─   ☐   ✕      │ ← Title bar + tabs (~40px)
├──────────────────────────────────────────────────────────────────────────┤
│ ←  →  ↑  ⟳ │ 🖥 > This PC > Downloads >            │ 🔍 Search Downloads │ ← Address row (~48px)
├──────────────────────────────────────────────────────────────────────────┤
│ ⊕ New ▾ │ ✂ ⧉ 📋 ✎ ↗ 🗑 │ ⇅ Sort ▾ │ ☰ View ▾ │ ⏷ Filter ▾ │ ···   │ ▭ Details │ ← Command bar (~48px)
├───────────────┬──────────────────────────────────────────────────────────┤
│ 🏠 Home        │ Name ˄              Date modified     Type        Size   │ ← Column headers
│ 🖼 Gallery     │ 📁 Projects         06-10-2026 14:02  File folder        │
│ ☁ OneDrive    │ 📁 Screenshots      05-10-2026 09:11  File folder        │
│ ───────────── │ 📄 notes.txt        04-10-2026 18:40  Text Document  2 KB│
│ 🖥 Desktop  📌 │ 🖼 photo.jpg        01-10-2026 12:00  JPG File   3,412 KB│
│ ⬇ Downloads 📌 │                                                          │
│ 📄 Documents 📌│                                                          │
│ ───────────── │                                                          │
│ > 💻 This PC   │                                                          │
│ > 🌐 Network   │                                                          │
├───────────────┴──────────────────────────────────────────────────────────┤
│ 4 items │ 1 item selected  2.13 KB                              ☰  ▦      │ ← Status bar (~24px)
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Title bar and tabs (added in 22H2)
- Tabs sit **inside the title bar**, like a browser. Each tab shows a folder icon, the folder name, and a close ✕ that appears on hover or on the active tab.
- The active tab joins seamlessly with the address row below it (same background, rounded top corners). Inactive tabs are transparent over Mica, with a gray hover background.
- `+` button opens a new tab, which shows **Home** by default.
- Tabs can be reordered by dragging, and dragged out into a new window or into another window (23H2+).
- Right-click a tab: Close tab, Close other tabs, Close tabs to the right, Duplicate tab, Move tab to new window.
- Window buttons on the right (minimize, maximize, close) are ~46×32px. Close turns red `#C42B1C` on hover. Hovering maximize shows **Snap Layouts**.

### 2.2 Address row
- **Back / Forward / Up / Refresh** are icon buttons, ~32–36px square, 4px rounded, transparent until hovered. They are grayed out when not available.
- **Breadcrumb address bar** (~32px tall, rounded, with a subtle border):
  - Shows `[icon] > This PC > Local Disk (C:) > Users > Name`.
  - Each segment can be clicked to navigate there. Each `>` chevron opens a **dropdown of sibling folders**.
  - When the path is too long, the left segments collapse into a `«` overflow button.
  - Clicking empty space, or pressing `Ctrl+L` / `Alt+D` / `F4`, switches it to an **editable text box** with the full path selected (e.g. `C:\Users\Name\Downloads`).
  - Typing a path gives autocomplete suggestions. Typing `cmd`, `powershell` or `wt` opens a terminal in that folder. A URL opens the browser.
  - A dropdown on the right shows recent locations.
- **Search box** (~200–300px wide, can be resized by dragging the divider). Placeholder text: `Search <FolderName>`. It searches the current folder and its subfolders.

### 2.3 Command bar (replaced the old Ribbon)
From left to right:
| Control | Behavior |
|---|---|
| **New ▾** | Menu: Folder, Shortcut, then document types (Text Document, Word, Bitmap, Compressed (zipped) Folder, …) |
| Cut, Copy, Paste, Rename, Share, Delete | Icon-only buttons with tooltips. They are disabled when they don't apply (e.g. Paste with an empty clipboard, Rename with nothing selected) |
| **Sort ▾** | Name / Date modified / Type / Size / … , Ascending / Descending, More options |
| **View ▾** | Extra large / Large / Medium / Small icons, List, Details, Tiles, Content, **Compact view**, Show ▸ (Navigation pane, Details pane, Preview pane, Item check boxes, File name extensions, Hidden items) |
| **Filter ▾** | Appears in some folders (e.g. Home/Recent) |
| **···** (See more) | Undo, Select all, Select none, Invert selection, Properties, Options, Pin to Quick access, Map network drive, … |
| **Details** (far right) | Shows or hides the right-side Details pane |

The bar changes with context. Extra tools appear for certain items, e.g. **Extract all** for zip files, **Set as background** and **Rotate** for images, and **Empty Recycle Bin** / **Restore** in the Recycle Bin.

### 2.4 Navigation pane (left sidebar)
- Default width ~200–260px. It can be resized with a draggable divider.
- Sections from top to bottom:
  1. **Home**, **Gallery** (photo timeline), **OneDrive - Personal** (cloud icon)
  2. Divider
  3. **Pinned / Quick access** folders: Desktop, Downloads, Documents, Pictures, Music, Videos, each with a 📌 pin icon on the right
  4. Divider
  5. **This PC** (expands to drives), **Network**, **Linux** (if WSL is installed)
- Rows are ~32px tall (~24px in compact view), with a 16px icon and the label.
- Expand chevrons `>` only show when you hover the pane (unless "Show all folders" is on).
- Selected row: light gray fill and a **3px accent-colored pill** on the left edge. Hover: lighter gray fill. 4px rounded corners with a small inset margin.
- **Auto-expands** to show the current folder (optional setting).

### 2.5 Content area (file list)
This is where the files are shown. The look depends on the view mode (see §4). The background is white in light mode and nearly black in dark mode (it is a solid surface, not Mica).

### 2.6 Status bar
- Left side: `23 items` · `3 items selected  4.51 MB` (the size shows only for files, not folders). Some views add `Available on this device` / `Sync pending` for OneDrive.
- Right side: two small toggles, **Details view** and **Large icons view**.

### 2.7 Details pane / Preview pane (right side, optional)
- **Preview pane** (`Alt+P`): a live preview of the selected file, such as an image, a PDF, Office documents, text or code, or a video player. Shows `No preview available.` when it can't render the file.
- **Details pane** (`Alt+Shift+P`): a large thumbnail, the file name, a Share button, file type, size, dates, location, dimensions or length, and tags. Some properties can be edited. Newer builds also show OneDrive/Office **activity** ("You edited this").
- Only one of the two is visible at a time. The pane width can be resized.

---

## 3. Home page

What a new window or new tab opens to by default (can be changed to "This PC" in Folder Options).

1. **Quick access**: a grid of folder tiles (large icon and name, plus the parent location in small gray text, e.g. "Stored locally"). Pinned folders show a pin.
2. **Favorites**: files you starred.
3. **Recent**: a details-style list of recently opened files with columns *Name · Date accessed · Activity · File location*. Signed-in work accounts show a **Recommended** row of large file cards.
- Each section has a collapsible header with a `˅` chevron.

---

## 4. View modes

| View | Icon size | Layout | Notes |
|---|---|---|---|
| Extra large icons | 256px | Grid | Real thumbnails for images and videos |
| Large icons | 96px | Grid | Name centered under the icon, wraps to 2 lines, ellipsis after |
| Medium icons | 48px | Grid | |
| Small icons | 16px | Flowing grid, row by row | |
| List | 16px | Columns flowing top-to-bottom | Names only |
| **Details** | 16px | Table | Default for most folders |
| Tiles | 48px | Grid of cards | Name + type + size to the right of the icon |
| Content | 32–48px | Full-width rows | Name + extra properties (author, date, size) |

- `Ctrl + mouse wheel` steps smoothly through the icon sizes.
- **Each folder remembers its own view** (Downloads defaults to Details grouped by Date modified; Pictures defaults to Large icons).
- **Compact view** reduces padding: Details rows are ~32px normally and ~24px in compact view.

### 4.1 Details view specifics
- Default columns: **Name · Date modified · Type · Size**. Right-click the header to add more (Date created, Authors, Dimensions, Length, Tags, …).
- The sorted column shows a small chevron `˄`/`˅` **centered above** the header text.
- Columns can be resized (double-click the divider to auto-fit) and reordered by dragging.
- **Size** is always shown in KB, rounded up (`1 KB` minimum for files that aren't empty, `0 KB` for empty files, e.g. `12,345 KB`). Folders have a blank size. The status bar and Properties use KB/MB/GB with 3 significant digits.
- **Date format** follows the system locale, e.g. `06-10-2026 14:02` or `10/6/2026 2:02 PM`.
- **Type** is a friendly name: `File folder`, `Text Document`, `PNG File`, `Application`, `Compressed (zipped) Folder`.
- Hovering a row shows a light gray fill across the whole row. A selected row gets an accent-tinted fill (light blue in light mode). A focused row with no selection shows a dotted focus rectangle once you've used the keyboard.

### 4.2 Sorting and grouping
- **Folders always come before files** when sorting by name.
- **Natural sort**: `file2` comes before `file10`, and sorting ignores case.
- **Group by** (Name, Date modified, Type, Size, None): groups get collapsible headers like `Today`, `Yesterday`, `Earlier this week`, `Last week`, `Earlier this month`, `A long time ago`. Size groups are `Tiny (0–16 KB)`, `Small`, `Medium`, `Large`, `Huge`, `Gigantic`.

### 4.3 Icons and thumbnails
- Folders are the yellow Windows 11 folder (a slight 3D look). Folders that contain items show a **preview of their contents** peeking out (in Large icons and above).
- Images and videos show real thumbnails (videos get a film-strip frame). Documents show a small page preview where possible.
- Overlays: a shortcut arrow ↗ for shortcuts, OneDrive status (☁ cloud-only, ✓ green outline available, ✓ solid green always keep), a lock, and a **semi-transparent icon for hidden files**.
- Toolbar and command icons use the **Segoe Fluent Icons** font: monoline, 16px, 1px strokes.

---

## 5. Visual tokens

### 5.1 Color (approximate)
| Token | Light | Dark |
|---|---|---|
| Window chrome (Mica) | `#F3F3F3` (tinted) | `#202020` (tinted) |
| Content background | `#FFFFFF` | `#191919` |
| Primary text | `#1A1A1A` (≈ 90% black) | `#FFFFFF` |
| Secondary text | `#5E5E5E` | `#C5C5C5` |
| Disabled text | `#A0A0A0` | `#787878` |
| Hover fill | `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.06)` |
| Pressed fill | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.04)` |
| Selection fill | `#CCE8FF`-ish (accent tint) | `#4D4D4D`/accent-tint |
| Accent | `#0067C0` | `#4CC2FF` |
| Divider / stroke | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` |
| Drive bar (normal) | accent blue | accent blue |
| Drive bar (>90% full) | `#C42B1C` red | red |

Light/dark follows the system setting (Settings › Personalization › Colors) and switches instantly while the app is open.

### 5.2 Typography
- **Segoe UI Variable** (Text optical size). There is no separate "Explorer font".
- File names, list text and status bar: ~12–13px (9pt), Regular.
- Command bar labels and menus: ~14px, Regular.
- Home section headers: ~14px, **Semibold**.
- Names that don't fit are cut with an ellipsis `…`. The full name shows in a tooltip, or under the icon when an item in an icon view is selected.

### 5.3 Shape, depth and spacing
- Corner radius: **4px** for buttons, inputs, list items and tabs. **8px** for windows, context menus, flyouts and dialogs.
- Shadows only on floating surfaces (menus, tooltips, dialogs), soft and diffuse. The main surfaces are flat.
- Spacing grid of 4px. Common padding: 8 / 12 / 16px.
- Focus ring (keyboard): 2px outer white/black + 1px inner, rounded.

### 5.4 Motion
- Hover and pressed color changes: ~80–100ms ease.
- Context menus and flyouts slide/fade in from the cursor side (~150–200ms, decelerate curve).
- Navigating folders: the content simply swaps, with at most a quick fade. There is **no** page-slide.
- Tree expand/collapse: the chevron rotates, and the children appear at once.
- Loading slow folders (network, large): a **green progress fill runs across the address bar**, and items appear as they load.

---

## 6. Interactions

### 6.1 Navigation
- Double-click (or `Enter`) opens a folder in place, or opens a file in its default app.
- Middle-click or `Ctrl`+double-click a folder opens it in a **new tab**.
- `Backspace` / `Alt+←` go back. `Alt+→` goes forward. `Alt+↑` goes to the parent folder.
- Mouse side buttons (XButton1/2) go back and forward.
- Right-click Back/Forward to see the history list.
- Hovering over a sidebar folder while dragging something expands it after ~1s.

### 6.2 Selection
- Click selects one item. `Ctrl`+click toggles an item. `Shift`+click selects a range. `Ctrl+A` selects all.
- **Rubber-band (marquee) selection**: drag on empty space to draw a translucent accent-filled rectangle with a 1px accent border. The list auto-scrolls near the edges.
- Optional **item checkboxes** appear on hover and stay visible on selected items.
- **Type-ahead**: typing letters jumps to the first matching item. Typing quickly matches a prefix, and pausing (~1s) resets it.
- Clicking empty space clears the selection.

### 6.3 Rename
- `F2`, a slow second click on a selected name, or the context menu.
- An inline text box appears with **only the base name selected (not the extension)**.
- `Enter` confirms, `Esc` cancels. `Tab` / `Shift+Tab` confirm and move to rename the next or previous file.
- Characters that aren't allowed (`\ / : * ? " < > |`) are blocked as you type, and a tooltip balloon lists them.
- Changing the extension shows a warning: *"If you change a file name extension, the file might become unusable. Are you sure you want to change it?"*
- Selecting several files and pressing F2 renames them as a batch: `Name (1).jpg`, `Name (2).jpg`, …
- If the name is already taken, you're asked whether to rename it to `Name (2)`.

### 6.4 Create
- `Ctrl+Shift+N` creates a **New folder** and puts it straight into rename mode. Duplicate names become `New folder (2)`, `New folder (3)`.
- New › Text Document creates `New Text Document.txt`, also in rename mode.

### 6.5 Copy / move / paste
- `Ctrl+C/X/V`. Cut items appear **faded/semi-transparent** until they're pasted.
- Pasting into the same folder gives `file - Copy.txt`, then `file - Copy (2).txt`.
- Small operations finish silently. Longer ones (~>2s) open the **progress dialog**:
  - Title: *"Copying 128 items from Downloads to Backup"* and a percentage.
  - A **More details** expander shows a live **speed graph** (green area chart), Name, Time remaining, Items remaining, and Speed (`54.2 MB/s`).
  - Pause ⏸ and Cancel ✕ buttons. Several operations stack in one dialog.
  - The taskbar icon shows a green progress bar.
- **Name conflict** dialog: *"The destination has 3 files with the same names"* with the options **Replace the files in the destination**, **Skip these files**, and **Let me decide for each file** (shows both files side by side with size and date, with checkboxes). There is a "Do this for all conflicts" checkbox.
- Not enough space, file in use ("The action can't be completed because the file is open in …"), and permission (UAC shield "Continue") dialogs follow the same style.

### 6.6 Drag and drop
- Drag preview: a semi-transparent thumbnail stack with a **count badge**, plus a tooltip such as *"→ Move to Documents"* or *"+ Copy to USB Drive"*.
- Default action: **move** on the same drive, **copy** to a different drive. Holding `Shift` forces a move, `Ctrl` forces a copy, and `Alt` creates a shortcut.
- **Right-drag** drops show a menu: Copy here / Move here / Create shortcuts here / Cancel.
- You can drop onto folders in the list, the sidebar, breadcrumb segments, tabs (hovering a tab switches to it), and other apps or the desktop.

### 6.7 Delete
- `Delete` sends items to the **Recycle Bin** without asking (the default since Windows 8).
- `Shift+Delete` deletes permanently, after a confirmation: *"Are you sure you want to permanently delete this file?"*
- Files too big for the Recycle Bin ask to be deleted permanently.
- `Ctrl+Z` undoes the last rename, move, copy or delete. `Ctrl+Y` redoes.

### 6.8 Context menus (right-click)
**Windows 11 modern menu** (rounded 8px, acrylic background, icons):
- **Top icon row**: Cut · Copy · Rename · Share · Delete
- Open · Open with ▸ · *(Open in new tab / Open in new window for folders)* · Pin to Quick access / Pin to Start · Add to Favorites · Compress to ▸ (ZIP, 7z, TAR) · Copy as path · Properties
- App entries (VS Code, Photos edit, …), plus newer **AI actions** (e.g. ask Copilot about this file, image edits) on supported builds
- **Show more options** (`Shift+F10` or Shift+right-click) opens the classic Win32 menu with every legacy shell extension.

**Empty-space menu**: View ▸ · Sort by ▸ · Group by ▸ · Undo/Redo · New ▸ · Properties · Open in Terminal · Show more options.

Keyboard: `Shift+F10` or the Menu key. The first letter of an item activates it.

### 6.9 Search
- Type in the search box and results stream in as you type (after a short delay). The view switches to a **results list** with an extra *Folder / Location* column, and matching text is highlighted.
- The address bar shows `Search Results in Downloads`.
- **Search options** let you filter: Date modified, Kind, Size, Other properties, plus "Search in file contents" (indexed locations only).
- Advanced Query Syntax works: `kind:picture`, `ext:.pdf`, `size:>10MB`, `datemodified:last week`, `name:report`.
- Empty result: *"No items match your search."*
- Indexed locations are fast. Locations that aren't indexed crawl slowly, with the green progress bar in the address bar.

### 6.10 Keyboard shortcuts (essentials)
| Shortcut | Action |
|---|---|
| `Win+E` | Open File Explorer |
| `Ctrl+N` | New window |
| `Ctrl+T` / `Ctrl+W` | New tab / close tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` / `Ctrl+1…9` | Switch tabs |
| `Ctrl+Shift+N` | New folder |
| `F2` | Rename |
| `F3` / `Ctrl+F` / `Ctrl+E` | Search box |
| `F4` / `Alt+D` / `Ctrl+L` | Address bar |
| `F5` | Refresh |
| `F6` / `Tab` | Move focus between panes |
| `F11` | Full screen |
| `Alt+Enter` | Properties |
| `Alt+P` / `Alt+Shift+P` | Preview / Details pane |
| `Ctrl+Shift+1…8` | Change view (1 = Extra large … 6 = Details …) |
| `Ctrl+Shift+E` | Expand the sidebar to the current folder |
| `Num *` / `Num -` / `Num +` (sidebar) | Expand all / collapse / expand |
| Arrow keys, `Home`, `End`, `PgUp`, `PgDn` | Move the focus/selection |
| `Ctrl+Space` | Toggle selection of the focused item |
| `Shift+F10` | Context menu |

---

## 7. Special locations

- **This PC**: a "Devices and drives" group shown as **tiles with usage bars** (`Local Disk (C:)`, `45.2 GB free of 237 GB`). The bar turns red when the drive is nearly full. There is also a "Network locations" group. The command bar adds *Map network drive*, *Properties*, *Open Settings*.
- **Recycle Bin**: extra columns *Original Location* and *Date Deleted*. Commands: Empty Recycle Bin, Restore the selected items, Restore all items.
- **Gallery**: a photo timeline grouped by month, with a timeline scrubber on the right and a "Collection" dropdown for choosing source folders.
- **Network**: discovered PCs and media devices. If discovery is off, a yellow info bar says *"Network discovery is turned off…"*.
- **Archives (.zip, .7z, .rar, .tar)**: you can browse inside them like folders. Extract all opens a wizard. Creating ZIP/7z/TAR is supported (24H2+).
- **OneDrive folders**: a Status column with cloud icons, and a top-right OneDrive button showing sync status and storage.

---

## 8. Dialogs and secondary windows (classic Win32 style)

- **Properties** (`Alt+Enter`): tabs **General** (icon, name, type, location, size / size on disk, dates, attributes Read-only/Hidden), **Security** (ACL list), **Details** (metadata), **Previous Versions**. A folder's Properties adds **Sharing** and **Customize**. Buttons: OK · Cancel · Apply.
- **Folder Options** (··· › Options): **General** (open to Home/This PC, single vs double click, privacy toggles for recent files), **View** (a long checkbox list: hidden files, extensions, full path in the title bar, …), **Search**.
- **Open with**: a Windows 11 style list of apps, "Always / Just once".
- **Compressed (zipped) Folder Extraction** wizard.

---

## 9. Empty, loading and error states

- Empty folder: centered gray text *"This folder is empty."*
- Empty search: *"No items match your search."*
- Drive/folder unavailable: *"Location is not available. C:\…\ is not accessible."* in a dialog.
- Access denied: *"You don't currently have permission to access this folder. Click Continue to permanently get access…"* [🛡 Continue] [Cancel].
- Slow loads: the green address-bar progress plus *"Working on it…"* in the content area.

---

## 10. Small details that make it feel "right"

1. Folders first, natural sort, and remembered views per folder.
2. Rename selects the name without the extension.
3. Cut items appear faded.
4. Type-ahead jumps to items.
5. The breadcrumb chevrons open sibling-folder menus.
6. Clicking the address bar background turns it into a text path.
7. Rubber-band selection with auto-scroll.
8. Status bar item count and selection size update instantly.
9. Hover shows instantly and selection is tinted with the accent color, never harsh.
10. Copy dialog speed graph, and three-way conflict resolution.
11. `New folder (2)` and `file - Copy (2)` naming rules.
12. The window follows the system theme live, and the Mica chrome picks up the wallpaper tint.
13. Window state (size, position, sidebar width, pane visibility) is restored on reopen.
14. Tooltips (~500ms delay) on every icon-only button, showing the shortcut where there is one (e.g. "Cut (Ctrl+X)").
