// SlotSelector view data preparation — extracted from SlotSelector.ts view
//
// All derived / computed data for the SlotSelector view is assembled here so
// the component can focus on wiring it into the template.

import type { CatalogReader } from "../../../state/catalog.ts";
import { customParts } from "../../../state/catalog.ts";
import { canUseFeature } from "../../../state/feature-gates.ts";
import { canUseWeaponImportReference } from "../custom-weapon-import.ts";
import type { SlotDef, SlotOption } from "../slot-config.ts";
import {
  getSlotOptions,
  getSlotSelectedValue,
  getSlotTypeNames,
} from "../slot-config.ts";
import { getRecolorChoices, getSelectedRecolor } from "./recolor.ts";
import type { SlotSelectorState } from "./types.ts";

export type SlotViewData = ReturnType<typeof buildSlotViewData>;

/**
 * Collect all derived data needed by the SlotSelector view.
 *
 * Encapsulates the computation so the component's `view` method only handles
 * wiring data into the Mithril template.
 */
export function buildSlotViewData(
  slot: SlotDef,
  catalog: CatalogReader,
  stateObj: SlotSelectorState,
) {
  // ── Slot options & selection ──────────────────────────────────────

  let options = getSlotOptions(slot, catalog);
  const filterText = stateObj.slotItemFilter.trim().toLowerCase();
  if (filterText) {
    options = options.filter(opt => opt.label.toLowerCase().includes(filterText));
  }
  const selectedValue = getSlotSelectedValue(slot, catalog);
  const hasSelection = selectedValue !== "";
  const isBodyType = slot.kind === "bodyType";
  const canImportWeapon = slot.label === "Mainhand";
  const canEditParts = canUseFeature("advanced-editor");
  const canImportCustomAssets = canUseFeature("custom-imports");
  const slotTypeNames = getSlotTypeNames(slot);

  // ── Weapon import reference options ───────────────────────────────

  const importReferenceOptions: SlotOption[] = canImportWeapon
    ? options.filter(
        (opt) =>
          !opt.itemId.startsWith("custom_") &&
          canUseWeaponImportReference(catalog, opt.itemId),
      )
    : [];

  // ── Custom asset parts (with tag/name filtering) ──────────────────

  let customAssetParts = canImportWeapon
    ? Object.values(customParts)
        .filter((part) => slotTypeNames.includes(part.type_name))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const filter = stateObj.customAssetFilter.trim().toLowerCase();
  if (filter) {
    customAssetParts = customAssetParts.filter(
      (part) =>
        part.name.toLowerCase().includes(filter) ||
        part.tags?.some((t) => t.toLowerCase().includes(filter)),
    );
  }

  // ── Sync import preview reference with current slot selection ─────

  if (
    canImportWeapon &&
    importReferenceOptions.length > 0 &&
    !importReferenceOptions.some(
      (opt) => opt.value === stateObj.importReferenceValue,
    )
  ) {
    stateObj.importReferenceValue =
      selectedValue &&
      importReferenceOptions.some((opt) => opt.value === selectedValue)
        ? selectedValue
        : importReferenceOptions[0]!.value;
  }

  // ── Selected item ID (for color picker / editing) ─────────────────

  let selectedItemId: string | null = null;
  if (hasSelection && !isBodyType) {
    const opt = options.find((o) => o.value === selectedValue);
    if (opt) {
      selectedItemId = opt.itemId;
    }
  }

  // ── Recolor options ───────────────────────────────────────────────

  const recolorChoices = selectedItemId
    ? getRecolorChoices(selectedItemId, catalog)
    : [];
  const currentRecolor = selectedItemId
    ? getSelectedRecolor(selectedItemId)
    : null;

  return {
    options,
    selectedValue,
    hasSelection,
    isBodyType,
    canImportWeapon,
    canEditParts,
    canImportCustomAssets,
    slotTypeNames,
    importReferenceOptions,
    customAssetParts,
    selectedItemId,
    recolorChoices,
    currentRecolor,
  };
}
