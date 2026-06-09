// Canvas rendering module for Mithril UI
// Simplified renderer that draws character sprites based on selections

import { ok, err, type Result } from "neverthrow";
import { loadImagesInParallel } from "./load-image.ts";
import type { LoadedImage } from "./load-image.ts";
import { getSpritePath } from "../state/path.ts";
import { getImageToDraw } from "./palette-recolor.ts";
import { getMultiRecolors } from "../state/palettes.ts";
import { createCanvas, getZPos } from "./canvas-utils.ts";
import { variantToFilename } from "../utils/helpers.ts";
import {
  FRAME_SIZE,
  ANIMATION_OFFSETS,
  ANIMATION_CONFIGS,
} from "../state/constants.ts";
import { customAnimations } from "../custom-animations.ts";
import {
  setCurrentCustomAnimations,
  setCustomAnimYPositions,
} from "./preview-animation.ts";
import { getSortedLayersByAnim, supportsAnimation } from "../state/meta.ts";
import type { AnimationLayer } from "../state/meta.ts";
import {
  catalogReady,
  defaultCatalog,
  getItemMerged,
} from "../state/catalog.ts";
import { debugWarn } from "../utils/debug.ts";
import type { Selections } from "../state/app-state.ts";
import type { ZipExportProfiler } from "../performance-profiler.ts";
import { renderState } from "../state/render-state.ts";
import {
  SHEET_HEIGHT,
  SHEET_WIDTH,
  canvas,
  ctx,
  formatPathError,
  getRuntimeCustomPart,
  initCanvas,
  isOffscreenCanvasInitialized,
  resetOffscreenCanvasStateForTests,
  setOffscreenCanvasInitializedForTests,
  zipExportProfiledLoadComposite,
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

type Recolors = ReturnType<typeof getMultiRecolors>;

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

/**
 * Render a single item to a new canvas.
 * Returns a canvas with just this one item rendered.
 */
export async function renderSingleItem(
  itemId: string,
  variant: string | null,
  recolors: Recolors,
  bodyType: string,
  selections: Selections,
  singleLayer: number | null = null,
  zipProfiler: ZipExportProfiler | null = null,
): Promise<HTMLCanvasElement | null> {
  const customPart = getRuntimeCustomPart(itemId);
  if (customPart) {
    return (
      customPart.sheets["walk"] ?? Object.values(customPart.sheets)[0] ?? null
    );
  }

  const metaResult = getItemMerged(itemId);
  if (metaResult.isErr()) {
    console.error("Item metadata not found:", itemId);
    return null;
  }
  const meta = metaResult.value;

  // Check if this body type is supported
  if (!meta.required.includes(bodyType)) {
    console.error("Body type not supported for this item:", bodyType, itemId);
    return null;
  }

  // Check if this is a custom animation item
  const layer1 =
    meta.layers && Object.values(meta.layers).find((l) => l.custom_animation);
  const hasCustomAnimation = layer1 && layer1.custom_animation;

  let itemCanvas: HTMLCanvasElement;
  let itemCtx: CanvasRenderingContext2D;

  if (hasCustomAnimation && customAnimations) {
    // Custom animation item - use custom animation size
    const customAnimName = layer1.custom_animation as string;
    const customAnimDef = customAnimations[customAnimName];
    if (!customAnimDef) {
      console.error("Custom animation definition not found:", customAnimName);
      return null;
    }

    const animHeight = customAnimDef.frameSize * customAnimDef.frames.length;
    const animWidth = customAnimDef.frameSize * customAnimDef.frames[0]!.length;

    const customLayers = Object.values(meta.layers).filter(
      (l) => l.custom_animation,
    );
    const customAnimationsInItem = customLayers
      .map((l) => l.custom_animation as string)
      .filter((value, index, array) => array.indexOf(value) === index);
    const numCustomAnims = customAnimationsInItem.length;
    const getYPosForCustomAnim = (name: string): number => {
      const index = customAnimationsInItem.indexOf(name);
      return SHEET_HEIGHT + index * animHeight;
    };

    const createdItem = createCanvas(
      animWidth,
      SHEET_HEIGHT + animHeight * numCustomAnims,
    );
    itemCanvas = createdItem.canvas;
    itemCtx = createdItem.ctx;

    // Render all layers of this custom animation item
    const customSprites: { spritePath: string; zPos: number; yPos: number }[] =
      [];
    const animsList = getSortedLayersByAnim(
      defaultCatalog,
      itemId,
      true,
    ).unwrapOr({} as Record<string, AnimationLayer[]>);
    for (const animName in animsList) {
      for (let layerNum = 1; layerNum < 10; layerNum++) {
        if (singleLayer !== null && layerNum !== singleLayer) continue;
        const animLayer = animsList[animName]?.find(
          (l) => l.animLayerNum === layerNum,
        );
        if (!animLayer) continue;
        const layerKey = `layer_${animLayer.layerNum}`;
        const layer = meta.layers?.[layerKey];
        if (!layer) break;

        const yPos = getYPosForCustomAnim(layer.custom_animation as string);
        const basePath = layer[bodyType] as string | undefined;
        if (!basePath) continue;

        const spritePath = `spritesheets/${basePath}${variantToFilename(
          variant ?? "",
        )}.png`;

        customSprites.push({ spritePath, zPos: animLayer.zPos, yPos });
      }
    }

    // Sort by zPos
    customSprites.sort((a, b) => a.zPos - b.zPos);

    let loadedSprites:
      | LoadedImage<(typeof customSprites)[number]>[]
      | undefined;
    await zipExportProfiledLoadComposite(
      zipProfiler,
      "render_imageLoadDecode_renderSingleItem",
      "render_composite_renderSingleItem",
      async () => {
        loadedSprites = await loadImagesInParallel(customSprites);
      },
      async () => {
        if (!loadedSprites) return;
        for (const { item: sprite, img, success } of loadedSprites) {
          if (success && img) {
            const imageToDraw = await getImageToDraw(
              img,
              itemId,
              recolors,
              sprite.spritePath,
            );
            itemCtx.drawImage(imageToDraw, 0, sprite.yPos);
          }
        }
      },
    );
  } else {
    // Standard animation item - use standard sheet size
    const createdItem = createCanvas(SHEET_WIDTH, SHEET_HEIGHT);
    itemCanvas = createdItem.canvas;
    itemCtx = createdItem.ctx;
  }

  // Build list of sprites to draw for this item
  type StandardSprite = {
    itemId: string;
    variant: string | null;
    recolors: Recolors;
    spritePath: string;
    zPos: number;
    layerNum: number;
    animation: string;
    yPos: number;
  };
  const spritesToDraw: StandardSprite[] = [];

  for (let layerNum = 1; layerNum < 10; layerNum++) {
    if (singleLayer !== null && layerNum !== singleLayer) continue;
    const layerKey = `layer_${layerNum}`;
    if (!meta.layers?.[layerKey]) break;

    const zPos = getZPos(defaultCatalog, itemId, layerNum);

    // Add each animation for this layer
    for (const [animName, yPos] of Object.entries(ANIMATION_OFFSETS)) {
      if (!supportsAnimation(meta, animName)) continue;

      const pathResult = getSpritePath(
        itemId,
        variant,
        recolors,
        bodyType,
        animName,
        layerNum,
        selections,
        meta,
      );
      if (pathResult.isErr()) {
        debugWarn(formatPathError(itemId, pathResult.error));
        continue;
      }

      spritesToDraw.push({
        itemId,
        variant,
        recolors,
        spritePath: pathResult.value,
        zPos,
        layerNum,
        animation: animName,
        yPos,
      });
    }

    // Sort by animation first, then by zPos
    spritesToDraw.sort((a, b) => {
      if (a.yPos !== b.yPos) return a.yPos - b.yPos;
      return a.zPos - b.zPos;
    });

    let loadedImages: LoadedImage<StandardSprite>[] | undefined;
    await zipExportProfiledLoadComposite(
      zipProfiler,
      "render_imageLoadDecode_renderSingleItem",
      "render_composite_renderSingleItem",
      async () => {
        loadedImages = await loadImagesInParallel(spritesToDraw);
      },
      async () => {
        if (!loadedImages) return;
        for (const { item: sprite, img, success } of loadedImages) {
          if (success && img) {
            const imageToDraw = await getImageToDraw(
              img,
              itemId,
              sprite.recolors,
              sprite.spritePath,
            );
            itemCtx.drawImage(imageToDraw, 0, sprite.yPos);
          }
        }
      },
    );
  }

  return itemCanvas;
}

/**
 * Render a single item for a single animation to a new canvas.
 * Returns a canvas with just this one item's one animation rendered.
 */
export async function renderSingleItemAnimation(
  itemId: string,
  variant: string | null,
  recolors: Recolors,
  bodyType: string,
  animationName: string,
  selections: Selections,
  singleLayer: number | null = null,
  zipProfiler: ZipExportProfiler | null = null,
): Promise<HTMLCanvasElement | null> {
  const customPart = getRuntimeCustomPart(itemId);
  if (customPart) {
    return customPart.sheets[animationName] ?? null;
  }

  const metaResult = getItemMerged(itemId);
  if (metaResult.isErr()) {
    console.error("Item metadata not found:", itemId);
    return null;
  }
  const meta = metaResult.value;

  // Check if this body type is supported
  if (!meta.required.includes(bodyType)) {
    return null;
  }

  // Check if this is a custom animation item
  const layer1 = meta.layers?.["layer_1"];
  const hasCustomAnimation = layer1 && layer1.custom_animation;

  if (hasCustomAnimation && customAnimations) {
    // Custom animation item - just return the full item canvas (custom animations are not split by standard animation)
    return await renderSingleItem(
      itemId,
      variant,
      recolors,
      bodyType,
      selections,
      singleLayer,
      zipProfiler,
    );
  }

  const config = animationConfigByName[animationName];
  if (!config) {
    console.error("Unknown animation:", animationName);
    return null;
  }

  const { num } = config;
  const animYPos = 0;
  const animHeight = num * FRAME_SIZE;

  // Create a new canvas for this animation
  const { canvas: animCanvas, ctx: animCtx } = createCanvas(
    SHEET_WIDTH,
    animHeight,
  );

  // Build list of sprites to draw for this item & animation
  type AnimSprite = {
    spritePath: string;
    zPos: number;
    layerNum: number;
    recolors: Recolors;
  };
  const spritesToDraw: AnimSprite[] = [];

  for (let layerNum = 1; layerNum < 10; layerNum++) {
    if (singleLayer !== null && layerNum !== singleLayer) continue;
    const layerKey = `layer_${layerNum}`;
    if (!meta.layers?.[layerKey]) break;

    const zPos = getZPos(defaultCatalog, itemId, layerNum);

    // Check animation support
    if (animationName === "combat_idle") {
      if (!meta.animations.includes("combat")) continue;
    } else if (animationName === "backslash") {
      if (
        !meta.animations.includes("1h_slash") &&
        !meta.animations.includes("1h_backslash")
      )
        continue;
    } else if (animationName === "halfslash") {
      if (!meta.animations.includes("1h_halfslash")) continue;
    } else {
      if (!meta.animations.includes(animationName)) continue;
    }

    const pathResult = getSpritePath(
      itemId,
      variant,
      recolors,
      bodyType,
      animationName,
      layerNum,
      selections,
      meta,
    );
    if (pathResult.isErr()) {
      debugWarn(formatPathError(itemId, pathResult.error));
      continue;
    }

    spritesToDraw.push({
      spritePath: pathResult.value,
      zPos,
      layerNum,
      recolors,
    });
  }

  // Sort by zPos
  spritesToDraw.sort((a, b) => a.zPos - b.zPos);

  let loadedImages: LoadedImage<AnimSprite>[] | undefined;
  await zipExportProfiledLoadComposite(
    zipProfiler,
    "render_imageLoadDecode_renderSingleItemAnimation",
    "render_composite_renderSingleItemAnimation",
    async () => {
      loadedImages = await loadImagesInParallel(spritesToDraw);
    },
    async () => {
      if (!loadedImages) return;
      for (const { item: sprite, img, success } of loadedImages) {
        if (success && img) {
          const imageToDraw = await getImageToDraw(
            img,
            itemId,
            sprite.recolors,
            sprite.spritePath,
          );
          animCtx.drawImage(
            imageToDraw,
            0,
            animYPos,
            SHEET_WIDTH,
            animHeight,
            0,
            0,
            SHEET_WIDTH,
            animHeight,
          );
        }
      }
    },
  );

  return animCanvas;
}
