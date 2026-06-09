import { ANIMATION_OFFSETS } from "../state/constants.ts";
import type { Selections } from "../state/app-state.ts";
import type { DrawCall } from "../state/render-state.ts";
import { getSpritePath } from "../state/path.ts";
import { getMultiRecolors } from "../state/palettes.ts";
import { defaultCatalog, getItemMerged } from "../state/catalog.ts";
import { supportsAnimation } from "../state/meta.ts";
import { debugWarn } from "../utils/debug.ts";
import { variantToFilename } from "../utils/helpers.ts";
import { getZPos } from "./canvas-utils.ts";
import { customAnimations } from "../custom-animations.ts";
import { formatPathError, getRuntimeCustomPart } from "./renderer-internals.ts";
import type { CustomAnimationItem } from "./renderer-custom-areas.ts";

const animationOffsetByName = ANIMATION_OFFSETS as Record<string, number>;

type PopulateRenderPlanArgs = {
  selections: Selections;
  bodyType: string;
  drawCalls: DrawCall[];
  addedCustomAnimations: Set<string>;
  customAnimationItems: CustomAnimationItem[];
};

export function populateRenderPlan({
  selections,
  bodyType,
  drawCalls,
  addedCustomAnimations,
  customAnimationItems,
}: PopulateRenderPlanArgs): void {
  for (const [, selection] of Object.entries(selections)) {
    const { itemId, subId, variant } = selection;
    const customPart = getRuntimeCustomPart(itemId);
    if (customPart) {
      const layerNum = customPart.drawLayerNum ?? 1;
      const zPos = customPart.drawZPos ?? 100;
      const recolors = getMultiRecolors(itemId, selections);
      for (const [animation, sheet] of Object.entries(customPart.sheets)) {
        const yPos = animationOffsetByName[animation];
        if (yPos === undefined) {
          if (customAnimations[animation]) {
            addedCustomAnimations.add(animation);
            customAnimationItems.push({
              itemId,
              name: selection.name,
              variant: null,
              recolors,
              source: { kind: "custom", image: sheet },
              zPos,
              layerNum,
              customAnimation: animation,
            });
          }
          continue;
        }
        drawCalls.push({
          itemId,
          name: selection.name,
          variant: null,
          recolors,
          source: { kind: "custom", image: sheet },
          zPos,
          layerNum,
          animation,
          yPos,
          needsRecolor: false,
        });
      }
      continue;
    }

    const assetItemId = itemId;
    const metaResult = getItemMerged(assetItemId);
    if (metaResult.isErr() || subId) continue;
    const meta = metaResult.value;

    if (!meta.required.includes(bodyType)) {
      continue;
    }

    const recolors = getMultiRecolors(itemId, selections);

    for (let layerNum = 1; layerNum < 10; layerNum++) {
      const layerKey = `layer_${layerNum}`;
      const layer = meta.layers?.[layerKey];
      if (!layer) break;

      const zPos = getZPos(defaultCatalog, assetItemId, layerNum);

      if (layer.custom_animation) {
        const customAnimName = layer.custom_animation as string;
        addedCustomAnimations.add(customAnimName);

        const basePath = layer[bodyType] as string | undefined;
        if (!basePath) {
          continue;
        }

        const spritePath = `spritesheets/${basePath}${variantToFilename(
          variant ?? "",
        )}.png`;

        customAnimationItems.push({
          itemId,
          name: selection.name,
          variant: variant ?? null,
          recolors,
          source: { kind: "catalog", spritePath },
          zPos,
          layerNum,
          customAnimation: customAnimName,
        });

        continue;
      }

      for (const [animName, yPos] of Object.entries(ANIMATION_OFFSETS)) {
        if (!meta.animations || meta.animations.length === 0) {
          continue;
        }

        if (!supportsAnimation(meta, animName)) continue;

        const pathResult = getSpritePath(
          assetItemId,
          variant ?? null,
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

        drawCalls.push({
          itemId,
          name: selection.name,
          variant: variant ?? null,
          recolors,
          source: { kind: "catalog", spritePath: pathResult.value },
          zPos,
          layerNum,
          animation: animName,
          yPos,
          needsRecolor: itemId === "body-body" && variant !== "light",
        });
      }
    }
  }
}
