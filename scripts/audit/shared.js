// @ts-nocheck
export const ANIMATIONS = [
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

export function variantToFilename(variant) {
  return variant ? variant.replace(/_/g, "-") : "";
}

export function remapAnimationName(animName) {
  if (animName === "combat") return "combat_idle";
  if (animName === "1h_slash") return "slash";
  if (animName === "1h_backslash") return "backslash";
  if (animName === "1h_halfslash") return "halfslash";
  return animName;
}

/**
 * Full slot configuration shared across audit scripts.
 * Copy-paste from the original sources/components/desktop/slot-config.ts.
 */
export const SLOT_CONFIG = [
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
];

/**
 * Expands template paths that contain `${placeholder}` syntax using the
 * `replace_in_path` metadata map.
 *
 * @param {string} basePath
 * @param {{ replace_in_path?: Record<string, Record<string, string>> }} meta
 * @returns {(string | { template: string; unresolved: string })[]}
 */
export function expandTemplatePaths(basePath, meta) {
  const placeholders = [...basePath.matchAll(/\$\{(.*?)\}/g)].map(
    (match) => match[1],
  );
  if (placeholders.length === 0) return [basePath];

  let expanded = [basePath];
  for (const placeholder of placeholders) {
    const replacements = [
      ...new Set(Object.values(meta.replace_in_path?.[placeholder] ?? {})),
    ].filter(Boolean);

    if (replacements.length === 0) {
      return [{ template: basePath, unresolved: placeholder }];
    }

    expanded = expanded.flatMap((templatePath) =>
      replacements.map((replacement) =>
        templatePath.replaceAll(`\${${placeholder}}`, replacement),
      ),
    );
  }

  return expanded;
}

/**
 * Resolves the on-disk sprite path(s) for a given item, variant, body type,
 * animation and layer.  Returns `null` when the layer or body-type path is
 * missing, `{template, unresolved}` when a template placeholder could not be
 * expanded, or an array of absolute path strings otherwise.
 *
 * @param {string} itemId
 * @param {string|null} variant
 * @param {boolean} recolors
 * @param {string} bodyType
 * @param {string} animName
 * @param {number} layerNum
 * @param {{ layers?: Record<string, Record<string, string>>, replace_in_path?: Record<string, Record<string, string>> }} meta
 * @returns {null | { template: string; unresolved: string } | string[]}
 */
export function getSpritePath(
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

  if (!variant && !recolors) {
    const parts = itemId.split("_");
    variant = parts[parts.length - 1];
  }

  const animation = ANIMATIONS.find((a) => a.value === animName);
  if (animation?.folderName) {
    animName = animation.folderName;
  }

  const fileName = !recolors ? `/${variantToFilename(variant)}` : "";
  const expandedPaths = expandTemplatePaths(basePath, meta);
  if (
    expandedPaths.length === 1 &&
    typeof expandedPaths[0] === "object" &&
    expandedPaths[0].template
  ) {
    return expandedPaths[0];
  }

  return expandedPaths.map(
    (expandedPath) => `spritesheets/${expandedPath}${animName}${fileName}.png`,
  );
}
