import type { Rect } from "../custom-weapon-import.ts";

export type SlotSelectorState = {
  showColorPicker: boolean;
  showImporter: boolean;
  importName: string;
  importReferenceValue: string;
  importStatus: string;
  importing: boolean;
  importOffsetX: number;
  importOffsetY: number;
  importScalePercent: number;
  renamingCustomPartId: string | null;
  renameCustomPartName: string;
  importPreviewFile: File | null;
  importPreviewReferenceCanvas: HTMLCanvasElement | null;
  importPreviewSourceCanvas: HTMLCanvasElement | null;
  importPreviewSourceBounds: Rect | null;
  importPreviewReferenceBounds: Rect | null;
  customAssetFilter: string;
  customAssetTagInput: string;
  editingTagsPartId: string | null;
};

export const IMPORT_OFFSET_MIN = -256;
export const IMPORT_OFFSET_MAX = 256;
export const IMPORT_SCALE_MIN = 10;
export const IMPORT_SCALE_MAX = 800;
