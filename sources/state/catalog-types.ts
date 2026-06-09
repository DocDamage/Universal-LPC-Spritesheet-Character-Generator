/**
 * Catalog type definitions — split from the factory for focused imports.
 *
 * Consumers that need only types (not the factory or legacy wrappers) can
 * import directly from this module. The parent `catalog.ts` re-exports
 * everything here so that existing import paths remain valid.
 */

import type { Result } from "neverthrow";

// ────────────────────────────────────────────────────────────────────────────
// Error shape
// ────────────────────────────────────────────────────────────────────────────

export type ChunkName = "index" | "lite" | "credits" | "palette" | "layers";

export type LoadError =
  | { kind: "loading"; chunk: ChunkName }
  | { kind: "not-found"; id: string };

/** Human-readable description of a catalog `LoadError`. Shared formatter for
 *  every getter that returns `Result<T, LoadError>`. Exhaustive over `kind`. */
export function formatLoadError(e: LoadError): string {
  switch (e.kind) {
    case "loading":
      return `chunk "${e.chunk}" not loaded`;
    case "not-found":
      return `item ${e.id} not in catalog`;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Custom part shape
// ────────────────────────────────────────────────────────────────────────────

export type CustomPart = {
  itemId: string;
  name: string;
  type_name: string;
  baseItemId: string;
  sheets: Record<string, HTMLCanvasElement>;
  image?: HTMLCanvasElement | HTMLImageElement;
  drawLayerNum?: number;
  drawZPos?: number;
  tags?: string[];
};

// ────────────────────────────────────────────────────────────────────────────
// Catalog data shapes (audited from real consumer usage)
// ────────────────────────────────────────────────────────────────────────────

/** Shared by `PaletteRecolor.palettes` and `PaletteMaterialMeta.palettes`. */
export type PaletteMap = Record<string, Record<string, string[]>>;

export type PaletteRecolor = {
  material: string;
  palettes: PaletteMap;
  type_name?: string;
  variants?: string[];
  label?: string;
  matchBodyColor?: boolean;
  base?: string;
  source?: string[];
  default?: string;
};

export type ItemLite = {
  name: string;
  type_name: string;
  required: string[];
  animations: string[];
  recolors: PaletteRecolor[];
  matchBodyColor: boolean;
  variants: string[];
  path: string[];
  preview_row?: number;
};

/** Complete item metadata as emitted by the build pipeline (includes layers,
 *  credits, and optional interned indices `v` / `r`). */
export type FullItemMetadata = ItemLite & {
  layers?: Record<string, LayerEntry>;
  credits?: Credit[];
  v?: number;
  r?: number;
};

export type Credit = {
  file: string;
  authors: string[];
  licenses: string[];
  urls: string[];
  notes?: string;
};

/**
 * A single `meta.layers[layer_N]` entry. Heterogeneous: known metadata fields
 * (`zPos`, `custom_animation`) plus body-type-keyed asset paths. Modeled as
 * an open shape because the body-type keys are dynamic.
 */
export type LayerEntry = {
  zPos?: number;
  custom_animation?: string;
  [bodyTypeOrField: string]: string | number | undefined;
};

export type ItemMerged = ItemLite & {
  layers: Record<string, LayerEntry>;
  credits: Credit[];
};

export type AliasEntry = {
  typeName: string;
  name: string;
  variant: string;
};

/** Outer key: source typeName. Inner key: `name_variant`. */
export type AliasMetadata = Record<string, Record<string, AliasEntry>>;

export type CategoryTreeNode = {
  items?: string[];
  children?: Record<string, CategoryTreeNode>;
};

export type CategoryTree = CategoryTreeNode;

/**
 * Slim row shape stored in `MetadataIndexes.byTypeName[typeName]` and
 * `hashMatch.itemsByTypeName[typeName]`. Just enough fields for hash-resolution
 * and path-name lookups; the full record lives in the lite item store.
 */
export type SlimByTypeNameRow = {
  itemId: string;
  name: string;
  type_name: string;
  variants: string[];
  recolors: { variants: string[] }[];
};

export type MetadataIndexes = {
  byTypeName: Record<string, SlimByTypeNameRow[]>;
  hashMatch: { itemsByTypeName?: Record<string, SlimByTypeNameRow[]> };
  variantArrays?: string[][];
  recolorVariantArrays?: string[][];
};

export type PaletteMaterialMeta = {
  palettes: PaletteMap;
  type: "material";
  label: string;
  desc: string;
  default: string;
  base: string;
};

export type PaletteVersionMeta = {
  type: "version";
  label: string;
  desc: string;
};

export type PaletteMetadata = {
  materials: Record<string, PaletteMaterialMeta>;
  versions?: Record<string, PaletteVersionMeta>;
};

// ────────────────────────────────────────────────────────────────────────────
// Catalog interface — split into reader + writer halves
// ────────────────────────────────────────────────────────────────────────────

export type CatalogReady = {
  readonly onIndexReady: Promise<void>;
  readonly onLiteReady: Promise<void>;
  readonly onCreditsReady: Promise<void>;
  readonly onPaletteReady: Promise<void>;
  readonly onLayersReady: Promise<void>;
  readonly onAllReady: Promise<void>;
};

/** Read-only surface — what components and downstream factories should consume. */
export type CatalogReader = {
  chunkReady(chunk: ChunkName): Result<true, LoadError>;
  getItemLite(id: string): Result<ItemLite, LoadError>;
  getItemMerged(id: string): Result<ItemMerged, LoadError>;
  getItemCredits(id: string): Result<Credit[], LoadError>;
  getItemLayers(id: string): Result<Record<string, LayerEntry>, LoadError>;
  getPaletteMetadata(): Result<PaletteMetadata, LoadError>;
  getCategoryTree(): Result<CategoryTree, LoadError>;
  getMetadataIndexes(): Result<MetadataIndexes, LoadError>;
  getAliasMetadata(): Result<AliasMetadata, LoadError>;
  isIndexReady(): boolean;
  isLiteReady(): boolean;
  isCreditsReady(): boolean;
  isPaletteReady(): boolean;
  isLayersReady(): boolean;
  buildItemsByTypeNameFromRegisteredLite(): Record<string, SlimByTypeNameRow[]>;
  readonly ready: CatalogReady;
};

/** Write-only surface — only the boot path (`install-item-metadata.ts`) and
 *  test setup should hold this. */
export type CatalogWriter = {
  registerFromIndexModule(exports_: {
    aliasMetadata: AliasMetadata;
    categoryTree: CategoryTree;
    metadataIndexes: MetadataIndexes;
  }): void;
  registerFromPaletteModule(exports_: {
    paletteMetadata: PaletteMetadata;
  }): void;
  registerFromItemModule(exports_: {
    itemMetadata: Record<string, ItemLite>;
  }): void;
  registerFromCreditsModule(exports_: {
    itemCredits: Record<string, Credit[]>;
  }): void;
  registerFromLayersModule(exports_: {
    itemLayers: Record<string, Record<string, LayerEntry>>;
  }): void;
  loadCatalogFromFixtures(fixtureGlobals: {
    itemMetadata: Record<string, FullItemMetadata>;
    aliasMetadata: AliasMetadata;
    categoryTree: CategoryTree;
    metadataIndexes: MetadataIndexes;
    paletteMetadata: PaletteMetadata;
  }): void;
  resetForTests(): void;
};

export type Catalog = CatalogReader & CatalogWriter;
