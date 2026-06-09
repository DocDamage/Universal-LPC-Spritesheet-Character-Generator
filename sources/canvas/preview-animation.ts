import { previewCtx } from "./preview-canvas.ts";
import { canvas } from "./renderer.ts";
import { buildTweenSteps } from "./tween.ts";
import {
  animationFrameId,
  animationFrames,
  currentFrameIndex,
  lastFrameTime,
  setAnimationFrameId,
  setCurrentFrameIndex,
  setLastFrameTime,
  tweenSettings,
} from "./preview-animation-state.ts";
import {
  paintPreviewFrameForCycleIndex,
  paintPreviewTweenStep,
} from "./preview-frame-rendering.ts";

export * from "./preview-animation-state.ts";
export * from "./preview-frame-rendering.ts";
export * from "./preview-directional-rendering.ts";

declare global {
  interface Window {
    /** Set by Playwright visual tests (tests/visual/home.spec.js) to suppress rAF cycling. */
    __DISABLE_PREVIEW_ANIMATION__?: boolean;
  }
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
    setCurrentFrameIndex(0);
    paintPreviewFrameForCycleIndex(0);
    return;
  }

  function nextFrame(): void {
    const fpsInterval = 1000 / tweenSettings.fps;
    const now = Date.now();
    const elapsed = now - lastFrameTime;

    if (elapsed > fpsInterval) {
      setLastFrameTime(now - (elapsed % fpsInterval));

      if (previewCtx && canvas) {
        const stepCount = Math.max(
          1,
          buildTweenSteps(animationFrames, tweenSettings).length,
        );
        setCurrentFrameIndex((currentFrameIndex + 1) % stepCount);
        paintPreviewTweenStep(currentFrameIndex);
      }
    }

    setAnimationFrameId(requestAnimationFrame(nextFrame));
  }

  nextFrame();
}

/**
 * Stop the preview animation loop.
 * @returns true if a running loop was stopped
 */
export function stopPreviewAnimation(): boolean {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    setAnimationFrameId(null);
    return true;
  }
  return false;
}

export function stepPreviewAnimation(delta: number): number {
  stopPreviewAnimation();
  const stepCount = Math.max(
    1,
    buildTweenSteps(animationFrames, tweenSettings).length,
  );
  setCurrentFrameIndex((currentFrameIndex + delta + stepCount) % stepCount);
  paintPreviewTweenStep(currentFrameIndex);
  return currentFrameIndex;
}
