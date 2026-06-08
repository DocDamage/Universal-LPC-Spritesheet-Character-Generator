import { FRAME_SIZE } from "../../../state/constants.ts";
import { getLinePoints, applyBrush } from "../pixel-editor-tools.ts";
import type { PartEditorState, Point, SelectionRect } from "./types.ts";
import { getActiveLayerToolState } from "./layers.ts";
import { recomposeCanvases } from "./canvas.ts";
import { clearSelectionState } from "./selection.ts";
import { normalizeSelectionRect } from "./selection.ts";
import type { ShapeTool } from "./types.ts";

export function isShapeTool(tool: PartEditorState["tool"]): tool is ShapeTool {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}

export function startShapeInteraction(stateObj: PartEditorState, point: Point): void {
  clearSelectionState(stateObj, true);
  stateObj.shapeStart = point;
  stateObj.shapeEnd = point;
}

export function finishShapeInteraction(stateObj: PartEditorState): boolean {
  const start = stateObj.shapeStart;
  const end = stateObj.shapeEnd;
  const tool = stateObj.tool;
  stateObj.shapeStart = null;
  stateObj.shapeEnd = null;

  if (!start || !end || !isShapeTool(tool)) return false;
  const layerState = getActiveLayerToolState(stateObj);
  if (!layerState) return false;

  for (const point of getShapePoints(tool, start, end, stateObj.shapeFilled)) {
    applyBrush(layerState, point, "paint");
  }
  recomposeCanvases(stateObj);
  return true;
}

export function getShapePoints(
  tool: ShapeTool,
  start: Point,
  end: Point,
  filled: boolean,
): Point[] {
  if (tool === "line") {
    return getLinePoints(start, end);
  }

  if (tool === "rect") {
    return getRectanglePoints(start, end, filled);
  }

  return getEllipsePoints(start, end, filled);
}

export function getRectanglePoints(
  start: Point,
  end: Point,
  filled: boolean,
): Point[] {
  const rect = normalizeSelectionRect(start, end);
  const points: Point[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (
        filled ||
        x === rect.x ||
        x === rect.x + rect.width - 1 ||
        y === rect.y ||
        y === rect.y + rect.height - 1
      ) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

export function getEllipsePoints(start: Point, end: Point, filled: boolean): Point[] {
  const rect = normalizeSelectionRect(start, end);
  if (rect.width <= 1 || rect.height <= 1) {
    return rect.width >= rect.height
      ? getLinePoints(
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.width - 1, y: rect.y },
        )
      : getLinePoints(
          { x: rect.x, y: rect.y },
          { x: rect.x, y: rect.y + rect.height - 1 },
        );
  }

  if (filled) {
    return getFilledEllipsePoints(rect);
  }
  return getEllipseOutlinePoints(rect);
}

export function getFilledEllipsePoints(rect: SelectionRect): Point[] {
  const points: Point[] = [];
  const radiusX = rect.width / 2;
  const radiusY = rect.height / 2;
  const centerX = rect.x + radiusX - 0.5;
  const centerY = rect.y + radiusY - 0.5;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

export function getEllipseOutlinePoints(rect: SelectionRect): Point[] {
  const points = new Map<string, Point>();
  const radiusX = (rect.width - 1) / 2;
  const radiusY = (rect.height - 1) / 2;
  const centerX = rect.x + radiusX;
  const centerY = rect.y + radiusY;
  const steps = Math.max(24, Math.ceil(Math.max(rect.width, rect.height) * 8));

  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 * i) / steps;
    const x = Math.round(centerX + Math.cos(angle) * radiusX);
    const y = Math.round(centerY + Math.sin(angle) * radiusY);
    if (x >= 0 && x < FRAME_SIZE && y >= 0 && y < FRAME_SIZE) {
      points.set(`${x}:${y}`, { x, y });
    }
  }
  return [...points.values()];
}

export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  stateObj: PartEditorState,
): void {
  const start = stateObj.shapeStart;
  const end = stateObj.shapeEnd;
  const tool = stateObj.tool;
  if (!start || !end || !isShapeTool(tool)) return;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = stateObj.activeColor;
  for (const point of getShapePoints(tool, start, end, stateObj.shapeFilled)) {
    drawBrushPreviewPoint(ctx, point, stateObj.brushSize);
  }
  ctx.restore();
}

export function drawBrushPreviewPoint(
  ctx: CanvasRenderingContext2D,
  point: Point,
  brushSize: number,
): void {
  const offset = Math.floor(brushSize / 2);
  for (let y = 0; y < brushSize; y++) {
    for (let x = 0; x < brushSize; x++) {
      const px = point.x + x - offset;
      const py = point.y + y - offset;
      if (px >= 0 && px < FRAME_SIZE && py >= 0 && py < FRAME_SIZE) {
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

