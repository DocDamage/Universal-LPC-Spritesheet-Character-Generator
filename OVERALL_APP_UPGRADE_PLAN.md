# Overall App Upgrade Plan

## Goal

Turn the app from a feature-rich but organically grown sprite tool into a more
polished, reliable sprite production workflow with stable testing, clearer
exports, safer imports, and a more unified animation experience.

Treat this as a multi-commit upgrade branch rather than one large change.

## Phase 1: Baseline Audit And Test Stabilization

Before adding more UI, lock down what is currently working and where the brittle
spots are.

### Tasks

1. Run and capture the current test baseline:
   - `npm run lint`
   - `npm run type-check`
   - `npm test`
   - `npm run build`
   - `npm run test:visual`
2. Record a short baseline summary:
   - Which tests pass.
   - Which visual/e2e tests fail.
   - Whether failures are deterministic or flaky.
   - Browser involved: Chromium, Firefox, or both.
   - Exact failure reason: timeout, selector miss, screenshot diff, app error,
     autosave issue, or another cause.
3. Stabilize the Playwright setup:
   - Inspect Playwright config.
   - Confirm browser launch config includes Firefox.
   - Ensure test server startup is deterministic.
   - Avoid stale port collisions by ensuring tests use a known server lifecycle.
4. Add reusable waiting helpers:
   - wait for app mount
   - wait for catalog ready
   - wait for editor open
   - wait for autosave idle
   - wait for sprite canvas painted
5. Fix brittle selectors by adding stable test IDs or equivalent hooks for:
   - slot selector
   - editor open button
   - fullscreen editor button
   - save custom part button
   - dropdown triggers
   - animation preview controls
   - download buttons
   - future export wizard trigger
6. Update visual/e2e tests to use stable selectors instead of fragile CSS or
   text selectors where appropriate.
7. Fix known visual test failures, likely around:
   - dropdown open/close timing
   - custom part save flow
   - autosave invalid key behavior
   - editor startup waiting for IndexedDB/catalog/canvas
   - current UI differing from old test expectations
8. Improve debug artifacts:
   - retain screenshots/traces on failure
   - capture console errors where useful
   - make failures easier to reproduce locally

### Success Criteria

- `npm run test:visual` passes once.
- `npm run test:visual` passes a second time without code changes.
- Any remaining flaky test is documented with exact reproduction notes.

## Phase 2: Export Architecture Cleanup

The app now has PNG, GIF, WebP, ZIP split exports, tweened sheets, individual
frames, metadata, and engine presets. Before adding a wizard, centralize the
export concepts.

### Tasks

1. Inventory existing export flows:
   - PNG spritesheet export
   - animated GIF preview export
   - animated WebP preview export
   - credits TXT
   - credits CSV
   - character JSON export/import
   - ZIP split by animation
   - ZIP split by item
   - ZIP split by animation and item
   - ZIP individual frames
   - tweened ZIP output
   - engine preset manifests
2. Create an export model module, such as:
   - `sources/state/export-options.ts`
   - or `sources/export/export-options.ts`
3. Define core export IDs and target types:

   ```ts
   export type ExportTarget =
     | "png"
     | "gif-preview"
     | "webp-preview"
     | "zip-split-animation"
     | "zip-split-item"
     | "zip-split-animation-item"
     | "zip-individual-frames";

   export type EngineTarget = "generic" | "godot" | "phaser" | "rpg-maker";
   ```

4. For each export option, model:
   - export ID
   - label
   - kind/category
   - whether it uses tween settings
   - whether it needs catalog layers ready
   - whether it creates a ZIP
   - whether it supports engine presets
   - estimated output information
   - user-facing warnings
5. Extract shared export estimates:
   - source frame count
   - generated tween frame count
   - total output frames
   - likely ZIP paths
   - whether confirmation is needed
   - whether engine preset manifests will be included
6. Refactor `Download.ts` carefully:
   - replace duplicated button metadata with a small export config array where
     practical
   - keep existing click handlers intact at first
   - keep current direct export buttons working
   - add tests after each meaningful move

### Success Criteria

- Existing Download panel behavior remains intact.
- All current exports still work.
- Tests cover GIF/WebP buttons, ZIP buttons, and tween hint rendering.
- Export behavior is represented by a clearer model before wizard UI begins.

## Phase 3: Export Preset Wizard

This is the main user-facing upgrade. The goal is to let users pick a target
like Godot or Phaser without needing to understand file paths and export
internals.

### UI Shape

Recommended: a compact modal launched from the Download panel.

Add a button such as:

- `Export Wizard`
- `Game Export...`

The modal should be practical and compact, not a landing page or long tutorial.

### Wizard Structure

1. Choose target workflow:
   - Generic
   - Godot
   - Phaser
   - RPG Maker
   - Preview GIF
   - Preview WebP
   - Raw PNG spritesheet
   - Individual frames
2. Choose output type, depending on workflow:
   - current preview animation
   - full character spritesheet
   - split by animation
   - individual frames
   - tweened sheets
   - tweened individual frames
3. Confirm settings:
   - tween mode
   - in-between count
   - FPS
   - per-animation overrides present or not
   - estimated source frames
   - estimated generated tween frames
   - estimated total frame PNGs
   - engine preset manifest included or not
   - output path summary
4. Export by calling the existing export functions.

### Preset Behavior

Generic:

- Prefer individual frames if the user needs custom pipelines.
- Include engine preset manifest.
- Preserve current tween settings.

Godot:

- Prefer split-by-animation tweened spritesheets.
- Mention `AnimatedSprite2D` / `SpriteFrames`.
- Include `engine-presets/godot.json`.

Phaser:

- Prefer split-by-animation sheets.
- Include frame size and FPS manifest.
- Include `engine-presets/phaser.json`.

RPG Maker:

- Prefer compatibility warnings.
- Suggest individual frames or a conversion path.
- Keep original sheets available.
- Include `engine-presets/rpg-maker.json`.

Preview GIF:

- Export only the selected animation.
- Use active tween settings.
- No ZIP.

Preview WebP:

- Export only the selected animation.
- Use active tween settings.
- No ZIP.

### State Design

Use transient UI state unless persistence is clearly useful:

- selected export target
- selected engine target
- selected export kind
- include tweening boolean, probably derived from active settings
- warning acknowledgement

Keep the state local to the wizard/component unless the choices need to persist
between sessions.

### Likely Files

- `sources/components/download/Download.ts`
- `sources/components/download/ExportWizard.ts`
- `sources/state/export-options.ts`
- `sources/state/tween-settings.ts`
- `sources/state/zip.ts`
- `tests/components/download/*`
- possibly `tests/state/export-options_spec.js`

### Tests

- Wizard opens from Download.
- Target choices render.
- Choosing Godot shows split/tweened guidance.
- Choosing Phaser shows Phaser guidance.
- GIF/WebP choices call the preview export path.
- ZIP choice calls the right export handler.
- Large tween export warning is visible before export.

### Success Criteria

- A user can pick Godot, Phaser, RPG Maker, or Generic and understand what they
  will get.
- Existing direct buttons still work, or are replaced only with proven parity.
- Export wizard does not require users to understand internal ZIP paths.

## Phase 4: Export Preview / Inspector

This makes the export wizard feel trustworthy.

### Tasks

1. Create an export summary builder that returns structured output:

   ```ts
   {
     title: "Godot tweened animation sheets",
     format: "ZIP",
     includesTweenFrames: true,
     sourceFrames: 832,
     generatedTweenFrames: 1664,
     totalFrames: 2496,
     fps: 12,
     paths: [
       "standard/walk.png",
       "tweened/standard/walk.png",
       "credits/TWEEN_EXPORT_README.txt",
       "engine-presets/godot.json"
     ],
     warnings: []
   }
   ```

2. Add a representative file tree preview:

   ```text
   lpc_male_animations.zip
   ├─ standard/
   │  ├─ walk.png
   │  └─ slash.png
   ├─ tweened/
   │  └─ standard/
   │     ├─ walk.png
   │     └─ slash.png
   ├─ engine-presets/
   │  └─ godot.json
   └─ credits/
      ├─ metadata.json
      └─ TWEEN_EXPORT_README.txt
   ```

3. Surface warnings before export:
   - large number of generated tween frames
   - individual-frame export may create many PNGs
   - RPG Maker may require conversion/plugin
   - WebP requires browser support
   - current tween mode is off, so no tweened frames will be generated

### Tests

- Summary paths for split-by-animation.
- Summary paths for individual frames.
- Summary includes engine presets when tweening is enabled.
- Summary omits tween paths when tweening is off.
- Large export warning threshold works.

### Success Criteria

- Users see what kind of archive/export they are about to create.
- Large exports are communicated before the browser starts heavy work.

## Phase 5: Custom Asset Import Validation

This prevents users from saving bad imports and then wondering why their
character looks wrong.

### Tasks

1. Audit current importer code:
   - `sources/components/desktop/custom-weapon-import.ts`
   - `sources/components/desktop/SlotSelector.ts`
   - custom part save flow
   - custom parts storage
2. Add a validation module, such as:
   - `sources/components/desktop/custom-asset-validation.ts`
   - or `sources/state/custom-asset-validation.ts`
3. Validate:
   - image dimensions
   - transparent background / alpha presence
   - expected LPC frame-size multiples
   - whether it looks like a single image or full sheet
   - whether sheet dimensions match a supported layout
   - whether custom animation frame count is plausible
   - whether imported image is empty
   - whether imported image has content outside expected bounds
4. Use validation severities:
   - `error`: cannot save
   - `warning`: can save after acknowledgement
   - `info`: helpful note
5. Example validation outcomes:
   - empty image: error
   - no alpha channel: warning
   - odd dimensions: warning or error depending on import mode
   - full sheet too small: error
   - full sheet unusually large: warning
   - content touching every edge: warning, likely cropped
6. Add importer UI changes:
   - concise issue list near import preview
   - warning/error visual treatment
   - `Continue anyway` for warnings
   - disabled save for errors

### Tests

Unit tests:

- empty canvas
- single PNG with alpha
- PNG with no transparency
- full sheet with correct dimensions
- wrong dimensions
- content touching bounds
- unsupported frame layout

Component tests:

- warning appears in importer
- save disabled for errors
- save allowed for warnings with acknowledgement

### Success Criteria

- Bad imports are caught early.
- Advanced users can continue past warnings.
- Existing custom import workflow remains intact.

## Phase 6: Unified Animation Settings UX

Animation behavior is currently spread across preview, export, and metadata.
This phase makes it feel like one coherent system.

### Tasks

1. Audit animation controls:
   - animation preview controls
   - tween presets
   - per-animation override toggle
   - FPS/in-between sliders
   - Pixel Motion tuning
   - Download tween hint
   - ZIP export metadata
2. Clarify setting scope:
   - playback preview
   - generated export frames
   - per-animation override
3. Use concise labels such as:
   - `Applies to preview and exports`
   - `Override for current animation`
   - `Global default`
4. Add commands:
   - reset current animation override
   - reset all tween settings
   - copy current settings to all animations
   - clear all animation overrides
5. Improve override visibility:
   - mark animations with overrides
   - show override count
   - consider an `Overrides: 3` badge

### Tests

- reset global settings works
- clear overrides works
- copy settings to all animations works
- UI shows override count
- ZIP metadata reflects copied overrides

### Success Criteria

- Users understand which settings are global.
- Users can manage overrides without manually visiting each animation.
- Export behavior matches preview behavior.

## Phase 7: Performance And Progress Polish

Large tween exports can generate many frames. The app should feel controlled
during heavy work.

### Tasks

1. Improve progress reporting:
   - preparing export
   - rendering animations
   - generating tween frames
   - encoding PNGs
   - writing ZIP
   - download ready
2. Add progress counts where practical:
   - current animation / total animations
   - current frame / total frames
   - generated tween frame count
3. Investigate cancellation:
   - use `AbortController`
   - check abort signal inside loops
   - add cancel button in progress UI
4. If cancellation is too invasive, defer it and add clearer progress first.
5. Improve memory/performance guardrails:
   - generated frame count
   - total PNG count
   - likely slow export warning
   - individual-frame ZIP warning
6. Investigate worker-based export later only if profiling shows meaningful UI
   jank.

### Tests

- progress state advances
- cancel prevents download
- large export warning threshold
- export failure clears running state

### Success Criteria

- Long exports do not look frozen.
- Users can predict expensive exports.
- Failed or cancelled exports leave the UI usable.

## Phase 8: Documentation And Release Pass

Once feature work is complete, update docs like a release.

### Tasks

1. Update README:
   - current app capabilities
   - animation tweening
   - export wizard
   - engine presets
   - GIF/WebP preview export
   - local development notes if WebP/WASM needs mention
2. Update `EDITOR_FEATURES.md`:
   - export wizard
   - export inspector
   - animation settings management
   - custom asset validation
   - progress/cancellation behavior
3. Consider a new `EXPORT_GUIDE.md`:
   - Godot workflow
   - Phaser workflow
   - RPG Maker workflow
   - Generic workflow
   - ZIP path meanings
   - tween mode meanings
   - when to use GIF vs WebP
4. Run final verification:
   - `npm run lint`
   - `npm run type-check`
   - `npm test`
   - `npm run build`
   - `npm run test:visual`

### Recommended Commit Structure

- `test: stabilize editor visual coverage`
- `refactor: centralize export option metadata`
- `feat: add export preset wizard`
- `feat: add export preview inspector`
- `feat: validate custom asset imports`
- `feat: unify animation settings controls`
- `feat: improve export progress reporting`
- `docs: document export workflows`

## Recommended Implementation Order

1. Stabilize visual/e2e tests.
2. Centralize export option/summary model.
3. Build export wizard.
4. Add export preview inspector.
5. Improve custom asset validation.
6. Unify animation settings management.
7. Add progress/cancel polish.
8. Update documentation and run final verification.

## Why This Order

Test stabilization gives the work a safer foundation. The export model makes the
wizard easier to build cleanly. The wizard and inspector directly improve the
user experience. Import validation and animation settings then clean up the
other confusing parts of the app. Progress polish comes last because it benefits
from the export model already being clear.
