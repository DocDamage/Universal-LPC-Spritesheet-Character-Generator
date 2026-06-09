# Technical Debt Audit — Universal LPC Spritesheet Character Generator

**Date:** 2026-06-08  
**Scope:** Full codebase (`sources/`, `tests/`, `scripts/`, `vite/`, build config, dependencies)  
**Method:** Static analysis + automated tool output + targeted code review

**Refresh:** 2026-06-08 post-remediation review. The branch now passes `npm run lint`, `npm run type-check`, `npm run test:node`, `npm test`, `npm run build`, and `npm run test:visual`. Several P0/P1 items from the original audit have been addressed; unresolved debt is kept below as refactor guidance.

---

## Executive Summary

| Dimension        | Debt Level  | Key Signal                                                                                                           |
| ---------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Architecture     | Medium-High | Editor split improved, but `panels.ts`, `SlotSelector.ts`, `PartEditor.ts`, `zip.ts`, and `renderer.ts` remain large |
| Type Safety      | Medium      | Sources are type-checked; tests/scripts still commonly use `@ts-nocheck`                                             |
| Test Suite       | Medium      | Node, browser, and visual suites are green; runner split and visual-test noise remain                                |
| Build / Tooling  | Medium      | Vite workaround plugins, generated-file workflow, and `tsgo` dependency still require care                           |
| Dependencies     | Medium      | 18 outdated packages; 3 security vulns (moderate); unused deps flagged                                               |
| State Management | Medium-High | Global mutable singleton and render-state coupling remain                                                            |
| Documentation    | Low         | README/CONTRIBUTING now document the verification matrix; architecture docs still need ongoing maintenance           |

**Project health snapshot:**

- **Sources:** 83 `.ts` files, ~25,900 LOC (full TS migration complete in `sources/`)
- **Tests:** 91 `.js` files, ~22,100 LOC (zero TypeScript in tests)
- **Scripts:** ~5,800 LOC, mixed modern/legacy patterns
- **Recent commit velocity:** 174 commits since 2024; 17% are bug-fixes, 10% are refactors

---

## 1. Architecture Debt

### 1.1 Large Files (Single Responsibility Pressure)

| File                                               | Lines     | Responsibilities                                                                                                                      |
| -------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `sources/components/desktop/part-editor/panels.ts` | **1,295** | Pro editor panel rendering and UI state wiring                                                                                        |
| `sources/components/desktop/SlotSelector.ts`       | **1,194** | Slot dropdown, import UI, custom asset controls, color picker, nudge controls                                                         |
| `sources/components/desktop/PartEditor.ts`         | **1,070** | Editor coordinator across canvas, animation, save, history, keyboard, touch, and panel modules                                        |
| `sources/state/zip.ts`                             | **984**   | ZIP export flows, progress, path assembly, image rendering, archive assembly                                                          |
| `sources/canvas/renderer.ts`                       | **909**   | Draw-call building, image loading, z-sorting, custom animation composition, canvas resizing, palette recoloring, profiler measurement |

**Impact:** The editor split reduced the largest god component substantially, but these files are still review and merge-conflict hotspots. Future refactors should be small and covered by the existing green test lanes.

### 1.2 Circular / Layer-Violating Dependencies

The intended layering (components → state → canvas → utils) is broken in both directions:

**State imports from Canvas (4 modules):**

- `state.ts:5` → `canvas/renderer.ts`
- `tween-settings.ts:9` → `canvas/renderer.ts`
- `commands.ts:13` → `canvas/renderer.ts`
- `preview-canvas-loading.ts:9` → `canvas/renderer.ts`

**Canvas imports from State (4 modules):**

- `palette-recolor.ts:14` → `state/state.ts`
- `preview-animation.ts:2` → `state/state.ts`
- `preview-gif.ts:5` → `state/state.ts`
- `preview-webp.ts:6` → `state/state.ts`

**State imports from Components (layer violation):**

- `commands.ts:4` → `components/desktop/slot-config.ts`
- `commands.ts:15` → `components/desktop/pixel-editor-tools.ts`

**Impact:** The state layer is not a leaf. Unit testing state in isolation requires mocking the entire rendering pipeline and UI toolkit.

### 1.3 Global Mutable State Dressed as Module Exports

`sources/canvas/renderer.ts:193-197` exports mutable module-level variables (`canvas`, `ctx`, `drawCalls`, `addedCustomAnimations`, `customAreaItems`) that are imported by 5+ modules. This is global state masquerading as clean exports.

### 1.4 Duplicate Render-Trigger Logic

Both `App.ts:38-65` and `DesktopApp.ts:49-67` implement identical state-diff → render → hash-sync logic. This should live in one middleware subscription, not two root components.

### 1.5 Direct DOM Queries Inside Mithril Views

- `SlotSelector.ts:621-648` — `document.getElementById` inside `view()`
- `PartEditor.ts:620+` — Similar canvas preview pattern

These break Mithril's virtual-DOM abstraction and can target stale elements.

---

## 2. Type Safety Debt

### 2.1 Pervasive Type Assertions

| Pattern           | Count   | Risk                                         |
| ----------------- | ------- | -------------------------------------------- |
| `as` assertions   | **426** | Bypass compiler; hide refactor breakage      |
| `as unknown as X` | ~12     | Most severe; usually signals schema mismatch |
| `any`             | **20**  | Complete type abdication                     |

**Notable `as unknown as` hotspots:**

- `catalog.ts:410,460,545,603,615,791,803` — Fixture metadata coercion
- `resolve-hash-param.ts:67,100,124,140` — Interned item expansion
- `state.ts:40` — `window.canvasRenderer` access

### 2.2 `unknown` Used as a Crutch

- `catalog.ts:357,395,767` — `Record<string, unknown>` for fixture metadata instead of a proper `FullItemMetadata` type
- `palette-recolor.ts:236` — `Result<unknown, LoadPaletteError>`
- `state.ts:27` — `getCanvasRenderer: () => unknown`

### 2.3 Disabled Strictness Flags (with lingering TODOs)

`tsconfig.json` deliberately disables three `@tsconfig/strictest` flags:

- `noUncheckedIndexedAccess: false` — TODO says "revisit once we have migrated to ts completely". Migration **is** complete in `sources/`; TODO is stale.
- `noPropertyAccessFromIndexSignature: false` — Same stale TODO.
- `exactOptionalPropertyTypes: false` — Justified by JSON/external data.

Additionally, `checkJs: false` means **zero type checking on `scripts/` and `tests/`**, even though `scripts/` is included in `tsconfig.json`.

### 2.4 Unsafe Non-Null Assertions

- `hash.ts:212` — Non-null assertion on a fallback chain
- `renderer.ts:524-527` — `spritePath` used as cache key despite `null` possibility
- `zip.ts:302` — `state!` inside profiler callback

---

## 3. State Management Debt

### 3.1 Global Mutable Singleton

`sources/state/state-model.ts:79` exports a single mutable `state: State` object. The code itself admits the smell: "Global application state. Mutated in place; Mithril views observe via redraw."

**Consequences:**

- **No change tracking** — `App.ts` and `DesktopApp.ts` diff via `JSON.stringify(state.selections)`, which is O(n) on every redraw.
- **Untraceable mutations** — Any file can `import { state }` and mutate nested properties.
- **Duplicate flags** — `isRenderingCharacter` and `renderCharacter.isRendering` represent the same semantic state (the comment literally says "Duplicate of `isRenderingCharacter` consumed by `renderer.js`").

### 3.2 Hash Module Spaghetti

`sources/state/hash.ts` (529 lines) mixes URL parsing, selection reconstruction, custom-part resolution, alias resolution, sub-item lookup, and profiler instrumentation. Sub-item key reconstruction uses an empty string separator (`subItemKeySeparator = ""`), making the logic extremely hard to follow.

### 3.3 Half-Complete Catalog DI Migration

`sources/state/catalog.ts:700-779` contains ~80 lines of legacy free-function exports delegating to `defaultCatalog`. The comment says: "Phase Final of the migration deletes everything between these comment fences". This transitional code has survived multiple commits and adds surface area without value.

---

## 4. Test Suite Debt

### 4.1 Three Test Lanes

| Lane    | Runner         | Assertion                | Mocking                          |
| ------- | -------------- | ------------------------ | -------------------------------- |
| Browser | Testem + Mocha | Chai (`expect`)          | Sinon                            |
| Node    | Vitest         | Vitest / Node assertions | Manual monkey-patching + helpers |
| Visual  | Playwright     | Playwright `expect`      | Page-level automation            |

**Debt:** Developers must remember multiple APIs. Browser specs cannot run in Node for fast CI feedback. `testem.cjs` chains the lanes: `before_tests: "node ./tests/node/run-node-tests.js"`, so Node failures block the browser suite.

### 4.2 Resolved: Previously Orphaned Spec Files

These files are now included in the browser suite and were verified by `npm test`:

1. `tests/components/download/ExportWizard_spec.js` (156 lines)
2. `tests/state/custom-asset-validation_spec.js` (173 lines)
3. `tests/state/export-options_spec.js` (233 lines)
4. `tests/state/export-progress_spec.js` (246 lines)

This resolved the original P0 "dead test code" finding.

### 4.3 Visual Tests: Hard Sleeps & Duplication

- `tests/visual/editor-e2e.spec.js`: **19 hard `waitForTimeout` calls**, including two `3000ms` sleeps for IndexedDB persistence.
- `tests/visual/test_dropdowns.spec.js`: **6 hard sleeps**, plus a Part Editor test largely duplicated by `editor-e2e.spec.js`.
- `home-helpers.js`: Swallows `networkidle` timeout — "Some environments never reach idle; continue."

### 4.4 Mocking Inconsistency

- **Browser tests:** Clean Sinon sandboxes.
- **Node tests:** Manual `fs.writeFileSync = ...`, `console.error = ...`, `Object.defineProperty(process, "platform", ...)` patches. Verbose, leak-prone, inconsistent.

### 4.5 Flaky Timing Test

`tests/performance-profiler_spec.js:112-129` uses real CPU work + `performance.now()` with no tolerance buffer. On throttled CI VMs, both measurements can round to the same millisecond, causing intermittent failures.

### 4.6 Coverage Gaps

- Desktop UI panels (beyond PartEditor, weapon import, pixel tools)
- Accessibility / keyboard navigation
- Service worker / offline behavior
- `sources/install-item-metadata.ts` negative paths
- `scripts/` logic (zero test coverage for image processing, z-positioning, audit tools)

---

## 5. Build & Tooling Debt

### 5.1 Vite Plugins as Workarounds

| Plugin                                           | Workaround Nature                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `vite-plugin-preview-serve-dist-spritesheets.js` | Bypasses Vite 8 preview 500 errors on `dist/spritesheets/`         |
| `vite-plugin-bundled-css-after-bulma.js`         | Regex-based HTML surgery to reorder stylesheets                    |
| `vite-plugin-metadata-modulepreload.js`          | Heuristic chunk selection by `code.length`                         |
| `get-spritesheets-plugin.js`                     | Platform-specific `rsync`/`robocopy` with manual exit-code mapping |
| `vite-plugin-webp-encoder-wasm.js`               | Manual WASM asset plumbing because package doesn't expose it       |

**Verdict:** Functional but unmaintainable for new contributors. Every plugin needs an essay-length JSDoc explaining why it exists.

### 5.2 Script Duplication & Bugs

- `scripts/audit_assets.js`, `audit_summary.js`, `audit_neck.js` copy-paste `SLOT_CONFIG` (~260 lines) and re-implement `getSpritePath()`.
- `scripts/zPositioning/update_zpos.js:25` and `write_z_positions_from_sheets.js:51` use `for...in` on Arrays (iterates string indices + prototype pollution risk).
- `scripts/generateSources/credits.js` hand-rolls CSV via string concatenation (`replaceAll('"', "**")`) instead of a CSV library.
- `scripts/generateSources/state.js` uses module-level mutable arrays/objects, making the generator non-reentrant.
- `scripts/update_sheet_definitions.js` exists but has **no `package.json` script entry**.

### 5.3 Fragile Generated-Files Workflow

- `scripts/audit_assets.js`, `audit_summary.js`, `audit_neck.js`, `check_both.js`, and `fixture-builder.js` all **runtime-import from `dist/`**, which is **gitignored**. They fail if `dist/` hasn't been generated.
- `prebuild`: `rimraf "dist/!(spritesheets)"` uses shell glob negation tightly coupled to `vite.config.js`'s `emptyOutDir: false`.

### 5.4 Lint / Format Configuration Gaps

- **ESLint** uses `@babel/eslint-parser` for pure ESM `.js` files — unnecessary; native espree or TS-estree would suffice.
- **Prettier** config is only `{ "endOfLine": "lf" }` — no `printWidth`, `tabWidth`, `semi`, `singleQuote`, or `trailingComma`. PR noise from default-drift.
- **`.editorconfig`** only covers `*.js` — missing `.ts`, `.json`, `.html`, `.css`, `.scss`.
- `globals.es2021` used with `ecmaVersion: "latest"` — mismatch.

### 5.5 npm Scripts

- `serve` is identical to `dev` — redundant.
- `type-check` uses `tsgo --noEmit` (Go-based TS compiler preview) — bleeding edge, harder to debug than `tsc`.
- `profile:zip:*` (×4) scripts likely used once; could be one script with flags.
- `validate-site-sources` **generates** files but its name implies read-only validation.

### 5.6 npm Overrides

- `mocha` override is **likely obsolete** — Mocha 11 already satisfies the overridden ranges natively.
- `minimatch` override is **still required** for `rimraf` + `testem` compatibility.

---

## 6. Dependency Debt

### 6.1 Outdated Packages (18 total)

| Package                      | Current            | Latest             | Severity          |
| ---------------------------- | ------------------ | ------------------ | ----------------- |
| `eslint`                     | 9.39.4             | 10.4.1             | Medium (major)    |
| `vite`                       | 8.0.8              | 8.0.16             | Low (patch)       |
| `purgecss`                   | 6.0.0              | 8.0.0              | Medium (major)    |
| `sinon`                      | 21.1.2             | 22.0.0             | Low (major)       |
| `globals`                    | 16.5.0             | 17.6.0             | Low (major)       |
| `concurrently`               | 9.2.1              | 10.0.3             | Medium (major)    |
| `typescript-eslint`          | 8.59.0             | 8.61.0             | Low (minor)       |
| `@typescript/native-preview` | 7.0.0-dev.20260421 | 7.0.0-dev.20260608 | Low (dev preview) |

### 6.2 Security Vulnerabilities

```
uuid  <11.1.1  moderate  Missing buffer bounds check in v3/v5/v6
  node-notifier >=7.0.0
    testem 3.2.1 - 3.20.0
```

**3 moderate severity vulnerabilities**, all transitively through `testem` → `node-notifier` → `uuid`. Fixable via `npm audit fix`.

### 6.3 Unused Dependencies (depcheck)

- **Dev:** `mocha`, `rimraf`, `serve`
  - `mocha` is used by Testem but not directly by project code.
  - `rimraf` is used in `prebuild` script — likely a false positive if depcheck ignores scripts.
  - `serve` appears truly unused (no `npx serve` or `serve` CLI invocation in `package.json`).

### 6.4 Native / WASM Dependency Risk

- `webp-encoder` bundles a WASM blob (`a.out.wasm`). The Vite plugin manually copies it because the package doesn't expose it as a standard asset. Upgrades to `webp-encoder` risk breaking the build silently.

### 6.5 Bleeding-Edge TypeScript

- `typescript@6.0.3` is a **pre-release/RC track** (TypeScript 5.8.x is latest stable).
- `@typescript/native-preview@7.0.0-dev.20260421.2` is the Go-based TS compiler (`tsgo`). Updated 13 hours ago at time of audit. Extremely unstable/experimental; the `type-check` script relies on it.

---

## 7. Performance & Rendering Debt

### 7.1 Renderer Monolith

`runRenderCharacter` in `renderer.ts:259-636` is ~380 lines of procedural code handling 11 distinct concerns (draw calls, z-sorting, image loading, palette recoloring, custom animation composition, frame extraction, profiler measurement). No pipeline abstraction means optimizations require surgical edits to a giant function.

### 7.2 WebGL/CPU Recolor Coupling

`palette-recolor.ts:208-227` branches on `config.useWebGL` at runtime, but module-level constants are initialized at load time. If WebGL fails later, the load-time logs are misleading.

### 7.3 Preview Canvas Depends on Renderer Internals

`preview-canvas.ts` imports `canvas`, `SHEET_WIDTH`, `SHEET_HEIGHT`, and `isOffscreenCanvasInitialized` from `renderer.ts`. Preview logic cannot be tested with a stubbed renderer.

---

## 8. Naming & Consistency Debt

### 8.1 Conflicting Identifiers

- `renderCharacter` — both a function in `canvas/renderer.ts` and a state property `state.renderCharacter.isRendering`
- `state.ts` vs `state-model.ts` — `state-model.ts` defines types + default object; `state.ts` defines operations + re-exports. Unclear which to import.
- `customAnimations` — imported module, but also local variable names in `renderer.ts`, `preview-canvas.ts`, `PartEditor.ts`

### 8.2 Inconsistent Abbreviations

| Abbreviation          | Variants Found                                                     |
| --------------------- | ------------------------------------------------------------------ |
| `anim` vs `animation` | `animName`, `animationName`, `customAnimDef`, `customAnimationDef` |
| `ctx` vs `context`    | `renderCtx`, `customAnimationContext`, `animCtx`                   |
| `num` vs `number`     | `layerNum`, `animLayerNum`, `frameNumber`                          |

---

## Priority Matrix

### P0 — Fix Immediately (blocks correctness or hides bugs)

| #   | Action                                                                | File(s)                            |
| --- | --------------------------------------------------------------------- | ---------------------------------- |
| 1   | **Run `npm audit fix`** to resolve 3 moderate `uuid` vulnerabilities  | `package-lock.json`                |
| 2   | **Remove stale TODOs** in `tsconfig.json` (migration is complete)     | `tsconfig.json`                    |
| 3   | **Replace or document noisy missing-sprite warnings in visual tests** | `tests/visual/**`, sprite metadata |

### P1 — High Impact, Medium Effort

| #   | Action                                                                                                                                           | File(s)                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 5   | **Continue editor decomposition** by splitting `part-editor/panels.ts` and reducing `PartEditor.ts` orchestration                                | `sources/components/desktop/part-editor/panels.ts`, `sources/components/desktop/PartEditor.ts` |
| 6   | **Deduplicate ZIP export boilerplate** in `zip.ts` (~70% shared code)                                                                            | `sources/state/zip.ts`                                                                         |
| 7   | **Break state↔canvas circular dependency** — move `drawCalls`, `addedCustomAnimations`, `customAreaItems` into a render-state object in `state/` | `sources/canvas/renderer.ts`, `sources/state/*.ts`                                             |
| 8   | **Consolidate duplicate render-trigger logic** from `App.ts` + `DesktopApp.ts` into one effect                                                   | `sources/components/App.ts`, `DesktopApp.ts`                                                   |
| 9   | **Replace hard `waitForTimeout` in visual tests** with explicit readiness signals                                                                | `tests/visual/editor-e2e.spec.js`, `test_dropdowns.spec.js`                                    |
| 10  | **Extract `SLOT_CONFIG`, `getSpritePath`, `expandTemplatePaths`** into `scripts/audit/shared.js`                                                 | `scripts/audit_*.js`                                                                           |
| 11  | **Define proper `FullItemMetadata` type** and eliminate `Record<string, unknown>` + `as unknown as ItemLite` chain                               | `sources/state/catalog.ts`, `sources/types/*.ts`                                               |

### P2 — Medium Impact, Medium Effort

| #   | Action                                                                                                       | File(s)                                    |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 12  | **Introduce shared Node mocking helper** (or adopt `sinon` in Node tests)                                    | `tests/node/**/*_spec.js`                  |
| 13  | **Make `tests/node/run-node-tests.js` recursively discover** all `tests/node/**/*_spec.js`                   | `tests/node/run-node-tests.js`             |
| 14  | **Refactor `performance-profiler_spec.js` timing test** to mock `performance.now()` or use tolerance         | `tests/performance-profiler_spec.js`       |
| 15  | **Remove `state.ts` re-export indirection** — merge `state-model.ts` into `state.ts` or rename unambiguously | `sources/state/state.ts`, `state-model.ts` |
| 16  | **Remove duplicate `isRenderingCharacter` / `renderCharacter.isRendering`** flags                            | `sources/state/state-model.ts`             |
| 17  | **Replace `@babel/eslint-parser`** with native ESLint parser for ESM                                         | `eslint.config.js`                         |
| 18  | **Expand Prettier config** (`printWidth`, `tabWidth`, `semi`, `singleQuote`, `trailingComma`)                | `.prettierrc.json`                         |
| 19  | **Expand `.editorconfig`** to `.ts`, `.json`, `.html`, `.css`, `.scss`                                       | `.editorconfig`                            |
| 20  | **Remove redundant `serve` script** and consolidate `profile:zip:*` scripts                                  | `package.json`                             |
| 21  | **Remove obsolete `mocha` npm override**                                                                     | `package.json`                             |

### P3 — Polish / Long-Term

| #   | Action                                                                                                                        | File(s)                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 22  | **Evaluate unifying test runners** under Vitest (single config, TS tests, Node + DOM environments)                            | `tests/`, `vite.config.js`, `testem.cjs` |
| 23  | **Convert tests from `.js` to `.ts`** to match source language                                                                | `tests/`                                 |
| 24  | **Enable `checkJs: true`** in `tsconfig.json` to type-check scripts                                                           | `tsconfig.json`                          |
| 25  | **Enable `noUncheckedIndexedAccess`** and `noPropertyAccessFromIndexSignature` now that TS migration is complete              | `tsconfig.json`                          |
| 26  | **Add pre-audit guard** that auto-generates `dist/` before scripts import from it                                             | `scripts/audit_*.js`                     |
| 27  | **Use a CSV library** in `scripts/generateSources/credits.js`                                                                 | `scripts/generateSources/credits.js`     |
| 28  | **Document architecture layering rules** (components → state → canvas → utils) and enforce via ESLint `no-restricted-imports` | `AGENTS.md`, `eslint.config.js`          |

---

## Positive Observations (What's Working Well)

1. **Full TypeScript migration in `sources/`** — 83 `.ts` files, zero `.js`. Clean.
2. **Strict `tsconfig.json` base** — Extends `@tsconfig/strictest`; only three deliberate relaxations.
3. **ESM throughout** — `"type": "module"`, no CommonJS in source.
4. **Fingerprint caching** — `scripts/generateSources/source_inputs_fingerprint.js` skips redundant regeneration robustly.
5. **Performance profiler** — Built-in, gated by `DEBUG`, well-instrumented across ZIP export and rendering.
6. **Visual regression infrastructure** — Playwright + Argos is set up and running in CI.
7. **Node test coverage for build scripts** — 118 passing tests for `generateSources`, Vite plugins, and wiring.
8. **Good per-file JSDoc** — Especially in `vite/` plugins, where each hack is documented.
