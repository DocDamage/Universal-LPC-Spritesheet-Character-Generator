// View rendering helpers — extracted from SlotSelector.ts view

import m from "mithril";
import { selectItem } from "../../../state/state.ts";
import type { ImportHandlers } from "./import-handlers.ts";
import type { SlotSelectorState } from "./types.ts";
import {
  IMPORT_OFFSET_MAX,
  IMPORT_OFFSET_MIN,
  IMPORT_SCALE_MAX,
  IMPORT_SCALE_MIN,
} from "./types.ts";
import { renderCustomAssetLibrary } from "./custom-library.ts";
import { drawPreviewWithCrosshair } from "./preview.ts";
import type { SlotDef } from "../slot-config.ts";
import type { CustomPart } from "../../../state/catalog.ts";

// ─── Preview canvas drawing ──────────────────────────────────────────

export function drawPreviewCanvases(
  slot: SlotDef,
  stateObj: SlotSelectorState,
): void {
  const previewRefCanvas = document.getElementById(
    `import-preview-ref-${slot.label}`,
  ) as HTMLCanvasElement | null;
  const previewSrcCanvas = document.getElementById(
    `import-preview-src-${slot.label}`,
  ) as HTMLCanvasElement | null;

  if (
    previewRefCanvas &&
    stateObj.importPreviewReferenceCanvas &&
    stateObj.importPreviewReferenceBounds
  ) {
    drawPreviewWithCrosshair(
      previewRefCanvas,
      stateObj.importPreviewReferenceCanvas,
      stateObj.importPreviewReferenceBounds,
    );
  }
  if (
    previewSrcCanvas &&
    stateObj.importPreviewSourceCanvas &&
    stateObj.importPreviewSourceBounds
  ) {
    drawPreviewWithCrosshair(
      previewSrcCanvas,
      stateObj.importPreviewSourceCanvas,
      stateObj.importPreviewSourceBounds,
    );
  }
}

// ─── Import panel — tuning controls ──────────────────────────────────

function renderImportTuning(
  stateObj: SlotSelectorState,
  importHandlers: ImportHandlers,
): m.Children {
  return m("div.desktop-slot-import-tuning", [
    m("label.desktop-slot-import-tune", [
      m("span", "X"),
      m("div.desktop-slot-import-nudge", [
        m(
          "button.desktop-slot-import-nudge-btn",
          {
            type: "button",
            title: "Nudge left 1px",
            disabled: stateObj.importing,
            onclick: () => importHandlers.nudge("importOffsetX", -1),
          },
          "◀",
        ),
        m("input", {
          type: "number",
          min: String(IMPORT_OFFSET_MIN),
          max: String(IMPORT_OFFSET_MAX),
          step: "1",
          value: String(stateObj.importOffsetX),
          title:
            "Horizontal alignment nudge in pixels; mirrored side rows use the opposite X offset",
          disabled: stateObj.importing,
          oninput: (e: Event) => {
            importHandlers.setImportNumber(
              "importOffsetX",
              (e.target as HTMLInputElement).value,
              IMPORT_OFFSET_MIN,
              IMPORT_OFFSET_MAX,
            );
          },
        }),
        m(
          "button.desktop-slot-import-nudge-btn",
          {
            type: "button",
            title: "Nudge right 1px",
            disabled: stateObj.importing,
            onclick: () => importHandlers.nudge("importOffsetX", 1),
          },
          "▶",
        ),
      ]),
    ]),
    m("label.desktop-slot-import-tune", [
      m("span", "Y"),
      m("div.desktop-slot-import-nudge", [
        m(
          "button.desktop-slot-import-nudge-btn",
          {
            type: "button",
            title: "Nudge up 1px",
            disabled: stateObj.importing,
            onclick: () => importHandlers.nudge("importOffsetY", -1),
          },
          "▲",
        ),
        m("input", {
          type: "number",
          min: String(IMPORT_OFFSET_MIN),
          max: String(IMPORT_OFFSET_MAX),
          step: "1",
          value: String(stateObj.importOffsetY),
          title: "Vertical alignment nudge in pixels",
          disabled: stateObj.importing,
          oninput: (e: Event) => {
            importHandlers.setImportNumber(
              "importOffsetY",
              (e.target as HTMLInputElement).value,
              IMPORT_OFFSET_MIN,
              IMPORT_OFFSET_MAX,
            );
          },
        }),
        m(
          "button.desktop-slot-import-nudge-btn",
          {
            type: "button",
            title: "Nudge down 1px",
            disabled: stateObj.importing,
            onclick: () => importHandlers.nudge("importOffsetY", 1),
          },
          "▼",
        ),
      ]),
    ]),
    m("label.desktop-slot-import-tune", [
      m("span", "%"),
      m("input", {
        type: "number",
        min: String(IMPORT_SCALE_MIN),
        max: String(IMPORT_SCALE_MAX),
        step: "5",
        value: String(stateObj.importScalePercent),
        title:
          "Scale applied after auto-alignment; 100 keeps the matched reference size",
        disabled: stateObj.importing,
        oninput: (e: Event) => {
          importHandlers.setImportNumber(
            "importScalePercent",
            (e.target as HTMLInputElement).value,
            IMPORT_SCALE_MIN,
            IMPORT_SCALE_MAX,
          );
        },
      }),
    ]),
    m(
      "button.desktop-slot-import-reset",
      {
        type: "button",
        title: "Reset import alignment tuning",
        disabled: stateObj.importing,
        onclick: importHandlers.resetImportTuning,
      },
      "↺",
    ),
    m(
      "button.desktop-slot-import-reset",
      {
        type: "button",
        title: "Center imported image on reference bounds",
        disabled: stateObj.importing || !stateObj.importPreviewReferenceBounds,
        onclick: importHandlers.centerOnReference,
      },
      "⊕",
    ),
  ]);
}

// ─── Import panel — side-by-side preview ─────────────────────────────

function renderImportPreview(
  slot: SlotDef,
  stateObj: SlotSelectorState,
): m.Children {
  if (!stateObj.importPreviewSourceCanvas) return null;
  return m("div.desktop-slot-import-preview", [
    m("div.desktop-slot-import-preview-col", [
      m("span.desktop-slot-import-preview-label", "Reference"),
      m("canvas.desktop-slot-import-preview-canvas", {
        id: `import-preview-ref-${slot.label}`,
        width: 128,
        height: 128,
      }),
    ]),
    m("div.desktop-slot-import-preview-col", [
      m("span.desktop-slot-import-preview-label", "Import"),
      m("canvas.desktop-slot-import-preview-canvas", {
        id: `import-preview-src-${slot.label}`,
        width: 128,
        height: 128,
      }),
    ]),
  ]);
}

// ─── Import panel — full panel ───────────────────────────────────────

export function renderImportPanel(
  slot: SlotDef,
  stateObj: SlotSelectorState,
  importReferenceOptions: { value: string; label: string }[],
  importHandlers: ImportHandlers,
  customAssetParts: CustomPart[],
  selectedValue: string,
): m.Children {
  return m("div.desktop-slot-import-panel", [
    m("input.desktop-slot-import-name", {
      type: "text",
      placeholder: "Imported asset name",
      value: stateObj.importName,
      title: "Name for the imported weapon or tool",
      oninput: (e: Event) => {
        stateObj.importName = (e.target as HTMLInputElement).value;
      },
    }),
    m(
      "select.desktop-slot-import-reference",
      {
        value: stateObj.importReferenceValue,
        title: "Built-in asset used as the alignment reference",
        onchange: (e: Event) => {
          stateObj.importReferenceValue = (e.target as HTMLSelectElement).value;
          if (stateObj.importPreviewFile) {
            void importHandlers.loadPreview(stateObj.importPreviewFile);
          }
        },
      },
      importReferenceOptions.map((opt) =>
        m("option", { value: opt.value }, opt.label),
      ),
    ),
    m("input.desktop-slot-import-input", {
      type: "file",
      accept: "image/*",
      title: "Choose a transparent weapon/tool image or full LPC sheet",
      disabled: stateObj.importing || importReferenceOptions.length === 0,
      onchange: (e: Event) => {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
          void importHandlers.loadPreview(file);
        }
      },
    }),
    renderImportPreview(slot, stateObj),
    renderImportTuning(stateObj, importHandlers),
    m("input.desktop-slot-import-tags", {
      type: "text",
      placeholder: "Tags (comma separated)",
      value: stateObj.customAssetTagInput,
      title: "Optional tags for the imported asset",
      disabled: stateObj.importing,
      oninput: (e: Event) => {
        stateObj.customAssetTagInput = (e.target as HTMLInputElement).value;
      },
    }),
    m(
      "button.desktop-slot-import-action",
      {
        type: "button",
        disabled: stateObj.importing || !stateObj.importPreviewFile,
        onclick: () => {
          void importHandlers.handleWeaponImport();
        },
      },
      stateObj.importing ? "Importing..." : "Import",
    ),
    stateObj.importStatus
      ? m("span.desktop-slot-import-status", stateObj.importStatus)
      : null,
    renderCustomAssetLibrary({
      stateObj,
      selectedValue,
      customAssetParts,
      exportAllCustomAssets: importHandlers.exportAllCustomAssets,
      importBackupCustomAssets: importHandlers.importBackupCustomAssets,
      selectCustomAsset: importHandlers.selectCustomAsset,
      startRenameCustomAsset: importHandlers.startRenameCustomAsset,
      cancelRenameCustomAsset: importHandlers.cancelRenameCustomAsset,
      saveRenameCustomAsset: importHandlers.saveRenameCustomAsset,
      duplicateCustomAsset: importHandlers.duplicateCustomAsset,
      deleteCustomAsset: importHandlers.deleteCustomAsset,
      startEditTags: importHandlers.startEditTags,
      cancelEditTags: importHandlers.cancelEditTags,
      saveTags: importHandlers.saveTags,
    }),
  ]);
}

// ─── Color picker panel ──────────────────────────────────────────────

export function renderColorPicker(
  recolorChoices: { value: string; label: string; gradient: string[] }[],
  currentRecolor: string | null,
  selectedItemId: string | null,
  stateObj: { showColorPicker: boolean },
): m.Children {
  if (!stateObj.showColorPicker || recolorChoices.length === 0) return null;

  return m("div.desktop-color-picker", [
    m(
      "div.desktop-color-picker-grid",
      recolorChoices.map((choice) =>
        m(
          "div.desktop-color-swatch",
          {
            key: choice.value,
            class:
              choice.value === currentRecolor
                ? "desktop-color-swatch-selected"
                : "",
            title: choice.label,
            style: {
              background: `linear-gradient(to bottom, ${choice.gradient.join(", ")})`,
            },
            onclick: () => {
              if (selectedItemId) {
                selectItem(selectedItemId, choice.value);
              }
              stateObj.showColorPicker = false;
            },
          },
          m("span.desktop-color-swatch-label", choice.label),
        ),
      ),
    ),
  ]);
}
