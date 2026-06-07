import { get2DContext } from "../../canvas/canvas-utils.ts";
import { FRAME_SIZE } from "../../state/constants.ts";

export type Direction = "front" | "back" | "left" | "right";
export type EditorTool = "pen" | "eraser" | "picker" | "fill" | "select";
export type Point = { x: number; y: number };

export type PixelEditorToolState = {
  activeDirection: Direction;
  tool: EditorTool;
  activeColor: string;
  autoPropagate: boolean;
  canvases: Record<Direction, HTMLCanvasElement>;
  brushSize: number;
  mirrorX: boolean;
  mirrorY: boolean;
};

export const DIRECTIONS: Direction[] = ["front", "back", "left", "right"];
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 8;

type Rgba = { r: number; g: number; b: number; a: number };

export function clampBrushSize(value: number): number {
  return Math.min(MAX_BRUSH_SIZE, Math.max(MIN_BRUSH_SIZE, value));
}

export function sampleColor(
  stateObj: PixelEditorToolState,
  point: Point,
): string | null {
  const canvas = stateObj.canvases[stateObj.activeDirection];
  const ctx = get2DContext(canvas);
  const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
  if (pixel[3] === 0) return null;
  const r = pixel[0].toString(16).padStart(2, "0");
  const g = pixel[1].toString(16).padStart(2, "0");
  const b = pixel[2].toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function applyBrush(
  stateObj: PixelEditorToolState,
  point: Point,
  mode: "paint" | "erase",
): void {
  for (const target of getDrawTargets(stateObj, point)) {
    const canvas = stateObj.canvases[target.direction];
    const ctx = get2DContext(canvas);
    if (mode === "paint") {
      ctx.fillStyle = stateObj.activeColor;
    }

    for (const p of getBrushPoints(target.point, stateObj.brushSize)) {
      if (mode === "paint") {
        ctx.fillRect(p.x, p.y, 1, 1);
      } else {
        ctx.clearRect(p.x, p.y, 1, 1);
      }
    }
  }
}

export function applyFill(stateObj: PixelEditorToolState, point: Point): void {
  const fillColor = hexToRgba(stateObj.activeColor);
  for (const target of getDrawTargets(stateObj, point)) {
    floodFillCanvas(
      stateObj.canvases[target.direction],
      target.point,
      fillColor,
    );
  }
}

export function getLinePoints(start: Point, end: Point): Point[] {
  const points: Point[] = [];
  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    points.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return points;
}

function getDrawTargets(
  stateObj: PixelEditorToolState,
  point: Point,
): { direction: Direction; point: Point }[] {
  const targets = new Map<string, { direction: Direction; point: Point }>();
  for (const p of getSymmetryPoints(point, stateObj)) {
    addDrawTarget(targets, stateObj.activeDirection, p);

    if (stateObj.autoPropagate && stateObj.activeDirection === "front") {
      addDrawTarget(targets, "left", p);
      addDrawTarget(targets, "right", { x: FRAME_SIZE - 1 - p.x, y: p.y });
      addDrawTarget(targets, "back", p);
    }
  }
  return [...targets.values()];
}

function addDrawTarget(
  targets: Map<string, { direction: Direction; point: Point }>,
  direction: Direction,
  point: Point,
): void {
  const clamped = {
    x: Math.min(FRAME_SIZE - 1, Math.max(0, point.x)),
    y: Math.min(FRAME_SIZE - 1, Math.max(0, point.y)),
  };
  targets.set(`${direction}:${clamped.x}:${clamped.y}`, {
    direction,
    point: clamped,
  });
}

function getSymmetryPoints(
  point: Point,
  stateObj: PixelEditorToolState,
): Point[] {
  const points = new Map<string, Point>();
  const addPoint = (p: Point) => points.set(`${p.x}:${p.y}`, p);
  addPoint(point);
  if (stateObj.mirrorX) {
    addPoint({ x: FRAME_SIZE - 1 - point.x, y: point.y });
  }
  if (stateObj.mirrorY) {
    addPoint({ x: point.x, y: FRAME_SIZE - 1 - point.y });
  }
  if (stateObj.mirrorX && stateObj.mirrorY) {
    addPoint({ x: FRAME_SIZE - 1 - point.x, y: FRAME_SIZE - 1 - point.y });
  }
  return [...points.values()];
}

function getBrushPoints(point: Point, brushSize: number): Point[] {
  const points: Point[] = [];
  const offset = Math.floor(brushSize / 2);
  for (let y = 0; y < brushSize; y++) {
    for (let x = 0; x < brushSize; x++) {
      const px = point.x + x - offset;
      const py = point.y + y - offset;
      if (px >= 0 && px < FRAME_SIZE && py >= 0 && py < FRAME_SIZE) {
        points.push({ x: px, y: py });
      }
    }
  }
  return points;
}

function hexToRgba(hex: string): Rgba {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: 255,
  };
}

function floodFillCanvas(
  canvas: HTMLCanvasElement,
  start: Point,
  fillColor: Rgba,
): void {
  const ctx = get2DContext(canvas);
  const image = ctx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);
  const targetColor = getPixel(image, start.x, start.y);
  if (rgbaMatches(targetColor, fillColor)) return;

  const stack: Point[] = [start];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const point = stack.pop()!;
    if (
      point.x < 0 ||
      point.x >= FRAME_SIZE ||
      point.y < 0 ||
      point.y >= FRAME_SIZE
    ) {
      continue;
    }
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!rgbaMatches(getPixel(image, point.x, point.y), targetColor)) continue;
    setPixel(image, point.x, point.y, fillColor);
    stack.push(
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    );
  }

  ctx.putImageData(image, 0, 0);
}

function getPixel(image: ImageData, x: number, y: number): Rgba {
  const idx = (y * FRAME_SIZE + x) * 4;
  return {
    r: image.data[idx],
    g: image.data[idx + 1],
    b: image.data[idx + 2],
    a: image.data[idx + 3],
  };
}

function setPixel(image: ImageData, x: number, y: number, color: Rgba): void {
  const idx = (y * FRAME_SIZE + x) * 4;
  image.data[idx] = color.r;
  image.data[idx + 1] = color.g;
  image.data[idx + 2] = color.b;
  image.data[idx + 3] = color.a;
}

function rgbaMatches(a: Rgba, b: Rgba): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
