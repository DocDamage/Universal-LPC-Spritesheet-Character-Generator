// @ts-nocheck
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { guardDistGenerated } from "./guard-dist.js";
import { itemMetadata } from "../dist/item-metadata.js";
import { itemLayers } from "../dist/layers-metadata.js";
import { metadataIndexes } from "../dist/index-metadata.js";
import { remapAnimationName, getSpritePath } from "./shared.js";

guardDistGenerated();

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

              for (const pth of pthResult) {
                const fullPath = path.resolve(pth);
                if (!fs.existsSync(fullPath)) {
                  console.log(
                    `[Neck Missing] itemId: ${itemId}, variant: ${variant}, bodyType: ${bodyType}, anim: ${queryAnim}, path: ${pth}`,
                  );
                }
              }
            }
          }
        }
      }
    }
  }
}
