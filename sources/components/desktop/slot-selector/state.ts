import type { SlotSelectorState } from "./types.ts";

export function initializeSlotSelectorState(state: SlotSelectorState): void {
  state.showColorPicker = false;
  state.showImporter = false;
  state.importName = "";
  state.importReferenceValue = "";
  state.importStatus = "";
  state.importing = false;
  state.importOffsetX = 0;
  state.importOffsetY = 0;
  state.importScalePercent = 100;
  state.renamingCustomPartId = null;
  state.renameCustomPartName = "";
  state.importPreviewFile = null;
  state.importPreviewReferenceCanvas = null;
  state.importPreviewSourceCanvas = null;
  state.importPreviewSourceBounds = null;
  state.importPreviewReferenceBounds = null;
  state.customAssetFilter = "";
  state.customAssetTagInput = "";
  state.editingTagsPartId = null;
}
