import m from "mithril";
import { state, selectItem } from "../../state/state.ts";
import type { CatalogReader } from "../../state/catalog.ts";
import type { SlotDef } from "./slot-config.ts";
import {
  getSlotOptions,
  getSlotSelectedValue,
  clearSlotSelections,
  randomizeSlot,
  getDefaultRecolor,
  getSlotTypeNames,
} from "./slot-config.ts";
import {
  setPreviewAnimation,
  stopPreviewAnimation,
  startPreviewAnimation,
  setPreviewShowTransparencyGrid,
  setPreviewApplyTransparencyMask,
} from "../../canvas/preview-animation.ts";
import { renderCharacter } from "../../canvas/renderer.ts";
import { customAnimations } from "../../custom-animations.ts";
import {
  customParts,
  deleteCustomPart,
  getItemMerged,
  registerCustomPart,
  renameCustomPart,
  duplicateCustomPart,
} from "../../state/catalog.ts";
import {
  buildImportedWeaponPart,
  buildImportPreview,
  canUseWeaponImportReference,
  getCustomWeaponImportName,
} from "./custom-weapon-import.ts";
import { requestConfirmation, showToast } from "../../state/notifications.ts";
import {
  exportCustomPartsZip,
  importCustomPartsZip,
} from "../../state/custom-parts-storage.ts";
import { get2DContext } from "../../canvas/canvas-utils.ts";
import { validateCustomAsset } from "../../state/custom-asset-validation.ts";
import {
  getRecolorChoices,
  getSelectedRecolor,
} from "./slot-selector/recolor.ts";
import { drawPreviewWithCrosshair } from "./slot-selector/preview.ts";
import {
  IMPORT_OFFSET_MAX,
  IMPORT_OFFSET_MIN,
  IMPORT_SCALE_MAX,
  IMPORT_SCALE_MIN,
  type SlotSelectorState,
} from "./slot-selector/types.ts";
import { initializeSlotSelectorState } from "./slot-selector/state.ts";
import { renderCustomAssetLibrary } from "./slot-selector/custom-library.ts";
import {
  canUseFeature,
  paidFeatureTitle,
  requireFeature,
} from "../../state/feature-gates.ts";

type SlotSelectorAttrs = {
  slot: SlotDef;
  catalog: CatalogReader;
};

export const SlotSelector: m.Component<SlotSelectorAttrs, SlotSelectorState> = {
  oninit(vnode) {
    initializeSlotSelectorState(vnode.state);
  },

  view(vnode) {
    const { slot, catalog } = vnode.attrs;
    const options = getSlotOptions(slot, catalog);
    const selectedValue = getSlotSelectedValue(slot, catalog);
    const hasSelection = selectedValue !== "";
    const canImportWeapon = slot.label === "Mainhand";
    const canEditParts = canUseFeature("advanced-editor");
    const canImportCustomAssets = canUseFeature("custom-imports");
    const slotTypeNames = getSlotTypeNames(slot);
    const importReferenceOptions = canImportWeapon
      ? options.filter(
          (opt) =>
            !opt.itemId.startsWith("custom_") &&
            canUseWeaponImportReference(catalog, opt.itemId),
        )
      : [];
    let customAssetParts = canImportWeapon
      ? Object.values(customParts)
          .filter((part) => slotTypeNames.includes(part.type_name))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    // Filter by tag or name
    const filter = vnode.state.customAssetFilter.trim().toLowerCase();
    if (filter) {
      customAssetParts = customAssetParts.filter(
        (part) =>
          part.name.toLowerCase().includes(filter) ||
          part.tags?.some((t) => t.toLowerCase().includes(filter)),
      );
    }

    if (
      canImportWeapon &&
      importReferenceOptions.length > 0 &&
      !importReferenceOptions.some(
        (opt) => opt.value === vnode.state.importReferenceValue,
      )
    ) {
      vnode.state.importReferenceValue =
        selectedValue &&
        importReferenceOptions.some((opt) => opt.value === selectedValue)
          ? selectedValue
          : importReferenceOptions[0]!.value;
    }

    const isBodyType = slot.kind === "bodyType";

    // Find the selected option to get its itemId for color picker
    let selectedItemId: string | null = null;
    if (hasSelection && !isBodyType) {
      const opt = options.find((o) => o.value === selectedValue);
      if (opt) {
        selectedItemId = opt.itemId;
      }
    }

    // Get recolor choices for the color picker
    const recolorChoices = selectedItemId
      ? getRecolorChoices(selectedItemId, catalog)
      : [];
    const currentRecolor = selectedItemId
      ? getSelectedRecolor(selectedItemId)
      : null;

    const loadPreview = async (file: File): Promise<void> => {
      const reference =
        importReferenceOptions.find(
          (opt) => opt.value === vnode.state.importReferenceValue,
        ) ?? importReferenceOptions[0];
      if (!reference) return;

      try {
        const preview = await buildImportPreview(
          file,
          reference.itemId,
          reference.variant ?? null,
          state.bodyType,
          state.selections,
          catalog,
        );
        if (preview) {
          // Validate the imported image
          const srcCtx = get2DContext(preview.sourceCanvas, true);
          const srcImageData = srcCtx.getImageData(
            0,
            0,
            preview.sourceCanvas.width,
            preview.sourceCanvas.height,
          );
          const validation = validateCustomAsset(srcImageData, "weapon");
          if (!validation.passed) {
            const errorMsg = validation.issues
              .filter((i) => i.severity === "error")
              .map((i) => i.message)
              .join("; ");
            const warningMsg = validation.issues
              .filter((i) => i.severity !== "error")
              .map((i) => i.message)
              .join("; ");
            vnode.state.importStatus = [
              errorMsg ? `Error: ${errorMsg}` : "",
              warningMsg ? `Warning: ${warningMsg}` : "",
            ]
              .filter(Boolean)
              .join(". ");
            if (errorMsg) {
              m.redraw();
              return;
            }
          } else {
            const warningMsg = validation.issues
              .filter((i) => i.severity !== "info")
              .map((i) => i.message)
              .join("; ");
            vnode.state.importStatus = warningMsg
              ? `Adjust alignment, then click Import. Note: ${warningMsg}`
              : "Adjust alignment, then click Import";
          }

          vnode.state.importPreviewFile = file;
          vnode.state.importPreviewReferenceCanvas = preview.referenceCanvas;
          vnode.state.importPreviewSourceCanvas = preview.sourceCanvas;
          vnode.state.importPreviewSourceBounds = preview.sourceBounds;
          vnode.state.importPreviewReferenceBounds = preview.referenceBounds;
        } else {
          vnode.state.importStatus = "Unable to build preview";
        }
      } catch (err) {
        vnode.state.importStatus =
          err instanceof Error ? err.message : "Preview failed";
      }
      m.redraw();
    };

    const clearPreview = (): void => {
      vnode.state.importPreviewFile = null;
      vnode.state.importPreviewReferenceCanvas = null;
      vnode.state.importPreviewSourceCanvas = null;
      vnode.state.importPreviewSourceBounds = null;
      vnode.state.importPreviewReferenceBounds = null;
    };

    const handleWeaponImport = async (): Promise<void> => {
      const file = vnode.state.importPreviewFile;
      if (!file) return;

      const reference =
        importReferenceOptions.find(
          (opt) => opt.value === vnode.state.importReferenceValue,
        ) ?? importReferenceOptions[0];
      if (!reference) return;

      vnode.state.importing = true;
      vnode.state.importStatus = "Aligning...";
      m.redraw();

      try {
        const name =
          vnode.state.importName.trim() || getCustomWeaponImportName(file);
        const customPart = await buildImportedWeaponPart({
          file,
          name: name || "Imported weapon",
          referenceItemId: reference.itemId,
          referenceVariant: reference.variant ?? null,
          bodyType: state.bodyType,
          selections: state.selections,
          catalog,
          offsetX: vnode.state.importOffsetX,
          offsetY: vnode.state.importOffsetY,
          scalePercent: vnode.state.importScalePercent,
        });
        // Apply tags if any
        const tags = vnode.state.customAssetTagInput
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        if (tags.length > 0) {
          customPart.tags = tags;
        }
        registerCustomPart(customPart);
        clearSlotSelections(slot, catalog);
        state.selections[customPart.type_name] = {
          itemId: customPart.itemId,
          variant: null,
          recolor: null,
          name: customPart.name,
        };
        await (window.canvasRenderer?.renderCharacter ?? renderCharacter)(
          state.selections,
          state.bodyType,
        );
        const importedCustomAnimation = Object.keys(customPart.sheets).find(
          (animation) => customAnimations[animation],
        );
        if (importedCustomAnimation) {
          stopPreviewAnimation();
          setPreviewAnimation(importedCustomAnimation);
          setPreviewShowTransparencyGrid(state.showTransparencyGrid);
          setPreviewApplyTransparencyMask(state.applyTransparencyMask);
          startPreviewAnimation();
          state.selectedAnimation = importedCustomAnimation;
        }
        vnode.state.importStatus = `Imported ${customPart.name}`;
        vnode.state.showImporter = false;
        vnode.state.importName = "";
        vnode.state.customAssetTagInput = "";
        clearPreview();
      } catch (err) {
        vnode.state.importStatus =
          err instanceof Error ? err.message : "Import failed";
      } finally {
        vnode.state.importing = false;
        m.redraw();
      }
    };

    const setImportNumber = (
      key: "importOffsetX" | "importOffsetY" | "importScalePercent",
      rawValue: string,
      min: number,
      max: number,
    ): void => {
      const nextValue = Number(rawValue);
      vnode.state[key] = Number.isFinite(nextValue)
        ? Math.max(min, Math.min(max, nextValue))
        : key === "importScalePercent"
          ? 100
          : 0;
    };

    const resetImportTuning = (): void => {
      vnode.state.importOffsetX = 0;
      vnode.state.importOffsetY = 0;
      vnode.state.importScalePercent = 100;
    };

    const centerOnReference = (): void => {
      const refBounds = vnode.state.importPreviewReferenceBounds;
      const srcBounds = vnode.state.importPreviewSourceBounds;
      if (!refBounds || !srcBounds) return;
      const refCx = refBounds.x + refBounds.width / 2;
      const refCy = refBounds.y + refBounds.height / 2;
      const srcCx = srcBounds.x + srcBounds.width / 2;
      const srcCy = srcBounds.y + srcBounds.height / 2;
      vnode.state.importOffsetX = Math.round(refCx - srcCx);
      vnode.state.importOffsetY = Math.round(refCy - srcCy);
    };

    const nudge = (
      key: "importOffsetX" | "importOffsetY",
      delta: number,
    ): void => {
      const current = vnode.state[key];
      const next = Math.max(
        IMPORT_OFFSET_MIN,
        Math.min(IMPORT_OFFSET_MAX, current + delta),
      );
      vnode.state[key] = next;
    };

    const renderCurrentCharacter = async (): Promise<void> => {
      await (window.canvasRenderer?.renderCharacter ?? renderCharacter)(
        state.selections,
        state.bodyType,
      );
      m.redraw();
    };

    const selectCustomAsset = async (
      part: (typeof customAssetParts)[number],
    ): Promise<void> => {
      clearSlotSelections(slot, catalog);
      state.selections[part.type_name] = {
        itemId: part.itemId,
        variant: null,
        recolor: null,
        name: part.name,
      };
      await renderCurrentCharacter();
    };

    const startRenameCustomAsset = (
      part: (typeof customAssetParts)[number],
    ): void => {
      vnode.state.renamingCustomPartId = part.itemId;
      vnode.state.renameCustomPartName = part.name;
    };

    const cancelRenameCustomAsset = (): void => {
      vnode.state.renamingCustomPartId = null;
      vnode.state.renameCustomPartName = "";
    };

    const saveRenameCustomAsset = (
      part: (typeof customAssetParts)[number],
    ): void => {
      const nextName = vnode.state.renameCustomPartName.trim();
      if (!nextName) return;

      if (renameCustomPart(part.itemId, nextName)) {
        for (const selection of Object.values(state.selections)) {
          if (selection.itemId === part.itemId) {
            selection.name = nextName;
          }
        }
      }
      cancelRenameCustomAsset();
    };

    const deleteCustomAsset = async (
      part: (typeof customAssetParts)[number],
    ): Promise<void> => {
      const confirmed = await requestConfirmation({
        title: "Delete imported asset",
        message: `Delete "${part.name}" from saved imports?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) return;

      const wasSelected = Object.values(state.selections).some(
        (selection) => selection.itemId === part.itemId,
      );
      for (const [key, selection] of Object.entries(state.selections)) {
        if (selection.itemId === part.itemId) {
          delete state.selections[key];
        }
      }
      deleteCustomPart(part.itemId);
      if (vnode.state.renamingCustomPartId === part.itemId) {
        cancelRenameCustomAsset();
      }
      if (vnode.state.editingTagsPartId === part.itemId) {
        vnode.state.editingTagsPartId = null;
      }
      showToast(`Deleted "${part.name}".`, { kind: "success" });
      if (wasSelected) {
        await renderCurrentCharacter();
      } else {
        m.redraw();
      }
    };

    const duplicateCustomAsset = (
      part: (typeof customAssetParts)[number],
    ): void => {
      const duplicated = duplicateCustomPart(part.itemId);
      if (duplicated) {
        showToast(`Duplicated "${part.name}".`, { kind: "success" });
        m.redraw();
      }
    };

    const exportAllCustomAssets = async (): Promise<void> => {
      const parts = Object.values(customParts).filter((part) =>
        slotTypeNames.includes(part.type_name),
      );
      if (parts.length === 0) {
        showToast("No custom assets to export.", { kind: "warning" });
        return;
      }
      try {
        const blob = await exportCustomPartsZip(parts);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lpc_custom_assets_${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${parts.length} custom assets.`, {
          kind: "success",
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Export failed", {
          kind: "error",
        });
      }
    };

    const importBackupCustomAssets = async (e: Event): Promise<void> => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const imported = await importCustomPartsZip(file);
        for (const part of imported) {
          registerCustomPart(part);
        }
        showToast(`Imported ${imported.length} custom assets.`, {
          kind: "success",
        });
        input.value = "";
        m.redraw();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Import backup failed", {
          kind: "error",
        });
        input.value = "";
      }
    };

    const saveTags = (part: (typeof customAssetParts)[number]): void => {
      const tags = vnode.state.customAssetTagInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      part.tags = tags.length > 0 ? tags : undefined;
      vnode.state.editingTagsPartId = null;
      vnode.state.customAssetTagInput = "";
      m.redraw();
    };

    const startEditTags = (part: (typeof customAssetParts)[number]): void => {
      vnode.state.editingTagsPartId = part.itemId;
      vnode.state.customAssetTagInput = (part.tags ?? []).join(", ");
    };

    const cancelEditTags = (): void => {
      vnode.state.editingTagsPartId = null;
      vnode.state.customAssetTagInput = "";
    };

    // Draw preview canvases when data is available
    const previewRefCanvas = document.getElementById(
      `import-preview-ref-${slot.label}`,
    ) as HTMLCanvasElement | null;
    const previewSrcCanvas = document.getElementById(
      `import-preview-src-${slot.label}`,
    ) as HTMLCanvasElement | null;
    if (
      previewRefCanvas &&
      vnode.state.importPreviewReferenceCanvas &&
      vnode.state.importPreviewReferenceBounds
    ) {
      drawPreviewWithCrosshair(
        previewRefCanvas,
        vnode.state.importPreviewReferenceCanvas,
        vnode.state.importPreviewReferenceBounds,
      );
    }
    if (
      previewSrcCanvas &&
      vnode.state.importPreviewSourceCanvas &&
      vnode.state.importPreviewSourceBounds
    ) {
      drawPreviewWithCrosshair(
        previewSrcCanvas,
        vnode.state.importPreviewSourceCanvas,
        vnode.state.importPreviewSourceBounds,
      );
    }

    return m(
      "div.desktop-slot",
      { class: canImportWeapon ? "has-importer" : "" },
      [
        m("label.desktop-slot-label", slot.label),
        m("div.desktop-slot-control", [
          m(
            "select.desktop-slot-select",
            {
              value: selectedValue,
              onchange: (e: Event) => {
                const target = e.target as HTMLSelectElement;
                const value = target.value;
                vnode.state.showColorPicker = false;

                if (isBodyType) {
                  state.bodyType = value;
                  m.redraw();
                  return;
                }

                if (!value) {
                  clearSlotSelections(slot, catalog);
                  return;
                }

                const opt = options.find((o) => o.value === value);
                if (!opt) return;

                clearSlotSelections(slot, catalog);

                if (opt.variant) {
                  selectItem(opt.itemId, opt.variant);
                } else {
                  const defaultRecolor = getDefaultRecolor(opt.itemId, catalog);
                  selectItem(opt.itemId, defaultRecolor || "");
                }

                // Auto-switch preview animation for custom-animation-only items
                const meta = getItemMerged(opt.itemId).unwrapOr(null);
                if (meta && meta.animations && meta.animations.length > 0) {
                  const firstAnim = meta.animations[0];
                  if (
                    firstAnim &&
                    customAnimations &&
                    customAnimations[firstAnim]
                  ) {
                    // This item only has custom animations — switch preview to show it
                    stopPreviewAnimation();
                    setPreviewAnimation(firstAnim);
                    setPreviewShowTransparencyGrid(state.showTransparencyGrid);
                    setPreviewApplyTransparencyMask(
                      state.applyTransparencyMask,
                    );
                    startPreviewAnimation();
                    state.selectedAnimation = firstAnim;
                  }
                }
              },
            },
            [
              m("option", { value: "" }, "None"),
              ...options.map((opt) =>
                m("option", { value: opt.value }, opt.label),
              ),
            ],
          ),
          slot.canRandomize
            ? m(
                "button.desktop-slot-dice",
                {
                  title: `Randomize ${slot.label}`,
                  onclick: () => {
                    vnode.state.showColorPicker = false;
                    randomizeSlot(slot, catalog);
                  },
                },
                "🎲",
              )
            : null,
          hasSelection && !isBodyType && selectedItemId
            ? m(
                "button.desktop-slot-edit",
                {
                  class: canEditParts ? "" : "is-locked",
                  title: canEditParts
                    ? `Edit ${slot.label}`
                    : paidFeatureTitle("advanced-editor"),
                  onclick: () => {
                    if (!requireFeature("advanced-editor")) return;
                    state.editingPart = {
                      slotLabel: slot.label,
                      itemId: selectedItemId!,
                    };
                  },
                },
                "✏️",
              )
            : null,
          canImportWeapon
            ? m(
                "button.desktop-slot-import",
                {
                  type: "button",
                  title: vnode.state.showImporter
                    ? "Close weapon import"
                    : canImportCustomAssets
                      ? "Import a weapon or tool and align it to a built-in reference"
                      : paidFeatureTitle("custom-imports"),
                  onclick: () => {
                    if (!requireFeature("custom-imports")) return;
                    vnode.state.showColorPicker = false;
                    vnode.state.showImporter = !vnode.state.showImporter;
                    if (!vnode.state.showImporter) {
                      clearPreview();
                    }
                  },
                },
                "↥",
              )
            : null,
          slot.hasColor && hasSelection && selectedItemId
            ? m("div.desktop-slot-color", {
                style: {
                  backgroundColor:
                    recolorChoices.find((c) => c.value === currentRecolor)
                      ?.gradient[0] ?? "#8B7355",
                },
                title: currentRecolor
                  ? `Color: ${currentRecolor}`
                  : "Click to change color",
                onclick: (e: MouseEvent) => {
                  e.stopPropagation();
                  vnode.state.showColorPicker = !vnode.state.showColorPicker;
                },
              })
            : null,
        ]),
        canImportWeapon && vnode.state.showImporter
          ? m("div.desktop-slot-import-panel", [
              m("input.desktop-slot-import-name", {
                type: "text",
                placeholder: "Imported asset name",
                value: vnode.state.importName,
                title: "Name for the imported weapon or tool",
                oninput: (e: Event) => {
                  vnode.state.importName = (e.target as HTMLInputElement).value;
                },
              }),
              m(
                "select.desktop-slot-import-reference",
                {
                  value: vnode.state.importReferenceValue,
                  title: "Built-in asset used as the alignment reference",
                  onchange: (e: Event) => {
                    vnode.state.importReferenceValue = (
                      e.target as HTMLSelectElement
                    ).value;
                    // Rebuild preview if file already selected
                    if (vnode.state.importPreviewFile) {
                      void loadPreview(vnode.state.importPreviewFile);
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
                title:
                  "Choose a transparent weapon/tool image or full LPC sheet",
                disabled:
                  vnode.state.importing || importReferenceOptions.length === 0,
                onchange: (e: Event) => {
                  const input = e.target as HTMLInputElement;
                  const file = input.files?.[0];
                  if (file) {
                    void loadPreview(file);
                  }
                },
              }),
              // Side-by-side preview
              vnode.state.importPreviewSourceCanvas
                ? m("div.desktop-slot-import-preview", [
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
                  ])
                : null,
              m("div.desktop-slot-import-tuning", [
                m("label.desktop-slot-import-tune", [
                  m("span", "X"),
                  m("div.desktop-slot-import-nudge", [
                    m(
                      "button.desktop-slot-import-nudge-btn",
                      {
                        type: "button",
                        title: "Nudge left 1px",
                        disabled: vnode.state.importing,
                        onclick: () => nudge("importOffsetX", -1),
                      },
                      "◀",
                    ),
                    m("input", {
                      type: "number",
                      min: String(IMPORT_OFFSET_MIN),
                      max: String(IMPORT_OFFSET_MAX),
                      step: "1",
                      value: String(vnode.state.importOffsetX),
                      title:
                        "Horizontal alignment nudge in pixels; mirrored side rows use the opposite X offset",
                      disabled: vnode.state.importing,
                      oninput: (e: Event) => {
                        setImportNumber(
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
                        disabled: vnode.state.importing,
                        onclick: () => nudge("importOffsetX", 1),
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
                        disabled: vnode.state.importing,
                        onclick: () => nudge("importOffsetY", -1),
                      },
                      "▲",
                    ),
                    m("input", {
                      type: "number",
                      min: String(IMPORT_OFFSET_MIN),
                      max: String(IMPORT_OFFSET_MAX),
                      step: "1",
                      value: String(vnode.state.importOffsetY),
                      title: "Vertical alignment nudge in pixels",
                      disabled: vnode.state.importing,
                      oninput: (e: Event) => {
                        setImportNumber(
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
                        disabled: vnode.state.importing,
                        onclick: () => nudge("importOffsetY", 1),
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
                    value: String(vnode.state.importScalePercent),
                    title:
                      "Scale applied after auto-alignment; 100 keeps the matched reference size",
                    disabled: vnode.state.importing,
                    oninput: (e: Event) => {
                      setImportNumber(
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
                    disabled: vnode.state.importing,
                    onclick: resetImportTuning,
                  },
                  "↺",
                ),
                m(
                  "button.desktop-slot-import-reset",
                  {
                    type: "button",
                    title: "Center imported image on reference bounds",
                    disabled:
                      vnode.state.importing ||
                      !vnode.state.importPreviewReferenceBounds,
                    onclick: centerOnReference,
                  },
                  "⊕",
                ),
              ]),
              m("input.desktop-slot-import-tags", {
                type: "text",
                placeholder: "Tags (comma separated)",
                value: vnode.state.customAssetTagInput,
                title: "Optional tags for the imported asset",
                disabled: vnode.state.importing,
                oninput: (e: Event) => {
                  vnode.state.customAssetTagInput = (
                    e.target as HTMLInputElement
                  ).value;
                },
              }),
              m(
                "button.desktop-slot-import-action",
                {
                  type: "button",
                  disabled:
                    vnode.state.importing || !vnode.state.importPreviewFile,
                  onclick: () => {
                    void handleWeaponImport();
                  },
                },
                vnode.state.importing ? "Importing..." : "Import",
              ),
              vnode.state.importStatus
                ? m("span.desktop-slot-import-status", vnode.state.importStatus)
                : null,
              renderCustomAssetLibrary({
                stateObj: vnode.state,
                selectedValue,
                customAssetParts,
                exportAllCustomAssets,
                importBackupCustomAssets,
                selectCustomAsset,
                startRenameCustomAsset,
                cancelRenameCustomAsset,
                saveRenameCustomAsset,
                duplicateCustomAsset,
                deleteCustomAsset,
                startEditTags,
                cancelEditTags,
                saveTags,
              }),
            ])
          : null,
        // Inline color picker panel
        vnode.state.showColorPicker && recolorChoices.length > 0
          ? m("div.desktop-color-picker", [
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
                        vnode.state.showColorPicker = false;
                      },
                    },
                    m("span.desktop-color-swatch-label", choice.label),
                  ),
                ),
              ),
            ])
          : null,
      ],
    );
  },
};
