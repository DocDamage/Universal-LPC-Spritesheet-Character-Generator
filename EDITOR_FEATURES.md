# Sprite Editor Features

This guide documents the desktop editor work on the `codex/editor-pro-tools` branch.
It is intended for users who want to edit sprites directly in the app and for
contributors who need a quick map of the editor, import, and asset-management
workflows.

## Getting to the Editor

Run the app with `npm run dev` and open the Vite URL, usually
`http://localhost:5173`. The editor is part of the desktop UI; do not open
`index.html` directly as a `file://` URL, because the app relies on HTTP-served
ES modules and generated metadata.

Select a body or gear part, then open its sprite editor from the desktop slot
controls. The editor saves changes as a new custom part so the original LPC
asset remains untouched.

## Editing Workspace

- **Canvas zoom:** use the zoom slider, `Ctrl++`, `Ctrl+-`, `Ctrl+0`, or scroll
  the mouse wheel over the editor canvas. Editor zoom currently ranges from `2x` to
  `16x`.
- **Fullscreen editor:** press `F` or use the fullscreen control. Fullscreen
  expands the editing surface and enables the pro editor tabs.
- **Direction views:** edit front, back, left, and right views from the direction
  thumbnails. When auto-propagation is enabled, front-view edits copy to the rear
  and side views; left and right side changes are mirrored rather than placed at
  the same x-position.
- **Tooltips:** buttons, sliders, import controls, and editor tabs include hover
  titles with their purpose and shortcut where applicable.
- **Status bar:** a bottom bar shows the current cursor pixel position `(x,y)`,
  active direction, zoom level, active layer name, brush size, and frame number
  (when in frame mode).

## Base Tools

The standard editor tools are available in normal and fullscreen mode:

| Tool       | Shortcut                   | Notes                                                 |
| ---------- | -------------------------- | ----------------------------------------------------- |
| Pencil     | `B` or `P`                 | Hold `Shift` while drawing for straight-line strokes. |
| Eraser     | `E`                        | Removes pixels on the active layer.                   |
| Eyedropper | `I`                        | `Alt` temporarily samples a color while drawing.      |
| Undo       | `Ctrl+Z`                   | Restores the previous editor history state.           |
| Redo       | `Ctrl+Y` or `Ctrl+Shift+Z` | Reapplies the next editor history state.              |
| Brush size | `[` / `]`                  | Decreases or increases the brush size.                |

## Fullscreen Pro Tools

Fullscreen adds the pro editor panel, split into **Edit** and **Animation** tabs.

The **Edit** tab adds:

- Marquee selection with drag-to-move, arrow-key nudging, `Ctrl+C`, `Ctrl+V`,
  `Ctrl+D`, `Delete` / `Backspace`, and `Esc`.
- **Selection upgrades:** copy/paste works across directions (left/right
  selections auto-mirror when pasted). Arrow keys nudge the selection 1px at a
  time, or 10px when `Shift` is held. Flip, rotate, and clear operate on the
  selection only when one is active; otherwise they affect the whole layer.
- Shape tools for line, rectangle, and ellipse drawing, with an optional fill
  toggle.
- Flood fill.
- Extracted palette chips from the visible sprite plus color replacement with
  tolerance and optional all-direction replacement.
- Transform tools for flip horizontal, flip vertical, rotate clockwise, rotate
  counterclockwise, and clear.
- Symmetry toggles for mirrored strokes across the x-axis or y-axis.
- Pixel grid toggle and editor zoom reset.

The **Animation** tab adds:

- A dedicated timeline area separated from the paint tools.
- **Live playback:** a play/pause button loops through animation frames at
  200 ms per frame.
- **Scrubbable timeline:** a strip of frame thumbnails lets you click any frame
  to jump directly to it.
- **Per-frame dirty indicators:** small dots appear on frames that carry edits,
  so you can see at a glance which frames differ from the global base.
- **Apply Global to Frame:** a button copies the global standing-frame edits
  into the currently selected frame.
- Global mode for standing-frame edits and frame mode for per-animation-frame
  edits.
- Animation selection and frame navigation.
- Onion-skin previews of neighboring frames with adjustable ghost opacity.
- `,` and `.` shortcuts for previous and next animation frame.

## Animation Tweening and Export Progress

This session added generated tweening for sprite animation previews and ZIP
exports:

- **Preview controls:** the animation preview now supports Off, Hold,
  Crossfade, and Pixel Motion tween modes, with presets, configurable
  in-between frames, FPS, and per-animation overrides.
- **Pixel-art-friendly motion:** Pixel Motion estimates opaque-pixel movement
  between neighboring frames and shifts silhouettes instead of blending colors.
  Motion strength and alpha threshold can be tuned from the preview controls.
- **State persistence:** tween mode, in-between count, and playback FPS live in
  app state with preset, tuning, and override data, and are reset with the rest
  of the character state.
- **Individual-frame ZIPs:** when tweening is enabled, exports include tween
  PNGs beside the original source frames and record the tween settings in
  metadata.
- **Split-by-animation ZIPs:** original `standard/` and `custom/` spritesheets
  remain unchanged, while generated tweened sheets are added under
  `tweened/standard/` and `tweened/custom/`.
- **Export README and estimates:** tween-enabled ZIPs include
  `credits/TWEEN_EXPORT_README.txt`, metadata now records global settings,
  per-animation overrides, and estimated generated frame counts, and large
  tween exports ask for confirmation.
- **Animated preview export:** the Download panel can export the currently
  selected animation preview as an animated GIF using the active tween settings.
- **Download hint:** export controls surface a short "Tween frames enabled"
  notice so users know ZIP exports will include generated frames.
- **Coverage:** tween helpers, ZIP metadata/paths, recomposed tweened sheets,
  settings helpers, GIF encoding, and the download hint are covered by focused
  tests.

## Autosave & Recovery

The editor automatically saves a draft of your work to IndexedDB every time the
history changes (debounced to 500 ms). If you refresh the page or the browser
crashes, the next time you open the same part you will see a recovery prompt
asking whether to restore the draft or discard it.

A **"You have unsaved changes"** warning appears if you try to close the editor
or leave the page while edits are pending. The draft is cleared automatically
once you click **Save as New Custom Part**.

## Layers

The editor supports an open-ended layer stack. Add as many layers as the browser
can comfortably handle for the current sprite.

Layer actions include:

- Add new layer with `Ctrl+Shift+N`.
- Duplicate active layer with `Ctrl+J`.
- Move the active layer up or down.
- Merge the active layer down with `Ctrl+E`.
- Flatten visible layers with `Ctrl+Shift+E`.
- Delete the active layer when more than one layer exists.
- Toggle layer visibility.
- Rename layers inline.
- Adjust layer opacity (slider changes are debounced to avoid redundant redraws).
- Toggle pixel lock with `/`.
- Toggle alpha lock with `?` or `Shift+/`.

Layer state is included in editor history snapshots, so undo and redo preserve
layer content, visibility, opacity, locks, names, active layer, and direction
canvases.

## Custom Weapons and Tools

Weapon/tool slots now support importing your own PNG assets.

The importer can:

- Import a single image and align it to the visible bounds of a built-in
  reference weapon or tool.
- Import a full LPC-style sheet and preserve its authored frame placement.
- Align standard weapon animations and custom tool animations when the selected
  reference asset supports them.
- Preserve right-facing orientation for full-sheet imports and mirror
  single-image imports for right-facing rows.
- **Better alignment UI:** a side-by-side preview shows the reference asset and
  the imported image overlaid with hand/socket guide crosshairs. Use **Reset
  alignment** to zero offsets, **Center on reference** to auto-center the import,
  and **Nudge by 1px** arrow buttons for fine-tuning.
- Mirror side-row x-offsets so left/right adjustments stay symmetrical.
- Save imported assets as custom parts backed by IndexedDB.
- Keep saved imports available in the slot library with select, rename, and
  delete controls.
- Switch the preview to a custom animation automatically when an imported tool
  includes one.

The reference asset controls the destination slot, z-position, animation list,
and custom animation support. The imported part is registered as a custom asset
and can be selected like a built-in option.

## Custom Asset Library Management

Saved custom parts and imports can be organized with **tags**. Type a tag when
saving (or edit it later) and filter the library list by tag.

Library actions for each asset:

- **Select** — equip the asset on the character.
- **Rename** — change the display name.
- **Duplicate** — create a copy with a new ID and a "(Copy)" suffix.
- **Delete** — remove the asset from IndexedDB.

**Export / Import backup:** use the **Export All** button to download a ZIP
containing a `manifest.json` plus one PNG per animation sheet. Use **Import
Backup** to restore assets from a previously exported ZIP.

## App Shortcuts

Global shortcuts work outside text inputs and editor form fields. Shortcuts are
now **customizable** — open the keyboard-shortcuts modal (`Ctrl+/`) and click
any entry to rebind it. Conflicting shortcuts are highlighted in red. A
**Reset to defaults** button restores the original key map.

| Action                           | Default shortcut   |
| -------------------------------- | ------------------ |
| Open command palette             | `Ctrl+K`           |
| Show keyboard shortcuts          | `Ctrl+/`           |
| Zoom in                          | `Ctrl++`           |
| Zoom out                         | `Ctrl+-`           |
| Reset zoom                       | `Ctrl+0`           |
| Save character JSON to clipboard | `Ctrl+S`           |
| Export PNG spritesheet           | `Ctrl+Shift+E`     |
| Export credits CSV               | `Ctrl+Shift+C`     |
| Reset all selections             | `Ctrl+Alt+R`       |
| Randomize all slots              | `Ctrl+Alt+Shift+R` |
| Body tab                         | `Ctrl+1`           |
| Gear tab                         | `Ctrl+2`           |
| Fullscreen editor                | `F`                |
| Fullscreen editor Edit tab       | `1`                |
| Fullscreen editor Animation tab  | `2`                |

The command palette lists available commands and is the best place to discover
keyboard-driven actions.

## Mobile / Touch Editing

The editor includes a dedicated pass for touch devices:

- **Two-finger pan & pinch-zoom** on the canvas: drag two fingers to pan the
  view, pinch to zoom in or out.
- **Larger touch targets:** on devices without a hover pointer (`hover: none`),
  buttons, sliders, and layer controls expand to finger-friendly sizes.
- **Stacked mobile layout:** when a touch screen is detected (or the viewport is
  narrower than 768 px), the editor switches to a vertical stack: the canvas
  sits on top and the pro panel becomes a full-width accordion below it.

## Performance

Several optimizations keep the editor responsive even with large edit histories:

- **Thumbnail caching:** the 64×64 direction thumbnails are cached in memory and
  only invalidated when layers actually change.
- **Debounced slider redraws:** layer opacity and other slider inputs wait 100 ms
  after the last movement before triggering a full canvas recomposition.
- **Batched layer recomposition:** redundant `clearRect` + `drawImage` cycles are
  coalesced during rapid edits so the browser does less work per frame.

## Notifications

The app now uses a shared in-app notification and confirmation layer instead of
native browser alerts. Save/export actions, reset/randomize confirmations,
custom import deletion, zip export progress, filter warnings, and command
failures all report through the same toast and modal system in both the desktop
and legacy app mounts.

## Contributor Map

The primary implementation points are:

- `sources/components/desktop/PartEditor.ts` for the pixel editor, fullscreen
  pro tools, layers, animation tab, shortcuts, autosave/recovery, status bar,
  selection upgrades, and editor save flow.
- `sources/components/desktop/pixel-editor-tools.ts` for brush, fill, line,
  shape, selection, and canvas editing helpers.
- `sources/state/editor-autosave.ts` for IndexedDB draft persistence and
  recovery prompts.
- `sources/components/desktop/custom-weapon-import.ts` for reference-based
  weapon/tool alignment.
- `sources/components/desktop/SlotSelector.ts` for import controls, alignment
  preview, and saved custom asset library UI (tags, export/import ZIP,
  duplicate).
- `sources/state/catalog.ts` and `sources/state/custom-parts-storage.ts` for
  custom part registration, IndexedDB persistence, tags, and ZIP backup
  export/import.
- `sources/state/commands.ts` for the global command registry, command palette
  shortcuts, and editor command titles.
- `sources/state/shortcut-preferences.ts` for user-customizable shortcut
  overrides, conflict detection, and localStorage persistence.
- `sources/components/desktop/ShortcutHelpModal.ts` for the editable shortcut
  map UI.
- `sources/state/notifications.ts` and `sources/components/notifications/*`
  for toasts and confirmations.
- `sources/canvas/tween.ts`, `sources/state/tween-settings.ts`, and
  `sources/canvas/preview-gif.ts` for tween modes, presets, export estimates,
  per-animation overrides, and animated GIF preview export.
- `tests/visual/editor-e2e.spec.js` for Playwright end-to-end coverage of the
  editor (open, fullscreen, zoom, draw, save, reload persistence).

For editor changes, start with:

```bash
npm run type-check
npm run test:node
node ./node_modules/testem/testem.js ci --launch "headless chrome"
```

Use `npm run test:visual` when a change affects layout, fullscreen rendering,
or visible editor controls.
