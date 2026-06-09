// Canvas rendering module for Mithril UI
// Simplified renderer that draws character sprites based on selections

import { ok, err, type Result } from "neverthrow";
import { ANIMATION_CONFIGS } from "../state/constants.ts";
import { customAnimations } from "../custom-animations.ts";
import {
  setCurrentCustomAnimations,
  setCustomAnimYPositions,
} from "./preview-animation.ts";
import { catalogReady } from "../state/catalog.ts";
import { renderState } from "../state/render-state.ts";
import {
  SHEET_HEIGHT,
  SHEET_WIDTH,
  canvas,
  ctx,
  initCanvas,
  isOffscreenCanvasInitialized,
  resetOffscreenCanvasStateForTests,
  setOffscreenCanvasInitializedForTests,
} from "./renderer-internals.ts";
import { drawStandardDrawCalls } from "./renderer-draw.ts";
import { extractAnimationFromSheet } from "./animation-extract.ts";
import { calculateCustomAnimationLayout } from "./renderer-custom-animation-layout.ts";
import {
  drawCustomAnimationAreas,
  type CustomAnimationItem,
} from "./renderer-custom-areas.ts";
import {
  beginRenderCharacter,
  finishRenderCharacter,
} from "./renderer-lifecycle.ts";
import { addCustomUploadDrawCalls } from "./renderer-upload.ts";
import { populateRenderPlan } from "./renderer-plan.ts";
import type { Selections } from "../state/app-state.ts";

export {
  renderSingleItem,
  renderSingleItemAnimation,
} from "./renderer-single-item.ts";

export {
  SHEET_HEIGHT,
  SHEET_WIDTH,
  canvas,
  ctx,
  initCanvas,
  isOffscreenCanvasInitialized,
  resetOffscreenCanvasStateForTests,
  setOffscreenCanvasInitializedForTests,
};

export const { drawCalls, addedCustomAnimations, customAreaItems } =
  renderState;

declare global {
  interface Window {
    /** Performance profiler installed by tests / dev tooling; absent in production. */
    profiler?: {
      mark: (name: string) => void;
      measure: (name: string, start: string, end: string) => void;
    };
    /** Module namespace of this file, attached at boot by `main.js`. */
    canvasRenderer?: typeof import("./renderer.ts");
  }
}

type AnimationConfig = { row: number; num: number; cycle: number[] };
const animationConfigByName = ANIMATION_CONFIGS as Record<
  string,
  AnimationConfig | undefined
>;
/** Commit 10: one render at a time; new calls wait behind the in-flight one. */
let renderCharacterSerial: Promise<void> = Promise.resolve();

/** @internal */
export function resetRenderCharacterQueueForTests(): void {
  renderCharacterSerial = Promise.resolve();
}

/**
 * Render character based on selections. Waits for layers metadata (S5), then runs serialized so
 * hash, defaults, and App updates cannot overlap expensive full renders.
 * The `onLayersReady` wait and serialized render queue are outside the
 * `renderCharacter` performance measure; marks wrap compositing in
 * `runRenderCharacter` only.
 */
export async function renderCharacter(
  selections: Selections,
  bodyType: string,
  targetCanvas: HTMLCanvasElement | null = null,
): Promise<void> {
  await catalogReady.onLayersReady;

  const p = renderCharacterSerial.then(() =>
    runRenderCharacter(selections, bodyType, targetCanvas),
  );
  renderCharacterSerial = p.then(
    () => {},
    () => {},
  );
  return p;
}

async function runRenderCharacter(
  selections: Selections,
  bodyType: string,
  targetCanvas: HTMLCanvasElement | null,
): Promise<void> {
  const profiler = window.profiler;

  beginRenderCharacter(profiler);

  try {
    // Use provided canvas or default to main canvas
    const renderCanvas = targetCanvas || canvas;
    const renderCtx = renderCanvas?.getContext("2d", {
      willReadFrequently: true,
    });

    if (!renderCanvas || !renderCtx) {
      console.error("Canvas not initialized");
      throw new Error("Canvas not initialized");
    }

    // Build list of items to draw
    const customAnimationItems: CustomAnimationItem[] = []; // Track items with custom animations

    populateRenderPlan({
      selections,
      bodyType,
      drawCalls,
      addedCustomAnimations,
      customAnimationItems,
    });

    addCustomUploadDrawCalls(drawCalls);

    // Sort by zPos (lower zPos = drawn first = behind). Shadow (zPos=0) before
    // body (zPos=10), etc.
    drawCalls.sort((a, b) => a.zPos - b.zPos);

    const customAnimationLayout = calculateCustomAnimationLayout(
      addedCustomAnimations,
      customAnimations,
      SHEET_WIDTH,
      SHEET_HEIGHT,
    );

    // Resize canvas to fit all content
    renderCanvas.width = customAnimationLayout.totalWidth;
    renderCanvas.height = customAnimationLayout.totalHeight;

    // Clear canvas (no transparency background on offscreen canvas)
    renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);

    // Store custom animations for animation preview dropdown
    setCurrentCustomAnimations(customAnimationLayout.currentCustomAnimations);

    // Store Y positions for external access
    setCustomAnimYPositions(customAnimationLayout.customAnimYPositions);

    await drawStandardDrawCalls(renderCtx, drawCalls);

    await drawCustomAnimationAreas({
      renderCtx,
      addedCustomAnimations,
      customAnimations,
      customAnimationItems,
      drawCalls,
      customAreaItems,
      customAnimYPositions: customAnimationLayout.customAnimYPositions,
    });
  } finally {
    finishRenderCharacter(profiler);
  }
}

/**
 * Extract a specific animation from the main canvas.
 * Returns a new canvas with just that animation.
 */
export function extractAnimationFromCanvas(
  animationName: string,
): HTMLCanvasElement | null {
  if (!canvas) {
    return null;
  }
  return extractAnimationFromSheet(
    canvas,
    SHEET_WIDTH,
    animationName,
    animationConfigByName,
  );
}

/** Error returned by `getCanvas` when called before `initCanvas` runs. */
export type CanvasNotInitialized = { kind: "canvas-not-initialized" };

/** Get current canvas reference (for external use). */
export function getCanvas(): Result<HTMLCanvasElement, CanvasNotInitialized> {
  return canvas ? ok(canvas) : err({ kind: "canvas-not-initialized" });
}
