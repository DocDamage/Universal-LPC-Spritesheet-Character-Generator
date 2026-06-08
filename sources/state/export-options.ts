/**
 * Central export option model.
 *
 * Defines every export target the app supports — ID, label, kind, tween
 * interaction, ZIP vs single file, engine-preset support, and user-facing
 * warnings — so that Download.ts and ExportWizard.ts share one source of
 * truth rather than duplicating button metadata.
 */

import {
  estimateTweenExportFrames,
  getGlobalTweenSettings,
} from "./tween-settings.ts";
import { state } from "./state.ts";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type ExportTargetId =
  | "png"
  | "gif-preview"
  | "webp-preview"
  | "credits-txt"
  | "credits-csv"
  | "json-clipboard"
  | "json-clipboard-import"
  | "zip-split-animation"
  | "zip-split-item"
  | "zip-split-animation-item"
  | "zip-individual-frames";

export type ExportKind = "image" | "animation" | "zip" | "text" | "json";

export type EngineTarget = "generic" | "godot" | "phaser" | "rpg-maker";

export type ExportOption = {
  /** Unique key, stable across refactors */
  id: ExportTargetId;
  /** Short button / menu label */
  label: string;
  /** Broad category for grouping */
  kind: ExportKind;
  /** Visual style hint: "primary", "info", "link" */
  style: "primary" | "info" | "link";
  /** Whether the export uses tween settings */
  usesTween: boolean;
  /** Whether catalog layers need to be ready before enabling */
  needsLayersReady: boolean;
  /** Whether the output is a ZIP archive */
  isZip: boolean;
  /** Whether engine presets can be embedded (ZIP only) */
  supportsEnginePresets: boolean;
  /** User-facing hint shown near the button */
  hint?: string;
  /** Shown when tween is active and this export interacts with it */
  tweenHint?: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Export option definitions — single source of truth
// ────────────────────────────────────────────────────────────────────────────

export const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: "png",
    label: "Spritesheet (PNG)",
    kind: "image",
    style: "primary",
    usesTween: false,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
  },
  {
    id: "gif-preview",
    label: "Animation Preview (GIF)",
    kind: "animation",
    style: "primary",
    usesTween: true,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
    tweenHint:
      "Uses active tween settings for interpolation between source frames.",
  },
  {
    id: "webp-preview",
    label: "Animation Preview (WebP)",
    kind: "animation",
    style: "primary",
    usesTween: true,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
    tweenHint: "Uses active tween settings. Requires browser WebP support.",
  },
  {
    id: "credits-txt",
    label: "Credits (TXT)",
    kind: "text",
    style: "link",
    usesTween: false,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
  },
  {
    id: "credits-csv",
    label: "Credits (CSV)",
    kind: "text",
    style: "link",
    usesTween: false,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
  },
  {
    id: "zip-split-animation",
    label: "ZIP: Split by animation",
    kind: "zip",
    style: "info",
    usesTween: true,
    needsLayersReady: true,
    isZip: true,
    supportsEnginePresets: true,
    hint: "Wait for layer data to finish loading",
    tweenHint:
      "Adds tweened spritesheets under tweened/standard/ and tweened/custom/.",
  },
  {
    id: "zip-split-item",
    label: "ZIP: Split by item",
    kind: "zip",
    style: "info",
    usesTween: false,
    needsLayersReady: true,
    isZip: true,
    supportsEnginePresets: false,
    hint: "Wait for layer data to finish loading",
  },
  {
    id: "zip-split-animation-item",
    label: "ZIP: Split by animation and item",
    kind: "zip",
    style: "info",
    usesTween: true,
    needsLayersReady: true,
    isZip: true,
    supportsEnginePresets: true,
    hint: "Wait for layer data to finish loading",
    tweenHint: "Adds tweened sheets under tweened/ alongside standard/ output.",
  },
  {
    id: "zip-individual-frames",
    label: "ZIP: Split by animation and frame",
    kind: "zip",
    style: "info",
    usesTween: true,
    needsLayersReady: true,
    isZip: true,
    supportsEnginePresets: true,
    hint: "Wait for layer data to finish loading",
    tweenHint:
      "Adds tween PNGs beside source frames as <frame>_tween_<index>.png.",
  },
  {
    id: "json-clipboard",
    label: "Export to Clipboard (JSON)",
    kind: "json",
    style: "link",
    usesTween: false,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
  },
  {
    id: "json-clipboard-import",
    label: "Import from Clipboard (JSON)",
    kind: "json",
    style: "link",
    usesTween: false,
    needsLayersReady: false,
    isZip: false,
    supportsEnginePresets: false,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ────────────────────────────────────────────────────────────────────────────

export function getExportOption(id: ExportTargetId): ExportOption | undefined {
  return EXPORT_OPTIONS.find((o) => o.id === id);
}

export function getExportOptionsByKind(kind: ExportKind): ExportOption[] {
  return EXPORT_OPTIONS.filter((o) => o.kind === kind);
}

// ────────────────────────────────────────────────────────────────────────────
// Export summary — used by the wizard/inspector to show what will be produced
// ────────────────────────────────────────────────────────────────────────────

export type ExportSummaryItem = {
  label: string;
  indent?: number;
};

export type ExportSummary = {
  title: string;
  format: "ZIP" | "PNG" | "GIF" | "WebP" | "TXT" | "CSV" | "JSON";
  includesTweenFrames: boolean;
  sourceFrames: number;
  generatedTweenFrames: number;
  totalFrames: number;
  fps: number;
  fileTree: ExportSummaryItem[];
  warnings: string[];
  enginePreset: EngineTarget | null;
};

/**
 * Return estimated frame counts for the current character state.
 * Shared by Download.ts hints and ExportWizard preview.
 */
export function estimateExportFrames(): {
  sourceFrames: number;
  generatedTweenFrames: number;
  totalFrames: number;
} {
  return estimateTweenExportFrames();
}

/**
 * Build a user-facing summary for a given export target.
 * Used by the export wizard / inspector to show what will be produced.
 */
export function buildExportSummary(
  targetId: ExportTargetId,
  engineTarget?: EngineTarget,
): ExportSummary | null {
  const option = getExportOption(targetId);
  if (!option) return null;

  const settings = getGlobalTweenSettings();
  const estimate = estimateTweenExportFrames();
  const isTweenActive =
    settings.mode !== "off" && estimate.generatedTweenFrames > 0;
  const fps = settings.fps;

  let fileTree: ExportSummaryItem[] = [];
  let format: ExportSummary["format"] = "PNG";
  let title = option.label;
  const warnings: string[] = [];
  let enginePreset: EngineTarget | null = null;

  if (engineTarget) {
    enginePreset = engineTarget;
  }

  switch (targetId) {
    case "png":
      format = "PNG";
      title = "Character spritesheet";
      fileTree = [{ label: "character-spritesheet.png" }];
      if (isTweenActive) {
        warnings.push(
          "Tween frames are enabled but PNG spritesheet exports the raw composite only.",
        );
      }
      break;

    case "gif-preview":
      format = "GIF";
      title = "Animated preview GIF";
      fileTree = [{ label: "preview.gif" }];
      break;

    case "webp-preview":
      format = "WebP";
      title = "Animated preview WebP";
      fileTree = [{ label: "preview.webp" }];
      break;

    case "credits-txt":
      format = "TXT";
      fileTree = [{ label: "credits.txt" }];
      break;

    case "credits-csv":
      format = "CSV";
      fileTree = [{ label: "credits.csv" }];
      break;

    case "json-clipboard":
    case "json-clipboard-import":
      format = "JSON";
      title =
        targetId === "json-clipboard"
          ? "Export character JSON"
          : "Import character JSON";
      fileTree = [{ label: "JSON clipboard data" }];
      break;

    case "zip-split-animation": {
      format = "ZIP";
      title = enginePreset
        ? `${capitalize(enginePreset)} tweened animation sheets`
        : "Split-by-animation ZIP";
      fileTree = [
        { label: "standard/" },
        { label: "  walk.png", indent: 1 },
        { label: "  slash.png", indent: 1 },
        { label: "  ...", indent: 1 },
      ];
      if (isTweenActive) {
        fileTree.push(
          { label: "tweened/" },
          { label: "  standard/", indent: 1 },
          { label: "    walk.png", indent: 2 },
          { label: "    slash.png", indent: 2 },
          { label: "    ...", indent: 2 },
        );
      }
      fileTree.push(
        { label: "credits/" },
        { label: "  metadata.json", indent: 1 },
        { label: "  TWEEN_EXPORT_README.txt", indent: 1 },
      );
      if (enginePreset) {
        fileTree.push(
          { label: "engine-presets/" },
          { label: `  ${enginePreset}.json`, indent: 1 },
        );
      }
      break;
    }

    case "zip-split-item":
      format = "ZIP";
      title = "Split-by-item ZIP";
      fileTree = [
        { label: "Body_Color/" },
        { label: "  walk.png", indent: 1 },
        { label: "  slash.png", indent: 1 },
        { label: "Human_Male/" },
        { label: "  walk.png", indent: 1 },
        { label: "  slash.png", indent: 1 },
        { label: "..." },
      ];
      break;

    case "zip-split-animation-item":
      format = "ZIP";
      title = enginePreset
        ? `${capitalize(enginePreset)} split-by-animation-and-item ZIP`
        : "Split-by-animation and item ZIP";
      fileTree = [
        { label: "Body_Color/" },
        { label: "  standard/", indent: 1 },
        { label: "    walk.png", indent: 2 },
        { label: "    slash.png", indent: 2 },
      ];
      if (isTweenActive) {
        fileTree.push(
          { label: "  tweened/", indent: 1 },
          { label: "    standard/", indent: 2 },
          { label: "      walk.png", indent: 3 },
          { label: "      slash.png", indent: 3 },
        );
      }
      fileTree.push(
        { label: "credits/" },
        { label: "  metadata.json", indent: 1 },
      );
      if (enginePreset) {
        fileTree.push(
          { label: "engine-presets/" },
          { label: `  ${enginePreset}.json`, indent: 1 },
        );
      }
      break;

    case "zip-individual-frames":
      format = "ZIP";
      title = enginePreset
        ? `${capitalize(enginePreset)} individual-frame ZIP`
        : "Individual-frame ZIP";
      fileTree = [
        { label: "standard/" },
        { label: "  walk/", indent: 1 },
        { label: "    front/", indent: 2 },
        { label: "      frame_0000.png", indent: 3 },
        { label: "      frame_0001.png", indent: 3 },
      ];
      if (isTweenActive) {
        fileTree.push(
          { label: "      frame_0000_tween_0.png", indent: 3 },
          { label: "      frame_0000_tween_1.png", indent: 3 },
        );
      }
      fileTree.push(
        { label: "  ...", indent: 1 },
        { label: "credits/" },
        { label: "  metadata.json", indent: 1 },
      );
      if (enginePreset) {
        fileTree.push(
          { label: "engine-presets/" },
          { label: `  ${enginePreset}.json`, indent: 1 },
        );
      }
      break;
  }

  // Common warnings
  if (option.isZip && estimate.totalFrames > 2000) {
    warnings.push(
      `Large export: ~${estimate.totalFrames} total frame PNGs will be generated. This may take a moment.`,
    );
  }
  if (targetId === "zip-individual-frames" && estimate.totalFrames > 500) {
    warnings.push(
      "Individual-frame ZIPs create many PNGs and a larger archive than spritesheet-based exports.",
    );
  }
  if (option.usesTween && state.previewTweenMode === "off") {
    warnings.push(
      "Tween mode is currently off. No interpolated frames will be generated.",
    );
  }

  return {
    title,
    format,
    includesTweenFrames: isTweenActive,
    sourceFrames: estimate.sourceFrames,
    generatedTweenFrames: estimate.generatedTweenFrames,
    totalFrames: estimate.totalFrames,
    fps,
    fileTree,
    warnings,
    enginePreset,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Engine preset guidance text
// ────────────────────────────────────────────────────────────────────────────

export type EngineGuidance = {
  engine: EngineTarget;
  label: string;
  description: string;
  preferredExport: ExportTargetId;
  notes: string[];
};

export const ENGINE_GUIDANCE: EngineGuidance[] = [
  {
    engine: "generic",
    label: "Generic",
    description:
      "Neutral export for custom pipelines. Prefer individual frames for flexibility.",
    preferredExport: "zip-individual-frames",
    notes: [
      "Includes engine-presets/generic.json manifest.",
      "Preserves current tween settings.",
      "Output is a standard ZIP with extracted layers.",
    ],
  },
  {
    engine: "godot",
    label: "Godot",
    description:
      "Optimized for AnimatedSprite2D / SpriteFrames. Prefer tweened split-by-animation sheets.",
    preferredExport: "zip-split-animation",
    notes: [
      "Import sheets as SpriteFrames and set animation speed to match FPS.",
      "Tweened sheets go under tweened/standard/ for easy rigging.",
      "Includes engine-presets/godot.json manifest.",
      "See EXPORT_GUIDE.md for detailed Godot setup.",
    ],
  },
  {
    engine: "phaser",
    label: "Phaser",
    description:
      "Optimized for Phaser spritesheet loading. Prefer split-by-animation sheets with frame metadata.",
    preferredExport: "zip-split-animation",
    notes: [
      "Load with this.load.spritesheet using frameWidth/frameHeight from presets.",
      "Frame size and FPS are included in engine-presets/phaser.json.",
      "See EXPORT_GUIDE.md for detailed Phaser setup.",
    ],
  },
  {
    engine: "rpg-maker",
    label: "RPG Maker",
    description:
      "Compatibility-focused. Individual frames or conversion path recommended.",
    preferredExport: "zip-individual-frames",
    notes: [
      "RPG Maker typically needs a plugin or conversion step for LPC sheets.",
      "Individual frames are safer for plugin-based importers.",
      "Original standard/ and custom/ sheets are always included for fallback.",
      "Includes engine-presets/rpg-maker.json manifest.",
      "See EXPORT_GUIDE.md for RPG Maker notes.",
    ],
  },
];

export function getEngineGuidance(
  engine: EngineTarget,
): EngineGuidance | undefined {
  return ENGINE_GUIDANCE.find((g) => g.engine === engine);
}

// ────────────────────────────────────────────────────────────────────────────
// Wizard-specific state (transient — not persisted to URL hash)
// ────────────────────────────────────────────────────────────────────────────

export type ExportWizardState = {
  open: boolean;
  selectedEngine: EngineTarget | null;
  selectedExport: ExportTargetId | null;
};

export function createDefaultWizardState(): ExportWizardState {
  return {
    open: false,
    selectedEngine: null,
    selectedExport: null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
