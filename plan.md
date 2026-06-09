# Technical Debt Remediation Plan

**Source:** `TECHNICAL_DEBT_AUDIT.md`  
**Workspace:** `D:\LPC character generator\LPC character generator\Universal-LPC-Spritesheet-Character-Generator`

---

## Stage 1 — P0: Fix Immediately (blocks correctness or hides bugs)

| # | Action | File(s) | Status |
|---|--------|---------|--------|
| 1 | **Add 4 orphaned spec files to `tests/tests.js`** | `tests/tests.js` | **done** |
| 2 | **Fix `for...in` array loops** in z-position scripts | `scripts/zPositioning/update_zpos.js`, `write_z_positions_from_sheets.js` | **done** |
| 3 | **Run `npm audit fix`** to resolve 3 moderate `uuid` vulnerabilities | `package-lock.json` | **done** (0 vulnerabilities) |
| 4 | **Remove stale TODOs** in `tsconfig.json` (migration is complete) | `tsconfig.json` | **done** |

## Stage 2 — P1: High Impact, Medium Effort

| # | Action | File(s) | Status |
|---|--------|---------|--------|
| 5 | **Break `PartEditor.ts` into sub-components** (layer panel, toolbar, canvas stage, timeline, modals) | `sources/components/desktop/PartEditor.ts` | **in progress** (sub-agent) |
| 6 | **Deduplicate ZIP export boilerplate** in `zip.ts` (~70% shared code) | `sources/state/zip.ts` | **in progress** (sub-agent) |
| 7 | **Break state↔canvas circular dependency** — move `drawCalls`, `addedCustomAnimations`, `customAreaItems` into a render-state object in `state/` | `sources/canvas/renderer.ts`, `sources/state/*.ts` | **in progress** (sub-agent) |
| 8 | **Consolidate duplicate render-trigger logic** from `App.ts` + `DesktopApp.ts` into one effect | `sources/components/App.ts`, `DesktopApp.ts` | **done** (`render-effect.ts`) |
| 9 | **Replace hard `waitForTimeout` in visual tests** with explicit readiness signals | `tests/visual/editor-e2e.spec.js`, `test_dropdowns.spec.js` | **in progress** (sub-agent) |
| 10 | **Extract `SLOT_CONFIG`, `getSpritePath`, `expandTemplatePaths`** into `scripts/audit/shared.js` | `scripts/audit_*.js` | **done** |
| 11 | **Define proper `FullItemMetadata` type** and eliminate `Record<string, unknown>` + `as unknown as ItemLite` chain | `sources/state/catalog.ts` | **done** |

## Stage 3 — P2: Medium Impact, Medium Effort

| # | Action | File(s) | Status |
|---|--------|---------|--------|
| 12 | **Introduce shared Node mocking helper** (or adopt `sinon` in Node tests) | `tests/node/**/*_spec.js` | **done** (`test-helpers.js`) |
| 13 | **Make `tests/node/run-node-tests.js` recursively discover** all `tests/node/**/*_spec.js` | `tests/node/run-node-tests.js` | **done** |
| 14 | **Refactor `performance-profiler_spec.js` timing test** to mock `performance.now()` or use tolerance | `tests/performance-profiler_spec.js` | **done** |
| 15 | **Remove `state.ts` re-export indirection** — merge `state-model.ts` into `state.ts` or rename unambiguously | `sources/state/state.ts`, `state-model.ts` | **done** (renamed to `app-state.ts`) |
| 16 | **Remove duplicate `isRenderingCharacter` / `renderCharacter.isRendering`** flags | `sources/state/state-model.ts` → `app-state.ts` | **done** |
| 17 | **Replace `@babel/eslint-parser`** with native ESLint parser for ESM | `eslint.config.js` | **done** |
| 18 | **Expand Prettier config** (`printWidth`, `tabWidth`, `semi`, `singleQuote`, `trailingComma`) | `.prettierrc.json` | **done** |
| 19 | **Expand `.editorconfig`** to `.ts`, `.json`, `.html`, `.css`, `.scss` | `.editorconfig` | **done** |
| 20 | **Remove redundant `serve` script** and consolidate `profile:zip:*` scripts | `package.json` | **done** |
| 21 | **Remove obsolete `mocha` npm override** | `package.json` | **done** |

## Stage 4 — P3: Polish / Long-Term

| # | Action | File(s) | Status |
|---|--------|---------|--------|
| 22 | **Evaluate unifying test runners** under Vitest (single config, TS tests, Node + DOM environments) | `tests/`, `vite.config.js`, `testem.cjs` | pending |
| 23 | **Convert tests from `.js` to `.ts`** to match source language | `tests/` | pending |
| 24 | **Enable `checkJs: true`** in `tsconfig.json` to type-check scripts | `tsconfig.json` | pending |
| 25 | **Enable `noUncheckedIndexedAccess`** and `noPropertyAccessFromIndexSignature` now that TS migration is complete | `tsconfig.json` | pending |
| 26 | **Add pre-audit guard** that auto-generates `dist/` before scripts import from it | `scripts/audit_*.js` | pending |
| 27 | **Use a CSV library** in `scripts/generateSources/credits.js` | `scripts/generateSources/credits.js` | **done** (`csv-helpers.js`) |
| 28 | **Document architecture layering rules** (components → state → canvas → utils) and enforce via ESLint `no-restricted-imports` | `AGENTS.md`, `eslint.config.js` | pending |

---

## Execution Notes

- **P0 items** are executed first, in parallel where file-independent. ✅
- **P1 items** require reading large files before editing; delegated to sub-agents where appropriate. 4 sub-agents running.
- **P2 items** completed directly by orchestrator. ✅
- **P3-27** completed directly by orchestrator. ✅
- All direct changes verified with `node --check` for JS files.
