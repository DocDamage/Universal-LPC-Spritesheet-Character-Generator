import { createCanvas } from "./canvas-utils.ts";
import { FRAME_SIZE } from "../state/constants.ts";

type AnimationConfig = { row: number; num: number };

export function extractAnimationFromSheet(
  sourceCanvas: HTMLCanvasElement,
  sheetWidth: number,
  animationName: string,
  animationConfigByName: Record<string, AnimationConfig | undefined>,
): HTMLCanvasElement | null {
  const config = animationConfigByName[animationName];
  if (!config) {
    console.error("Unknown animation:", animationName);
    return null;
  }

  const { row, num } = config;
  const srcY = row * FRAME_SIZE;
  const srcHeight = num * FRAME_SIZE;
  const { canvas: animCanvas, ctx: animCtx } = createCanvas(
    sheetWidth,
    srcHeight,
  );

  animCtx.drawImage(
    sourceCanvas,
    0,
    srcY,
    sheetWidth,
    srcHeight,
    0,
    0,
    sheetWidth,
    srcHeight,
  );

  return animCanvas;
}
