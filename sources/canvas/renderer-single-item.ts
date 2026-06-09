import { loadImagesInParallel, type LoadedImage } from "./load-image.ts";
import { getSpritePath } from "../state/path.ts";
import { getImageToDraw } from "./palette-recolor.ts";
import type { Recolors } from "../state/palettes.ts";
import { createCanvas, getZPos } from "./canvas-utils.ts";
import { variantToFilename } from "../utils/helpers.ts";
import {
  FRAME_SIZE,
  ANIMATION_OFFSETS,
  ANIMATION_CONFIGS,
} from "../state/constants.ts";
import { customAnimations } from "../custom-animations.ts";
import { getSortedLayersByAnim, supportsAnimation } from "../state/meta.ts";
import type { AnimationLayer } from "../state/meta.ts";
import { defaultCatalog, getItemMerged } from "../state/catalog.ts";
import { debugWarn } from "../utils/debug.ts";
import type { Selections } from "../state/app-state.ts";
import type { ZipExportProfiler } from "../performance-profiler.ts";
import {
  SHEET_HEIGHT,
  SHEET_WIDTH,
  formatPathError,
  getRuntimeCustomPart,
  zipExportProfiledLoadComposite,
} from "./renderer-internals.ts";

type AnimationConfig = { row: number; num: number; cycle: number[] };
const animationConfigByName = ANIMATION_CONFIGS as Record<
  string,
  AnimationConfig | undefined
>;

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

  if (!meta.required.includes(bodyType)) {
    console.error("Body type not supported for this item:", bodyType, itemId);
    return null;
  }

  const layer1 =
    meta.layers && Object.values(meta.layers).find((l) => l.custom_animation);
  const hasCustomAnimation = layer1 && layer1.custom_animation;

  let itemCanvas: HTMLCanvasElement;
  let itemCtx: CanvasRenderingContext2D;

  if (hasCustomAnimation && customAnimations) {
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
    const createdItem = createCanvas(SHEET_WIDTH, SHEET_HEIGHT);
    itemCanvas = createdItem.canvas;
    itemCtx = createdItem.ctx;
  }

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

  if (!meta.required.includes(bodyType)) {
    return null;
  }

  const layer1 = meta.layers?.["layer_1"];
  const hasCustomAnimation = layer1 && layer1.custom_animation;

  if (hasCustomAnimation && customAnimations) {
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
  const { canvas: animCanvas, ctx: animCtx } = createCanvas(
    SHEET_WIDTH,
    animHeight,
  );

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
    if (!supportsSingleAnimation(meta.animations, animationName)) continue;

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

function supportsSingleAnimation(
  animations: string[],
  animationName: string,
): boolean {
  if (animationName === "combat_idle") {
    return animations.includes("combat");
  }
  if (animationName === "backslash") {
    return (
      animations.includes("1h_slash") || animations.includes("1h_backslash")
    );
  }
  if (animationName === "halfslash") {
    return animations.includes("1h_halfslash");
  }
  return animations.includes(animationName);
}
