/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { itemMetadata } from "../dist/item-metadata.js";
import { itemLayers } from "../dist/layers-metadata.js";
import { metadataIndexes } from "../dist/index-metadata.js";
import { ANIMATIONS, variantToFilename, remapAnimationName } from "./shared.js";

const SLOT_CONFIG = [
  {
    label: "Neck",
    kind: "typeName",
    typeNames: ["neck", "necklace", "charm"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
];

function getSpritePath(
  itemId,
  variant,
  recolors,
  bodyType,
  animName,
  layerNum,
  meta,
) {
  const layerKey = `layer_${layerNum}`;
  const layer = meta.layers?.[layerKey];
  if (!layer) return null;

  let basePath = layer[bodyType];
  if (!basePath) return null;

  if (basePath.includes("${")) {
    return { template: basePath };
  }

  if (!variant && !recolors) {
    const parts = itemId.split("_");
    variant = parts[parts.length - 1];
  }

  const animation = ANIMATIONS.find((a) => a.value === animName);
  if (animation?.folderName) {
    animName = animation.folderName;
  }

  const fileName = !recolors ? `/${variantToFilename(variant)}` : "";
  return `spritesheets/${basePath}${animName}${fileName}.png`;
}

const { byTypeName } = metadataIndexes;

for (const slot of SLOT_CONFIG) {
  for (const tn of slot.typeNames) {
    const rows = byTypeName[tn];
    if (!rows) continue;

    for (const row of rows) {
      const itemId = row.itemId;
      const lite = itemMetadata[itemId];
      const layers = itemLayers[itemId];
      const meta = { ...lite, layers };

      if (!lite) continue;

      const hasVariants = row.variants && row.variants.length > 0;
      const variants = hasVariants ? row.variants : [null];

      for (const variant of variants) {
        // Audit layers
        for (let layerNum = 1; layerNum < 10; layerNum++) {
          const layerKey = `layer_${layerNum}`;
          const layer = layers?.[layerKey];
          if (!layer) break;

          const requiredBodyTypes = lite.required || [];
          for (const bodyType of requiredBodyTypes) {
            // Check standard animations
            for (const animName of lite.animations || []) {
              const queryAnim = remapAnimationName(animName);

              const recolors = lite.recolors && lite.recolors.length > 0;
              const pthResult = getSpritePath(
                itemId,
                variant,
                recolors,
                bodyType,
                queryAnim,
                layerNum,
                meta,
              );
              if (!pthResult) continue;
              if (pthResult.template) continue;

              const fullPath = path.resolve(pthResult);
              if (!fs.existsSync(fullPath)) {
                console.log(
                  `[Neck Missing] itemId: ${itemId}, variant: ${variant}, bodyType: ${bodyType}, anim: ${queryAnim}, path: ${pthResult}`,
                );
              }
            }
          }
        }
      }
    }
  }
}
