// Utility functions for slot configuration

import m from "mithril";
import { type CatalogReader, customParts } from "../../../state/catalog.ts";
import { state, selectItem, getSelectionGroup } from "../../../state/state.ts";
import { BODY_TYPES } from "../../../state/constants.ts";
import { capitalize } from "../../../utils/helpers.ts";
import { parseRecolorKey } from "../../../state/palettes.ts";
import type { SlotDef, SlotOption } from "./types.ts";
import { SLOT_CONFIG, getSlotTypeNames } from "./data.ts";

export type { SlotDef, SlotOption };

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
