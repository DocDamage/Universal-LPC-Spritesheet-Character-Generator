import fs from "node:fs";
import path from "node:path";
import { itemMetadata } from "../dist/item-metadata.js";
import { itemLayers } from "../dist/layers-metadata.js";
import { metadataIndexes } from "../dist/index-metadata.js";

const SLOT_CONFIG = [
  { label: "Gender", kind: "bodyType", panel: "left", canRandomize: true },
  {
    label: "Body",
    kind: "typeName",
    typeNames: ["body"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Race",
    kind: "typeName",
    typeNames: ["head"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Hair",
    kind: "typeName",
    typeNames: ["hair"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Eyes",
    kind: "typeName",
    typeNames: ["eyes"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Ears",
    kind: "typeName",
    typeNames: ["ears", "ears_inner", "furry_ears", "furry_ears_skin"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Nose",
    kind: "typeName",
    typeNames: ["nose"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Facial Hair",
    kind: "typeName",
    typeNames: ["beard", "mustache"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Wings",
    kind: "typeName",
    typeNames: ["wings", "wings_dots", "wings_edge"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Tail",
    kind: "typeName",
    typeNames: ["tail"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Horns",
    kind: "typeName",
    typeNames: ["horns"],
    panel: "left",
    canRandomize: true,
  },
  {
    label: "Expression",
    kind: "typeName",
    typeNames: ["expression", "expression_crying"],
    panel: "left",
    canRandomize: true,
  },
  {
    label: "Body Addon 1",
    kind: "typeName",
    typeNames: ["shadow"],
    panel: "left",
    canRandomize: true,
  },
  {
    label: "Body Addon 2",
    kind: "typeName",
    typeNames: ["wheelchair"],
    panel: "left",
    canRandomize: true,
  },

  {
    label: "Mask",
    kind: "typeName",
    typeNames: ["facial_mask"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Hat",
    kind: "typeName",
    typeNames: [
      "hat",
      "hat_accessory",
      "hat_buckle",
      "hat_overlay",
      "hat_trim",
    ],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Facial",
    kind: "typeName",
    typeNames: [
      "facial_eyes",
      "facial_left",
      "facial_left_trim",
      "facial_right",
      "facial_right_trim",
      "earring_left",
      "earring_right",
      "earrings",
    ],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Suit",
    kind: "typeName",
    typeNames: ["armour", "arms", "chainmail"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Coverall",
    kind: "typeName",
    typeNames: [
      "apron",
      "overalls",
      "dress",
      "dress_sleeves",
      "dress_sleeves_trim",
      "dress_trim",
    ],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Shirt",
    kind: "typeName",
    typeNames: ["clothes", "sleeves"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Gloves",
    kind: "typeName",
    typeNames: ["gloves", "bracers", "wrists", "ring"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Belt",
    kind: "typeName",
    typeNames: ["belt", "sash", "sash_tie", "buckles"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Pants",
    kind: "typeName",
    typeNames: ["legs"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Shoes",
    kind: "typeName",
    typeNames: ["shoes", "shoes_toe", "socks"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Back",
    kind: "typeName",
    typeNames: ["backpack", "backpack_straps", "cape", "cape_trim", "quiver"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Mainhand",
    kind: "typeName",
    typeNames: ["weapon", "weapon_magic_crystal"],
    panel: "right",
    canRandomize: true,
  },
  {
    label: "Ammo",
    kind: "typeName",
    typeNames: ["ammo"],
    panel: "right",
    canRandomize: true,
  },
  {
    label: "Offhand",
    kind: "typeName",
    typeNames: ["shield", "shield_paint", "shield_pattern", "shield_trim"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Neck",
    kind: "typeName",
    typeNames: ["neck", "necklace", "charm"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Shoulders",
    kind: "typeName",
    typeNames: ["shoulders"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Jacket",
    kind: "typeName",
    typeNames: ["jacket", "jacket_collar", "jacket_pockets", "jacket_trim"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Vest",
    kind: "typeName",
    typeNames: ["vest"],
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

              totalAssetsChecked++;
              if (!fs.existsSync(path.resolve(pthResult))) {
                missingAssetsCount++;
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
