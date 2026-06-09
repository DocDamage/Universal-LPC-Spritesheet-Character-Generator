// Slot configuration for the desktop UI
// Maps UI slot labels to type_name(s) in the catalog

import m from "mithril";
import { type CatalogReader, customParts } from "../../state/catalog.ts";
import { state, selectItem, getSelectionGroup } from "../../state/state.ts";
import { BODY_TYPES } from "../../state/constants.ts";
import { capitalize } from "../../utils/helpers.ts";
import { parseRecolorKey } from "../../state/palettes.ts";

export type SlotKind = "typeName" | "bodyType";

export type SlotDef = {
  label: string;
  kind: SlotKind;
  /** type_name(s) to look up in byTypeName */
  typeNames?: string[];
  /** Which panel this slot appears in */
  panel: "left" | "right";
  /** Whether this slot has a color picker */
  hasColor?: boolean;
  /** Optional dice/randomize button */
  canRandomize?: boolean;
};

export type SlotOption = {
  value: string;
  label: string;
  itemId: string;
  variant?: string;
};

// Slot configuration using ACTUAL type_names from the catalog
export const SLOT_CONFIG: SlotDef[] = [
  // ─── Left panel — Character / Body ───
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
    label: "Eyebrows",
    kind: "typeName",
    typeNames: ["eyebrows"],
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
    typeNames: ["ears", "ears_inner", "furry_ears", "furry_ears_skin", "fins"],
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
    label: "Wrinkles",
    kind: "typeName",
    typeNames: ["wrinkles"],
    panel: "left",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Wounds",
    kind: "typeName",
    typeNames: [
      "wound_arm",
      "wound_brain",
      "wound_eye_left",
      "wound_eye_right",
      "wound_mouth",
      "wound_ribs",
    ],
    panel: "left",
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
    label: "Wings",
    kind: "typeName",
    typeNames: ["wings", "wings_dots", "wings_edge"],
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
    label: "Shadow",
    kind: "typeName",
    typeNames: ["shadow"],
    panel: "left",
    canRandomize: true,
  },
  {
    label: "Wheelchair",
    kind: "typeName",
    typeNames: ["wheelchair"],
    panel: "left",
    canRandomize: true,
  },
  {
    label: "Prosthetics",
    kind: "typeName",
    typeNames: ["prosthesis_hand", "prosthesis_leg"],
    panel: "left",
    canRandomize: true,
  },

  // ─── Right panel — Equipment / Clothing ───
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
    label: "Headcover",
    kind: "typeName",
    typeNames: ["headcover", "headcover_rune"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Visor",
    kind: "typeName",
    typeNames: ["visor"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Facial Decor",
    kind: "typeName",
    typeNames: [
      "facial_eyes",
      "facial_left",
      "facial_left_trim",
      "facial_right",
      "facial_right_trim",
    ],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Jewelry",
    kind: "typeName",
    typeNames: [
      "earring_left",
      "earring_right",
      "earrings",
      "necklace",
      "charm",
      "ring",
    ],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Hair Acc.",
    kind: "typeName",
    typeNames: [
      "hairtie",
      "hairtie_rune",
      "hairextl",
      "hairextr",
      "ponytail",
      "updo",
    ],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Suit/Armor",
    kind: "typeName",
    typeNames: ["armour", "arms", "chainmail", "bauldron"],
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
    label: "Bandana",
    kind: "typeName",
    typeNames: ["bandana", "bandana_overlay"],
    panel: "right",
    hasColor: true,
    canRandomize: true,
  },
  {
    label: "Gloves",
    kind: "typeName",
    typeNames: ["gloves", "bracers", "wrists"],
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
    label: "Cargo",
    kind: "typeName",
    typeNames: ["cargo"],
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
    label: "Shoulders",
    kind: "typeName",
    typeNames: ["shoulders"],
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
    label: "Neck",
    kind: "typeName",
    typeNames: ["neck"],
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
    label: "Offhand",
    kind: "typeName",
    typeNames: ["shield", "shield_paint", "shield_pattern", "shield_trim"],
    panel: "right",
    hasColor: true,
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
    label: "Accessories",
    kind: "typeName",
    typeNames: ["accessory", "bandages", "items"],
    panel: "right",
    canRandomize: true,
  },
];

/** Get all type_names for a slot. */
export function getSlotTypeNames(slot: SlotDef): string[] {
  return slot.typeNames ?? [];
}

/** Get body type options. */
export function getBodyTypeOptions(): { value: string; label: string }[] {
  return BODY_TYPES.map((t) => ({ value: t, label: capitalize(t) }));
}

/** Build dropdown options for a slot from the catalog. */
export function getSlotOptions(
  slot: SlotDef,
  catalog: CatalogReader,
): SlotOption[] {
  if (slot.kind === "bodyType") {
    return getBodyTypeOptions().map((o) => ({ ...o, itemId: o.value }));
  }

  const indexesResult = catalog.getMetadataIndexes();
  if (indexesResult.isErr()) {
    return [];
  }
  const { byTypeName } = indexesResult.value;
  const typeNames = getSlotTypeNames(slot);

  const options: ReturnType<typeof getSlotOptions> = [];

  for (const tn of typeNames) {
    const rows = byTypeName[tn];
    if (!rows) continue;
    for (const row of rows) {
      const hasVariants = row.variants && row.variants.length > 0;

      if (hasVariants) {
        // Item has color/style variants — each is a separate option
        for (const v of row.variants) {
          options.push({
            value: `${row.itemId}::${v}`,
            label: `${row.name} (${capitalize(v.replace(/_/g, " "))})`,
            itemId: row.itemId,
            variant: v,
          });
        }
      } else {
        // Item has no variants (may have recolors handled by palette) — single option
        options.push({
          value: row.itemId,
          label: row.name,
          itemId: row.itemId,
        });
      }
    }
  }

  // Add matching custom parts from the registry
  for (const part of Object.values(customParts)) {
    if (typeNames.includes(part.type_name)) {
      options.push({
        value: part.itemId,
        label: `${part.name} (Custom)`,
        itemId: part.itemId,
      });
    }
  }

  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

/** Determine the default recolor for an item. */
export function getDefaultRecolor(
  itemId: string,
  catalog: CatalogReader,
): string {
  const metaResult = catalog.getItemLite(itemId);
  if (metaResult.isErr()) {
    return "";
  }
  const meta = metaResult.value;

  if (!meta.recolors || meta.recolors.length === 0) {
    return "";
  }

  const firstRecolor = meta.recolors[0]!;
  const variants = firstRecolor.variants;
  if (!variants || variants.length === 0) {
    return "";
  }

  // If item matches body color, use current body color
  if (meta.matchBodyColor || firstRecolor.matchBodyColor) {
    const bodySel = state.selections["body"];
    if (bodySel?.recolor && variants.includes(bodySel.recolor)) {
      return bodySel.recolor;
    }
  }

  // Resolve default variant/recolor from base key
  let resolvedKey = "";
  if (firstRecolor.base) {
    const [material, version, recolor] = parseRecolorKey(
      firstRecolor.base,
      firstRecolor,
    );
    const key =
      (material && material !== firstRecolor.material ? material + "." : "") +
      (version && version !== firstRecolor.default ? version + "." : "") +
      recolor;
    if (variants.includes(key)) {
      resolvedKey = key;
    }
  }

  const fallback =
    firstRecolor.default && variants.includes(firstRecolor.default)
      ? firstRecolor.default
      : variants[0] || "";

  const result = resolvedKey || fallback;
  return result;
}

/** Check if an option is currently selected. */
export function isOptionSelected(
  opt: ReturnType<typeof getSlotOptions>[number],
): boolean {
  const selectionGroup = getSelectionGroup(opt.itemId);
  const sel = state.selections[selectionGroup];
  if (!sel) return false;
  if (sel.itemId !== opt.itemId) return false;
  if (opt.variant) return sel.variant === opt.variant;
  return true;
}

/** Clear all selections for a slot. */
export function clearSlotSelections(
  slot: SlotDef,
  catalog: CatalogReader,
): void {
  if (slot.kind === "bodyType") return;
  const typeNames = getSlotTypeNames(slot);
  // Clear any selection whose item's actual type_name matches our slot's typeNames
  for (const [key, sel] of Object.entries(state.selections)) {
    const metaResult = catalog.getItemLite(sel.itemId);
    if (metaResult.isOk() && typeNames.includes(metaResult.value.type_name)) {
      delete state.selections[key];
    }
  }
}

/** Get the currently selected option value for a slot. */
export function getSlotSelectedValue(
  slot: SlotDef,
  catalog: CatalogReader,
): string {
  if (slot.kind === "bodyType") return state.bodyType;

  const options = getSlotOptions(slot, catalog);
  const selectedOpt = options.find(isOptionSelected);
  return selectedOpt ? selectedOpt.value : "";
}

/** Randomize a slot selection. */
export function randomizeSlot(slot: SlotDef, catalog: CatalogReader): void {
  if (slot.kind === "bodyType") {
    const types = getBodyTypeOptions();
    const random = types[Math.floor(Math.random() * types.length)];
    if (random) state.bodyType = random.value;
    m.redraw();
    return;
  }

  const options = getSlotOptions(slot, catalog);
  if (options.length === 0) return;

  // 30% chance to select "None"
  if (Math.random() < 0.3) {
    clearSlotSelections(slot, catalog);
    m.redraw();
    return;
  }

  const random = options[Math.floor(Math.random() * options.length)];
  if (!random) return;

  clearSlotSelections(slot, catalog);

  if (random.variant) {
    selectItem(random.itemId, random.variant);
  } else {
    const defaultRecolor = getDefaultRecolor(random.itemId, catalog);
    selectItem(random.itemId, defaultRecolor || "");
  }
  m.redraw();
}

/** Randomize all slots. */
export function randomizeAll(catalog: CatalogReader): void {
  for (const slot of SLOT_CONFIG) {
    // Batch randomize without individual redraws
    if (slot.kind === "bodyType") {
      const types = getBodyTypeOptions();
      const random = types[Math.floor(Math.random() * types.length)];
      if (random) state.bodyType = random.value;
      continue;
    }
    const options = getSlotOptions(slot, catalog);
    if (options.length === 0) continue;
    if (Math.random() < 0.3) {
      clearSlotSelections(slot, catalog);
      continue;
    }
    const random = options[Math.floor(Math.random() * options.length)];
    if (!random) continue;
    clearSlotSelections(slot, catalog);
    if (random.variant) {
      selectItem(random.itemId, random.variant);
    } else {
      const defaultRecolor = getDefaultRecolor(random.itemId, catalog);
      selectItem(random.itemId, defaultRecolor || "");
    }
  }
  // Single redraw after all slots updated
  m.redraw();
}
