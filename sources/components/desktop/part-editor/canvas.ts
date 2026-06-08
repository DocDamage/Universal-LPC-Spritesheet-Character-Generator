import { FRAME_SIZE } from "../../../state/constants.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import { createCanvas, get2DContext } from "../../../canvas/canvas-utils.ts";
import type { PartEditorState, EditorLayer, Direction } from "./types.ts";
import { drawShapePreview } from "./shapes.ts";
import { clamp } from "../../../utils/helpers.ts";
import m from "mithril";

export function createDirectionCanvases(): Record<Direction, HTMLCanvasElement> {
  const canvases = {
    front: document.createElement("canvas"),
    back: document.createElement("canvas"),
    left: document.createElement("canvas"),
    right: document.createElement("canvas"),
  };
  for (const key of DIRECTIONS) {
    canvases[key].width = FRAME_SIZE;
    canvases[key].height = FRAME_SIZE;
  }
  return canvases;
}

export function cropFrame(
  spritesheetImg: HTMLImageElement,
  row: number,
  col: number,
): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas(FRAME_SIZE, FRAME_SIZE);
  ctx.drawImage(
    spritesheetImg,
    col * FRAME_SIZE,
    row * FRAME_SIZE,
    FRAME_SIZE,
    FRAME_SIZE,
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  return canvas;
}

export function drawMainGrid(
  ctx: CanvasRenderingContext2D,
  offscreenCanvas: HTMLCanvasElement,
  stateObj?: PartEditorState,
) {
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  if (stateObj?.frameMode && stateObj.onionSkin && stateObj.onionCanvases) {
    ctx.save();
    ctx.globalAlpha = stateObj.onionOpacity;
    const previous =
      stateObj.onionCanvases.previous?.[stateObj.activeDirection];
    const next = stateObj.onionCanvases.next?.[stateObj.activeDirection];
    if (previous) {
      ctx.drawImage(previous, 0, 0);
    }
    if (next) {
      ctx.drawImage(next, 0, 0);
    }
    ctx.restore();
  }
  ctx.drawImage(offscreenCanvas, 0, 0);
  if (stateObj) {
    drawShapePreview(ctx, stateObj);
  }

  const rect = stateObj?.selectionRect;
  if (!rect) return;

  ctx.save();
  ctx.fillStyle = "rgba(124, 109, 240, 0.14)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
  ctx.restore();
}

export function refreshVisibleCanvas(
  canvasEl: HTMLCanvasElement,
  stateObj: PartEditorState,
): void {
  const ctx = get2DContext(canvasEl);
  ctx.imageSmoothingEnabled = false;
  drawMainGrid(ctx, stateObj.canvases[stateObj.activeDirection], stateObj);
}


export function copyDirectionCanvases(
  source: Record<Direction, HTMLCanvasElement>,
  target: Record<Direction, HTMLCanvasElement>,
): void {
  for (const direction of DIRECTIONS) {
    const ctx = get2DContext(target[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.drawImage(source[direction], 0, 0);
  }
}

export function recomposeCanvases(stateObj: PartEditorState): void {
  composeLayersIntoCanvases(stateObj.editLayers, stateObj.canvases);
  // Populate or update thumbnail cache after recomposing
  if (!stateObj.thumbnailCache) {
    stateObj.thumbnailCache = {
      front: document.createElement("canvas"),
      back: document.createElement("canvas"),
      left: document.createElement("canvas"),
      right: document.createElement("canvas"),
    };
    for (const direction of DIRECTIONS) {
      stateObj.thumbnailCache[direction].width = 64;
      stateObj.thumbnailCache[direction].height = 64;
    }
  }
  for (const direction of DIRECTIONS) {
    const thumb = stateObj.thumbnailCache[direction];
    const ctx = get2DContext(thumb);
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(stateObj.canvases[direction], 0, 0);
  }
}

export function composeLayersIntoCanvases(
  layers: EditorLayer[],
  targetCanvases: Record<Direction, HTMLCanvasElement>,
): void {
  for (const direction of DIRECTIONS) {
    const ctx = get2DContext(targetCanvases[direction]);
    ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    for (const layer of layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = clamp(layer.opacity, 0, 1);
      ctx.globalCompositeOperation = layer.blendMode || "source-over";
      ctx.drawImage(layer.canvases[direction], 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}

export function applyCanvasDiff(
  originalCanvas: HTMLCanvasElement,
  editedCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
): void {
  const originalData = get2DContext(originalCanvas).getImageData(
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  const editedData = get2DContext(editedCanvas).getImageData(
    0,
    0,
    FRAME_SIZE,
    FRAME_SIZE,
  );
  const targetCtx = get2DContext(targetCanvas);
  const targetData = targetCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE);

  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const idx = (y * FRAME_SIZE + x) * 4;
      const originalMatches =
        originalData.data[idx] === editedData.data[idx] &&
        originalData.data[idx + 1] === editedData.data[idx + 1] &&
        originalData.data[idx + 2] === editedData.data[idx + 2] &&
        originalData.data[idx + 3] === editedData.data[idx + 3];
      if (originalMatches) continue;

      targetData.data[idx] = editedData.data[idx]!;
      targetData.data[idx + 1] = editedData.data[idx + 1]!;
      targetData.data[idx + 2] = editedData.data[idx + 2]!;
      targetData.data[idx + 3] = editedData.data[idx + 3]!;
    }
  }

  targetCtx.putImageData(targetData, 0, 0);
}

export function cloneDirectionCanvases(
  canvases: Record<Direction, HTMLCanvasElement>,
): Record<Direction, HTMLCanvasElement> {
  const clone = createDirectionCanvases();
  for (const direction of DIRECTIONS) {
    get2DContext(clone[direction]).drawImage(canvases[direction], 0, 0);
  }
  return clone;
}

export function debouncedRecomposeCanvases(stateObj: PartEditorState): void {
  if (stateObj.recomposeDebounceTimer) {
    window.clearTimeout(stateObj.recomposeDebounceTimer);
  }
  stateObj.recomposeDebounceTimer = window.setTimeout(() => {
    recomposeCanvases(stateObj);
    m.redraw();
  }, 100);
}

export function loadDataUrlIntoCanvas(
  dataUrl: string | undefined,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const ctx = get2DContext(canvas);
  ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
  if (!dataUrl) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = () => reject(new Error("Unable to load layer image data."));
    img.src = dataUrl;
  });
}

