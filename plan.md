# LPC Character Generator — Editor Enhancement Plan

## Overview

Implement 10 major editor enhancements for the Universal LPC Spritesheet Character Generator.

## Current State

- Branch: `codex/editor-pro-tools`
- Baseline commit: `3228f6373d` (established agent baseline)
- Stack: Mithril.js + TypeScript + Vite + Bulma CSS + Playwright + Testem
- Key files:
  - `sources/components/desktop/PartEditor.ts` (3753 lines) — main pixel editor
  - `sources/components/desktop/custom-weapon-import.ts` — weapon/tool import alignment
  - `sources/components/desktop/SlotSelector.ts` — slot controls + custom asset library UI
  - `sources/state/commands.ts` — global command registry + shortcuts
  - `sources/state/custom-parts-storage.ts` — IndexedDB persistence for custom parts
  - `sources/components/desktop/pixel-editor-tools.ts` — brush, fill, selection, canvas helpers
  - `tests/visual/` — Playwright E2E tests
  - `styles/` — SCSS/CSS styles

## Task Groups

### Worker 1: Editor Core (PartEditor.ts + pixel-editor-tools.ts + new modules)

**Tasks:** 1 (Autosave), 2 (Status bar), 5 (Selection upgrades), 6 (Animation polish), 8 (Mobile/touch), 9 (Performance polish)

**Deliverables:**

- **Autosave & Recovery:**
  - New module `sources/state/editor-autosave.ts` with IndexedDB storage for draft edits
  - Auto-save on every history change (debounced 500ms)
  - Recovery prompt on editor open if draft exists
  - "Unsaved changes" warning before closing editor (beforeunload + custom confirm)
  - Clear autosave on successful save
- **Status Bar:**
  - Bottom status bar in editor showing: cursor pixel position (x,y), active direction, zoom level, active layer name, brush size, frame number (in frame mode)
  - Update on mousemove over canvas
- **Selection Upgrades:**
  - Copy/paste between directions (Ctrl+C/Ctrl+V works across directions)
  - Move selection with arrow keys (1px normal, 10px with Shift)
  - Flip/rotate selected pixels only (when selection exists, apply to selection; otherwise layer)
  - Nudge selection by 1px or 10px (already partially implemented, verify and enhance)
- **Animation Polish:**
  - Live playback inside Animation tab (play/pause button, loop through frames)
  - Scrubbable timeline (click/drag on frame strip to jump to frame)
  - Per-frame dirty indicators (dot on frames that have edits)
  - "Copy global edits into selected frames" button (applies global context to current frame)
- **Mobile/Touch:**
  - Two-finger pan/zoom on canvas (touchmove with 2 touches)
  - Larger tool controls on touch devices (CSS media query `hover: none`)
  - Dedicated mobile editing layout (stacked panels, full-width canvas)
- **Performance Polish:**
  - Thumbnail caching for custom parts/imports (cache 64x64 thumbnails in memory + sessionStorage)
  - Faster layer recomposition for large edit histories (batch canvas operations, avoid per-layer clearRect when possible)
  - Avoid unnecessary redraws while moving sliders (debounce slider oninput, only redraw on onchange or after 100ms idle)

### Worker 2: Import, Shortcuts & Asset Library

**Tasks:** 3 (Import alignment UI), 4 (Editable shortcuts), 7 (Custom asset library)

**Deliverables:**

- **Better Import Alignment UI:**
  - Overlay imported weapon/tool against reference asset in import panel (side-by-side canvas preview)
  - Hand/socket guide markers (draw crosshairs at estimated grip point)
  - "Reset alignment" button (sets offsetX/Y to 0, scale to 100)
  - "Center on reference" button (auto-center imported image on reference bounds)
  - "Nudge by 1px" controls (arrow buttons around offset fields)
- **Editable Shortcut Map:**
  - New module `sources/state/shortcut-preferences.ts` with localStorage persistence
  - UI in ShortcutHelpModal to edit shortcuts (click shortcut → press new keys)
  - Conflict detection (highlight duplicate shortcuts)
  - Reset to defaults button
  - Load preferences on app init, apply to commands.ts
- **Custom Asset Library Management:**
  - Folders/tags for imported tools and edited parts (tag input in save flow, filter by tag in library)
  - Export custom assets as backup zip/json (new button in SlotSelector, uses JSZip)
  - Import custom assets from backup zip/json (file input, validate, merge)
  - Duplicate custom assets ("Duplicate" button next to rename/delete)

### Worker 3: E2E Tests

**Task:** 10 (More E2E coverage)

**Deliverables:**

- Playwright tests in `tests/visual/editor-e2e.spec.js`:
  - Open editor from slot selector
  - Toggle fullscreen mode
  - Wheel zoom on canvas
  - Drawing on canvas (pen tool, verify pixel change)
  - Save custom part
  - Reload import (verify custom part persists after reload)
- Update `playwright.config.js` if needed for editor test isolation

## Shared Contracts

### PartEditor.ts Integration Points

- Worker 1 owns all PartEditor.ts changes. Do not modify PartEditor.ts in other workers.
- New modules should export clean APIs:
  - `editor-autosave.ts`: `saveDraft(state)`, `loadDraft(itemId): Promise<Partial<PartEditorState>|null>`, `clearDraft(itemId)`, `hasUnsavedDraft(itemId)`
  - `shortcut-preferences.ts`: `loadShortcutPrefs()`, `saveShortcutPrefs(prefs)`, `getShortcut(commandId)`, `resetShortcuts()`

### CSS Conventions

- Use existing BEM-style classes: `.part-editor-*`, `.desktop-slot-*`
- Mobile styles: add `.part-editor-mobile` class when touch detected, use `@media (hover: none)`
- Status bar: `.part-editor-status-bar`

### Test Conventions

- Browser tests: `tests/components/desktop/PartEditor_spec.js` for unit-style
- Node tests: `tests/node/state/editor-autosave_spec.js` for autosave logic
- Playwright: `tests/visual/editor-e2e.spec.js` for E2E

## Merge Order

1. Worker 1 (Editor Core) — largest, establishes new APIs
2. Worker 2 (Import/Shortcuts/Assets) — independent, touches different files
3. Worker 3 (Tests) — independent

## Validation Commands

```bash
npm run type-check
npm run test:node
node ./node_modules/testem/testem.js ci --launch "headless chrome"
npm run test:visual
```

## Worktrees

- Main: `D:/LPC character generator/LPC character generator/Universal-LPC-Spritesheet-Character-Generator`
- Worker 1: `D:/LPC character generator/LPC character generator/Universal-LPC-Spritesheet-Character-Generator/../.worktrees/editor-core`
- Worker 2: `D:/LPC character generator/LPC character generator/Universal-LPC-Spritesheet-Character-Generator/../.worktrees/import-shortcuts-assets`
- Worker 3: `D:/LPC character generator/LPC character generator/Universal-LPC-Spritesheet-Character-Generator/../.worktrees/e2e-tests`
