// Custom weapon import — per-frame alignment & drawing

import { createCanvas, get2DContext } from "../../../canvas/canvas-utils.ts";
import { FRAME_SIZE } from "../../../state/constants.ts";
import { ANIMATION_OFFSET_BY_NAME } from "./constants.ts";
import { getContentBounds } from "./utils.ts";
import type { Rect, SourceMode, ImportAdjustment } from "./types.ts";

/**
 * Align the source canvas (which may be a full spritesheet or a single image)
 * to a pre-built reference sheet, producing an output canvas of the same size.
 */
export function alignSourceToReferenceSheet(
  sourceCanvas: HTMLCanvasElement,
  sourceBounds: Rect,
  sourceMode: SourceMode,
  referenceSheet: HTMLCanvasElement,
  animation: string,
  adjustment: ImportAdjustment,
  options: {
    frameSize?: number;
    sourceAnimationY?: number;
  } = {},
): HTMLCanvasElement {
  const { canvas: out, ctx: outCtx } = createCanvas(
    referenceSheet.width,
    referenceSheet.height,
    true,
  );
  const refCtx = get2DContext(referenceSheet, true);
  const sourceCtx = get2DContext(sourceCanvas, true);
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const rowCount = Math.floor(referenceSheet.height / frameSize);
  const colCount = Math.floor(referenceSheet.width / frameSize);
  const sourceAnimationY =
    options.sourceAnimationY ?? ANIMATION_OFFSET_BY_NAME[animation] ?? 0;

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const frameX = col * frameSize;
      const frameY = row * frameSize;
      const referenceBounds = getContentBounds(
        refCtx,
        frameX,
        frameY,
        frameSize,
        frameSize,
      );
      if (!referenceBounds) continue;

      const sourceFrameBounds =
        sourceMode === "fullSheet"
          ? getContentBounds(
              sourceCtx,
              frameX,
              sourceAnimationY + frameY,
              frameSize,
              frameSize,
            )
          : sourceBounds;
      if (!sourceFrameBounds) continue;

      drawAlignedFrame(
        outCtx,
        sourceCanvas,
        sourceFrameBounds,
        referenceBounds,
        sourceMode,
        adjustment,
        sourceMode === "singleImage" && row === 3,
      );
    }
  }

  return out;
}

function drawAlignedFrame(
  targetCtx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sourceBounds: Rect,
  referenceBounds: Rect,
  sourceMode: SourceMode,
  adjustment: ImportAdjustment,
  mirrorX: boolean,
): void {
  const referenceCenterX = referenceBounds.x + referenceBounds.width / 2;
  const referenceCenterY = referenceBounds.y + referenceBounds.height / 2;
  const baseScale =
    sourceMode === "singleImage"
      ? Math.min(
          referenceBounds.width / sourceBounds.width,
          referenceBounds.height / sourceBounds.height,
        )
      : 1;
  const scale = baseScale * adjustment.scale;
  const width = Math.max(1, Math.round(sourceBounds.width * scale));
  const height = Math.max(1, Math.round(sourceBounds.height * scale));
  const directionalOffsetX = mirrorX ? -adjustment.offsetX : adjustment.offsetX;
  const targetX = Math.round(referenceCenterX - width / 2 + directionalOffsetX);
  const targetY = Math.round(
    referenceCenterY - height / 2 + adjustment.offsetY,
  );

  if (mirrorX) {
    targetCtx.save();
    targetCtx.translate(targetX + width, targetY);
    targetCtx.scale(-1, 1);
    targetCtx.drawImage(
      sourceCanvas,
      sourceBounds.x,
      sourceBounds.y,
      sourceBounds.width,
      sourceBounds.height,
      0,
      0,
      width,
      height,
    );
    targetCtx.restore();
    return;
  }

  targetCtx.drawImage(
    sourceCanvas,
    sourceBounds.x,
    sourceBounds.y,
    sourceBounds.width,
    sourceBounds.height,
    targetX,
    targetY,
    width,
    height,
  );
}
