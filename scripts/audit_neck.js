/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";
import { itemMetadata } from "../dist/item-metadata.js";
import { itemLayers } from "../dist/layers-metadata.js";
import { metadataIndexes } from "../dist/index-metadata.js";

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

const ANIMATIONS = [
  { value: "walk", label: "Walk Cycle", folderName: "walk" },
  { value: "slash", label: "Slash / Melee", folderName: "slash" },
  { value: "shoot", label: "Shoot / Bow", folderName: "shoot" },
  { value: "thrust", label: "Thrust / Spear", folderName: "thrust" },
  { value: "cast", label: "Cast / Spell", folderName: "cast" },
  { value: "spellcast", label: "Spellcast", folderName: "spellcast" },
  { value: "hurt", label: "Hurt / Dead", folderName: "hurt" },
  { value: "bow", label: "Bow", folderName: "bow" },
  { value: "jump", label: "Jump", folderName: "jump" },
  { value: "sit", label: "Sit", folderName: "sit" },
  { value: "climb", label: "Climb", folderName: "climb" },
  { value: "crawl", label: "Crawl", folderName: "crawl" },
  { value: "fly", label: "Fly", folderName: "fly" },
  { value: "swim", label: "Swim", folderName: "swim" },
  { value: "ride", label: "Ride", folderName: "ride" },
  { value: "combat_idle", label: "Combat Idle", folderName: "combat_idle" },
  { value: "backslash", label: "Backslash", folderName: "backslash" },
  { value: "halfslash", label: "Halfslash", folderName: "halfslash" },
];

function variantToFilename(variant) {
  return variant ? variant.replace(/_/g, "-") : "";
}

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
              let queryAnim = animName;
              if (animName === "combat") queryAnim = "combat_idle";
              else if (animName === "1h_slash") queryAnim = "slash";
              else if (animName === "1h_backslash") queryAnim = "backslash";
              else if (animName === "1h_halfslash") queryAnim = "halfslash";

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
