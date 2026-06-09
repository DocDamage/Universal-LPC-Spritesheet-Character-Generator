import { type CatalogReader } from "./catalog.ts";
import { selectItem, state } from "./state.ts";
import { SLOT_CONFIG } from "../components/desktop/slot-config/data.ts";
import {
  clearSlotSelections,
  getDefaultRecolor,
} from "../components/desktop/slot-config/utils.ts";

export interface PresetSnapshot {
  bodyType?: string;
  selections: Record<string, { itemId: string; variant?: string }>;
}

/**
 * Programmatically builds templates/presets by scanning the metadata index by matching keywords.
 */
export function generatePreset(
  archetype: string,
  catalog: CatalogReader,
): PresetSnapshot {
  const selections: PresetSnapshot["selections"] = {};
  const indexesResult = catalog.getMetadataIndexes();
  if (indexesResult.isErr()) {
    return { selections };
  }
  const { byTypeName } = indexesResult.value;

  const findItemByKeywords = (
    typeNames: string[],
    keywords: string[],
    excludeKeywords: string[] = [],
  ): string | null => {
    for (const tn of typeNames) {
      const rows = byTypeName[tn];
      if (!rows) continue;
      for (const row of rows) {
        const rowId = row.itemId.toLowerCase();
        const rowName = row.name.toLowerCase();
        const matchesKeyword = keywords.some(
          (kw) => rowId.includes(kw) || rowName.includes(kw),
        );
        const matchesExclude = excludeKeywords.some(
          (ex) => rowId.includes(ex) || rowName.includes(ex),
        );
        if (matchesKeyword && !matchesExclude) {
          return row.itemId;
        }
      }
    }
    // Fallback to first item if keyword search fails
    for (const tn of typeNames) {
      const rows = byTypeName[tn];
      if (rows && rows.length > 0) return rows[0]!.itemId;
    }
    return null;
  };

  // Archetype specific scanning rules
  if (archetype === "Villager") {
    // Basic shirt, pants, shoes, hair, eyes
    const chestId = findItemByKeywords(
      ["chest"],
      ["shirt", "tunics", "loose"],
      ["chain", "plate", "armor"],
    );
    const legsId = findItemByKeywords(
      ["legs"],
      ["pants", "trousers", "skirt"],
      ["plate", "chain", "armor"],
    );
    const feetId = findItemByKeywords(
      ["feet"],
      ["shoes", "boots"],
      ["metal", "plate", "armored"],
    );
    const hairId = findItemByKeywords(["hair"], ["hair", "messy", "plain"]);

    if (chestId) selections["chest"] = { itemId: chestId };
    if (legsId) selections["legs"] = { itemId: legsId };
    if (feetId) selections["feet"] = { itemId: feetId };
    if (hairId) selections["hair"] = { itemId: hairId };
  } else if (archetype === "Knight") {
    // Metal chest/mail armor, greaves/legs armor, helm, sword/shield
    const chestId = findItemByKeywords(
      ["chest"],
      ["plate", "mail", "armor", "breastplate"],
    );
    const legsId = findItemByKeywords(
      ["legs"],
      ["greaves", "plate", "mail", "armor"],
    );
    const feetId = findItemByKeywords(
      ["feet"],
      ["boots", "sabatons", "armored"],
    );
    const headId = findItemByKeywords(["head"], ["helm", "helmet", "bascinet"]);
    const weaponId = findItemByKeywords(
      ["weapon"],
      ["sword", "longsword", "greatsword", "mace"],
    );

    if (chestId) selections["chest"] = { itemId: chestId };
    if (legsId) selections["legs"] = { itemId: legsId };
    if (feetId) selections["feet"] = { itemId: feetId };
    if (headId) selections["head"] = { itemId: headId };
    if (weaponId) selections["weapon"] = { itemId: weaponId };
  } else if (archetype === "Mage") {
    // Robe/cloak, hat/hood, staff/wand
    const chestId = findItemByKeywords(["chest"], ["robe", "gown", "cloak"]);
    const headId = findItemByKeywords(
      ["head"],
      ["hood", "wizard", "hat", "cowl"],
    );
    const weaponId = findItemByKeywords(["weapon"], ["staff", "wand"]);
    const feetId = findItemByKeywords(["feet"], ["shoes", "slippers"]);

    if (chestId) selections["chest"] = { itemId: chestId };
    if (headId) selections["head"] = { itemId: headId };
    if (weaponId) selections["weapon"] = { itemId: weaponId };
    if (feetId) selections["feet"] = { itemId: feetId };
  } else if (archetype === "Rogue") {
    // Leather chest, dark cloak/hood, boots, dagger
    const chestId = findItemByKeywords(
      ["chest"],
      ["leather", "jacket", "doublet"],
      ["plate", "mail"],
    );
    const legsId = findItemByKeywords(["legs"], ["pants", "trousers"]);
    const headId = findItemByKeywords(["head"], ["hood", "mask", "cowl"]);
    const feetId = findItemByKeywords(["feet"], ["boots", "shoes"]);
    const weaponId = findItemByKeywords(["weapon"], ["dagger", "knife", "bow"]);

    if (chestId) selections["chest"] = { itemId: chestId };
    if (legsId) selections["legs"] = { itemId: legsId };
    if (headId) selections["head"] = { itemId: headId };
    if (feetId) selections["feet"] = { itemId: feetId };
    if (weaponId) selections["weapon"] = { itemId: weaponId };
  } else if (archetype === "Merchant") {
    // Vest/tunic, nice shoes, book/bag/no heavy weapon
    const chestId = findItemByKeywords(
      ["chest"],
      ["vest", "shirt", "jacket", "tunic"],
    );
    const legsId = findItemByKeywords(["legs"], ["pants", "trousers", "skirt"]);
    const feetId = findItemByKeywords(["feet"], ["shoes", "slippers"]);
    const headId = findItemByKeywords(["head"], ["hat", "cap", "turban"]);

    if (chestId) selections["chest"] = { itemId: chestId };
    if (legsId) selections["legs"] = { itemId: legsId };
    if (feetId) selections["feet"] = { itemId: feetId };
    if (headId) selections["head"] = { itemId: headId };
  } else if (archetype === "Guard") {
    // Uniform, chainmail, tabard, spear/halberd, helmet
    const chestId = findItemByKeywords(
      ["chest"],
      ["chain", "mail", "breastplate", "tabard", "armor"],
    );
    const legsId = findItemByKeywords(["legs"], ["pants", "greaves"]);
    const headId = findItemByKeywords(["head"], ["helm", "helmet", "cap"]);
    const weaponId = findItemByKeywords(
      ["weapon"],
      ["spear", "halberd", "polearm", "sword"],
    );
    const feetId = findItemByKeywords(["feet"], ["boots"]);

    if (chestId) selections["chest"] = { itemId: chestId };
    if (legsId) selections["legs"] = { itemId: legsId };
    if (headId) selections["head"] = { itemId: headId };
    if (weaponId) selections["weapon"] = { itemId: weaponId };
    if (feetId) selections["feet"] = { itemId: feetId };
  }

  // Force body type selection
  return {
    bodyType: "light",
    selections,
  };
}

/**
 * Applies character preset snapshot to the global state.
 */
export function applyCharacterPreset(
  presetKey: string,
  catalog: CatalogReader,
): void {
  const preset = generatePreset(presetKey, catalog);

  // Set body type
  if (preset.bodyType) {
    state.bodyType = preset.bodyType;
  }

  // Clear all configurable gear slots first
  for (const slot of SLOT_CONFIG) {
    if (slot.kind !== "bodyType") {
      clearSlotSelections(slot, catalog);
    }
  }

  // Apply preset items
  for (const [_group, sel] of Object.entries(preset.selections)) {
    const defaultRec = getDefaultRecolor(sel.itemId, catalog);
    selectItem(sel.itemId, sel.variant || defaultRec || "");
  }
}
