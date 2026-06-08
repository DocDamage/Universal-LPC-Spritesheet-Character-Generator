// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
/* eslint-disable no-console */
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
} from "./shared.js";

guardDistGenerated();

const { variantArrays, recolorVariantArrays } = metadataIndexes;

function expandInternedItemLite(lite) {
  if (lite.v === undefined || lite.r === undefined) return lite;
  const { v, r, recolors: rcIn, ...rest } = lite;
  const variants = variantArrays[v] ?? [];
  const rList = recolorVariantArrays[r] ?? [];
  let recolors = Array.isArray(rcIn) ? rcIn : [];
  if (recolors.length > 0) {
    const [head, ...tail] = recolors;
    if (head && typeof head === "object") {
      const merged0 = { ...head, variants: rList.length ? [...rList] : [] };
      recolors = [merged0, ...tail];
    }
  } else if (rList.length > 0) {
    recolors = [{ variants: [...rList] }];
  }
  return { ...rest, variants, recolors };
}

const { byTypeName: rawByTypeName } = metadataIndexes;
const summary = [];

for (const slot of SLOT_CONFIG) {
  if (slot.kind === "bodyType") {
    summary.push({ slot: slot.label, options: 2, missing: 0, status: "OK" });
    continue;
  }

  let optionsCount = 0;
  let missingAssetsCount = 0;
  let totalAssetsChecked = 0;

  for (const tn of slot.typeNames) {
    const rows = rawByTypeName[tn];
    if (!rows) continue;

    for (const row of rows) {
      const itemId = row.itemId;
      const rawLite = itemMetadata[itemId];
      if (!rawLite) continue;
      const lite = expandInternedItemLite(rawLite);
      const layers = itemLayers[itemId];
      const meta = { ...lite, layers };

      const hasVariants = lite.variants && lite.variants.length > 0;
      const variants = hasVariants ? lite.variants : [null];

      for (const variant of variants) {
        optionsCount++;

        // Audit layers
        for (let layerNum = 1; layerNum < 10; layerNum++) {
          const layerKey = `layer_${layerNum}`;
          const layer = layers?.[layerKey];
          if (!layer) break;

          const requiredBodyTypes = lite.required || [];
          for (const bodyType of requiredBodyTypes) {
            // Check custom animation path
            if (layer.custom_animation) {
              const basePath = layer[bodyType];
              if (!basePath) {
                missingAssetsCount++;
                totalAssetsChecked++;
                continue;
              }
              if (basePath.includes("${")) continue;
              const pth = `spritesheets/${basePath}${variantToFilename(variant || "")}.png`;
              totalAssetsChecked++;
              if (!fs.existsSync(path.resolve(pth))) {
                missingAssetsCount++;
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
              if (pthResult.template) continue;

              for (const pth of pthResult) {
                totalAssetsChecked++;
                if (!fs.existsSync(path.resolve(pth))) {
                  missingAssetsCount++;
                }
              }
            }
          }
        }
      }
    }
  }

  let status = "OK";
  if (optionsCount === 0) status = "BROKEN/EMPTY";
  else if (missingAssetsCount > 0) {
    status = `${missingAssetsCount}/${totalAssetsChecked} MISSING (${Math.round((100 * missingAssetsCount) / totalAssetsChecked)}%)`;
  }

  summary.push({
    slot: slot.label,
    options: optionsCount,
    missing: missingAssetsCount,
    status,
  });
}

console.table(summary);
