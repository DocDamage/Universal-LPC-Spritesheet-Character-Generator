// Custom weapon import — barrel exports

export type { Rect, SourceMode, ImportWeaponOptions, ImportAdjustment } from "./types.ts";

export {
  canUseWeaponImportReference,
  getCustomWeaponImportName,
  buildImportedWeaponPart,
  buildImportPreview,
} from "./importer.ts";

export {
  alignSourceToReferenceSheet,
} from "./alignment.ts";

export {
  getSourceMode,
  getContentBounds,
  canvasFromImage,
  loadImageFromFile,
  sheetHasContent,
} from "./utils.ts";
