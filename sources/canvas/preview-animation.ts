import { previewCanvas, previewCtx } from "./preview-canvas.ts";
import { FRAME_SIZE, ANIMATION_CONFIGS } from "../state/constants.ts";
import { createCanvas, drawTransparencyBackground } from "./canvas-utils.ts";
import { applyTransparencyMaskToCanvas } from "./mask.ts";
import { canvas } from "./renderer.ts";
import { customAnimations } from "../custom-animations.ts";
import type { CustomAnimationDefinition } from "../custom-animations.ts";
import {
  DEFAULT_TWEEN_SETTINGS,
  buildTweenSteps,
  drawTweenedCanvas,
  normalizeTweenSettings,
} from "./tween.ts";
import type { TweenSettings } from "./tween.ts";
import { getTweenSettingsForAnimation } from "../state/tween-settings.ts";

// Preview options mirrored from app state (set by component layer to avoid
// canvas → state circular dependency).
let previewShowTransparencyGrid = true;
let previewApplyTransparencyMask = false;

export function setPreviewShowTransparencyGrid(enabled: boolean): void {
  previewShowTransparencyGrid = enabled;
}

export function setPreviewApplyTransparencyMask(enabled: boolean): void {
  previewApplyTransparencyMask = enabled;
}

declare global {
  interface Window {
    /** Set by Playwright visual tests (tests/visual/home.spec.js) to suppress rAF cycling. */
    __DISABLE_PREVIEW_ANIMATION__?: boolean;
  }
}

// Animation preview state
let animationFrames: number[] = [1, 2, 3, 4, 5, 6, 7, 8]; // default for walk
let animRowStart = 8; // default for walk (row number)
let animRowNum = 4; // default for walk (number of rows to stack)
let currentFrameIndex = 0;
let lastFrameTime = Date.now();
let animationFrameId: number | null = null;
let tweenSettings: TweenSettings = { ...DEFAULT_TWEEN_SETTINGS };

// Track custom animations present in current render
let currentCustomAnimations: Record<string, CustomAnimationDefinition> = {};
let customAnimYPositions: Record<string, number> = {}; // Y positions of custom animations in canvas
export let activeCustomAnimation: string | null = null; // Currently selected custom animation for preview

type PreviewGeometry = {
  frameSize: number;
  previewWidth: number;
  yOffset: number;
};

export type DirectionalPreviewFrame = {
  direction: string;
  canvas: HTMLCanvasElement;
};

export type PreviewAnimationStatus = {
  currentStep: number;
  sourceFrameCount: number;
  totalSteps: number;
  directionCount: number;
  fps: number;
  tweenMode: TweenSettings["mode"];
};

/**
 * Set which animation to preview
 */
export function setPreviewAnimation(animationName: string): number[] {
  // Check if this is a custom animation
  if (customAnimations && customAnimations[animationName]) {
    const customAnimDef = customAnimations[animationName];
    activeCustomAnimation = animationName;

    // Extract frame cycle from custom animation definition
    // Custom animations have 4 rows (n, w, s, e), we'll show all columns from first row
    const frameCount = customAnimDef.frames[0]!.length;

    // Check if we should skip the first frame (frame 0)
    const skipFirstFrame = customAnimDef.skipFirstFrameInPreview || false;
    animationFrames = skipFirstFrame
      ? Array.from({ length: frameCount - 1 }, (_, i) => i + 1) // [1, 2, 3, ..., 8]
      : Array.from({ length: frameCount }, (_, i) => i); // [0, 1, 2, ..., 8]

    animRowStart = 0; // Not used for custom animations
    animRowNum = 4; // Show all 4 directions
    currentFrameIndex = 0;

    return animationFrames;
  }

  // Standard animation
  activeCustomAnimation = null;
  const configs = ANIMATION_CONFIGS as Record<
    string,
    { row: number; num: number; cycle: number[] } | undefined
  >;
  const config = configs[animationName];
  if (!config) {
    console.error("Unknown animation:", animationName);
    return [];
  }

  animationFrames = config.cycle;
  animRowStart = config.row;
  animRowNum = config.num;
  currentFrameIndex = 0;

  return animationFrames; // Return for display
}

export function setPreviewTweenSettings(
  nextSettings: Partial<TweenSettings>,
): TweenSettings {
  tweenSettings = {
    ...normalizeTweenSettings({ ...tweenSettings, ...nextSettings }),
  };
  currentFrameIndex = 0;
  return tweenSettings;
}

export function getPreviewTweenSettings(): TweenSettings {
  return { ...tweenSettings };
}

/**
 * Draw one preview frame for a given index into `animationFrames` (the cycle).
 * Used by the animation loop and by visual tests (static frame, no rAF).
 */
function paintPreviewFrameForCycleIndex(cycleIndex: number): void {
  if (!previewCtx || !canvas || !previewCanvas) {
    return;
  }

  const geometry = getPreviewGeometry();
  const sourceCanvas = getSourceCanvas();
  preparePreviewCanvas(geometry);
  drawPreviewBackground();
  drawAnimationCycleFrame(previewCtx, sourceCanvas, geometry, cycleIndex);
}

function paintPreviewTweenStep(stepIndex: number): void {
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

function preparePreviewCanvas(geometry: PreviewGeometry): void {
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

function drawPreviewBackground(): void {
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

function getSourceCanvas(): HTMLCanvasElement {
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

function renderCycleFrameToCanvas(
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

function drawAnimationCycleFrame(
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

export function renderDirectionalPreviewCanvases(
  cycleIndex: number = currentFrameIndex,
): DirectionalPreviewFrame[] {
  if (!canvas) {
    throw new Error("Renderer canvas is not initialized");
  }

  const geometry = getPreviewGeometry();
  const sourceCanvas = getSourceCanvas();
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

export function startPreviewAnimation(): void {
  if (animationFrameId !== null) {
    return; // Already running
  }

  // Set by Playwright visual tests (see tests/visual/home.spec.js) so Argos
  // screenshots are not flaky due to cycling frames during load.
  if (
    typeof window !== "undefined" &&
    window.__DISABLE_PREVIEW_ANIMATION__ === true
  ) {
    currentFrameIndex = 0;
    paintPreviewFrameForCycleIndex(0);
    return;
  }

  function nextFrame(): void {
    const fpsInterval = 1000 / tweenSettings.fps;
    const now = Date.now();
    const elapsed = now - lastFrameTime;

    if (elapsed > fpsInterval) {
      lastFrameTime = now - (elapsed % fpsInterval);

      if (previewCtx && canvas) {
        const stepCount = Math.max(
          1,
          buildTweenSteps(animationFrames, tweenSettings).length,
        );
        currentFrameIndex = (currentFrameIndex + 1) % stepCount;
        paintPreviewTweenStep(currentFrameIndex);
      }
    }

    animationFrameId = requestAnimationFrame(nextFrame);
  }

  nextFrame();
}

export function isPreviewAnimationRunning(): boolean {
  return animationFrameId !== null;
}

export function getPreviewAnimationStatus(): PreviewAnimationStatus {
  return {
    currentStep: currentFrameIndex + 1,
    sourceFrameCount: animationFrames.length,
    totalSteps: Math.max(
      1,
      buildTweenSteps(animationFrames, tweenSettings).length,
    ),
    directionCount: animRowNum,
    fps: tweenSettings.fps,
    tweenMode: tweenSettings.mode,
  };
}

export function stepPreviewAnimation(delta: number): number {
  stopPreviewAnimation();
  const stepCount = Math.max(
    1,
    buildTweenSteps(animationFrames, tweenSettings).length,
  );
  currentFrameIndex = (currentFrameIndex + delta + stepCount) % stepCount;
  paintPreviewTweenStep(currentFrameIndex);
  return currentFrameIndex;
}

export function syncPreviewTweenSettingsForAnimation(
  animationName: string,
): TweenSettings {
  return setPreviewTweenSettings(getTweenSettingsForAnimation(animationName));
}

/**
 * Stop the preview animation loop.
 * @returns true if a running loop was stopped
 */
export function stopPreviewAnimation(): boolean {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    return true;
  }
  return false;
}

/** Get list of custom animations present in current render. */
export function getCustomAnimations(): Record<
  string,
  CustomAnimationDefinition
> {
  return currentCustomAnimations;
}

export function setCurrentCustomAnimations(
  customAnimations: Record<string, CustomAnimationDefinition>,
): void {
  currentCustomAnimations = customAnimations;
}

export function setCustomAnimYPositions(
  yPositions: Record<string, number>,
): void {
  customAnimYPositions = yPositions;
}
