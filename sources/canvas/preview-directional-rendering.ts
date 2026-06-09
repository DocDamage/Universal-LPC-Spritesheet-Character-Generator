import { FRAME_SIZE } from "../state/constants.ts";
import { createCanvas } from "./canvas-utils.ts";
import {
  activeCustomAnimation,
  animRowNum,
  animRowStart,
  animationFrames,
  customAnimYPositions,
  type DirectionalPreviewFrame,
  type PreviewGeometry,
} from "./preview-animation-state.ts";
import { customAnimations } from "../custom-animations.ts";
import { getSourceCanvas } from "./preview-frame-rendering.ts";

function renderDirectionFrameToCanvas(
  sourceCanvas: HTMLCanvasElement,
  geometry: PreviewGeometry,
  cycleIndex: number,
  directionIndex: number,
): HTMLCanvasElement {
  const { canvas: frameCanvas, ctx: frameCtx } = createCanvas(
    geometry.frameSize,
    geometry.frameSize,
    true,
  );
  const currentFrame = animationFrames[cycleIndex];
  if (currentFrame === undefined) {
    return frameCanvas;
  }

  const srcY = activeCustomAnimation
    ? geometry.yOffset + directionIndex * geometry.frameSize
    : (animRowStart + directionIndex) * FRAME_SIZE;
  frameCtx.drawImage(
    sourceCanvas,
    currentFrame * geometry.frameSize,
    srcY,
    geometry.frameSize,
    geometry.frameSize,
    0,
    0,
    geometry.frameSize,
    geometry.frameSize,
  );
  return frameCanvas;
}

export function renderDirectionalPreviewCanvases(
  cycleIndex: number,
): DirectionalPreviewFrame[] {
  const sourceCanvas = getSourceCanvas();
  const geometry = getPreviewGeometry();
  const directionLabels =
    animRowNum === 1 ? ["all"] : ["up", "left", "down", "right"];
  const frames: DirectionalPreviewFrame[] = [];

  for (let index = 0; index < animRowNum; index++) {
    frames.push({
      direction: directionLabels[index] ?? `row ${index + 1}`,
      canvas: renderDirectionFrameToCanvas(
        sourceCanvas,
        geometry,
        cycleIndex % animationFrames.length,
        index,
      ),
    });
  }

  return frames;
}

function getPreviewGeometry(): PreviewGeometry {
  let frameSize = FRAME_SIZE;
  let yOffset = 0;

  if (activeCustomAnimation && customAnimations) {
    const customAnimDef = customAnimations[activeCustomAnimation];
    if (customAnimDef) {
      frameSize = customAnimDef.frameSize;
      yOffset = customAnimYPositions[activeCustomAnimation] || 0;
    }
  }

  return {
    frameSize,
    previewWidth: animRowNum * frameSize,
    yOffset,
  };
}
