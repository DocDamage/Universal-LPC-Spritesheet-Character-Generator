import "../install-item-metadata.ts";
import { ok, err, type Result } from "neverthrow";
import { ANIMATIONS } from "./constants.ts";
import { getHashParamsforSelections } from "./hash.ts";
import {
  getItemMerged,
  getMetadataIndexes,
  type ItemMerged,
  type LoadError,
  type MetadataIndexes,
  type SlimByTypeNameRow,
} from "./catalog.ts";
import { variantToFilename, es6DynamicTemplate } from "../utils/helpers.ts";
import { debugLog } from "../utils/debug.ts";
import type { Selections } from "./state.ts";
import type { AnimationEntry } from "./filters.ts";

/**
 * `meta` arguments to `getSpritePath` / `replaceInPath` come from a few
 * sources: production callers pass an `ItemMerged`, tests pass partial
 * fixtures, and `replaceInPath` reads a `replace_in_path` field that's not
 * part of the catalog's published `ItemMerged` shape. Modeling as
 * `Partial<ItemMerged>` plus the extra field captures all of that.
 */
type PathMeta = Partial<ItemMerged> & {
  replace_in_path?: Record<string, Record<string, string>>;
};

/** Subset of `SlimByTypeNameRow` consumed by `getNameWithoutVariant`. */
type NameVariantRow = {
  variants?: string[];
  recolors?: { variants?: string[] }[];
};

/**
 * Why `getSpritePath` couldn't produce a path. `LoadError` reflects a real
 * fetch failure; the other two are "not applicable" outcomes that callers
 * routinely encounter as they iterate layers and body types.
 */
export type PathError =
  | LoadError
  | { kind: "missing-layer"; layerNum: number }
  | { kind: "missing-bodytype-path"; bodyType: string };

type PathDeps = {
  getHashParamsforSelections: (
    selections: Selections,
  ) => Record<string, string>;
  variantToFilename: (variant: string) => string;
  es6DynamicTemplate: (
    template: string,
    vars: Record<string, string>,
  ) => string;
  debugLog: (message: string) => void;
  animations: AnimationEntry[];
  /** Result-returning lookups; callers `.unwrapOr(...)` at the use site. */
  getItemMetadata: (itemId: string) => Result<PathMeta, LoadError>;
  getMetadataIndexes: () => Result<MetadataIndexes, LoadError>;
};

const ITEM_ID_NAME_VARIANT_SEPARATOR = "__";
let nameWithoutVariantCache = new WeakMap<
  readonly NameVariantRow[],
  Map<string, string>
>();
let hashParamsCache = new WeakMap<
  Selections,
  { signature: string; value: Record<string, string> }
>();
let replacementPathCache = new WeakMap<PathMeta, Map<string, string>>();

function createDefaultPathDeps(): PathDeps {
  return {
    getHashParamsforSelections,
    variantToFilename,
    es6DynamicTemplate,
    debugLog,
    animations: ANIMATIONS,
    getItemMetadata: getItemMerged,
    getMetadataIndexes,
  };
}

let pathDeps = createDefaultPathDeps();

export function setPathDeps(overrides: Partial<PathDeps>): void {
  Object.assign(pathDeps, overrides);
  clearPathCaches();
}

export function resetPathDeps(): void {
  pathDeps = createDefaultPathDeps();
  clearPathCaches();
}

export function getPathDeps(): PathDeps {
  return pathDeps;
}

export function clearPathCaches(): void {
  nameWithoutVariantCache = new WeakMap<
    readonly NameVariantRow[],
    Map<string, string>
  >();
  hashParamsCache = new WeakMap<
    Selections,
    { signature: string; value: Record<string, string> }
  >();
  replacementPathCache = new WeakMap<PathMeta, Map<string, string>>();
}

/**
 * Extract the base asset name from a `name_variant` string. Both names and
 * variants may contain underscores. Newer/generated callers can pass
 * `name__variant` to avoid ambiguity; legacy `name_variant` values fall back
 * to the catalog-assisted longest-suffix scan.
 */
export function getNameWithoutVariant(
  nameAndVariant: string,
  itemsForType: NameVariantRow[] | SlimByTypeNameRow[],
): string {
  const delimited = splitDelimitedNameAndVariant(nameAndVariant);
  if (delimited) {
    return delimited.name;
  }

  const names = (itemsForType || []) as readonly NameVariantRow[];
  const cached = getCachedNameWithoutVariant(names, nameAndVariant);
  if (cached !== undefined) {
    return cached;
  }

  let variant = "";
  const nameAndVariantPath = nameAndVariant.split("_");
  const l = nameAndVariantPath.length;
  const variants = names
    .flatMap((n) => n.variants || [])
    .map((v) => v.toLowerCase());
  const recolors = names
    .flatMap((n) => n.recolors?.[0]?.variants || [])
    .map((v) => v.toLowerCase());
  let j = l;
  let v = 0;
  while (--j > 0) {
    const part = nameAndVariantPath.slice(j, l).join("_");
    const hasPart = (flatMap: string[], part: string) =>
      flatMap?.includes(part.toLowerCase());
    if (hasPart(variants, part) || hasPart(recolors, part)) {
      variant = part;
      v = j;
    }
  }
  const name = variant
    ? nameAndVariantPath.slice(0, v).join("_")
    : nameAndVariantPath.slice(0, l - 1).join("_");
  cacheNameWithoutVariant(names, nameAndVariant, name);
  return name;
}

/** Build a sprite-path string for a specific item layer + animation + variant. */
export function getSpritePath(
  itemId: string,
  variant: string | null,
  recolors: Record<string, string> | boolean | null,
  bodyType: string,
  animName: string,
  layerNum: number = 1,
  selections: Selections = {},
  meta: PathMeta | null = null,
): Result<string, PathError> {
  if (!meta) {
    const r = pathDeps.getItemMetadata(itemId);
    if (r.isErr()) return err(r.error);
    meta = r.value;
  }

  const layerKey = `layer_${layerNum}`;
  const layer = meta.layers?.[layerKey];
  if (!layer) return err({ kind: "missing-layer", layerNum });

  let basePath = layer[bodyType] as string | undefined;
  if (!basePath) return err({ kind: "missing-bodytype-path", bodyType });

  if (basePath.includes("${")) {
    basePath = replaceInPath(basePath, selections, meta);
  }

  // If no variant specified, try to extract from itemId.
  if (!variant && !recolors) {
    variant = getVariantFromItemId(itemId);
  }

  const animation = pathDeps.animations.find((a) => a.value === animName);
  if (animation?.folderName) {
    animName = animation.folderName;
  }

  // `variant` is guaranteed non-null when `!recolors` here: if both inputs
  // were falsy the block above derived `variant` from the itemId.
  const fileName = !recolors ? `/${pathDeps.variantToFilename(variant!)}` : "";
  return ok(`spritesheets/${basePath}${animName}${fileName}.png`);
}

/** Replace `${typeName}` placeholders in a path using the current selections. */
export function replaceInPath(
  path: string,
  selections: Selections | null | undefined,
  meta: PathMeta,
): string {
  if (path.includes("${")) {
    const hashParams = getHashParamsForSelectionsCached(selections);
    const cacheKey = `${path}|${JSON.stringify(hashParams)}`;
    const cached = getCachedReplacementPath(meta, cacheKey);
    if (cached !== undefined) return cached;

    const replacements = Object.fromEntries(
      Object.entries(hashParams).map(([typeName, nameAndVariant]) => {
        const name = _getNameWithoutVariant(typeName, nameAndVariant);
        // `meta.replace_in_path` may be undefined; preserved JS behavior is to
        // throw when the path has placeholders but the field is missing.
        const replacement = meta.replace_in_path![typeName]?.[name];
        if (path.includes(`\${${typeName}}`) && !replacement) {
          pathDeps.debugLog(
            `Warning: No replacement found for ${typeName}="${name}" in path template.`,
          );
        }
        return [typeName, replacement];
      }),
    );

    const resolved = pathDeps.es6DynamicTemplate(path, replacements);
    cacheReplacementPath(meta, cacheKey, resolved);
    return resolved;
  }

  return path;
}

function splitDelimitedNameAndVariant(
  nameAndVariant: string,
): { name: string; variant: string } | null {
  const separatorIndex = nameAndVariant.lastIndexOf(
    ITEM_ID_NAME_VARIANT_SEPARATOR,
  );
  if (separatorIndex <= 0) return null;
  const variantStart = separatorIndex + ITEM_ID_NAME_VARIANT_SEPARATOR.length;
  if (variantStart >= nameAndVariant.length) return null;
  return {
    name: nameAndVariant.slice(0, separatorIndex),
    variant: nameAndVariant.slice(variantStart),
  };
}

function getVariantFromItemId(itemId: string): string {
  const delimited = splitDelimitedNameAndVariant(itemId);
  if (delimited) return delimited.variant;
  const parts = itemId.split("_");
  return parts[parts.length - 1];
}

function getCachedNameWithoutVariant(
  names: readonly NameVariantRow[],
  nameAndVariant: string,
): string | undefined {
  return nameWithoutVariantCache.get(names)?.get(nameAndVariant);
}

function cacheNameWithoutVariant(
  names: readonly NameVariantRow[],
  nameAndVariant: string,
  name: string,
): void {
  let cache = nameWithoutVariantCache.get(names);
  if (!cache) {
    cache = new Map();
    nameWithoutVariantCache.set(names, cache);
  }
  cache.set(nameAndVariant, name);
}

function getHashParamsForSelectionsCached(
  selections: Selections | null | undefined,
): Record<string, string> {
  if (!selections) {
    return pathDeps.getHashParamsforSelections({});
  }

  const selectionState = selections;
  const signature = JSON.stringify(selectionState);
  const cached = hashParamsCache.get(selectionState);
  if (cached?.signature === signature) return cached.value;

  const value = pathDeps.getHashParamsforSelections(selectionState);
  hashParamsCache.set(selectionState, { signature, value });
  return value;
}

function getCachedReplacementPath(
  meta: PathMeta,
  cacheKey: string,
): string | undefined {
  return replacementPathCache.get(meta)?.get(cacheKey);
}

function cacheReplacementPath(
  meta: PathMeta,
  cacheKey: string,
  resolved: string,
): void {
  let cache = replacementPathCache.get(meta);
  if (!cache) {
    cache = new Map();
    replacementPathCache.set(meta, cache);
  }
  cache.set(cacheKey, resolved);
}

function _getNameWithoutVariant(
  typeName: string,
  nameAndVariant: string,
): string {
  const indexes = pathDeps.getMetadataIndexes().unwrapOr(null);
  const itemsForType = indexes?.byTypeName?.[typeName] ?? [];
  return getNameWithoutVariant(nameAndVariant, itemsForType);
}
