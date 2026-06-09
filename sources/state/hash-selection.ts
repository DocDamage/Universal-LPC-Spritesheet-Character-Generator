import { state } from "./state.ts";
import type { Selection, Selections } from "./state.ts";
import { parseRecolorKey } from "./palettes.ts";
import { debugWarn } from "../utils/debug.ts";
import {
  getAliasMetadata,
  getItemLite,
  getCustomPart,
  type AliasMetadata,
} from "./catalog.ts";
import { getHashDeps } from "./hash-deps.ts";
import {
  getHashParams,
  getHashParamsFromString,
  setHashParams,
} from "./hash-url.ts";

export function buildNewSelection(
  foundItemId: string,
  matchedVariant: string | null,
  matchedRecolor: string,
  subId: number | null = null,
): Selection {
  const custom = getCustomPart(foundItemId);
  // Get meta data for itemId. Existing JS assumes meta is non-null at this
  // point (resolveHashParam returned a hit); preserve that contract.
  const meta =
    getHashDeps().getItemLite(foundItemId) ??
    (custom ? getHashDeps().getItemLite(custom.baseItemId) : null)!;
  const subMeta = meta.recolors?.[subId ?? 0];

  const isCustom = !!custom;
  const newSelection: Selection = {
    itemId: foundItemId,
    subId,
    variant: isCustom
      ? matchedVariant || ""
      : matchedVariant ||
        (matchedRecolor != "" ? "" : meta.variants?.[0] || ""),
    recolor: isCustom
      ? matchedRecolor || ""
      : matchedRecolor ||
        ((meta.variants?.length ?? 0) === 0
          ? subMeta?.variants?.[0] || ""
          : ""),
    name: subId ? (subMeta?.label ?? "") : meta.name,
  };

  if (newSelection.variant || newSelection.recolor) {
    let recolorLabel: string | null | undefined = newSelection.recolor;
    if (recolorLabel) {
      const [, ver, recolor] = parseRecolorKey(
        newSelection.recolor ?? null,
        subMeta,
      );
      recolorLabel = ver !== subMeta?.default ? `${ver} ${recolor}` : recolor;
    }
    newSelection.name +=
      " (" +
      (newSelection.variant ? `${newSelection.variant}` : "") +
      (newSelection.variant && newSelection.recolor ? " | " : "") +
      (newSelection.recolor ? `${recolorLabel}` : "") +
      ")";
  }
  return newSelection;
}

export function getHashParamsforSelections(
  selections: Selections,
): Record<string, string> {
  const params: Record<string, string> = {};

  // Add body type (using 'sex' for backwards compatibility with old URLs).
  params["sex"] = state.bodyType;

  // Add selections — old format: `type_name=Name_variant`.
  // e.g., "body=Body_color_light", "shoes=Sara_sara".
  const aliasMetadata = getAliasMetadata().unwrapOr({} as AliasMetadata);
  for (const [typeName, selection] of Object.entries(selections)) {
    const custom = getCustomPart(selection.itemId);
    if (custom) {
      const namePart = custom.name.replaceAll(" ", "_");
      const variantPart = selection.variant ?? "";
      const recolorPart = selection.recolor ?? "";
      const uscorePart = variantPart || recolorPart ? "_" : "";
      const splitPart = variantPart && recolorPart ? "|" : "";
      params[custom.type_name || typeName] =
        namePart + uscorePart + variantPart + splitPart + recolorPart;
      continue;
    }

    const meta = getItemLite(selection.itemId).unwrapOr(null);
    // Defensive: real production data has type_name, but a few test fixtures
    // (and possibly malformed URLs) might lack it. Treat as alias-fallback.
    if (!meta || !meta.type_name) {
      // Check if an alias is overriding this entry
      // (e.g., "sash=Waistband_rose" instead of "waistband=Waistband_rose").
      const name = selection.name.split(" (")[0]!; // Get base name without variant
      const nameAndVariant =
        name.replaceAll(" ", "_") +
        (selection.variant ? `_${selection.variant}` : "");
      const aliasType = aliasMetadata[typeName];
      if (!aliasType) continue;

      // Check name and variant
      const aliasMeta = aliasType?.[nameAndVariant];
      if (aliasMeta && aliasMeta.typeName) {
        params[aliasMeta.typeName] = `${aliasMeta.name}_${aliasMeta.variant}`;
      } else {
        // No exact match — check for type-name wildcard alias entry (`*`)
        // that applies to any name+variant.
        const anyAliasMeta = aliasType?.[`*`];
        if (!anyAliasMeta || !anyAliasMeta.typeName) {
          continue;
        }
        params[anyAliasMeta.typeName] = nameAndVariant;
      }
    } else {
      // Get sub-color metadata if applicable.
      const subMeta =
        selection.subId !== null && selection.subId !== undefined
          ? meta.recolors?.[selection.subId]
          : undefined;

      // Use `type_name` as key (selection group).
      const key = subMeta?.type_name ?? meta.type_name;

      // Build name part for URL using full name with underscores —
      // "Body color" → "Body_color", "Sara Shoes" → "Sara_Shoes".
      const namePart = (subMeta?.label ?? meta.name).replaceAll(" ", "_");

      const variantPart = selection.variant ?? "";
      const recolorPart = selection.recolor ?? "";
      const uscorePart = variantPart || recolorPart ? "_" : "";
      const splitPart = variantPart && recolorPart ? "|" : "";
      const value =
        namePart + uscorePart + variantPart + splitPart + recolorPart;

      params[key] = value;
    }
  }

  return params;
}

export function syncSelectionsToHash(): void {
  const params = getHashParamsforSelections(state.selections);
  setHashParams(params);
}

/** Profiler hook is a global injected by the test harness; absent in production. */
type Profiler = {
  mark: (name: string) => void;
  measure: (name: string, start: string, end: string) => void;
};
type WindowWithProfiler = Window & { profiler?: Profiler };

export function loadSelectionsFromHash(hashString: string | null = null): void {
  const profiler = (window as WindowWithProfiler).profiler;
  if (profiler) {
    profiler.mark("hash-loadSelectionsFromHash:start");
  }

  const params = hashString
    ? getHashParamsFromString(hashString)
    : getHashParams();

  // Build new selections object without mutating state yet.
  const newSelections: Selections = {};
  const skippedEntries: Record<string, string> = {};

  // Old format: `type_name=Name_variant`
  // (e.g., "body=Body_color_light", "sash=Waistband_rose").
  for (let [typeName, nameAndVariant] of Object.entries(params)) {
    // Handle special parameters
    if (typeName === "bodyType" || typeName === "sex") {
      state.bodyType = nameAndVariant;
      continue;
    }

    // Check name and variant
    const aliasMd = getAliasMetadata().unwrapOr({} as AliasMetadata);
    const aliasType = aliasMd[typeName];
    const aliasMeta = aliasType?.[nameAndVariant];
    if (aliasMeta) {
      typeName = aliasMeta.typeName;
      nameAndVariant = `${aliasMeta.name}_${aliasMeta.variant}`;
    } else {
      // No exact match — check for a type-name wildcard alias.
      const anyAliasMeta = aliasType?.[`*`];
      if (anyAliasMeta) {
        typeName = anyAliasMeta.typeName;
        // Keep the original `nameAndVariant` since the wildcard alias
        // can match any variant.
      }
    }

    // Skip "none" selections
    if (nameAndVariant === "none") continue;

    // Parse the `Name_variant` format by trying different split positions
    // from left to right to find a valid name+variant combination:
    //   "Tiara_tiara_silver"  →  "Tiara" + "tiara_silver"  ✓
    //   "Human_female_light"  →  "Human_female" + "light"  ✓
    //   "Human_female_light|light"  →  "Human_female" + "light" + "light"  ✓
    const { foundItemId, matchedVariant, matchedRecolor } =
      getHashDeps().resolveHashParam({ typeName, nameAndVariant });

    if (!foundItemId) {
      skippedEntries[typeName] = nameAndVariant;
      debugWarn(
        `No item found with type_name "${typeName}" and nameAndVariant "${nameAndVariant}"`,
      );
      continue;
    }

    // Use `type_name` as selection group.
    newSelections[typeName] = buildNewSelection(
      foundItemId,
      matchedVariant,
      matchedRecolor,
    );
  }

  // Check if skipped entries are sub-items.
  if (profiler) {
    profiler.mark("hash-loadSelectionsFromHash:subitems:start");
  }

  const subItemKeySeparator = " ";
  const subItemLookup = new Map<string, { itemId: string; subId: number }>();
  for (const selection of Object.values(newSelections)) {
    const recolors = getHashDeps().getItemLite(selection.itemId)?.recolors;
    if (!Array.isArray(recolors)) continue;

    for (let recolorIndex = 0; recolorIndex < recolors.length; recolorIndex++) {
      const recolor = recolors[recolorIndex];
      if (!recolor?.type_name || !Array.isArray(recolor.variants)) continue;

      for (const recolorVariant of recolor.variants) {
        const lookupKey = `${recolor.type_name}${subItemKeySeparator}${recolorVariant}`;
        if (!subItemLookup.has(lookupKey)) {
          subItemLookup.set(lookupKey, {
            itemId: selection.itemId,
            subId: recolorIndex,
          });
        }
      }
    }
  }

  // Insert selections for skipped entries that might be sub-items.
  for (const [subType, nameAndVariant] of Object.entries(skippedEntries)) {
    const parts = nameAndVariant.split("_");
    for (let i = 1; i <= parts.length; i++) {
      const variants = parts.slice(i).join("_");
      const recolorToMatch = variants.split("|")[1] ?? variants.split("|")[0]!;
      const lookupKey = `${subType}${subItemKeySeparator}${recolorToMatch}`;
      const subItem = subItemLookup.get(lookupKey);

      if (subItem) {
        newSelections[subType] = buildNewSelection(
          subItem.itemId,
          null,
          recolorToMatch,
          subItem.subId,
        );
      }
    }
  }

  if (profiler) {
    profiler.mark("hash-loadSelectionsFromHash:subitems:end");
    profiler.measure(
      "hash-loadSelectionsFromHash:subitems",
      "hash-loadSelectionsFromHash:subitems:start",
      "hash-loadSelectionsFromHash:subitems:end",
    );
  }

  // Now update state once with complete new selections.
  state.selections = newSelections;

  // Load body type
  if (params["bodyType"]) {
    state.bodyType = params["bodyType"];
  }

  // Ensure hash is in sync with loaded selections (handles any normalization).
  syncSelectionsToHash();

  if (profiler) {
    profiler.mark("hash-loadSelectionsFromHash:end");
    profiler.measure(
      "hash-loadSelectionsFromHash",
      "hash-loadSelectionsFromHash:start",
      "hash-loadSelectionsFromHash:end",
    );
  }
}
