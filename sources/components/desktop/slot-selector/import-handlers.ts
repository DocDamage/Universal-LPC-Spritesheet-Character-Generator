import m from "mithril";
import {
  setPreviewAnimation,
  stopPreviewAnimation,
  startPreviewAnimation,
  setPreviewShowTransparencyGrid,
  setPreviewApplyTransparencyMask,
} from "../../../canvas/preview-animation.ts";
import { renderCharacter } from "../../../canvas/renderer.ts";
import { get2DContext } from "../../../canvas/canvas-utils.ts";
import { customAnimations } from "../../../custom-animations.ts";
import {
  customParts,
  deleteCustomPart,
  duplicateCustomPart,
  registerCustomPart,
  renameCustomPart,
  type CustomPart,
  type CatalogReader,
} from "../../../state/catalog.ts";
import { validateCustomAsset } from "../../../state/custom-asset-validation.ts";
import {
  exportCustomPartsZip,
  importCustomPartsZip,
} from "../../../state/custom-parts-storage.ts";
import {
  requestConfirmation,
  showToast,
} from "../../../state/notifications.ts";
import { state } from "../../../state/state.ts";
import {
  buildImportedWeaponPart,
  buildImportPreview,
  getCustomWeaponImportName,
} from "../custom-weapon-import.ts";
import {
  clearSlotSelections,
  type SlotDef,
  type SlotOption,
} from "../slot-config.ts";
import {
  IMPORT_OFFSET_MAX,
  IMPORT_OFFSET_MIN,
  type SlotSelectorState,
} from "./types.ts";

export type CustomAssetPart = CustomPart;

type ImportHandlersArgs = {
  stateObj: SlotSelectorState;
  slot: SlotDef;
  catalog: CatalogReader;
  importReferenceOptions: SlotOption[];
  slotTypeNames: string[];
};

export type ImportHandlers = ReturnType<typeof createImportHandlers>;

export function createImportHandlers({
  stateObj,
  slot,
  catalog,
  importReferenceOptions,
  slotTypeNames,
}: ImportHandlersArgs) {
  const clearPreview = (): void => {
    stateObj.importPreviewFile = null;
    stateObj.importPreviewReferenceCanvas = null;
    stateObj.importPreviewSourceCanvas = null;
    stateObj.importPreviewSourceBounds = null;
    stateObj.importPreviewReferenceBounds = null;
  };

  const loadPreview = async (file: File): Promise<void> => {
    const reference =
      importReferenceOptions.find(
        (opt) => opt.value === stateObj.importReferenceValue,
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
          stateObj.importStatus = [
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
          stateObj.importStatus = warningMsg
            ? `Adjust alignment, then click Import. Note: ${warningMsg}`
            : "Adjust alignment, then click Import";
        }

        stateObj.importPreviewFile = file;
        stateObj.importPreviewReferenceCanvas = preview.referenceCanvas;
        stateObj.importPreviewSourceCanvas = preview.sourceCanvas;
        stateObj.importPreviewSourceBounds = preview.sourceBounds;
        stateObj.importPreviewReferenceBounds = preview.referenceBounds;
      } else {
        stateObj.importStatus = "Unable to build preview";
      }
    } catch (err) {
      stateObj.importStatus =
        err instanceof Error ? err.message : "Preview failed";
    }
    m.redraw();
  };

  const handleWeaponImport = async (): Promise<void> => {
    const file = stateObj.importPreviewFile;
    if (!file) return;

    const reference =
      importReferenceOptions.find(
        (opt) => opt.value === stateObj.importReferenceValue,
      ) ?? importReferenceOptions[0];
    if (!reference) return;

    stateObj.importing = true;
    stateObj.importStatus = "Aligning...";
    m.redraw();

    try {
      const name =
        stateObj.importName.trim() || getCustomWeaponImportName(file);
      const customPart = await buildImportedWeaponPart({
        file,
        name: name || "Imported weapon",
        referenceItemId: reference.itemId,
        referenceVariant: reference.variant ?? null,
        bodyType: state.bodyType,
        selections: state.selections,
        catalog,
        offsetX: stateObj.importOffsetX,
        offsetY: stateObj.importOffsetY,
        scalePercent: stateObj.importScalePercent,
      });
      const tags = stateObj.customAssetTagInput
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
      stateObj.importStatus = `Imported ${customPart.name}`;
      stateObj.showImporter = false;
      stateObj.importName = "";
      stateObj.customAssetTagInput = "";
      clearPreview();
    } catch (err) {
      stateObj.importStatus =
        err instanceof Error ? err.message : "Import failed";
    } finally {
      stateObj.importing = false;
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
    stateObj[key] = Number.isFinite(nextValue)
      ? Math.max(min, Math.min(max, nextValue))
      : key === "importScalePercent"
        ? 100
        : 0;
  };

  const resetImportTuning = (): void => {
    stateObj.importOffsetX = 0;
    stateObj.importOffsetY = 0;
    stateObj.importScalePercent = 100;
  };

  const centerOnReference = (): void => {
    const refBounds = stateObj.importPreviewReferenceBounds;
    const srcBounds = stateObj.importPreviewSourceBounds;
    if (!refBounds || !srcBounds) return;
    const refCx = refBounds.x + refBounds.width / 2;
    const refCy = refBounds.y + refBounds.height / 2;
    const srcCx = srcBounds.x + srcBounds.width / 2;
    const srcCy = srcBounds.y + srcBounds.height / 2;
    stateObj.importOffsetX = Math.round(refCx - srcCx);
    stateObj.importOffsetY = Math.round(refCy - srcCy);
  };

  const nudge = (
    key: "importOffsetX" | "importOffsetY",
    delta: number,
  ): void => {
    const current = stateObj[key];
    stateObj[key] = Math.max(
      IMPORT_OFFSET_MIN,
      Math.min(IMPORT_OFFSET_MAX, current + delta),
    );
  };

  const renderCurrentCharacter = async (): Promise<void> => {
    await (window.canvasRenderer?.renderCharacter ?? renderCharacter)(
      state.selections,
      state.bodyType,
    );
    m.redraw();
  };

  const selectCustomAsset = async (part: CustomAssetPart): Promise<void> => {
    clearSlotSelections(slot, catalog);
    state.selections[part.type_name] = {
      itemId: part.itemId,
      variant: null,
      recolor: null,
      name: part.name,
    };
    await renderCurrentCharacter();
  };

  const startRenameCustomAsset = (part: CustomAssetPart): void => {
    stateObj.renamingCustomPartId = part.itemId;
    stateObj.renameCustomPartName = part.name;
  };

  const cancelRenameCustomAsset = (): void => {
    stateObj.renamingCustomPartId = null;
    stateObj.renameCustomPartName = "";
  };

  const saveRenameCustomAsset = (part: CustomAssetPart): void => {
    const nextName = stateObj.renameCustomPartName.trim();
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

  const deleteCustomAsset = async (part: CustomAssetPart): Promise<void> => {
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
    if (stateObj.renamingCustomPartId === part.itemId) {
      cancelRenameCustomAsset();
    }
    if (stateObj.editingTagsPartId === part.itemId) {
      stateObj.editingTagsPartId = null;
    }
    showToast(`Deleted "${part.name}".`, { kind: "success" });
    if (wasSelected) {
      await renderCurrentCharacter();
    } else {
      m.redraw();
    }
  };

  const duplicateCustomAsset = (part: CustomAssetPart): void => {
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

  const saveTags = (part: CustomAssetPart): void => {
    const tags = stateObj.customAssetTagInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    part.tags = tags.length > 0 ? tags : undefined;
    stateObj.editingTagsPartId = null;
    stateObj.customAssetTagInput = "";
    m.redraw();
  };

  const startEditTags = (part: CustomAssetPart): void => {
    stateObj.editingTagsPartId = part.itemId;
    stateObj.customAssetTagInput = (part.tags ?? []).join(", ");
  };

  const cancelEditTags = (): void => {
    stateObj.editingTagsPartId = null;
    stateObj.customAssetTagInput = "";
  };

  return {
    centerOnReference,
    cancelEditTags,
    cancelRenameCustomAsset,
    clearPreview,
    deleteCustomAsset,
    duplicateCustomAsset,
    exportAllCustomAssets,
    handleWeaponImport,
    importBackupCustomAssets,
    loadPreview,
    nudge,
    resetImportTuning,
    saveRenameCustomAsset,
    saveTags,
    selectCustomAsset,
    setImportNumber,
    startEditTags,
    startRenameCustomAsset,
  };
}
