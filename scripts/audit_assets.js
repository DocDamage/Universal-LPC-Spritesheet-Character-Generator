// @ts-nocheck
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { guardDistGenerated } from "./guard-dist.js";
import { itemMetadata } from "../dist/item-metadata.js";
import { itemLayers } from "../dist/layers-metadata.js";
import { metadataIndexes } from "../dist/index-metadata.js";
import {
  ANIMATIONS,
  variantToFilename,
  remapAnimationName,
  SLOT_CONFIG,
  getSpritePath,
  expandTemplatePaths,
} from "./shared.js";

guardDistGenerated();

console.log("Auditing Slot Configurations and Assets...");

const { byTypeName } = metadataIndexes;

for (const slot of SLOT_CONFIG) {
  if (slot.kind === "bodyType") continue;
  console.log(`\nSlot: ${slot.label} (Types: ${slot.typeNames.join(", ")})`);

  let optionsCount = 0;
  let missingAssetsCount = 0;

  for (const tn of slot.typeNames) {
    const rows = byTypeName[tn];
    if (!rows) {
      console.log(
        `  [Warning] No items registered in metadata index for typeName: ${tn}`,
      );
      continue;
    }

    for (const row of rows) {
      const itemId = row.itemId;
      const lite = itemMetadata[itemId];
      const layers = itemLayers[itemId];
      const meta = { ...lite, layers };

      if (!lite) {
        console.log(`  [Error] No itemMetadata found for itemId: ${itemId}`);
        continue;
      }

      const hasVariants = row.variants && row.variants.length > 0;
      const variants = hasVariants ? row.variants : [null];

      for (const variant of variants) {
        optionsCount++;
        const variantName = variant ? ` (${variant})` : "";

        // Audit layers
        for (let layerNum = 1; layerNum < 10; layerNum++) {
          const layerKey = `layer_${layerNum}`;
          const layer = layers?.[layerKey];
          if (!layer) break;

          const requiredBodyTypes = lite.required || [];
          for (const bodyType of requiredBodyTypes) {
            // Check custom animation path
            if (layer.custom_animation) {
              const customAnimName = layer.custom_animation;
              const basePath = layer[bodyType];
              if (!basePath) {
                console.log(
                  `    [Error] Item ${itemId}${variantName}: missing custom animation path for bodyType ${bodyType} on layer ${layerNum}`,
                );
                missingAssetsCount++;
                continue;
              }

              const expandedPaths = expandTemplatePaths(basePath, meta);
              for (const expandedPath of expandedPaths) {
                if (typeof expandedPath === "object") {
                  console.log(
                    `    [Warning] Unresolved template ${expandedPath.template} (${expandedPath.unresolved}) for ${itemId}${variantName}`,
                  );
                  continue;
                }
                const pth = `spritesheets/${expandedPath}${variantToFilename(variant || "")}.png`;
                const fullPath = path.resolve(pth);
                if (!fs.existsSync(fullPath)) {
                  console.log(
                    `    [Error] Missing asset for ${itemId}${variantName} (custom anim: ${customAnimName}, bodyType: ${bodyType}): ${pth}`,
                  );
                  missingAssetsCount++;
                }
              }
              continue;
            }

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

              if (pthResult.template) {
                console.log(
                  `    [Warning] Unresolved template ${pthResult.template} (${pthResult.unresolved}) for ${itemId}${variantName}`,
                );
                continue;
              }

              for (const pth of pthResult) {
                const fullPath = path.resolve(pth);
                if (!fs.existsSync(fullPath)) {
                  console.log(
                    `    [Error] Missing asset for ${itemId}${variantName} (anim: ${queryAnim}, bodyType: ${bodyType}, layer ${layerNum}): ${pth}`,
                  );
                  missingAssetsCount++;
                }
              }
            }
          }
        }
      }
    }
  }

  if (optionsCount === 0) {
    console.log(
      `  [CRITICAL] Dropdown "${slot.label}" has 0 options! It is completely empty/broken.`,
    );
  } else {
    console.log(`  Total options generated: ${optionsCount}`);
    if (missingAssetsCount > 0) {
      console.log(`  Total missing assets: ${missingAssetsCount}`);
    }
  }
}
