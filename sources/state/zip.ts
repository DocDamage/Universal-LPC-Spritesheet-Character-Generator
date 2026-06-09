/**
 * Re-export barrel — delegates to the `zip/` submodule.
 *
 * All export logic has been moved into `state/zip/*.ts`, organized by export
 * target. This file preserves backward compatibility.
 */

export { exportSplitAnimations } from "./zip/index.ts";
export { exportSplitItemSheets } from "./zip/index.ts";
export { exportSplitItemAnimations } from "./zip/index.ts";
export { exportIndividualFrames } from "./zip/index.ts";
export {
  runZipExport,
  makeZipAdders,
  addTweenExportFiles,
} from "./zip/index.ts";
export type {
  ExportSplitAnimationsDeps,
  ExportSplitItemSheetsDeps,
  ExportSplitItemAnimationsDeps,
  ExportIndividualFramesDeps,
  ZipExportContext,
  ZipExportResult,
} from "./zip/index.ts";
