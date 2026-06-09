import { FRAME_SIZE } from "../../../state/constants.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import { get2DContext } from "../../../canvas/canvas-utils.ts";
import { clamp } from "../../../utils/helpers.ts";
import type {
  PartEditorState,
  SelectionRect,
  TransformOperation,
} from "./types.ts";
import { getActiveLayer } from "./layers.ts";
import { recomposeCanvases } from "./canvas.ts";
import { saveHistory } from "./history.ts";

export function transformActivePixels(
  stateObj: PartEditorState,
  operation: TransformOperation,
): void {
  const activeLayer = getActiveLayer(stateObj);
  if (!activeLayer || activeLayer.locked) return;

  const sourceRect = stateObj.selectionRect ?? {
    x: 0,
    y: 0,
    width: FRAME_SIZE,
    height: FRAME_SIZE,
  };
  const directions = stateObj.transformAllDirections
    ? DIRECTIONS
    : [stateObj.activeDirection];
  let nextSelection: SelectionRect | null = null;
  let changed = false;

  for (const direction of directions) {
    const result = transformCanvasRegion(
      activeLayer.canvases[direction],
      sourceRect,
      operation,
    );
    changed = changed || result.changed;
    nextSelection = nextSelection ?? result.rect;
  }

  if (!changed) return;
  if (stateObj.selectionRect && nextSelection) {
    stateObj.selectionRect = nextSelection;
  }
  stateObj.shapeStart = null;
  stateObj.shapeEnd = null;
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
}

export function transformCanvasRegion(
  canvas: HTMLCanvasElement,
  sourceRect: SelectionRect,
  operation: TransformOperation,
): { changed: boolean; rect: SelectionRect } {
  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return { changed: false, rect: sourceRect };
  }

  const ctx = get2DContext(canvas);
  if (operation === "clear") {
    ctx.clearRect(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
    return { changed: true, rect: sourceRect };
  }

  const sourceData = ctx.getImageData(
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
  );
  const transformedData = transformImageData(sourceData, operation);
  const targetRect = clampTransformedRect(sourceRect, transformedData);
  ctx.clearRect(
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
  );
  ctx.putImageData(transformedData, targetRect.x, targetRect.y);
  return { changed: true, rect: targetRect };
}

export function transformImageData(
  sourceData: ImageData,
  operation: TransformOperation,
): ImageData {
  if (operation === "rotateClockwise") {
    return rotateImageData(sourceData, true);
  }
  if (operation === "rotateCounterClockwise") {
    return rotateImageData(sourceData, false);
  }
  if (operation === "flipVertical") {
    return flipImageData(sourceData, false);
  }
  return flipImageData(sourceData, true);
}

export function flipImageData(
  sourceData: ImageData,
  horizontal: boolean,
): ImageData {
  const output = new ImageData(sourceData.width, sourceData.height);
  for (let y = 0; y < sourceData.height; y++) {
    for (let x = 0; x < sourceData.width; x++) {
      const sourceX = horizontal ? sourceData.width - 1 - x : x;
      const sourceY = horizontal ? y : sourceData.height - 1 - y;
      copyImagePixel(sourceData, output, sourceX, sourceY, x, y);
    }
  }
  return output;
}

export function rotateImageData(
  sourceData: ImageData,
  clockwise: boolean,
): ImageData {
  const output = new ImageData(sourceData.height, sourceData.width);
  for (let y = 0; y < sourceData.height; y++) {
    for (let x = 0; x < sourceData.width; x++) {
      const targetX = clockwise ? sourceData.height - 1 - y : y;
      const targetY = clockwise ? x : sourceData.width - 1 - x;
      copyImagePixel(sourceData, output, x, y, targetX, targetY);
    }
  }
  return output;
}

export function copyImagePixel(
  sourceData: ImageData,
  targetData: ImageData,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): void {
  const sourceIndex = (sourceY * sourceData.width + sourceX) * 4;
  const targetIndex = (targetY * targetData.width + targetX) * 4;
  targetData.data[targetIndex] = sourceData.data[sourceIndex]!;
  targetData.data[targetIndex + 1] = sourceData.data[sourceIndex + 1]!;
  targetData.data[targetIndex + 2] = sourceData.data[sourceIndex + 2]!;
  targetData.data[targetIndex + 3] = sourceData.data[sourceIndex + 3]!;
}

export function clampTransformedRect(
  sourceRect: SelectionRect,
  transformedData: ImageData,
): SelectionRect {
  return {
    x: clamp(sourceRect.x, 0, FRAME_SIZE - transformedData.width),
    y: clamp(sourceRect.y, 0, FRAME_SIZE - transformedData.height),
    width: transformedData.width,
    height: transformedData.height,
  };
}

export function flipImageDataHorizontal(sourceData: ImageData): ImageData {
  const output = new ImageData(sourceData.width, sourceData.height);
  for (let y = 0; y < sourceData.height; y++) {
    for (let x = 0; x < sourceData.width; x++) {
      const sourceX = sourceData.width - 1 - x;
      const sourceY = y;
      copyImagePixel(sourceData, output, sourceX, sourceY, x, y);
    }
  }
  return output;
}
