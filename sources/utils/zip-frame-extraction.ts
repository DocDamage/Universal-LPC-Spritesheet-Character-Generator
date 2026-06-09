import {
  ANIMATION_CONFIGS,
  DIRECTIONS,
  FRAME_SIZE,
  STANDARD_ANIMATION_FRAMES_PER_ROW,
} from "../state/constants.ts";
import { createCanvas, get2DContext } from "../canvas/canvas-utils.ts";
import { debugLog, debugWarn } from "./debug.ts";
import type { CustomAnimationDefinition } from "../custom-animations.ts";
import {
  buildTweenSteps,
  drawTweenedCanvas,
  normalizeTweenSettings,
} from "../canvas/tween.ts";
import type { TweenSettings } from "../canvas/tween.ts";

type FrameCanvas = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

/**
 * Maps direction names to row indices on a custom-animation grid (LPC order:
 * up, left, down, right). Should match DIRECTIONS from constants.ts.
 */
export const CUSTOM_ANIM_DIRECTION_TO_ROW: Readonly<Record<string, number>> =
  Object.freeze(
    DIRECTIONS.reduce<Record<string, number>>((acc, dir, index) => {
      acc[dir] = index;
      return acc;
    }, {}),
  );

export type ExtractedFrames = Record<
  string,
  Array<{ canvas: HTMLCanvasElement; frameNumber: number | string }>
>;

export function expandExtractedFramesWithTweens(
  frames: ExtractedFrames,
  settings: TweenSettings,
): ExtractedFrames {
  const normalizedSettings = normalizeTweenSettings(settings);

  if (normalizedSettings.mode === "off") {
    return frames;
  }

  const expandedFrames: ExtractedFrames = {};

  for (const [direction, frameList] of Object.entries(frames)) {
    if (frameList.length === 0) {
      expandedFrames[direction] = [];
      continue;
    }

    const tweenSteps = buildTweenSteps(frameList, normalizedSettings);
    expandedFrames[direction] = tweenSteps.map((step, stepIndex) => {
      if (!step.isTween) {
        return step.from;
      }

      const { canvas: tweenCanvas, ctx: tweenCtx } = createCanvas(
        step.from.canvas.width,
        step.from.canvas.height,
        true,
      );
      drawTweenedCanvas(
        tweenCtx,
        step.from.canvas,
        step.to.canvas,
        normalizedSettings.mode,
        step.t,
        normalizedSettings,
      );

      return {
        canvas: tweenCanvas,
        frameNumber: `${step.from.frameNumber}_tween_${stepIndex}`,
      };
    });
  }

  return expandedFrames;
}

export function composeFrameRowsToSpritesheet(
  frames: ExtractedFrames,
  directions: readonly string[] = DIRECTIONS,
): HTMLCanvasElement | null {
  const populatedDirections = directions.filter(
    (direction) => (frames[direction] ?? []).length > 0,
  );
  if (populatedDirections.length === 0) {
    return null;
  }

  const firstFrame = frames[populatedDirections[0]!]?.[0]?.canvas;
  if (!firstFrame) {
    return null;
  }

  const frameWidth = firstFrame.width;
  const frameHeight = firstFrame.height;
  const maxFrameCount = Math.max(
    ...populatedDirections.map((direction) => frames[direction]?.length ?? 0),
  );
  const { canvas: spritesheet, ctx: spritesheetCtx } = createCanvas(
    maxFrameCount * frameWidth,
    directions.length * frameHeight,
    true,
  );

  directions.forEach((direction, directionIndex) => {
    const frameList = frames[direction] ?? [];
    frameList.forEach((frame, frameIndex) => {
      spritesheetCtx.drawImage(
        frame.canvas,
        frameIndex * frameWidth,
        directionIndex * frameHeight,
      );
    });
  });

  return spritesheet;
}

/**
 * Splits a built-in LPC animation canvas (rows = directions, 13 frames per row)
 * into per-frame canvases. Skips frames that are fully transparent in the sheet.
 */
export function extractFramesFromAnimation(
  animationCanvas: HTMLCanvasElement,
  animationName: string,
  directions: readonly string[] = DIRECTIONS,
): ExtractedFrames {
  const frames: ExtractedFrames = {};
  const config = (
    ANIMATION_CONFIGS as Record<
      string,
      { row: number; num: number; cycle: number[] }
    >
  )[animationName];
  if (!config) return frames;

  const frameWidth = FRAME_SIZE;
  const frameHeight = FRAME_SIZE;
  const framesPerRow = STANDARD_ANIMATION_FRAMES_PER_ROW;

  const sourceCtx = get2DContext(animationCanvas, true);
  if (!sourceCtx) return frames;

  const canvasPool = createFrameCanvasPool(
    directions.length * framesPerRow,
    frameWidth,
    frameHeight,
  );

  let poolIndex = 0;

  for (
    let dirIndex = 0;
    dirIndex < directions.length && dirIndex < config.num;
    dirIndex++
  ) {
    const direction = directions[dirIndex]!;
    frames[direction] = [];

    const sourceY = dirIndex * frameHeight;

    const rowImageData = sourceCtx.getImageData(
      0,
      sourceY,
      animationCanvas.width,
      frameHeight,
    );

    for (let frameIndex = 0; frameIndex < framesPerRow; frameIndex++) {
      const sourceX = frameIndex * frameWidth;

      const hasContent = checkFrameContentFromImageData(
        rowImageData,
        sourceX,
        frameWidth,
        frameHeight,
      );

      if (hasContent && poolIndex < canvasPool.length) {
        const { canvas: frameCanvas, ctx: frameCtx } = canvasPool[poolIndex++]!;

        blitFrameFromSheet(
          frameCtx,
          animationCanvas,
          sourceX,
          sourceY,
          frameWidth,
        );

        frames[direction]!.push({
          canvas: frameCanvas,
          frameNumber: frameIndex + 1,
        });
      }
    }
  }

  return frames;
}

/**
 * Returns whether a horizontal slice of pre-fetched row `ImageData` has any
 * non-transparent pixel in the frame column starting at `startX`.
 */
export function checkFrameContentFromImageData(
  imageData: ImageData,
  startX: number,
  frameWidth: number,
  frameHeight: number,
): boolean {
  const data = imageData.data;
  const imageWidth = imageData.width;

  for (let y = 0; y < frameHeight; y++) {
    for (let x = startX; x < startX + frameWidth && x < imageWidth; x++) {
      const pixelIndex = (y * imageWidth + x) * 4;
      const alpha = data[pixelIndex + 3]!;
      if (alpha > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Splits a custom-animation canvas using that animation's `frameSize` and
 * `frames` layout; emits one small canvas per frame per direction (all frames
 * included, including fully transparent ones).
 */
export function extractFramesFromCustomAnimation(
  animationCanvas: HTMLCanvasElement,
  customAnimationDef: CustomAnimationDefinition,
  directions: readonly string[] = DIRECTIONS,
): ExtractedFrames {
  const frames: ExtractedFrames = {};
  const frameSize = customAnimationDef.frameSize;
  const animationFrames = customAnimationDef.frames;

  debugLog(`Extracting frames from custom animation:`, {
    frameSize,
    animationFrames,
    canvasSize: {
      width: animationCanvas.width,
      height: animationCanvas.height,
    },
  });

  const sourceCtx = get2DContext(animationCanvas, true);
  if (!sourceCtx) return frames;

  const maxFrames = Math.max(...animationFrames.map((row) => row.length));
  const canvasPool = createFrameCanvasPool(
    directions.length * maxFrames,
    frameSize,
    frameSize,
  );

  let poolIndex = 0;

  for (const direction of directions) {
    const dirIndex = CUSTOM_ANIM_DIRECTION_TO_ROW[direction];
    if (dirIndex === undefined) {
      debugLog(`Skipping direction ${direction} - not found in direction map`);
      continue;
    }
    if (dirIndex >= animationFrames.length) {
      debugLog(
        `Skipping direction ${direction} (index ${dirIndex}) - not enough rows in animation frames`,
      );
      continue;
    }

    frames[direction] = [];
    const frameRow = animationFrames[dirIndex]!;
    const sourceY = dirIndex * frameSize;

    debugLog(`Processing direction ${direction} (row ${dirIndex}):`, frameRow);

    try {
      sourceCtx.getImageData(0, sourceY, animationCanvas.width, frameSize);
    } catch (e) {
      debugWarn(`Failed to get image data for row ${dirIndex}:`, e);
      continue;
    }

    for (let frameIndex = 0; frameIndex < frameRow.length; frameIndex++) {
      const sourceX = frameIndex * frameSize;

      if (poolIndex >= canvasPool.length) break;

      const { canvas: frameCanvas, ctx: frameCtx } = canvasPool[poolIndex++]!;

      blitFrameFromSheet(
        frameCtx,
        animationCanvas,
        sourceX,
        sourceY,
        frameSize,
      );

      frames[direction].push({
        canvas: frameCanvas,
        frameNumber: frameIndex + 1,
      });

      debugLog(`Added frame ${frameIndex + 1} for direction ${direction}`);
    }
  }

  return frames;
}

function createFrameCanvasPool(
  poolSize: number,
  frameWidth: number,
  frameHeight: number,
): FrameCanvas[] {
  const canvasPool: FrameCanvas[] = [];
  for (let i = 0; i < poolSize; i++) {
    const { canvas: frameCanvas, ctx: frameCtx } = createCanvas(
      frameWidth,
      frameHeight,
      true,
    );
    if (frameCtx) {
      canvasPool.push({ canvas: frameCanvas, ctx: frameCtx });
    }
  }
  return canvasPool;
}

function blitFrameFromSheet(
  destCtx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  sourceX: number,
  sourceY: number,
  size: number,
): void {
  destCtx.clearRect(0, 0, size, size);
  destCtx.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    size,
    size,
    0,
    0,
    size,
    size,
  );
}
