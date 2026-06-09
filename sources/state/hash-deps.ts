import { state } from "./state.ts";
import {
  buildItemsByTypeNameFromRegisteredLite,
  getItemLite,
  getMetadataIndexes,
  isIndexReady,
  isLiteReady,
  customParts,
  type ItemLite,
  type SlimByTypeNameRow,
} from "./catalog.ts";
import { resolveHashParamFromHashMatch } from "./resolve-hash-param.ts";

/**
 * Outcome of resolving a `typeName`/`nameAndVariant` pair against the
 * catalog. `foundItemId` is null when no match was made.
 */
export type HashResolution = {
  foundItemId: string | null;
  matchedVariant: string;
  matchedRecolor: string;
};

export type HashDeps = {
  resolveHashParam: (input: {
    typeName: string;
    nameAndVariant: string;
  }) => HashResolution;
  /** DI shape kept as `(id) => meta | null` so callers don't handle a Result. */
  getItemLite: (itemId: string) => ItemLite | null;
};

function createDefaultHashDeps(): HashDeps {
  return {
    resolveHashParam: ({ typeName, nameAndVariant }) => {
      for (const part of Object.values(customParts)) {
        if (part.type_name !== typeName) continue;
        const customName = part.name.replaceAll(" ", "_");
        if (nameAndVariant === customName) {
          return {
            foundItemId: part.itemId,
            matchedVariant: "",
            matchedRecolor: "",
          };
        }
        if (!nameAndVariant.startsWith(`${customName}_`)) continue;

        const suffix = nameAndVariant.slice(customName.length + 1);
        const [variantOrRecolor = "", recolor = ""] = suffix.split("|");
        const baseMeta = getItemLite(part.baseItemId).unwrapOr(null);
        const suffixIsVariant =
          !!variantOrRecolor && baseMeta?.variants?.includes(variantOrRecolor);
        return {
          foundItemId: part.itemId,
          matchedVariant: recolor || suffixIsVariant ? variantOrRecolor : "",
          matchedRecolor: recolor || (!suffixIsVariant ? variantOrRecolor : ""),
        };
      }

      let itemsByTypeName: Record<string, SlimByTypeNameRow[]>;
      if (isIndexReady()) {
        const idx = getMetadataIndexes().unwrapOr(null);
        itemsByTypeName =
          idx?.hashMatch?.itemsByTypeName ?? idx?.byTypeName ?? {};
      } else if (isLiteReady()) {
        itemsByTypeName = buildItemsByTypeNameFromRegisteredLite();
      } else {
        itemsByTypeName = {};
      }
      return resolveHashParamFromHashMatch({
        typeName,
        nameAndVariant,
        itemsByTypeName,
      });
    },
    getItemLite: (itemId) => getItemLite(itemId).unwrapOr(null),
  };
}

let hashDeps: HashDeps = createDefaultHashDeps();

export function setHashDeps(overrides: Partial<HashDeps>): void {
  Object.assign(hashDeps, overrides);
}

export function resetHashDeps(): void {
  hashDeps = createDefaultHashDeps();
}

export function getHashDeps(): HashDeps {
  return hashDeps;
}

export function getState(): typeof state {
  return state;
}

export function updateState(updates: Partial<typeof state>): void {
  Object.assign(state, updates);
}

export function resetState(): void {
  state.bodyType = "male";
  state.selections = {};
  state.previewTweenMode = "off";
  state.previewTweenInbetweens = 1;
  state.previewTweenFps = 8;
  state.previewTweenMotionStrength = 1;
  state.previewTweenAlphaThreshold = 1;
  state.previewTweenPreset = "original";
  state.previewTweenOverrides = {};
}
