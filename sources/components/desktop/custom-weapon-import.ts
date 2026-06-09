// Legacy re-export barrel — prefer importing from "./custom-weapon-import/index.ts" directly

export type {
  Rect,
  SourceMode,
  ImportWeaponOptions,
  ImportAdjustment,
} from "./custom-weapon-import/types.ts";

export {
  canUseWeaponImportReference,
  getCustomWeaponImportName,
  buildImportedWeaponPart,
  buildImportPreview,
} from "./custom-weapon-import/importer.ts";

export { alignSourceToReferenceSheet } from "./custom-weapon-import/alignment.ts";

export {
  getSourceMode,
  getContentBounds,
  canvasFromImage,
  loadImageFromFile,
  sheetHasContent,
  getWeaponImportDrawLayerNum,
} from "./custom-weapon-import/utils.ts";
