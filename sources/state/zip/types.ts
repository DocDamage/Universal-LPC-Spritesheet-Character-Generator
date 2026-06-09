import type { ZipFolder } from "../../utils/zip-helpers.ts";
import {
  addAnimationSliceToZip,
  addCanvasToZip,
  addStandardAnimationToZipCustomFolder,
  composeFrameRowsToSpritesheet,
  extractFramesFromAnimation,
  extractFramesFromCustomAnimation,
  expandExtractedFramesWithTweens,
  newAnimationFromSheet,
} from "../../utils/zip-helpers.ts";
import {
  renderSingleItem,
  renderSingleItemAnimation,
  extractAnimationFromCanvas,
} from "../../canvas/renderer.ts";
import { canvasToBlob } from "../../canvas/canvas-utils.ts";
import { loadImage } from "../../canvas/load-image.ts";
import { getImageToDraw } from "../../canvas/palette-recolor.ts";

export type ExportSplitAnimationsDeps = {
  addAnimationSliceToZip: typeof addAnimationSliceToZip;
  addCanvasToZip: typeof addCanvasToZip;
  composeFrameRowsToSpritesheet: typeof composeFrameRowsToSpritesheet;
  expandExtractedFramesWithTweens: typeof expandExtractedFramesWithTweens;
  extractFramesFromAnimation: typeof extractFramesFromAnimation;
  extractFramesFromCustomAnimation: typeof extractFramesFromCustomAnimation;
};

export type ExportSplitItemSheetsDeps = {
  addCanvasToZip: typeof addCanvasToZip;
  renderSingleItem: typeof renderSingleItem;
};

export type ExportSplitItemAnimationsDeps = {
  addAnimationSliceToZip: typeof addAnimationSliceToZip;
  addCanvasToZip: typeof addCanvasToZip;
  renderSingleItemAnimation: typeof renderSingleItemAnimation;
  loadImage: typeof loadImage;
  addStandardAnimationToZipCustomFolder: typeof addStandardAnimationToZipCustomFolder;
  getImageToDraw: typeof getImageToDraw;
};

export type ExportIndividualFramesDeps = {
  extractAnimationFromCanvas: typeof extractAnimationFromCanvas;
  extractFramesFromAnimation: typeof extractFramesFromAnimation;
  expandExtractedFramesWithTweens: typeof expandExtractedFramesWithTweens;
  canvasToBlob: typeof canvasToBlob;
  newAnimationFromSheet: typeof newAnimationFromSheet;
  extractFramesFromCustomAnimation: typeof extractFramesFromCustomAnimation;
};

export type BlobTask = {
  encode: () => Promise<Blob>;
  folder: ZipFolder;
  filename: string;
  debugPath: string;
};

export type BlobTaskResult = BlobTask & {
  blob: Blob | null;
  success: boolean;
};
