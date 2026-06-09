// Custom weapon import — building reference sheets from existing catalog sprites

import { createCanvas } from "../../../canvas/canvas-utils.ts";
import { loadImage } from "../../../canvas/load-image.ts";
import { getSpritePath } from "../../../state/path.ts";
import { variantToFilename } from "../../../utils/helpers.ts";
import {
  customAnimations,
  customAnimationSize,
} from "../../../custom-animations.ts";
import type { ItemMerged, CatalogReader } from "../../../state/catalog.ts";
import type { Selections } from "../../../state/state.ts";
import { getLayerZPos } from "./utils.ts";
import type { ReferenceSprite } from "./types.ts";

/** Build a composited reference sheet for a standard animation by layering
 *  every non-custom layer found in the item metadata from bottom to top. */
export async function buildReferenceAnimationSheet(
  catalog: CatalogReader,
  meta: ItemMerged,
  itemId: string,
  variant: string | null,
  bodyType: string,
  animation: string,
  selections: Selections,
): Promise<HTMLCanvasElement | null> {
  const sprites: ReferenceSprite[] = [];
  for (let layerNum = 1; layerNum < 10; layerNum += 1) {
    const layer = meta.layers?.[`layer_${layerNum}`];
    if (!layer) break;
    if (layer.custom_animation) continue;

    const pathResult = getSpritePath(
      itemId,
      variant,
      null,
      bodyType,
      animation,
      layerNum,
      selections,
      meta,
    );
    if (pathResult.isErr()) continue;

    try {
      const img = await loadImage(pathResult.value);
      sprites.push({ img, zPos: getLayerZPos(catalog, itemId, layerNum) });
    } catch {
      // Missing variants are common in the generated catalog; simply omit them.
    }
  }
  if (sprites.length === 0) return null;

  const width = Math.max(...sprites.map((sprite) => sprite.img.width));
  const height = Math.max(...sprites.map((sprite) => sprite.img.height));
  const { canvas, ctx } = createCanvas(width, height, true);
  sprites
    .sort((a, b) => a.zPos - b.zPos)
    .forEach((sprite) => ctx.drawImage(sprite.img, 0, 0));
  return canvas;
}

/** Build a composited reference sheet for a custom animation by layering
 *  layers that reference that specific custom_animation. */
export async function buildReferenceCustomAnimationSheet(
  catalog: CatalogReader,
  meta: ItemMerged,
  itemId: string,
  variant: string | null,
  bodyType: string,
  animation: string,
): Promise<HTMLCanvasElement | null> {
  const customAnimation = customAnimations[animation];
  if (!customAnimation) return null;

  const sprites: ReferenceSprite[] = [];
  for (let layerNum = 1; layerNum < 10; layerNum += 1) {
    const layer = meta.layers?.[`layer_${layerNum}`];
    if (!layer) break;
    if (layer.custom_animation !== animation) continue;

    const basePath = layer[bodyType] as string | undefined;
    if (!basePath) continue;

    try {
      const img = await loadImage(
        `spritesheets/${basePath}${variantToFilename(variant ?? "")}.png`,
      );
      sprites.push({ img, zPos: getLayerZPos(catalog, itemId, layerNum) });
    } catch {
      // Missing variants are common in the generated catalog; simply omit them.
    }
  }
  if (sprites.length === 0) return null;

  const { width, height } = customAnimationSize(customAnimation);
  const { canvas, ctx } = createCanvas(width, height, true);
  sprites
    .sort((a, b) => a.zPos - b.zPos)
    .forEach((sprite) => ctx.drawImage(sprite.img, 0, 0));
  return canvas;
}
