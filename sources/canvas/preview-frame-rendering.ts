import { previewCanvas, previewCtx } from "./preview-canvas.ts";
import { FRAME_SIZE } from "../state/constants.ts";
import { createCanvas, drawTransparencyBackground } from "./canvas-utils.ts";
import { applyTransparencyMaskToCanvas } from "./mask.ts";
import { canvas } from "./renderer.ts";
import {
  buildTweenSteps,
  drawTweenedCanvas,
  normalizeTweenSettings,
} from "./tween.ts";
import type { TweenSettings } from "./tween.ts";
import {
  activeCustomAnimation,
  animRowNum,
  animRowStart,
  animationFrames,
  currentFrameIndex,
  customAnimYPositions,
  previewApplyTransparencyMask,
  previewShowTransparencyGrid,
  tweenSettings,
  type PreviewGeometry,
} from "./preview-animation-state.ts";
import { customAnimations } from "../custom-animations.ts";

/**
 * Draw one preview frame for a given index into `animationFrames` (the cycle).
 * Used by the animation loop and by visual tests (static frame, no rAF).
 */
export function paintPreviewFrameForCycleIndex(cycleIndex: number): void {
  if (!previewCtx || !canvas || !previewCanvas) {
    return;
  }

  const geometry = getPreviewGeometry();
  const sourceCanvas = getSourceCanvas();
  preparePreviewCanvas(geometry);
  drawPreviewBackground();
  drawAnimationCycleFrame(previewCtx, sourceCanvas, geometry, cycleIndex);
}

export function paintPreviewTweenStep(stepIndex: number): void {
  if (!previewCtx || !canvas || !previewCanvas) {
    return;
  }

  const steps = buildTweenSteps(animationFrames, tweenSettings);
  const step = steps[stepIndex % steps.length];
  if (!step || !step.isTween || tweenSettings.mode === "off") {
    paintPreviewFrameForCycleIndex(step?.sourceIndex ?? 0);
    return;
  }

  const geometry = getPreviewGeometry();
  const sourceCanvas = getSourceCanvas();
  preparePreviewCanvas(geometry);
  drawPreviewBackground();

  const fromFrameCanvas = renderCycleFrameToCanvas(
    sourceCanvas,
    geometry,
    step.sourceIndex,
  );
  const toFrameCanvas = renderCycleFrameToCanvas(
    sourceCanvas,
    geometry,
    (step.sourceIndex + 1) % animationFrames.length,
  );
  drawTweenedCanvas(
    previewCtx,
    fromFrameCanvas,
    toFrameCanvas,
    tweenSettings.mode,
    step.t,
    tweenSettings,
  );
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

export function preparePreviewCanvas(geometry: PreviewGeometry): void {
  if (!previewCanvas || !previewCtx) {
    return;
  }

  if (
    previewCanvas.width !== geometry.previewWidth ||
    previewCanvas.height !== geometry.frameSize
  ) {
    previewCanvas.width = geometry.previewWidth;
    previewCanvas.height = geometry.frameSize;
    previewCtx.imageSmoothingEnabled = false;
  }

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}

export function drawPreviewBackground(): void {
  if (!previewCtx || !previewCanvas) {
    return;
  }

  if (previewShowTransparencyGrid) {
    drawTransparencyBackground(
      previewCtx,
      previewCanvas.width,
      previewCanvas.height,
    );
  }
}

export function getSourceCanvas(): HTMLCanvasElement {
  if (!canvas) {
    throw new Error("Renderer canvas is not initialized");
  }

  if (previewApplyTransparencyMask) {
    // using a tmpCanvas here to avoid modifying the original offscreen canvas
    // which causes a bug if the user toggles the checkbox multiple times
    const { canvas: tmpCanvas, ctx: tmpCtx } = createCanvas(
      canvas.width,
      canvas.height,
    );
    tmpCtx.drawImage(canvas, 0, 0);
    applyTransparencyMaskToCanvas(tmpCanvas, tmpCtx);
    return tmpCanvas;
  }

  return canvas;
}

export function renderCycleFrameToCanvas(
  sourceCanvas: HTMLCanvasElement,
  geometry: PreviewGeometry,
  cycleIndex: number,
): HTMLCanvasElement {
  const { canvas: frameCanvas, ctx: frameCtx } = createCanvas(
    geometry.previewWidth,
    geometry.frameSize,
    true,
  );
  drawAnimationCycleFrame(frameCtx, sourceCanvas, geometry, cycleIndex);
  return frameCanvas;
}

export function drawAnimationCycleFrame(
  targetCtx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  geometry: PreviewGeometry,
  cycleIndex: number,
): void {
  const currentFrame = animationFrames[cycleIndex];
  if (currentFrame === undefined) {
    return;
  }

  // Draw stacked rows from main canvas to preview
  for (let i = 0; i < animRowNum; i++) {
    const srcY = activeCustomAnimation
      ? geometry.yOffset + i * geometry.frameSize // Custom animation: use Y offset + row * frameSize
      : (animRowStart + i) * FRAME_SIZE; // Standard animation: use row * 64
    targetCtx.drawImage(
      sourceCanvas,
      currentFrame * geometry.frameSize, // source x
      srcY, // source y
      geometry.frameSize, // source width
      geometry.frameSize, // source height
      i * geometry.frameSize, // dest x (spread horizontally)
      0, // dest y
      geometry.frameSize, // dest width
      geometry.frameSize, // dest height
    );
  }
}

/**
 * When Playwright sets `__DISABLE_PREVIEW_ANIMATION__`, we paint once instead of using rAF.
 * The first paint can run before `renderCharacter` finishes; call this after any redraw that
 * may follow a completed render so the preview copies fresh offscreen pixels (Argos / visual tests).
 */
export function repaintStaticPreviewFrameForTests(): void {
  if (
    typeof window !== "undefined" &&
    window.__DISABLE_PREVIEW_ANIMATION__ === true
  ) {
    paintPreviewFrameForCycleIndex(currentFrameIndex);
  }
}

export function renderPreviewAnimationFrameCanvases(
  settings: TweenSettings = tweenSettings,
): HTMLCanvasElement[] {
  if (!canvas) {
    throw new Error("Renderer canvas is not initialized");
  }

  const normalizedSettings = normalizeTweenSettings(settings);
  const geometry = getPreviewGeometry();
  const sourceCanvas = getSourceCanvas();
  const steps = buildTweenSteps(animationFrames, normalizedSettings);
  const frameCanvases: HTMLCanvasElement[] = [];

  for (const step of steps) {
    if (!step.isTween || normalizedSettings.mode === "off") {
      frameCanvases.push(
        renderCycleFrameToCanvas(sourceCanvas, geometry, step.sourceIndex),
      );
      continue;
    }

    const { canvas: tweenCanvas, ctx: tweenCtx } = createCanvas(
      geometry.previewWidth,
      geometry.frameSize,
      true,
    );
    drawTweenedCanvas(
      tweenCtx,
      renderCycleFrameToCanvas(sourceCanvas, geometry, step.sourceIndex),
      renderCycleFrameToCanvas(
        sourceCanvas,
        geometry,
        (step.sourceIndex + 1) % animationFrames.length,
      ),
      normalizedSettings.mode,
      step.t,
      normalizedSettings,
    );
    frameCanvases.push(tweenCanvas);
  }

  return frameCanvases;
}
