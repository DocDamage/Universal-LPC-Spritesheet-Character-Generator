import { FRAME_SIZE } from "../../../state/constants.ts";
import { createCanvas, get2DContext } from "../../../canvas/canvas-utils.ts";
import { clamp } from "../../../utils/helpers.ts";
import { flipImageDataHorizontal } from "./transform.ts";
import type { PartEditorState, SelectionRect, Point } from "./types.ts";
import { getActiveLayer } from "./layers.ts";
import { recomposeCanvases } from "./canvas.ts";
import { saveHistory } from "./history.ts";

export function getCanvasPoint(
  e: MouseEvent,
  canvasEl: HTMLCanvasElement,
): Point | null {
  const rect = canvasEl.getBoundingClientRect();
  const scaleX = FRAME_SIZE / rect.width;
  const scaleY = FRAME_SIZE / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top) * scaleY);
  if (x < 0 || x >= FRAME_SIZE || y < 0 || y >= FRAME_SIZE) return null;
  return { x, y };
}

export function isSelectionNudgeKey(key: string): boolean {
  return (
    key === "arrowleft" ||
    key === "arrowright" ||
    key === "arrowup" ||
    key === "arrowdown"
  );
}

export function normalizeSelectionRect(
  start: Point,
  end: Point,
): SelectionRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x) + 1,
    height: Math.abs(end.y - start.y) + 1,
  };
}

export function pointInSelection(point: Point, rect: SelectionRect): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function clampSelectionPosition(
  rect: SelectionRect,
  x: number,
  y: number,
): Point {
  return {
    x: clamp(x, 0, FRAME_SIZE - rect.width),
    y: clamp(y, 0, FRAME_SIZE - rect.height),
  };
}

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
}

export function startSelectionInteraction(
  stateObj: PartEditorState,
  point: Point,
): void {
  const activeLayer = getActiveLayer(stateObj);
  if (
    activeLayer &&
    !activeLayer.locked &&
    stateObj.selectionRect &&
    pointInSelection(point, stateObj.selectionRect)
  ) {
    const direction = stateObj.activeDirection;
    const canvas = activeLayer.canvases[direction];
    const ctx = get2DContext(canvas);
    const sourceRect = { ...stateObj.selectionRect };
    const imageData = ctx.getImageData(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
    ctx.clearRect(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
    const { canvas: baseCanvas } = createCanvas(FRAME_SIZE, FRAME_SIZE);
    get2DContext(baseCanvas).drawImage(canvas, 0, 0);

    stateObj.selectionDraftStart = null;
    stateObj.selectionMove = {
      startPoint: point,
      sourceRect,
      baseCanvas,
      imageData,
      direction,
      layerId: activeLayer.id,
    };
    applySelectionMove(stateObj, point);
    return;
  }

  stateObj.selectionDraftStart = point;
  stateObj.selectionMove = null;
  stateObj.selectionRect = { x: point.x, y: point.y, width: 1, height: 1 };
}

export function updateSelectionInteraction(
  stateObj: PartEditorState,
  point: Point,
): void {
  if (stateObj.selectionMove) {
    applySelectionMove(stateObj, point);
    return;
  }

  if (stateObj.selectionDraftStart) {
    stateObj.selectionRect = normalizeSelectionRect(
      stateObj.selectionDraftStart,
      point,
    );
  }
}

export function applySelectionMove(
  stateObj: PartEditorState,
  point: Point,
): void {
  const moveState = stateObj.selectionMove;
  const activeLayer = getActiveLayer(stateObj);
  if (
    !moveState ||
    !activeLayer ||
    activeLayer.id !== moveState.layerId ||
    stateObj.activeDirection !== moveState.direction
  ) {
    return;
  }

  const dx = point.x - moveState.startPoint.x;
  const dy = point.y - moveState.startPoint.y;
  const next = clampSelectionPosition(
    moveState.sourceRect,
    moveState.sourceRect.x + dx,
    moveState.sourceRect.y + dy,
  );
  const canvas = activeLayer.canvases[moveState.direction];
  const ctx = get2DContext(canvas);
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  ctx.drawImage(moveState.baseCanvas, 0, 0);
  ctx.putImageData(moveState.imageData, next.x, next.y);
  stateObj.selectionRect = {
    x: next.x,
    y: next.y,
    width: moveState.sourceRect.width,
    height: moveState.sourceRect.height,
  };
}

export function finishSelectionInteraction(stateObj: PartEditorState): boolean {
  const movedSelection = !!stateObj.selectionMove;
  stateObj.selectionDraftStart = null;
  stateObj.selectionMove = null;
  return movedSelection;
}

export function clearSelectionState(
  stateObj: PartEditorState,
  keepClipboard: boolean,
): boolean {
  const hadSelection =
    !!stateObj.selectionRect ||
    !!stateObj.selectionDraftStart ||
    !!stateObj.selectionMove;
  stateObj.selectionRect = null;
  stateObj.selectionDraftStart = null;
  stateObj.selectionMove = null;
  if (!keepClipboard) {
    stateObj.clipboard = null;
  }
  return hadSelection;
}

export function copySelection(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const rect = stateObj.selectionRect;
  if (!activeLayer || !rect) return false;

  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  stateObj.clipboard = {
    width: rect.width,
    height: rect.height,
    imageData: cloneImageData(
      ctx.getImageData(rect.x, rect.y, rect.width, rect.height),
    ),
    sourceDirection: stateObj.activeDirection,
  };
  return true;
}

export function pasteClipboard(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const clipboard = stateObj.clipboard;
  if (!activeLayer || activeLayer.locked || !clipboard) return false;

  const rect = {
    x:
      stateObj.selectionRect?.x ??
      Math.floor((FRAME_SIZE - clipboard.width) / 2),
    y:
      stateObj.selectionRect?.y ??
      Math.floor((FRAME_SIZE - clipboard.height) / 2),
    width: clipboard.width,
    height: clipboard.height,
  };
  const target = clampSelectionPosition(rect, rect.x, rect.y);
  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);

  let imageData = clipboard.imageData;
  const sourceDir = clipboard.sourceDirection;
  const targetDir = stateObj.activeDirection;
  if (
    sourceDir &&
    targetDir &&
    ((sourceDir === "left" && targetDir === "right") ||
      (sourceDir === "right" && targetDir === "left"))
  ) {
    imageData = flipImageDataHorizontal(imageData);
  }

  ctx.putImageData(cloneImageData(imageData), target.x, target.y);
  stateObj.selectionRect = {
    x: target.x,
    y: target.y,
    width: clipboard.width,
    height: clipboard.height,
  };
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
  return true;
}

export function clearSelectedPixels(stateObj: PartEditorState): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const rect = stateObj.selectionRect;
  if (!activeLayer || activeLayer.locked || !rect) return false;

  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
  return true;
}

export function nudgeSelection(
  stateObj: PartEditorState,
  key: string,
  distance: number,
): boolean {
  const activeLayer = getActiveLayer(stateObj);
  const rect = stateObj.selectionRect;
  if (!activeLayer || activeLayer.locked || !rect) return false;

  const delta = {
    arrowleft: { x: -distance, y: 0 },
    arrowright: { x: distance, y: 0 },
    arrowup: { x: 0, y: -distance },
    arrowdown: { x: 0, y: distance },
  }[key];
  if (!delta) return false;

  const target = clampSelectionPosition(
    rect,
    rect.x + delta.x,
    rect.y + delta.y,
  );
  if (target.x === rect.x && target.y === rect.y) return false;

  const ctx = get2DContext(activeLayer.canvases[stateObj.activeDirection]);
  const imageData = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.putImageData(imageData, target.x, target.y);
  stateObj.selectionRect = { ...rect, x: target.x, y: target.y };
  recomposeCanvases(stateObj);
  saveHistory(stateObj);
  return true;
}
