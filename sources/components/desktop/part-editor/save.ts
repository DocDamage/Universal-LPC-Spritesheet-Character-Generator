import { FRAME_SIZE } from "../../../state/constants.ts";
import { DIRECTIONS } from "../pixel-editor-tools.ts";
import { createCanvas, get2DContext } from "../../../canvas/canvas-utils.ts";
import { getMultiRecolors } from "../../../state/palettes.ts";
import { ANIMATION_OFFSETS } from "../../../state/constants.ts";
import { loadImage } from "../../../canvas/load-image.ts";
import { getSpritePath } from "../../../state/path.ts";
import type { ItemMerged } from "../../../state/catalog.ts";
import { supportsAnimation } from "../../../state/meta.ts";
import { state } from "../../../state/state.ts";
import type {
  PartEditorState,
  EditorContextSnapshot,
  Direction,
  FrameOverride,
} from "./types.ts";
import {
  createDirectionCanvases,
  loadDataUrlIntoCanvas,
  composeLayersIntoCanvases,
} from "./canvas.ts";
import { DIRECTION_ROWS } from "./types.ts";
import { createLayerFromSnapshot } from "./history.ts";
import { parseFrameContextKey } from "./types.ts";

export async function createCanvasesFromContext(
  context: EditorContextSnapshot,
): Promise<{
  originalCanvases: Record<Direction, HTMLCanvasElement>;
  editedCanvases: Record<Direction, HTMLCanvasElement>;
}> {
  const originalCanvases = createDirectionCanvases();
  await Promise.all(
    DIRECTIONS.map((direction) =>
      loadDataUrlIntoCanvas(
        context.originalCanvases[direction],
        originalCanvases[direction],
      ),
    ),
  );

  const layers = await Promise.all(
    context.layers.map((layerSnapshot) =>
      createLayerFromSnapshot(layerSnapshot),
    ),
  );
  const editedCanvases = createDirectionCanvases();
  composeLayersIntoCanvases(layers, editedCanvases);
  return { originalCanvases, editedCanvases };
}

export async function createFrameOverrides(
  stateObj: PartEditorState,
): Promise<FrameOverride[]> {
  const overrides: FrameOverride[] = [];
  for (const [key, context] of Object.entries(stateObj.frameEditorContexts)) {
    const parsed = parseFrameContextKey(key);
    if (!parsed) continue;
    const { editedCanvases } = await createCanvasesFromContext(context);
    overrides.push({
      animation: parsed.animation,
      frameIndex: parsed.frameIndex,
      canvases: editedCanvases,
    });
  }
  return overrides;
}

export async function buildEditedAnimationSheets(
  baseId: string,
  meta: ItemMerged,
  originalCanvases: Record<Direction, HTMLCanvasElement>,
  editedCanvases: Record<Direction, HTMLCanvasElement>,
  frameOverrides: FrameOverride[],
): Promise<Record<string, HTMLCanvasElement>> {
  const sheets: Record<string, HTMLCanvasElement> = {};
  const selection = state.selections[meta.type_name];
  const recolors = getMultiRecolors(baseId, state.selections);
  const variant = selection?.variant ?? null;

  for (const animName of Object.keys(ANIMATION_OFFSETS)) {
    if (!supportsAnimation(meta, animName)) continue;
    const pathResult = getSpritePath(
      baseId,
      variant,
      recolors,
      state.bodyType,
      animName,
      1,
      state.selections,
      meta,
    );
    if (pathResult.isErr()) continue;

    const baseImg = await loadImage(pathResult.value);
    const { canvas: outCanvas, ctx: outCtx } = createCanvas(
      baseImg.width,
      baseImg.height,
    );
    outCtx.drawImage(baseImg, 0, 0);
    applyDirectionEdits(outCtx, baseImg, originalCanvases, editedCanvases);
    applyFrameOverrides(outCtx, baseImg, animName, frameOverrides);
    sheets[animName] = outCanvas;
  }

  return sheets;
}

export function applyFrameOverrides(
  ctx: CanvasRenderingContext2D,
  baseImg: HTMLImageElement,
  animation: string,
  frameOverrides: FrameOverride[],
): void {
  const rowCount = Math.floor(baseImg.height / FRAME_SIZE);
  const frameCount = Math.floor(baseImg.width / FRAME_SIZE);
  if (rowCount <= 0 || frameCount <= 0) return;

  for (const override of frameOverrides) {
    if (override.animation !== animation) continue;
    if (override.frameIndex < 0 || override.frameIndex >= frameCount) continue;

    if (rowCount < 4) {
      for (let row = 0; row < rowCount; row++) {
        ctx.clearRect(
          override.frameIndex * FRAME_SIZE,
          row * FRAME_SIZE,
          FRAME_SIZE,
          FRAME_SIZE,
        );
        ctx.drawImage(
          override.canvases.front,
          override.frameIndex * FRAME_SIZE,
          row * FRAME_SIZE,
        );
      }
      continue;
    }

    for (const direction of DIRECTIONS) {
      ctx.clearRect(
        override.frameIndex * FRAME_SIZE,
        DIRECTION_ROWS[direction] * FRAME_SIZE,
        FRAME_SIZE,
        FRAME_SIZE,
      );
      ctx.drawImage(
        override.canvases[direction],
        override.frameIndex * FRAME_SIZE,
        DIRECTION_ROWS[direction] * FRAME_SIZE,
      );
    }
  }
}

export function applyDirectionEdits(
  ctx: CanvasRenderingContext2D,
  baseImg: HTMLImageElement,
  originalCanvases: Record<Direction, HTMLCanvasElement>,
  editedCanvases: Record<Direction, HTMLCanvasElement>,
): void {
  const rowCount = Math.floor(baseImg.height / FRAME_SIZE);
  const frameCount = Math.floor(baseImg.width / FRAME_SIZE);
  if (rowCount <= 0 || frameCount <= 0) return;

  if (rowCount < 4) {
    for (let row = 0; row < rowCount; row++) {
      applyDirectionChangesToRow(
        ctx,
        row,
        frameCount,
        originalCanvases.front,
        editedCanvases.front,
      );
    }
    return;
  }

  for (const direction of DIRECTIONS) {
    applyDirectionChangesToRow(
      ctx,
      DIRECTION_ROWS[direction],
      frameCount,
      originalCanvases[direction],
      editedCanvases[direction],
    );
  }
}

export function applyDirectionChangesToRow(
  ctx: CanvasRenderingContext2D,
  row: number,
  frameCount: number,
  originalCanvas: HTMLCanvasElement,
  editedCanvas: HTMLCanvasElement,
): void {
  const width = FRAME_SIZE;
  const height = FRAME_SIZE;
  const originalData = get2DContext(originalCanvas).getImageData(
    0,
    0,
    width,
    height,
  );
  const editedData = get2DContext(editedCanvas).getImageData(
    0,
    0,
    width,
    height,
  );

  const modifiedPixels: {
    x: number;
    y: number;
    r: number;
    g: number;
    b: number;
    a: number;
  }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oR = originalData.data[idx];
      const oG = originalData.data[idx + 1];
      const oB = originalData.data[idx + 2];
      const oA = originalData.data[idx + 3];

      const eR = editedData.data[idx]!;
      const eG = editedData.data[idx + 1]!;
      const eB = editedData.data[idx + 2]!;
      const eA = editedData.data[idx + 3]!;

      if (oR !== eR || oG !== eG || oB !== eB || oA !== eA) {
        modifiedPixels.push({ x, y, r: eR, g: eG, b: eB, a: eA });
      }
    }
  }

  if (modifiedPixels.length === 0) return;

  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    const frameData = ctx.getImageData(
      frameIdx * FRAME_SIZE,
      row * FRAME_SIZE,
      FRAME_SIZE,
      FRAME_SIZE,
    );
    for (const { x, y, r, g, b, a } of modifiedPixels) {
      const idx = (y * width + x) * 4;
      frameData.data[idx] = r;
      frameData.data[idx + 1] = g;
      frameData.data[idx + 2] = b;
      frameData.data[idx + 3] = a;
    }
    ctx.putImageData(frameData, frameIdx * FRAME_SIZE, row * FRAME_SIZE);
  }
}
