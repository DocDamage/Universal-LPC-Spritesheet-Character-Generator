# Architecture — Universal LPC Spritesheet Character Generator

**Last updated:** 2026-06-08  
**Enforced by:** `eslint.config.js` (`@typescript-eslint/no-restricted-imports`)  
**Source layers:** `sources/components/`, `sources/state/`, `sources/canvas/`, `sources/utils/`

---

## Dependency Graph

```
┌─────────────────────────────────────────┐
│           components/                   │
│  (Mithril UI, desktop/mobile shells)    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│              state/                     │
│  (catalog, selections, hash, zip,       │
│   notifications, commands, palettes)      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│              canvas/                    │
│  (renderer, image loading, recolor,   │
│   tween, draw-frames, download)         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│               utils/                    │
│  (zip-helpers, credits, debug,        │
│   fileName, helpers)                    │
└─────────────────────────────────────────┘
```

### Rules

1. **components** may import from **state**, **canvas**, and **utils**.
2. **state** may import from **canvas** and **utils**.  
   *Exception:* `state/` must **not** import from `components/`.
3. **canvas** may import from **utils**.  
   *Exception:* `canvas/` may import `render-state.ts` from `state/` (it is the shared render-state container).  
   `canvas/` must **not** import any other `state/` module.
4. **utils** is the bottom layer — it must **not** import from **components**, **state**, or **canvas**.

---

## Why This Layering?

The original codebase had a severe circular-dependency problem:

- `state.ts` → `canvas/renderer.ts`  
- `canvas/renderer.ts` → `state/state.ts`

This meant the state layer was not a leaf. Unit-testing state in isolation required mocking the entire rendering pipeline and UI toolkit. By moving the mutable render state (`drawCalls`, `addedCustomAnimations`, `customAreaItems`) into `state/render-state.ts`, the canvas layer can write to it without importing the full state module, breaking the cycle.

---

## Module Responsibilities

| Layer | Responsibility | Key Files |
|-------|-----------------|-----------|
| `components/` | Mithril v2 UI components, event handling, layout | `App.ts`, `DesktopApp.ts`, `PartEditor.ts`, `SlotSelector.ts` |
| `state/` | Application state, catalog DI, URL hash sync, export logic | `state.ts`, `catalog.ts`, `hash.ts`, `zip.ts`, `render-state.ts` |
| `canvas/` | Offscreen canvas rendering, image loading, palette recoloring, tweening | `renderer.ts`, `load-image.ts`, `palette-recolor.ts`, `tween.ts` |
| `utils/` | Pure helpers, ZIP packaging, credit formatting, debug logging | `zip-helpers.ts`, `credits.ts`, `debug.ts`, `helpers.ts` |

---

## Render-State Exception

`state/render-state.ts` is the single allowed cross-layer bridge. It lives in `state/` but is written to by `canvas/renderer.ts` and read by `state/zip.ts`, `state/commands.ts`, and `state/tween-settings.ts`. This is intentional: the render output is conceptually "state produced by the canvas layer" and needs to be accessible to state-layer export logic.

---

## Enforcement

ESLint `@typescript-eslint/no-restricted-imports` is configured in `eslint.config.js` to reject violations. If you need to add a new exception, update both this document and the ESLint config so they stay in sync.
