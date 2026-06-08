# Sprite Editor Features

This guide documents the desktop editor work added on the
`codex/editor-pro-tools` branch. It is intended for users who want to edit
sprites directly in the app and for contributors who need a quick map of the
new editor and import workflows.

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
  the mouse wheel over the editor canvas. Editor zoom currently ranges from
  `2x` to `16x`.
- **Fullscreen editor:** press `F` or use the fullscreen control. Fullscreen
  expands the editing surface and enables the pro editor tabs.
- **Direction views:** edit front, back, left, and right views from the direction
  thumbnails. When auto-propagation is enabled, front-view edits copy to the
  rear and side views; left and right side changes are mirrored rather than
  placed at the same x-position.
- **Tooltips:** buttons, sliders, import controls, and editor tabs include hover
  titles with their purpose and shortcut where applicable.

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

- Marquee selection with drag-to-move, arrow-key nudging, `Ctrl+C`,
  `Ctrl+V`, `Ctrl+D`, `Delete` / `Backspace`, and `Esc`.
- Shape tools for line, rectangle, and ellipse drawing, with an optional fill
  toggle.
- Flood fill.
- Extracted palette chips from the visible sprite plus color replacement with
  tolerance and optional all-direction replacement.
- Transform tools for flip horizontal, flip vertical, rotate clockwise, rotate
  counterclockwise, and clear. These operate on the selection when one exists,
  otherwise on the active layer.
- Symmetry toggles for mirrored strokes across the x-axis or y-axis.
- Pixel grid toggle and editor zoom reset.

The **Animation** tab adds:

- A dedicated timeline area separated from the paint tools.
- Global mode for standing-frame edits and frame mode for per-animation-frame
  edits.
- Animation selection and frame navigation.
- Onion-skin previews of neighboring frames with adjustable ghost opacity.
- `,` and `.` shortcuts for previous and next animation frame.

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
- Adjust layer opacity.
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
- Apply manual tuning after auto-alignment with x-offset, y-offset, and scale
  controls.
- Mirror side-row x-offsets so left/right adjustments stay symmetrical.
- Save imported assets as custom parts backed by IndexedDB.
- Keep saved imports available in the slot library with select, rename, and
  delete controls.
- Switch the preview to a custom animation automatically when an imported tool
  includes one.

The reference asset controls the destination slot, z-position, animation list,
and custom animation support. The imported part is registered as a custom asset
and can be selected like a built-in option.

## App Shortcuts

Global shortcuts work outside text inputs and editor form fields:

| Action                           | Shortcut           |
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

## Notifications

The app now uses a shared in-app notification and confirmation layer instead of
native browser alerts. Save/export actions, reset/randomize confirmations,
custom import deletion, zip export progress, filter warnings, and command
failures all report through the same toast and modal system in both the desktop
and legacy app mounts.

## Contributor Map

The primary implementation points are:

- `sources/components/desktop/PartEditor.ts` for the pixel editor, fullscreen
  pro tools, layers, animation tab, shortcuts, and editor save flow.
- `sources/components/desktop/pixel-editor-tools.ts` for brush, fill, line,
  shape, selection, and canvas editing helpers.
- `sources/components/desktop/custom-weapon-import.ts` for reference-based
  weapon/tool alignment.
- `sources/components/desktop/SlotSelector.ts` for import controls and saved
  custom asset library UI.
- `sources/state/catalog.ts` and `sources/state/custom-parts-storage.ts` for
  custom part registration and IndexedDB persistence.
- `sources/state/commands.ts` for the global command registry, command palette
  shortcuts, and editor command titles.
- `sources/state/notifications.ts` and `sources/components/notifications/*`
  for toasts and confirmations.

For editor changes, start with:

```bash
npm run type-check
npm run test:node
node ./node_modules/testem/testem.js ci --launch "headless chrome"
```

Use `npm run test:visual` when a change affects layout, fullscreen rendering,
or visible editor controls.
