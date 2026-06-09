// Global state and state operations
import m from "mithril";
import { syncSelectionsToHash, loadSelectionsFromHash } from "./hash.ts";
import { defaultCatalog, type ItemMerged } from "./catalog.ts";
import { renderCharacter } from "../canvas/renderer.ts";
import { state } from "./app-state.ts";
import type { Selections } from "./app-state.ts";

export { state };
export type { Selection, Selections, State } from "./app-state.ts";

/**
 * State.ts treats catalog metadata defensively — fields like `type_name` are
 * narrowed at each access. Modeling the DI return as `Partial<ItemMerged>`
 * matches that style and keeps test stubs (which supply only the fields they
 * exercise) typeable from JS.
 */
type MetadataView = Partial<ItemMerged>;

type StateDeps = {
  getItemMetadata: (itemId: string) => MetadataView | null;
  selectDefaults: () => Promise<void>;
  redraw: () => void;
  syncSelectionsToHash: () => void;
  renderCharacter: (selections: Selections, bodyType: string) => Promise<void>;
  loadSelectionsFromHash: () => void;
  getCanvasRenderer: () => unknown;
};

// Dependency injection for testability (see setStateDeps / resetStateDeps)
function createDefaultStateDeps(): StateDeps {
  return {
    getItemMetadata: (itemId) =>
      defaultCatalog.getItemMerged(itemId).unwrapOr(null),
    selectDefaults,
    redraw: () => m.redraw(),
    syncSelectionsToHash,
    renderCharacter,
    loadSelectionsFromHash,
    getCanvasRenderer: () =>
      (window as unknown as { canvasRenderer?: unknown }).canvasRenderer,
  };
}

let stateDeps: StateDeps = createDefaultStateDeps();

export function setStateDeps(overrides: Partial<StateDeps>): void {
  Object.assign(stateDeps, overrides);
}

export function resetStateDeps(): void {
  stateDeps = createDefaultStateDeps();
}

export function getStateDeps(): StateDeps {
  return stateDeps;
}

/**
 * Selection group = `type_name` (e.g. "body", "heads", "ears"). Ensures only
 * one item per type can be selected (mimics legacy radio-button behavior).
 */
export function getSelectionGroup(itemId: string): string {
  const meta = stateDeps.getItemMetadata(itemId);
  if (!meta || !meta.type_name) return itemId;
  return meta.type_name;
}

/** Sub-selection group for a recolor option; falls back to the item's type_name. */
export function getSubSelectionGroup(itemId: string, idx: number): string {
  const meta = stateDeps.getItemMetadata(itemId);
  const recolor = meta?.recolors?.[idx];
  if (!meta || !meta.type_name) return itemId;
  return recolor?.type_name ?? meta.type_name;
}

// Select default items (body color light + human male light head)
export async function selectDefaults(): Promise<void> {
  // itemId is now based on filename (e.g., "body").
  const bodyItemId = "body";
  const bodySelectionGroup = getSelectionGroup(bodyItemId);
  state.selections[bodySelectionGroup] = {
    itemId: bodyItemId,
    variant: "",
    recolor: "light",
    name: "Body color (light)",
  };

  const headItemId = "heads_human_male";
  const headSelectionGroup = getSelectionGroup(headItemId);
  state.selections[headSelectionGroup] = {
    itemId: headItemId,
    variant: "",
    recolor: "light",
    name: "Human Male (light)",
  };

  const expressionItemId = "face_neutral";
  const expressionSelectionGroup = getSelectionGroup(expressionItemId);
  state.selections[expressionSelectionGroup] = {
    itemId: expressionItemId,
    variant: "",
    recolor: "light",
    name: "Neutral (light)",
  };

  stateDeps.syncSelectionsToHash();
  await stateDeps.renderCharacter(state.selections, state.bodyType);
  // Trigger redraw to update preview canvas after offscreen render completes
  stateDeps.redraw();
}

export async function resetAll(): Promise<void> {
  state.selections = {};
  state.customUploadedImage = null;
  state.customImageZPos = 0;
  await stateDeps.selectDefaults();
  stateDeps.redraw();
}

/** When any body-colored part changes, propagate variant/recolor to other items with matchBodyColor. */
export function applyMatchBodyColor(
  variantToMatch: string | null,
  recolorToMatch: string | null,
): void {
  if (!state.matchBodyColorEnabled) return;
  if (!variantToMatch && !recolorToMatch) return;

  for (const selection of Object.values(state.selections)) {
    const itemId = selection.itemId;
    const meta = stateDeps.getItemMetadata(itemId);

    if (!meta || !meta.matchBodyColor) continue;

    if (
      selection.subId !== null &&
      selection.subId !== undefined &&
      !meta.recolors?.[selection.subId]?.matchBodyColor
    )
      continue;

    if (variantToMatch && meta.variants?.includes(variantToMatch)) {
      selection.variant = variantToMatch;
      selection.name = `${meta.name} (${variantToMatch})`;
    }

    if (
      recolorToMatch &&
      meta.recolors?.[0]?.variants?.includes(recolorToMatch)
    ) {
      selection.recolor = recolorToMatch;
      selection.name = `${meta.name} (${recolorToMatch})`;
    }
  }
}

export async function initState(): Promise<void> {
  stateDeps.loadSelectionsFromHash();

  if (Object.keys(state.selections).length === 0) {
    await stateDeps.selectDefaults();
  } else if (stateDeps.getCanvasRenderer()) {
    await stateDeps.renderCharacter(state.selections, state.bodyType);
    stateDeps.redraw();
  }
}

export function selectItem(
  itemId: string,
  variant: string,
  isSelected: boolean = false,
  subId: number | null = null,
): void {
  const selectionGroup = getSelectionGroup(itemId);
  const subSelect =
    subId !== null ? getSubSelectionGroup(itemId, subId) : selectionGroup;

  if (isSelected) {
    delete state.selections[subSelect];
    return;
  }

  const meta = stateDeps.getItemMetadata(itemId);
  if (!meta) return;

  const useVariants = (meta.variants?.length ?? 0) > 0;
  const variantDisplayName = variant.replaceAll("_", " ");

  const subMeta =
    !useVariants && subId !== null ? meta.recolors?.[subId] : null;
  const displayName = subMeta?.type_name ? subMeta.label : meta.name;

  state.selections[subSelect] = {
    itemId,
    subId: subMeta?.type_name ? subId : null,
    variant: useVariants ? variant : null,
    recolor: useVariants ? null : variant,
    name: `${displayName} (${variantDisplayName})`,
  };

  if (
    subMeta?.matchBodyColor ||
    (subSelect === selectionGroup && meta.matchBodyColor)
  ) {
    applyMatchBodyColor(variant, !useVariants ? variant : null);
  }
}
