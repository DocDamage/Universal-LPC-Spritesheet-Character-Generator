import {
  customAnimationBase,
  type CustomAnimationDefinition,
} from "../custom-animations.ts";
import type { Recolors } from "../state/palettes.ts";
import { state } from "../state/state.ts";
import type {
  CustomAreaItem,
  DrawCall,
  LayerSource,
} from "../state/render-state.ts";
import { drawFramesToCustomAnimation } from "./draw-frames.ts";
import { getImageToDraw } from "./palette-recolor.ts";
import { loadCustomAreaImages } from "./renderer-internals.ts";

export type CustomAnimationItem = {
  itemId: string;
  name?: string;
  variant: string | null;
  recolors: Recolors;
  source: LayerSource;
  zPos: number;
  layerNum: number;
  customAnimation: string;
};

type DrawCustomAnimationAreasArgs = {
  renderCtx: CanvasRenderingContext2D;
  addedCustomAnimations: Set<string>;
  customAnimations: Record<string, CustomAnimationDefinition>;
  customAnimationItems: CustomAnimationItem[];
  drawCalls: DrawCall[];
  customAreaItems: Record<string, CustomAreaItem[]>;
  customAnimYPositions: Record<string, number>;
};

export async function drawCustomAnimationAreas({
  renderCtx,
  addedCustomAnimations,
  customAnimations,
  customAnimationItems,
  drawCalls,
  customAreaItems,
  customAnimYPositions,
}: DrawCustomAnimationAreasArgs): Promise<void> {
  clearCustomAreaItems(customAreaItems);

  if (addedCustomAnimations.size === 0) return;

  for (const customAnimName of addedCustomAnimations) {
    const customAnimDef = customAnimations[customAnimName];
    if (!customAnimDef) continue;

    const offsetY = customAnimYPositions[customAnimName];
    const baseAnim = customAnimationBase
      ? customAnimationBase(customAnimDef)
      : null;
    const areaItems = buildCustomAreaItems(
      customAnimName,
      baseAnim,
      customAnimationItems,
      drawCalls,
    );
    customAreaItems[customAnimName] = areaItems;

    const filteredAreaItems = areaItems.filter(
      (item) => !state.hiddenLayerIds.has(item.itemId),
    );
    const loadedCustomImages = await loadCustomAreaImages(filteredAreaItems);

    for (const { item: areaItem, img, success } of loadedCustomImages) {
      if (success && img) {
        const imageToUse = await getImageToDraw(
          img,
          areaItem.itemId,
          areaItem.recolors || {},
          areaItem.source.kind === "catalog"
            ? areaItem.source.spritePath
            : null,
        );

        if (areaItem.type === "custom_sprite") {
          renderCtx.drawImage(imageToUse, 0, offsetY!);
        } else if (areaItem.type === "extracted_frames") {
          drawFramesToCustomAnimation(
            renderCtx,
            customAnimDef,
            offsetY!,
            imageToUse,
          );
        }
      }
    }
  }
}

function clearCustomAreaItems(
  customAreaItems: Record<string, CustomAreaItem[]>,
): void {
  for (const key of Object.keys(customAreaItems)) {
    delete customAreaItems[key];
  }
}

function buildCustomAreaItems(
  customAnimName: string,
  baseAnim: string | null,
  customAnimationItems: CustomAnimationItem[],
  drawCalls: DrawCall[],
): CustomAreaItem[] {
  const areaItems: CustomAreaItem[] = [];

  for (const item of customAnimationItems) {
    if (item.customAnimation === customAnimName) {
      areaItems.push({
        type: "custom_sprite",
        zPos: item.zPos,
        source: item.source,
        itemId: item.itemId,
        animation: customAnimName,
        recolors: item.recolors,
        variant: item.variant,
        name: item.name,
      });
    }
  }

  if (baseAnim) {
    for (const item of drawCalls) {
      if (item.animation === baseAnim && item.source.kind === "catalog") {
        areaItems.push({
          type: "extracted_frames",
          zPos: item.zPos,
          source: item.source,
          itemId: item.itemId,
          animation: item.animation,
          needsRecolor: item.needsRecolor,
          recolors: item.recolors,
          variant: item.variant,
          name: item.name,
        });
      }
    }
  }

  areaItems.sort((a, b) => a.zPos - b.zPos);
  return areaItems;
}
